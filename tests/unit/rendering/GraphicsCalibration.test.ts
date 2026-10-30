import assert from 'node:assert/strict';
import test from 'node:test';
import { calibrateGraphics, calibrateGraphicsProfiles, combineGraphicsMeasurements,
  GraphicsCalibrationTiming, GRAPHICS_CALIBRATION_TOTAL_SAMPLE_BUDGET_MS, incompleteGraphicsMeasurement, type GraphicsCalibrationMeasurement } from '../../../src/render/GraphicsCalibration.ts';

function gpuFixture(options: { gpuMs?: number; cpuMs?: number; pollMs?: number; timers?: boolean;
  warmMs?: number; drainMs?: number; cancelAt?: number; disjoint?: boolean; failFence?: boolean; budgetMs?: number; preparationMs?: number } = {}) {
  let clock = 0, gpuReady = 0, active: { ready: number; duration: number } | undefined;
  let deletedQueries = 0, deletedFences = 0, draws = 0;
  const extension = options.timers ? { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 } : null;
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, WAIT_FAILED: 4,
    CURRENT_QUERY: 5, QUERY_RESULT_AVAILABLE: 6, QUERY_RESULT: 7,
    getExtension: () => extension, isContextLost: () => false,
    fenceSync: () => options.failFence ? null : ({ ready: gpuReady }), flush() {},
    clientWaitSync: (fence: {ready: number}) => clock >= fence.ready ? 2 : 0,
    deleteSync: () => { deletedFences++; },
    createQuery: () => ({ready: 0, duration: 0}),
    beginQuery: (_type: number, query: typeof active) => { active = query; },
    endQuery: () => { active = undefined; },
    getQuery: () => active,
    getParameter: () => options.disjoint ?? false,
    getQueryParameter: (query: {ready: number; duration: number}, key: number) => key === 6 ? clock >= query.ready : query.duration * 1e6,
    deleteQuery: () => { deletedQueries++; },
  } as unknown as WebGL2RenderingContext;
  const view = {
    warm: async () => { clock += options.warmMs ?? 0; gpuReady = clock + (options.drainMs ?? 0); },
    draw: () => {
      draws++;
      clock += options.cpuMs ?? 1;
      gpuReady = Math.max(clock, gpuReady) + (options.gpuMs ?? 13);
      if (active) { active.ready = gpuReady; active.duration = options.gpuMs ?? 13; }
    },
  };
  return { async run() { return calibrateGraphics({ context: gl, views: [view], now: () => clock,
    isCurrent: () => clock < (options.cancelAt ?? Infinity), yieldTask: async () => { clock += options.pollMs ?? 4; },
    budgetMs: options.budgetMs, timing: new GraphicsCalibrationTiming(() => clock, undefined, options.preparationMs) }); }, counts: () => ({deletedQueries, deletedFences, draws, clock}) };
}
const measurement = (frameMs: number): GraphicsCalibrationMeasurement =>
  ({status:'complete',sampleCount:8,frameMs,cpuMs:1,gpuMs:frameMs,method:'gpu-timer'});

test('GPU execution timing ignores delayed polls and deletes every query and fence', async () => {
  const fixture = gpuFixture({timers:true,pollMs:17});
  const result = await fixture.run();
  assert.equal(result.status, 'complete');
  assert.equal(result.frameMs, 13);
  assert.equal(result.gpuMs, 13);
  assert.equal(result.method, 'gpu-timer');
  assert.equal(fixture.counts().deletedQueries, result.sampleCount);
  assert.equal(fixture.counts().deletedFences, 1);
});

test('CPU bottlenecks remain visible even with a fast GPU', async () => {
  const fixture = gpuFixture({timers:true,gpuMs:2,cpuMs:20});
  const result = await fixture.run();
  assert.equal(result.frameMs, 20);
  const selected = await calibrateGraphicsProfiles({isCurrent:()=>true,measure:async()=>result});
  assert.equal(selected.profile, 'minimum');
});

test('completion fallback amortizes 4 ms polling rather than rounding every 13 ms frame to 16 ms', async () => {
  const result = await gpuFixture().run();
  assert.equal(result.status, 'complete');
  assert.equal(result.method, 'completion');
  assert.ok(result.frameMs >= 13 && result.frameMs <= 15);
  const selected = await calibrateGraphicsProfiles({isCurrent:()=>true,
    measure:async profile=>profile === 'standard' ? result : measurement(22)});
  assert.equal(selected.profile, 'standard');
});

test('cold preparation and its GPU drain do not spend the sampling budget', async () => {
  const result = await gpuFixture({warmMs:1200,drainMs:280,budgetMs:150}).run();
  assert.equal(result.status, 'complete');
  assert.equal(result.sampleCount, 8);
  assert.ok(result.frameMs < 15);
});

test('a sufficient completed batch survives a sampling timeout', async () => {
  const fixture = gpuFixture({budgetMs:70});
  const result = await fixture.run();
  assert.equal(result.status, 'complete');
  assert.equal(result.sampleCount, 4);
  assert.equal(fixture.counts().deletedFences, 3);
});

for (const [name, options, status] of [
  ['lost focus', {cancelAt:70}, 'interrupted'],
  ['no completed batch', {budgetMs:20}, 'timed-out'],
  ['failed fence', {failFence:true}, 'unavailable'],
  ['disjoint GPU timer', {timers:true,disjoint:true}, 'unavailable'],
] as const) test(`${name} produces no automatic preset`, async () => {
  const fixture = gpuFixture(options), sample = await fixture.run();
  assert.equal(sample.status, status);
  const result = await calibrateGraphicsProfiles({isCurrent:()=>true,measure:async()=>sample});
  assert.equal(result.profile, undefined);
  if (options.timers) assert.equal(fixture.counts().deletedQueries, 4);
});

test('missing or failed views cannot be replaced by fast samples from another room', () => {
  assert.equal(combineGraphicsMeasurements([]).status, 'unavailable');
  assert.equal(combineGraphicsMeasurements([measurement(8), incompleteGraphicsMeasurement('timed-out')]).status, 'timed-out');
  assert.equal(combineGraphicsMeasurements([measurement(8), measurement(16)]).frameMs, 16);
});

test('High needs its own successful measurement, not a fast Medium estimate', async () => {
  for (const [high, expected] of [[measurement(11),'high'],[measurement(22),'standard'],
    [incompleteGraphicsMeasurement('timed-out'),'standard']] as const) {
    const profiles:string[]=[];
    const result = await calibrateGraphicsProfiles({isCurrent:()=>true,measure:async profile=>{
      profiles.push(profile);return profile==='standard'?measurement(6):profile==='ultra'?measurement(22):high;
    }});
    assert.deepEqual(profiles, expected === 'high' ? ['high','ultra'] : ['high','standard']);
    assert.equal(result.profile, expected);
  }
});

test('checking an already suitable High preset does not change to Medium first', async () => {
  const profiles:string[]=[];
  const result = await calibrateGraphicsProfiles({isCurrent:()=>true,measure:async profile=>{
    profiles.push(profile);return measurement(profile === 'ultra' ? 22 : 12);
  }});
  assert.deepEqual(profiles,['high','ultra']);assert.equal(result.profile,'high');
});

test('interruption during High cancels the entire recommendation', async () => {
  let current = true;
  const result = await calibrateGraphicsProfiles({isCurrent:()=>current,measure:async profile=>{
    if(profile==='high') current=false;
    return measurement(5);
  }});
  assert.equal(result.status,'interrupted');assert.equal(result.profile,undefined);
});

test('High and Ultra are classified from their own measurements, even without spare Medium headroom', async () => {
  for (const [ultra, expected] of [[measurement(14), 'ultra'], [measurement(20), 'high'],
    [incompleteGraphicsMeasurement('timed-out'), 'high']] as const) {
    const profiles: string[] = [];
    const result = await calibrateGraphicsProfiles({ isCurrent: () => true, measure: async profile => {
      profiles.push(profile);
      return profile === 'standard' ? measurement(10) : profile === 'high' ? measurement(12) : ultra;
    } });
    assert.deepEqual(profiles, ['high', 'ultra']);
    assert.equal(result.profile, expected);
  }
});

test('slow Ultra falls back to verified High without measuring Medium again', async () => {
  const profiles: string[] = [];
  const result = await calibrateGraphicsProfiles({ isCurrent: () => true, measure: async profile => {
    profiles.push(profile);return measurement(profile === 'ultra' ? 20 : 12);
  } });
  assert.deepEqual(profiles, ['high', 'ultra']);assert.equal(result.profile, 'high');
});

test('interrupted and invalid Ultra checks do not overwrite the previous selection', async () => {
  for (const status of ['interrupted', 'unavailable'] as const) {
    const result = await calibrateGraphicsProfiles({ isCurrent: () => true, measure: async profile =>
      profile === 'ultra' ? incompleteGraphicsMeasurement(status) : measurement(10) });
    assert.equal(result.status, status);assert.equal(result.profile, undefined);
  }
});

test('the whole preset search shares one deadline and never starts a third tier', async () => {
  for (const [highMs, next, expected] of [[12, 'ultra', 'ultra'], [20, 'standard', 'standard']] as const) {
    let clock = 100;
    const calls: string[] = [], deadlines: number[] = [];
    const result = await calibrateGraphicsProfiles({ isCurrent: () => true, now: () => clock,
      measure: async (profile, timing) => {
        calls.push(profile);deadlines.push(timing.measurementDeadline);clock += 1000;
        return measurement(profile === 'high' ? highMs : 12);
      },
    });
    assert.deepEqual(calls, ['high', next]);
    assert.deepEqual(deadlines, [100 + GRAPHICS_CALIBRATION_TOTAL_SAMPLE_BUDGET_MS, 100 + GRAPHICS_CALIBRATION_TOTAL_SAMPLE_BUDGET_MS]);
    assert.equal(result.profile, expected);
  }
});

test('exhausted sampling budget stops the search, retaining only a verified recommendation', async () => {
  for (const high of [measurement(12), measurement(20), incompleteGraphicsMeasurement('timed-out')]) {
    let clock = 0;
    const calls: string[] = [];
    const result = await calibrateGraphicsProfiles({ isCurrent: () => true, now: () => clock,
      measure: async profile => { calls.push(profile);clock = GRAPHICS_CALIBRATION_TOTAL_SAMPLE_BUDGET_MS;return high; },
    });
    assert.deepEqual(calls, ['high']);
    assert.equal(result.profile, high.status === 'complete' && high.frameMs <= 15 ? 'high' : undefined);
  }
});

test('shared preparation allowance bounds GPU readiness waits', async () => {
  const fixture = gpuFixture({ warmMs: 300, drainMs: 5000, preparationMs: 600 });
  const result = await fixture.run();
  assert.equal(result.status, 'timed-out');
  assert.equal(fixture.counts().draws, 0);
  assert.ok(fixture.counts().clock <= 604);
  assert.equal(fixture.counts().deletedFences, 1);
});

test('expired shared deadline does not start another view warm-up', async () => {
  let warmed = false;
  const result = await calibrateGraphics({ context: { getExtension: () => null, isContextLost: () => false } as unknown as WebGL2RenderingContext,
    views: [{ warm: async () => { warmed = true; }, draw: () => { throw new Error('Should not draw'); } }],
    now: () => 100, timing: new GraphicsCalibrationTiming(() => 100, 0), isCurrent: () => true, yieldTask: async () => {},
  });
  assert.equal(result.status, 'timed-out');assert.equal(warmed, false);
});

test('cold preparation exceeding three seconds still leaves a full measurement window', async () => {
  const fixture = gpuFixture({warmMs: 3200, drainMs: 300});
  const result = await fixture.run();
  assert.equal(result.status, 'complete');assert.equal(result.sampleCount, 8);
  assert.ok(result.frameMs >= 13 && result.frameMs <= 15);
});

test('completed GPU work is accepted when the next poll arrives after the deadline', async () => {
  const result = await gpuFixture({warmMs: 599, drainMs: 1, preparationMs: 600}).run();
  assert.equal(result.status, 'complete');assert.equal(result.sampleCount, 8);
});

test('preparation allowance is shared between tiers and cannot be reset by promotion', async () => {
  let clock = 0;
  const calls: string[] = [], deadlines: number[] = [];
  const result = await calibrateGraphicsProfiles({now: () => clock, isCurrent: () => true,
    measure: async (profile, timing) => {
      calls.push(profile);
      const prepared = await timing.prepare(async deadline => {
        deadlines.push(deadline);clock += 2500;return 'complete';
      });
      if (prepared !== 'complete') return incompleteGraphicsMeasurement(prepared);
      clock += 100;
      return measurement(10);
    },
  });
  assert.equal(result.profile, 'ultra');
  assert.deepEqual(calls, ['high', 'ultra']);
  assert.deepEqual(deadlines, [5000, 5100]);
});

test('a stopped warm-up cannot become a fast recommendation from an empty GPU queue', async () => {
  let draws = 0;
  const result = await calibrateGraphics({context: {getExtension: () => null, isContextLost: () => false} as unknown as WebGL2RenderingContext,
    views: [{warm: async () => false, draw: () => { draws++; }}], now: () => 0,
    isCurrent: () => true, yieldTask: async () => {},
  });
  assert.equal(result.status, 'timed-out');assert.equal(draws, 0);
});
