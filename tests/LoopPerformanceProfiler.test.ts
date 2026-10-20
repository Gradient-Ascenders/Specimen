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

test('long-frame diagnostics include the clamp without changing the six-step simulation budget', () => {
  const hosts = createHosts();
  let updates = 0;
  const loop = new Loop({ ...hosts, fixedUpdate: () => { updates += 1; }, render: () => {} });
  loop.tick(0);
  loop.tick(1000);
  assert.equal(updates, 6);
  assert.equal(loop.stats.stepsThisFrame, 6);
  assert.equal(loop.stats.rawFrameDeltaSeconds, 1);
  assert.equal(loop.stats.frameDeltaSeconds, .1);
  assert.ok(Math.abs(loop.stats.droppedSimulationTimeSeconds - .9) < 1e-9);
  loop.tick(1000 + 1000 / 60);
  assert.equal(updates, 7, 'discarded time does not create a later catch-up backlog');
  assert.equal(loop.stats.droppedSimulationTimeSeconds, 0);
  loop.dispose();
});

test('dropped-time diagnostics sum frame clamping and a custom fixed-step cap', () => {
  const hosts = createHosts();
  let updates = 0;
  const loop = new Loop({ ...hosts, maxStepsPerFrame: 2,
    fixedUpdate: () => { updates += 1; }, render: () => {} });
  loop.tick(0);
  loop.tick(1000);
  assert.equal(updates, 2);
  assert.ok(Math.abs(loop.stats.droppedSimulationTimeSeconds - (1 - 2 / 60)) < 1e-9);
  assert.ok(loop.stats.interpolationAlpha < 1);
  loop.dispose();
});

for (const cap of [2, 6]) for (const stallMs of [100, 500, 1000]) {
  test(`${stallMs} ms repeated stalls with cap ${cap} conserve admitted time and recover without backlog`, () => {
    const hosts = createHosts();
    let simulated = 0;
    const loop = new Loop({...hosts, maxStepsPerFrame: cap,
      fixedUpdate: dt => { simulated += dt; }, render: () => {}});
    loop.tick(0);
    let dropped = 0;
    for (let frame = 1; frame <= 20; frame++) {
      loop.tick(frame * stallMs);
      dropped += loop.stats.droppedSimulationTimeSeconds;
      assert.equal(loop.stats.stepsThisFrame, cap);
      assert.ok(loop.stats.interpolationAlpha >= 0 && loop.stats.interpolationAlpha <= 1);
      assert.ok(Math.abs(frame * stallMs / 1000 - simulated - dropped -
        loop.stats.interpolationAlpha / 60) < 1e-8);
    }
    loop.tick(20 * stallMs + 1000 / 60);
    assert.equal(loop.stats.stepsThisFrame, 1);
    assert.equal(loop.stats.droppedSimulationTimeSeconds, 0);
    loop.dispose();
  });
}

test('pause, blur, hidden/focus, resume and disposal exclude inactive gaps and reset interpolation', () => {
  const hosts = createHosts();
  let hidden = false, focused = true, updates = 0, renders = 0;
  Object.defineProperties(hosts.document, {
    hidden: {get: () => hidden}, hasFocus: {value: () => focused},
  });
  const loop = new Loop({...hosts, fixedUpdate: () => updates++, render: () => renders++});
  loop.tick(0); loop.tick(25);
  assert.ok(loop.stats.interpolationAlpha > 0);
  for (const reason of ['pause', 'blur', 'hidden']) {
    if (reason === 'pause') loop.pause();
    if (reason === 'blur') { focused = false; hosts.window.dispatchEvent(new Event('blur')); }
    if (reason === 'hidden') {
      hidden = true; hosts.document.dispatchEvent(new Event('visibilitychange'));
      hosts.window.dispatchEvent(new Event('focus')); // still hidden: cannot resume
    }
    const before = updates;
    loop.tick(10000);
    assert.equal(updates, before);
    hidden = false;
    if (reason === 'pause') loop.resume();
    else {
      focused = false;
      hosts.document.dispatchEvent(new Event('visibilitychange'));
      loop.tick(15000);
      assert.equal(updates,before,'visible without focus remains paused');
      focused = true;
      hosts.window.dispatchEvent(new Event('focus'));
    }
    loop.tick(20000);
    assert.equal(loop.stats.rawFrameDeltaSeconds, 0);
    assert.equal(loop.stats.interpolationAlpha, 0);
    assert.equal(loop.stats.droppedSimulationTimeSeconds, 0);
    loop.tick(20000 + 1000 / 60);
    assert.equal(updates, before + 1);
  }
  loop.dispose(); loop.dispose();
  const before = renders;
  hosts.window.dispatchEvent(new Event('focus')); loop.resume(); loop.tick(50000);
  assert.equal(renders, before);
});
