import type { LoopStats } from '../core/Loop.ts';

export type SimulationTimeState =
  | 'loading' | 'playing' | 'cutscene' | 'paused' | 'recovery' | 'boundary' | 'inactive';

export function simulationTimeState(gameplay: string, cutscene: string): SimulationTimeState {
  if (gameplay === 'loading' || gameplay === 'unloaded') return 'loading';
  if (gameplay === 'paused' || gameplay === 'stopped' || gameplay === 'gameOver') return 'paused';
  if (gameplay === 'bursting' || gameplay === 'restarting' || gameplay === 'recovering') return 'recovery';
  if (gameplay === 'completing' || gameplay === 'merging' || gameplay === 'splitting' ||
    gameplay === 'boss-defeated') return 'cutscene';
  // room-three-complete is a latched puzzle marker, not a running cutscene.
  if (cutscene !== 'none' && cutscene !== 'room-three-complete') return 'cutscene';
  if (gameplay === 'playing' || gameplay === 'three-slime' || gameplay === 'specimen' ||
    gameplay === 'boss' || gameplay === 'escape') return 'playing';
  return 'inactive';
}

const createBucket = () => ({frames: 0, elapsedMs: 0, fixedStepMs: 0, droppedMs: 0});

/** Constant storage; sample() allocates nothing. Totals survive raw-history eviction. */
export class SimulationTimeSummary {
  readonly states = {
    loading: createBucket(), playing: createBucket(), cutscene: createBucket(),
    paused: createBucket(), recovery: createBucket(), boundary: createBucket(), inactive: createBucket(),
  };
  private previousTimestampMs: number | undefined;
  private unobservedGapMs = 0;

  reset(): void {
    this.previousTimestampMs = undefined;
    this.unobservedGapMs = 0;
    for (const bucket of Object.values(this.states)) {
      bucket.frames = bucket.elapsedMs = bucket.fixedStepMs = bucket.droppedMs = 0;
    }
  }

  sample(timestampMs: number, stats: Readonly<LoopStats>, state: SimulationTimeState): void {
    // The first sample may straddle recorder start. Do not include that interval.
    if (this.previousTimestampMs !== undefined) {
      const elapsedMs = stats.rawFrameDeltaSeconds * 1000;
      this.unobservedGapMs += Math.max(0, timestampMs - this.previousTimestampMs - elapsedMs);
      const bucket = this.states[state];
      bucket.frames += 1;
      bucket.elapsedMs += elapsedMs;
      bucket.fixedStepMs += stats.stepsThisFrame * stats.fixedDeltaSeconds * 1000;
      bucket.droppedMs += stats.droppedSimulationTimeSeconds * 1000;
    }
    this.previousTimestampMs = timestampMs;
  }

  snapshot() {
    const eligible = [this.states.playing, this.states.cutscene, this.states.recovery];
    const eligibleElapsedMs = eligible.reduce((sum, bucket) => sum + bucket.elapsedMs, 0);
    const droppedActiveSimulationMs = eligible.reduce((sum, bucket) => sum + bucket.droppedMs, 0);
    return {
      eligibleElapsedMs,
      droppedActiveSimulationMs,
      lostPercent: eligibleElapsedMs > 0 ? 100 * droppedActiveSimulationMs / eligibleElapsedMs : null,
      eligibleFixedStepMs: eligible.reduce((sum, bucket) => sum + bucket.fixedStepMs, 0),
      totalLoopDroppedMs: Object.values(this.states).reduce((sum, bucket) => sum + bucket.droppedMs, 0),
      unobservedGapMs: this.unobservedGapMs,
      states: Object.fromEntries(Object.entries(this.states).map(([key, bucket]) => [key, {
        ...bucket, lostPercent: bucket.elapsedMs > 0 ? 100 * bucket.droppedMs / bucket.elapsedMs : null,
      }])),
    };
  }
}
