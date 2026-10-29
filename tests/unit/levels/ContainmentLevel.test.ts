import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CONTAINMENT_ROOM_OBJECTIVES,
  ContainmentLevelController,
  type ContainmentRoomId,
} from '../../../src/levels/ContainmentLevelController.ts';
import {
  ContainmentLevelScene,
  type ContainmentHazardFailure,
} from '../../../src/levels/ContainmentLevelScene.ts';
import {
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../../../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../../../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';
import { DeathSequence } from '../../../src/systems/DeathSequence.ts';

interface MutableFakeBody {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
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
  velocity: new THREE.Vector3(),
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

test('Room 3 acid failure starts at liquid contact, not metres above the surface', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    const surfaceY = new THREE.Box3().setFromObject(scene.roomThree.art.acidSurface).max.y;
    const body = createFakeBody();
    for (const height of [8.1, surfaceY + body.radiusMetres + 0.01]) {
      body.position.set(-12, height, 63);
      scene.roomThree.updateFailureTrigger(body);
      assert.equal(scene.roomThree.failureVolume.occupied, false, 'a slime still above the acid must survive');
    }
    body.position.y = surfaceY + body.radiusMetres - 0.001;
    scene.roomThree.updateFailureTrigger(body);
    assert.equal(scene.roomThree.failureVolume.occupied, true, 'the bottom of the body touching acid is lethal');
  } finally { scene.dispose(); }
});

test('Room 2 remains safe when walking against the wall shared with Room 3 acid', () => {
  const scene = new ContainmentLevelScene(() => {});
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes); surfaces.registerAll(scene.collisionMeshes);
  const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(-9, .46, 31) });
  let deaths = 0;
  const controller = new ContainmentLevelController({
    scene, body, collisionWorld: world, requestDeath: () => { deaths++; return true; },
  });
  try {
    controller.teleportToRoomForDebug(2);
    const towardWall = new THREE.Vector3(0, 0, 1);
    for (const x of [-13.6, -6, 0, 6, 13.6]) {
      body.recoverAt(new THREE.Vector3(x, .46, 46));
      for (let step = 0; step < 120; step++) {
        body.update(1 / 60, towardWall); controller.update(1 / 60);
        assert.equal(scene.roomThree.failureVolume.occupied, false, `Room 3 acid reaches Room 2 at x=${x}.`);
      }
      assert.ok(body.position.z > 48.3 && body.position.z < 48.4, 'The shared wall must still be solid.');
      assert.equal(controller.activeRoomId, 2);
    }
    assert.equal(deaths, 0, 'The safe tutorial floor must not request recovery.');
    controller.teleportToRoomForDebug(3);
    body.recoverAt(new THREE.Vector3(-12, 8, 63));
    for (let step = 0; step < 120 && deaths === 0; step++) {
      body.update(1 / 60, new THREE.Vector3()); controller.update(1 / 60);
    }
    assert.equal(deaths, 1, 'Acid contact inside Room 3 must remain lethal.');
    assert.equal(controller.lastFailureId, 'room-3:fall');
  } finally { controller.dispose(); world.clear(); surfaces.clear(); scene.dispose(); }
});

test('a physical fall reaches the visible Room 3 acid before its failure trigger activates', () => {
  const scene = new ContainmentLevelScene(() => {});
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  try {
    world.registerAll(scene.collisionMeshes);
    surfaces.registerAll(scene.collisionMeshes);
    const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(-12, 10, 63) });
    const surfaceY = new THREE.Box3().setFromObject(scene.roomThree.art.acidSurface).max.y;
    const noMovement = new THREE.Vector3();
    for (let step = 0; step < 120 && !scene.roomThree.failureVolume.occupied; step += 1) {
      body.update(1 / 60, noMovement);
      scene.roomThree.updateFailureTrigger(body);
      if (body.position.y - body.radiusMetres > surfaceY + 1e-6) {
        assert.equal(scene.roomThree.failureVolume.occupied, false);
      }
    }
    assert.equal(scene.roomThree.failureVolume.occupied, true);
    assert.ok(body.position.y - body.radiusMetres <= surfaceY + 1e-6,
      'collision resolution must not leave the body hovering over the new lethal threshold');
  } finally { scene.dispose(); world.clear(); surfaces.clear(); }
});

test('Room 5 fall detection clears the whole lift roof throughout ascent and retains its own room coverage', () => {
  const scene = new ContainmentLevelScene(() => {});
  const target = {position:new THREE.Vector3(),radiusMetres:.45};
  try {
    for(let y=30.21;y<=75.21;y+=.5)for(const x of [5.1,9,12.9])for(const z of [81.6,85.5,89.4]){
      target.position.set(x,y,z);
      scene.roomFive.updateFailureTrigger(target as unknown as KinematicBody);
      assert.equal(scene.roomFive.failureVolume.occupied,false,`Room 5 reaches the lift at ${x}, ${y}, ${z}.`);
    }
    for(const x of [-20,0,20])for(const z of [91.6,108.5,127.9]){
      target.position.set(x,68,z);
      scene.roomFive.updateFailureTrigger(target as unknown as KinematicBody);
      assert.equal(scene.roomFive.failureVolume.occupied,true);
    }
  } finally { scene.dispose(); }
});

test('Room 5 moving-platform handoff remains phase locked across loops and reset', () => {
  const scene = new ContainmentLevelScene(() => {});
  const room = scene.roomFive;
  const fakeBody = createFakeBody() as unknown as KinematicBody;
  const persistentBodies = [fakeBody];
  const fixedDeltaSeconds = 1 / 60;
  const firstHandoffStepCount = 96;
  const fullLoopStepCount = 384;

  assert.equal(
    room.movingPlatformOne.travelDurationSeconds,
    room.movingPlatformTwo.travelDurationSeconds,
  );

  const advanceSteps = (stepCount: number): void => {
    for (let step = 0; step < stepCount; step += 1) {
      room.updateTraversal(fixedDeltaSeconds, fakeBody, persistentBodies);
    }
  };

  // Platform 1 begins halfway through its X route. Each time it reaches the
  // Room 5 handoff end, platform 2 must be at the same midpoint of its Z route
  // instead of drifting toward an easier or harder jump on later loops.
  advanceSteps(firstHandoffStepCount);
  assert.equal(room.movingPlatformOne.progress, 1);
  assert.ok(Math.abs(room.movingPlatformTwo.progress - 0.5) < 1e-10);

  for (let loop = 0; loop < 8; loop += 1) {
    advanceSteps(fullLoopStepCount);
    assert.equal(room.movingPlatformOne.progress, 1);
    assert.ok(
      Math.abs(room.movingPlatformTwo.progress - 0.5) < 1e-10,
      `Room 5 moving-platform phase drifted after loop ${loop + 1}`,
    );
  }

  room.reset();
  assert.equal(room.movingPlatformOne.progress, 0.5);
  assert.equal(room.movingPlatformTwo.progress, 0);
  advanceSteps(firstHandoffStepCount);
  assert.equal(room.movingPlatformOne.progress, 1);
  assert.ok(Math.abs(room.movingPlatformTwo.progress - 0.5) < 1e-10);

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
  scene.roomFour.elevator.begin();
  scene.roomFour.elevator.update(
    scene.roomFour.elevator.startDelaySeconds +
      scene.roomFour.elevator.travelDurationSeconds +
      scene.roomFour.elevator.arrivalDelaySeconds,
    [],
  );
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
    bobBody,
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
  const observedCheckpoints: (string | number)[] = [];
  controller.events.on('checkpointReached', event => observedCheckpoints.push(event.roomId));
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
    if (roomId === 5) {
      scene.roomFour.elevator.begin();
      scene.roomFour.elevator.update(
        scene.roomFour.elevator.startDelaySeconds +
          scene.roomFour.elevator.travelDurationSeconds +
          scene.roomFour.elevator.arrivalDelaySeconds,
        [],
      );
    }
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
    'Cross the platforms to reach the next chamber',
    'Time your jumps through the laser chamber',
    'Survive the lift and reach the upper floor',
    'Reach the release controls and free Goop',
    'Climb through the vent',
  ]);
  assert.deepEqual(observedCheckpoints, [2, 3, 4, 5], 'Reset and repeated upper-lift activation must not announce new checkpoints.');

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
      position: new THREE.Vector3(0, 11.36, 51.4),
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

test('Containment completion is gated by contact with the observation release button and emits once', () => {
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
  fakeBody.position.set(-10, 97.95, 129.5);
  controller.update(0.2);
  assert.equal(controller.state, 'playing');
  fakeBody.position.set(-10,97.95,130.55);
  assert.equal(fakeBody.attached,false,'A button does not require adhesion.');
  controller.update(0.04);
  assert.equal(controller.state,'playing');
  controller.update(0.04);
  assert.equal(controller.state, 'completing');

  controller.update(1);
  assert.equal(controller.state, 'completing');
  controller.update(1.5);
  assert.equal(controller.state, 'completing');
  assert.equal(completions, 0, 'Freeing the cell must not skip the fight and escape.');
  controller.update(84.3);
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

test('accepted hazard contact emits authoritative damage but out-of-bounds does not', () => {
  const scene = new ContainmentLevelScene(() => {});
  const collisionWorld = new CollisionWorld();
  collisionWorld.registerAll(scene.collisionMeshes);
  const fakeBody = createFakeBody();
  const controller = new ContainmentLevelController({
    scene,
    body: fakeBody as unknown as KinematicBody,
    collisionWorld,
    requestDeath: () => true,
  });
  const damageEvents: ContainmentHazardFailure[] = [];
  controller.events.on('damaged', (failure) => damageEvents.push(failure));

  assert.equal(
    controller.requestHazardFailure({
      roomId: 'room-3',
      hazardId: 'test-laser',
    }),
    true,
  );
  assert.equal(controller.requestOutOfBoundsFailure(), true);
  assert.deepEqual(damageEvents, [
    { roomId: 'room-3', hazardId: 'test-laser' },
  ]);

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
  assert.equal(controller.activeRoomId, 4);

  const exitLock = scene.roomFour.collisionMeshes.find(
    (mesh) => mesh.name === 'room-4-exit-lock',
  );
  assert.ok(exitLock);
  assert.equal(exitLock.visible, true);
  const exitSweep = new CollisionHit();
  assert.equal(
    collisionWorld.sweepSphere(
      fakeBody.position,
      new THREE.Vector3(0, 0, 8),
      fakeBody.radiusMetres,
      exitSweep,
      CollisionLayer.Movement,
    ),
    true,
  );
  assert.equal(exitSweep.object?.name, 'room-4-exit-lock');

  // Recovering at the upper checkpoint lands inside Room 5's entry trigger.
  // That trigger must not steal simulation ownership while Room 4 still owns
  // the arrival pause and closed shutter.
  controller.recoverActiveCheckpoint();
  assert.ok(fakeBody.position.equals(new THREE.Vector3(9, 75.21, 94)));
  controller.update(0.01);
  assert.equal(controller.activeRoomId, 4);
  assert.equal(scene.roomFour.elevator.state, 'arrivalPause');
  assert.equal(exitLock.visible, true);

  controller.update(2);
  assert.equal(scene.roomFour.elevator.state, 'exitReady');
  assert.equal(exitLock.visible, false);
  assert.equal(controller.activeRoomId, 5);
  assert.equal(
    collisionWorld.sweepSphere(
      new THREE.Vector3(9, 75.21, 85.5),
      new THREE.Vector3(0, 0, 8),
      fakeBody.radiusMetres,
      exitSweep,
      CollisionLayer.Movement,
    ),
    false,
  );

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

test('vent lining remains visible when completed Room 1 art is culled at the exit', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    scene.lighting.setActiveRoom(2);
    scene.withEnclosedRoomOcclusion({x:-8.4,y:10.95,z:28.8},{x:-8.4,y:11.7,z:30.6},()=>{
      assert.equal(scene.teaching.roomOneArt.root.visible, false);
      for (let object: THREE.Object3D | null = scene.teaching.ventArt.root; object; object = object.parent) {
        assert.equal(object.visible, true, `${object.name} hides the connecting vent`);
      }
    });
    assert.equal(scene.teaching.roomOneArt.root.visible, true);
  } finally { scene.dispose(); }
});
