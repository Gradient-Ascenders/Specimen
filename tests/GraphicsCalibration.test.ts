import assert from 'node:assert/strict';
import test from 'node:test';
import { calibrateGraphics, chooseAutomaticGraphicsProfile, GRAPHICS_CALIBRATION_BUDGET_MS } from '../src/render/GraphicsCalibration.ts';
import { GameSettings, GRAPHICS_PREFERENCES_KEY } from '../src/ui/GameSettings.ts';
import { GRAPHICS_PROFILES } from '../src/render/GraphicsProfiles.ts';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test('automatic quality reserves headroom and refuses incomplete/unstable measurements', () => {
  assert.equal(chooseAutomaticGraphicsProfile([2, 2, 2, 2, 2, 2]), 'high');
  assert.equal(chooseAutomaticGraphicsProfile([8, 8, 8, 8, 8, 8]), 'standard');
  assert.equal(chooseAutomaticGraphicsProfile([8, 8, 8, 20, 20, 20]), 'minimum');
  assert.equal(chooseAutomaticGraphicsProfile([1, 2]), 'minimum');
  assert.equal(chooseAutomaticGraphicsProfile([1, 1, NaN, 1]), 'minimum');
});

test('cold compilation is excluded, GPU fences are asynchronous and all resources are released', async () => {
  let time = 0, draws = 0, deletes = 0;
  let readyAt = 0;
  const context = { SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, WAIT_FAILED: 4,
    fenceSync: () => ({}), flush() {}, deleteSync() { deletes++; }, isContextLost: () => false,
    clientWaitSync: () => time >= readyAt ? 2 : 0 } as unknown as WebGL2RenderingContext;
  const view = { warm: async () => { time += 2000; }, draw: () => { draws++; time += 2; readyAt = time + 6; } };
  const result = await calibrateGraphics({ context, views: [view, view], now: () => time,
    yieldTask: async () => { time += 2; }, isCurrent: () => true });
  assert.equal(result.profile, 'standard'); assert.equal(result.frameMs, 8);
  assert.equal(result.sampleCount, 20); assert.equal(draws, 20); assert.equal(deletes, 22);
});

test('a stalled GPU hits its time budget and falls back without blocking subsequent launches', async () => {
  let time = 0, deletes = 0;
  const context = { SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, WAIT_FAILED: 4,
    fenceSync: () => ({}), flush() {}, deleteSync() { deletes++; }, isContextLost: () => false,
    clientWaitSync: () => 0 } as unknown as WebGL2RenderingContext;
  const result = await calibrateGraphics({ context, views: [{ warm: async () => {}, draw() {} }], now: () => time,
    yieldTask: async () => { time += 10; }, isCurrent: () => true });
  assert.equal(result.timedOut, true); assert.equal(result.profile, 'minimum');
  assert.equal(time, GRAPHICS_CALIBRATION_BUDGET_MS); assert.equal(deletes, 1);
  const preferences = storage(), settings = new GameSettings({ storage: preferences });
  settings.applyAutomaticGraphicsProfile(result.profile, settings.graphicsRevision);
  assert.equal(new GameSettings({ storage: preferences }).needsGraphicsCalibration, false);
});

test('a cached automatic choice skips calibration and a manual override wins every race', () => {
  const preferences = storage(), settings = new GameSettings({ storage: preferences });
  assert.equal(settings.needsGraphicsCalibration, true);
  const revision = settings.graphicsRevision;
  assert.equal(settings.applyAutomaticGraphicsProfile('standard', revision), true);
  const next = new GameSettings({ storage: preferences });
  assert.equal(next.needsGraphicsCalibration, false); assert.equal(next.value.graphicsProfile, 'standard');
  next.requestGraphicsCalibration(); const pendingRevision = next.graphicsRevision;
  next.setGraphicsProfile('minimum');
  assert.equal(next.applyAutomaticGraphicsProfile('high', pendingRevision), false);
  assert.equal(next.needsGraphicsCalibration, false);
  assert.equal(new GameSettings({ storage: preferences }).value.graphicsProfile, 'minimum');
  next.setRenderScale(0.5);
  const custom = new GameSettings({ storage: preferences });
  assert.equal(custom.value.customGraphicsProfile, true); assert.equal(custom.value.renderScale, 0.5);
  custom.resetToDefaults(); assert.equal(custom.needsGraphicsCalibration, true);
  assert.equal(preferences.getItem(GRAPHICS_PREFERENCES_KEY), null);
});

test('corrupt cached choices are ignored without importing unrelated stored settings', () => {
  const preferences = storage();
  preferences.setItem(GRAPHICS_PREFERENCES_KEY, JSON.stringify({ mode: 'automatic', settings: { graphicsProfile: 'high' } }));
  assert.equal(new GameSettings({ storage: preferences }).needsGraphicsCalibration, true);
  preferences.setItem(GRAPHICS_PREFERENCES_KEY, JSON.stringify({ mode: 'manual', settings: { ...GRAPHICS_PROFILES.high.settings, masterVolume: 0 } }));
  const settings = new GameSettings({ storage: preferences });
  assert.equal(settings.value.graphicsProfile, 'high'); assert.equal(settings.value.masterVolume, 1);
});
