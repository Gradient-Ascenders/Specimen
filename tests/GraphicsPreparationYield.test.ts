import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphicsPreparationYield } from '../src/render/GraphicsPreparationYield.ts';

test('uses the browser scheduler without allocating a message channel', async () => {
  let release!: () => void;
  const yieldTask = new GraphicsPreparationYield({yield: () => new Promise<void>(resolve => release = resolve)},
    () => { throw new Error('unnecessary channel'); });
  let completed = false;
  const pending = yieldTask.yield().then(() => completed = true);
  await Promise.resolve();
  assert.equal(completed, false);
  release(); await pending;
  assert.equal(completed, true);
  yieldTask.dispose();
});

test('fallback yields through browser tasks, reuses its channel and releases waiting jobs on disposal', async () => {
  let created = 0, posted = 0, closed = 0;
  const channel = {
    port1: {onmessage: undefined as (() => void) | undefined, close: () => closed++},
    port2: {postMessage: () => posted++, close: () => closed++},
  };
  const yieldTask = new GraphicsPreparationYield(undefined, () => {
    created++; return channel as unknown as MessageChannel;
  });
  const completed: number[] = [];
  const first = yieldTask.yield().then(() => completed.push(1));
  const second = yieldTask.yield().then(() => completed.push(2));
  await Promise.resolve();
  assert.deepEqual(completed, [], 'a resolved microtask must not drain the loading jobs');
  assert.equal(created, 1); assert.equal(posted, 2);
  channel.port1.onmessage!(); await first;
  assert.deepEqual(completed, [1]);
  yieldTask.dispose(); await second;
  assert.deepEqual(completed, [1, 2]);
  assert.equal(closed, 2);
  await yieldTask.yield(); yieldTask.dispose();
  assert.equal(posted, 2); assert.equal(closed, 2);
});
