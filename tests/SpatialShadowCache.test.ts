import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpatialShadowCache } from '../src/render/SpatialShadowCache.ts';
import { disposeShadowLight, setShadowMapUpdatesActive } from '../src/render/ShadowLightResources.ts';

function lightFixture() {
  const light = new THREE.SpotLight(0xffffff, 20, 15, .7);
  light.position.set(0, 5, 0); light.target.position.set(0, 0, 0);
  light.castShadow = true;
  return light;
}

function simulateShadowDraw(light: THREE.SpotLight) {
  light.shadow.map ??= new THREE.WebGLRenderTarget(1, 1);
  light.shadow.needsUpdate = false;
}

test('inactive shadow sources allocate a valid map once and resume immediately when activated', () => {
  const light = lightFixture();
  setShadowMapUpdatesActive(light, false);
  assert.equal(light.castShadow, true);
  assert.equal(light.shadow.autoUpdate, false); assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light);
  const map = light.shadow.map;
  setShadowMapUpdatesActive(light, false);
  assert.equal(light.shadow.autoUpdate, false); assert.equal(light.shadow.needsUpdate, false);
  setShadowMapUpdatesActive(light, true);
  assert.equal(light.shadow.autoUpdate, true); assert.equal(light.shadow.needsUpdate, true);
  assert.equal(light.shadow.map, map);
  disposeShadowLight(light);
  setShadowMapUpdatesActive(light, false);
  assert.equal(light.shadow.needsUpdate, true);
});

test('empty cones reuse shadows while flicker changes illumination, not depth', () => {
  const light = lightFixture(), cache = new SpatialShadowCache([light]);
  cache.prepareFrame([]);
  assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light);
  light.intensity = .1; light.color.setHex(0xff0000);
  cache.prepareFrame([]);
  assert.equal(light.shadow.autoUpdate, false); assert.equal(light.shadow.needsUpdate, false);
  assert.equal(light.intensity, .1);
  cache.invalidate(); assert.equal(light.shadow.needsUpdate, true);
  disposeShadowLight(light);
});

test('characters keep animated shadows live and leaving or teleporting clears the old silhouette once', () => {
  const light = lightFixture(), cache = new SpatialShadowCache([light]);
  const position = new THREE.Vector3(0, 1, 0);
  cache.prepareFrame([position]); simulateShadowDraw(light);
  cache.prepareFrame([position]); assert.equal(light.shadow.autoUpdate, true);
  position.set(30, 1, 0);
  cache.prepareFrame([position]);
  assert.equal(light.shadow.autoUpdate, false); assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light); cache.prepareFrame([position]);
  assert.equal(light.shadow.needsUpdate, false);
  position.set(0, 1, 0); cache.prepareFrame([position]); assert.equal(light.shadow.autoUpdate, true);
  simulateShadowDraw(light); cache.prepareFrame([]); assert.equal(light.shadow.needsUpdate, true);
  disposeShadowLight(light);
});

test('moving doors invalidate old and new bounds even after they leave a cone or become hidden', () => {
  const light = lightFixture(), parent = new THREE.Group(), door = new THREE.Object3D();
  parent.add(door); door.position.set(0, 1, 0);
  const cache = new SpatialShadowCache([light], [{ root: door, radiusMetres: 1 }]);
  cache.prepareFrame([]); simulateShadowDraw(light); cache.prepareFrame([]);
  assert.equal(light.shadow.needsUpdate, false);
  door.position.set(20, 1, 0); cache.prepareFrame([]);
  assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light); cache.prepareFrame([]); assert.equal(light.shadow.needsUpdate, false);
  door.position.set(0, 1, 0); cache.prepareFrame([]); assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light); parent.visible = false; cache.prepareFrame([]);
  assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light); cache.prepareFrame([]); assert.equal(light.shadow.needsUpdate, false);
  disposeShadowLight(light);
});

test('animated drone children retain live shadows and moving lights or targets invalidate cached maps', () => {
  const light = lightFixture(), drone = new THREE.Group(); drone.position.y = 2;
  const cache = new SpatialShadowCache([light], [{ root: drone, radiusMetres: 1, animated: true }]);
  cache.prepareFrame([]); simulateShadowDraw(light); cache.prepareFrame([]);
  assert.equal(light.shadow.autoUpdate, true);
  drone.visible = false; cache.prepareFrame([]); simulateShadowDraw(light);
  cache.prepareFrame([]); assert.equal(light.shadow.autoUpdate, false);
  light.target.position.x = 2; cache.prepareFrame([]); assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light); light.position.x = 1; cache.prepareFrame([]);
  assert.equal(light.shadow.needsUpdate, true);
  simulateShadowDraw(light); light.angle = .8; cache.prepareFrame([]);
  assert.equal(light.shadow.needsUpdate, true);
  disposeShadowLight(light);
});
