import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GelRendering } from '../src/render/slime/GelRendering.ts';
import { GelMaterialSet } from '../src/render/slime/GelMaterials.ts';
import { GoopMaterialSet } from '../src/render/goop/GoopMaterials.ts';
import { VoltMaterialSet } from '../src/render/volt/VoltMaterials.ts';
import { GameSettings } from '../src/ui/GameSettings.ts';

test('preset transmission cap composes with gel mode in either setting order', () => {
  const renderer = { transmissionResolutionScale: 1 };
  const rendering = new GelRendering(renderer);
  rendering.setTransmissionResolutionScaleCap(0.5);
  for (const mode of ['reduced-transmission', 'minimum', 'physical'] as const) {
    rendering.setMode(mode);
    assert.equal(renderer.transmissionResolutionScale, 0.5);
  }
  rendering.setTransmissionResolutionScaleCap(1);
  assert.equal(renderer.transmissionResolutionScale, 1);
  rendering.setMode('reduced-transmission');
  rendering.setTransmissionResolutionScaleCap(0.5);
  rendering.setTransmissionResolutionScaleCap(1);
  assert.equal(renderer.transmissionResolutionScale, 0.75, 'Medium retains more interior detail');
  rendering.setMode('physical');
  assert.equal(renderer.transmissionResolutionScale, 1);
});

test('level capture budgets compose, preserve full gel mode and release independently across handoffs',()=>{
  const renderer={transmissionResolutionScale:1},rendering=new GelRendering(renderer);
  rendering.setTransmissionResolutionScaleCap(.5);rendering.setMode('reduced-transmission');
  const first=rendering.requestReducedTransmissionCap(.25),second=rendering.requestReducedTransmissionCap(.35);
  assert.equal(renderer.transmissionResolutionScale,.25);
  rendering.setMode('physical');assert.equal(renderer.transmissionResolutionScale,.5);
  rendering.setMode('minimum');assert.equal(renderer.transmissionResolutionScale,.5);
  rendering.setMode('reduced-transmission');assert.equal(renderer.transmissionResolutionScale,.25);
  rendering.setTransmissionResolutionScaleCap(.2);assert.equal(renderer.transmissionResolutionScale,.2);
  rendering.setTransmissionResolutionScaleCap(.5);first();first();assert.equal(renderer.transmissionResolutionScale,.35);
  second();assert.equal(renderer.transmissionResolutionScale,.5);
  for(const cap of [0,-1,Infinity,NaN,1.1])assert.throws(()=>rendering.requestReducedTransmissionCap(cap),RangeError);
});

test('minimum gel removes transmission from every identity while preserving surface and fade state', () => {
  const renderer = { transmissionResolutionScale: 1 };
  const rendering = new GelRendering(renderer);
  const emission = new THREE.Texture(), roughness = new THREE.Texture(), colour = new THREE.Texture();
  const sets = [new GelMaterialSet(undefined, rendering), new GoopMaterialSet(rendering),
    new VoltMaterialSet(emission, roughness, colour, rendering)];
  const surfaces = sets.map(({ body }) => ({ color: body.color.getHex(), clearcoat: body.clearcoat,
    roughness: body.roughness, emissive: body.emissiveIntensity, hook: body.onBeforeCompile }));
  const environment = new THREE.Texture();
  rendering.setMode('minimum');
  for (const [index, set] of sets.entries()) {
    assert.equal(set.body.transmission, 0);
    assert.deepEqual({ color: set.body.color.getHex(), clearcoat: set.body.clearcoat,
      roughness: set.body.roughness, emissive: set.body.emissiveIntensity, hook: set.body.onBeforeCompile }, surfaces[index]);
    set.setReflectionEnvironment(environment);
    set.setReflectionIntensity(0.7, 0.8, true);
    set.setImpact(new THREE.Vector3(0.1, 0, 0), 0.6);
    set.update(0.1);
    for (const opacity of [0.5, 0, 1]) {
      set.setOpacity(opacity);
      assert.equal(set.body.transmission, 0);
      assert.equal(set.body.opacity, opacity);
      assert.equal(set.eyes.opacity, opacity);
      assert.equal(set.body.depthWrite, opacity === 1);
    }
    set.reset();
    assert.equal(set.body.transmission, 0);
    assert.equal(set.body.opacity, 1);
    assert.equal(set.body.envMap, environment);
    assert.equal(set.body.envMapIntensity, 0.7);
    assert.equal(set.body.roughnessMap, index === 2 ? roughness : null);
    assert.equal(set.body.emissiveMap, index === 2 ? emission : null);
    assert.equal(set.body.map, index === 2 ? colour : null);
  }
  rendering.setMode('reduced-transmission');
  assert.equal(renderer.transmissionResolutionScale, 0.75);
  assert.deepEqual(sets.map(set => set.body.transmission), [0.28, 0.28, 0.55]);
  rendering.setMode('physical');
  assert.equal(renderer.transmissionResolutionScale, 1);
  assert.deepEqual(sets.map(set => set.body.transmission), [0.28, 0.28, 0.55]);
  for (const set of sets) for (const material of [set.body, set.eyes, set.bodyDepth, set.bodyDistance, set.eyeDepth, set.eyeDistance]) material.dispose();
  assert.equal(rendering.materialCount, 0);
  for (const texture of [emission, roughness, colour, environment]) texture.dispose();
});

test('late loads inherit the current mode, disposal releases registrations, sessions are isolated', () => {
  const rendering = new GelRendering({ transmissionResolutionScale: 1 });
  rendering.setMode('minimum');
  const other = new GelMaterialSet(undefined, new GelRendering({ transmissionResolutionScale: 1 }));
  for (let i = 0; i < 4; i++) {
    const set = new GelMaterialSet(undefined, rendering);
    assert.equal(set.body.transmission, 0);
    assert.equal(rendering.materialCount, 1);
    rendering.register(set.body); // Never capture the overridden zero as authored transmission.
    rendering.setMode('physical');
    assert.equal(set.body.transmission, 0.28);
    rendering.setMode('minimum');
    set.body.dispose(); set.body.dispose();
    assert.equal(rendering.materialCount, 0);
  }
  assert.equal(other.body.transmission, 0.28);
});

test('gel quality is a session setting independent of render resolution', () => {
  const settings = new GameSettings();
  settings.setGraphicsProfile('standard');
  const modes: string[] = [];
  settings.subscribe(value => modes.push(value.gelRenderingMode));
  settings.setGelRenderingMode('minimum');
  settings.setGelRenderingMode('minimum');
  assert.equal(settings.value.renderPixelRatioCap, 1.5);
  settings.setRenderPixelRatioCap(1);
  assert.equal(settings.value.gelRenderingMode, 'minimum');
  settings.setGelRenderingMode('physical');
  assert.deepEqual(modes, ['reduced-transmission', 'minimum', 'minimum', 'physical']);
});
