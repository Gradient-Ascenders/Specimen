import type { GameFlowState } from '../ui/GameFlowUI.ts';

export type MusicTrack = 'intro' | 'containment' | 'cultivation' | 'blackout';
export type MusicLevel = Exclude<MusicTrack, 'intro'>;

const MUSIC_PATHS: Record<MusicTrack, string> = {
  intro: 'assets/audio/music/00-intro-osmotic-memory.ogg',
  containment: 'assets/audio/music/01-containment-thought-loop.ogg',
  cultivation: 'assets/audio/music/02-cultivation-unsolved-investigation.ogg',
  blackout: 'assets/audio/music/03-blackout-searching.ogg',
};

/** Menu music continues in title submenus; gameplay music pauses with the game. */
export function musicForFlow(
  state: GameFlowState,
  menuOrigin: 'title' | 'paused',
  level: MusicLevel,
): { track: MusicTrack | null; play: boolean } {
  if (state === 'title' || ((state === 'credits' || state === 'settings') && menuOrigin === 'title'))
    return { track: 'intro', play: true };
  if (state === 'playing') return { track: level, play: true };
  if (state === 'paused' || state === 'restarting' || state === 'settings' || state === 'credits')
    return { track: level, play: false };
  return { track: null, play: state === 'opening' || state === 'transitioning' };
}

type MusicElement = Pick<HTMLAudioElement,
  'src' | 'loop' | 'preload' | 'volume' | 'paused' | 'play' | 'pause' | 'removeAttribute'>;

/**
 * Stream long OGG tracks instead of adding them to the decoded gameplay-SFX
 * buffer cache. At most two HTMLMediaElements exist, and they only overlap
 * during a short level/menu crossfade. No music work runs in the frame loop.
 */
export class BackgroundMusic {
  private readonly players: readonly [MusicElement, MusicElement];
  private readonly base: string;
  private active = 0;
  private requested: MusicTrack | null = null;
  private enabled = false;
  private unlocked = false;
  private focused = true;
  private disposed = false;
  private master = 1;
  private fadeTimer: ReturnType<typeof setInterval> | undefined;
  private readonly musicGain = 0.28;

  constructor(base = './', createPlayer: () => MusicElement = () => new Audio()) {
    this.base = base;
    this.players = [createPlayer(), createPlayer()];
    for (const player of this.players) {
      player.loop = true;
      player.preload = 'none';
      player.volume = 0;
    }
  }

  setScene(track: MusicTrack | null, play: boolean): void {
    if (this.disposed) return;
    const changed = this.requested !== track;
    this.requested = track;
    this.enabled = play;
    if (!this.canPlay()) {
      this.cancelFade();
      for (const player of this.players) player.pause();
      if (changed && track !== null) {
        const player = this.players[this.active];
        player.src = this.url(track);
        player.volume = this.targetVolume;
      }
      return;
    }
    if (changed) this.switchTrack(track);
    else this.resume();
  }

  /** Must be called synchronously from a trusted key/pointer event. */
  unlock(): void {
    if (this.disposed) return;
    this.unlocked = true;
    if (this.canPlay()) this.resume();
  }

  setFocused(focused: boolean): void {
    if (this.focused === focused || this.disposed) return;
    this.focused = focused;
    if (!this.canPlay()) {
      this.cancelFade();
      for (const player of this.players) player.pause();
    } else this.resume();
  }

  /** Music respects the master slider but not the independent SFX slider. */
  setMasterVolume(value: number): void {
    if (this.disposed) return;
    this.master = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (!this.fadeTimer) this.players[this.active].volume = this.targetVolume;
  }

  private get targetVolume(): number { return this.master * this.musicGain; }
  private get current(): MusicElement { return this.players[this.active]; }
  private get canStart(): boolean { return this.unlocked && this.focused && this.enabled; }
  private canPlay(): boolean { return !this.disposed && this.canStart; }
  private url(track: MusicTrack): string { return this.base + MUSIC_PATHS[track]; }

  private resume(): void {
    if (!this.canPlay() || this.requested === null) return;
    const player = this.current;
    if (!player.src) player.src = this.url(this.requested);
    if (!this.fadeTimer) player.volume = this.targetVolume;
    if (player.paused) this.start(player);
  }

  private switchTrack(track: MusicTrack | null): void {
    this.cancelFade();
    const previous = this.current;
    if (track === null) {
      // Opening and level transitions fade music out, rather than carrying the
      // previous level's theme into a potentially long shader-loading screen.
      this.fade(previous, null);
      return;
    }
    const nextIndex = 1 - this.active;
    const next = this.players[nextIndex];
    next.pause();
    next.src = this.url(track);
    next.volume = 0;
    this.active = nextIndex;
    this.start(next);
    this.fade(previous, next);
  }

  private fade(previous: MusicElement, next: MusicElement | null): void {
    const initial = previous.volume;
    let tick = 0;
    this.fadeTimer = setInterval(() => {
      const fraction = Math.min(1, ++tick / 16); // 400 ms, only during transitions
      previous.volume = initial * (1 - fraction);
      if (next) next.volume = this.targetVolume * fraction;
      if (fraction === 1) {
        this.cancelFade();
        previous.pause();
        if (next) next.volume = this.targetVolume;
      }
    }, 25);
  }

  private start(player: MusicElement): void {
    // Browser autoplay rejection is optional: the next trusted gesture retries.
    try { void player.play().catch(() => {}); } catch { /* no audio device */ }
  }

  private cancelFade(): void {
    if (this.fadeTimer !== undefined) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = undefined;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFade();
    for (const player of this.players) {
      player.pause();
      player.removeAttribute('src');
    }
  }
}
