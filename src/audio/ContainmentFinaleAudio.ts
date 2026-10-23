import type { AudioPlayback } from './AudioManager.ts';
import { SOUND_BANKS, type SoundId } from './SoundCatalog.ts';
import { CONTAINMENT_FINALE_TIMING as T, finaleTime as F } from '../cinematics/ContainmentFinaleTiming.ts';
import type { FinaleShot } from '../cinematics/ContainmentFinaleVisuals.ts';
import type { ContainmentFinaleFrame, FinalePoint } from '../cinematics/ContainmentFinaleTimeline.ts';

/** The film borrows the models, so gameplay bodies cannot supply its travel sounds. */
export class ContainmentFinaleMovementAudio {
  private previous: ContainmentFinaleFrame | undefined;
  private readonly travel = [0, 0];

  reset(): void {
    this.previous = undefined;
    this.travel.fill(0);
  }

  update(frame: ContainmentFinaleFrame, cue: (position: FinalePoint, volumeScale: number) => void): void {
    const before = this.previous;
    this.previous = frame;
    const dt = before ? frame.seconds - before.seconds : 0;
    // Seeks, skipped time and repeated samples must not generate a burst of steps.
    if (!before || dt <= 0 || dt > .25) { this.travel.fill(0); return; }
    const bobMoving = (sample: ContainmentFinaleFrame) => !sample.bobAirborne && !sample.bobCharging && !sample.latched;
    const goopMoving = (sample: ContainmentFinaleFrame) => !sample.goopAirborne && !sample.goopCharging;
    for (const [index, position, previous, supported, attached] of [
      [0, frame.bob, before.bob, bobMoving(frame) && bobMoving(before), frame.bobAttached],
      [1, frame.goop, before.goop, goopMoving(frame) && goopMoving(before), false],
    ] as const) {
      const distance = Math.hypot(position[0] - previous[0], attached ? position[1] - previous[1] : 0, position[2] - previous[2]);
      if (!supported || distance / dt <= .2) { this.travel[index] = 0; continue; }
      this.travel[index] += distance;
      // Match the normal gameplay contact cadence and mix, not a constant loop.
      if (this.travel[index] >= 1.25) {
        this.travel[index] %= 1.25;
        cue(position, attached ? .25 : .35);
      }
    }
  }
}

export const CONTAINMENT_FINALE_AUDIO_CUES: readonly (readonly [number, SoundId])[] = [
  [.08, 'world-button-press-01'], [T.powerOff, 'escape-power-down-01'], [T.cellOpen, 'escape-cell-hatch-open-01'],
  [T.scanBob, 'escape-drone-scan-01'], [T.scanBobComplete, 'escape-scan-result-01'],
  [T.scanGoop, 'escape-drone-scan-01'], [T.scanGoopComplete, 'escape-scan-result-01'],
  [T.terminate, 'escape-termination-warning-01'],
  [F(38), 'bob-jump-01'], [F(39.25), 'bob-land-soft-01'],
  [T.leap, 'bob-charged-jump-01'], [T.latch, 'bob-contact-01'],
  [F(56.8), 'bob-jump-01'], [T.droneHit, 'escape-drone-destruction-01'],
  [T.restLanding, 'bob-land-hard-01'], [F(59.7), 'bob-jump-01'], [T.safeLanding, 'bob-land-soft-01'],
  [T.doorHit, 'goop-projectile-impact-01'], [T.doorOpen, 'goop-dissolve-complete-01'],
  [T.goopDive, 'bob-jump-01'], [T.goopDive, 'escape-shaft-fall-01'],
  [T.bobDive, 'bob-jump-01'], [T.bobDive, 'escape-shaft-fall-01'],
];

/** Replace the normal flight motor only while Bob is aboard. */
export const containmentDroneFlightSound = (seconds: number): SoundId =>
  seconds >= T.latch && seconds < F(56.8) ? 'escape-drone-strain-loop-01' : 'world-drone-flight-loop-01';

export function containmentProjectileImpactSound(shot: Pick<FinaleShot, 'green' | 'impact' | 'to' | 'ductNearMiss'>): SoundId | undefined {
  if (shot.green) return shot.impact ? 'goop-projectile-impact-01' : undefined;
  // These authored endpoints meet the floor or metal vent surround. Rounds
  // ending in open air, including the last duct near miss, make no impact cue.
  if (!shot.ductNearMiss && (shot.to[1] <= 74.9 || Math.abs(shot.to[2]-125.14) < .01))
    return 'escape-projectile-metal-impact-01';
  return undefined;
}

export function stopContainmentFinaleAudio(audio?: AudioPlayback): void {
  for (const key of ['containment-finale-alarm', 'containment-finale-flight', 'containment-finale-door']) audio?.stopLoop(key);
  for (const sound of SOUND_BANKS.escape) audio?.stopSound?.(sound);
}
