import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CONTAINMENT_ROOM_OBJECTIVES,
  ContainmentLevelController,
  type ContainmentRoomId,
} from '../src/levels/ContainmentLevelController.ts';
import {
  ContainmentLevelScene,
  type ContainmentHazardFailure,
} from '../src/levels/ContainmentLevelScene.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import { CameraRig } from '../src/render/CameraRig.ts';
import { DeathSequence } from '../src/systems/DeathSequence.ts';

interface MutableFakeBody {
  readonly position: THREE.Vector3;
  readonly radiusMetres: number;
  attached: boolean;
  attachmentSurfaceName: string;
  grounded: boolean;
  supportCollider: THREE.Mesh | null;
  isSupportedBy(collider: THREE.Mesh): boolean;
  applyCarrierDisplacement(
    displacement: { readonly x: number; readonly y: number; readonly z: number },
    collider: THREE.Mesh,
  ): void;
  recoverAt(position: THREE.Vector3): void;
}

const createFakeBody = (): MutableFakeBody => ({
  position: new THREE.Vector3(0, 0.46, -2.6),
  radiusMetres: 0.45,
  attached: false,
  attachmentSurfaceName: 'none',
  grounded: false,
  supportCollider: null,
  isSupportedBy(collider): boolean {
    return this.grounded && this.supportCollider === collider;
  },
  applyCarrierDisplacement(displacement): void {
    this.position.add(
      new THREE.Vector3(displacement.x, displacement.y, displacement.z),
    );
  },
  recoverAt(position): void {
    this.position.copy(position);
    this.attached = false;
    this.attachmentSurfaceName = 'none';
  },
});

test('complete Containment scene exposes unique, consistently tagged colliders', () => {
  const scene = new ContainmentLevelScene(() => {});
  const names = scene.collisionMeshes.map((mesh) => mesh.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('room-3-first-static-laser-beam-proxy') === false);
  assert.ok(names.includes('room-3-acid-floor'));
  assert.ok(names.includes('room-4-cargo-elevator-moving-platform-surface'));
  assert.ok(names.includes('room-5-containment-glass'));
  assert.ok(names.includes('room-5-goop-wooden-door'));
  assert.ok(names.includes('room-5-observation-sticky-lever-handle'));

  const containmentGlass = scene.collisionMeshes.find(
    (mesh) => mesh.name === 'room-5-containment-glass',
  );
  assert.ok(containmentGlass);
  assert.equal(containmentGlass.userData.surfaceTag, 'default');
  assert.ok(containmentGlass.material instanceof THREE.MeshStandardMaterial);
  assert.equal(containmentGlass.material.transparent, true);
  assert.deepEqual(containmentGlass.userData.sizeMetres, [5.1, 3.2, 4.5]);
  assert.equal(containmentGlass.position.y, 77.075);

  const goopDoor = scene.roomFive.goopWoodenDoor;
  assert.equal(goopDoor.userData.surfaceTag, 'default');
  assert.equal(goopDoor.userData.interactionRole, 'goop-dissolvable');
  assert.equal(goopDoor.userData.textureRole, 'wooden-door');
  assert.equal(goopDoor.userData.soluble, true);
  assert.ok(scene.solubleTargetMeshes.includes(goopDoor));
  assert.deepEqual(goopDoor.userData.sizeMetres, [3, 4.5, 0.3]);
  assert.ok(goopDoor.position.equals(new THREE.Vector3(0, 77, 125.25)));
  assert.ok(goopDoor.material instanceof THREE.MeshStandardMaterial);
  assert.equal(goopDoor.material.color.getHex(), 0x744522);

  const stickyMeshes = scene.collisionMeshes.filter(
    (mesh) => mesh.userData.surfaceTag === 'sticky',
  );
  assert.ok(stickyMeshes.length >= 9);
  for (const mesh of stickyMeshes) {
    assert.ok(
      mesh.userData.textureRole === 'sticky-wall-tile' ||
        mesh.userData.textureRole === 'sticky-vent-tile',
      `${mesh.name} is sticky without an art-facing texture role`,
    );
  }

  const acidFloor = scene.collisionMeshes.find(
    (mesh) => mesh.name === 'room-3-acid-floor',
  );
  assert.ok(acidFloor);
  assert.equal(acidFloor.userData.textureRole, 'acid-floor');
  assert.ok(acidFloor.material instanceof THREE.MeshStandardMaterial);
  assert.equal(acidFloor.material.color.getHex(), 0x92bd24);

  const finalVentLaser = scene.roomThree.lasers.hazards.find(
    (hazard) => hazard.id === 'room-3-final-vent-laser',
  );
  assert.ok(finalVentLaser);
  assert.equal(finalVentLaser.enabled, true);

  scene.dispose();
});

test('Room 5 Blender layout drives deterministic platforms and translated lasers', () => {
  const scene = new ContainmentLevelScene(() => {});
  const room = scene.roomFive;
  const fakeBody = createFakeBody();
  fakeBody.position.set(0, 0, 0);

  assert.deepEqual(
    room.lasers.hazards.map((hazard) => hazard.id),
    [
      'room-5-laser-1',
      'room-5-laser-2',
      'room-5-laser-3',
      'room-5-laser-4',
      'room-5-laser-5',
      'room-5-laser-6',
      'room-5-laser-7',
      'room-5-laser-8',
    ],
  );
  assert.ok(
    room.movingPlatformOne.root.position.equals(
      new THREE.Vector3(6.109, 82.374, 100.384),
    ),
  );
  assert.ok(
    room.movingPlatformTwo.root.position.equals(
      new THREE.Vector3(15.109, 82.374, 100.384),
    ),
  );

  const roomFiveStickyWalls = room.collisionMeshes.filter(
    (mesh) =>
      mesh.name.startsWith('room-5-') &&
      mesh.name !== room.leverHandleName &&
      mesh.userData.textureRole === 'sticky-wall-tile',
  );
  assert.equal(roomFiveStickyWalls.length, 5);
  assert.deepEqual(
    roomFiveStickyWalls
      .filter((wall) => wall.name.startsWith('room-5-final-sticky-transfer-'))
      .map((wall) => wall.name),
    [
      'room-5-final-sticky-transfer-1',
      'room-5-final-sticky-transfer-3',
      'room-5-final-sticky-transfer-5',
    ],
  );
  for (const wall of roomFiveStickyWalls) {
    assert.ok(
      (wall.userData.sizeMetres as number[]).includes(0.022),
      `${wall.name} did not use the thin sticky-wall depth`,
    );
    assert.equal(wall.userData.movementFaceMode, 'vertical-sides');
  }

  const glassApproachPlatform = room.collisionMeshes.find(
    (mesh) => mesh.name === 'room-5-lower-platform-c',
  );
  assert.ok(glassApproachPlatform);
  assert.equal(glassApproachPlatform.position.y, 76.687);

  const laserOne = room.lasers.hazards[0];
  const laserFive = room.lasers.hazards[4];
  const laserSeven = room.lasers.hazards[6];
  room.updateTraversal(1.25, fakeBody as unknown as KinematicBody, [
    fakeBody as unknown as KinematicBody,
  ]);
  assert.ok(Math.abs(laserOne.start.y - (82.84 + 2.25)) < 1e-10);
  assert.ok(Math.abs(laserFive.start.z - 113.8375) < 1e-10);
  assert.ok(Math.abs(laserSeven.start.z - 113.8375) < 1e-10);
  assert.equal(room.movingPlatformOne.root.position.y, 82.374);
  assert.equal(room.movingPlatformOne.root.position.z, 100.384);
  assert.equal(room.movingPlatformTwo.root.position.x, 15.109);
  assert.equal(room.movingPlatformTwo.root.position.y, 82.374);

  room.updateTraversal(1.25, fakeBody as unknown as KinematicBody, [
    fakeBody as unknown as KinematicBody,
  ]);
  assert.ok(Math.abs(laserFive.start.z - 116.61) < 1e-10);
  assert.ok(Math.abs(laserSeven.start.z - 111.065) < 1e-10);

  room.reset();
  assert.ok(
    room.movingPlatformOne.root.position.equals(
      new THREE.Vector3(6.109, 82.374, 100.384),
    ),
  );
  assert.ok(
    room.movingPlatformTwo.root.position.equals(
      new THREE.Vector3(15.109, 82.374, 100.384),
    ),
  );
  assert.ok(Math.abs(laserOne.start.y - 82.84) < 1e-10);
  assert.ok(Math.abs(laserFive.start.z - 111.065) < 1e-10);
  assert.ok(Math.abs(laserSeven.start.z - 116.61) < 1e-10);

  fakeBody.position.copy(room.movingPlatformOne.root.position);
  fakeBody.grounded = true;
  fakeBody.supportCollider = room.movingPlatformOne.collisionMesh;
  const riderStartX = fakeBody.position.x;
  room.updateTraversal(1 / 60, fakeBody as unknown as KinematicBody, [
    fakeBody as unknown as KinematicBody,
  ]);
  assert.ok(fakeBody.position.x > riderStartX);
  assert.equal(
    fakeBody.position.x - riderStartX,
    room.movingPlatformOne.displacement.x,
  );

  scene.dispose();
});

test('Room 5 remains at its authored start until its first active fixed step', () => {
  const scene = new ContainmentLevelScene(() => {});
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: () => false,
  });
  const initialPlatformPosition =
    scene.roomFive.movingPlatformOne.root.position.clone();
  const initialLaserStart = scene.roomFive.lasers.hazards[0].start.clone();

  // Arbitrary time spent in the earlier rooms cannot phase-shift Room 5.
  controller.update(137.25);
  assert.ok(
    scene.roomFive.movingPlatformOne.root.position.equals(
      initialPlatformPosition,
    ),
  );
  assert.ok(scene.roomFive.lasers.hazards[0].start.equals(initialLaserStart));

  // The entry step establishes room/checkpoint ownership without consuming
  // any Room 5 simulation time.
  fakeBody.position.copy(scene.roomFive.entryCheckpointTrigger.centre);
  controller.update(0.5);
  assert.equal(controller.activeRoomId, 5);
  assert.ok(
    scene.roomFive.movingPlatformOne.root.position.equals(
      initialPlatformPosition,
    ),
  );
  assert.ok(scene.roomFive.lasers.hazards[0].start.equals(initialLaserStart));

  controller.update(0.5);
  assert.ok(
    !scene.roomFive.movingPlatformOne.root.position.equals(
      initialPlatformPosition,
    ),
  );
  assert.ok(!scene.roomFive.lasers.hazards[0].start.equals(initialLaserStart));

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});

test('inactive persistent slimes continue riding Room 4 and Room 5 carriers', () => {
  const scene = new ContainmentLevelScene(() => {});
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const bob = createFakeBody();
  const goop = createFakeBody();
  const bobBody = bob as unknown as KinematicBody;
  const goopBody = goop as unknown as KinematicBody;
  const controller = new ContainmentLevelController({
    scene,
    body: bobBody,
    persistentBodies: [bobBody, goopBody],
    collisionWorld,
    requestDeath: () => false,
  });

  controller.teleportToRoomForDebug(4);
  bob.grounded = true;
  bob.supportCollider = scene.roomFour.elevatorPlatform.collisionMesh;
  goop.position.set(0, 0.46, -2.6);

  // Switching control to Goop leaves Bob persistent on the elevator.
  controller.setActiveBody(goopBody);
  const elevatorRiderOffset =
    bob.position.y - scene.roomFour.elevatorPlatform.root.position.y;
  const goopBeforeElevator = goop.position.clone();
  controller.update(3.2);

  assert.equal(scene.roomFour.elevator.state, 'ascending');
  assert.ok(scene.roomFour.elevator.ascentProgress > 0);
  assert.ok(
    Math.abs(
      bob.position.y -
        scene.roomFour.elevatorPlatform.root.position.y -
        elevatorRiderOffset,
    ) < 1e-10,
  );
  assert.ok(goop.position.equals(goopBeforeElevator));

  // The same ownership rule applies to Room 5's looping platforms.
  controller.setActiveBody(bobBody);
  controller.teleportToRoomForDebug(5);
  bob.grounded = false;
  bob.supportCollider = null;
  goop.position.copy(scene.roomFive.movingPlatformOne.root.position);
  goop.grounded = true;
  goop.supportCollider =
    scene.roomFive.movingPlatformOne.collisionMesh;
  const goopBeforePlatform = goop.position.clone();
  controller.update(1 / 60);

  assert.ok(goop.position.x > goopBeforePlatform.x);
  assert.equal(
    goop.position.x - goopBeforePlatform.x,
    scene.roomFive.movingPlatformOne.displacement.x,
  );

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});

test('authored vent zones use tight framing and Room 1 opens toward the route', () => {
  const scene = new ContainmentLevelScene(() => {});
  const world = new CollisionWorld();
  world.registerAll(scene.collisionMeshes);

  for (const position of [
    new THREE.Vector3(-4.8, 6, 7),
    new THREE.Vector3(-4.8, 8, 18),
    new THREE.Vector3(-5.7, 11, 24),
    new THREE.Vector3(-8.4, 11, 28),
    new THREE.Vector3(9, 32, 79),
  ]) {
    assert.equal(scene.isInsideCameraTightVent(position), true);
  }
  assert.equal(
    scene.isInsideCameraTightVent(new THREE.Vector3(0, 0.46, -2.6)),
    false,
  );
  assert.equal(
    scene.isInsideCameraTightVent(new THREE.Vector3(-9, 0.46, 31)),
    false,
  );

  const spawn = scene.copySpawnPosition(new THREE.Vector3());
  const rig = new CameraRig();
  rig.setFollowTarget(
    {
      position: spawn,
      previousPosition: spawn,
      velocity: new THREE.Vector3(),
      gameplayUp: new THREE.Vector3(0, 1, 0),
      grounded: true,
      attached: false,
    },
    world,
  );
  rig.setGroundOrbitYawRadians(Math.PI);
  rig.update(1, 0);

  const openingCamera = rig.getDiagnostics();
  assert.ok(openingCamera.currentDistanceMetres > 2.5);
  assert.equal(openingCamera.obstructionName, 'room-1-rear-wall');

  scene.dispose();
});

test('Containment objectives follow room entry and reset to Room 1', () => {
  let controller: ContainmentLevelController;
  const scene = new ContainmentLevelScene(
    (failure: ContainmentHazardFailure) => {
      controller.requestHazardFailure(failure);
    },
  );
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: () => false,
  });

  const observedRooms: ContainmentRoomId[] = [];
  const observedObjectives: string[] = [];
  controller.events.on('objectiveChanged', ({ roomId, objective }) => {
    observedRooms.push(roomId);
    observedObjectives.push(objective);
  });

  assert.equal(controller.activeRoomId, 1);
  assert.equal(controller.currentObjective, 'Climb through the vent');

  const roomEntries: readonly [ContainmentRoomId, THREE.Vector3][] = [
    [2, new THREE.Vector3(-8.5, 1, 30.5)],
    [3, scene.roomThree.checkpointTrigger.centre],
    [4, scene.roomFour.checkpointTrigger.centre],
    [5, scene.roomFive.entryCheckpointTrigger.centre],
  ];
  for (const [roomId, position] of roomEntries) {
    fakeBody.position.copy(position);
    controller.update(0.01);
    assert.equal(controller.activeRoomId, roomId);
    assert.equal(
      controller.currentObjective,
      CONTAINMENT_ROOM_OBJECTIVES[roomId],
    );
  }

  controller.reset();
  assert.equal(controller.activeRoomId, 1);
  assert.deepEqual(observedRooms, [2, 3, 4, 5, 1]);
  assert.deepEqual(observedObjectives, [
    'Learn how to jump',
    'Get past the lasers',
    'Survive the elevator!',
    'Free Goob!',
    'Climb through the vent',
  ]);

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});

test('debug room teleports activate and recover through real entry checkpoints', () => {
  const scene = new ContainmentLevelScene(() => {});
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: () => false,
  });

  assert.equal(scene.roomFive.beginEnding(), true);
  const destinations = [
    {
      roomId: 1,
      checkpointId: 'containment-room-1-spawn',
      position: new THREE.Vector3(-0.20995, 0.52507, -2.60112),
    },
    {
      roomId: 2,
      checkpointId: 'containment-room-2-safe-floor',
      position: new THREE.Vector3(-9, 0.46, 31),
    },
    {
      roomId: 3,
      checkpointId: 'containment-room-3-entry',
      position: new THREE.Vector3(0, 10.86, 51.4),
    },
    {
      roomId: 4,
      checkpointId: 'containment-room-4-elevator-roof',
      position: new THREE.Vector3(9, 30.21, 85.5),
    },
    {
      roomId: 5,
      checkpointId: 'containment-room-5-entry',
      position: new THREE.Vector3(9, 75.21, 94),
    },
  ] as const;

  for (const { roomId, checkpointId, position } of destinations) {
    controller.teleportToRoomForDebug(roomId);
    assert.equal(controller.activeRoomId, roomId);
    assert.equal(
      controller.currentObjective,
      CONTAINMENT_ROOM_OBJECTIVES[roomId],
    );
    assert.equal(controller.activeCheckpointId, checkpointId);
    assert.ok(fakeBody.position.equals(position));
  }
  assert.equal(scene.roomFive.endingState, 'traversal');

  // Room 5 intentionally has no mid-room recovery points. Crossing the old
  // central and final checkpoint locations must leave its entry active.
  for (const position of [
    new THREE.Vector3(-0.68, 81.8, 115.652),
    new THREE.Vector3(15.436, 94.2, 120),
  ]) {
    fakeBody.position.copy(position);
    controller.update(0.01);
    assert.equal(controller.activeCheckpointId, 'containment-room-5-entry');
  }

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});

test('Containment completion is gated by observation lever adhesion and emits once', () => {
  let controller: ContainmentLevelController;
  const scene = new ContainmentLevelScene(
    (failure: ContainmentHazardFailure) => {
      controller.requestHazardFailure(failure);
    },
  );
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const death = new DeathSequence();
  controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: (recovery) => death.requestDeath(recovery),
  });

  let completions = 0;
  let payload: { levelId: string; nextLevelId: string } | undefined;
  controller.events.on('completed', (event) => {
    completions += 1;
    payload = event;
  });

  controller.teleportToRoomForDebug(5);
  fakeBody.position.set(-10, 99.3, 128.8);
  fakeBody.attached = true;
  fakeBody.attachmentSurfaceName = scene.roomFive.leverHandleName;
  controller.update(0.2);
  assert.equal(controller.state, 'playing');
  controller.update(0.2);
  assert.equal(controller.state, 'completing');

  controller.update(1);
  assert.equal(controller.state, 'completing');
  controller.update(1.5);
  assert.equal(controller.state, 'complete');
  assert.equal(completions, 1);
  assert.deepEqual(payload, {
    levelId: 'containment',
    nextLevelId: 'level-2',
  });

  controller.update(20);
  assert.equal(completions, 1);

  controller.reset();
  assert.equal(controller.state, 'playing');
  assert.equal(controller.activeCheckpointId, 'containment-room-1-spawn');
  assert.equal(scene.roomFive.endingState, 'traversal');

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});

test('active checkpoint resets its room state before recovering the player', () => {
  let controller: ContainmentLevelController;
  const scene = new ContainmentLevelScene(
    (failure: ContainmentHazardFailure) => {
      controller.requestHazardFailure(failure);
    },
  );
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const death = new DeathSequence({ burstDurationSeconds: 0.05 });
  controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: (recovery) => death.requestDeath(recovery),
  });

  fakeBody.position.set(9, 30.21, 85.5);
  fakeBody.grounded = true;
  fakeBody.supportCollider = scene.roomFour.elevatorPlatform.collisionMesh;
  controller.update(0.01);
  assert.equal(
    controller.activeCheckpointId,
    'containment-room-4-elevator-roof',
  );
  controller.update(0.01);
  assert.equal(scene.roomFour.elevator.state, 'warning');

  controller.update(3.2);
  assert.equal(scene.roomFour.elevator.state, 'ascending');
  assert.ok(scene.roomFour.elevator.ascentProgress > 0);

  assert.equal(
    controller.requestHazardFailure({
      roomId: 'room-4',
      hazardId: 'test-hit',
    }),
    true,
  );
  assert.equal(death.update(0.05), true);
  assert.equal(death.completeRetry(), true);

  assert.equal(scene.roomFour.elevator.state, 'waitingForRider');
  assert.equal(scene.roomFour.elevator.ascentProgress, 0);
  assert.ok(fakeBody.position.equals(new THREE.Vector3(9, 30.21, 85.5)));

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});

test('elevator stopping activates the Room 5 entry checkpoint before the player exits', () => {
  let controller: ContainmentLevelController;
  const scene = new ContainmentLevelScene(
    (failure: ContainmentHazardFailure) => {
      controller.requestHazardFailure(failure);
    },
  );
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const death = new DeathSequence({ burstDurationSeconds: 0.05 });
  controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: (recovery) => death.requestDeath(recovery),
  });

  fakeBody.position.set(9, 30.21, 85.5);
  fakeBody.grounded = true;
  fakeBody.supportCollider = scene.roomFour.elevatorPlatform.collisionMesh;
  controller.update(0.01);
  assert.equal(controller.activeCheckpointId, 'containment-room-4-elevator-roof');
  controller.update(0.01);

  // Consume the warning and complete the ascent, but remain inside the
  // arrival pause rather than walking through the Room 5 entry trigger.
  controller.update(48);
  assert.equal(scene.roomFour.elevator.state, 'arrivalPause');
  assert.equal(scene.roomFour.elevator.ascentProgress, 1);
  assert.equal(controller.activeCheckpointId, 'containment-room-5-entry');
  assert.equal(controller.activeRoomId, 5);

  // A normal descent first exits and then re-enters the old Room 4 checkpoint
  // trigger. Forward-only progression must keep Room 5 authoritative.
  controller.update(0.01);
  fakeBody.position.copy(scene.roomFour.checkpointTrigger.centre);
  controller.update(0.01);
  assert.equal(controller.activeCheckpointId, 'containment-room-5-entry');
  assert.equal(controller.activeRoomId, 5);
  assert.equal(death.state, 'playing');

  // Continuing into the shaft failure volume recovers at Room 5 without
  // resetting the completed Room 4 elevator to the bottom.
  fakeBody.position.set(9, 22, 85.5);
  fakeBody.grounded = false;
  fakeBody.supportCollider = null;
  controller.update(0.01);
  assert.equal(death.state, 'bursting');
  assert.equal(death.update(0.05), true);
  assert.equal(death.completeRetry(), true);
  assert.ok(fakeBody.position.equals(new THREE.Vector3(9, 75.21, 94)));
  assert.equal(scene.roomFour.elevator.ascentProgress, 1);

  controller.dispose();
  collisionWorld.clear();
  scene.dispose();
});
