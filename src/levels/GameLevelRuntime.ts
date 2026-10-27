import type { EventBus } from '../core/EventBus.ts';
import type { LoopStats } from '../core/Loop.ts';
import type { PerformanceGameplaySnapshot } from '../core/PerformanceSnapshot.ts';
import type { SlimeHUDListener, SlimeHUDSnapshot } from '../slimes/SlimeHUDState.ts';
import type { LevelLifecycleState } from './LevelLifecycle.ts';
import type { LevelProgressionSnapshot } from './LevelProgression.ts';
import type { SlimeHealthReadModel } from '../systems/SlimeDamageSystem.ts';

export interface CheckpointReachedEvent {
  readonly checkpointId: string;
  readonly roomId: string | number;
  readonly label: string;
}

export interface GameLevelRuntimeEvents {
  checkpointReached: CheckpointReachedEvent;
  objectiveChanged: { readonly roomId: string | number; readonly objective: string };
  completed: { readonly levelId: string; readonly nextLevelId: string };
}

/** Concrete-level facade consumed by the application session coordinator. */
export interface GameLevelRuntime {
  readonly events: EventBus<GameLevelRuntimeEvents>;
  readonly state: LevelLifecycleState;
  load(): void;
  /** Optional GPU preparation while the transition UI keeps gameplay stopped. */
  preparePresentation?(): Promise<void>;
  /** Re-establish first-use coverage after a shader-affecting settings change. */
  prepareGraphics?(): Promise<void>;
  /** Prime current camera storage without rebuilding shader preparation. */
  prepareRenderResources?(interpolationAlpha: number, stats: Readonly<LoopStats>): Promise<void>;
  start(): void;
  stop(): void;
  restartLevel(): void;
  unload(): void;
  dispose(): void;
  fixedUpdate(deltaSeconds: number): void;
  render(interpolationAlpha: number, stats: Readonly<LoopStats>): void;
  /** Optional presentation-only strength for the controlled Goop's acid boost. */
  getSpeedEffectStrength?(): number;
  setDebugInteractionEnabled(enabled: boolean): void;
  prepareCleanGameplay?(): void;
  subscribeSlimeHUD(listener: SlimeHUDListener): () => void;
  getSlimeHUDSnapshot(): SlimeHUDSnapshot;
  getPlayerHealth?(): SlimeHealthReadModel | undefined;
  captureProgressionSnapshot(): LevelProgressionSnapshot;
  writePerformanceSnapshot(target: PerformanceGameplaySnapshot): void;
}
