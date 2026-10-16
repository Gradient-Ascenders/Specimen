import type { RoomOneEggState } from '../render/environment/containment/RoomOneArt.ts';

export const OPENING_HATCH_TIMING = {
  crackOne: 2.8, crackTwo: 4.6, crackThree: 6.3,
  crackComplete: 7.8, lidStart: 8.3, lidClear: 10.3, tipStart: 10.6, fallStart: 11.8,
  impact: 12.4, shellClear: 14.1, formStart: 14.35, formEnd: 15.35,
  fadeStart: 20.8, end: 21.6,
} as const;

const HATCH_START = 32.4;
export const OPENING_GAME_TIMING = {
  blackoutEnd: 0.8, labReveal: 1.7, labVisible: 3.5, labEstablished: 4.8,
  bobDoor: 22.6, doorStart: 24.8, doorClear: 26.2, entryStart: 26.4,
  doorClose: 31, hatchStart: HATCH_START,
  crackOne: HATCH_START + OPENING_HATCH_TIMING.crackOne,
  crackTwo: HATCH_START + OPENING_HATCH_TIMING.crackTwo,
  crackThree: HATCH_START + OPENING_HATCH_TIMING.crackThree,
  crackComplete: HATCH_START + OPENING_HATCH_TIMING.crackComplete,
  lidStart: HATCH_START + OPENING_HATCH_TIMING.lidStart,
  lidClear: HATCH_START + OPENING_HATCH_TIMING.lidClear,
  tipStart: HATCH_START + OPENING_HATCH_TIMING.tipStart,
  fallStart: HATCH_START + OPENING_HATCH_TIMING.fallStart,
  impact: HATCH_START + OPENING_HATCH_TIMING.impact,
  shellClear: HATCH_START + OPENING_HATCH_TIMING.shellClear,
  formStart: HATCH_START + OPENING_HATCH_TIMING.formStart,
  formEnd: HATCH_START + OPENING_HATCH_TIMING.formEnd,
  fadeStart: HATCH_START + OPENING_HATCH_TIMING.fadeStart,
  end: HATCH_START + OPENING_HATCH_TIMING.end,
} as const;

export type OpeningGameStage = 'blackout' | 'laboratory' | 'experiments' | 'bob-door' | 'entering'
  | 'awakening' | 'cracking' | 'falling' | 'breaking' | 'forming' | 'complete';
export interface OpeningGameFrame {
  readonly seconds: number;
  readonly hatchSeconds: number;
  readonly stage: OpeningGameStage;
  readonly eggState: RoomOneEggState;
  /** Prebuilt seam ribbons grow continuously in three waves, without remeshing. */
  readonly crackProgress: number;
  readonly lid: number;
  readonly tip: number;
  readonly fall: number;
  readonly opening: number;
  readonly spread: number;
  readonly formation: number;
  readonly rock: number;
  readonly fade: number;
  readonly doorOpen: number;
}

export function openingEase(start: number, end: number, time: number): number {
  const x = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return x * x * (3 - 2 * x);
}

/** Authored seconds, not frame counts: repeatable at any frame rate or seek. */
export function sampleOpeningGame(seconds: number): OpeningGameFrame {
  const t = OPENING_GAME_TIMING;
  const time = Number.isFinite(seconds) ? Math.max(0, Math.min(t.end, seconds)) : 0;
  const hatchSeconds = Math.max(0, time - t.hatchStart);
  return {
    seconds: time,
    hatchSeconds,
    stage: time >= t.end ? 'complete' : time >= t.formStart ? 'forming'
      : time >= t.impact ? 'breaking' : time >= t.tipStart ? 'falling'
      : time >= t.crackOne ? 'cracking' : time >= t.hatchStart ? 'awakening'
      : time >= t.entryStart ? 'entering' : time >= t.bobDoor ? 'bob-door'
      : time >= t.labEstablished ? 'experiments' : time >= t.labReveal ? 'laboratory' : 'blackout',
    eggState: time >= t.impact ? 'half-broken' : time >= t.crackThree ? 'crack-stage-3'
      : time >= t.crackTwo ? 'crack-stage-2' : time >= t.crackOne ? 'crack-stage-1' : 'intact',
    crackProgress: (openingEase(t.crackOne, t.crackTwo, time) + openingEase(t.crackTwo, t.crackThree, time)
      + openingEase(t.crackThree, t.crackComplete, time)) / 3,
    lid: openingEase(t.lidStart, t.lidClear, time),
    tip: openingEase(t.tipStart, t.fallStart, time),
    fall: Math.max(0, Math.min(1, (time - t.fallStart) / (t.impact - t.fallStart))),
    opening: openingEase(t.impact, t.shellClear, time),
    spread: openingEase(t.impact + 0.25, t.shellClear, time),
    formation: openingEase(t.formStart, t.formEnd, time),
    rock: time < t.hatchStart ? 0 : (0.045 + openingEase(0.8, OPENING_HATCH_TIMING.tipStart - 0.1, hatchSeconds) * 0.2) *
      (0.5 + 0.5 * Math.sin(hatchSeconds * 3.4) ** 2) *
      (1 - openingEase(OPENING_HATCH_TIMING.tipStart - 0.15, OPENING_HATCH_TIMING.fallStart, hatchSeconds)),
    // Fade out the menu, hold black for the shot change, then reveal the wing.
    fade: time < t.labReveal ? openingEase(0, t.blackoutEnd, time)
      : time < t.labVisible ? 1 - openingEase(t.labReveal, t.labVisible, time) : openingEase(t.fadeStart, t.end, time),
    doorOpen: openingEase(t.doorStart, t.doorClear, time) * (1 - openingEase(t.doorClose, t.hatchStart + 0.2, time)),
  };
}
