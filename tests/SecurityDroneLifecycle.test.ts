import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { CeilingSecurityDrone, type CeilingSecurityDroneConfig } from '../src/hazards/CeilingSecurityDrone.ts';
import { DroneProjectileSystem } from '../src/hazards/DroneProjectileSystem.ts';
import { GroundSecurityDrone, type GroundSecurityDroneConfig } from '../src/hazards/GroundSecurityDrone.ts';
import { RadioactiveFloorHazard } from '../src/hazards/RadioactiveFloorHazard.ts';
import type { SecurityDroneConfig } from '../src/hazards/SecurityDrone.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';

function droneConfig(id: string, type: 'ceiling' | 'ground'): SecurityDroneConfig {
  return {
    id,
    type,
    initialPosition: new THREE.Vector3(0, type === 'ceiling' ? 5 : 0.5, 0),
    colliderSize: new THREE.Vector3(1, 1, 1),
    forward: new THREE.Vector3(0, 0, 1),
    scanAxis: new THREE.Vector3(0, 1, 0),
    scanHalfAngleRadians: 0.4,
    scanSpeedRadiansPerSecond: 0.4,
    detectionHalfAngleRadians: 0.3,
    detectionRangeMetres: 10,
    warningSeconds: 0.4,
    fireIntervalSeconds: 0.3,
    targetLossGraceSeconds: 0.3,
    cooldownSeconds: 1,
    muzzleAnchor: new THREE.Vector3(0, 0, 0.55),
    targetPolicy: 'both',
    initialScanPhase: 0.25,
  };
}

test('a reinstalled ceiling drone restores a soluble rope for repeated drop cycles', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const supportMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), new THREE.MeshStandardMaterial());
  supportMesh.name = 'test-rope';
  supportMesh.position.y = 7;
  world.register(supportMesh);
  surfaces.register(supportMesh);
  const support = new DissolveTarget({
    id: 'test-rope',
    mesh: supportMesh,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    dissolveDurationSeconds: 1,
    collisionDisableProgress: 0.7,
  });
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const config: CeilingSecurityDroneConfig = {
    drone: droneConfig('ceiling', 'ceiling'),
    supportTargetId: support.id,
    radioactiveImpactPosition: new THREE.Vector3(0, 0.5, 0),
    radioactiveImpactRotation: new THREE.Euler(Math.PI / 2, 0, 0),
    hatchPosition: new THREE.Vector3(0, 8, 0),
    fallDurationSeconds: 0.65,
    disabledDurationSeconds: 10,
    replacementWarningSeconds: 2,
    reinstallDurationSeconds: 1.75,
  };
  const lifecycle = new CeilingSecurityDrone(config, support, world, surfaces, projectiles);
  const activeColliderCount = world.colliderCount;
  let releaseCount = 0;
  let installedCount = 0;
  lifecycle.events.on('released', () => releaseCount += 1);
  lifecycle.events.on('installed', () => installedCount += 1);

  support.advance(1);
  const releasedColliderCount = world.colliderCount;
  assert.equal(lifecycle.readModel.state, 'released');
  assert.equal(lifecycle.drone.readModel.enabled, false);
  lifecycle.update(0.01, []);
  lifecycle.update(0.65, []);
  lifecycle.signalRadiationContact();
  assert.equal(lifecycle.readModel.state, 'disabled');
  lifecycle.update(8, []);
  assert.equal(lifecycle.readModel.state, 'replacementWarning');
  assert.equal(lifecycle.readModel.hatchOpen, true);
  assert.equal(world.colliderCount, releasedColliderCount + 1);
  lifecycle.update(2, []);
  assert.equal(lifecycle.readModel.state, 'reinstalling');
  lifecycle.update(1.75, []);
  assert.equal(lifecycle.readModel.state, 'active');
  assert.equal(lifecycle.drone.readModel.enabled, true);
  assert.equal(lifecycle.readModel.replacementCableVisible, false);
  assert.equal(support.completed, false);
  assert.equal(support.progress, 0);
  assert.equal(support.collisionEnabled, true);
  assert.equal(supportMesh.visible, true);
  assert.equal(world.colliderCount, activeColliderCount);
  lifecycle.update(0.1, []);
  assert.equal(lifecycle.readModel.state, 'active');
  assert.equal(releaseCount, 1);
  assert.equal(installedCount, 1);

  support.advance(1);
  assert.equal(lifecycle.readModel.state, 'released');
  assert.equal(support.completionCount, 2);
  lifecycle.update(0.01, []);
  lifecycle.update(0.65, []);
  lifecycle.signalRadiationContact();
  lifecycle.update(8, []);
  lifecycle.update(2, []);
  lifecycle.update(1.75, []);
  assert.equal(lifecycle.readModel.state, 'active');
  assert.equal(lifecycle.readModel.replacementCableVisible, false);
  assert.equal(support.completed, false);
  assert.equal(support.progress, 0);
  assert.equal(support.collisionEnabled, true);
  assert.equal(supportMesh.visible, true);
  assert.equal(releaseCount, 2);
  assert.equal(installedCount, 2);
  assert.equal(world.colliderCount, activeColliderCount);

  lifecycle.reset();
  assert.equal(lifecycle.readModel.state, 'active');
  assert.equal(lifecycle.readModel.replacementCableVisible, false);
  assert.equal(world.colliderCount, activeColliderCount);
  lifecycle.dispose();
  support.dispose();
  projectiles.dispose();
  damage.dispose();
  supportMesh.geometry.dispose();
  supportMesh.material.dispose();
  assert.equal(world.colliderCount, 0);
});

test('only active Bob making sustained rear contact can tip a ground drone', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8));
  floor.position.y = -0.1;
  floor.userData.surfaceTag = 'default';
  world.register(floor);
  surfaces.register(floor);
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const radiation = new RadioactiveFloorHazard({
    id: 'test-radiation',
    mesh: floor,
    lethalSlimeIds: ['bob'],
    requestRecovery: () => {},
  });
  const config: GroundSecurityDroneConfig = {
    drone: droneConfig('ground', 'ground'),
    rearPushCentreLocal: new THREE.Vector3(0, 0, -1),
    rearPushSize: new THREE.Vector3(1.4, 1.5, 1.2),
    pushIntentDotThreshold: 0.5,
    pushProgressPerSecond: 1.25,
    pushDecayPerSecond: 2,
    tippingDurationSeconds: 0.75,
    radioactiveFinalPosition: new THREE.Vector3(0, 0.5, 2.5),
    radioactiveFinalRotation: new THREE.Euler(Math.PI / 2, 0, 0),
  };
  const lifecycle = new GroundSecurityDrone(config, world, surfaces, projectiles);
  const bob = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(0, 0.46, -0.96),
    config: { reboundEnabled: false },
  });
  const intent = new THREE.Vector3(0, 0, 1);

  bob.update(1 / 60, intent);
  lifecycle.update(1 / 60, [], bob, 'goop', intent);
  assert.equal(lifecycle.readModel.pushProgress, 0);

  bob.teleport(new THREE.Vector3(0, 0.46, 0.96));
  for (let step = 0; step < 10; step += 1) {
    bob.update(1 / 60, new THREE.Vector3(0, 0, -1));
    lifecycle.update(1 / 60, [], bob, 'bob', new THREE.Vector3(0, 0, -1));
  }
  assert.equal(lifecycle.readModel.pushProgress, 0, 'frontal pushing must not progress');

  bob.teleport(new THREE.Vector3(0.96, 0.46, 0));
  for (let step = 0; step < 10; step += 1) {
    bob.update(1 / 60, new THREE.Vector3(-1, 0, 0));
    lifecycle.update(1 / 60, [], bob, 'bob', new THREE.Vector3(-1, 0, 0));
  }
  assert.equal(lifecycle.readModel.pushProgress, 0, 'side contact must not progress');

  bob.teleport(new THREE.Vector3(0, 0.46, -0.96));

  for (let step = 0; step < 60 && lifecycle.readModel.state !== 'tipping'; step += 1) {
    bob.update(1 / 60, intent);
    lifecycle.update(1 / 60, [], bob, 'bob', intent);
  }
  assert.equal(bob.lastContactCollider, lifecycle.drone.collider);
  assert.equal(lifecycle.readModel.state, 'tipping');
  assert.equal(
    radiation.intersectsWorldSphere(
      lifecycle.radiationTarget.position,
      lifecycle.radiationTarget.radiusMetres,
    ),
    true,
  );
  lifecycle.signalRadiationContact();
  lifecycle.update(0.75, [], bob, 'bob', intent);
  assert.equal(lifecycle.readModel.state, 'permanentlyDisabled');

  lifecycle.reset();
  assert.equal(lifecycle.readModel.state, 'active');
  assert.equal(lifecycle.readModel.pushProgress, 0);
  lifecycle.dispose();
  radiation.dispose();
  projectiles.dispose();
  damage.dispose();
  world.unregister(floor);
  surfaces.unregister(floor);
  floor.geometry.dispose();
});
