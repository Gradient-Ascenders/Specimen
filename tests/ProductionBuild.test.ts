import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { validateProductionBuild } from '../scripts/lib/production-build.mjs';

const makeBuild = async (t: TestContext): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'specimen-build-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'),
    '<link href="./assets/game.css?v=1"><script src="./assets/game.js"></script>');
  await writeFile(join(root, 'assets/game.js'), 'console.log("game");');
  await writeFile(join(root, 'assets/game.css'), '@font-face{src:url("./font.woff2")}');
  await writeFile(join(root, 'assets/font.woff2'), 'font-fixture');
  return root;
};

test('production validation accepts relative HTML and CSS with URL suffixes', async (t) => {
  const root = await makeBuild(t);
  assert.equal((await validateProductionBuild(root)).length, 4);
});

test('production validation rejects root-relative and escaping asset URLs', async (t) => {
  const root = await makeBuild(t);
  for (const reference of ['/assets/game.js', '../assets/game.js', 'https://other.invalid/game.js']) {
    await writeFile(join(root, 'index.html'),
      `<link href="./assets/game.css"><script src="${reference}"></script>`);
    await assert.rejects(validateProductionBuild(root), /root-relative|outside the build/);
  }
});

test('production validation detects missing files and Linux filename case mismatches', async (t) => {
  const root = await makeBuild(t);
  await writeFile(join(root, 'assets/game.css'), '@font-face{src:url("./Font.woff2")}');
  await assert.rejects(validateProductionBuild(root), /missing file: .\/Font.woff2/);
  await writeFile(join(root, 'assets/game.css'), 'body{}');
  await rm(join(root, 'assets/game.js'));
  await assert.rejects(validateProductionBuild(root), /missing file: .\/assets\/game.js/);
});

test('production validation rejects enclosing directories, source files, and secrets', async (t) => {
  const root = await makeBuild(t);
  for (const directory of ['dist', 'src', 'tests', 'docs', 'node_modules']) {
    await mkdir(join(root, directory));
    await writeFile(join(root, directory, 'unexpected.txt'), 'not deployed');
    await assert.rejects(validateProductionBuild(root), /Development-only path/);
    await rm(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, '.env'), 'placeholder');
  await assert.rejects(validateProductionBuild(root), /Development-only path/);
});

test('production validation requires index at the root and rejects symlinks', async (t) => {
  const root = await makeBuild(t);
  await symlink('game.js', join(root, 'assets/link.js'));
  await assert.rejects(validateProductionBuild(root), /Unsupported build entry/);
  await rm(join(root, 'assets/link.js'));
  await rm(join(root, 'index.html'));
  await assert.rejects(validateProductionBuild(root), /index.html is required/);
});
