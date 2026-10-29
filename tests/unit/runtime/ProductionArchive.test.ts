import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { windowsZip } from '../../../scripts/lib/windows-zip.mjs';

test('successive submission archives preserve changed launch-page timestamps for HTTP cache validation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'specimen-archive-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts/lib'), { recursive: true });
  await mkdir(join(root, 'scripts/build'), { recursive: true });
  await mkdir(join(root, 'dist/assets'), { recursive: true });
  for (const file of ['build/create-production-archive.mjs', 'lib/production-build.mjs', 'lib/windows-zip.mjs']) {
    await copyFile(new URL('../../../scripts/' + file, import.meta.url), join(root, 'scripts', file));
  }

  const releases: { html: Buffer; modified: number }[] = [];
  for (const [index, name] of ['first', 'later'].entries()) {
    const builtAt = new Date(Date.UTC(2026, 9, 28 + index, 12));
    const files = {
      'index.html': `<script type="module" src="./assets/${name}.js"></script><link rel="stylesheet" href="./assets/style.css">`,
      'assets/style.css': 'body { margin: 0; }',
      [`assets/${name}.js`]: `console.log('${name}');`,
      'build-manifest.json': JSON.stringify({ builtAt: builtAt.toISOString() }),
    };
    for (const [file, body] of Object.entries(files)) {
      const path = join(root, 'dist', file);
      await writeFile(path, body);
      await utimes(path, builtAt, builtAt);
    }
    execFileSync(process.execPath, [join(root, 'scripts/build/create-production-archive.mjs')], {
      env: { ...process.env, TZ: 'UTC' },
    });
    const archive = join(root, 'artifacts/specimen-production.zip');
    const extracted = join(root, `release-${index}`);
    if (process.platform === 'win32') windowsZip('extract', archive, extracted);
    else execFileSync('unzip', ['-q', archive, '-d', extracted], { env: { ...process.env, TZ: 'UTC' } });
    for (const file of Object.keys(files)) {
      const archived = await stat(join(extracted, file));
      assert.ok(Math.abs(archived.mtimeMs - builtAt.getTime()) < 2000,
        `${file} must keep its build timestamp when extracted onto the static host`);
    }
    releases.push({ html: await readFile(join(extracted, 'index.html')),
      modified: (await stat(join(extracted, 'index.html'))).mtimeMs });
    await rm(join(root, 'dist/assets', `${name}.js`));
  }

  assert.equal(releases[0]!.html.length, releases[1]!.html.length);
  assert.notDeepEqual(releases[0]!.html, releases[1]!.html);
  assert.ok(releases[1]!.modified > releases[0]!.modified,
    'a cached old index.html must not receive 304 for a same-sized replacement');
});
