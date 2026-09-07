import type { EventBus } from '../core/EventBus.ts';
import type { LoopStats } from '../core/Loop.ts';
import type { PerformanceGameplaySnapshot } from '../core/PerformanceSnapshot.ts';
import type { SlimeHUDListener, SlimeHUDSnapshot } from '../slimes/SlimeHUDState.ts';
import type { LevelLifecycleState } from './LevelLifecycle.ts';
import type { LevelProgressionSnapshot } from './LevelProgression.ts';

export interface GameLevelRuntimeEvents {
  objectiveChanged: { readonly roomId: string | number; readonly objective: string };
  completed: { readonly levelId: string; readonly nextLevelId: string };
}

/** Concrete-level facade consumed by the application session coordinator. */
export interface GameLevelRuntime {
  readonly events: EventBus<GameLevelRuntimeEvents>;
  readonly state: LevelLifecycleState;
  load(): void;
  start(): void;
  stop(): void;
  restartLevel(): void;
  unload(): void;
  dispose(): void;
  fixedUpdate(deltaSeconds: number): void;
  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void;
  setDebugInteractionEnabled(enabled: boolean): void;
  subscribeSlimeHUD(listener: SlimeHUDListener): () => void;
  getSlimeHUDSnapshot(): SlimeHUDSnapshot;
  captureProgressionSnapshot(): LevelProgressionSnapshot;
  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void;
}
