import assert from 'node:assert/strict';
import test from 'node:test';

import { Loop, type LoopProfiler, type LoopStats } from '../src/core/Loop.ts';

const createHosts = (): { document: Document; window: Window } => {
  const hostDocument = Object.assign(new EventTarget(), {
    hidden: false,
    hasFocus: () => true,
  });
  const hostWindow = Object.assign(new EventTarget(), { performance });
  return {
    document: hostDocument as unknown as Document,
    window: hostWindow as unknown as Window,
  };
};

test('disabled loop profiling does not add callbacks or change update/render counts', () => {
  const calls: string[] = [];
  const profiler: LoopProfiler = {
    enabled: false,
    beginFrame: () => calls.push('begin-frame'),
    beginRender: () => calls.push('begin-render'),
    endFrame: () => calls.push('end-frame'),
  };
  const hosts = createHosts();
  let updates = 0;
  let renders = 0;
  const loop = new Loop({
    fixedUpdate: () => { updates += 1; },
    render: () => { renders += 1; },
    profiler,
    ...hosts,
  });

  loop.tick(0);
  loop.tick(16.67);

  assert.equal(updates, 1);
  assert.equal(renders, 2);
  assert.deepEqual(calls, []);
  loop.dispose();
});

test('enabled loop profiling brackets one complete frame', () => {
  const calls: string[] = [];
  let capturedStats: Readonly<LoopStats> | undefined;
  const profiler: LoopProfiler = {
    enabled: true,
    beginFrame: () => calls.push('begin-frame'),
    beginRender: () => calls.push('begin-render'),
    endFrame: (stats, updateCpuMs, renderCpuMs) => {
      calls.push('end-frame');
      capturedStats = stats;
      assert.ok(updateCpuMs >= 0);
      assert.ok(renderCpuMs >= 0);
    },
  };
  const hosts = createHosts();
  const loop = new Loop({
    fixedUpdate: () => calls.push('update'),
    render: () => calls.push('render'),
    ...hosts,
  });
  loop.setProfiler(profiler);

  loop.tick(0);
  calls.length = 0;
  loop.tick(16.67);

  assert.deepEqual(calls, [
    'begin-frame',
    'update',
    'begin-render',
    'render',
    'end-frame',
  ]);
  assert.equal(capturedStats?.stepsThisFrame, 1);
  loop.dispose();
});
