import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BeamOcclusion } from '../src/render/hazards/BeamOcclusion.ts';
import { ventEntranceLightingWeight } from '../src/render/slime/VentEntranceLighting.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

test('Bob reflection darkness increases progressively after the vent corner', () => {
  let previous = -Infinity;
  for (const depth of [.8, 2, 3.2, 4.4, 5.6, 6.8, 8]) {
    const darkness = ventEntranceLightingWeight(depth, 9.1);
    assert.ok(darkness > previous);
    previous = darkness;
  }
  assert.equal(previous, 1);
  assert.equal(ventEntranceLightingWeight(0, 9.1), 0, 'straight entrance remains lit');
  assert.equal(ventEntranceLightingWeight(-1.6, 9.1), ventEntranceLightingWeight(1.6, 9.1));
  assert.ok(ventEntranceLightingWeight(-2.4, 9.1) < .2, 'entrance light lingers just past the corner');
  assert.equal(ventEntranceLightingWeight(-8, 9.1), 1, 'left passage reaches full darkness farther in');
  assert.equal(ventEntranceLightingWeight(8, 9.1), 1, 'right passage uses the same gradual fade');
  assert.equal(ventEntranceLightingWeight(0, 30), 1, 'later rooms cannot regain entrance lighting');
});

test('beam stops before a cover and recovers its length when the cover is removed', () => {
  const world = new CollisionWorld(), clip = new BeamOcclusion();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 8, .3)); wall.position.z = -5;
  world.register(wall); const origin = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1);
  const source = new THREE.Mesh();
  assert.ok(clip.length(world, origin, forward, 15, .4, source) < 4.85);
  world.unregister(wall);
  assert.equal(clip.length(world, origin, forward, 15, .4, source), 15);
  wall.geometry.dispose(); world.clear();
});

test('partial cover clips only blocked cone edges, not the entire visible ray', () => {
  const world = new CollisionWorld(), clip = new BeamOcclusion();
  const geometry = new THREE.ConeGeometry(6, 15, 24, 1, true); geometry.translate(0, -7.5, 0);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, .2)); wall.position.set(10, -7, -5); world.register(wall);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const source = new THREE.Mesh();
  clip.clipGeometry(world, new THREE.Vector3(), rotation, geometry, source);
  const positions = geometry.getAttribute('position');
  let shortened = false, fullLength = false;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) < -1 && positions.getY(i) > -14) shortened = true;
    if (positions.getY(i) < -14.9) fullLength = true;
  }
  assert.ok(shortened && fullLength);
  world.unregister(wall); clip.clipGeometry(world, new THREE.Vector3(), rotation, geometry, source);
  assert.ok(Array.from({ length: positions.count }, (_, i) => positions.getY(i)).every(y => Math.abs(y) < .001 || Math.abs(y + 15) < .001));
  geometry.dispose(); wall.geometry.dispose(); world.clear();
});
