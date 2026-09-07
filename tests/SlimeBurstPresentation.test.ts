import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { SlimeBurstPresentation } from '../src/render/slime/SlimeBurstPresentation.ts';
import {
  DEFAULT_DEATH_BURST_DURATION_SECONDS,
  DeathSequence,
} from '../src/systems/DeathSequence.ts';

test('slime burst primes both cold geometries and instance buffers before first use', () => {
  const burst = new SlimeBurstPresentation();
  const before = burst.diagnostics;
  let primeDraws = 0;

  assert.equal(before.resourcesPrimed, false);
  assert.equal(before.resourcePrimeCount, 0);
  assert.equal(before.active, false);
  assert.equal(burst.root.visible, false);

  assert.equal(
    burst.primeResources(new THREE.Vector3(2, 3, 4), (root) => {
      primeDraws += 1;
      assert.equal(root.visible, true);
      assert.deepEqual(root.position.toArray(), [2, 3, 4]);
      const droplets = root.getObjectByName('player-slime-death-droplets');
      const core = root.getObjectByName('player-slime-death-rupture-core');
      assert.ok(droplets instanceof THREE.InstancedMesh);
      assert.ok(core instanceof THREE.Mesh);
      assert.equal(
        droplets.geometry.name,
        'player-slime-death-droplet-sphere-geometry',
      );
      assert.equal(
        core.geometry.name,
        'player-slime-death-rupture-core-geometry',
      );
      assert.equal(
        droplets.instanceMatrix.name,
        'player-slime-death-droplet-instance-transforms',
      );
      assert.equal(
        droplets.instanceColor?.name,
        'player-slime-death-droplet-instance-colours',
      );
      assert.equal(burst.diagnostics.active, false);
    }),
    true,
  );

  assert.equal(primeDraws, 1);
  assert.equal(burst.diagnostics.resourcesPrimed, true);
  assert.equal(burst.diagnostics.resourcePrimeCount, 1);
  assert.equal(burst.diagnostics.active, false);
  assert.equal(burst.root.visible, false);
  assert.deepEqual(burst.root.position.toArray(), [0, 0, 0]);
  assert.equal(burst.primeResources(new THREE.Vector3(), () => {
    primeDraws += 1;
  }), false);
  assert.equal(primeDraws, 1);
  assert.equal(burst.start(new THREE.Vector3(5, 6, 7)), true);
  assert.deepEqual(burst.root.position.toArray(), [5, 6, 7]);

  burst.dispose();
});

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
