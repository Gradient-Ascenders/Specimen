import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { SlimeBurstPresentation } from '../src/render/slime/SlimeBurstPresentation.ts';
import {
  DEFAULT_DEATH_BURST_DURATION_SECONDS,
  DeathSequence,
} from '../src/systems/DeathSequence.ts';

test('slime burst starts once at the supplied death position and expands', () => {
  const burst = new SlimeBurstPresentation();
  const deathPosition = new THREE.Vector3(3.25, 1.1, -4.5);

  assert.equal(burst.start(deathPosition), true);
  assert.equal(burst.start(new THREE.Vector3(99, 99, 99)), false);
  assert.equal(burst.root.visible, true);
  assert.ok(burst.diagnostics.origin.equals(deathPosition));

  burst.update(1 / 60);
  assert.ok(burst.diagnostics.maximumFragmentDistanceMetres > 0);
  assert.ok(burst.root.position.equals(deathPosition));

  burst.dispose();
});

test('slime burst reset removes transient presentation and supports another life', () => {
  const burst = new SlimeBurstPresentation();

  burst.start(new THREE.Vector3(1, 2, 3));
  for (let step = 0; step < 20; step += 1) burst.update(1 / 60);
  assert.equal(burst.diagnostics.active, true);

  burst.reset();
  assert.equal(burst.diagnostics.active, false);
  assert.equal(burst.diagnostics.elapsedSeconds, 0);
  assert.equal(burst.root.visible, false);

  const secondPosition = new THREE.Vector3(-2, 0.5, 6);
  assert.equal(burst.start(secondPosition), true);
  assert.ok(burst.diagnostics.origin.equals(secondPosition));

  for (let step = 0; step < 90; step += 1) burst.update(1 / 60);
  assert.equal(burst.diagnostics.active, false);
  assert.equal(burst.root.visible, false);

  burst.dispose();
});

test('game over cannot begin before the shared slime burst phase completes', () => {
  const sequence = new DeathSequence();
  const burst = new SlimeBurstPresentation();
  const finalStepSeconds = 1 / 60;

  assert.equal(sequence.requestDeath(() => undefined), true);
  assert.equal(burst.start(new THREE.Vector3()), true);

  const beforeCompletionSeconds =
    DEFAULT_DEATH_BURST_DURATION_SECONDS - finalStepSeconds;
  burst.update(beforeCompletionSeconds);
  assert.equal(sequence.update(beforeCompletionSeconds), false);
  assert.equal(burst.diagnostics.active, true);
  assert.equal(sequence.state, 'bursting');
  assert.equal(sequence.canRetry, false);

  // Production updates presentation first, then advances authoritative state.
  burst.update(finalStepSeconds);
  assert.equal(burst.diagnostics.active, false);
  assert.equal(sequence.update(finalStepSeconds), true);
  assert.equal(sequence.state, 'gameOver');
  assert.equal(sequence.canRetry, true);

  burst.dispose();
});
