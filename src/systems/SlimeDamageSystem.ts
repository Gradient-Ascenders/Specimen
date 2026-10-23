import { EventBus } from '../core/EventBus.ts';

export interface SlimeDamageConfig {
  readonly maximumHealth: number;
  readonly regenerationDelaySeconds: number;
  readonly regenerationPerSecond: number;
}

export const DEFAULT_SLIME_DAMAGE_CONFIG: Readonly<SlimeDamageConfig> = {
  maximumHealth: 100,
  regenerationDelaySeconds: 2.75,
  regenerationPerSecond: 20,
};

export interface SlimeHealthReadModel {
  readonly slimeId: 'bob' | 'goop' | 'volt';
  readonly health: number;
  readonly maximumHealth: number;
  readonly normalizedHealth: number;
  readonly regenerationDelayRemainingSeconds: number;
  readonly regenerating: boolean;
  readonly dead: boolean;
}

interface MutableSlimeHealthReadModel {
  readonly slimeId: 'bob' | 'goop' | 'volt';
  health: number;
  readonly maximumHealth: number;
  normalizedHealth: number;
  regenerationDelayRemainingSeconds: number;
  regenerating: boolean;
  dead: boolean;
}

export interface SlimeDamageEvents {
  damaged: {
    readonly slimeId: 'bob' | 'goop' | 'volt';
    readonly damage: number;
    readonly normalizedHealth: number;
    readonly direction: { readonly x: number; readonly y: number; readonly z: number } | undefined;
  };
  regenerationStarted: { readonly slimeId: 'bob' | 'goop' | 'volt' };
  regenerationCompleted: { readonly slimeId: 'bob' | 'goop' | 'volt' };
  died: { readonly slimeId: 'bob' | 'goop' | 'volt' };
  reset: Record<string, never>;
}

/** Fixed-step independent health and delayed regeneration for Bob and Goop. */
export class SlimeDamageSystem {
  readonly events = new EventBus<SlimeDamageEvents>();
  readonly health: readonly SlimeHealthReadModel[];

  private readonly config: SlimeDamageConfig;
  private readonly states: readonly MutableSlimeHealthReadModel[];
  private readonly statesById = new Map<'bob' | 'goop' | 'volt', MutableSlimeHealthReadModel>();
  private disposed = false;

  constructor(config: Partial<SlimeDamageConfig> = {}, slimeIds: readonly ('bob' | 'goop' | 'volt')[] = ['bob', 'goop']) {
    this.config = { ...DEFAULT_SLIME_DAMAGE_CONFIG, ...config };
    for (const [label, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be positive and finite.`);
      }
    }
    this.states = slimeIds.map((slimeId) => ({
      slimeId,
      health: this.config.maximumHealth,
      maximumHealth: this.config.maximumHealth,
      normalizedHealth: 1,
      regenerationDelayRemainingSeconds: 0,
      regenerating: false,
      dead: false,
    }));
    for (const state of this.states) this.statesById.set(state.slimeId, state);
    this.health = this.states;
  }

  update(deltaSeconds: number): void {
    this.assertActive('update damage');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Damage deltaSeconds must be positive and finite.');
    }
    for (const state of this.states) {
      if (state.dead || state.health >= state.maximumHealth) continue;
      let regenerationSeconds = deltaSeconds;
      if (state.regenerationDelayRemainingSeconds > 0) {
        const delayConsumed = Math.min(
          state.regenerationDelayRemainingSeconds,
          regenerationSeconds,
        );
        state.regenerationDelayRemainingSeconds = Math.max(
          0,
          state.regenerationDelayRemainingSeconds - delayConsumed,
        );
        regenerationSeconds -= delayConsumed;
        if (state.regenerationDelayRemainingSeconds > 0) continue;
      }
      if (regenerationSeconds <= 0) continue;
      if (!state.regenerating) {
        state.regenerating = true;
        this.events.emit('regenerationStarted', { slimeId: state.slimeId });
      }
      state.health = Math.min(
        state.maximumHealth,
        state.health + this.config.regenerationPerSecond * regenerationSeconds,
      );
      this.sync(state);
      if (state.health >= state.maximumHealth) {
        state.regenerating = false;
        this.events.emit('regenerationCompleted', { slimeId: state.slimeId });
      }
    }
  }

  applyDamage(
    slimeId: 'bob' | 'goop' | 'volt',
    damage: number,
    direction?: { readonly x: number; readonly y: number; readonly z: number },
  ): boolean {
    this.assertActive('apply damage');
    if (!Number.isFinite(damage) || damage <= 0) {
      throw new Error('Damage must be positive and finite.');
    }
    const state = this.requireState(slimeId);
    if (state.dead) return false;
    state.health = Math.max(0, state.health - damage);
    state.regenerationDelayRemainingSeconds = this.config.regenerationDelaySeconds;
    state.regenerating = false;
    this.sync(state);
    this.events.emit('damaged', {
      slimeId,
      damage,
      normalizedHealth: state.normalizedHealth,
      direction: direction
        ? { x: direction.x, y: direction.y, z: direction.z }
        : undefined,
    });
    if (state.health > 0) return true;
    state.dead = true;
    this.events.emit('died', { slimeId });
    return true;
  }

  reset(): void {
    if (this.disposed) return;
    for (const state of this.states) {
      state.health = state.maximumHealth;
      state.normalizedHealth = 1;
      state.regenerationDelayRemainingSeconds = 0;
      state.regenerating = false;
      state.dead = false;
    }
    this.events.emit('reset', {});
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.clear();
    this.disposed = true;
  }

  private requireState(slimeId: 'bob' | 'goop' | 'volt'): MutableSlimeHealthReadModel {
    const state = this.statesById.get(slimeId);
    if (!state) throw new Error(`No health registered for ${slimeId}`);
    return state;
  }

  private sync(state: MutableSlimeHealthReadModel): void {
    state.normalizedHealth = Math.max(0, Math.min(1, state.health / state.maximumHealth));
  }

  private assertActive(operation: string): void {
    if (this.disposed) throw new Error(`Cannot ${operation} after damage disposal.`);
  }
}
