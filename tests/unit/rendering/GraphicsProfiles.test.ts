import assert from 'node:assert/strict';
import test from 'node:test';
import { GRAPHICS_PROFILES, graphicsPreparationKey, graphicsProfileName, readGraphicsSettings } from '../../../src/render/GraphicsProfiles.ts';
import { resolveRenderResolution } from '../../../src/render/RenderResolution.ts';
import { GelRendering } from '../../../src/render/slime/GelRendering.ts';
import { calibrateGraphicsProfiles } from '../../../src/render/GraphicsCalibration.ts';

test('High and Ultra bound a 4K viewport to 1080p and 1440p while preserving aspect ratio', () => {
  for (const [id, width, height] of [['high', 1920, 1080], ['ultra', 2560, 1440]] as const) {
    const settings = GRAPHICS_PROFILES[id].settings;
    const resolution = resolveRenderResolution(3840, 2160, 2, {
      ...settings, pixelRatioCap: settings.renderPixelRatioCap,
    });
    assert.equal(resolution.drawingBufferWidth, width);
    assert.equal(resolution.drawingBufferHeight, height);
    assert.deepEqual(readGraphicsSettings(settings), settings);
    assert.equal(graphicsProfileName(settings), id);
  }
});

test('High improves level-budgeted refraction while Ultra retains full capture', () => {
  const renderer = { transmissionResolutionScale: 1 }, gel = new GelRendering(renderer);
  const release = gel.requestReducedTransmissionCap(0.25);
  for (const [id, scale] of [['standard', 0.25], ['high', 0.75], ['ultra', 1]] as const) {
    gel.setMode(GRAPHICS_PROFILES[id].settings.gelRenderingMode);
    assert.equal(renderer.transmissionResolutionScale, scale);
  }
  gel.setTransmissionResolutionScaleCap(0.5);
  gel.setMode('balanced-transmission');
  assert.equal(renderer.transmissionResolutionScale, 0.5);
  release();
  gel.setTransmissionResolutionScaleCap(1);
  assert.equal(renderer.transmissionResolutionScale, 0.75);
});

test('filter-only changes trigger preparation even when shadow map resolution stays the same', () => {
  const high = GRAPHICS_PROFILES.high.settings;
  assert.notEqual(graphicsPreparationKey(high), graphicsPreparationKey({ ...high, shadowFiltering: 'soft' }));
  assert.equal(graphicsProfileName({ ...high, shadowFiltering: 'soft' }), 'custom');
});

test('auto-detect verifies Ultra at its own workload', async () => {
  const measured: string[] = [];
  const result = await calibrateGraphicsProfiles({ isCurrent: () => true,
    measure: async profile => {
      measured.push(profile);
      return { status: 'complete', sampleCount: 8, frameMs: 1, cpuMs: 1, gpuMs: 1, method: 'gpu-timer' };
    },
  });
  assert.equal(result.profile, 'ultra');
  assert.deepEqual(measured, ['high', 'ultra']);
});
