import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CameraShadowCulling } from '../src/render/CameraShadowCulling.ts';

test('only finite lights wholly outside the camera defer shadow updates', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
  const visible = new THREE.SpotLight(0xffffff, 1, 5); visible.position.z = -10;
  const outside = new THREE.PointLight(0xffffff, 1, 5); outside.position.z = 10;
  const overlapping = new THREE.PointLight(0xffffff, 1, 15); overlapping.position.z = 10;
  const infinite = new THREE.PointLight(0xffffff, 1, 0); infinite.position.z = 10;
  const lights = [visible, outside, overlapping, infinite];
  for (const light of lights) {
    light.castShadow = true; light.shadow.map = new THREE.WebGLRenderTarget(1, 1);
    light.shadow.autoUpdate = true; light.shadow.needsUpdate = true;
  }
  const culling = new CameraShadowCulling(lights);
  try {
    culling.prepare(camera);
    assert.equal(outside.shadow.autoUpdate, false);
    assert.equal(outside.shadow.needsUpdate, false);
    for (const light of [visible, overlapping, infinite]) assert.equal(light.shadow.autoUpdate, true);
    assert.ok(lights.every(light => light.castShadow && light.visible), 'shader layout remains unchanged');
    // A renderer consumes only the visible lights' pending work.
    visible.shadow.needsUpdate = false;
    culling.restore();
    assert.equal(outside.shadow.autoUpdate, true);
    assert.equal(outside.shadow.needsUpdate, true, 'deferred work is not lost');
    assert.equal(visible.shadow.needsUpdate, false, 'do not undo completed map updates');
    camera.rotation.y = Math.PI;
    culling.prepare(camera);
    assert.equal(outside.shadow.autoUpdate, true, 'returning to view gets a fresh shadow');
    culling.restore();
  } finally { for (const light of lights) light.shadow.map?.dispose(); }
});

test('offscreen first maps and inactive network settings survive culling', () => {
  const camera = new THREE.PerspectiveCamera();
  const first = new THREE.SpotLight(0xffffff, 0, 5); first.position.z = 10;
  first.castShadow = true; first.shadow.autoUpdate = false; first.shadow.needsUpdate = true;
  const paused = new THREE.SpotLight(0xffffff, 0, 5); paused.position.z = 10;
  paused.castShadow = true; paused.shadow.map = new THREE.WebGLRenderTarget(1, 1);
  paused.shadow.autoUpdate = false; paused.shadow.needsUpdate = false;
  const culling = new CameraShadowCulling([first, paused]);
  try {
    culling.prepare(camera);
    assert.equal(first.shadow.needsUpdate, true, 'allocate a valid PCF sampler even outside view');
    culling.restore();
    assert.equal(paused.shadow.autoUpdate, false);
    assert.equal(paused.shadow.needsUpdate, false);
  } finally { paused.shadow.map.dispose(); }
});
