import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';

test('camera obstruction queries ignore movement-only colliders', () => {
  const world = new CollisionWorld();
  const movementOnly = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  movementOnly.position.set(0, 0, 2);
  world.register(movementOnly, CollisionLayer.Movement);

  const origin = new THREE.Vector3(0, 0, 0);
  const displacement = new THREE.Vector3(0, 0, 4);
  const hit = new CollisionHit();

  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    false,
  );
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.Movement,
    ),
    true,
  );

  movementOnly.geometry.dispose();
});

test('default authored solids block both movement and camera queries', () => {
  const world = new CollisionWorld();
  const solid = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solid.name = 'test-authored-solid';
  solid.position.set(0, 0, 2);
  world.register(solid);

  const origin = new THREE.Vector3(0, 0, 0);
  const displacement = new THREE.Vector3(0, 0, 4);
  const hit = new CollisionHit();

  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    true,
  );
  assert.equal(hit.object?.name, 'test-authored-solid');
  assert.ok(hit.distance > 1 && hit.distance < 2);

  solid.geometry.dispose();
});
