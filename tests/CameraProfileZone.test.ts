import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  ROOM_4_LIFT_CAMERA_PROFILE,
  RoomFourGreybox,
} from '../src/levels/RoomFourGreybox.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { CameraRig } from '../src/render/CameraRig.ts';

const STEP_SECONDS = 1 / 60;

test('Room 4 lift zone activates, restores, and resolves correctly after reset', () => {
  const room = new RoomFourGreybox(() => {});
  const world = new CollisionWorld();
  world.registerAll(room.collisionMeshes);
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

  const liftContext = room.liftCameraZone.resolve(zoneTarget);
  assert.ok(liftContext);
  assert.equal(liftContext.profile, ROOM_4_LIFT_CAMERA_PROFILE);
  assert.equal(liftContext.anchor, room.elevatorPlatform);
  rig.setContextualCamera(liftContext);
  for (let step = 0; step < 180; step += 1) {
    rig.update(1, STEP_SECONDS);
  }

  let diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.profileId, ROOM_4_LIFT_CAMERA_PROFILE.id);
  assert.ok(diagnostics.profileBlend > 1 - 1e-10);
  assert.ok(
    Math.abs(
      diagnostics.effectivePitchRadians -
        ROOM_4_LIFT_CAMERA_PROFILE.pitchRadians,
    ) < 1e-10,
  );
  assert.equal(diagnostics.obstructed, false);

  position.set(9, 75.21, 94);
  previousPosition.copy(position);
  rig.setContextualCamera(room.liftCameraZone.resolve(zoneTarget));
  for (let step = 0; step < 120; step += 1) {
    rig.update(1, STEP_SECONDS);
  }
  diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.profileId, 'default');
  assert.ok(diagnostics.profileBlend < 1e-10);

  // Room checkpoint recovery resets the zone before restoring the player.
  // Resolving the recovered position must deterministically reactivate it.
  room.reset();
  position.set(9, 30.21, 85.5);
  previousPosition.copy(position);
  const recoveredContext = room.liftCameraZone.resolve(zoneTarget);
  assert.ok(recoveredContext);
  rig.setContextualCamera(recoveredContext);
  rig.update(1, STEP_SECONDS);
  assert.notEqual(rig.getDiagnostics().profileId, 'default');

  // A full level restart clears the rig and a Room 1 spawn resolves no lift
  // profile, so the camera cannot remain stuck in the contextual state.
  rig.reset();
  position.set(0, 0.46, -2.6);
  previousPosition.copy(position);
  rig.setContextualCamera(room.liftCameraZone.resolve(zoneTarget));
  rig.update(1, STEP_SECONDS);
  assert.equal(rig.getDiagnostics().profileId, 'default');
  assert.ok(rig.camera.position.toArray().every(Number.isFinite));

  world.clear();
  room.dispose();
});
