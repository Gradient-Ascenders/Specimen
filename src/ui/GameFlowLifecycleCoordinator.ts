import type { LevelLifecycleState } from '../levels/LevelLifecycle.ts';

export interface GameFlowLevelRuntime {
  readonly state: LevelLifecycleState;
  start(): void;
  stop(): void;
  restartLevel(): void;
}

/** Maps application-flow intent onto the level's public lifecycle operations. */
export class GameFlowLifecycleCoordinator {
  private readonly runtime: GameFlowLevelRuntime;

  constructor(runtime: GameFlowLevelRuntime) {
    this.runtime = runtime;
  }

  startGameplay(): void {
    if (this.runtime.state === 'stopped') this.runtime.start();
  }

  stopGameplay(): void {
    if (this.runtime.state === 'running') this.runtime.stop();
  }

  restartLevel(): void {
    this.runtime.restartLevel();
  }
}
