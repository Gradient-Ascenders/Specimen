import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { sweptSpherePairFraction } from '../src/physics/ContinuousCollision.ts';

test('moving sphere sweeps find the earliest contact without tunnelling', () => {
  const fraction = sweptSpherePairFraction(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(10, 0, 0),
    0.1,
    new THREE.Vector3(6, 0, 0),
    new THREE.Vector3(-2, 0, 0),
    0.4,
  );
  assert.ok(fraction !== undefined);
  assert.ok(Math.abs(fraction - 5.5 / 12) < 1e-9);
});

test('moving sphere sweeps handle initial overlap and separated parallel motion', () => {
  assert.equal(
    sweptSpherePairFraction(
      new THREE.Vector3(),
      new THREE.Vector3(1, 0, 0),
      0.5,
      new THREE.Vector3(0.5, 0, 0),
      new THREE.Vector3(1, 0, 0),
      0.5,
    ),
    0,
  );
  assert.equal(
    sweptSpherePairFraction(
      new THREE.Vector3(),
      new THREE.Vector3(1, 0, 0),
      0.2,
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(1, 0, 0),
      0.2,
    ),
    undefined,
  );
});
