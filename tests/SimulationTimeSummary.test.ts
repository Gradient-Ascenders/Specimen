import assert from 'node:assert/strict';
import test from 'node:test';
import { SimulationTimeSummary, simulationTimeState } from '../src/debug/SimulationTimeSummary.ts';
import type { LoopStats } from '../src/core/Loop.ts';

const stats = (raw: number, steps: number, dropped: number): LoopStats => ({
  fixedDeltaSeconds: 1/60, rawFrameDeltaSeconds: raw, frameDeltaSeconds: Math.min(raw,.1),
  stepsThisFrame: steps, droppedSimulationTimeSeconds: dropped, interpolationAlpha: 0, renderFps: 0,
});

test('whole-session totals separate active loss, menu loop drops, boundaries and clock-reset gaps', () => {
  const summary = new SimulationTimeSummary();
  summary.sample(500, stats(.5,6,.4), 'playing'); // interval before recorder start excluded
  summary.sample(1000, stats(.5,6,.4), 'playing');
  summary.sample(2000, stats(1,6,.9), 'paused');
  summary.sample(3000, stats(1,6,.9), 'loading');
  summary.sample(4000, stats(1,6,.9), 'boundary');
  summary.sample(5000, stats(1,6,.9), 'cutscene');
  summary.sample(5500, stats(.5,6,.4), 'recovery');
  summary.sample(15500, stats(0,0,0), 'playing');
  const result = summary.snapshot();
  assert.equal(result.eligibleElapsedMs, 2000);
  assert.equal(result.droppedActiveSimulationMs, 1700);
  assert.equal(result.lostPercent, 85);
  assert.equal(result.eligibleFixedStepMs, 300);
  assert.equal(result.totalLoopDroppedMs, 4400);
  assert.equal(result.unobservedGapMs, 10000);
  assert.equal(result.states.playing!.frames, 2);
  summary.reset();
  assert.equal(summary.snapshot().eligibleElapsedMs, 0);
  assert.equal(summary.snapshot().lostPercent, null);
  assert.equal(result.eligibleElapsedMs, 2000, 'export snapshots do not mutate on reset');
});

test('state classification preserves pause priority and distinguishes completion markers from clocks', () => {
  assert.equal(simulationTimeState('paused','containment-ending'), 'paused');
  assert.equal(simulationTimeState('loading','none'), 'loading');
  assert.equal(simulationTimeState('playing','room-three-complete'), 'playing');
  for (const state of ['playing','three-slime','specimen','boss','escape'])
    assert.equal(simulationTimeState(state,'none'), 'playing');
  for (const state of ['completing','merging','splitting','boss-defeated'])
    assert.equal(simulationTimeState(state,'none'), 'cutscene');
  assert.equal(simulationTimeState('recovering','none'), 'recovery');
  assert.equal(simulationTimeState('complete','none'), 'inactive');
});
