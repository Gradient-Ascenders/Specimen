import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exponentialDampingAlpha,
  mapPointerAxisToOrbitRadians,
  resolveCameraDistance,
} from '../src/render/CameraMath.ts';

const EPSILON = 1e-10;

test('pointer sensitivity and inversion map look intent predictably', () => {
  assert.equal(mapPointerAxisToOrbitRadians(20, 0.002, false), -0.04);
  assert.equal(mapPointerAxisToOrbitRadians(20, 0.002, true), 0.04);
  assert.equal(mapPointerAxisToOrbitRadians(-10, 0.003, false), 0.03);
});

test('an obstruction shortens the boom immediately and can override the preferred minimum', () => {
  assert.equal(resolveCameraDistance(5.2, 5.2, 1.4, 0.2, 5, 1 / 60), 1.4);
  assert.equal(resolveCameraDistance(1.4, 5.2, 0.12, 0.2, 5, 1 / 60), 0.12);
});

test('unobstructed distance recovers smoothly without a permanent shortened offset', () => {
  let distance = 1.4;
  for (let step = 0; step < 600; step += 1) {
    const previous = distance;
    distance = resolveCameraDistance(
      distance,
      5.2,
      undefined,
      0.2,
      5,
      1 / 60,
    );
    assert.ok(distance >= previous);
    assert.ok(distance <= 5.2);
  }
  assert.ok(Math.abs(distance - 5.2) < EPSILON);
});

test('normal distance never settles below its configured minimum', () => {
  const distance = resolveCameraDistance(
    0.05,
    0.1,
    undefined,
    0.2,
    5,
    1,
  );
  assert.ok(distance >= 0.19);
  assert.ok(distance <= 0.2);
});

test('exponential recovery is invariant to equivalent frame subdivisions', () => {
  const oneStep = resolveCameraDistance(
    1,
    5,
    undefined,
    0.2,
    5,
    1,
  );

  let splitSteps = 1;
  for (let step = 0; step < 60; step += 1) {
    splitSteps = resolveCameraDistance(
      splitSteps,
      5,
      undefined,
      0.2,
      5,
      1 / 60,
    );
  }

  assert.ok(Math.abs(oneStep - splitSteps) < EPSILON);
  assert.ok(
    Math.abs(exponentialDampingAlpha(5, 1) - (1 - Math.exp(-5))) <
      EPSILON,
  );
});
