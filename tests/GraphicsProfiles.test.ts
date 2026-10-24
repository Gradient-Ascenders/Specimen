import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_PROFILES, graphicsProfileName } from '../src/render/GraphicsProfiles.ts';
import { GraphicsResourcePolicy, markDecorativeEffect } from '../src/render/GraphicsResourcePolicy.ts';
import { GameSettings } from '../src/ui/GameSettings.ts';
import { RenderLayer } from '../src/render/RenderLayer.ts';
import { GelRendering } from '../src/render/slime/GelRendering.ts';
import { resolveRenderResolution } from '../src/render/RenderResolution.ts';

test('minimum is the conservative session default; presets notify once and preserve non-graphics settings', () => {
  const settings = new GameSettings();
  assert.equal(graphicsProfileName(settings.value), 'minimum');
  assert.deepEqual(DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_PROFILES.minimum.settings);
  settings.setMouseSensitivity(1.7); settings.setMasterVolume(.4);
  let notifications = 0;
  settings.subscribe(() => notifications++);
  settings.setGraphicsProfile('standard');
  assert.equal(notifications, 2);
  assert.equal(graphicsProfileName(settings.value), 'standard');
  assert.equal(settings.value.gelRenderingMode, 'reduced-transmission');
  assert.equal(settings.value.mouseSensitivity, 1.7);
  assert.equal(settings.value.masterVolume, .4);
  settings.setGraphicsProfile('standard'); assert.equal(notifications, 2);
  settings.setRenderScale(.5);
  assert.equal(graphicsProfileName(settings.value), 'custom');
  assert.equal(settings.value.graphicsProfile, 'standard'); // Still a hard 1080p budget.
  settings.setGraphicsProfile('minimum');
  assert.equal(graphicsProfileName(settings.value), 'minimum');
  assert.equal(graphicsProfileName(settings.value, 'physical'), 'custom');
});

test('the extra Performance cap composes with profiles without losing gel or density choices', () => {
  const settings = new GameSettings(), renderer = { transmissionResolutionScale: 1 };
  const layer = Object.create(RenderLayer.prototype) as any;
  layer.gelRendering = new GelRendering(renderer);
  const qualities: number[][] = [];
  layer.graphicsResources = { setQuality: (shadow: number, effects: number) => qualities.push([shadow, effects]) };
  layer.shadowPolicy={setHighQuality:()=>{}};
  layer.resize = () => {
    const profile = GRAPHICS_PROFILES[layer.graphicsSettings.graphicsProfile as 'minimum' | 'standard'];
    const size = resolveRenderResolution(3840, 2160, 2, { pixelRatioCap: layer.effectivePixelRatioCap,
      renderScale: layer.graphicsSettings.renderScale, pixelBudget: profile.pixelBudget });
    assert.ok(size.drawingBufferWidth * size.drawingBufferHeight <= profile.pixelBudget);
  };
  settings.setGraphicsProfile('standard'); settings.setGelRenderingMode('physical');
  settings.setGraphicsPreset('performance'); layer.setGraphicsSettings(settings.value);
  assert.equal(layer.effectivePixelRatioCap, 1);
  assert.equal(settings.value.renderPixelRatioCap, 1.5);
  assert.equal(layer.gelRendering.value, 'physical'); assert.equal(renderer.transmissionResolutionScale, .5);
  assert.equal(graphicsProfileName(settings.value), 'custom');
  settings.setGraphicsPreset('normal'); layer.setGraphicsSettings(settings.value);
  assert.equal(layer.effectivePixelRatioCap, 1.5); assert.equal(renderer.transmissionResolutionScale, 1);
  settings.setGelRenderingMode('reduced-transmission'); layer.setGraphicsSettings(settings.value);
  assert.equal(renderer.transmissionResolutionScale, .75);
  for (const preset of ['performance', 'normal'] as const) {
    settings.setGraphicsPreset(preset); settings.setRenderPixelRatioCap(.75); layer.setGraphicsSettings(settings.value);
    assert.equal(layer.effectivePixelRatioCap, .75);
    assert.equal(renderer.transmissionResolutionScale, preset === 'performance' ? .5 : .75);
  }
  settings.setGraphicsProfile('minimum'); layer.setGraphicsSettings(settings.value);
  assert.equal(layer.gelRendering.value, 'minimum'); assert.equal(settings.value.graphicsPreset, 'normal');
  assert.equal(graphicsProfileName(settings.value), 'minimum');
  assert.deepEqual(qualities.at(-1), [512, .5]);
});

test('Custom retains values, exposes resource controls and presets restore all quality settings atomically', () => {
  const settings = new GameSettings({ storage: null });
  settings.setGraphicsProfile('standard');
  const medium = { ...settings.value };
  settings.setGraphicsProfile('custom');
  assert.equal(graphicsProfileName(settings.value), 'custom');
  assert.deepEqual(settings.value, { ...medium, customGraphicsProfile: true });
  settings.setShadowMapSizeCap(2048);
  settings.setPixelBudget(3686400);
  settings.setEffectsDensity(0.75);
  const layer = Object.create(RenderLayer.prototype) as any;
  layer.gelRendering = new GelRendering({ transmissionResolutionScale: 1 });
  let quality: number[] = [];
  layer.graphicsResources = { setQuality: (...values: number[]) => { quality = values; } };
  layer.shadowPolicy={setHighQuality:()=>{}};
  layer.resize = () => {};
  layer.setGraphicsSettings(settings.value);
  assert.deepEqual(quality, [2048, 0.75]);
  assert.equal(layer.pixelBudget, 3686400);
  for (const id of ['minimum', 'standard', 'high'] as const) {
    let notifications = 0;
    const unsubscribe = settings.subscribe(() => notifications++);
    settings.setGraphicsProfile(id);
    assert.equal(notifications, 2);
    for (const [key, value] of Object.entries(GRAPHICS_PROFILES[id].settings)) {
      assert.equal(settings.value[key as keyof typeof settings.value], value);
    }
    assert.equal(graphicsProfileName(settings.value), id);
    unsubscribe();
  }
  // Non-graphics preferences and a no-op control change keep the preset.
  settings.setShowFPS(true); settings.setMasterVolume(0.2); settings.setEffectsDensity(1);
  assert.equal(graphicsProfileName(settings.value), 'high');
  settings.setEffectsDensity(0.5);
  assert.equal(graphicsProfileName(settings.value), 'custom');
  settings.setEffectsDensity(1);
  assert.equal(graphicsProfileName(settings.value), 'custom', 'Custom stays selected until a preset is chosen');
});

test('map caps restore authored resolution and dispose only replaced targets once', () => {
  const scene = new THREE.Scene(), light = new THREE.SpotLight(0xff0000, 100);
  light.castShadow = true; light.shadow.mapSize.set(1024, 768); scene.add(light);
  const first = new THREE.WebGLRenderTarget(1024, 768);
  const pass = new THREE.WebGLRenderTarget(1024, 768);
  light.shadow.map = first; light.shadow.mapPass = pass;
  let disposals = 0;
  first.addEventListener('dispose', () => disposals++); pass.addEventListener('dispose', () => disposals++);
  const policy = new GraphicsResourcePolicy(scene);
  policy.sync();
  assert.deepEqual(light.shadow.mapSize.toArray(), [512, 512]);
  assert.equal(disposals, 2); assert.equal(light.shadow.map, null); assert.equal(light.shadow.mapPass, null);
  assert.equal(light.shadow.needsUpdate, true);
  assert.equal(light.intensity, 100); assert.equal(light.color.getHex(), 0xff0000); assert.equal(light.castShadow, true);
  const next = new THREE.WebGLRenderTarget(512, 512); light.shadow.map = next;
  next.addEventListener('dispose', () => disposals++);
  policy.sync(); policy.setQuality(512, .5); assert.equal(disposals, 2);
  policy.setQuality(1024, 1); assert.equal(disposals, 3);
  assert.deepEqual(light.shadow.mapSize.toArray(), [1024, 768]);
  policy.setQuality(2048, 1); // Never upscale authored detail.
  assert.deepEqual(light.shadow.mapSize.toArray(), [1024, 768]);
  policy.dispose(); policy.dispose(); assert.equal(disposals, 3);
});

test('root handoffs refresh the catalog; hidden lights, small fixtures and dormant fillers remain valid', () => {
  const scene = new THREE.Scene(), policy = new GraphicsResourcePolicy(scene);
  policy.sync();
  const root = new THREE.Group(), light = new THREE.PointLight();
  light.castShadow = true; light.shadow.mapSize.set(1024, 1024); root.visible = false;
  const filler = new THREE.SpotLight(); filler.castShadow = true; filler.shadow.mapSize.set(1, 1);
  root.add(light, filler); scene.add(root); policy.sync();
  assert.deepEqual(light.shadow.mapSize.toArray(), [512, 512]);
  assert.deepEqual(filler.shadow.mapSize.toArray(), [1, 1]);
  root.removeFromParent(); light.shadow.dispose();
  policy.setQuality(1024, 1);
  assert.deepEqual(light.shadow.mapSize.toArray(), [512, 512]); // No access to departed ownership.
  scene.add(root); policy.sync();
  assert.deepEqual(light.shadow.mapSize.toArray(), [1024, 1024]);
  policy.dispose();
});

test('switching depth sampler type releases dormant maps even when their dimensions stay the same',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),light=new THREE.SpotLight();
  light.castShadow=true;light.shadow.mapSize.set(1,1);root.visible=false;root.add(light);scene.add(root);
  const policy=new GraphicsResourcePolicy(scene);policy.sync();
  const map=new THREE.WebGLRenderTarget(1,1);light.shadow.map=map;light.shadow.needsUpdate=false;
  let disposed=0;map.addEventListener('dispose',()=>disposed++);
  policy.invalidateShadowMaps();
  assert.equal(disposed,1);assert.equal(light.shadow.map,null);assert.equal(light.shadow.needsUpdate,true);
  policy.invalidateShadowMaps();assert.equal(disposed,1);
  policy.dispose();
});

test('only opted-in decorative points are thinned, with no allocation or changes to authority/visibility', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
  markDecorativeEffect(geometry);
  const points = new THREE.Points(geometry), gameplayGeometry = new THREE.BufferGeometry();
  gameplayGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
  scene.add(points, new THREE.Points(gameplayGeometry));
  const policy = new GraphicsResourcePolicy(scene); policy.sync();
  assert.equal(geometry.drawRange.count, 5);
  assert.equal(gameplayGeometry.drawRange.count, Infinity);
  assert.equal(points.visible, true);
  const attribute = geometry.getAttribute('position');
  for (let i = 0; i < 30; i++) { policy.setQuality(1024, 1); policy.setQuality(512, .5); }
  policy.setQuality(1024, 1);
  assert.equal(geometry.drawRange.count, Infinity);
  assert.equal(geometry.getAttribute('position'), attribute);
  policy.dispose(); geometry.dispose(); gameplayGeometry.dispose();
});

test('detaching a room drops strong catalog references without requiring another render', () => {
  const scene = new THREE.Scene(), root = new THREE.Group(), light = new THREE.SpotLight();
  light.castShadow = true;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
  markDecorativeEffect(geometry);
  const material = new THREE.PointsMaterial();
  root.add(light, new THREE.Points(geometry, material)); scene.add(root);
  const policy = new GraphicsResourcePolicy(scene); policy.sync();
  const catalog = policy as unknown as { shadows: unknown[]; effects: unknown[] };
  assert.equal(catalog.shadows.length, 1); assert.equal(catalog.effects.length, 1);
  root.removeFromParent();
  assert.equal(catalog.shadows.length, 0); assert.equal(catalog.effects.length, 0);
  policy.dispose(); geometry.dispose(); material.dispose(); light.dispose();
});

test('cheap frame snapshots record profile/quality and actual drawing buffer without scene traversal', () => {
  const layer = Object.create(RenderLayer.prototype) as any;
  layer.graphicsSettings = { ...GRAPHICS_PROFILES.minimum.settings };
  layer.effectivePixelRatioCap = 1;
  layer.viewportWidth = 1920; layer.viewportHeight = 1080; layer.hostWindow = { devicePixelRatio: 2 };
  layer.antialias = false; layer.gelRendering = { value: 'minimum' };
  layer.renderer = { getDrawingBufferSize: (v: THREE.Vector2) => v.set(1280, 720), getPixelRatio: () => 2 / 3,
    transmissionResolutionScale: 1, info: { render: { calls: 10, triangles: 20 }, memory: { geometries: 2, textures: 3 }, programs: [] } };
  const snapshot = {} as any;
  layer.writePerformanceSnapshot(snapshot, new THREE.Vector2());
  assert.equal(snapshot.graphicsProfile, 'minimum'); assert.equal(snapshot.graphicsProfileBase, 'minimum');
  assert.equal(snapshot.graphicsPreset, 'normal'); assert.equal(snapshot.requestedPixelRatioCap, 1);
  assert.equal(snapshot.pixelBudget, 921600); assert.equal(snapshot.renderScale, .75);
  assert.equal(snapshot.devicePixelRatio, 2); assert.equal(snapshot.effectiveDpr, 2 / 3);
  assert.equal(snapshot.gelRenderingMode, 'minimum'); assert.equal(snapshot.shadowMapSizeCap, 512);
  assert.deepEqual([snapshot.drawingBufferWidth, snapshot.drawingBufferHeight], [1280, 720]);
});

test('gameplay primer viewport uses future physical dimensions without resizing the cinematic', () => {
  const layer = Object.create(RenderLayer.prototype) as any;
  layer.host = {clientWidth:1920, clientHeight:1080}; layer.hostWindow = {devicePixelRatio:2};
  layer.graphicsSettings = {...GRAPHICS_PROFILES.standard.settings, renderScale:0.75};
  layer.effectivePixelRatioCap = 1.5; layer.maximumWidth = 16384; layer.maximumHeight = 16384;
  // The bounded cinematic owns a 1x renderer; deriving from its current viewport
  // would underprepare high-DPI gameplay and overprepare a reduced render scale.
  layer.renderer = {getPixelRatio:()=>1, transmissionResolutionScale:0.5};
  const size = resolveRenderResolution(1920,1080,2,{pixelRatioCap:1.5,renderScale:0.75,
    pixelBudget:GRAPHICS_PROFILES.standard.pixelBudget,minimumDrawingBufferDimension:2});
  const viewport = layer.getGameplayPrewarmViewport(new THREE.Vector4());
  assert.deepEqual(viewport.toArray(),[0,0,size.drawingBufferWidth,size.drawingBufferHeight]);
  // No setSize/setViewport method exists on this spy: deriving dimensions must
  // not clear the visible cinematic or allocate another camera/render target.
});
