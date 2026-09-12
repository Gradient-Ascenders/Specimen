import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { SecurityDronePresentationResources } from '../src/render/hazards/SecurityDronePresentation.ts';
import { SecurityDroneCombatTarget } from '../src/combat/CombatTargetAdapters.ts';
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

test('flying eye rotates detection and projectile origins together while cover still blocks fire', () => {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem(), projectiles = new DroneProjectileSystem(world, damage);
  const drone = new SecurityDrone({ ...config(), forward: new THREE.Vector3(1, 0, 0),
    scanHalfAngleRadians: 1e-9, forwardAnchorMetres: 1.4 }, world, surfaces, projectiles);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(.2, 3, 3));
  const target = { slimeId: 'bob' as const, position: new THREE.Vector3(5, 0, 0) };
  try {
    cover.position.x = 3; world.register(cover);
    drone.update(.1, [target]); assert.equal(drone.readModel.state, 'scanning');
    world.unregister(cover);
    drone.update(.1, [target]); drone.update(.4, [target]); drone.update(.01, [target]);
    assert.equal(projectiles.liveCount, 1);
    const shot = projectiles.states.find(shot => shot.active)!;
    assert.ok(Math.abs(shot.position.x - 1.4) < 1e-6);
    assert.ok(Math.abs(shot.position.z) < 1e-6, 'muzzle follows the eye, not the unturned root');
  } finally {
    world.unregister(cover); cover.geometry.dispose();
    drone.dispose(); projectiles.dispose(); damage.dispose();
  }
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

for (const industrial of [false, true]) {
  test(`sentry presentation tracks firing direction (industrial: ${industrial})`, () => {
    const world = new CollisionWorld();
    const surfaces = new SurfaceRegistry();
    const damage = new SlimeDamageSystem();
    const projectiles = new DroneProjectileSystem(world, damage);
    const resources = new SecurityDronePresentationResources(undefined, industrial);
    const drone = new SecurityDrone(config(), world, surfaces, projectiles, resources);
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
    resources.dispose();
    projectiles.dispose();
    damage.dispose();
    assert.equal(drone.root.children.length, 0);
  });
}


test('opt-in Specimen combat adapter disables a real SecurityDrone, clears shots, removes collision, and resets in place', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const drone = new SecurityDrone(config(), world, surfaces, projectiles);
  const combat = new SecurityDroneCombatTarget({
    drone,
    healthUnits: 2,
  });

  try {
    assert.equal(world.colliderCount, 1);
    assert.equal(surfaces.registeredCount, 1);
    assert.equal(drone.presentation.root.visible, true);

    projectiles.spawn(
      drone.id,
      drone.collider,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    );
    assert.equal(projectiles.liveCount, 1);

    const result = combat.applyImpact({
      projectileId: 1,
      targetId: combat.id,
      kind: 'direct',
      chargeAmount: 1,
      fullyCharged: true,
      damageUnits: 2,
      point: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
    });

    assert.equal(result.destroyed, true);
    assert.equal(projectiles.liveCount, 0);
    assert.equal(drone.readModel.enabled, false);
    assert.equal(drone.presentation.root.visible, false);
    assert.equal(world.colliderCount, 0);
    assert.equal(surfaces.registeredCount, 0);

    combat.reset();

    assert.equal(combat.destroyed, false);
    assert.equal(drone.readModel.enabled, true);
    assert.equal(drone.presentation.root.visible, true);
    assert.equal(world.colliderCount, 1);
    assert.equal(surfaces.registeredCount, 1);
    assert.equal(projectiles.liveCount, 0);
  } finally {
    drone.dispose();
    projectiles.dispose();
    damage.dispose();
  }
});
