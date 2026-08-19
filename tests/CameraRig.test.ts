import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import {
  CameraRig,
  type CameraFollowTarget,
} from '../src/render/CameraRig.ts';

interface MutableCameraTarget extends CameraFollowTarget {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  gameplayUp: THREE.Vector3;
  grounded: boolean;
  attached: boolean;
}

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
