import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForGpuPreparation } from '../src/render/WaitForGpuPreparation.ts';

function fixture(statuses = [4]) {
  let waits = 0, yields = 0, deleted = 0, flushed = 0, lost = false, current = true;
  const fence = {} as WebGLSync;
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 4, WAIT_FAILED: 8,
    fenceSync: (condition: number, flags: number) => {
      assert.equal(condition, 1); assert.equal(flags, 0); return fence;
    },
    clientWaitSync: (sync: WebGLSync, flags: number, timeout: number) => {
      assert.equal(sync, fence); assert.equal(flags, 0);
      assert.equal(timeout, 0, 'Never block the main thread waiting for the GPU.');
      return statuses[Math.min(waits++, statuses.length - 1)];
    },
    deleteSync: (sync: WebGLSync) => { assert.equal(sync, fence); deleted++; },
    flush: () => { flushed++; }, isContextLost: () => lost,
  };
  return { context, yieldFrame: async () => { yields++; }, isCurrent: () => current,
    loseContext: () => { lost = true; }, cancel: () => { current = false; },
    counts: () => ({ waits, yields, deleted, flushed }) };
}

for (const status of [2, 4]) test(`already completed GPU preparation releases its fence (status ${status})`, async () => {
  const f = fixture([status]);
  await waitForGpuPreparation(f.context, f.yieldFrame);
  assert.deepEqual(f.counts(), { waits: 1, yields: 0, deleted: 1, flushed: 1 });
});

test('queued GPU jobs keep the preparation pending, yielding once between nonblocking polls', async () => {
  const f = fixture([16, 16, 4]);
  await waitForGpuPreparation(f.context, f.yieldFrame);
  assert.deepEqual(f.counts(), { waits: 3, yields: 2, deleted: 1, flushed: 1 });
});

test('cancellation stops polling and frees the pending fence', async () => {
  const f = fixture([16]);
  await waitForGpuPreparation(f.context, async () => { await f.yieldFrame(); f.cancel(); }, f.isCurrent);
  assert.deepEqual(f.counts(), { waits: 1, yields: 1, deleted: 1, flushed: 1 });
  await waitForGpuPreparation(f.context, f.yieldFrame, f.isCurrent);
  assert.equal(f.counts().flushed, 1, 'Cancelled work must not issue more GPU commands.');
});

test('failed waits, lost contexts and rejected yields free fences and report preparation failures', async () => {
  const failed = fixture([8]);
  await assert.rejects(waitForGpuPreparation(failed.context, failed.yieldFrame), /preparation failed/);
  assert.equal(failed.counts().deleted, 1);
  const lost = fixture(); lost.loseContext();
  await assert.rejects(waitForGpuPreparation(lost.context, lost.yieldFrame), /context lost/);
  assert.equal(lost.counts().deleted, 1);
  const rejected = fixture([16]);
  await assert.rejects(waitForGpuPreparation(rejected.context, async () => { throw new Error('stopped'); }), /stopped/);
  assert.equal(rejected.counts().deleted, 1);
  const unavailable = fixture(); unavailable.context.fenceSync = () => null as unknown as WebGLSync;
  await assert.rejects(waitForGpuPreparation(unavailable.context, unavailable.yieldFrame), /Could not finish/);
  assert.equal(unavailable.counts().flushed, 0);
  await assert.rejects(waitForGpuPreparation({} as WebGLRenderingContext, async () => {}), /requires WebGL2/);
});
