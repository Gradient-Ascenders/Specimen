import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSettings, GRAPHICS_PREFERENCES_KEY, GRAPHICS_CALIBRATION_VERSION } from '../../../src/ui/GameSettings.ts';
import { GRAPHICS_PROFILES } from '../../../src/render/GraphicsProfiles.ts';

function storage() {
  const data = new Map<string,string>();
  return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
}

test('fresh settings and reset use Medium without scheduling a benchmark', () => {
  const saved = storage(), settings = new GameSettings({storage:saved});
  assert.equal(settings.value.graphicsProfile, 'standard');
  assert.equal(settings.needsGraphicsCalibration, false);
  settings.setGraphicsProfile('high');settings.requestGraphicsCalibration();
  const revision = settings.graphicsRevision;
  settings.resetToDefaults();
  assert.equal(settings.value.graphicsProfile, 'standard');
  assert.equal(settings.needsGraphicsCalibration, false);
  assert.equal(settings.applyAutomaticGraphicsProfile('minimum', revision), false);
  assert.equal(new GameSettings({storage:saved}).value.graphicsProfile, 'standard');
});

test('old automatic Low recommendations expire while manual Low remains respected', () => {
  for (const mode of ['automatic','manual']) {
    const saved = storage();saved.setItem(GRAPHICS_PREFERENCES_KEY, JSON.stringify({mode,settings:GRAPHICS_PROFILES.minimum.settings}));
    const settings = new GameSettings({storage:saved});
    assert.equal(settings.value.graphicsProfile, mode==='manual'?'minimum':'standard');
    assert.equal(settings.needsGraphicsCalibration, false);
  }
});

test('failed or interrupted checks preserve the previous settings on disk and in memory', () => {
  const saved = storage(), settings = new GameSettings({storage:saved});
  settings.setGraphicsProfile('high');
  const before = saved.getItem(GRAPHICS_PREFERENCES_KEY);
  settings.requestGraphicsCalibration();settings.finishGraphicsCalibration(settings.graphicsRevision);
  assert.equal(settings.value.graphicsProfile, 'high');
  assert.equal(saved.getItem(GRAPHICS_PREFERENCES_KEY), before);
  assert.equal(settings.needsGraphicsCalibration, false);
});

test('completed detection persists its version and is restored without another benchmark', () => {
  const saved = storage(), settings = new GameSettings({storage:saved});
  settings.requestGraphicsCalibration();
  assert.equal(settings.applyAutomaticGraphicsProfile('standard',settings.graphicsRevision),true);
  assert.equal(JSON.parse(saved.getItem(GRAPHICS_PREFERENCES_KEY)!).calibrationVersion,GRAPHICS_CALIBRATION_VERSION);
  const restored = new GameSettings({storage:saved});
  assert.equal(restored.value.graphicsProfile,'standard');assert.equal(restored.needsGraphicsCalibration,false);
});

test('manual choices win over late detection and one request cannot finish a newer one', () => {
  const settings = new GameSettings({storage:null});
  settings.requestGraphicsCalibration();const old = settings.graphicsRevision;
  settings.requestGraphicsCalibration();settings.finishGraphicsCalibration(old);
  assert.equal(settings.needsGraphicsCalibration,true);
  assert.equal(settings.applyAutomaticGraphicsProfile('minimum',old),false);
  const latest = settings.graphicsRevision;settings.setGraphicsProfile('high');
  assert.equal(settings.applyAutomaticGraphicsProfile('minimum',latest),false);
  assert.equal(settings.value.graphicsProfile,'high');
});

test('legacy High migrates to Ultra while retaining custom controls and shadow appearance', () => {
  for (const custom of [false, true]) {
    const { shadowFiltering: _, ...legacy } = GRAPHICS_PROFILES.ultra.settings;
    const saved = storage();
    saved.setItem(GRAPHICS_PREFERENCES_KEY, JSON.stringify({ mode: 'manual', settings: {
      ...legacy, graphicsProfile: 'high', customGraphicsProfile: custom,
      ...(custom ? { pixelBudget: 921600, shadowMapSizeCap: 1024 } : {}),
    } }));
    const settings = new GameSettings({ storage: saved });
    assert.equal(settings.value.graphicsProfile, 'ultra');
    assert.equal(settings.value.customGraphicsProfile, custom);
    assert.equal(settings.value.shadowFiltering, custom ? 'standard' : 'soft');
    assert.equal(settings.value.pixelBudget, custom ? 921600 : 3686400);
    assert.equal(settings.value.gelRenderingMode, 'physical');
    settings.setGraphicsProfile('high');
    const restored = new GameSettings({ storage: saved });
    assert.equal(restored.value.graphicsProfile, 'high');
    assert.equal(restored.value.pixelBudget, 2073600);
    assert.equal(restored.value.shadowFiltering, 'standard');
  }
});
