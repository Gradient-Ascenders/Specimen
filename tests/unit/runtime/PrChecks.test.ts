import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChanges } from '../../../scripts/build/classify-pr-changes.mjs';

test('PR checks skip documentation while credits and unfamiliar paths retain all relevant gates', () => {
  assert.deepEqual(classifyChanges(['docs/development.md', 'assets/characters/bob/README.md', '.editorconfig']),
    { checks: false, browser: false, generated: false });
  assert.equal(classifyChanges(['CREDITS.md']).browser, true);
  assert.deepEqual(classifyChanges(['new-runtime-config.json']), { checks: true, browser: true, generated: false });
  assert.deepEqual(classifyChanges(['src/main.ts']), { checks: true, browser: true, generated: true });
  assert.deepEqual(classifyChanges(['package-lock.json']), { checks: true, browser: true, generated: true });
});

test('PR checks keep tooling and source-asset checks quick without skipping shared browser dependencies', () => {
  for (const path of ['tests/unit/runtime/Input.test.ts', 'scripts/diagnostics/profile-performance.mjs', 'tsconfig.tooling.json']) {
    assert.deepEqual(classifyChanges([path]), { checks: true, browser: false, generated: false });
  }
  assert.deepEqual(classifyChanges(['assets/characters/bob/generate-bob.py']), { checks: true, browser: false, generated: true });
  for (const path of ['assets/characters/bob/bob-authored.glb', 'assets/characters/volt/volt.validation.json', 'tests/helpers/OpeningHandoff.ts', 'tests/fixtures/menu.html', 'tests/browser/ui/MenuSettings.spec.ts', '.github/actions/setup/action.yml']) {
    assert.equal(classifyChanges([path]).browser, true, path);
  }
  assert.equal(classifyChanges(['docs/development.md', 'src/main.ts']).browser, true);
});
