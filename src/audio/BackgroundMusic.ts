import type { GameFlowState } from '../ui/GameFlowUI.ts';
import type { CinematicMusic, CinematicTrack } from './CinematicMusic.ts';
import type { BossMusic } from './BossMusic.ts';

export type MusicLevel = 'containment' | 'cultivation' | 'blackout';
export type MusicTrack = 'intro' | MusicLevel | CinematicTrack | 'boss';

const MUSIC_PATHS: Record<MusicTrack, string> = {
  intro: 'assets/audio/music/00-intro-osmotic-memory.ogg',
  containment: 'assets/audio/music/01-containment-thought-loop.ogg',
  cultivation: 'assets/audio/music/02-cultivation-unsolved-investigation.ogg',
  blackout: 'assets/audio/music/03-blackout-searching.ogg',
  awakening: 'assets/audio/music/04-opening-tension.ogg',
  escape: 'assets/audio/music/05-containment-escape-high-tech-lab.ogg',
  rescue: 'assets/audio/music/06-cultivation-volt-rescue-digital-slash.ogg',
  boss: 'assets/audio/music/07-blackout-boss-a-flawless-getaway.ogg',
  ascent: 'assets/audio/music/08-blackout-elevator-quiet-ascent.ogg',
  research: 'assets/audio/music/09-blackout-research-the-specimen.ogg',
  ending: 'assets/audio/music/10-blackout-first-sunlight-ending.ogg',
};

// Retain Volt's prominent mix with the supplied, already-trimmed Digital Slash
// recording (0.28 * 1.75 = 0.49 at full sliders); its decoded peak is -4.02 dBFS.
const cinematicGain = (track: MusicTrack | null): number => track === 'escape' ? 0.60 : track === 'rescue' ? 1.75 :
  track === 'ascent' ? 1.1 : track === 'research' ? 1.4 : 1;
const isCinematic = (track: MusicTrack | null): boolean => track === 'awakening' || track === 'escape' || track === 'rescue' || track === 'ascent' || track === 'research' || track === 'ending';

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
  'src' | 'loop' | 'preload' | 'volume' | 'currentTime' | 'paused' | 'play' | 'pause' | 'removeAttribute'>;

/**
 * Stream long music tracks instead of adding them to the decoded gameplay-SFX
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
  private cinematic: CinematicMusic | undefined;
  private cinematicTimer: ReturnType<typeof setInterval> | undefined;
  private flowTrack: MusicTrack | null = null;
  private flowPlay = false;
  private cinematicEnvelope = 1;
  private endingCinematic = false;
  private lastCinematicSeconds = -1;
  private stationaryTicks = 0;
  private playbackFailed = false;
  private boss: BossMusic | undefined;
  private endingBoss = false;

  beginBoss(boss: BossMusic): void {
    if (this.disposed || this.boss === boss) return;
    this.cancelCinematic();
    this.cancelBoss();
    this.cancelFade();
    for (const player of this.players) player.pause();
    this.requested = null;
    this.boss = boss;
    this.applyScene('boss', this.flowPlay);
  }

  defeatBoss(boss: BossMusic): void {
    if (this.disposed || this.boss !== boss || this.endingBoss) return;
    this.cancelFade();
    this.endingBoss = true;
    this.flowTrack = null;
    const previous = this.current;
    const initialGain = this.targetVolume > 0 ? Math.min(1, previous.volume / this.targetVolume) : 1;
    const startedAt = performance.now();
    // Use elapsed time so a slow render frame cannot stretch a 2.5-second fade.
    this.fadeTimer = setInterval(() => {
      const fraction = Math.max(0, Math.min(1, (performance.now() - startedAt) / 2500));
      previous.volume = this.targetVolume * initialGain * (1 - fraction);
      if (fraction === 1) {
        this.cancelBoss();
        this.applyScene(this.flowTrack, this.flowPlay);
      }
    }, 25);
  }

  stopBoss(boss: BossMusic): void {
    if (this.boss !== boss) return;
    this.cancelBoss();
  }

  cancelBoss(): void {
    if (!this.boss) return;
    this.boss = undefined;
    this.endingBoss = false;
    this.cancelFade();
    for (const player of this.players) player.pause();
    this.requested = null;
  }

  /** Cinematics override flow routing even while the game still says playing. */
  beginCinematic(cinematic: CinematicMusic): void {
    if (this.disposed || this.cinematic === cinematic) return;
    this.cancelBoss();
    this.clearCinematic();
    this.cancelFade();
    this.endingCinematic = false;
    for (const player of this.players) player.pause();
    this.requested = null;
    this.lastCinematicSeconds = -1;
    this.stationaryTicks = 0;
    this.cinematic = cinematic;
    this.cinematicEnvelope = 1;
    this.applyScene(cinematic.track, this.flowPlay && cinematic.playing);
    this.current.loop = false;
    this.syncCinematic(false);
    this.cinematicTimer = setInterval(() => this.syncCinematic(), 50);
  }

  endCinematic(cinematic: CinematicMusic): void {
    if (this.cinematic !== cinematic || this.disposed) return;
    if (cinematic.track === 'ending') {
      // The complete ending recording owns its fades. Skip/completion must
      // stop it immediately, without carrying audio into terminal menus.
      this.cancelCinematic();
      this.flowTrack = null;
      return;
    }
    this.clearCinematic();
    // A finale can finish before flow leaves playing (for example while a
    // graphics preparation settles). Wait for an explicit destination route.
    this.flowTrack = null;
    // Finish the outgoing soundtrack before starting destination music.
    this.cancelFade();
    const previous = this.current;
    const initialVolume = previous.volume;
    const initialTarget = this.targetVolume;
    this.endingCinematic = true;
    let tick = 0;
    this.fadeTimer = setInterval(() => {
      previous.volume = Math.min(1, initialVolume * (initialTarget > 0 ? this.targetVolume / initialTarget : 0)) * (1 - ++tick / 32);
      if (tick === 32) {
        this.cancelFade();
        this.endingCinematic = false;
        previous.pause();
        this.requested = null;
        this.cinematicEnvelope = 1;
        this.applyScene(this.flowTrack, this.flowPlay);
      }
    }, 25);
  }

  cancelCinematic(): void {
    if (!this.cinematic && !this.endingCinematic) return;
    this.clearCinematic();
    this.cancelFade();
    this.endingCinematic = false;
    for (const player of this.players) player.pause();
    this.requested = null;
    this.cinematicEnvelope = 1;
  }

  private clearCinematic(): void {
    this.cinematic = undefined;
    if (this.cinematicTimer !== undefined) clearInterval(this.cinematicTimer);
    this.cinematicTimer = undefined;
  }

  private syncCinematic(resume = true): void {
    const cinematic = this.cinematic;
    if (!cinematic) return;
    this.cinematicEnvelope = cinematic.track === 'ending' ? 1 : Math.max(0, Math.min(1, cinematic.duration - cinematic.seconds));
    this.stationaryTicks = cinematic.seconds === this.lastCinematicSeconds ? this.stationaryTicks + 1 : 0;
    this.lastCinematicSeconds = cinematic.seconds;
    this.enabled = this.flowPlay && cinematic.playing && this.stationaryTicks < 5;
    // Media seeks and stalled/slow rendering follow the presentation clock.
    // Metadata may not yet be available, so a failed seek is retried next tick.
    try {
      if (Math.abs(this.current.currentTime - cinematic.seconds) > .35)
        this.current.currentTime = cinematic.seconds;
    } catch { /* Wait for media metadata. */ }
    if (!this.canPlay()) this.current.pause();
    else if (resume) this.resume();
    this.current.volume = this.targetVolume;
  }

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
    this.flowTrack = track;
    this.flowPlay = play;
    if (this.boss) {
      if (!this.endingBoss) this.applyScene('boss', play);
      else {
        this.enabled = play;
        if (!this.canPlay()) this.current.pause();
        else this.resume();
      }
      return;
    }
    if (this.cinematic) { this.syncCinematic(); return; }
    if (this.endingCinematic && play && track !== 'intro') return;
    this.endingCinematic = false;
    this.cinematicEnvelope = 1;
    this.applyScene(track, play);
  }

  private applyScene(track: MusicTrack | null, play: boolean): void {
    if (this.disposed) return;
    const changed = this.requested !== track;
    if (changed) this.playbackFailed = false;
    this.requested = track;
    this.enabled = play;
    if (changed || !play) this.setAutoplayBlocked(false);
    if (!this.canPlay()) {
      this.cancelFade();
      for (const player of this.players) player.pause();
      if (changed && track !== null) {
        const player = this.players[this.active];
        player.src = this.url(track);
        player.loop = !isCinematic(track);
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
    this.playbackFailed = false;
    if (this.canPlay()) this.resume();
  }

  setFocused(focused: boolean): void {
    if (this.focused === focused || this.disposed) return;
    this.focused = focused;
    if (!focused && this.endingCinematic) {
      this.cancelCinematic();
      this.applyScene(this.flowTrack, this.flowPlay);
    }
    if (!this.canPlay()) {
      if (!this.endingBoss) this.cancelFade();
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

  private get targetVolume(): number { return Math.min(1, this.master * this.volume * this.musicGain * cinematicGain(this.requested) * this.cinematicEnvelope); }
  private get current(): MusicElement { return this.players[this.active]; }
  private canPlay(): boolean { return !this.disposed && this.focused && this.enabled; }
  private url(track: MusicTrack): string { return this.base + MUSIC_PATHS[track]; }

  private resume(): void {
    if (!this.canPlay() || this.requested === null) return;
    const player = this.current;
    if (!player.src) player.src = this.url(this.requested);
    if (!this.fadeTimer) player.volume = this.targetVolume;
    if (player.paused && !this.playbackFailed) this.start(player);
  }

  private switchTrack(track: MusicTrack | null): void {
    this.cancelFade();
    const previous = this.current;
    this.players[1 - this.active].pause();
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
    next.loop = !isCinematic(track);
    next.volume = 0;
    this.active = nextIndex;
    if (!previous.src || isCinematic(track) || track === 'boss') {
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
    const source = player.src;
    // Attempt menu playback immediately; compliant browsers can permit it on
    // revisits or when the user has granted this origin autoplay permission.
    // A fresh Chromium profile can reject audible playback without a gesture.
    const failed = (error: unknown): void => {
      if (this.disposed || this.current !== player || player.src !== source || !this.canPlay() || !player.paused) return;
      this.playbackFailed = true;
      if (typeof error === 'object' && error !== null &&
        'name' in error && error.name === 'NotAllowedError') {
        this.setAutoplayBlocked(true);
      }
    };
    try {
      void player.play().then(
        () => {
          if (!this.disposed && this.current === player && player.src === source) this.setAutoplayBlocked(false);
        },
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
    this.cancelBoss();
    this.clearCinematic();
    this.cancelFade();
    this.autoplayBlockedListener = undefined;
    for (const player of this.players) {
      player.pause();
      player.removeAttribute('src');
    }
  }
}
