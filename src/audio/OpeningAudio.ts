import type { AudioPlayback } from './AudioManager.ts';
import { SOUND_BANKS, type SoundId } from './SoundCatalog.ts';
import { OPENING_GAME_TIMING as T } from '../cinematics/OpeningGameTimeline.ts';

/** Absolute movie times: rendering/preparation never owns a separate sound clock. */
export const OPENING_AUDIO_CUES: readonly (readonly [number, SoundId, number])[] = [
  [4.8, 'intro-camera-servo-01', .6], [10, 'intro-camera-servo-02', .6],
  [15.2, 'intro-camera-servo-03', .6], [20.4, 'intro-camera-servo-01', .5],
  [T.doorStart, 'intro-door-open-01', 1], [T.doorClose, 'intro-door-close-01', 1],
  [T.hatchStart+.8, 'intro-egg-rock-01', .6], [T.hatchStart+2.1, 'intro-egg-rock-01', .7],
  [T.crackOne, 'intro-egg-crack-01', .7], [T.crackOne+1, 'intro-egg-rock-01', .65],
  [T.crackTwo, 'intro-egg-crack-01', .85], [T.crackTwo+1, 'intro-egg-rock-01', .7],
  [T.crackThree, 'intro-egg-crack-01', 1], [T.crackThree+1, 'intro-egg-rock-01', .75],
  [T.lidStart-.45, 'intro-pod-seal-release-01', 1], [T.lidStart, 'intro-pod-lid-raise-01', 1],
  [T.fallStart, 'intro-egg-fall-01', 1], [T.impact, 'intro-egg-break-impact-01', 1],
  [T.impact+.25, 'intro-bob-splat-01', 1], [T.formStart, 'intro-bob-reform-01', 1],
];

/** Intro-only ownership, sharing the application's effects/master/focus controls. */
export class OpeningAudio {
  private readonly audio: AudioPlayback | undefined;
  private seconds = 0;
  private stopped = false;
  private paused = true;

  constructor(audio?: AudioPlayback) { this.audio = audio; }

  update(seconds: number): void {
    if (this.stopped || !Number.isFinite(seconds)) return;
    const time = Math.max(0, Math.min(T.end, seconds)), before = this.seconds;
    this.seconds = time;
    if (time >= T.end) { this.stop(); return; }
    if (this.paused) { this.audio?.setPaused(false); this.paused = false; }
    // Movie seeks/stalls never dump stale one-shots into the current shot.
    if (time > before && time-before <= .5) {
      for (const [at, sound, scale] of OPENING_AUDIO_CUES)
        if (at > before && at <= time) this.audio?.play(sound, undefined, false, scale);
    }
    if (time >= T.labReveal) {
      const reveal = Math.max(0, Math.min(1, (time-T.labReveal)/(T.labVisible-T.labReveal)));
      const fade = Math.max(0, Math.min(1, (T.end-time)/(T.end-T.fadeStart)));
      this.audio?.startLoop('opening:lab', 'intro-lab-ambience-loop-01', undefined,
        reveal * fade * (time >= T.hatchStart ? .55 : 1));
    } else this.audio?.stopLoop('opening:lab');
  }

  pause(): void {
    if (this.stopped || this.paused) return;
    this.paused = true;
    this.audio?.setPaused(true);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.audio?.stopLoop('opening:lab');
    for (const sound of SOUND_BANKS.intro) this.audio?.stopSound?.(sound);
  }
}
