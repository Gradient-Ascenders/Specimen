import assert from 'node:assert/strict';
import test from 'node:test';
import { IdleCinematicPreparation, type CinematicPreparationJob } from '../src/cinematics/IdleCinematicPreparation.ts';

function fixture(jobs: CinematicPreparationJob[], canRun = (_gpu: boolean) => true) {
  let callback: IdleRequestCallback | undefined, nextId = 0, cancelled = 0;
  const queue = new IdleCinematicPreparation(jobs, {
    requestIdleCallback: fn => { callback = fn; return ++nextId; },
    cancelIdleCallback: () => { callback = undefined; cancelled++; },
  }, canRun);
  return { queue, fire: (budget = 12, didTimeout = false) => {
    const fn = callback; callback = undefined; fn?.({ didTimeout, timeRemaining: () => budget });
  }, hasCallback: () => !!callback, cancelled: () => cancelled };
}
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));

test('idle preparation requires real spare time and never forces a deadline or busy loop', async () => {
  let count = 0;
  const f = fixture([{ label: 'one', run: () => { count++; } }]);
  f.queue.schedule(); f.fire(7); assert.equal(count, 0); assert.equal(f.hasCallback(), false);
  f.queue.schedule(); f.fire(20, true); assert.equal(count, 0);
  f.queue.schedule(); f.fire(); await tick(); assert.equal(count, 1);
  assert.equal(f.hasCallback(), false, 'Only the render loop requests the next idle job.');
  f.queue.schedule(); f.fire(); assert.equal(f.queue.ready, true);
});

test('one job per callback, GPU work waits for eligible Room 5 lighting, and paused work waits', async () => {
  let allowed = true, gpuAllowed = false;
  const ran: string[] = [];
  const f = fixture([
    { label: 'cpu', run: () => { ran.push('cpu'); } },
    { label: 'gpu', gpu: true, run: () => { ran.push('gpu'); } },
  ], gpu => allowed && (!gpu || gpuAllowed));
  f.queue.schedule(); f.fire(); await tick(); assert.deepEqual(ran, ['cpu']);
  f.queue.schedule(); f.fire(); assert.deepEqual(ran, ['cpu']);
  gpuAllowed = true; allowed = false; f.queue.schedule(); f.fire(); assert.deepEqual(ran, ['cpu']);
  allowed = true; f.queue.schedule(); f.fire(); await tick(); assert.deepEqual(ran, ['cpu', 'gpu']);
});

test('an async job cannot overlap another job, even during an opaque fallback hold', async () => {
  let finish!: () => void, count = 0;
  const f = fixture([
    { label: 'import', run: () => new Promise<void>(resolve => { finish = resolve; }) },
    { label: 'geometry', run: () => { count++; } },
  ]);
  f.queue.schedule(); f.fire(); f.queue.finishOneJobUnderBlack(); assert.equal(count, 0);
  finish(); await tick(); f.queue.finishOneJobUnderBlack(); await tick(); assert.equal(count, 1);
  assert.equal(f.queue.diagnostics.completed, 2);
});

test('disposal cancels the idle slot; a failed job cannot repeatedly reschedule', async () => {
  const f = fixture([{ label: 'failure', run: async () => { throw Error('not available'); } }]);
  f.queue.schedule(); f.fire(); await tick(); assert.equal(f.queue.diagnostics.failed, true);
  f.queue.schedule(); assert.equal(f.hasCallback(), false);
  const g = fixture([{ label: 'never', run: () => assert.fail('disposed work') }]);
  g.queue.schedule(); g.queue.dispose(); g.fire(); assert.equal(g.cancelled(), 1);
});

test('browsers without requestIdleCallback do not silently run heavy work during play', async () => {
  let ran = 0;
  const q = new IdleCinematicPreparation([{ label: 'fallback', run: () => { ran++; } }], {}, () => true);
  q.schedule(); await tick(); assert.equal(ran, 0);
  q.finishOneJobUnderBlack(); await tick(); assert.equal(ran, 1);
  q.finishOneJobUnderBlack(); assert.equal(q.ready, true); q.dispose();
});
