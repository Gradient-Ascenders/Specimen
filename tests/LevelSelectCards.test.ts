import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import test from 'node:test';
import { createLevelSelectCards } from '../src/ui/LevelSelectCards.ts';

test('level previews stay deferred and use small deployment-relative local images', async () => {
  const markup = createLevelSelectCards();
  assert.doesNotMatch(markup, /<img\b[^>]*\ssrc=/);
  const paths = [...markup.matchAll(/data-level-preview="([^"]+)"/g)].map(match => match[1]);
  assert.equal(paths.length, 3);
  for (const path of paths) {
    assert.ok(path.startsWith('./assets/ui/level-previews/'));
    const asset = await stat(new URL(`../public/${path.slice(2)}`, import.meta.url));
    assert.ok(asset.size < 40_000, `${path} should remain a small menu thumbnail`);
  }
});
