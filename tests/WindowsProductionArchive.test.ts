import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { windowsZip } from '../scripts/lib/windows-zip.mjs';

test('Windows production ZIP preserves nested assets and exact file bytes', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'specimen-zip-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'site'), archive = join(root, 'release.zip'), output = join(root, 'extracted');
  await mkdir(join(source, 'assets'), { recursive: true });
  const contents = { 'index.html': '<script src="./assets/game.js"></script>', 'assets/game.js': 'hello', 'assets/model.glb': Buffer.from([0, 255, 1, 42]) };
  for (const [path, data] of Object.entries(contents)) await writeFile(join(source, path), data);
  windowsZip('create', archive, source);
  assert.deepEqual(windowsZip('list', archive).trim().split(/\r?\n/).sort(), Object.keys(contents).sort());
  windowsZip('extract', archive, output);
  for (const path of Object.keys(contents)) assert.deepEqual(await readFile(join(output, path)), await readFile(join(source, path)));
});
