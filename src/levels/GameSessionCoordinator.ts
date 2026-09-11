import { EventBus } from '../core/EventBus.ts';
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
  objectiveChanged: { readonly roomId: string | number; readonly objective: string };
  transitionStarted: { readonly levelId: SessionLevelId; readonly message: string };
  transitionCompleted: { readonly levelId: SessionLevelId };
  transitionFailed: { readonly levelId: SessionLevelId; readonly message: string };
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
  start(): void { if (!this.transitionFailed) this.runtime.start(); }
  stop(): void { if (!this.transitionFailed) this.runtime.stop(); }
  restartLevel(): void {
    if (this.transitionFailed) throw new Error('Cannot restart after a failed level transition.');
    this.runtime.restartLevel();
  }
  unload(): void {
    this.cancelPendingTransition();
    this.runtime.unload();
  }
  setDebugInteractionEnabled(enabled: boolean): void {
    this.debugInteractionEnabled = enabled;
    this.runtime.setDebugInteractionEnabled(enabled && !this.transitionPending);
  }

  fixedUpdate(deltaSeconds: number): void {
    if (!this.transitionPending && !this.transitionFailed) this.runtime.fixedUpdate(deltaSeconds);
  }

  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void {
    if (!this.transitionPending && !this.transitionFailed) this.runtime.render(interpolationAlpha, stats);
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
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPendingTransition();
    this.unbindRuntime();
    this.runtime.dispose();
    this.hudListeners.clear();
    this.events.clear();
  }

  private bindRuntime(runtime: GameLevelRuntime): void {
    this.unsubscribeRuntimeEvents = [
      runtime.events.on('objectiveChanged', (event) => this.events.emit('objectiveChanged', event)),
      runtime.events.on('completed', (event) => this.onLevelCompleted(event.nextLevelId)),
    ];
    this.unsubscribeRuntimeHUD = runtime.subscribeSlimeHUD((snapshot) => {
      for (const listener of this.hudListeners) listener(snapshot);
    });
  }

  private unbindRuntime(): void {
    for (const unsubscribe of this.unsubscribeRuntimeEvents) unsubscribe();
    this.unsubscribeRuntimeEvents = [];
    this.unsubscribeRuntimeHUD();
    this.unsubscribeRuntimeHUD = () => {};
  }

  private onLevelCompleted(nextLevelId: string): void {
    if (
      (nextLevelId !== 'level-2' && nextLevelId !== 'level-3') ||
      this.transitionPending || this.transitionFailed || this.disposed
    ) return;

    const target = nextLevelId as SessionLevelId;
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

    const progression = this.runtime.captureProgressionSnapshot();
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
