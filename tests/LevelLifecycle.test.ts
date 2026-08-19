import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LevelLifecycle,
  type LevelLifecycleHooks,
} from '../src/levels/LevelLifecycle.ts';

function createHarness(): {
  lifecycle: LevelLifecycle;
  calls: string[];
} {
  const calls: string[] = [];
  const hooks: LevelLifecycleHooks = {
    load: () => calls.push('load'),
    start: () => calls.push('start'),
    stop: () => calls.push('stop'),
    restart: () => calls.push('restart'),
    unload: () => calls.push('unload'),
  };
  return { lifecycle: new LevelLifecycle(hooks), calls };
}

test('lifecycle enforces load, start, stop, restart, and unload order', () => {
  const { lifecycle, calls } = createHarness();

  assert.equal(lifecycle.state, 'unloaded');
  lifecycle.load();
  lifecycle.load();
  lifecycle.start();
  lifecycle.start();
  lifecycle.restartLevel();
  lifecycle.stop();
  lifecycle.restartLevel();
  lifecycle.unload();

  assert.deepEqual(calls, [
    'load',
    'start',
    'stop',
    'restart',
    'start',
    'stop',
    'restart',
    'unload',
  ]);
  assert.equal(lifecycle.restartCount, 2);
  assert.equal(lifecycle.state, 'unloaded');
});

test('reentrant restart is ignored and executes the reset hook once', () => {
  const calls: string[] = [];
  let lifecycle: LevelLifecycle;
  lifecycle = new LevelLifecycle({
    load: () => calls.push('load'),
    start: () => calls.push('start'),
    stop: () => calls.push('stop'),
    restart: () => {
      calls.push('restart');
      lifecycle.restartLevel();
    },
    unload: () => calls.push('unload'),
  });

  lifecycle.load();
  lifecycle.start();
  lifecycle.restartLevel();

  assert.deepEqual(calls, ['load', 'start', 'stop', 'restart', 'start']);
  assert.equal(lifecycle.restartCount, 1);
  assert.equal(lifecycle.state, 'running');
});

test('ten running restarts execute one reset each without duplicating load', () => {
  const { lifecycle, calls } = createHarness();
  lifecycle.load();
  lifecycle.start();

  for (let cycle = 0; cycle < 10; cycle += 1) {
    lifecycle.restartLevel();
  }

  assert.equal(calls.filter((call) => call === 'load').length, 1);
  assert.equal(calls.filter((call) => call === 'restart').length, 10);
  assert.equal(calls.filter((call) => call === 'stop').length, 10);
  assert.equal(calls.filter((call) => call === 'start').length, 11);
  assert.equal(lifecycle.restartCount, 10);
  assert.equal(lifecycle.state, 'running');
});

test('repeated load and unload cycles do not multiply owned cleanup', () => {
  const { lifecycle, calls } = createHarness();

  for (let cycle = 0; cycle < 3; cycle += 1) {
    lifecycle.load();
    lifecycle.start();
    lifecycle.unload();
  }

  assert.equal(calls.filter((call) => call === 'load').length, 3);
  assert.equal(calls.filter((call) => call === 'start').length, 3);
  assert.equal(calls.filter((call) => call === 'stop').length, 3);
  assert.equal(calls.filter((call) => call === 'unload').length, 3);
  assert.equal(lifecycle.state, 'unloaded');
});

test('dispose is idempotent and rejects later lifecycle operations', () => {
  const { lifecycle, calls } = createHarness();
  lifecycle.load();
  lifecycle.start();
  lifecycle.dispose();
  lifecycle.dispose();

  assert.deepEqual(calls, ['load', 'start', 'stop', 'unload']);
  assert.equal(lifecycle.state, 'disposed');
  assert.throws(() => lifecycle.load(), /disposed/);
  assert.throws(() => lifecycle.start(), /disposed/);
  assert.throws(() => lifecycle.restartLevel(), /disposed/);
});

test('failed restart leaves a stopped runtime and does not increment count', () => {
  const lifecycle = new LevelLifecycle({
    load: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    restart: () => {
      throw new Error('reset failure');
    },
    unload: () => undefined,
  });
  lifecycle.load();
  lifecycle.start();

  assert.throws(() => lifecycle.restartLevel(), /reset failure/);
  assert.equal(lifecycle.state, 'stopped');
  assert.equal(lifecycle.restartCount, 0);
});
