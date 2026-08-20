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

test('vertical-side panels block only broad faces without creating movement caps or thin edges', () => {
  const world = new CollisionWorld();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.022));
  wall.name = 'thin-sticky-wall';
  wall.position.set(0, 2, 0);
  wall.userData.movementFaceMode = 'vertical-sides';
  world.register(wall);
  const hit = new CollisionHit();

  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(0, -5, 0),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    false,
  );
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 2, 2),
      new THREE.Vector3(0, 0, -4),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    true,
  );
  assert.equal(hit.object?.name, 'thin-sticky-wall');
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(3, 2, 0),
      new THREE.Vector3(-4, 0, 0),
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    false,
  );

  // Rendering still treats the complete visible panel as an obstruction.
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(0, -5, 0),
      0.22,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    true,
  );

  wall.geometry.dispose();
});
