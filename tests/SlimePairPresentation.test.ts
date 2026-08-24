import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SlimePairPresentation } from '../src/slimes/SlimePairPresentation.ts';

class CountingCollisionWorld extends CollisionWorld {
  queryCount = 0;

  override sweepSphere(
    ...parameters: Parameters<CollisionWorld['sweepSphere']>
  ): ReturnType<CollisionWorld['sweepSphere']> {
    this.queryCount += 1;
    return super.sweepSphere(...parameters);
  }
}

test('inactive-body locators identify the correct body and survive occlusion', () => {
  const presentation = new SlimePairPresentation(0.45);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 5);
  const collisionWorld = new CountingCollisionWorld();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2));
  wall.name = 'locator-occluding-wall';
  wall.position.set(0, 1, 2.5);
  collisionWorld.register(wall);

  presentation.update(
    { x: 0, y: 0.45, z: 0 },
    { x: 0, y: 0.45, z: 0 },
    'bob',
    camera,
    collisionWorld,
  );
  assert.equal(presentation.locatorDiagnostics.bobVisible, false);
  assert.equal(presentation.locatorDiagnostics.goopVisible, true);
  assert.equal(presentation.locatorDiagnostics.goopOccluded, true);
  const goopLocator = presentation.root.getObjectByName(
    'goop-inactive-body-locator',
  ) as THREE.Sprite<THREE.SpriteMaterial>;
  assert.ok(goopLocator);
  assert.equal(goopLocator.scale.x, 0.45);
  assert.equal(collisionWorld.queryCount, 1);

  presentation.update(
    { x: 2, y: 0.45, z: 0 },
    { x: 0, y: 0.45, z: 0 },
    'goop',
    camera,
    collisionWorld,
  );
  assert.equal(presentation.locatorDiagnostics.bobVisible, true);
  assert.equal(presentation.locatorDiagnostics.goopVisible, false);
  assert.equal(collisionWorld.queryCount, 2);

  presentation.update(
    { x: 2, y: 0.45, z: 0 },
    { x: 0, y: 0.45, z: -100 },
    'bob',
    camera,
    collisionWorld,
  );
  assert.equal(goopLocator.scale.x, 1.2);
  assert.equal(collisionWorld.queryCount, 3);

  presentation.update(
    { x: 2, y: 0.45, z: 0 },
    { x: 0, y: 0.45, z: 0 },
    'bob',
    camera,
    collisionWorld,
  );
  assert.equal(
    presentation.root.getObjectsByProperty('type', 'Sprite').length,
    2,
  );
  assert.equal(collisionWorld.queryCount, 4);

  let locatorTextureDisposed = false;
  let locatorMaterialDisposed = false;
  goopLocator.material.map?.addEventListener('dispose', () => {
    locatorTextureDisposed = true;
  });
  goopLocator.material.addEventListener('dispose', () => {
    locatorMaterialDisposed = true;
  });

  presentation.dispose();
  assert.equal(presentation.root.children.length, 0);
  assert.equal(locatorTextureDisposed, true);
  assert.equal(locatorMaterialDisposed, true);
  wall.geometry.dispose();
});

test('first-person Goop aim hides the active body and control ring until aim ends', () => {
  const presentation = new SlimePairPresentation(0.45);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 5);
  const collisionWorld = new CollisionWorld();
  const bobPosition = { x: 2, y: 0.45, z: 0 };
  const goopPosition = { x: 0, y: 0.45, z: 0 };
  const goopMesh = presentation.root.getObjectByName('goop-development-body');
  const activeRing = presentation.root.getObjectByName(
    'active-slime-control-indicator',
  );

  presentation.update(
    bobPosition,
    goopPosition,
    'goop',
    camera,
    collisionWorld,
    true,
  );
  assert.equal(goopMesh?.visible, false);
  assert.equal(activeRing?.visible, false);

  presentation.update(
    bobPosition,
    goopPosition,
    'goop',
    camera,
    collisionWorld,
    false,
  );
  assert.equal(goopMesh?.visible, true);
  assert.equal(activeRing?.visible, true);

  presentation.dispose();
});

test('active control ring follows the selected slime gameplay-up direction', () => {
  const presentation = new SlimePairPresentation(0.45);
  const camera = new THREE.PerspectiveCamera();
  const collisionWorld = new CollisionWorld();
  const bobPosition = { x: 2, y: 3, z: 4 };
  const goopPosition = { x: -2, y: 1, z: -4 };
  const ring = presentation.root.getObjectByName(
    'active-slime-control-indicator',
  );
  assert.ok(ring);

  presentation.update(
    bobPosition,
    goopPosition,
    'bob',
    camera,
    collisionWorld,
    false,
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  );
  assert.ok(ring.position.distanceTo(new THREE.Vector3(1.57, 3, 4)) < 1e-10);
  const ringNormal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(ring.quaternion)
    .normalize();
  assert.ok(ringNormal.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);

  presentation.update(
    bobPosition,
    goopPosition,
    'goop',
    camera,
    collisionWorld,
    false,
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
  );
  assert.ok(ring.position.distanceTo(new THREE.Vector3(-2, 1, -3.57)) < 1e-10);
  ringNormal.set(0, 0, 1).applyQuaternion(ring.quaternion).normalize();
  assert.ok(ringNormal.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-10);

  presentation.dispose();
});
