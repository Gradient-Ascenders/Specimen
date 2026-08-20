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
