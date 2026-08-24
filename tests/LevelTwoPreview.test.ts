import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import type { LaserHazard } from '../src/hazards/LaserHazard.ts';
import {
  CULTIVATION_ROOM_OBJECTIVES,
  LEVEL_TWO_PASSAGE_LENGTH_METRES,
  LEVEL_TWO_PREVIEW_WORLD_OFFSET_X,
  LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z,
  LEVEL_TWO_ROOM_THREE_OFFSET_Z,
  LEVEL_TWO_ROOM_TWO_OFFSET_Z,
  LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z,
  LevelTwoPreviewScene,
} from '../src/levels/LevelTwoPreviewScene.ts';
import {
  advanceLevelTwoPreviewProgression,
  createLevelTwoPreviewProgression,
} from '../src/levels/LevelTwoPreviewProgression.ts';
import { CollisionHit, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const createScene = (): LevelTwoPreviewScene =>
  new LevelTwoPreviewScene(() => {});

const findCollider = (
  scene: LevelTwoPreviewScene,
  name: string,
): THREE.Mesh => {
  const mesh = scene.collisionMeshes.find((candidate) => candidate.name === name);
  assert.ok(mesh, `Missing collider ${name}`);
  return mesh;
};

test('Goop reaching Room 2 early does not advance Bob or the shared objective', () => {
  const initial = createLevelTwoPreviewProgression(1);
  const goopEnteredEarly = advanceLevelTwoPreviewProgression(initial, {
    bob: 1,
    goop: 2,
  });

  assert.equal(goopEnteredEarly.roomId, 1);
  assert.deepEqual(goopEnteredEarly.recoveryRoomIds, {
    bob: 1,
    goop: 2,
  });

  const bobCompletedRoomOne = advanceLevelTwoPreviewProgression(
    goopEnteredEarly,
    { bob: 2, goop: 2 },
  );
  assert.equal(bobCompletedRoomOne.roomId, 2);
  assert.deepEqual(bobCompletedRoomOne.recoveryRoomIds, {
    bob: 2,
    goop: 2,
  });
});

test('Room 3 remains split until Bob and Goop reach their own entrances', () => {
  const roomTwo = createLevelTwoPreviewProgression(2);
  const bobEnteredFirst = advanceLevelTwoPreviewProgression(roomTwo, {
    bob: 3,
    goop: 2,
  });

  assert.equal(bobEnteredFirst.roomId, 2);
  assert.equal(bobEnteredFirst.bobEnteredRoomThree, true);
  assert.equal(bobEnteredFirst.goopEnteredRoomThree, false);
  assert.deepEqual(bobEnteredFirst.recoveryRoomIds, {
    bob: 3,
    goop: 2,
  });

  const bothEntered = advanceLevelTwoPreviewProgression(bobEnteredFirst, {
    bob: 3,
    goop: 3,
  });
  assert.equal(bothEntered.roomId, 3);
  assert.equal(bothEntered.bobEnteredRoomThree, true);
  assert.equal(bothEntered.goopEnteredRoomThree, true);
  assert.deepEqual(bothEntered.recoveryRoomIds, {
    bob: 3,
    goop: 3,
  });
});

test('Level 2 preview composes three large connected rooms with unique colliders', () => {
  const scene = createScene();
  const names = scene.collisionMeshes.map((mesh) => mesh.name);

  assert.equal(new Set(names).size, names.length);
  assert.equal(scene.root.position.x, LEVEL_TWO_PREVIEW_WORLD_OFFSET_X);
  assert.equal(scene.roomTwo.root.position.z, LEVEL_TWO_ROOM_TWO_OFFSET_Z);
  assert.equal(scene.roomThree.root.position.z, LEVEL_TWO_ROOM_THREE_OFFSET_Z);
  assert.equal(LEVEL_TWO_ROOM_TWO_OFFSET_Z, 78);
  assert.equal(LEVEL_TWO_ROOM_THREE_OFFSET_Z, 151);

  assert.deepEqual(
    findCollider(scene, 'cultivation-room-1-west-wall').userData.sizeMetres,
    [0.4, 20, 50],
  );
  assert.deepEqual(
    findCollider(scene, 'cultivation-room-2-west-wall').userData.sizeMetres,
    [0.4, 24, 45],
  );
  assert.deepEqual(
    findCollider(scene, 'cultivation-room-3-west-wall').userData.sizeMetres,
    [0.4, 30, 72],
  );
  assert.ok(names.includes('cultivation-room-2-final-vent-sticky-approach'));
  assert.ok(names.includes('cultivation-room-2-to-3-bob-air-duct-ceiling'));
  assert.ok(names.includes('cultivation-room-3-final-safe-floor'));
  assert.ok(names.includes('cultivation-room-1-to-2-lab-passage-floor'));

  scene.dispose();
});

test('Room 1 and Room 2 traversal platforms begin suspended, not pre-solved', () => {
  const scene = createScene();

  assert.equal(scene.roomOne.platformDrops.length, 3);
  for (const drop of scene.roomOne.platformDrops) {
    assert.equal(drop.state, 'suspended');
    assert.equal(drop.mesh.userData.previewState, 'suspended');
    assert.deepEqual(drop.mesh.position.toArray(), drop.mesh.userData.suspendedPosition);
    assert.notDeepEqual(drop.mesh.position.toArray(), drop.mesh.userData.landingPosition);
    assert.ok(drop.mesh.position.y >= 12.5);
  }

  assert.equal(scene.roomTwo.blockDrops.length, 3);
  for (const drop of scene.roomTwo.blockDrops) {
    assert.equal(drop.state, 'suspended');
    assert.deepEqual(drop.mesh.position.toArray(), drop.mesh.userData.suspendedPosition);
    assert.notDeepEqual(drop.mesh.position.toArray(), drop.mesh.userData.landingPosition);
    assert.ok(drop.mesh.position.y >= 19.5);
  }

  scene.dispose();
});

test('dissolving supports deterministically lands traversal platforms and reset restores them', () => {
  const scene = createScene();
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.solubleTargetMeshes.map((mesh) => {
    const target = createAuthoredDissolveTarget(mesh, world, surfaces);
    assert.ok(target);
    return target;
  });
  scene.bindDissolveTargets(targets);

  const roomOneDrop = scene.roomOne.platformDrops[0];
  const roomOneTarget = targets.find(
    (target) => target.id === roomOneDrop.solubleTargetId,
  );
  assert.ok(roomOneTarget);
  roomOneTarget.advance(roomOneTarget.dissolveDurationSeconds);
  assert.equal(roomOneDrop.state, 'falling');
  scene.update(
    1,
    1,
    [],
  );
  assert.equal(roomOneDrop.state, 'landed');
  assert.deepEqual(roomOneDrop.mesh.position.toArray(), roomOneDrop.mesh.userData.landingPosition);

  const roomTwoDrop = scene.roomTwo.blockDrops[0];
  const roomTwoTarget = targets.find(
    (target) => target.id === roomTwoDrop.solubleTargetId,
  );
  assert.ok(roomTwoTarget);
  roomTwoTarget.advance(roomTwoTarget.dissolveDurationSeconds);
  scene.update(
    1,
    2,
    [],
  );
  assert.equal(roomTwoDrop.state, 'landed');
  assert.deepEqual(roomTwoDrop.mesh.position.toArray(), roomTwoDrop.mesh.userData.landingPosition);

  for (const target of targets) target.reset();
  scene.reset();
  assert.equal(roomOneDrop.state, 'suspended');
  assert.equal(roomTwoDrop.state, 'suspended');
  assert.deepEqual(roomOneDrop.mesh.position.toArray(), roomOneDrop.mesh.userData.suspendedPosition);
  assert.deepEqual(roomTwoDrop.mesh.position.toArray(), roomTwoDrop.mesh.userData.suspendedPosition);

  for (const target of targets) target.dispose();
  scene.dispose();
});

test('Level 2 preview exposes explicit radiation and soluble-support metadata', () => {
  const scene = createScene();
  const radiation = scene.collisionMeshes.filter(
    (mesh) => mesh.userData.hazardRole === 'radioactive',
  );

  assert.equal(radiation.length, 3);
  for (const floor of radiation) {
    assert.equal(floor.userData.hazardPolicy, 'bob-lethal-goop-immune');
    assert.equal(floor.userData.textureRole, 'acid-floor');
  }

  assert.equal(scene.solubleTargetMeshes.length, 9);
  assert.equal(
    scene.roomOne.solubleTargetMeshes.every(
      (target) => target.userData.releaseMode === 'fall-to-radiation',
    ),
    true,
  );
  assert.equal(
    scene.roomTwo.solubleTargetMeshes.every(
      (target) => target.userData.releaseMode === 'rope-limited-elevated-drop',
    ),
    true,
  );
  assert.equal(
    scene.roomThree.solubleTargetMeshes.every(
      (target) =>
        target.userData.releaseMode === 'temporary-roof-drone-disable' &&
        target.userData.replacementDelaySeconds === 10,
    ),
    true,
  );

  scene.dispose();
});

test('Room 2 has a visible safe tiled landing between the acid and far exits', () => {
  const scene = createScene();
  const radiation = findCollider(scene, 'cultivation-room-2-radioactive-floor');
  const safeTiles = findCollider(scene, 'cultivation-room-2-door-side-safe-tiles');

  assert.deepEqual(radiation.userData.sizeMetres, [37.6, 0.3, 30]);
  assert.deepEqual(safeTiles.userData.sizeMetres, [37.6, 0.4, 7]);
  assert.equal(safeTiles.userData.safeZoneRole, 'far-door-landing');
  assert.equal(radiation.position.z + 15, 38);
  assert.equal(safeTiles.position.z - 3.5, 38);
  assert.equal(safeTiles.position.z + 3.5, 45);

  scene.dispose();
});

test('laboratory passages create paced, enclosed transitions between puzzle rooms', () => {
  const scene = createScene();
  const passages = [
    scene.roomOneToTwoPassage,
    scene.roomTwoToThreeGoopPassage,
  ];

  assert.equal(LEVEL_TWO_PASSAGE_LENGTH_METRES, 28);
  assert.equal(
    scene.roomOneToTwoPassage.root.position.z,
    LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z,
  );
  assert.equal(
    scene.roomTwoToThreeGoopPassage.root.position.z,
    LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z,
  );
  assert.deepEqual(scene.roomTwoToThreeBobAirDuct.root.position.toArray(), [
    8,
    18.8,
    LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z,
  ]);

  for (const passage of passages) {
    assert.equal(passage.root.userData.passageRole, 'laboratory-transition');
    assert.equal(passage.collisionMeshes.length, 12);
    assert.equal(passage.doors.length, 2);
    assert.ok(
      passage.collisionMeshes.some((mesh) => mesh.name.endsWith('-floor')),
    );
    assert.ok(
      passage.collisionMeshes.some((mesh) => mesh.name.endsWith('-ceiling')),
    );
  }

  assert.equal(
    scene.roomTwoToThreeBobAirDuct.root.userData.transitionRole,
    'ventilation-air-duct',
  );
  assert.equal(scene.roomTwoToThreeBobAirDuct.root.userData.routeOwner, 'bob');
  assert.deepEqual(
    scene.roomTwoToThreeBobAirDuct.root.userData.innerSizeMetres,
    [2, 2.1],
  );
  assert.equal(scene.roomTwoToThreeBobAirDuct.collisionMeshes.length, 5);
  assert.equal(
    scene.roomTwoToThreeBobAirDuct.collisionMeshes.filter(
      (mesh) => mesh.userData.textureRole === 'air-duct-metal',
    ).length,
    4,
  );

  const worldPosition = new THREE.Vector3(
    LEVEL_TWO_PREVIEW_WORLD_OFFSET_X,
    1,
    LEVEL_TWO_ROOM_ONE_TO_TWO_PASSAGE_START_Z + 14,
  );
  assert.equal(scene.resolveRoomId(worldPosition), 1);
  worldPosition.z = LEVEL_TWO_ROOM_TWO_OFFSET_Z + 2;
  assert.equal(scene.resolveRoomId(worldPosition), 2);
  worldPosition.z = LEVEL_TWO_ROOM_TWO_TO_THREE_PASSAGE_START_Z + 14;
  assert.equal(scene.resolveRoomId(worldPosition), 2);
  worldPosition.z = LEVEL_TWO_ROOM_THREE_OFFSET_Z + 2;
  assert.equal(scene.resolveRoomId(worldPosition), 3);

  scene.dispose();
});

test('passage shutters use narrowed openings and expose truthful lock lights', () => {
  const scene = createScene();
  const passages = [
    scene.roomOneToTwoPassage,
    scene.roomTwoToThreeGoopPassage,
  ];
  const doors = passages.flatMap((passage) => passage.doors);

  assert.equal(doors.length, 4);
  assert.equal(
    doors.filter((door) => door.locked).length,
    1,
  );
  assert.equal(
    scene.roomTwoToThreeGoopPassage.entryDoor.statusLight.userData.lockState,
    'locked-red',
  );
  assert.equal(
    scene.roomTwoToThreeGoopPassage.entryDoor.statusLight.material.color.getHex(),
    0xff334d,
  );

  for (const door of doors) {
    assert.equal(door.state, 'closed');
    assert.equal(door.openProgress, 0);
    assert.ok(scene.collisionMeshes.includes(door.collisionMesh));
    if (door === scene.roomTwoToThreeGoopPassage.entryDoor) continue;
    assert.equal(door.statusLight.userData.lockState, 'unlocked-green');
    assert.equal(door.statusLight.material.color.getHex(), 0x35e874);
  }

  assert.deepEqual(
    scene.roomOneToTwoPassage.entryDoor.collisionMesh.userData.sizeMetres,
    [4, 4.6, 0.3],
  );
  scene.dispose();
});

test('Room 2 sticky approach stops below the open Bob air-duct aperture', () => {
  const scene = createScene();
  const stickyApproach = findCollider(
    scene,
    'cultivation-room-2-final-vent-sticky-approach',
  );
  const stickyEntryFloor = findCollider(
    scene,
    'cultivation-room-2-to-3-bob-air-duct-sticky-entry-floor',
  );

  assert.deepEqual(stickyApproach.userData.sizeMetres, [2, 3, 0.18]);
  assert.deepEqual(stickyApproach.position.toArray(), [8, 17.3, 44.72]);
  assert.equal(stickyApproach.position.y + 1.5, 18.8);
  assert.equal(stickyEntryFloor.userData.textureRole, 'sticky-vent-tile');
  assert.deepEqual(stickyEntryFloor.userData.sizeMetres, [2, 0.24, 1.5]);

  for (const roomId of [2, 3]) {
    for (const side of ['west', 'east']) {
      assert.deepEqual(
        findCollider(
          scene,
          `cultivation-room-${roomId}-bob-vent-${side}-jamb`,
        ).userData.sizeMetres,
        [0.6, 2.1, 0.4],
      );
    }
  }

  const world = new CollisionWorld();
  const hit = new CollisionHit();
  world.registerAll(scene.collisionMeshes);
  const apertureCentre = new THREE.Vector3(
    8,
    19.85,
    LEVEL_TWO_ROOM_TWO_OFFSET_Z + 44,
  ).add(scene.root.position);
  assert.equal(
    world.sweepSphere(
      apertureCentre,
      new THREE.Vector3(0, 0, 2),
      0.45,
      hit,
    ),
    false,
    `Room 2 Bob vent is blocked by ${hit.object?.name ?? 'unknown geometry'}`,
  );

  scene.dispose();
});

test('unlocked passage shutters raise near either slime and lower once clear', () => {
  const scene = createScene();
  const door = scene.roomOneToTwoPassage.entryDoor;
  const closedY = door.collisionMesh.position.y;
  const bobPosition = new THREE.Vector3(0, 0.66, -1);
  door.root.localToWorld(bobPosition);
  const bob = {
    id: 'bob' as const,
    position: bobPosition,
    radiusMetres: 0.45,
  };
  const goop = {
    id: 'goop' as const,
    position: bobPosition,
    radiusMetres: 0.45,
  };

  scene.update(1, 1, [bob, goop]);
  assert.equal(door.state, 'open');
  assert.equal(door.openProgress, 1);
  assert.ok(door.collisionMesh.position.y > closedY + 4);

  scene.update(1, 1, [goop]);
  assert.equal(door.state, 'open');
  assert.equal(door.openProgress, 1);

  scene.update(
    1,
    1,
    [],
  );
  assert.equal(door.state, 'closed');
  assert.equal(door.openProgress, 0);
  assert.equal(door.collisionMesh.position.y, closedY);

  scene.dispose();
});

test('Room 2 button unlocks Goop shutter only while Bob remains attached', () => {
  const scene = createScene();
  const door = scene.roomTwoToThreeGoopPassage.entryDoor;
  const goopPosition = new THREE.Vector3(0, 0.66, -1);
  door.root.localToWorld(goopPosition);
  const goop = {
    id: 'goop' as const,
    position: goopPosition,
    radiusMetres: 0.45,
  };

  scene.update(1, 2, [goop]);
  assert.equal(door.locked, true);
  assert.equal(door.state, 'closed');
  assert.equal(door.statusLight.userData.lockState, 'locked-red');

  const bobPosition = scene.roomTwo.wallButton.getWorldPosition(
    new THREE.Vector3(),
  );
  const bob = {
    id: 'bob' as const,
    position: bobPosition,
    radiusMetres: 0.45,
    attached: true,
    supportCollider: scene.roomTwo.wallButton,
  };
  scene.update(1, 2, [bob, goop]);
  assert.equal(scene.roomTwo.wallButton.userData.pressed, true);
  assert.equal(door.locked, false);
  assert.equal(door.state, 'open');
  assert.equal(door.statusLight.userData.lockState, 'unlocked-green');

  scene.update(1, 2, [goop]);
  assert.equal(scene.roomTwo.wallButton.userData.pressed, false);
  assert.equal(door.locked, true);
  assert.equal(door.state, 'closed');
  assert.equal(door.statusLight.userData.lockState, 'locked-red');

  scene.reset();
  assert.equal(door.locked, true);
  assert.equal(door.state, 'closed');
  assert.equal(door.openProgress, 0);

  scene.dispose();
});

test('Level 2 room spawns preserve separate Bob and Goop entry positions', () => {
  const scene = createScene();
  const bobRoomOne = scene.copyRoomSpawnPosition(1, 'bob', new THREE.Vector3());
  const goopRoomOne = scene.copyRoomSpawnPosition(1, 'goop', new THREE.Vector3());
  const bobRoomThree = scene.copyRoomSpawnPosition(3, 'bob', new THREE.Vector3());
  const goopRoomThree = scene.copyRoomSpawnPosition(3, 'goop', new THREE.Vector3());

  assert.equal(bobRoomOne.x, LEVEL_TWO_PREVIEW_WORLD_OFFSET_X - 11);
  assert.equal(goopRoomOne.x, LEVEL_TWO_PREVIEW_WORLD_OFFSET_X - 9);
  assert.equal(bobRoomThree.z, LEVEL_TWO_ROOM_THREE_OFFSET_Z + 2.8);
  assert.equal(goopRoomThree.z, LEVEL_TWO_ROOM_THREE_OFFSET_Z + 2.8);
  assert.ok(bobRoomThree.y > goopRoomThree.y + 18);

  scene.dispose();
});

test('all authored Level 2 debug spawns have lateral and overhead clearance', () => {
  const scene = createScene();
  const world = new CollisionWorld();
  const hit = new CollisionHit();
  const displacement = new THREE.Vector3();
  world.registerAll(scene.collisionMeshes);

  for (const roomId of [1, 2, 3] as const) {
    for (const slimeId of ['bob', 'goop'] as const) {
      const spawn = scene.copyRoomSpawnPosition(
        roomId,
        slimeId,
        new THREE.Vector3(),
      );
      for (const direction of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [0, 1, 0],
      ] as const) {
        displacement.set(...direction).multiplyScalar(0.02);
        const blocked = world.sweepSphere(spawn, displacement, 0.45, hit);
        assert.equal(
          blocked && hit.fraction <= 1e-5,
          false,
          `Level 2 Room ${roomId} ${slimeId} spawn starts obstructed`,
        );
      }
    }
  }

  scene.dispose();
});

test('Room 2 and Room 3 lasers are authored directly against their sticky panels', () => {
  const scene = createScene();
  const pairs: ReadonlyArray<readonly [LaserHazard, THREE.Mesh]> = [
    [scene.roomTwo.lasers.hazards[0], findCollider(scene, 'cultivation-room-2-sticky-route-b')],
    [scene.roomTwo.lasers.hazards[1], findCollider(scene, 'cultivation-room-2-sticky-route-c')],
    [scene.roomTwo.lasers.hazards[2], findCollider(scene, 'cultivation-room-2-sticky-route-e')],
    [scene.roomThree.lasers.hazards[0], findCollider(scene, 'cultivation-room-3-entry-sticky-transfer')],
    [scene.roomThree.lasers.hazards[1], findCollider(scene, 'cultivation-room-3-central-sticky-transfer')],
    [scene.roomThree.lasers.hazards[2], findCollider(scene, 'cultivation-room-3-high-sticky-transfer')],
  ];

  for (const [laser, panel] of pairs) assertLaserAgainstPanel(laser, panel);

  const groundDrones = scene.collisionMeshes.filter(
    (mesh) => mesh.userData.droneType === 'ground-security',
  );
  assert.equal(groundDrones.length, 0, 'Issue #96 runtime replaces all ground placeholders');
  assert.deepEqual(CULTIVATION_ROOM_OBJECTIVES, {
    1: 'Help Bob reach Room 2',
    2: 'Get Bob and Goop into Room 3',
    3: 'Disable four drones and bring both slimes to their exits',
  });

  scene.dispose();
});

test('Room 2 and Room 3 lasers report the struck persistent slime', () => {
  const failures: Array<{
    readonly roomId: 1 | 2 | 3;
    readonly hazardId: string;
    readonly slimeId?: 'bob' | 'goop';
  }> = [];
  const scene = new LevelTwoPreviewScene((failure) => failures.push(failure));

  const roomTwoLaser = scene.roomTwo.lasers.hazards[0];
  const roomTwoContact = new THREE.Vector3(
    roomTwoLaser.start.x,
    roomTwoLaser.start.y,
    roomTwoLaser.start.z,
  );
  scene.roomTwo.root.localToWorld(roomTwoContact);
  const inactiveBob = {
    id: 'bob' as const,
    position: roomTwoContact,
    radiusMetres: 0.45,
  };
  const activeGoop = {
    id: 'goop' as const,
    position: scene.copyRoomSpawnPosition(2, 'goop', new THREE.Vector3()),
    radiusMetres: 0.45,
  };
  scene.update(
    1 / 60,
    2,
    [activeGoop, inactiveBob],
  );
  assert.equal(scene.roomTwo.lasers.lastFailureTargetId, 'bob');
  assert.deepEqual(failures, [
    {
      roomId: 2,
      hazardId: 'cultivation-room-2-laser-1-panel-b-crossbar',
      slimeId: 'bob',
    },
  ]);

  scene.reset();
  const roomThreeLaser = scene.roomThree.lasers.hazards[0];
  const roomThreeContact = new THREE.Vector3(
    roomThreeLaser.start.x,
    roomThreeLaser.start.y,
    roomThreeLaser.start.z,
  );
  scene.roomThree.root.localToWorld(roomThreeContact);
  const bob = {
    id: 'bob' as const,
    position: roomThreeContact,
    radiusMetres: 0.45,
  };
  scene.update(
    1 / 60,
    3,
    [bob],
  );
  assert.equal(scene.roomThree.lasers.lastFailureTargetId, 'bob');
  assert.deepEqual(failures[1], {
    roomId: 3,
    hazardId: 'cultivation-room-3-entry-sticky-laser',
    slimeId: 'bob',
  });

  scene.dispose();
});

test('split occupants keep Room 2 and Room 3 simulation active together', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const roomTwoLaser = scene.roomTwo.lasers.hazards[0];
  const roomThreeLaser = scene.roomThree.lasers.hazards[0];
  const bobRoomTwo = new THREE.Vector3(
    roomTwoLaser.start.x,
    roomTwoLaser.start.y,
    roomTwoLaser.start.z,
  );
  const goopRoomThree = new THREE.Vector3(
    roomThreeLaser.start.x,
    roomThreeLaser.start.y,
    roomThreeLaser.start.z,
  );
  scene.roomTwo.root.localToWorld(bobRoomTwo);
  scene.roomThree.root.localToWorld(goopRoomThree);

  scene.update(1 / 60, 2, [
    { id: 'bob', position: bobRoomTwo, radiusMetres: 0.45 },
    { id: 'goop', position: goopRoomThree, radiusMetres: 0.45 },
  ]);

  assert.equal(scene.resolveRoomId(bobRoomTwo), 2);
  assert.equal(scene.resolveRoomId(goopRoomThree), 3);
  assert.equal(scene.roomTwo.lasers.lastFailureTargetId, 'bob');
  assert.equal(scene.roomThree.lasers.lastFailureTargetId, 'goop');

  scene.dispose();
});

test('radioactive floors kill Bob, latch contact, and leave Goop immune', () => {
  const failures: Array<{
    readonly roomId: 1 | 2 | 3;
    readonly hazardId: string;
    readonly slimeId?: 'bob' | 'goop';
  }> = [];
  const scene = new LevelTwoPreviewScene((failure) => failures.push(failure));
  // The 4 cm clearance mirrors the controller's skin width while grounded.
  const acidContact = new THREE.Vector3(0, 0.49, 20);
  scene.roomOne.root.localToWorld(acidContact);
  const bob = { id: 'bob' as const, position: acidContact, radiusMetres: 0.45 };
  const goop = { id: 'goop' as const, position: acidContact, radiusMetres: 0.45 };

  scene.update(1 / 60, 1, [bob, goop]);
  scene.update(1 / 60, 1, [bob, goop]);
  assert.deepEqual(failures, [
    {
      roomId: 1,
      hazardId: 'cultivation-room-1-radioactive-floor',
      slimeId: 'bob',
    },
  ]);

  scene.reset();
  scene.update(1 / 60, 1, [goop]);
  assert.equal(failures.length, 1);

  scene.dispose();
});

function assertLaserAgainstPanel(laser: LaserHazard, panel: THREE.Mesh): void {
  const [sizeX, sizeY, sizeZ] = panel.userData.sizeMetres as [number, number, number];
  const sizes = [sizeX, sizeY, sizeZ] as const;
  const panelPosition = panel.position;
  const thinnestAxis = sizes.indexOf(Math.min(...sizes));
  const endpoints = [laser.start, laser.end];

  for (const endpoint of endpoints) {
    const values = [endpoint.x, endpoint.y, endpoint.z] as const;
    const centres = [panelPosition.x, panelPosition.y, panelPosition.z] as const;
    for (let axis = 0; axis < 3; axis += 1) {
      const tolerance = axis === thinnestAxis ? 0.45 : 0.05;
      const halfExtent = sizes[axis] * 0.5 + tolerance;
      assert.ok(
        Math.abs(values[axis] - centres[axis]) <= halfExtent,
        `${laser.id} endpoint is not aligned to ${panel.name}`,
      );
    }
  }
}
