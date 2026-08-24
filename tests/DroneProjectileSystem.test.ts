import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  DEFAULT_DRONE_PROJECTILE_CONFIG,
  DroneProjectileSystem,
} from '../src/hazards/DroneProjectileSystem.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';

function target(z: number) {
  return {
    slimeId: 'bob' as const,
    position: new THREE.Vector3(0, 0, z),
    previousPosition: new THREE.Vector3(0, 0, z),
    radiusMetres: 0.45,
  };
}

test('pooled projectiles choose nearer cover and cannot tunnel through it', () => {
  const world = new CollisionWorld();
  const damage = new SlimeDamageSystem();
  const system = new DroneProjectileSystem(world, damage, {
    speedMetresPerSecond: 100,
    maximumRangeMetres: 20,
    lifetimeSeconds: 1,
    poolCapacity: 2,
  });
  const owner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const cover = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1));
  cover.name = 'authored-cover';
  cover.position.z = 5;
  world.register(cover);
  const impacts: string[] = [];
  system.events.on('worldImpact', ({ objectName }) => impacts.push(objectName));

  assert.equal(system.spawn('drone', owner, new THREE.Vector3(), new THREE.Vector3(0, 0, 1)), true);
  system.update(0.1, [target(8)]);
  assert.deepEqual(impacts, ['authored-cover']);
  assert.equal(damage.health[0].health, 100);
  assert.equal(system.liveCount, 0);

  world.unregister(cover);
  assert.equal(system.spawn('drone', owner, new THREE.Vector3(), new THREE.Vector3(0, 0, 1)), true);
  system.update(0.1, [target(8)]);
  assert.equal(damage.health[0].health, 80);
  assert.equal(system.liveCount, 0);
  system.dispose();
  damage.dispose();
  owner.geometry.dispose();
  cover.geometry.dispose();
});

test('projectile pool capacity and owner cancellation remain bounded', () => {
  const world = new CollisionWorld();
  const damage = new SlimeDamageSystem();
  const system = new DroneProjectileSystem(world, damage, { poolCapacity: 2 });
  const owner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3(1, 0, 0);
  assert.equal(system.spawn('a', owner, origin, direction), true);
  assert.equal(system.spawn('a', owner, origin, direction), true);
  assert.equal(system.spawn('a', owner, origin, direction), false);
  assert.equal(system.liveCount, 2);
  system.despawnOwner('a');
  assert.equal(system.liveCount, 0);
  system.dispose();
  damage.dispose();
  owner.geometry.dispose();
});

test('swept projectile collision catches a moving slime and damages only once', () => {
  const world = new CollisionWorld();
  const damage = new SlimeDamageSystem();
  const system = new DroneProjectileSystem(world, damage, {
    speedMetresPerSecond: 100,
  });
  const owner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const movingTarget = {
    slimeId: 'goop' as const,
    previousPosition: new THREE.Vector3(4, -4, 0),
    position: new THREE.Vector3(4, 4, 0),
    radiusMetres: 0.45,
  };
  let impacts = 0;
  system.events.on('slimeImpact', () => impacts += 1);

  system.spawn('drone', owner, new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
  system.update(0.08, [movingTarget]);
  system.update(0.08, [movingTarget]);
  assert.equal(damage.health[1].health, 80);
  assert.equal(impacts, 1);
  assert.equal(system.liveCount, 0);

  system.dispose();
  damage.dispose();
  owner.geometry.dispose();
});

test('projectiles ignore persistent bodies that have left the encounter room', () => {
  const world = new CollisionWorld();
  const damage = new SlimeDamageSystem();
  const system = new DroneProjectileSystem(world, damage, {
    speedMetresPerSecond: 100,
  });
  const owner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const outsideRoom = {
    ...target(8),
    eligible: false,
  };
  let impacts = 0;
  system.events.on('slimeImpact', () => impacts += 1);

  system.spawn('drone', owner, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
  system.update(0.1, [outsideRoom]);

  assert.equal(damage.health[0].health, 100);
  assert.equal(impacts, 0);
  assert.equal(system.liveCount, 1);

  system.dispose();
  damage.dispose();
  owner.geometry.dispose();
});

test('default projectile resolves close shots quickly but leaves far-range travel time', () => {
  const world = new CollisionWorld();
  const damage = new SlimeDamageSystem();
  const system = new DroneProjectileSystem(world, damage);
  const owner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

  assert.equal(DEFAULT_DRONE_PROJECTILE_CONFIG.speedMetresPerSecond, 150);
  assert.equal(DEFAULT_DRONE_PROJECTILE_CONFIG.radiusMetres, 0.16);
  assert.ok(DEFAULT_DRONE_PROJECTILE_CONFIG.maximumRangeMetres >= 90);
  system.spawn('far-drone', owner, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
  system.update(0.1, [target(75)]);
  assert.equal(damage.health[0].health, 100);
  assert.equal(system.liveCount, 1);
  system.update(0.4, [target(75)]);

  assert.equal(damage.health[0].health, 80);
  assert.equal(system.liveCount, 0);
  system.dispose();
  damage.dispose();
  owner.geometry.dispose();
});
