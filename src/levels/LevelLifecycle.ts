export type LevelLifecycleState =
  | 'unloaded'
  | 'stopped'
  | 'running'
  | 'restarting'
  | 'disposed';

export interface LevelLifecycleHooks {
  load(): void;
  start(): void;
  stop(): void;
  restart(): void;
  unload(): void;
}

/**
 * State and duplicate-operation guard for the one current level runtime.
 * Resource construction and teardown remain in the concrete level owner.
 */
export class LevelLifecycle {
  private readonly hooks: LevelLifecycleHooks;
  private stateValue: LevelLifecycleState = 'unloaded';
  private restartCountValue = 0;

  constructor(hooks: LevelLifecycleHooks) {
    this.hooks = hooks;
  }

  get state(): LevelLifecycleState {
    return this.stateValue;
  }

  get restartCount(): number {
    return this.restartCountValue;
  }

  load(): void {
    this.assertNotDisposed('load');
    if (this.stateValue !== 'unloaded') return;

    this.hooks.load();
    this.stateValue = 'stopped';
  }

  start(): void {
    this.assertNotDisposed('start');
    if (this.stateValue === 'running') return;
    if (this.stateValue !== 'stopped') {
      throw new Error(`Cannot start a level while ${this.stateValue}.`);
    }

    this.hooks.start();
    this.stateValue = 'running';
  }

  stop(): void {
    this.assertNotDisposed('stop');
    if (this.stateValue === 'stopped' || this.stateValue === 'unloaded') return;
    if (this.stateValue !== 'running') {
      throw new Error(`Cannot stop a level while ${this.stateValue}.`);
    }

    this.hooks.stop();
    this.stateValue = 'stopped';
  }

  restartLevel(): void {
    this.assertNotDisposed('restart');
    if (this.stateValue === 'restarting') return;
    if (this.stateValue !== 'running' && this.stateValue !== 'stopped') {
      throw new Error(`Cannot restart a level while ${this.stateValue}.`);
    }

    const resumeAfterRestart = this.stateValue === 'running';
    this.stateValue = 'restarting';

    try {
      if (resumeAfterRestart) this.hooks.stop();
      this.hooks.restart();
      this.restartCountValue += 1;
      if (resumeAfterRestart) this.hooks.start();
      this.stateValue = resumeAfterRestart ? 'running' : 'stopped';
    } catch (error) {
      this.stateValue = 'stopped';
      throw error;
    }
  }

  unload(): void {
    this.assertNotDisposed('unload');
    if (this.stateValue === 'unloaded') return;
    if (this.stateValue === 'restarting') {
      throw new Error('Cannot unload a level while restarting.');
    }
    if (this.stateValue === 'running') this.stop();

    this.hooks.unload();
    this.stateValue = 'unloaded';
  }

  dispose(): void {
    if (this.stateValue === 'disposed') return;
    if (this.stateValue !== 'unloaded') this.unload();
    this.stateValue = 'disposed';
  }

  private assertNotDisposed(operation: string): void {
    if (this.stateValue === 'disposed') {
      throw new Error(`Cannot ${operation} a disposed level lifecycle.`);
    }
  }
}
