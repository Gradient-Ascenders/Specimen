import type { RoomOneEggState } from '../render/environment/containment/RoomOneArt.ts';

export const OPENING_TRAILER_DURATION_SECONDS = 20.5;
export const OPENING_TRAILER_TIMING = {
  crackOne: 10.4,
  crackTwo: 11.9,
  crackThree: 13.5,
  shellStart: 15,
  shellClear: 16.55,
  emergeStart: 16,
  emergeEnd: 18.7,
} as const;

export type OpeningTrailerStage =
  | 'outside'
  | 'entering'
  | 'dark-room'
  | 'reveal'
  | 'cracking'
  | 'emerging'
  | 'complete';

export interface OpeningTrailerFrame {
  readonly seconds: number;
  readonly stage: OpeningTrailerStage;
  readonly doorOpen: number;
  readonly entranceProgress: number;
  readonly closeupProgress: number;
  readonly lookAtEgg: number;
  readonly roomLighting: number;
  readonly eggState: RoomOneEggState;
  readonly shellOpening: number;
  readonly emergence: number;
  readonly wobble: number;
}

/** Absolute-time sampling makes scrubbing/replay identical to normal playback. */
export function sampleOpeningTrailer(seconds: number): OpeningTrailerFrame {
  const time = Number.isFinite(seconds)
    ? Math.max(0, Math.min(OPENING_TRAILER_DURATION_SECONDS, seconds))
    : 0;
  const stage: OpeningTrailerStage = time >= OPENING_TRAILER_DURATION_SECONDS
    ? 'complete'
    : time >= OPENING_TRAILER_TIMING.shellStart ? 'emerging'
    : time >= OPENING_TRAILER_TIMING.crackOne ? 'cracking'
    : time >= 6.4 ? 'reveal'
    : time >= 5.4 ? 'dark-room'
    : time >= 2.6 ? 'entering'
    : 'outside';
  const eggState: RoomOneEggState = time >= OPENING_TRAILER_TIMING.shellStart ? 'half-broken'
    : time >= OPENING_TRAILER_TIMING.crackThree ? 'crack-stage-3'
    : time >= OPENING_TRAILER_TIMING.crackTwo ? 'crack-stage-2'
    : time >= OPENING_TRAILER_TIMING.crackOne ? 'crack-stage-1'
    : 'intact';

  // Brief fluorescent ignition pulses, then a stable, fully lit room. Lights
  // stay in the scene at zero intensity rather than changing shader layouts.
  const entryFlicker = time >= 4.28 && time < 4.38 ? 0.12
    : time >= 4.78 && time < 4.86 ? 0.22
    : time >= 5.22 && time < 5.36 ? 0.16
    : time >= 5.57 && time < 5.69 ? 0.3
    : time >= 6.01 && time < 6.13 ? 0.1 : 0;
  const roomLighting = time < 6.4 ? entryFlicker
    : time < 6.51 ? 0.55
    : time < 6.6 ? 0.08
    : time < 6.76 ? 0.82
    : time < 6.83 ? 0.26
    : 0.26 + 0.74 * ease(6.83, 7.25, time);

  return {
    seconds: time,
    stage,
    doorOpen: ease(1.3, 2.6, time),
    entranceProgress: ease(2.6, 5.4, time),
    closeupProgress: ease(5.4, 12.5, time),
    lookAtEgg: ease(2.8, 4.9, time),
    roomLighting,
    eggState,
    shellOpening: ease(OPENING_TRAILER_TIMING.shellStart, OPENING_TRAILER_TIMING.shellClear, time),
    emergence: ease(OPENING_TRAILER_TIMING.emergeStart, OPENING_TRAILER_TIMING.emergeEnd, time),
    wobble: ease(9.8, OPENING_TRAILER_TIMING.crackOne, time) *
      (1 - ease(OPENING_TRAILER_TIMING.shellStart, OPENING_TRAILER_TIMING.shellClear, time)),
  };
}

function ease(start: number, end: number, time: number): number {
  const progress = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return progress * progress * (3 - 2 * progress);
}
