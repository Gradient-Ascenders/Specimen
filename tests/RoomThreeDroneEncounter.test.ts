import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
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

test('Room 3 constructs seven drones and resets one-to-one cable release', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.solubleTargetMeshes.map((mesh) => {
    const target = createAuthoredDissolveTarget(mesh, world, surfaces);
    assert.ok(target);
    return target;
  });
  const roomThreeCables = targets.filter(
    (target) => target.mesh.userData.authoringRole === 'ceiling-drone-soluble-support-cable',
  );
  assert.equal(roomThreeCables.length, 3);
  assert.ok(roomThreeCables.every(
    (target) =>
      target.id.endsWith('-acid-soluble-support-cable') &&
      target.mesh.userData.textureRole === 'soluble-cable' &&
      target.mesh.userData.authoringRole ===
        'ceiling-drone-soluble-support-cable',
  ));
  const supportsById = new Map(targets.map((target) => [target.id, target]));
  const bobSpawn = scene.copyRoomSpawnPosition(3, 'bob', new THREE.Vector3());
  const goopSpawn = scene.copyRoomSpawnPosition(3, 'goop', new THREE.Vector3());
  const bob = new KinematicBody({ world, surfaces, initialPosition: bobSpawn });
  const goop = new KinematicBody({ world, surfaces, initialPosition: goopSpawn });
  const baselineColliders = world.colliderCount;
  const baselineSurfaces = surfaces.registeredCount;
  const originalCableMaterials=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
  const originalHatchMaterials=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
  const encounter = new RoomThreeDroneEncounter({
    config: CULTIVATION_ROOM_THREE_DRONE_AUTHORING,
    supportsById,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    bobBody: bob,
    goopBody: goop,
    requestDeath: () => true,
    radiationSurface: scene.roomThree.radiationHazard,
    surfaceMaps: scene.coverArt.droneSurfaceMaps,
    presentationModels:scene.securityDroneModels,
    attachPresentation(root){
      root.traverse(o=>{if(o instanceof THREE.Mesh&&/^cultivation-room-3-roof-drone-[123]-replacement-cable$/.test(o.name))
        originalCableMaterials.set(o,o.material);
        if(o instanceof THREE.Mesh&&o.userData.authoringRole==='drone-replacement-hatch')originalHatchMaterials.set(o,o.material);
      });
      return scene.blenderArt.attachRuntimeOwners(root);
    },
  });
  scene.roomThree.root.add(encounter.root);
  assert.equal(originalCableMaterials.size,3);
  assert.equal(originalHatchMaterials.size,3);
  assert.ok([...originalHatchMaterials.keys()].every(o=>o.children.filter(c=>c.userData.blenderBatch).length>=3),
    'each original hatch owns its complete set of authored finish batches');
  const cableSkins=[...originalCableMaterials.keys()].map(owner=>{
    const skin=owner.children.find((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&o.userData.blenderBatch);
    assert.ok(skin,owner.name);assert.equal(skin.castShadow,owner.castShadow);
    assert.equal((owner.material as THREE.Material).visible,false);return skin;
  });
  let authoredGeometryDisposals=0;
  for(const skin of cableSkins)skin.geometry.addEventListener('dispose',()=>authoredGeometryDisposals++);

  assert.equal(encounter.ceilingDrones.length, 3);
  assert.equal(encounter.groundDrones.length, 4);
  assert.deepEqual(encounter.presentationResourceDiagnostics, {
    geometryCount: 26,
    materialCount: 4,
  });
  const presentationGeometries = new Set<THREE.BufferGeometry>();
  const presentationMaterials = new Set<THREE.Material>();
  const indicatorMaterials = new Set<THREE.Material>();
  for (const lifecycle of [
    ...encounter.ceilingDrones,
    ...encounter.groundDrones,
  ]) {
    indicatorMaterials.add(lifecycle.drone.frontIndicator.material);
    lifecycle.drone.presentation.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      presentationGeometries.add(object.geometry);
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) presentationMaterials.add(material);
    });
  }
  assert.equal(presentationGeometries.size, 26);
  assert.equal(presentationMaterials.size, 11);
  assert.equal(indicatorMaterials.size, 7);
  const borrowedGeometry=new Set<THREE.BufferGeometry>();
  for(const kind of [CULTIVATION_ROOM_THREE_DRONE_AUTHORING.ceilingDrones[0].drone,CULTIVATION_ROOM_THREE_DRONE_AUTHORING.groundDrones[0].drone])
    for(const role of ['armour','armourShadow','mechanism','barrel','mount','linkage'] as const)for(const distant of [false,true])
      borrowedGeometry.add(scene.securityDroneModels.geometry(kind,role,distant));
  let borrowedDisposals=0;
  for(const geometry of borrowedGeometry)geometry.addEventListener('dispose',()=>borrowedDisposals++);
  for (const lifecycle of [...encounter.ceilingDrones, ...encounter.groundDrones]) {
    const shell = lifecycle.drone.presentation.root.getObjectByName(`${lifecycle.drone.id}-armoured-shell`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    assert.ok(shell.material.map===scene.coverArt.droneSurfaceMaps.scuffMap,'the new armour borrows the existing wear map');
    assert.equal(shell.material.vertexColors,true);
    assert.equal(lifecycle.drone.frontIndicator.material.map, null);
  }
  let scuffMapDisposals = 0;
  scene.coverArt.droneSurfaceMaps.scuffMap.addEventListener('dispose', () => scuffMapDisposals++);
  assert.ok([
    ...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.ceilingDrones,
    ...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.groundDrones,
  ].every((entry) => entry.drone.detectionRangeMetres >= 90));
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
  for(const dt of [.01,.7,15,.8,1.2,.8]){
    encounter.update(dt,'goop',new THREE.Vector3(),{bob:false,goop:false});
    scene.root.updateWorldMatrix(true,true);
    for(const skin of cableSkins)assert.deepEqual(skin.matrixWorld.toArray(),skin.parent!.matrixWorld.toArray(),
      'the authored unit strut follows its original deployment owner');
  }

  support.reset();
  encounter.reset();
  assert.ok(encounter.ceilingDrones.every((drone) => drone.readModel.state === 'active'));
  assert.ok(encounter.groundDrones.every((drone) => drone.readModel.state === 'active'));
  assert.equal(encounter.projectiles.liveCount, 0);
  assert.ok(encounter.damage.health.every((health) => health.health === health.maximumHealth));

  encounter.dispose();
  assert.equal(borrowedDisposals,0,'encounter unload must retain scene-owned Blender buffers');
  for(const [owner,material]of originalCableMaterials)assert.ok(owner.material===material,'restore borrowed actor material before actor disposal');
  for(const [owner,material]of originalHatchMaterials)assert.ok(owner.material===material,'restore each hatch material once after detaching all its finish batches');
  assert.ok(cableSkins.every(skin=>skin.parent===null));
  assert.equal(authoredGeometryDisposals,0,'encounter disposal does not own authored buffers');
  assert.equal(scuffMapDisposals, 0, 'encounter must not dispose borrowed wear maps');
  assert.equal(world.colliderCount, baselineColliders);
  assert.equal(surfaces.registeredCount, baselineSurfaces);
  for (const target of targets) target.dispose();
  scene.dispose();
  assert.equal(borrowedDisposals,borrowedGeometry.size,'the scene releases the shared security buffers once');
  assert.equal(authoredGeometryDisposals,cableSkins.length,'the asset owner releases each prepared cable skin once');
  assert.equal(scuffMapDisposals, 1);
  world.clear();
  surfaces.clear();
});

test('split-room eligibility keeps Room 3 live without targeting the body left in Room 2', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
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
    presentationModels:scene.securityDroneModels,
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
