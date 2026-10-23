import { EventBus } from '../core/EventBus.ts';
import { GraphicsPreparation } from '../render/GraphicsPreparation.ts';
import type { LoopStats } from '../core/Loop.ts';
import type { PerformanceGameplaySnapshot } from '../core/PerformanceSnapshot.ts';
import {
  EMPTY_SLIME_HUD_SNAPSHOT,
  type SlimeHUDListener,
  type SlimeHUDSnapshot,
} from '../slimes/SlimeHUDState.ts';
import type { LevelLifecycleState } from './LevelLifecycle.ts';
import type { GameLevelRuntime } from './GameLevelRuntime.ts';
import type { LevelProgressionSnapshot } from './LevelProgression.ts';

export type SessionLevelId = 'level-2' | 'level-3';

export interface GameSessionEvents {
  graphicsPreparationChanged: { readonly pending: boolean; readonly failed: boolean };
  objectiveChanged: { readonly roomId: string | number; readonly objective: string };
  transitionStarted: { readonly levelId: SessionLevelId; readonly message: string };
  transitionCompleted: { readonly levelId: SessionLevelId };
  transitionFailed: { readonly levelId: SessionLevelId; readonly message: string };
  gameCompleted: {};
}

type RuntimeFactory = (
  progression: LevelProgressionSnapshot,
) => GameLevelRuntime | Promise<GameLevelRuntime>;

export interface GameSessionCoordinatorOptions {
  readonly initialRuntime: GameLevelRuntime;
  readonly createLevelTwo: RuntimeFactory;
  readonly createLevelThree?: RuntimeFactory;
  readonly scheduleTransition: (transition: () => void) => void;
}

/** Application owner for exactly one concrete running level runtime. */
export class GameSessionCoordinator {
  readonly events = new EventBus<GameSessionEvents>();

  private runtime: GameLevelRuntime;
  private readonly createLevelTwo: RuntimeFactory;
  private readonly createLevelThree: RuntimeFactory | undefined;
  private readonly scheduleTransition: GameSessionCoordinatorOptions['scheduleTransition'];
  private readonly hudListeners = new Set<SlimeHUDListener>();
  private unsubscribeRuntimeEvents: readonly (() => void)[] = [];
  private unsubscribeRuntimeHUD: () => void = () => {};
  private transitionPending = false;
  private transitionGeneration = 0;
  private transitionFailed = false;
  private debugInteractionEnabled = true;
  private disposed = false;
  private renderedInterpolationAlpha = 0;
  private resumeAfterGraphics = false;
  private initialPreparationPending = false;
  private graphicsOwnerGeneration = 0;
  private queuedGraphics: {key: string; apply: () => void; resourceKey?: string} | undefined;
  private readonly graphicsPreparation = new GraphicsPreparation((pending, error) => {
    if (pending && this.runtime.state === 'running') {
      this.resumeAfterGraphics = true; this.runtime.stop();
    }
    this.events.emit('graphicsPreparationChanged', {pending, failed: error !== undefined});
    if (!pending && this.resumeAfterGraphics && !this.disposed && !this.transitionPending) {
      this.resumeAfterGraphics = false; this.runtime.start();
    }
  });

  constructor(options: GameSessionCoordinatorOptions) {
    this.runtime = options.initialRuntime;
    this.createLevelTwo = options.createLevelTwo;
    this.createLevelThree = options.createLevelThree;
    this.scheduleTransition = options.scheduleTransition;
    this.bindRuntime(this.runtime);
  }

  get state(): LevelLifecycleState {
    return this.transitionFailed ? 'stopped' : this.runtime.state;
  }

  load(): void { this.runtime.load(); }
  start(): void {
    if (this.graphicsPreparation.pending || this.initialPreparationPending) { this.resumeAfterGraphics = true; return; }
    if (!this.transitionFailed) this.runtime.start();
  }
  stop(): void { this.resumeAfterGraphics = false; if (!this.transitionFailed) this.runtime.stop(); }
  applyGraphicsSettings(key: string, apply: () => void, resourceKey?: string): void {
    if (this.disposed) return;
    if (this.transitionPending || this.initialPreparationPending) { this.queuedGraphics = {key, apply, resourceKey}; return; }
    const runtime = this.runtime;
    // The title now precedes runtime construction. Apply its settings without
    // constructing a level; the opening's mandatory initial pass prepares them.
    this.graphicsPreparation.update(key, apply, () => runtime.state === 'unloaded'
      ? Promise.resolve() : runtime.prepareGraphics?.() ?? Promise.resolve(),
      resourceKey === undefined ? undefined : {key:resourceKey, prepare:() => {
        if (runtime.state === 'unloaded' || resourceKey === 'no-transmission') return Promise.resolve();
        return runtime.prepareRenderResources?.(this.renderedInterpolationAlpha, {
          fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,stepsThisFrame:0,
          interpolationAlpha:this.renderedInterpolationAlpha,droppedSimulationTimeSeconds:0,renderFps:0,
        }) ?? runtime.prepareGraphics?.() ?? Promise.resolve();
      }});
  }
  async prepareInitialGraphics(selectGraphics?: () => Promise<void>): Promise<void> {
    const runtime = this.runtime;
    const generation = this.graphicsOwnerGeneration;
    let prepared = false;
    this.initialPreparationPending = true;
    try {
      if (selectGraphics) await selectGraphics();
      if (this.disposed || runtime !== this.runtime || generation !== this.graphicsOwnerGeneration) return;
      const selected = this.queuedGraphics;
      this.queuedGraphics = undefined;
      if (selected) this.graphicsPreparation.stageInitial(selected.key, selected.apply, selected.resourceKey);
      await runtime.prepareGraphics?.();
      if (this.disposed || runtime !== this.runtime || generation !== this.graphicsOwnerGeneration) return;
      this.graphicsPreparation.adoptPrepared();
      prepared = true;
    } finally {
      if (generation === this.graphicsOwnerGeneration) {
        this.initialPreparationPending = false;
        if (prepared && !this.disposed && runtime === this.runtime) this.flushGraphicsSettings();
        else this.queuedGraphics = undefined;
        if (prepared && this.resumeAfterGraphics && !this.graphicsPreparation.pending && !this.disposed && runtime === this.runtime) {
          this.resumeAfterGraphics = false;
          runtime.start();
        }
      }
    }
  }
  private flushGraphicsSettings(): void {
    const request = this.queuedGraphics; this.queuedGraphics = undefined;
    if (request) this.applyGraphicsSettings(request.key, request.apply, request.resourceKey);
  }
  restartLevel(): void {
    if (this.transitionFailed) throw new Error('Cannot restart after a failed level transition.');
    if (this.graphicsPreparation.pending) {
      const runtime = this.runtime, generation = this.graphicsOwnerGeneration;
      void this.graphicsPreparation.settled.then(() => {
        if (!this.disposed && runtime === this.runtime && generation === this.graphicsOwnerGeneration && !this.graphicsPreparation.pending) runtime.restartLevel();
      });
      return;
    }
    this.runtime.restartLevel();
  }
  unload(): void {
    ++this.graphicsOwnerGeneration; this.initialPreparationPending = false;
    this.queuedGraphics = undefined;
    this.resumeAfterGraphics = false; this.graphicsPreparation.cancel();
    this.cancelPendingTransition();
    this.runtime.unload();
  }
  setDebugInteractionEnabled(enabled: boolean): void {
    this.debugInteractionEnabled = enabled;
    this.runtime.setDebugInteractionEnabled(enabled && !this.transitionPending);
  }

  prepareCleanGameplay(): void {
    this.runtime.prepareCleanGameplay?.();
  }

  fixedUpdate(deltaSeconds: number): void {
    if (!this.transitionPending && !this.transitionFailed && !this.graphicsPreparation.pending && !this.initialPreparationPending) this.runtime.fixedUpdate(deltaSeconds);
  }

  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void {
    if (this.transitionPending || this.transitionFailed || this.graphicsPreparation.pending || this.initialPreparationPending) return;
    // The browser loop keeps ticking behind menus. Reusing its changing alpha
    // against frozen physics snapshots makes paused bodies and morphs oscillate.
    if (this.runtime.state === 'running') this.renderedInterpolationAlpha = interpolationAlpha;
    this.runtime.render(this.renderedInterpolationAlpha, stats);
  }

  getSpeedEffectStrength(): number {
    if (this.disposed || this.transitionPending || this.transitionFailed || this.graphicsPreparation.pending || this.initialPreparationPending) return 0;
    return this.runtime.getSpeedEffectStrength?.() ?? 0;
  }

  subscribeSlimeHUD(listener: SlimeHUDListener): () => void {
    this.hudListeners.add(listener);
    listener(this.getSlimeHUDSnapshot());
    return () => this.hudListeners.delete(listener);
  }

  getSlimeHUDSnapshot(): SlimeHUDSnapshot {
    return this.transitionFailed ? EMPTY_SLIME_HUD_SNAPSHOT : this.runtime.getSlimeHUDSnapshot();
  }

  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void {
    this.runtime.writePerformanceSnapshot(target);
    // Resources can retain a playing phase while their lifecycle is stopped.
    if (this.transitionPending || this.initialPreparationPending || this.graphicsPreparation.pending) {
      target.gameplayState = 'loading';
      target.cutsceneState = 'none';
    } else if (this.runtime.state !== 'running' || this.transitionFailed) {
      target.gameplayState = this.runtime.state === 'unloaded' ? 'loading'
        : this.runtime.state === 'disposed' ? 'disposed'
          : this.runtime.state === 'restarting' ? 'restarting' : 'paused';
      target.cutsceneState = 'none';
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.graphicsOwnerGeneration;
    this.queuedGraphics = undefined;
    this.resumeAfterGraphics = false; this.graphicsPreparation.cancel();
    this.cancelPendingTransition();
    this.unbindRuntime();
    this.runtime.dispose();
    this.hudListeners.clear();
    this.events.clear();
  }

  /** Release the current run while retaining application subscriptions. */
  reset(initialRuntime: GameLevelRuntime): void {
    if (this.disposed) {
      initialRuntime.dispose();
      return;
    }
    ++this.graphicsOwnerGeneration;
    this.initialPreparationPending = false;
    this.queuedGraphics = undefined;
    this.resumeAfterGraphics = false;
    this.graphicsPreparation.cancel();
    this.cancelPendingTransition();
    this.unbindRuntime();
    this.runtime.dispose();
    this.runtime = initialRuntime;
    this.transitionFailed = false;
    this.debugInteractionEnabled = false;
    initialRuntime.setDebugInteractionEnabled(false);
    this.bindRuntime(initialRuntime);
  }

  private bindRuntime(runtime: GameLevelRuntime): void {
    this.renderedInterpolationAlpha = 0;
    this.unsubscribeRuntimeEvents = [
      runtime.events.on('objectiveChanged', (event) => this.events.emit('objectiveChanged', event)),
      runtime.events.on('completed', (event) => this.onLevelCompleted(event.nextLevelId)),
    ];
    this.unsubscribeRuntimeHUD = runtime.subscribeSlimeHUD((snapshot) => {
      for (const listener of this.hudListeners) listener(snapshot);
    });
  }

  /** Enter a later level with the roster earned before its normal arrival. */
  startSelectedLevel(levelId: SessionLevelId): void {
    this.beginTransition(levelId, {
      unlockedSlimeIds: levelId === 'level-2' ? ['bob', 'goop'] : ['bob', 'goop', 'volt'],
      activeSlimeId: 'bob',
    });
  }

  private unbindRuntime(): void {
    for (const unsubscribe of this.unsubscribeRuntimeEvents) unsubscribe();
    this.unsubscribeRuntimeEvents = [];
    this.unsubscribeRuntimeHUD();
    this.unsubscribeRuntimeHUD = () => {};
  }

  private onLevelCompleted(nextLevelId: string): void {
    if (nextLevelId === 'complete' && !this.disposed) {
      this.events.emit('gameCompleted', {});
      return;
    }
    if (this.graphicsPreparation.pending) {
      const runtime = this.runtime;
      void this.graphicsPreparation.settled.then(() => {
        if (!this.disposed && runtime === this.runtime && !this.graphicsPreparation.pending) this.onLevelCompleted(nextLevelId);
      });
      return;
    }
    if (nextLevelId !== 'level-2' && nextLevelId !== 'level-3') return;
    this.beginTransition(nextLevelId, this.runtime.captureProgressionSnapshot());
  }

  private beginTransition(target: SessionLevelId, progression: LevelProgressionSnapshot): void {
    if (
      this.transitionPending || this.transitionFailed || this.disposed
    ) return;

    const factory = target === 'level-2' ? this.createLevelTwo : this.createLevelThree;
    if (!factory) {
      this.transitionFailed = true;
      this.events.emit('transitionFailed', {
        levelId: target,
        message: `${displayName(target)} could not be started: runtime factory unavailable.`,
      });
      for (const listener of this.hudListeners) listener(EMPTY_SLIME_HUD_SNAPSHOT);
      return;
    }

    if (this.runtime.state === 'running') this.runtime.stop();
    this.transitionPending = true;
    const transitionGeneration = ++this.transitionGeneration;
    this.runtime.setDebugInteractionEnabled(false);
    this.events.emit('transitionStarted', {
      levelId: target,
      message: `Entering ${displayName(target)}…`,
    });
    this.scheduleTransition(() =>
      this.performTransition(target, factory, progression, transitionGeneration));
  }

  private performTransition(
    target: SessionLevelId,
    factory: RuntimeFactory,
    progression: LevelProgressionSnapshot,
    transitionGeneration: number,
  ): void {
    if (!this.isCurrentTransition(transitionGeneration)) return;
    const previousRuntime = this.runtime;

    try {
      this.unbindRuntime();
      previousRuntime.unload();
      previousRuntime.dispose();

      const nextRuntime = factory(progression);
      if (isPromiseLike(nextRuntime)) {
        void Promise.resolve(nextRuntime).then(
          (resolvedRuntime) => this.finishTransition(
            target,
            resolvedRuntime,
            previousRuntime,
            transitionGeneration,
          ),
          (error: unknown) => this.failTransition(
            target,
            error,
            previousRuntime,
            undefined,
            transitionGeneration,
          ),
        );
        return;
      }
      this.finishTransition(
        target,
        nextRuntime,
        previousRuntime,
        transitionGeneration,
      );
    } catch (error) {
      this.failTransition(
        target,
        error,
        previousRuntime,
        undefined,
        transitionGeneration,
      );
    }
  }

  private finishTransition(
    target: SessionLevelId,
    nextRuntime: GameLevelRuntime,
    previousRuntime: GameLevelRuntime,
    transitionGeneration: number,
  ): void {
    if (!this.isCurrentTransition(transitionGeneration)) {
      nextRuntime.dispose();
      return;
    }

    try {
      this.runtime = nextRuntime;
      nextRuntime.setDebugInteractionEnabled(
        this.debugInteractionEnabled && !this.transitionPending,
      );
      this.bindRuntime(nextRuntime);
      nextRuntime.load();
      const complete = () => {
        if (!this.isCurrentTransition(transitionGeneration)) return;
        this.transitionPending = false;
        this.graphicsPreparation.adoptPrepared();
        this.flushGraphicsSettings();
        this.events.emit('transitionCompleted', { levelId: target });
      };
      const preparation = nextRuntime.preparePresentation?.();
      if (preparation) {
        void preparation.then(
          complete,
          error => this.failTransition(
            target,
            error,
            previousRuntime,
            nextRuntime,
            transitionGeneration,
          ),
        );
      } else complete();
    } catch (error) {
      this.failTransition(
        target,
        error,
        previousRuntime,
        nextRuntime,
        transitionGeneration,
      );
    }
  }

  private failTransition(
    target: SessionLevelId,
    error: unknown,
    previousRuntime: GameLevelRuntime,
    nextRuntime: GameLevelRuntime | undefined,
    transitionGeneration: number,
  ): void {
    if (!this.isCurrentTransition(transitionGeneration)) return;
    this.unbindRuntime();
    nextRuntime?.dispose();
    this.runtime = nextRuntime ?? previousRuntime;
    this.transitionPending = false;
    this.transitionFailed = true;
    const detail = error instanceof Error ? error.message : String(error);
    this.events.emit('transitionFailed', {
      levelId: target,
      message: `${displayName(target)} could not be started: ${detail}`,
    });
    for (const listener of this.hudListeners) listener(EMPTY_SLIME_HUD_SNAPSHOT);
  }

  private isCurrentTransition(transitionGeneration: number): boolean {
    return (
      !this.disposed && this.transitionPending &&
      transitionGeneration === this.transitionGeneration
    );
  }

  private cancelPendingTransition(): void {
    if (!this.transitionPending) return;
    this.transitionPending = false;
    this.transitionGeneration += 1;
  }
}

const displayName = (levelId: SessionLevelId): string =>
  levelId === 'level-2' ? 'Level 2' : 'Level 3';

const isPromiseLike = <Value>(
  value: Value | Promise<Value>,
): value is Promise<Value> => (
  typeof value === 'object' && value !== null && 'then' in value
);
