import type { RenderLayer } from '../render/RenderLayer.ts';
import type { OpeningGameScene } from './OpeningGameScene.ts';
import { OPENING_GAME_TIMING, sampleOpeningGame } from './OpeningGameTimeline.ts';

type OpeningView = Pick<OpeningGameScene, 'room' | 'begin' | 'prepare' | 'apply' | 'dispose' | 'needsShadowUpdate'>;
type OpeningRenderer = Pick<RenderLayer, 'renderer' | 'withShadowPreparation' | 'setPresentationResolution'>;

export interface OpeningGamePresentationOptions {
  readonly scene: OpeningView;
  readonly renderLayer: OpeningRenderer;
  readonly host: HTMLElement;
  readonly prepareLevel: () => Promise<void>;
  readonly onComplete: (userGesture: boolean) => void;
  readonly onStatus: (message: string, failed: boolean) => void;
  readonly onFade: (opacity: number) => void;
  readonly reducedMotion?: boolean;
  readonly window?: Window;
}

/** One loop/renderer: the clip and async Level 1 readiness must both finish. */
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
    this.options.host.dataset.openingState = 'preparing';
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
        this.prepareLevel();
      });
    });
  }

  skip(): void {
    if (!this.started || this.disposed || this.completed) return;
    this.skipRequested = true;
    this.seconds = OPENING_GAME_TIMING.end;
    this.updateFade(1);
    this.schedulePreparation();
    this.renderedEnd = false;
    this.tryComplete(true);
    this.syncStatus();
  }

  retry(): void {
    if (this.disposed || this.completed || !this.failed) return;
    this.failed = false;
    if (!this.sceneReady) this.prepareScene();
    if (!this.levelReady) this.prepareLevel();
    this.syncStatus();
  }

  render(deltaSeconds: number): void {
    if (!this.started || this.disposed || this.completed || this.options.host.ownerDocument.hidden) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
    if (!this.sceneReady) {
      // Fade the retained title frame while assets prepare, then hold black.
      // Do not spend the experiment tour's time before its shaders are ready.
      this.seconds = this.skipRequested ? OPENING_GAME_TIMING.end
        : Math.min(OPENING_GAME_TIMING.blackoutEnd, this.seconds + delta);
      this.updateFade(sampleOpeningGame(this.seconds).fade);
      if (this.seconds >= OPENING_GAME_TIMING.blackoutEnd) this.schedulePreparation();
      return;
    }
    this.seconds = Math.min(OPENING_GAME_TIMING.end, this.seconds + delta);
    this.accumulator += delta;
    const width = Math.max(1, this.options.host.clientWidth), height = Math.max(1, this.options.host.clientHeight);
    const resized = width !== this.width || height !== this.height;
    if (!resized && this.accumulator + 1e-9 < 1 / 30) return;
    if (!resized && this.renderedEnd) { this.tryComplete(false); return; }
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
    this.options.scene.dispose();
    this.options.renderLayer.setPresentationResolution(undefined);
    delete this.options.host.dataset.openingState;
    delete this.options.host.dataset.openingStage;
  }

  private prepareScene(): void {
    if (this.scenePending || this.disposed) return;
    this.scenePending = true;
    this.options.onStatus('Preparing the opening…', false);
    void this.options.scene.prepare(this.options.renderLayer).then(() => {
      if (this.disposed) return;
      this.scenePending = false;
      this.sceneReady = true;
      this.syncStatus();
      this.tryComplete(false);
    }, () => {
      if (this.disposed) return;
      this.scenePending = false;
      this.failed = true;
      this.syncStatus();
      this.tryComplete(false);
    });
  }

  private prepareLevel(): void {
    if (this.levelPending || this.levelReady || this.disposed) return;
    this.levelPending = true;
    // Promise.resolve also routes synchronous construction failures to recovery.
    void Promise.resolve().then(this.options.prepareLevel).then(() => {
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
    const state = this.failed ? 'failed' : !this.sceneReady ? 'preparing' : waiting ? 'waiting' : 'playing';
    const host = this.options.host;
    if (host.dataset.openingState !== state) host.dataset.openingState = state;
    if (this.lastStatus === state) return;
    this.lastStatus = state;
    this.options.onStatus(this.failed ? 'Preparation could not finish. Retry, or skip if Level 1 is ready.'
      : !this.sceneReady && !waiting ? 'Preparing the opening…' : waiting ? 'Preparing Level 1…' : '', this.failed);
  }
}
