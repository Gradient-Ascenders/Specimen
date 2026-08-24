import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DroneProjectileSystem } from '../src/hazards/DroneProjectileSystem.ts';
import { SecurityDrone, type SecurityDroneConfig } from '../src/hazards/SecurityDrone.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';

function config(): SecurityDroneConfig {
  return {
    id: 'test-drone',
    type: 'ground',
    initialPosition: new THREE.Vector3(),
    colliderSize: new THREE.Vector3(1, 1, 1),
    forward: new THREE.Vector3(0, 0, 1),
    scanAxis: new THREE.Vector3(0, 1, 0),
    scanHalfAngleRadians: Math.PI / 6,
    scanSpeedRadiansPerSecond: 0.01,
    detectionHalfAngleRadians: Math.PI / 12,
    detectionRangeMetres: 10,
    warningSeconds: 0.4,
    fireIntervalSeconds: 0.3,
    targetLossGraceSeconds: 0.3,
    cooldownSeconds: 1,
    muzzleAnchor: new THREE.Vector3(0, 0, 0.55),
    detectionAnchor: new THREE.Vector3(0, 0, 0.55),
    targetPolicy: 'both',
    initialScanPhase: 0.25,
  };
}

test('cover blocks detection and warning always precedes projectile fire', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const drone = new SecurityDrone(config(), world, surfaces, projectiles);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2));
  cover.position.z = 2.5;
  world.register(cover);
  const target = { slimeId: 'bob' as const, position: new THREE.Vector3(0, 0, 5) };
  const order: string[] = [];
  drone.events.on('warning', () => order.push('warning'));
  drone.events.on('fired', () => order.push('fired'));

  drone.update(0.1, [target]);
  assert.equal(drone.readModel.state, 'scanning');
  world.unregister(cover);
  drone.update(0.1, [target]);
  assert.equal(drone.readModel.state, 'warning');
  drone.update(0.4, [target]);
  assert.deepEqual(order, ['warning']);
  drone.update(0.01, [target]);
  assert.deepEqual(order, ['warning', 'fired']);
  assert.equal(projectiles.liveCount, 1);
  target.position.set(5, 0, 0);
  drone.update(0.3, [target]);
  assert.equal(drone.readModel.state, 'targetLost');

  drone.dispose();
  projectiles.dispose();
  damage.dispose();
  cover.geometry.dispose();
  assert.equal(world.colliderCount, 0);
});

test('typed target policy keeps inactive eligible bodies targetable', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const drone = new SecurityDrone({ ...config(), targetPolicy: 'goop-only' }, world, surfaces, projectiles);
  drone.update(0.1, [
    { slimeId: 'bob', position: new THREE.Vector3(0, 0, 3) },
    { slimeId: 'goop', position: new THREE.Vector3(0, 0, 5) },
  ]);
  assert.equal(drone.readModel.targetSlimeId, 'goop');
  drone.dispose();
  projectiles.dispose();
  damage.dispose();
});

test('physical-room eligibility prevents acquisition and invalidates a tracked target', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const drone = new SecurityDrone(config(), world, surfaces, projectiles);
  const target = {
    slimeId: 'bob' as const,
    position: new THREE.Vector3(0, 0, 5),
    eligible: false,
  };

  drone.update(0.1, [target]);
  assert.equal(drone.readModel.state, 'scanning');
  assert.equal(drone.readModel.targetSlimeId, undefined);

  target.eligible = true;
  drone.update(0.1, [target]);
  assert.equal(drone.readModel.state, 'warning');
  assert.equal(drone.readModel.targetSlimeId, 'bob');

  target.eligible = false;
  drone.update(0.3, [target]);
  assert.equal(drone.readModel.state, 'targetLost');
  assert.equal(drone.readModel.targetSlimeId, undefined);

  drone.dispose();
  projectiles.dispose();
  damage.dispose();
});

test('range and cone boundaries are inclusive without admitting outside targets', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const boundaryConfig = {
    ...config(),
    scanSpeedRadiansPerSecond: 1e-12,
    detectionAnchor: new THREE.Vector3(),
    muzzleAnchor: new THREE.Vector3(),
  };
  const angle = boundaryConfig.detectionHalfAngleRadians;
  const atBoundary = new THREE.Vector3(Math.sin(angle) * 10, 0, Math.cos(angle) * 10);
  const drone = new SecurityDrone(boundaryConfig, world, surfaces, projectiles);

  drone.update(1 / 60, [{ slimeId: 'bob', position: atBoundary }]);
  assert.equal(drone.readModel.state, 'warning');
  drone.reset();
  drone.update(1 / 60, [{
    slimeId: 'bob',
    position: atBoundary.clone().multiplyScalar(1.001),
  }]);
  assert.equal(drone.readModel.state, 'scanning');
  drone.reset();
  drone.update(1 / 60, [{
    slimeId: 'bob',
    position: new THREE.Vector3(
      Math.sin(angle + 0.001) * 9,
      0,
      Math.cos(angle + 0.001) * 9,
    ),
  }]);
  assert.equal(drone.readModel.state, 'scanning');

  drone.dispose();
  projectiles.dispose();
  damage.dispose();
});

test('tracking cannot ratchet a target beyond the authored scan envelope', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const drone = new SecurityDrone(config(), world, surfaces, projectiles);
  const target = { slimeId: 'bob' as const, position: new THREE.Vector3(0, 0, 5) };
  drone.update(0.1, [target]);

  for (const degrees of [10, 20, 30, 40, 50, 60, 70]) {
    const radians = THREE.MathUtils.degToRad(degrees);
    target.position.set(Math.sin(radians) * 5, 0, Math.cos(radians) * 5);
    drone.update(0.1, [target]);
  }
  assert.equal(drone.readModel.state, 'targetLost');

  drone.dispose();
  projectiles.dispose();
  damage.dispose();
});

test('laboratory sentry presentation tracks the same direction used to fire', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const drone = new SecurityDrone(config(), world, surfaces, projectiles);
  const target = {
    slimeId: 'bob' as const,
    position: new THREE.Vector3(1, 0, 5),
  };

  drone.update(0.1, [target]);
  drone.root.updateWorldMatrix(true, true);
  const headPosition = drone.presentation.aimHead.getWorldPosition(new THREE.Vector3());
  const eyeDirection = drone.frontIndicator
    .getWorldPosition(new THREE.Vector3())
    .sub(headPosition)
    .normalize();
  const trackedDirection = new THREE.Vector3(
    drone.readModel.scanDirection.x,
    drone.readModel.scanDirection.y,
    drone.readModel.scanDirection.z,
  ).normalize();
  const presentationNames: string[] = [];
  drone.presentation.root.traverse((object) => presentationNames.push(object.name));

  assert.equal(drone.collider.material.visible, false);
  assert.ok(presentationNames.some((name) => name.endsWith('-armoured-shell')));
  assert.ok(presentationNames.some((name) => name.endsWith('-left-barrel')));
  assert.ok(presentationNames.some((name) => name.endsWith('-right-barrel')));
  assert.ok(eyeDirection.dot(trackedDirection) > 0.999);

  drone.dispose();
  projectiles.dispose();
  damage.dispose();
  assert.equal(drone.root.children.length, 0);
});
