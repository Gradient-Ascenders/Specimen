import { EventBus } from '../core/EventBus.ts';

/** Attempt-scoped ownership only; the media element handles combat looping. */
export const bossMusicEvents = new EventBus<{
  started: BossMusic;
  defeated: BossMusic;
  stopped: BossMusic;
}>();

export class BossMusic {
  private started = false;
  private defeated = false;
  private stopped = false;

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    bossMusicEvents.emit('started', this);
  }

  defeat(): void {
    if (!this.started || this.defeated || this.stopped) return;
    this.defeated = true;
    bossMusicEvents.emit('defeated', this);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    // Disposal can interrupt an already-running victory fade.
    if (this.started) bossMusicEvents.emit('stopped', this);
  }
}
