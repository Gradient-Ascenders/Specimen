import assert from 'node:assert/strict';
import test from 'node:test';

import { DeathSequence } from '../src/systems/DeathSequence.ts';

const NOOP_RECOVERY = (): void => undefined;

test('death advances once from gameplay through burst to game over', () => {
  const sequence = new DeathSequence({ burstDurationSeconds: 0.5 });

  assert.equal(sequence.state, 'playing');
  assert.equal(sequence.requestDeath(NOOP_RECOVERY), true);
  assert.equal(sequence.requestDeath(NOOP_RECOVERY), false);
  assert.equal(sequence.state, 'bursting');
  assert.equal(sequence.canRetry, false);
  assert.equal(sequence.completeRetry(), false);

  assert.equal(sequence.update(0.47), false);
  assert.equal(sequence.state, 'bursting');
  assert.equal(sequence.update(0.04), true);
  assert.equal(sequence.state, 'gameOver');
  assert.equal(sequence.update(1 / 60), false);
  assert.equal(sequence.requestDeath(NOOP_RECOVERY), false);

  assert.deepEqual(sequence.diagnostics, {
    state: 'gameOver',
    elapsedSeconds: 0.5,
    acceptedDeathCount: 1,
    completedRetryCount: 0,
  });
});

test('retry rearms a clean sequence for repeated deaths', () => {
  const sequence = new DeathSequence({ burstDurationSeconds: 0.05 });
  let recoveryCount = 0;

  for (let cycle = 0; cycle < 10; cycle += 1) {
    assert.equal(
      sequence.requestDeath(() => {
        recoveryCount += 1;
      }),
      true,
    );
    assert.equal(sequence.requestDeath(NOOP_RECOVERY), false);
    assert.equal(sequence.update(0.05), true);
    assert.equal(sequence.canRetry, true);
    assert.equal(sequence.completeRetry(), true);
    assert.equal(sequence.completeRetry(), false);
    assert.equal(sequence.state, 'playing');
  }

  assert.equal(sequence.diagnostics.acceptedDeathCount, 10);
  assert.equal(sequence.diagnostics.completedRetryCount, 10);
  assert.equal(recoveryCount, 10);
});

test('retry keeps game over active until authoritative recovery succeeds', () => {
  const sequence = new DeathSequence({ burstDurationSeconds: 0.05 });
  let recoveryAttempts = 0;
  let stateDuringRecovery = sequence.state;

  sequence.requestDeath(() => {
    recoveryAttempts += 1;
    stateDuringRecovery = sequence.state;
    if (recoveryAttempts === 1) throw new Error('checkpoint reset failed');
  });
  sequence.update(0.05);

  assert.throws(() => sequence.completeRetry(), /checkpoint reset failed/);
  assert.equal(stateDuringRecovery, 'gameOver');
  assert.equal(sequence.state, 'gameOver');
  assert.equal(sequence.diagnostics.completedRetryCount, 0);

  assert.equal(sequence.completeRetry(), true);
  assert.equal(recoveryAttempts, 2);
  assert.equal(sequence.state, 'playing');
  assert.equal(sequence.diagnostics.completedRetryCount, 1);
});

test('reset cancels an in-flight death without leaving a stale transition', () => {
  const sequence = new DeathSequence({ burstDurationSeconds: 0.5 });

  sequence.requestDeath(NOOP_RECOVERY);
  sequence.update(0.3);
  sequence.reset();

  assert.equal(sequence.state, 'playing');
  assert.equal(sequence.diagnostics.elapsedSeconds, 0);
  assert.equal(sequence.update(0.3), false);
  assert.equal(sequence.state, 'playing');
  assert.equal(sequence.requestDeath(NOOP_RECOVERY), true);
});

test('death timing rejects invalid fixed-step inputs', () => {
  const sequence = new DeathSequence();
  sequence.requestDeath(NOOP_RECOVERY);

  assert.throws(() => sequence.update(0), /positive and finite/);
  assert.throws(() => sequence.update(Number.NaN), /positive and finite/);
  assert.throws(
    () => new DeathSequence({ burstDurationSeconds: -1 }),
    /positive and finite/,
  );
});
