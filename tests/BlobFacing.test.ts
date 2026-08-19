import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  BlobFacing,
  moveAngleTowards,
  shortestAngleDelta,
} from '../src/render/BlobFacing.ts';

const EPSILON = 1e-10;

test('blob facing turns toward actual movement and holds while stationary', () => {
  const facing = new BlobFacing({ turnSpeedRadiansPerSecond: Math.PI });

  facing.update(0.25, new THREE.Vector3(1, 3, 0));
  assert.ok(Math.abs(facing.yawRadians + Math.PI / 4) < EPSILON);

  facing.update(1, new THREE.Vector3(1, -8, 0));
  assert.ok(Math.abs(facing.yawRadians + Math.PI / 2) < EPSILON);

  facing.update(1, new THREE.Vector3(0, 0, 0));
  assert.ok(Math.abs(facing.yawRadians + Math.PI / 2) < EPSILON);
});

test('blob facing holds below its nonzero speed threshold and turns above it', () => {
  const facing = new BlobFacing();

  facing.update(1 / 60, new THREE.Vector3(0.049, 0, 0));
  assert.equal(facing.yawRadians, 0);

  facing.update(1 / 60, new THREE.Vector3(0.051, 0, 0));
  assert.notEqual(facing.yawRadians, 0);
});

test('blob facing turn rate is invariant to fixed-step subdivision', () => {
  const oneStep = new BlobFacing({ turnSpeedRadiansPerSecond: Math.PI });
  const splitSteps = new BlobFacing({ turnSpeedRadiansPerSecond: Math.PI });
  const velocity = new THREE.Vector3(1, 0, 0);

  oneStep.update(0.25, velocity);
  for (let step = 0; step < 15; step += 1) {
    splitSteps.update(1 / 60, velocity);
  }

  assert.ok(Math.abs(oneStep.yawRadians - splitSteps.yawRadians) < EPSILON);
});

test('angular helpers take the short path across the wrap boundary', () => {
  const from = THREE.MathUtils.degToRad(179);
  const to = THREE.MathUtils.degToRad(-179);
  assert.ok(Math.abs(shortestAngleDelta(from, to) - THREE.MathUtils.degToRad(2)) < EPSILON);

  const moved = moveAngleTowards(from, to, THREE.MathUtils.degToRad(1));
  assert.ok(Math.abs(shortestAngleDelta(from, moved) - THREE.MathUtils.degToRad(1)) < EPSILON);
});

test('render interpolation also uses the shortest yaw arc', () => {
  const facing = new BlobFacing({ turnSpeedRadiansPerSecond: Math.PI * 4 });
  const positiveYaw = THREE.MathUtils.degToRad(179);
  const negativeYaw = THREE.MathUtils.degToRad(-179);
  facing.update(
    1,
    new THREE.Vector3(-Math.sin(positiveYaw), 0, -Math.cos(positiveYaw)),
  );
  facing.update(
    1,
    new THREE.Vector3(-Math.sin(negativeYaw), 0, -Math.cos(negativeYaw)),
  );

  const halfway = facing.getInterpolatedYaw(0.5);
  const currentDistance = Math.abs(
    shortestAngleDelta(halfway, facing.yawRadians),
  );
  assert.ok(Math.abs(currentDistance - THREE.MathUtils.degToRad(1)) < EPSILON);
});
