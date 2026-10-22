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
  if (state === 'title' || state === 'levelSelect' || state === 'cutsceneSelect' || ((state === 'credits' || state === 'settings') && menuOrigin === 'title'))
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
  private autoplayBlocked = false;
  private autoplayBlockedListener: ((blocked: boolean) => void) | undefined;
  private focused = true;
  private disposed = false;
  private master = 1;
  private volume = 1;
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

  /** Report browser autoplay restrictions to the title screen without affecting gameplay. */
  setAutoplayBlockedListener(listener: (blocked: boolean) => void): void {
    this.autoplayBlockedListener = listener;
    listener(this.autoplayBlocked);
  }

  private setAutoplayBlocked(blocked: boolean): void {
    if (this.autoplayBlocked === blocked) return;
    this.autoplayBlocked = blocked;
    this.autoplayBlockedListener?.(blocked);
  }

  setScene(track: MusicTrack | null, play: boolean): void {
    if (this.disposed) return;
    const changed = this.requested !== track;
    this.requested = track;
    this.enabled = play;
    if (changed || !play) this.setAutoplayBlocked(false);
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

  /**
   * Retry when the user interacts if a browser denied the initial autoplay
   * attempt. The browser, not the game, determines whether that gesture is
   * required. This never resets the track's playback position.
   */
  unlock(): void {
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

  setMusicVolume(value: number): void {
    if (this.disposed) return;
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (!this.fadeTimer) this.players[this.active].volume = this.targetVolume;
  }

  private get targetVolume(): number { return this.master * this.volume * this.musicGain; }
  private get current(): MusicElement { return this.players[this.active]; }
  private canPlay(): boolean { return !this.disposed && this.focused && this.enabled; }
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
    if (!previous.src) {
      // First title appearance should not wait for a crossfade from silence.
      next.volume = this.targetVolume;
      this.start(next);
      return;
    }
    this.start(next);
    this.fade(previous, next);
  }

  private fade(previous: MusicElement, next: MusicElement | null): void {
    const initialGain = this.targetVolume > 0 ? Math.min(1, previous.volume / this.targetVolume) : 0;
    let tick = 0;
    this.fadeTimer = setInterval(() => {
      const fraction = Math.min(1, ++tick / 16); // 400 ms, only during transitions
      previous.volume = this.targetVolume * initialGain * (1 - fraction);
      if (next) next.volume = this.targetVolume * fraction;
      if (fraction === 1) {
        this.cancelFade();
        previous.pause();
        if (next) next.volume = this.targetVolume;
      }
    }, 25);
  }

  private start(player: MusicElement): void {
    // Attempt menu playback immediately; compliant browsers can permit it on
    // revisits or when the user has granted this origin autoplay permission.
    // A fresh Chromium profile can reject audible playback without a gesture.
    const failed = (error: unknown): void => {
      if (this.disposed || this.current !== player || !this.canPlay() || !player.paused) return;
      if (typeof error === 'object' && error !== null &&
        'name' in error && error.name === 'NotAllowedError') {
        this.setAutoplayBlocked(true);
      }
    };
    try {
      void player.play().then(
        () => { if (!this.disposed && this.current === player) this.setAutoplayBlocked(false); },
        failed,
      );
    } catch (error) {
      failed(error);
    }
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
    this.autoplayBlockedListener = undefined;
    for (const player of this.players) {
      player.pause();
      player.removeAttribute('src');
    }
  }
}
