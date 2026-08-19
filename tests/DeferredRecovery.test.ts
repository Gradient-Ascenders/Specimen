import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DeathSequence } from '../src/systems/DeathSequence.ts';

test('death defers checkpoint-group recovery until Retry', () => {
  const checkpointSpawn = new THREE.Vector3(0, 0.46, -1.8);
  const recoveryOrder: string[] = [];
  const checkpoints = {
    recover(target: { recoverAt(position: THREE.Vector3): void }): void {
      recoveryOrder.push('reset puzzle group');
      target.recoverAt(checkpointSpawn);
    },
  };
  const player = {
    position: new THREE.Vector3(-4, 0.62, 3.6),
    recoverAt(position: THREE.Vector3): void {
      recoveryOrder.push('recover player');
      this.position.copy(position);
    },
  };
  const deathSequence = new DeathSequence({ burstDurationSeconds: 0.05 });

  assert.equal(
    deathSequence.requestDeath(() => checkpoints.recover(player)),
    true,
  );
  assert.equal(deathSequence.state, 'bursting');
  assert.ok(player.position.distanceTo(checkpointSpawn) > 1);
  assert.deepEqual(recoveryOrder, []);

  assert.equal(deathSequence.update(0.05), true);
  assert.equal(deathSequence.completeRetry(), true);

  assert.ok(player.position.equals(checkpointSpawn));
  assert.deepEqual(recoveryOrder, [
    'reset puzzle group',
    'recover player',
  ]);
  assert.equal(deathSequence.state, 'playing');
});
