import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CollisionLayer,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';
import {
  CameraRig,
  type CameraFollowTarget,
} from '../src/render/CameraRig.ts';
import type { ContextualCameraProfile } from '../src/render/CameraProfile.ts';

interface MutableCameraTarget extends CameraFollowTarget {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  gameplayUp: THREE.Vector3;
  grounded: boolean;
  attached: boolean;
}

const EPSILON = 1e-10;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TEST_CONTEXTUAL_PROFILE: ContextualCameraProfile = {
  id: 'test-high-angle-profile',
  distanceMetres: 10,
  targetHeightMetres: 0.35,
  pitchRadians: THREE.MathUtils.degToRad(60),
  transitionDurationSeconds: 0.6,
  framingDeadZoneHalfWidthMetres: 1,
  framingDeadZoneHalfHeightMetres: 1,
  framingDampingPerSecond: 8,
};

test('vent ceiling cannot push the follow focus outside the map during a jump', () => {
  const world = new CollisionWorld();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(20, .3, 20)); roof.position.y = 2.55;
  world.register(roof, CollisionLayer.CameraObstruction);
  const target = createTarget();
  target.position.y = 1.94; target.previousPosition.copy(target.position);
  const rig = new CameraRig({ initialPitchRadians: THREE.MathUtils.degToRad(65) });
  try {
    rig.setFollowTarget(target, world); rig.update(1, 1 / 60);
    assert.ok(rig.camera.position.y < 2.4, 'camera stays beneath the vent roof');
    assert.ok(rig.getDiagnostics().focusPosition.y < 2.4 - .22, 'focus stays on the safe side as well');
    assert.deepEqual(target.position.toArray(), [0, 1.94, 0], 'only presentation is constrained');
  } finally { world.clear(); roof.geometry.dispose(); }
});

test('cinematic up override leaves wall gravity untouched and restores it on handoff', () => {
  const rig = new CameraRig();
  const target = createTarget();
  target.gameplayUp.set(1, 0, 0); target.attached = true;
  rig.setFollowTarget(target, new CollisionWorld()); rig.update(1, 0);
  rig.setContextualCamera({ profile: TEST_CONTEXTUAL_PROFILE,
    anchor: { position: target.position, previousPosition: target.previousPosition },
    gameplayUpOverride: WORLD_UP });
  for (let i = 0; i < 180; i++) rig.update(1, 1 / 60);
  assert.ok(rig.camera.up.y > .999);
  assert.deepEqual(target.gameplayUp.toArray(), [1, 0, 0]);
  rig.setContextualCamera(undefined);
  for (let i = 0; i < 180; i++) rig.update(1, 1 / 60);
  assert.ok(rig.camera.up.x > .999);
});

function createTarget(): MutableCameraTarget {
  return {
    position: new THREE.Vector3(0, 0.46, 0),
    previousPosition: new THREE.Vector3(0, 0.46, 0),
    velocity: new THREE.Vector3(),
    gameplayUp: new THREE.Vector3(0, 1, 0),
    grounded: true,
    attached: false,
  };
}

function teleportTarget(
  target: MutableCameraTarget,
  position: THREE.Vector3,
): void {
  target.position.copy(position);
  target.previousPosition.copy(position);
}

function advanceRig(
  rig: CameraRig,
  seconds: number,
  interpolationAlpha = 1,
): void {
  const stepCount = Math.ceil(seconds * 60);
  for (let step = 0; step < stepCount; step += 1) {
    rig.update(interpolationAlpha, 1 / 60);
  }
}

function applyVerticalLook(
  pointerDeltaY: number,
  invertVertical: boolean,
): { cameraHeightDelta: number; viewDirectionY: number } {
  const rig = new CameraRig({
    initialPitchRadians: 0,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
  });
  rig.setFollowTarget(createTarget(), new CollisionWorld());
  rig.setLookSettings({ invertVertical });
  rig.update(1, 0);

  const initialCameraY = rig.camera.position.y;
  rig.queueLookInput(0, pointerDeltaY);
  rig.update(1, 0);

  const viewDirection = rig.camera.getWorldDirection(new THREE.Vector3());
  return {
    cameraHeightDelta: rig.camera.position.y - initialCameraY,
    viewDirectionY: viewDirection.y,
  };
}

test('combat framing preserves upward mouse aim through entry and exit', () => {
  const rig = new CameraRig();
  const target = createTarget();
  rig.setFollowTarget(target, new CollisionWorld());
  rig.setContextualCamera({ profile: { ...TEST_CONTEXTUAL_PROFILE, playerControlledPitch: true }, anchor: target });
  advanceRig(rig, 1);
  rig.queueLookInput(0, -600); rig.applyQueuedLookInput();
  advanceRig(rig, 1);
  assert.ok(rig.getDiagnostics().pitchRadians < -0.8);
  assert.ok(rig.camera.getWorldDirection(new THREE.Vector3()).y > .7);
  const pitch = rig.getDiagnostics().pitchRadians;
  rig.setContextualCamera(undefined); advanceRig(rig, 1);
  assert.equal(rig.getDiagnostics().pitchRadians, pitch);
});

test('vertical pointer look follows pitch convention with inversion off and on', () => {
  const mouseUp = applyVerticalLook(-100, false);
  assert.ok(mouseUp.cameraHeightDelta < 0);
  assert.ok(mouseUp.viewDirectionY > 0);

  const mouseDown = applyVerticalLook(100, false);
  assert.ok(mouseDown.cameraHeightDelta > 0);
  assert.ok(mouseDown.viewDirectionY < 0);

  const invertedMouseUp = applyVerticalLook(-100, true);
  assert.ok(invertedMouseUp.cameraHeightDelta > 0);
  assert.ok(invertedMouseUp.viewDirectionY < 0);

  const invertedMouseDown = applyVerticalLook(100, true);
  assert.ok(invertedMouseDown.cameraHeightDelta < 0);
  assert.ok(invertedMouseDown.viewDirectionY > 0);
});

test('first-person aim preserves the full upward centre ray near a floor', () => {
  const target = createTarget();
  const world = new CollisionWorld();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  floor.name = 'upward-aim-test-floor';
  floor.position.y = -0.1;
  world.register(floor);
  const rig = new CameraRig();
  rig.setFollowTarget(target, world);
  rig.update(1, 0);

  rig.setAimPresentationActive(true, true);
  rig.queueLookInput(0, -10_000);
  rig.update(1, 1 / 60);

  const diagnostics = rig.getDiagnostics();
  const aimDirection = rig.camera.getWorldDirection(new THREE.Vector3());
  assert.equal(diagnostics.obstructionName, 'none');
  assert.ok(diagnostics.currentDistanceMetres < 1);
  assert.ok(
    Math.abs(
      diagnostics.pitchRadians - THREE.MathUtils.degToRad(-80),
    ) < EPSILON,
  );
  assert.ok(
    THREE.MathUtils.radToDeg(Math.asin(aimDirection.y)) > 75,
    `expected a steep upward aim ray, received ${THREE.MathUtils.radToDeg(Math.asin(aimDirection.y)).toFixed(2)} degrees`,
  );
  assert.ok(diagnostics.aimShoulderOffsetMetres < 0.1);

  floor.geometry.dispose();
});

test('ground movement follows camera yaw while ignoring pitch', () => {
  const rig = new CameraRig({
    horizontalSensitivityRadiansPerPixel: 1,
    verticalSensitivityRadiansPerPixel: 1,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
    initialPitchRadians: 0,
  });
  const movement = new THREE.Vector3();

  rig.copyGroundMovementDirection(0, -1, movement);
  assert.ok(movement.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-10);

  rig.queueLookInput(Math.PI, -10);
  rig.applyQueuedLookInput();
  rig.copyGroundMovementDirection(0, -1, movement);
  assert.ok(movement.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-10);
  assert.equal(rig.getDiagnostics().pitchRadians, -1);

  rig.queueLookInput(0, 20);
  rig.applyQueuedLookInput();
  rig.copyGroundMovementDirection(0, -1, movement);
  assert.ok(movement.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-10);
  assert.equal(rig.getDiagnostics().pitchRadians, 1);
});

test('each slime restores its own yaw and pitch after camera target swaps', () => {
  const bob = createTarget();
  const goop = createTarget();
  const rig = new CameraRig({
    horizontalSensitivityRadiansPerPixel: 1,
    verticalSensitivityRadiansPerPixel: 1,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
    initialPitchRadians: 0,
  });
  const world = new CollisionWorld();
  const movement = new THREE.Vector3();

  rig.setFollowTarget(bob, world);
  rig.setGroundOrbitYawRadians(Math.PI / 2);
  rig.queueLookInput(0, -0.25);
  rig.applyQueuedLookInput();

  rig.setFollowTarget(goop, world);
  rig.setGroundOrbitYawRadians(Math.PI);
  rig.queueLookInput(0, 0.75);
  rig.applyQueuedLookInput();

  rig.setFollowTarget(bob, world);
  rig.copyGroundMovementDirection(0, -1, movement);
  assert.ok(movement.distanceTo(new THREE.Vector3(-1, 0, 0)) < EPSILON);
  assert.equal(rig.getDiagnostics().pitchRadians, -0.25);

  rig.setFollowTarget(goop, world);
  rig.copyGroundMovementDirection(0, -1, movement);
  assert.ok(movement.distanceTo(new THREE.Vector3(0, 0, 1)) < EPSILON);
  assert.equal(rig.getDiagnostics().pitchRadians, 0.5);
});

test('camera-relative cardinal and diagonal movement is normalized', () => {
  const rig = new CameraRig();
  const movement = new THREE.Vector3();

  rig.copyGroundMovementDirection(1, 0, movement);
  assert.deepEqual(movement.toArray(), [1, 0, 0]);

  rig.copyGroundMovementDirection(-1, 0, movement);
  assert.deepEqual(movement.toArray(), [-1, 0, 0]);

  rig.copyGroundMovementDirection(0, 1, movement);
  assert.deepEqual(movement.toArray(), [0, 0, 1]);

  for (const [moveX, moveZ] of [
    [1, -1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    rig.copyGroundMovementDirection(moveX, moveZ, movement);
    assert.ok(Math.abs(movement.length() - 1) < 1e-10);
  }
});

test('attached-surface movement follows displayed camera directions on opposing walls', () => {
  for (const wallUp of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
  ]) {
    const target = createTarget();
    const rig = new CameraRig({ initialPitchRadians: 0 });
    const movement = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    rig.setFollowTarget(target, new CollisionWorld());
    rig.update(1, 0);

    target.gameplayUp.copy(wallUp);
    target.attached = true;
    for (let step = 0; step < 120; step += 1) {
      rig.update(1, 1 / 60);
    }

    rig.camera.getWorldDirection(cameraForward);
    cameraForward.projectOnPlane(wallUp).normalize();
    cameraRight.crossVectors(cameraForward, rig.camera.up).normalize();

    rig.copySurfaceMovementDirection(1, 0, wallUp, movement);
    assert.ok(movement.dot(cameraRight) > 1 - 1e-10);

    rig.copySurfaceMovementDirection(0, -1, wallUp, movement);
    assert.ok(movement.dot(cameraForward) > 1 - 1e-10);
  }
});

test('attached movement follows the displayed camera during partial up damping', () => {
  const transitionCases = [
    { wallUp: new THREE.Vector3(1, 0, 0), yawRadians: 0 },
    {
      wallUp: new THREE.Vector3(-1, 0, 0),
      yawRadians: Math.PI / 3,
    },
    {
      wallUp: new THREE.Vector3(0, 0, 1),
      yawRadians: -Math.PI / 4,
    },
  ];
  const sampleSteps = new Set([1, 4, 10]);

  for (const { wallUp, yawRadians } of transitionCases) {
    const target = createTarget();
    const rig = new CameraRig({
      horizontalSensitivityRadiansPerPixel: 1,
      initialPitchRadians: 0,
    });
    const cameraForward = new THREE.Vector3();
    const displayedForward = new THREE.Vector3();
    const displayedRight = new THREE.Vector3();
    const rightMovement = new THREE.Vector3();
    const leftMovement = new THREE.Vector3();
    const forwardMovement = new THREE.Vector3();
    const backwardMovement = new THREE.Vector3();
    const previousRight = new THREE.Vector3();
    const previousForward = new THREE.Vector3();
    let hasPreviousSample = false;

    rig.setFollowTarget(target, new CollisionWorld());
    rig.update(1, 0);
    rig.queueLookInput(yawRadians, 0);
    rig.update(1, 0);

    target.gameplayUp.copy(wallUp);
    target.attached = true;
    for (let step = 1; step <= 10; step += 1) {
      rig.update(1, 1 / 60);
      if (!sampleSteps.has(step)) continue;

      // These samples are genuinely transitional: camera-up is neither the
      // old ground up nor the authoritative wall normal yet.
      assert.ok(rig.camera.up.dot(WORLD_UP) < 0.999);
      assert.ok(rig.camera.up.dot(wallUp) < 0.999);

      rig.camera.getWorldDirection(cameraForward);
      displayedForward
        .copy(cameraForward)
        .projectOnPlane(wallUp)
        .normalize();
      displayedRight
        .crossVectors(cameraForward, rig.camera.up)
        .projectOnPlane(wallUp)
        .normalize();

      rig.copySurfaceMovementDirection(1, 0, wallUp, rightMovement);
      rig.copySurfaceMovementDirection(-1, 0, wallUp, leftMovement);
      rig.copySurfaceMovementDirection(0, -1, wallUp, forwardMovement);
      rig.copySurfaceMovementDirection(0, 1, wallUp, backwardMovement);

      for (const movement of [
        rightMovement,
        leftMovement,
        forwardMovement,
        backwardMovement,
      ]) {
        assert.ok(Math.abs(movement.dot(wallUp)) < EPSILON);
      }
      assert.ok(rightMovement.dot(displayedRight) > 0);
      assert.ok(leftMovement.dot(displayedRight) < 0);
      assert.ok(forwardMovement.dot(displayedForward) > 1 - EPSILON);
      assert.ok(backwardMovement.dot(displayedForward) < -1 + EPSILON);
      assert.ok(rightMovement.dot(leftMovement) < -1 + EPSILON);
      assert.ok(forwardMovement.dot(backwardMovement) < -1 + EPSILON);

      if (hasPreviousSample) {
        assert.ok(previousRight.dot(rightMovement) > 0);
        assert.ok(previousForward.dot(forwardMovement) > 0);
      }
      previousRight.copy(rightMovement);
      previousForward.copy(forwardMovement);
      hasPreviousSample = true;
    }
  }
});

test('floor-to-wall camera keeps a usable view at the wall base', () => {
  const target = createTarget();
  target.position.set(0, 0.46, 5.34);
  target.previousPosition.copy(target.position);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 12));
  floor.position.set(0, -0.2, 0);
  floor.name = 'room-floor';
  const world = new CollisionWorld();
  world.register(floor);
  const rig = new CameraRig();
  rig.setGroundOrbitYawRadians(Math.PI);
  rig.setFollowTarget(target, world);
  rig.update(1, 1 / 60);

  target.gameplayUp.set(0, 0, -1);
  target.attached = true;
  for (let step = 0; step < 60; step += 1) {
    rig.update(1, 1 / 60);
    assert.ok(rig.getDiagnostics().currentDistanceMetres >= 1.3,
      `camera collapsed to ${rig.getDiagnostics().currentDistanceMetres.toFixed(2)} m`);
  }
  const forward = rig.copySurfaceMovementDirection(0, -1,
    target.gameplayUp, new THREE.Vector3());
  assert.ok(forward.y > 0.8, `forward stopped climbing: ${forward.toArray()}`);
  teleportTarget(target, new THREE.Vector3(0, 6, 5.34));
  for (let step = 0; step < 90; step += 1) rig.update(1, 1 / 60);
  assert.ok(rig.camera.up.dot(target.gameplayUp) > 0.95,
    'camera did not finish its wall turn once the floor cleared');
  floor.geometry.dispose();
});

test('the rig contracts against a camera-layer wall and fully recovers when it clears', () => {
  const target = createTarget();
  const world = new CollisionWorld();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2));
  wall.name = 'camera-test-wall';
  wall.position.set(0, 1, 2);
  world.register(wall);

  const rig = new CameraRig({
    initialPitchRadians: 0,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
  });
  rig.setFollowTarget(target, world);
  rig.update(1, 1 / 60);

  const obstructed = rig.getDiagnostics();
  assert.equal(obstructed.obstructed, true);
  assert.equal(obstructed.obstructionName, 'camera-test-wall');
  assert.ok(obstructed.currentDistanceMetres < 2);

  wall.visible = false;
  for (let step = 0; step < 240; step += 1) {
    rig.update(1, 1 / 60);
  }

  const recovered = rig.getDiagnostics();
  assert.equal(recovered.obstructed, false);
  assert.ok(
    Math.abs(
      recovered.currentDistanceMetres - recovered.desiredDistanceMetres,
    ) < 1e-7,
  );

  wall.geometry.dispose();
});

test('teleport immediately removes stale camera up', () => {
  const target = createTarget();
  const rig = new CameraRig();
  rig.setFollowTarget(target, new CollisionWorld());
  rig.update(1, 0);

  target.gameplayUp.set(1, 0, 0);
  target.attached = true;
  for (let step = 0; step < 120; step += 1) {
    rig.update(1, 1 / 60);
  }
  assert.ok(rig.camera.up.x > 0.999);

  teleportTarget(target, new THREE.Vector3(10, 0.46, 0));
  target.gameplayUp.set(0, 1, 0);
  target.attached = false;
  rig.update(1, 1 / 60);

  assert.ok(rig.camera.up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-10);
});

test('teleport clears stale obstruction distance immediately', () => {
  const target = createTarget();
  const world = new CollisionWorld();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2));
  wall.position.set(0, 1, 2);
  world.register(wall);
  const rig = new CameraRig({ initialPitchRadians: 0 });
  rig.setFollowTarget(target, world);
  rig.update(1, 1 / 60);
  assert.ok(rig.getDiagnostics().currentDistanceMetres < 2);

  teleportTarget(target, new THREE.Vector3(10, 0.46, 0));
  rig.update(1, 1 / 60);

  const diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.obstructed, false);
  assert.equal(
    diagnostics.currentDistanceMetres,
    diagnostics.desiredDistanceMetres,
  );

  wall.geometry.dispose();
});

test('teleport still contracts immediately against destination obstruction', () => {
  const target = createTarget();
  const world = new CollisionWorld();
  const destinationWall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2));
  destinationWall.name = 'destination-camera-wall';
  destinationWall.position.set(10, 1, 2);
  world.register(destinationWall);
  const rig = new CameraRig({ initialPitchRadians: 0 });
  rig.setFollowTarget(target, world);
  rig.update(1, 0);

  teleportTarget(target, new THREE.Vector3(10, 0.46, 0));
  rig.update(1, 1 / 60);

  const diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.obstructed, true);
  assert.equal(diagnostics.obstructionName, 'destination-camera-wall');
  assert.ok(diagnostics.currentDistanceMetres < 2);

  destinationWall.geometry.dispose();
});
