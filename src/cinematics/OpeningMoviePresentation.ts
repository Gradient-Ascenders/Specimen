import { OPENING_GAME_TIMING, openingEase, sampleOpeningGame } from './OpeningGameTimeline.ts';

export interface OpeningMoviePresentationOptions {
  readonly host: HTMLElement;
  readonly videoHost: HTMLElement;
  readonly source: string;
  /** Export starts after the menu fade, which remains a live DOM transition. */
  readonly sourceStartSeconds: number;
  readonly onBlackout: () => void;
  readonly prepareLevel: () => Promise<void>;
  readonly onComplete: (userGesture: boolean) => void;
  readonly onStatus: (message: string, failed: boolean) => void;
  readonly onFade: (opacity: number) => void;
  readonly window?: Window;
  readonly createVideo?: () => HTMLVideoElement;
}

/** Native media playback leaves the WebGL renderer free to prepare gameplay. */
export class OpeningMoviePresentation {
  private readonly options: OpeningMoviePresentationOptions;
  private readonly hostWindow: Window;
  private readonly video: HTMLVideoElement;
  private readonly frames = new Set<number>();
  private readonly yields = new Map<number, () => void>();
  private started = false;
  private disposed = false;
  private completed = false;
  private blackedOut = false;
  private blackoutScheduled = false;
  private levelScheduled = false;
  private levelPending = false;
  private levelReady = false;
  private levelFailed = false;
  private mediaFailed = false;
  private moviePlaying = false;
  private ended = false;
  private skipped = false;
  private fadeSeconds = 0;
  private lastFade = -1;
  private lastStatus = '';
  private lastPreparationSliceAt: number | undefined;

  constructor(options: OpeningMoviePresentationOptions) {
    this.options = options;
    this.hostWindow = options.window ?? window;
    this.video = options.createVideo?.() ?? options.host.ownerDocument.createElement('video');
    this.video.className = 'opening-video';
    this.video.setAttribute('aria-hidden', 'true');
    this.video.tabIndex = -1;
    this.video.playsInline = true;
    // The authored live intro is silent too. Muted native playback is allowed
    // after the asynchronous menu fade without relying on user activation.
    this.video.muted = true;
    this.video.preload = 'auto';
    this.video.controls = false;
    this.video.hidden = true;
    this.video.addEventListener('playing', this.onPlaying);
    this.video.addEventListener('ended', this.onEnded);
    this.video.addEventListener('error', this.onMediaError);
    options.host.ownerDocument.addEventListener('visibilitychange', this.onVisibility);
    options.videoHost.prepend(this.video);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.options.host.dataset.openingMode = 'video';
    this.video.src = this.options.source;
    this.video.load();
    this.setFade(0);
    this.syncStatus();
  }

  render(deltaSeconds: number): void {
    if (!this.started || this.disposed || this.completed || this.options.host.ownerDocument.hidden) return;
    if (!this.blackedOut) {
      const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
      this.fadeSeconds = Math.min(OPENING_GAME_TIMING.blackoutEnd, this.fadeSeconds + delta);
      if (!this.skipped && !this.mediaFailed) this.setFade(openingEase(0, OPENING_GAME_TIMING.blackoutEnd, this.fadeSeconds));
      if (this.fadeSeconds >= OPENING_GAME_TIMING.blackoutEnd) this.scheduleBlackout();
    }
    const stage = this.ended || this.skipped ? 'complete'
      : sampleOpeningGame(this.video.currentTime + this.options.sourceStartSeconds).stage;
    if (this.options.host.dataset.openingStage !== stage) this.options.host.dataset.openingStage = stage;
  }

  skip(): void {
    if (!this.started || this.disposed || this.completed) return;
    this.skipped = true;
    this.video.pause();
    this.setFade(1);
    this.releaseYields();
    if (!this.blackedOut) this.scheduleBlackout();
    else this.scheduleLevel();
    this.syncStatus();
    this.tryComplete(true);
  }

  retry(): void {
    if (this.disposed || this.completed) return;
    if (this.levelFailed) {
      this.levelFailed = false;
      this.scheduleLevel();
    }
    if (this.mediaFailed && !this.skipped) {
      this.mediaFailed = false;
      this.video.load();
      if (this.blackedOut) this.playMovie();
    }
    this.syncStatus();
  }

  /** Yield a video frame for cheap jobs, more after an expensive one; no video-only
   * pacing once the ending/Skip has covered the screen. */
  yieldPreparation(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise(resolve => {
      const now = this.hostWindow.performance.now();
      const busy = this.lastPreparationSliceAt === undefined ? Infinity : now - this.lastPreparationSliceAt;
      const delay = !this.skipped && !this.ended && !this.mediaFailed ? (busy > 8 ? 80 : 33) : 0;
      const id = this.hostWindow.setTimeout(() => {
        this.yields.delete(id);
        this.lastPreparationSliceAt = this.hostWindow.performance.now();
        resolve();
      }, delay);
      this.yields.set(id, resolve);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.frames) this.hostWindow.cancelAnimationFrame(id);
    this.frames.clear();
    this.releaseYields();
    this.video.removeEventListener('playing', this.onPlaying);
    this.video.removeEventListener('ended', this.onEnded);
    this.video.removeEventListener('error', this.onMediaError);
    this.options.host.ownerDocument.removeEventListener('visibilitychange', this.onVisibility);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
    delete this.options.host.dataset.openingMode;
    delete this.options.host.dataset.openingState;
    delete this.options.host.dataset.openingStage;
  }

  private afterPaint(action: () => void): void {
    const schedule = (callback: () => void): void => {
      const id = this.hostWindow.requestAnimationFrame(() => {
        this.frames.delete(id);
        if (!this.disposed && !this.completed) callback();
      });
      this.frames.add(id);
    };
    schedule(() => schedule(action));
  }

  private scheduleBlackout(): void {
    if (this.blackoutScheduled || this.disposed) return;
    this.blackoutScheduled = true;
    this.afterPaint(() => {
      this.blackedOut = true;
      this.options.onBlackout();
      this.video.hidden = false;
      if (this.skipped || this.mediaFailed) this.scheduleLevel();
      else this.playMovie();
    });
  }

  private playMovie(): void {
    if (this.disposed || this.completed || this.skipped || this.ended || this.options.host.ownerDocument.hidden) return;
    void this.video.play().catch(() => {
      if (!this.disposed && !this.skipped && !this.options.host.ownerDocument.hidden) this.onMediaError();
    });
  }

  private readonly onPlaying = (): void => {
    if (this.disposed || this.skipped || this.ended || this.mediaFailed) return;
    this.moviePlaying = true;
    this.setFade(0); // The file itself contains the laboratory reveal/final fade.
    // Let the native decoder present frames before CPU construction starts.
    this.scheduleLevel();
    this.syncStatus();
  };

  private readonly onEnded = (): void => {
    if (this.disposed || this.completed) return;
    this.ended = true;
    this.setFade(1);
    this.options.host.dataset.openingStage = 'complete';
    this.releaseYields();
    this.scheduleLevel();
    this.syncStatus();
    this.tryComplete(false);
  };

  private readonly onMediaError = (): void => {
    if (this.disposed || this.completed || this.skipped) return;
    this.mediaFailed = true;
    this.moviePlaying = false;
    this.video.pause();
    this.setFade(1);
    this.releaseYields();
    if (this.blackedOut) this.scheduleLevel();
    else this.scheduleBlackout();
    this.syncStatus();
  };

  private readonly onVisibility = (): void => {
    if (this.options.host.ownerDocument.hidden) this.video.pause();
    else if (this.blackedOut && !this.mediaFailed) this.playMovie();
  };

  private scheduleLevel(): void {
    if (this.levelScheduled || this.levelPending || this.levelReady || this.levelFailed || this.disposed) return;
    this.levelScheduled = true;
    this.afterPaint(() => {
      this.levelScheduled = false;
      this.levelPending = true;
      void Promise.resolve().then(() => {
        if (!this.disposed) return this.options.prepareLevel();
      }).then(() => {
        if (this.disposed) return;
        this.levelPending = false;
        this.levelReady = true;
        this.syncStatus();
        this.tryComplete(false);
      }, () => {
        if (this.disposed) return;
        this.levelPending = false;
        this.levelFailed = true;
        this.syncStatus();
      });
    });
  }

  private tryComplete(userGesture: boolean): void {
    if (this.disposed || this.completed || !this.levelReady || (!this.skipped && !this.ended)) return;
    this.completed = true;
    this.options.onComplete(userGesture);
  }

  private releaseYields(): void {
    for (const [id, resolve] of this.yields) { this.hostWindow.clearTimeout(id); resolve(); }
    this.yields.clear();
  }

  private setFade(opacity: number): void {
    if (opacity === this.lastFade) return;
    this.lastFade = opacity;
    this.options.onFade(opacity);
  }

  private syncStatus(): void {
    if (this.disposed || this.completed) return;
    const waiting = this.skipped || this.ended;
    const failed = this.levelFailed || (this.mediaFailed && !this.skipped);
    const state = failed ? 'failed' : waiting ? 'waiting' : this.moviePlaying ? 'playing' : 'preparing';
    this.options.host.dataset.openingState = state;
    const message = this.levelFailed ? 'Level 1 could not finish loading. Retry to continue.'
      : this.mediaFailed && !this.skipped ? 'The opening video could not play. Retry, or skip to Level 1.'
      : waiting && !this.levelReady ? 'Preparing Level 1…' : !this.moviePlaying && !waiting ? 'Loading the opening…' : '';
    const key = `${failed}:${message}`;
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.options.onStatus(message, failed);
  }
}
