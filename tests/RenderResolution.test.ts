import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBudgetedPixelRatio, resolveRenderPixelRatio } from '../src/render/RenderResolution.ts';

test('render tiers cap high-DPI pixel workload at their configured density', () => {
  assert.equal(resolveRenderPixelRatio(3, 2), 2);
  assert.equal(resolveRenderPixelRatio(3, 1.5), 1.5);
  assert.equal(resolveRenderPixelRatio(3, 1), 1);
});

test('render tiers respect device density within the supported DPR range', () => {
  assert.equal(resolveRenderPixelRatio(1.25, 2), 1.25);
  assert.equal(resolveRenderPixelRatio(1.25, 1.5), 1.25);
  assert.equal(resolveRenderPixelRatio(1.25, 1), 1);
  assert.equal(resolveRenderPixelRatio(0.8, 2), 1);
  assert.equal(resolveRenderPixelRatio(Number.NaN, 2), 1);
});

test('title-only budgets bound high-DPI and extreme windows and clearing them restores the requested density', () => {
  const budget = 1280 * 720;
  for (const [width, height] of [[320, 900], [960, 540], [1920, 1080], [3840, 2160], [1, 1000000], [1000000, 1]]) {
    for (const cap of [1, 1.5, 2] as const) {
      const requested = resolveRenderPixelRatio(3, cap);
      const actual = resolveBudgetedPixelRatio(width, height, requested, budget);
      const logicalMinimum = (1 + Number.EPSILON * 2) / actual;
      const bufferWidth = Math.floor(Math.max(width, logicalMinimum) * actual);
      const bufferHeight = Math.floor(Math.max(height, logicalMinimum) * actual);
      assert.ok(bufferWidth >= 1 && bufferHeight >= 1);
      assert.ok(bufferWidth * bufferHeight <= budget);
      assert.ok(actual <= requested);
      assert.equal(resolveBudgetedPixelRatio(width, height, requested, undefined), requested);
    }
  }
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(
    () => resolveBudgetedPixelRatio(1920, 1080, 2, invalid), RangeError);
});
