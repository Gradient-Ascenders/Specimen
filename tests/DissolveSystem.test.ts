import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { DissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

function createTarget(): {
  target: DissolveTarget;
  world: CollisionWorld;
  dispose(): void;
} {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.surfaceTag = 'default';
  world.register(mesh);
  surfaces.register(mesh);
  const target = new DissolveTarget({
    id: 'target',
    mesh,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    dissolveDurationSeconds: 2,
    collisionDisableProgress: 0.75,
  });

  return {
    target,
    world,
    dispose: () => {
      target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

test('accepted burns continue independently and repeated hits do not stack', () => {
  const fixture = createTarget();
  const system = new DissolveSystem([fixture.target]);
  let started = 0;
  system.events.on('burnStarted', () => {
    started += 1;
  });

  assert.equal(system.startBurn(fixture.target), 'started');
  system.update(0.4);
  assert.equal(fixture.target.progress, 0.2);

  assert.equal(system.startBurn(fixture.target), 'already-burning');
  system.update(0.4);
  assert.equal(fixture.target.progress, 0.4);
  assert.equal(started, 1);
  assert.equal(system.activeBurnCount, 1);

  system.update(1.2);
  assert.equal(fixture.target.completed, true);
  assert.equal(system.activeBurnCount, 0);
  assert.equal(system.startBurn(fixture.target), 'rejected');

  system.dispose();
  fixture.dispose();
});

test('burn reset cancels the reaction before target restoration', () => {
  const fixture = createTarget();
  const system = new DissolveSystem([fixture.target]);
  const order: string[] = [];
  system.events.on('burnReset', () => order.push('burn reset'));

  system.startBurn(fixture.target);
  system.update(0.5);
  system.reset();
  order.push('target reset');
  fixture.target.reset();

  assert.deepEqual(order, ['burn reset', 'target reset']);
  assert.equal(system.activeBurnCount, 0);
  assert.equal(fixture.target.progress, 0);
  assert.equal(fixture.world.colliderCount, 1);

  system.dispose();
  fixture.dispose();
});
