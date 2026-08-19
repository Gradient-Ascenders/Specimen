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
