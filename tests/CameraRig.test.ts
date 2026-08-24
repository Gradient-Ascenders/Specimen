import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';
import {
  CameraRig,
  type CameraFollowTarget,
} from '../src/render/CameraRig.ts';
import type {
  ContextualCameraAnchor,
  ContextualCameraProfile,
} from '../src/render/CameraProfile.ts';

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

test('default pitch limits provide extended upward and usable downward views', () => {
  const rig = new CameraRig();
  rig.setFollowTarget(createTarget(), new CollisionWorld());
  rig.update(1, 0);

  rig.queueLookInput(0, -10_000);
  rig.update(1, 0);
  assert.ok(
    Math.abs(
      rig.getDiagnostics().pitchRadians - THREE.MathUtils.degToRad(-80),
    ) < EPSILON,
  );
  assert.ok(
    rig.camera.getWorldDirection(new THREE.Vector3()).y >
      Math.sin(THREE.MathUtils.degToRad(79)),
  );

  rig.queueLookInput(0, 10_000);
  rig.update(1, 0);
  assert.ok(
    Math.abs(
      rig.getDiagnostics().pitchRadians - THREE.MathUtils.degToRad(65),
    ) < EPSILON,
  );
  assert.ok(
    rig.camera.getWorldDirection(new THREE.Vector3()).y <
      -Math.sin(THREE.MathUtils.degToRad(64)),
  );
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

test('Goop aim smoothly adopts a centred first-person pose and exposes its live centre ray', () => {
  const rig = new CameraRig({
    initialPitchRadians: 0,
    aimTransitionDurationSeconds: 0.2,
    aimFirstPersonDistanceMetres: 0.08,
    aimShoulderOffsetMetres: 0,
  });
  const world = new CollisionWorld();
  rig.setFollowTarget(createTarget(), world);
  rig.update(1, 0);
  const normalDistance = rig.getDiagnostics().desiredDistanceMetres;
  const initialFov = rig.camera.fov;
  const initialFocus = new THREE.Vector3().copy(
    rig.getDiagnostics().focusPosition,
  );

  rig.setAimPresentationActive(true);
  rig.update(1, 0.1);
  const entering = rig.getDiagnostics();
  assert.ok(entering.aimPresentationBlend > 0);
  assert.ok(entering.aimPresentationBlend < 1);
  assert.ok(entering.desiredDistanceMetres < normalDistance);
  assert.ok(entering.desiredDistanceMetres > 0.08);

  rig.update(1, 0.1);
  const aimed = rig.getDiagnostics();
  assert.ok(Math.abs(aimed.aimPresentationBlend - 1) < EPSILON);
  assert.ok(
    Math.abs(aimed.desiredDistanceMetres - 0.08) < EPSILON,
  );
  assert.ok(Math.abs(aimed.currentDistanceMetres - 0.08) < EPSILON);
  assert.equal(rig.camera.fov, initialFov);
  assert.ok(aimed.aimShoulderOffsetMetres < EPSILON);
  assert.ok(
    new THREE.Vector3()
      .copy(aimed.focusPosition)
      .distanceTo(initialFocus) < EPSILON,
  );

  const aimOrigin = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  rig.copyAimRay(aimOrigin, aimDirection);
  assert.ok(aimOrigin.distanceTo(rig.camera.position) < EPSILON);
  assert.ok(
    aimDirection.distanceTo(
      rig.camera.getWorldDirection(new THREE.Vector3()),
    ) < EPSILON,
  );

  rig.setAimPresentationActive(false);
  advanceRig(rig, 1);
  assert.ok(rig.getDiagnostics().aimPresentationBlend < EPSILON);
  assert.ok(rig.getDiagnostics().aimShoulderOffsetMetres < EPSILON);
  assert.ok(
    new THREE.Vector3()
      .copy(rig.getDiagnostics().focusPosition)
      .distanceTo(initialFocus) < EPSILON,
  );
  assert.ok(
    Math.abs(rig.getDiagnostics().desiredDistanceMetres - normalDistance) <
      EPSILON,
  );
});

test('contextual profile ignores vertical look through blend-out and restores manual pitch', () => {
  const target = createTarget();
  const anchor: ContextualCameraAnchor = {
    position: new THREE.Vector3(),
    previousPosition: new THREE.Vector3(),
  };
  const rig = new CameraRig({
    initialPitchRadians: 0,
    verticalSensitivityRadiansPerPixel: 1,
  });
  rig.setFollowTarget(target, new CollisionWorld());
  rig.update(1, 0);
  rig.queueLookInput(0, -0.4);
  rig.update(1, 0);
  const manualPitchBefore = rig.getDiagnostics().pitchRadians;

  rig.setContextualCamera({ profile: TEST_CONTEXTUAL_PROFILE, anchor });
  advanceRig(rig, TEST_CONTEXTUAL_PROFILE.transitionDurationSeconds);

  let diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.profileId, TEST_CONTEXTUAL_PROFILE.id);
  assert.ok(Math.abs(diagnostics.profileBlend - 1) < EPSILON);
  assert.ok(
    Math.abs(
      diagnostics.desiredDistanceMetres -
        TEST_CONTEXTUAL_PROFILE.distanceMetres,
    ) < EPSILON,
  );
  assert.ok(
    Math.abs(
      diagnostics.effectivePitchRadians -
        TEST_CONTEXTUAL_PROFILE.pitchRadians,
    ) < EPSILON,
  );

  rig.queueLookInput(0, 1);
  rig.update(1, 1 / 60);
  assert.equal(rig.getDiagnostics().pitchRadians, manualPitchBefore);

  rig.setContextualCamera(undefined);
  advanceRig(rig, TEST_CONTEXTUAL_PROFILE.transitionDurationSeconds * 0.5);
  rig.queueLookInput(0, 1);
  rig.update(1, 1 / 60);
  assert.equal(rig.getDiagnostics().pitchRadians, manualPitchBefore);

  advanceRig(rig, TEST_CONTEXTUAL_PROFILE.transitionDurationSeconds);
  diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.profileId, 'default');
  assert.ok(diagnostics.profileBlend < EPSILON);
  assert.ok(
    Math.abs(diagnostics.effectivePitchRadians - manualPitchBefore) < EPSILON,
  );
  assert.ok(rig.camera.position.toArray().every(Number.isFinite));
});

test('contextual framing follows its anchor while ignoring movement inside the dead zone', () => {
  const target = createTarget();
  const anchorPosition = new THREE.Vector3();
  const anchorPreviousPosition = new THREE.Vector3();
  const rig = new CameraRig();
  rig.setFollowTarget(target, new CollisionWorld());
  rig.setContextualCamera({
    profile: TEST_CONTEXTUAL_PROFILE,
    anchor: {
      position: anchorPosition,
      previousPosition: anchorPreviousPosition,
    },
  });
  rig.update(1, 0);
  advanceRig(rig, 6);
  const settledPosition = rig.camera.position.clone();

  target.position.x = 0.5;
  target.previousPosition.x = 0.5;
  advanceRig(rig, 1);
  assert.ok(rig.camera.position.distanceTo(settledPosition) < 1e-8);

  anchorPosition.y = 2;
  anchorPreviousPosition.y = 2;
  target.position.y += 2;
  target.previousPosition.y += 2;
  rig.update(1, 1 / 60);
  assert.ok(
    Math.abs(rig.camera.position.y - settledPosition.y - 2) < 1e-8,
  );
});

test('contextual visual framing preserves camera-relative forward movement', () => {
  const target = createTarget();
  const anchor = {
    position: new THREE.Vector3(),
    previousPosition: new THREE.Vector3(),
  };
  const rig = new CameraRig({
    horizontalSensitivityRadiansPerPixel: 1,
  });
  const movement = new THREE.Vector3();
  const displayedForward = new THREE.Vector3();
  rig.setFollowTarget(target, new CollisionWorld());
  rig.setContextualCamera({ profile: TEST_CONTEXTUAL_PROFILE, anchor });
  advanceRig(rig, 1);

  rig.queueLookInput(-Math.PI / 3, 100);
  rig.update(1, 1 / 60);
  rig.copyGroundMovementDirection(0, -1, movement);
  rig.camera
    .getWorldDirection(displayedForward)
    .projectOnPlane(WORLD_UP)
    .normalize();

  assert.ok(movement.dot(displayedForward) > 1 - EPSILON);
  assert.ok(
    Math.abs(
      rig.getDiagnostics().effectivePitchRadians -
        TEST_CONTEXTUAL_PROFILE.pitchRadians,
    ) < EPSILON,
  );
});

test('contextual framing remains finite if an authored anchor becomes invalid', () => {
  const target = createTarget();
  const anchorPosition = new THREE.Vector3();
  const rig = new CameraRig();
  rig.setFollowTarget(target, new CollisionWorld());
  rig.setContextualCamera({
    profile: TEST_CONTEXTUAL_PROFILE,
    anchor: {
      position: anchorPosition,
      previousPosition: new THREE.Vector3(),
    },
  });
  advanceRig(rig, 1);

  anchorPosition.y = Number.NaN;
  rig.update(1, 1 / 60);

  assert.ok(rig.camera.position.toArray().every(Number.isFinite));
  assert.ok(Number.isFinite(rig.getDiagnostics().effectivePitchRadians));
  assert.ok(Number.isFinite(rig.getDiagnostics().desiredDistanceMetres));
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

test('an authored ground heading orients both framing and movement predictably', () => {
  const rig = new CameraRig();
  const movement = new THREE.Vector3();

  rig.setGroundOrbitYawRadians(Math.PI);
  rig.copyGroundMovementDirection(0, -1, movement);
  assert.ok(movement.distanceTo(new THREE.Vector3(0, 0, 1)) < EPSILON);
  assert.throws(() => rig.setGroundOrbitYawRadians(Number.NaN));
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

test('gameplay-up damping is frame-subdivision invariant and never mutates movement state', () => {
  const oneStepTarget = createTarget();
  const splitStepTarget = createTarget();
  const oneStepRig = new CameraRig();
  const splitStepRig = new CameraRig();
  const oneStepWorld = new CollisionWorld();
  const splitStepWorld = new CollisionWorld();

  oneStepRig.setFollowTarget(oneStepTarget, oneStepWorld);
  splitStepRig.setFollowTarget(splitStepTarget, splitStepWorld);
  oneStepRig.update(1, 0);
  splitStepRig.update(1, 0);

  oneStepTarget.gameplayUp.set(1, 0, 0);
  splitStepTarget.gameplayUp.set(1, 0, 0);
  oneStepRig.update(1, 1);
  for (let step = 0; step < 60; step += 1) {
    splitStepRig.update(1, 1 / 60);
  }

  assert.ok(oneStepRig.camera.up.distanceTo(splitStepRig.camera.up) < 1e-8);
  assert.ok(oneStepRig.camera.up.x > 0.999);
  assert.deepEqual(oneStepTarget.position.toArray(), [0, 0.46, 0]);
  assert.deepEqual(oneStepTarget.previousPosition.toArray(), [0, 0.46, 0]);
  assert.deepEqual(oneStepTarget.velocity.toArray(), [0, 0, 0]);
  assert.deepEqual(oneStepTarget.gameplayUp.toArray(), [1, 0, 0]);
  assert.equal(oneStepTarget.grounded, true);
  assert.equal(oneStepTarget.attached, false);
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

test('a contextual high-angle profile stays beneath a blocking ceiling', () => {
  const target = createTarget();
  const world = new CollisionWorld();
  const material = new THREE.MeshBasicMaterial({ visible: false });
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.2, 20),
    material,
  );
  ceiling.name = 'camera-test-ceiling';
  ceiling.position.set(0, 3, 0);
  world.register(ceiling, CollisionLayer.CameraObstruction);
  const rig = new CameraRig();
  rig.setFollowTarget(target, world);
  rig.setContextualCamera({
    profile: TEST_CONTEXTUAL_PROFILE,
    anchor: {
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
    },
  });
  advanceRig(rig, 1);

  let diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.obstructionName, 'camera-test-ceiling');
  assert.ok(diagnostics.preferredCameraPosition.y > 3);
  assert.ok(diagnostics.resolvedCameraPosition.y < 3);
  assert.equal(diagnostics.obstructionRadiusMetres, 0.22);
  assert.ok((diagnostics.obstructionDistanceMetres ?? 0) > 0);
  assert.deepEqual(diagnostics.focusPosition, {
    x: 0,
    y: TEST_CONTEXTUAL_PROFILE.targetHeightMetres,
    z: 0,
  });
  assert.equal(
    world.sweepSphere(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 5, 0),
      0.45,
      new CollisionHit(),
      CollisionLayer.Movement,
    ),
    false,
  );

  const movement = new THREE.Vector3();
  rig.copyGroundMovementDirection(0, -1, movement);
  assert.ok(movement.distanceTo(new THREE.Vector3(0, 0, -1)) < EPSILON);

  ceiling.visible = false;
  advanceRig(rig, 4);
  diagnostics = rig.getDiagnostics();
  assert.equal(diagnostics.obstructed, false);
  assert.ok(
    Math.abs(
      diagnostics.currentDistanceMetres - diagnostics.desiredDistanceMetres,
    ) < 1e-7,
  );
  assert.ok(rig.camera.position.toArray().every(Number.isFinite));

  ceiling.geometry.dispose();
  material.dispose();
});

test('follow distance validates and recovers through collision-aware camera logic', () => {
  const rig = new CameraRig();
  rig.setFollowTarget(createTarget(), new CollisionWorld());
  rig.update(1, 0);

  rig.setFollowDistanceMetres(7);
  for (let step = 0; step < 300; step += 1) rig.update(1, 1 / 60);
  assert.equal(rig.getDiagnostics().desiredDistanceMetres, 7);
  assert.ok(
    Math.abs(rig.getDiagnostics().currentDistanceMetres - 7) < 1e-7,
  );

  rig.setFollowDistanceMetres(3.5);
  rig.update(1, 1 / 60);
  assert.equal(rig.getDiagnostics().currentDistanceMetres, 3.5);
  assert.throws(() => rig.setFollowDistanceMetres(3.49));
  assert.throws(() => rig.setFollowDistanceMetres(7.01));
  assert.throws(() => rig.setFollowDistanceMetres(Number.NaN));
});

test('tight-space scaling shortens the boom without replacing the player distance', () => {
  const rig = new CameraRig();
  rig.setFollowTarget(createTarget(), new CollisionWorld());
  rig.setFollowDistanceMetres(7);
  rig.update(1, 0);

  rig.setFollowDistanceScale(0.5);
  rig.update(1, 1 / 60);
  assert.equal(rig.getDiagnostics().desiredDistanceMetres, 3.5);
  assert.equal(rig.getDiagnostics().currentDistanceMetres, 3.5);
  assert.equal(rig.currentFollowDistanceMetres, 3.5);

  rig.setFollowDistanceScale(1);
  for (let step = 0; step < 300; step += 1) rig.update(1, 1 / 60);
  assert.equal(rig.getDiagnostics().desiredDistanceMetres, 7);
  assert.ok(Math.abs(rig.getDiagnostics().currentDistanceMetres - 7) < 1e-7);

  assert.throws(() => rig.setFollowDistanceScale(0.24));
  assert.throws(() => rig.setFollowDistanceScale(1.01));
  assert.throws(() => rig.setFollowDistanceScale(Number.NaN));
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

test('camera reset clears transient orbit state without retaining its target', () => {
  const target = createTarget();
  const rig = new CameraRig({
    horizontalSensitivityRadiansPerPixel: 1,
    verticalSensitivityRadiansPerPixel: 1,
    initialPitchRadians: 0,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
  });
  rig.setFollowTarget(target, new CollisionWorld());
  rig.update(1, 0);
  rig.queueLookInput(0.5, 0.25);
  rig.update(1, 1 / 60);
  assert.notEqual(rig.getDiagnostics().pitchRadians, 0);

  rig.clearFollowTarget();
  const reset = rig.getDiagnostics();
  assert.equal(reset.pitchRadians, 0);
  assert.equal(reset.obstructed, false);
  assert.equal(reset.targetGrounded, false);
  assert.equal(reset.targetAttached, false);

  target.position.set(20, 20, 20);
  rig.update(1, 1 / 60);
  assert.equal(rig.getDiagnostics().targetGrounded, false);
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

test('teleport preserves accumulated yaw and pitch intent', () => {
  const target = createTarget();
  const rig = new CameraRig({
    horizontalSensitivityRadiansPerPixel: 1,
    verticalSensitivityRadiansPerPixel: 1,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
    initialPitchRadians: 0,
  });
  const expectedGroundBack = new THREE.Vector3();
  const movementAfter = new THREE.Vector3();
  rig.setFollowTarget(target, new CollisionWorld());
  rig.update(1, 0);

  target.gameplayUp.set(0, 0, 1);
  target.attached = true;
  for (let step = 0; step < 120; step += 1) {
    rig.update(1, 1 / 60);
  }
  rig.queueLookInput(Math.PI / 2, -0.4);
  rig.update(1, 0);
  const pitchBefore = rig.getDiagnostics().pitchRadians;
  expectedGroundBack
    .copy(rig.camera.position)
    .sub(target.position)
    .addScaledVector(rig.camera.up, -0.35)
    .normalize()
    .addScaledVector(rig.camera.up, -Math.sin(pitchBefore))
    .multiplyScalar(1 / Math.cos(pitchBefore))
    .projectOnPlane(new THREE.Vector3(0, 1, 0))
    .normalize();

  teleportTarget(target, new THREE.Vector3(10, 0.46, 0));
  target.gameplayUp.set(0, 1, 0);
  target.attached = false;
  rig.update(1, 1 / 60);
  rig.copyGroundMovementDirection(0, 1, movementAfter);

  assert.ok(movementAfter.distanceTo(expectedGroundBack) < 1e-8);
  assert.equal(rig.getDiagnostics().pitchRadians, pitchBefore);
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
