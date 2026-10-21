import type { RenderLayer } from '../render/RenderLayer.ts';
import type { OpeningGameScene } from './OpeningGameScene.ts';
import { OPENING_GAME_TIMING, sampleOpeningGame } from './OpeningGameTimeline.ts';

type OpeningView = Pick<OpeningGameScene, 'room' | 'begin' | 'prepare' | 'apply' | 'dispose' | 'needsShadowUpdate'>;
type OpeningRenderer = Pick<RenderLayer, 'renderer' | 'withShadowPreparation' | 'setPresentationResolution'>;

export interface OpeningGamePresentationOptions {
  readonly scene: OpeningView;
  readonly renderLayer: OpeningRenderer;
  readonly host: HTMLElement;
  /** Light downloads/idle data only; never construct or render the gameplay scene here. */
  readonly preloadLevel?: () => Promise<void>;
  /** Full room/model construction and GPU work, only after a painted blackout. */
  readonly prepareLevel: () => Promise<void>;
  readonly onComplete: (userGesture: boolean) => void;
  readonly onStatus: (message: string, failed: boolean) => void;
  readonly onFade: (opacity: number) => void;
  readonly reducedMotion?: boolean;
  readonly window?: Window;
}

/** Prepare small downloads/data during the clip; finish cold CPU/GPU jobs under black. */
export class OpeningGamePresentation {
  private readonly options: OpeningGamePresentationOptions;
  private readonly hostWindow: Window;
  private started = false;
  private disposed = false;
  private completed = false;
  private sceneReady = false;
  private scenePending = false;
  private levelReady = false;
  private levelPending = false;
  private failed = false;
  private skipRequested = false;
  private seconds = 0;
  private accumulator = 0;
  private loadFrame = 0;
  private preparationScheduled = false;
  private levelLoadFrame = 0;
  private levelPreparationScheduled = false;
  private preloadStarted = false;
  private width = 0;
  private height = 0;
  private lastStage = '';
  private renderedEnd = false;
  private lastStatus = '';
  private lastFade = -1;

  constructor(options: OpeningGamePresentationOptions) {
    this.options = options;
    this.hostWindow = options.window ?? window;
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.options.scene.begin();
    this.options.renderLayer.setPresentationResolution(1280 * 720);
    this.options.host.dataset.openingMode = 'live';
    this.options.host.dataset.openingState = 'preparing';
  }

  /** Keep one GPU job per browser task without paying a display frame for
   * every job once full Level 1 preparation holds the painted blackout. */
  yieldPreparation(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.levelPending && this.lastFade === 1) {
      const scheduler = (this.hostWindow as Window & {scheduler?: {yield(): Promise<void>}}).scheduler;
      // Supported browsers can yield without the nested-timer delay. Both
      // paths return to the browser between jobs; neither drains microtasks.
      if (scheduler?.yield) return scheduler.yield();
    }
    return new Promise(resolve => {
      if (this.levelPending && this.lastFade === 1) this.hostWindow.setTimeout(resolve, 0);
      else this.hostWindow.requestAnimationFrame(() => resolve());
    });
  }

  private schedulePreparation(): void {
    if (this.preparationScheduled || this.disposed) return;
    this.preparationScheduled = true;
    // Fade the already-warmed menu first. Neither scene construction nor
    // shader/texture uploads may block Start's visible fade to black.
    this.loadFrame = this.hostWindow.requestAnimationFrame(() => {
      this.loadFrame = this.hostWindow.requestAnimationFrame(() => {
        this.loadFrame = 0;
        this.prepareScene();
      });
    });
  }

  private scheduleLevelPreparation(): void {
    if (this.levelPreparationScheduled || this.disposed || this.levelReady) return;
    this.levelPreparationScheduled = true;
    // Setting opacity is not a painted frame. Give the compositor a complete
    // blackout paint before world construction, decoding or driver stalls.
    this.levelLoadFrame = this.hostWindow.requestAnimationFrame(() => {
      this.levelLoadFrame = this.hostWindow.requestAnimationFrame(() => {
        this.levelLoadFrame = 0;
        // A very early Skip still lets the cinematic's own preparation settle.
        if (!this.scenePending && (this.sceneReady || this.failed)) this.prepareLevel();
      });
    });
  }

  private preloadLevel(): void {
    if (this.preloadStarted || this.disposed) return;
    this.preloadStarted = true;
    // Failure must not interrupt the film. Real preparation retries required
    // downloads and reports errors; speculation must never decode models.
    void Promise.resolve().then(() => {
      if (!this.disposed) return this.options.preloadLevel?.();
    }).catch(() => {});
  }

  skip(): void {
    if (!this.started || this.disposed || this.completed) return;
    this.skipRequested = true;
    this.seconds = OPENING_GAME_TIMING.end;
    this.updateFade(1);
    this.schedulePreparation();
    this.scheduleLevelPreparation();
    this.renderedEnd = false;
    this.tryComplete(true);
    this.syncStatus();
  }

  retry(): void {
    if (this.disposed || this.completed || !this.failed) return;
    this.failed = false;
    if (!this.sceneReady) this.prepareScene();
    // Failure recovery already holds black. Retry both unready prerequisites;
    // neither one can rely on the other's success to schedule it again.
    if (!this.levelReady && this.levelPreparationScheduled) this.prepareLevel();
    this.syncStatus();
  }

  render(deltaSeconds: number): void {
    if (!this.started || this.disposed || this.completed || this.options.host.ownerDocument.hidden) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
    if (!this.sceneReady || (this.levelPreparationScheduled && !this.levelReady &&
      this.seconds < OPENING_GAME_TIMING.end)) {
      // Initial preparation (or recovery from a failed clip) holds black. The
      // normal tour does not wait for Level 1's speculative download bank.
      this.seconds = this.skipRequested ? OPENING_GAME_TIMING.end
        : Math.min(OPENING_GAME_TIMING.blackoutEnd, this.seconds + delta);
      this.updateFade(sampleOpeningGame(this.seconds).fade);
      if (this.seconds >= OPENING_GAME_TIMING.blackoutEnd) this.schedulePreparation();
      return;
    }
    if (this.skipRequested || this.renderedEnd) {
      // Keep the last framebuffer while black. Even resizing must not redraw a
      // cinematic/transmission pass alongside final gameplay preparation.
      this.tryComplete(false);
      return;
    }
    this.seconds = Math.min(OPENING_GAME_TIMING.end, this.seconds + delta);
    this.accumulator += delta;
    const width = Math.max(1, this.options.host.clientWidth), height = Math.max(1, this.options.host.clientHeight);
    const resized = width !== this.width || height !== this.height;
    if (!resized && this.accumulator + 1e-9 < 1 / 30) return;
    const frame = sampleOpeningGame(this.seconds);
    this.options.scene.apply(frame, width / height, this.options.reducedMotion);
    this.options.renderLayer.withShadowPreparation(true, () => {
      this.options.renderLayer.renderer.shadowMap.needsUpdate = this.options.scene.needsShadowUpdate;
      this.options.renderLayer.renderer.render(this.options.scene.room.scene, this.options.scene.room.camera);
    });
    this.updateFade(frame.fade);
    if (frame.stage !== this.lastStage) {
      this.options.host.dataset.openingStage = frame.stage;
      this.lastStage = frame.stage;
    }
    this.width = width; this.height = height;
    this.accumulator %= 1 / 30;
    this.renderedEnd = frame.stage === 'complete';
    if (this.renderedEnd) this.scheduleLevelPreparation();
    this.syncStatus();
    this.tryComplete(false);
  }

  private updateFade(opacity: number): void {
    if (opacity === this.lastFade) return;
    this.options.onFade(opacity);
    this.lastFade = opacity;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hostWindow.cancelAnimationFrame(this.loadFrame);
    this.hostWindow.cancelAnimationFrame(this.levelLoadFrame);
    this.options.scene.dispose();
    this.options.renderLayer.setPresentationResolution(undefined);
    delete this.options.host.dataset.openingState;
    delete this.options.host.dataset.openingStage;
    delete this.options.host.dataset.openingMode;
  }

  private prepareScene(): void {
    if (this.scenePending || this.disposed) return;
    this.scenePending = true;
    this.options.onStatus('Preparing the opening…', false);
    void this.options.scene.prepare(this.options.renderLayer).then(() => {
      if (this.disposed) return;
      this.scenePending = false;
      this.sceneReady = true;
      if (this.skipRequested) {
        // The early Skip's scheduled blackout may already have painted while
        // the cinematic was preparing. Otherwise its second frame starts L1.
        if (this.levelLoadFrame === 0) this.prepareLevel();
      } else if (!this.levelPreparationScheduled) this.preloadLevel();
      this.syncStatus();
      this.tryComplete(false);
    }, () => {
      if (this.disposed) return;
      this.scenePending = false;
      this.failed = true;
      // The failed clip is still fully black; warm Level 1 so Skip can recover.
      if (!this.levelPreparationScheduled) this.scheduleLevelPreparation();
      else if (this.levelLoadFrame === 0) this.prepareLevel();
      this.syncStatus();
      this.tryComplete(false);
    });
  }

  private prepareLevel(): void {
    if (this.levelPending || this.levelReady || this.disposed) return;
    this.levelPending = true;
    // Promise.resolve also routes synchronous construction failures to recovery.
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
      this.failed = true;
      this.syncStatus();
    });
  }

  private tryComplete(userGesture: boolean): void {
    // Let an in-flight cinematic compilation settle before releasing its live
    // materials/programs. A failed cinematic can still be skipped once L1 is ready.
    if (this.disposed || this.completed || this.scenePending || !this.levelReady ||
      (!this.skipRequested && this.seconds < OPENING_GAME_TIMING.end)) return;
    this.completed = true;
    this.options.onComplete(userGesture);
  }

  private syncStatus(): void {
    if (this.disposed || this.completed) return;
    const waiting = this.skipRequested || this.seconds >= OPENING_GAME_TIMING.end;
    const state = this.failed ? 'failed' : waiting ? 'waiting'
      : !this.sceneReady || (this.levelPreparationScheduled && !this.levelReady) ? 'preparing' : 'playing';
    const host = this.options.host;
    if (host.dataset.openingState !== state) host.dataset.openingState = state;
    const statusKey = `${state}:${this.sceneReady}`;
    if (this.lastStatus === statusKey) return;
    this.lastStatus = statusKey;
    this.options.onStatus(this.failed ? 'Preparation could not finish. Retry, or skip if Level 1 is ready.'
      : !this.sceneReady && !waiting ? 'Preparing the opening…'
      : waiting || (this.levelPreparationScheduled && !this.levelReady) ? 'Preparing Level 1…' : '', this.failed);
  }
}
