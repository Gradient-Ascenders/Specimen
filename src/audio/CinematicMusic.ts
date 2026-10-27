import { EventBus } from '../core/EventBus.ts';

export type CinematicTrack = 'awakening' | 'escape' | 'rescue' | 'ascent' | 'research' | 'ending';

/** Discrete ownership changes only; the music owner reads the live clock directly. */
export const cinematicMusicEvents = new EventBus<{
  started: CinematicMusic;
  stopped: CinematicMusic;
}>();

export class CinematicMusic {
  readonly track: CinematicTrack;
  readonly duration: number;
  seconds = 0;
  playing = false;
  private started = false;
  private stopped = false;

  constructor(track: CinematicTrack, duration: number) {
    this.track = track;
    this.duration = duration;
  }

  update(seconds: number, playing = true): void {
    if (this.stopped || !Number.isFinite(seconds)) return;
    this.seconds = Math.max(0, seconds);
    this.playing = playing;
    if (this.seconds >= this.duration) { this.stop(); return; }
    if (!this.started && playing) {
      this.started = true;
      cinematicMusicEvents.emit('started', this);
    }
  }

  pause(): void { this.playing = false; }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.playing = false;
    if (this.started) cinematicMusicEvents.emit('stopped', this);
  }
}
