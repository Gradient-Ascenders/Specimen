import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { RoomThreeDroneEncounter } from '../src/hazards/RoomThreeDroneEncounter.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from '../src/levels/CultivationRoomThreeAuthoring.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

test('Room 3 constructs exactly seven authored drones and resets one-to-one rope release', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.solubleTargetMeshes.map((mesh) => {
    const target = createAuthoredDissolveTarget(mesh, world, surfaces);
    assert.ok(target);
    return target;
  });
  const supportsById = new Map(targets.map((target) => [target.id, target]));
  const bobSpawn = scene.copyRoomSpawnPosition(3, 'bob', new THREE.Vector3());
  const goopSpawn = scene.copyRoomSpawnPosition(3, 'goop', new THREE.Vector3());
  const bob = new KinematicBody({ world, surfaces, initialPosition: bobSpawn });
  const goop = new KinematicBody({ world, surfaces, initialPosition: goopSpawn });
  const baselineColliders = world.colliderCount;
  const baselineSurfaces = surfaces.registeredCount;
  const encounter = new RoomThreeDroneEncounter({
    config: CULTIVATION_ROOM_THREE_DRONE_AUTHORING,
    supportsById,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    bobBody: bob,
    goopBody: goop,
    requestDeath: () => true,
    radiationSurface: scene.roomThree.radiationHazard,
  });
  scene.roomThree.root.add(encounter.root);

  assert.equal(encounter.ceilingDrones.length, 3);
  assert.equal(encounter.groundDrones.length, 4);
  assert.equal(world.colliderCount, baselineColliders + 10);
  assert.equal(surfaces.registeredCount, baselineSurfaces + 10);
  for (const lifecycle of [...encounter.ceilingDrones, ...encounter.groundDrones]) {
    assert.equal(lifecycle.drone.collider.userData.soluble, false);
    assert.equal(lifecycle.drone.collider.userData.authoringRole, 'acid-resistant-drone');
  }

  const first = encounter.ceilingDrones[0];
  const support = supportsById.get(first.readModel.supportTargetId)!;
  support.advance(support.dissolveDurationSeconds);
  assert.equal(first.readModel.state, 'released');
  assert.ok(encounter.ceilingDrones.slice(1).every((drone) => drone.readModel.state === 'active'));

  support.reset();
  encounter.reset();
  assert.ok(encounter.ceilingDrones.every((drone) => drone.readModel.state === 'active'));
  assert.ok(encounter.groundDrones.every((drone) => drone.readModel.state === 'active'));
  assert.equal(encounter.projectiles.liveCount, 0);
  assert.ok(encounter.damage.health.every((health) => health.health === health.maximumHealth));

  encounter.dispose();
  assert.equal(world.colliderCount, baselineColliders);
  assert.equal(surfaces.registeredCount, baselineSurfaces);
  for (const target of targets) target.dispose();
  scene.dispose();
  world.clear();
  surfaces.clear();
});

test('split-room eligibility keeps Room 3 live without targeting the body left in Room 2', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.solubleTargetMeshes.map((mesh) => {
    const target = createAuthoredDissolveTarget(mesh, world, surfaces);
    assert.ok(target);
    return target;
  });
  const supportsById = new Map(targets.map((target) => [target.id, target]));
  const bob = new KinematicBody({
    world,
    surfaces,
    initialPosition: scene.copyRoomSpawnPosition(2, 'bob', new THREE.Vector3()),
  });
  const goop = new KinematicBody({
    world,
    surfaces,
    initialPosition: scene.copyRoomSpawnPosition(3, 'goop', new THREE.Vector3()),
  });
  const config = {
    ...CULTIVATION_ROOM_THREE_DRONE_AUTHORING,
    groundDrones: CULTIVATION_ROOM_THREE_DRONE_AUTHORING.groundDrones.map(
      (entry, index) => index === 0
        ? { ...entry, drone: { ...entry.drone, targetPolicy: 'both' as const } }
        : entry,
    ),
  };
  const encounter = new RoomThreeDroneEncounter({
    config,
    supportsById,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    bobBody: bob,
    goopBody: goop,
    requestDeath: () => true,
  });
  scene.roomThree.root.add(encounter.root);
  const testedDrone = encounter.groundDrones[0].drone;

  encounter.update(0.001, 'goop', new THREE.Vector3(), {
    bob: false,
    goop: false,
  });
  const origin = testedDrone.root.localToWorld(
    config.groundDrones[0].drone.detectionAnchor!.clone(),
  );
  const direction = new THREE.Vector3(
    testedDrone.readModel.scanDirection.x,
    testedDrone.readModel.scanDirection.y,
    testedDrone.readModel.scanDirection.z,
  );
  bob.teleport(origin.clone().addScaledVector(direction, 2));
  goop.teleport(origin.clone().addScaledVector(direction, 4));

  encounter.update(0.1, 'goop', new THREE.Vector3(), {
    bob: false,
    goop: true,
  });
  assert.equal(testedDrone.readModel.targetSlimeId, 'goop');
  assert.equal(testedDrone.readModel.state, 'warning');

  encounter.update(0.3, 'bob', new THREE.Vector3(), {
    bob: true,
    goop: false,
  });
  assert.equal(testedDrone.readModel.state, 'targetLost');
  assert.equal(testedDrone.readModel.targetSlimeId, undefined);

  encounter.dispose();
  for (const target of targets) target.dispose();
  scene.dispose();
  world.clear();
  surfaces.clear();
});
