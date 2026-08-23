import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE,
  ROOM_4_LIFT_ARRIVAL_BLEND_START_PROGRESS,
  ROOM_4_LIFT_CAMERA_EXIT_RELEASE_Z,
  ROOM_4_LIFT_CAMERA_PROFILE,
  RoomFourGreybox,
} from '../src/levels/RoomFourGreybox.ts';
import {
  CollisionLayer,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';
import { CameraRig } from '../src/render/CameraRig.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';

const STEP_SECONDS = 1 / 60;

test('Room 4 lift zone activates, restores, and resolves correctly after reset', () => {
  const artResources = new ContainmentArtResources();
  const room = new RoomFourGreybox(() => {}, artResources);
  const world = new CollisionWorld();
  world.registerAll(room.collisionMeshes);
  world.registerAll(
    room.cameraObstructionMeshes,
    CollisionLayer.CameraObstruction,
  );
  const position = new THREE.Vector3(9, 30.21, 85.5);
  const previousPosition = position.clone();
  const zoneTarget = { position, radiusMetres: 0.45 };
  const followTarget = {
    position,
    previousPosition,
    velocity: new THREE.Vector3(),
    gameplayUp: new THREE.Vector3(0, 1, 0),
    grounded: true,
    attached: false,
  };
  const rig = new CameraRig();
  rig.setFollowTarget(followTarget, world);

  const liftContext = room.resolveLiftCamera(zoneTarget);
  assert.ok(liftContext);
  assert.equal(liftContext.anchor, room.elevatorPlatform);
  assert.equal(
    liftContext.profile.distanceMetres,
    ROOM_4_LIFT_CAMERA_PROFILE.distanceMetres,
  );
  rig.setContextualCamera(liftContext);
  for (let step = 0; step < 180; step += 1) {
    rig.update(1, STEP_SECONDS);
  }

  let diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.profileId, liftContext.profile.id);
  assert.ok(diagnostics.profileBlend > 1 - 1e-10);
  assert.ok(
    Math.abs(
      diagnostics.effectivePitchRadians -
        ROOM_4_LIFT_CAMERA_PROFILE.pitchRadians,
    ) < 1e-10,
  );
  assert.equal(diagnostics.obstructed, false);

  room.elevator.begin();
  room.elevator.update(
    room.elevator.startDelaySeconds +
      room.elevator.travelDurationSeconds *
        ROOM_4_LIFT_ARRIVAL_BLEND_START_PROGRESS,
    [],
  );
  assert.equal(room.elevator.state, 'ascending');
  const ascentContext = room.resolveLiftCamera(zoneTarget);
  assert.ok(ascentContext);
  assert.equal(room.liftCameraArrivalBlend, 0);
  assert.equal(
    ascentContext.profile.distanceMetres,
    ROOM_4_LIFT_CAMERA_PROFILE.distanceMetres,
  );

  room.elevator.update(room.elevator.travelDurationSeconds * 0.12, []);
  assert.equal(room.elevator.state, 'ascending');
  const transitionContext = room.resolveLiftCamera(zoneTarget);
  assert.ok(transitionContext);
  assert.ok(room.liftCameraArrivalBlend > 0);
  assert.ok(room.liftCameraArrivalBlend < 1);
  assert.ok(
    transitionContext.profile.distanceMetres <
      ROOM_4_LIFT_CAMERA_PROFILE.distanceMetres,
  );
  assert.ok(
    transitionContext.profile.distanceMetres >
      ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE.distanceMetres,
  );
  assert.ok(
    transitionContext.profile.pitchRadians <
      ROOM_4_LIFT_CAMERA_PROFILE.pitchRadians,
  );
  assert.ok(
    Object.values(transitionContext.profile)
      .filter((value): value is number => typeof value === 'number')
      .every(Number.isFinite),
  );

  room.elevator.update(room.elevator.travelDurationSeconds * 0.1, []);
  assert.equal(room.elevator.state, 'arrivalPause');
  const arrivalContext = room.resolveLiftCamera(zoneTarget);
  assert.ok(arrivalContext);
  assert.equal(room.liftCameraArrivalBlend, 1);
  assert.equal(
    arrivalContext.profile.distanceMetres,
    ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE.distanceMetres,
  );
  assert.equal(
    arrivalContext.profile.pitchRadians,
    ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE.pitchRadians,
  );

  rig.setContextualCamera(arrivalContext);
  rig.update(1, STEP_SECONDS);
  diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.profileId, arrivalContext.profile.id);
  assert.ok(
    diagnostics.effectivePitchRadians <
      ROOM_4_LIFT_CAMERA_PROFILE.pitchRadians,
  );

  // Room checkpoint recovery resets the zone before restoring the player.
  // Resolving the recovered position must deterministically reactivate it.
  room.reset();
  position.set(9, 30.21, 85.5);
  previousPosition.copy(position);
  const recoveredContext = room.resolveLiftCamera(zoneTarget);
  assert.ok(recoveredContext);
  rig.setContextualCamera(recoveredContext);
  rig.update(1, STEP_SECONDS);
  assert.notEqual(rig.getDiagnostics().profileId, 'default');

  room.elevator.begin();
  room.elevator.update(
    room.elevator.startDelaySeconds +
      room.elevator.travelDurationSeconds +
      room.elevator.arrivalDelaySeconds,
    [],
  );
  assert.equal(room.elevator.state, 'exitReady');
  const readyContext = room.resolveLiftCamera(zoneTarget);
  assert.ok(readyContext);
  assert.equal(
    readyContext.profile.pitchRadians,
    ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE.pitchRadians,
  );
  rig.setContextualCamera(readyContext);
  for (let step = 0; step < 60; step += 1) {
    rig.update(1, STEP_SECONDS);
  }

  // Walking out of the shaft releases the arrival framing through CameraRig's
  // existing profile blend without changing the authored yaw basis. Once the
  // completed sequence releases it, stepping slightly back across the plane
  // must not re-request the arrival profile and reverse that blend.
  position.set(9, 75.21, ROOM_4_LIFT_CAMERA_EXIT_RELEASE_Z + 0.1);
  previousPosition.copy(position);
  assert.equal(room.resolveLiftCamera(zoneTarget), undefined);
  rig.setContextualCamera(undefined);
  for (let step = 0; step < 12; step += 1) {
    rig.update(1, STEP_SECONDS);
  }
  const blendAfterRelease = rig.getDiagnostics().profileBlend;
  assert.ok(blendAfterRelease > 0);
  assert.ok(blendAfterRelease < 1);

  position.set(9, 75.21, ROOM_4_LIFT_CAMERA_EXIT_RELEASE_Z - 0.1);
  previousPosition.copy(position);
  assert.equal(room.resolveLiftCamera(zoneTarget), undefined);
  rig.setContextualCamera(undefined);
  rig.update(1, STEP_SECONDS);
  assert.ok(rig.getDiagnostics().profileBlend < blendAfterRelease);

  for (let step = 0; step < 108; step += 1) {
    rig.update(1, STEP_SECONDS);
  }
  diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.profileId, 'default');
  assert.ok(diagnostics.profileBlend < 1e-10);

  // Resetting Room 4 starts a new elevator sequence and clears the one-way
  // release latch, so a recovered lift occupant can activate the profile.
  room.reset();
  position.set(9, 30.21, 85.5);
  previousPosition.copy(position);
  assert.ok(room.resolveLiftCamera(zoneTarget));

  // A full level restart clears the rig and a Room 1 spawn resolves no lift
  // profile, so the camera cannot remain stuck in the contextual state.
  rig.reset();
  position.set(0, 0.46, -2.6);
  previousPosition.copy(position);
  rig.setContextualCamera(room.resolveLiftCamera(zoneTarget));
  rig.update(1, STEP_SECONDS);
  assert.equal(rig.getDiagnostics().profileId, 'default');
  assert.ok(rig.camera.position.toArray().every(Number.isFinite));

  world.clear();
  room.dispose();
  artResources.dispose();
});
