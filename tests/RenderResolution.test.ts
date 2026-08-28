import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRenderPixelRatio } from '../src/render/RenderResolution.ts';

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
