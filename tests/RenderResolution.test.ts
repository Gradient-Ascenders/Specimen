import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRenderPixelRatio, resolveRenderResolution } from '../src/render/RenderResolution.ts';
import { GRAPHICS_PROFILES } from '../src/render/GraphicsProfiles.ts';
import { RenderLayer } from '../src/render/RenderLayer.ts';

test('render tiers cap high-DPI pixel workload at their configured density', () => {
  assert.equal(resolveRenderPixelRatio(3, 2), 2);
  assert.equal(resolveRenderPixelRatio(3, 1.5), 1.5);
  assert.equal(resolveRenderPixelRatio(3, 1), 1);
  assert.equal(resolveRenderPixelRatio(3, 0.75), 0.75);
});

test('minimum rendering goes below CSS resolution and bounds large high-DPI windows', () => {
  const options = { ...GRAPHICS_PROFILES.minimum.settings, pixelRatioCap: 1 as const,
    pixelBudget: GRAPHICS_PROFILES.minimum.pixelBudget };
  const small = resolveRenderResolution(640, 360, 2, options);
  assert.deepEqual([small.drawingBufferWidth, small.drawingBufferHeight], [480, 270]);
  assert.equal(small.effectivePixelRatio, 0.75);
  const large = resolveRenderResolution(3840, 2160, 3, options);
  assert.ok(large.drawingBufferWidth * large.drawingBufferHeight <= 1280 * 720);
  assert.ok(large.effectivePixelRatio < 0.75);
  assert.equal(large.devicePixelRatio, 3);
  assert.deepEqual([large.viewportWidth, large.viewportHeight], [3840, 2160]);
});

test('every profile and custom density/scale obeys the budget across aspect ratios and resizes', () => {
  for (const profile of Object.values(GRAPHICS_PROFILES)) for (const [width, height] of [
    [1, 1], [320, 960], [960, 320], [1536, 730], [1920, 1080], [3840, 2160],
    [7680, 4320], [100000, 1], [1, 100000], [0, 0], [Number.NaN, Number.POSITIVE_INFINITY],
  ]) for (const dpr of [0.8, 1, 1.25, 2, 3, Number.NaN]) for (const scale of [0.5, 0.75, 1] as const) {
    const size = resolveRenderResolution(width, height, dpr, {
      renderScale: scale, pixelRatioCap: 2, pixelBudget: profile.pixelBudget, maximumWidth: 4096, maximumHeight: 2048,
    });
    assert.ok(size.drawingBufferWidth >= 1 && size.drawingBufferHeight >= 1);
    assert.ok(size.drawingBufferWidth <= 4096 && size.drawingBufferHeight <= 2048);
    assert.ok(size.drawingBufferWidth * size.drawingBufferHeight <= profile.pixelBudget);
    assert.ok(size.effectivePixelRatio > 0 && size.effectivePixelRatio <= 2 * scale);
    assert.equal(Math.floor(size.logicalWidth * size.effectivePixelRatio), size.drawingBufferWidth);
    assert.equal(Math.floor(size.logicalHeight * size.effectivePixelRatio), size.drawingBufferHeight);
  }
});

test('pathological narrow windows and tiny budgets never allocate zero or exceed the cap', () => {
  for (const pixelBudget of [1, 2, 10]) for (const [width, height] of [[100000, 1], [1, 100000], [1920, 1080]]) {
    const size = resolveRenderResolution(width, height, 3, { pixelRatioCap: 2, renderScale: 1, pixelBudget });
    assert.ok(size.drawingBufferWidth * size.drawingBufferHeight <= pixelBudget);
    assert.ok(size.drawingBufferWidth >= 1 && size.drawingBufferHeight >= 1);
  }
});

test('fractional refraction keeps a physical texel in one-CSS-pixel viewports', () => {
  for (const transmissionScale of [1, 0.5, 0.25]) {
    const minimumDrawingBufferDimension = Math.ceil(1 / transmissionScale);
    for (const [width, height] of [[1, 1], [1, 900], [900, 1], [1, 100000], [100000, 1]]) {
      for (const renderScale of [0.5, 0.75, 1] as const) {
        const size = resolveRenderResolution(width, height, 1, {
          pixelRatioCap: 0.75, renderScale, pixelBudget: GRAPHICS_PROFILES.standard.pixelBudget,
          maximumWidth: 4096, maximumHeight: 2048, minimumDrawingBufferDimension,
        });
        assert.ok(Math.floor(size.drawingBufferWidth * transmissionScale) >= 1);
        assert.ok(Math.floor(size.drawingBufferHeight * transmissionScale) >= 1);
        assert.ok(size.drawingBufferWidth * size.drawingBufferHeight <= GRAPHICS_PROFILES.standard.pixelBudget);
        assert.ok(size.drawingBufferWidth <= 4096 && size.drawingBufferHeight <= 2048);
        assert.equal(Math.floor(size.logicalWidth * size.effectivePixelRatio), size.drawingBufferWidth);
        assert.equal(Math.floor(size.logicalHeight * size.effectivePixelRatio), size.drawingBufferHeight);
        assert.deepEqual([size.viewportWidth, size.viewportHeight], [width, height]);
      }
    }
  }
});

test('capture-aware longest-edge bounds reserve the minimum short side within even a tiny budget', () => {
  for (const minimumDrawingBufferDimension of [2, 4]) {
    for (const pixelBudget of [minimumDrawingBufferDimension ** 2, minimumDrawingBufferDimension ** 2 + 1, 100]) {
      for (const [width, height] of [[1, 100000], [100000, 1], [1920, 1080]]) {
        const size = resolveRenderResolution(width, height, 3, {
          pixelRatioCap: 2, renderScale: 1, pixelBudget, minimumDrawingBufferDimension,
        });
        assert.ok(size.drawingBufferWidth >= minimumDrawingBufferDimension);
        assert.ok(size.drawingBufferHeight >= minimumDrawingBufferDimension);
        assert.ok(size.drawingBufferWidth * size.drawingBufferHeight <= pixelBudget);
      }
    }
  }
});

test('an impossible capture floor is rejected without silently exceeding a hard limit', () => {
  const options = { pixelRatioCap: 1 as const, renderScale: 1 as const, pixelBudget: 4,
    minimumDrawingBufferDimension: 2 };
  for (const limits of [{ pixelBudget: 3 }, { maximumWidth: 1 }, { maximumHeight: 1 }]) {
    assert.throws(() => resolveRenderResolution(1, 900, 1, { ...options, ...limits }), RangeError);
  }
});

test('render tiers respect device density within the supported DPR range', () => {
  assert.equal(resolveRenderPixelRatio(1.25, 2), 1.25);
  assert.equal(resolveRenderPixelRatio(1.25, 1.5), 1.25);
  assert.equal(resolveRenderPixelRatio(1.25, 1), 1);
  assert.equal(resolveRenderPixelRatio(1.25, 0.75), 0.75);
  assert.equal(resolveRenderPixelRatio(0.8, 2), 1);
  assert.equal(resolveRenderPixelRatio(Number.NaN, 2), 1);
});

test('temporary title budgets preserve current profile settings and transmission-safe allocation', () => {
  const titleBudget = 1280 * 720;
  for (const profile of Object.values(GRAPHICS_PROFILES)) {
    const layer = Object.create(RenderLayer.prototype) as RenderLayer;
    let resizes = 0;
    // Exercise the real budget policy without constructing a WebGL context.
    Object.assign(layer, { graphicsSettings: { ...profile.settings },
      effectivePixelRatioCap: profile.settings.renderPixelRatioCap, resize: () => resizes++ });
    const settings = { ...profile.settings };
    for (const [width, height] of [[320, 900], [916, 960], [960, 540], [3840, 2160], [1, 1000000], [1000000, 1]]) {
      for (const transmissionScale of [1, 0.5, 0.25]) {
        const minimumDrawingBufferDimension = Math.ceil(1 / transmissionScale);
        const options = { pixelRatioCap: settings.renderPixelRatioCap, renderScale: settings.renderScale,
          maximumWidth: 4096, maximumHeight: 2048, minimumDrawingBufferDimension };
        const before = resolveRenderResolution(width, height, 3, { ...options, pixelBudget: layer.pixelBudget });
        layer.setPresentationResolution(titleBudget);
        assert.equal(layer.pixelBudget, Math.min(titleBudget, profile.pixelBudget));
        const title = resolveRenderResolution(width, height, 3, { ...options, pixelBudget: layer.pixelBudget,
          pixelRatioCap: layer.activePixelRatioCap, renderScale: layer.activeRenderScale });
        assert.equal(layer.activeRenderScale, 1);
        if (width * height <= titleBudget && width >= minimumDrawingBufferDimension && height >= minimumDrawingBufferDimension) {
          assert.deepEqual([title.drawingBufferWidth, title.drawingBufferHeight], [width, height],
            'Menus/trailers must not inherit the default 0.75 gameplay upscale when native CSS pixels fit.');
        }
        assert.ok(title.drawingBufferWidth * title.drawingBufferHeight <= titleBudget);
        assert.ok(title.drawingBufferWidth <= 4096 && title.drawingBufferHeight <= 2048);
        assert.ok(Math.floor(title.drawingBufferWidth * transmissionScale) >= 1);
        assert.ok(Math.floor(title.drawingBufferHeight * transmissionScale) >= 1);
        layer.setPresentationResolution(undefined);
        assert.equal(layer.pixelBudget, profile.pixelBudget);
        assert.equal(layer.activeRenderScale, settings.renderScale);
        assert.equal(layer.activePixelRatioCap, settings.renderPixelRatioCap);
        assert.deepEqual(resolveRenderResolution(width, height, 3, { ...options, pixelBudget: layer.pixelBudget }), before);
      }
    }
    layer.setPresentationResolution(titleBudget);
    // A profile selected while the title is visible is the one restored on Start.
    Object.assign(layer, { graphicsSettings: { ...GRAPHICS_PROFILES.standard.settings } });
    assert.equal(layer.pixelBudget, titleBudget);
    layer.setPresentationResolution(undefined);
    assert.equal(layer.pixelBudget, GRAPHICS_PROFILES.standard.pixelBudget);
    for (const invalid of [0, -1, NaN, Infinity]) {
      assert.throws(() => layer.setPresentationResolution(invalid), RangeError);
    }
    assert.ok(resizes > 0);
  }
});
