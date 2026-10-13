import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GelReflectionLighting } from '../src/render/slime/GelReflectionLighting.ts';

test('reflection fill follows real local lighting and hidden or unpowered fixtures contribute nothing', () => {
  const scene = new THREE.Scene(), room = new THREE.Group(); scene.add(room);
  const light = new THREE.PointLight(0xffffff, 16, 5); room.add(light);
  const probe = new GelReflectionLighting(scene);
  const goop = new THREE.Vector3(0, 0, 2), distantBob = new THREE.Vector3(0, 0, 10);
  assert.ok(probe.weightAt(goop) > 0);
  assert.equal(probe.weightAt(distantBob), 0);
  light.intensity = 0; assert.equal(probe.weightAt(goop), 0);
  light.intensity = 16; room.visible = false; assert.equal(probe.weightAt(goop), 0);
  room.visible = true; assert.ok(probe.weightAt(goop) > 0);
});

test('spotlight reflections respect both hard and soft cones', () => {
  const scene = new THREE.Scene(), light = new THREE.SpotLight(0xffffff, 10, 10, Math.PI / 6);
  light.target.position.set(0, 0, -1); scene.add(light, light.target);
  const probe = new GelReflectionLighting(scene);
  const center = new THREE.Vector3(0, 0, -2), outside = new THREE.Vector3(2, 0, 0);
  for (const penumbra of [0, 0.4]) {
    light.penumbra = penumbra;
    assert.ok(probe.weightAt(center) > 0);
    assert.equal(probe.weightAt(outside), 0);
  }
});
