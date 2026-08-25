import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  ColliderTransformMode,
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';

test('static colliders reuse transform data until explicitly invalidated', () => {
  const world = new CollisionWorld();
  const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  collider.name = 'cached-static-collider';
  collider.position.set(0, 0, 2);

  let transformRefreshes = 0;
  const updateWorldMatrix = collider.updateWorldMatrix.bind(collider);
  collider.updateWorldMatrix = (...parameters): void => {
    transformRefreshes += 1;
    updateWorldMatrix(...parameters);
  };

  world.register(
    collider,
    CollisionLayer.Movement,
    ColliderTransformMode.Static,
  );
  const hit = new CollisionHit();
  const origin = new THREE.Vector3();
  const displacement = new THREE.Vector3(0, 0, 8);

  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  const initialDistance = hit.distance;
  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  assert.equal(transformRefreshes, 1);
  assert.equal(hit.distance, initialDistance);

  collider.position.z = 5;
  collider.scale.set(2, 1, 0.5);
  world.invalidateTransform(collider);

  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  assert.equal(transformRefreshes, 2);
  assert.ok(hit.distance > initialDistance);

  collider.geometry.dispose();
});

test('dynamic colliders refresh parent transforms for every sweep', () => {
  const world = new CollisionWorld();
  const parent = new THREE.Group();
  const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  collider.name = 'moving-child-collider';
  collider.position.z = 2;
  parent.add(collider);

  let transformRefreshes = 0;
  const updateWorldMatrix = collider.updateWorldMatrix.bind(collider);
  collider.updateWorldMatrix = (...parameters): void => {
    transformRefreshes += 1;
    updateWorldMatrix(...parameters);
  };

  world.register(
    collider,
    CollisionLayer.Movement,
    ColliderTransformMode.Static,
  );
  world.setTransformMode(collider, ColliderTransformMode.Dynamic);
  const hit = new CollisionHit();
  const origin = new THREE.Vector3();
  const displacement = new THREE.Vector3(0, 0, 8);

  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  const initialDistance = hit.distance;

  parent.position.z = 3;
  parent.scale.set(2, 1, 0.5);
  assert.equal(world.sweepSphere(origin, displacement, 0.2, hit), true);
  assert.equal(transformRefreshes, 2);
  assert.ok(hit.distance > initialDistance);

  collider.geometry.dispose();
});

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

test('camera-only blockers obstruct camera sweeps but remain absent from movement', () => {
  const world = new CollisionWorld();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const cameraOnly = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.4, 4),
    hiddenMaterial,
  );
  cameraOnly.name = 'test-camera-only-cap';
  cameraOnly.position.set(0, 3, 0);
  world.register(cameraOnly, CollisionLayer.CameraObstruction);

  const origin = new THREE.Vector3(0, 0, 0);
  const displacement = new THREE.Vector3(0, 5, 0);
  const hit = new CollisionHit();

  assert.equal(cameraOnly.visible, true);
  assert.equal(hiddenMaterial.visible, false);
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.22,
      hit,
      CollisionLayer.CameraObstruction,
    ),
    true,
  );
  assert.equal(hit.object?.name, 'test-camera-only-cap');
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.45,
      hit,
      CollisionLayer.Movement,
    ),
    false,
  );

  cameraOnly.geometry.dispose();
  hiddenMaterial.dispose();
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

  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.2,
      hit,
      CollisionLayer.Projectile,
    ),
    true,
  );
  assert.equal(
    world.sweepSphere(
      origin,
      displacement,
      0.001,
      hit,
      CollisionLayer.LineOfSight,
    ),
    true,
  );

  world.setLayerMask(solid, CollisionLayer.Movement);
  assert.equal(
    world.sweepSphere(origin, displacement, 0.2, hit, CollisionLayer.Projectile),
    false,
  );

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
