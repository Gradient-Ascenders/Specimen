import { EventBus } from '../../core/EventBus.ts';
import type {
  SentinelAttack,
  SentinelAttackCancelReason,
  SentinelAttackContext,
  SentinelAttackEvents,
  SentinelAttackReadModel,
  SentinelAttackStage,
} from '../SentinelBossTypes.ts';

const EPSILON_SECONDS = 1e-9;

interface MutableAttackReadModel {
  readonly id: string;
  stage: SentinelAttackStage;
  stageProgress: number;
  elapsedSeconds: number;
}

export interface TimedSentinelAttackDurations {
  readonly telegraphSeconds: number;
  readonly activeSeconds: number;
  readonly recoverySeconds: number;
}

/**
 * Deterministic telegraph -> active -> recovery attack lifecycle.
 *
 * Large fixed-step deltas are consumed across stage boundaries rather than
 * silently skipping hooks or leaving damaging resources active.
 */
export abstract class TimedSentinelAttack implements SentinelAttack {
  readonly events = new EventBus<SentinelAttackEvents>();
  readonly readModel: SentinelAttackReadModel;
  readonly id: string;

  protected readonly model: MutableAttackReadModel;
  protected context: SentinelAttackContext | undefined;

  private readonly durations: TimedSentinelAttackDurations;
  private stageElapsedSeconds = 0;
  private disposed = false;

  protected constructor(
    id: string,
    durations: TimedSentinelAttackDurations,
  ) {
    if (!id.trim()) throw new Error('Sentinel attack IDs must be non-empty.');
    for (const [label, value] of Object.entries(durations)) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Sentinel attack ${label} must be positive and finite.`);
      }
    }
    this.id = id;
    this.durations = { ...durations };
    this.model = {
      id,
      stage: 'idle',
      stageProgress: 0,
      elapsedSeconds: 0,
    };
    this.readModel = this.model;
  }

  get isComplete(): boolean {
    return this.model.stage === 'complete';
  }

  start(context: SentinelAttackContext): void {
    this.assertActive('start');
    if (this.model.stage !== 'idle' && this.model.stage !== 'complete') {
      return;
    }
    this.context = context;
    this.model.elapsedSeconds = 0;
    this.model.stageProgress = 0;
    this.stageElapsedSeconds = 0;
    this.transition('telegraph');
    this.onTelegraphStart(context);
  }

  update(deltaSeconds: number, context: SentinelAttackContext): void {
    this.assertActive('update');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Sentinel attack deltaSeconds must be positive and finite.');
    }
    if (
      this.model.stage === 'idle' ||
      this.model.stage === 'complete'
    ) {
      return;
    }
    this.context = context;

    let remainingSeconds = deltaSeconds;
    while (remainingSeconds > EPSILON_SECONDS) {
      const stageAtStart =
        this.model.stage as SentinelAttackStage;
      if (stageAtStart === 'idle' || stageAtStart === 'complete') {
        break;
      }
      const duration = this.durationFor(stageAtStart);
      const available = Math.max(0, duration - this.stageElapsedSeconds);
      const consumed = Math.min(remainingSeconds, available);
      this.stageElapsedSeconds += consumed;
      this.model.elapsedSeconds += consumed;
      remainingSeconds -= consumed;
      this.model.stageProgress = Math.min(
        1,
        this.stageElapsedSeconds / duration,
      );

      if (stageAtStart === 'telegraph') {
        this.onTelegraphUpdate(consumed, context);
      } else if (stageAtStart === 'active') {
        this.onActiveUpdate(consumed, context);
      } else if (stageAtStart === 'recovery') {
        this.onRecoveryUpdate(consumed, context);
      }

      // Failure/recovery callbacks may synchronously cancel this attack.
      // Never continue consuming the same fixed step after external ownership
      // changed the stage.
      if (this.model.stage !== stageAtStart) return;

      if (
        this.stageElapsedSeconds + EPSILON_SECONDS < duration &&
        !(stageAtStart === 'active' && this.activeCompletedEarly())
      ) {
        continue;
      }

      this.advanceStage(context);
    }
  }

  cancel(reason: SentinelAttackCancelReason): void {
    if (this.disposed) return;
    if (this.model.stage === 'idle') return;
    this.onCancel(reason);
    this.context = undefined;
    this.stageElapsedSeconds = 0;
    this.model.elapsedSeconds = 0;
    this.model.stageProgress = 0;
    this.transition('idle');
  }

  reset(): void {
    if (this.disposed) return;
    this.onReset();
    this.context = undefined;
    this.stageElapsedSeconds = 0;
    this.model.elapsedSeconds = 0;
    this.model.stageProgress = 0;
    this.transition('idle');
  }

  dispose(): void {
    if (this.disposed) return;
    this.onCancel('dispose');
    this.onDispose();
    this.context = undefined;
    this.events.clear();
    this.disposed = true;
  }

  protected activeCompletedEarly(): boolean {
    return false;
  }

  protected onTelegraphStart(_context: SentinelAttackContext): void {}
  protected onTelegraphUpdate(
    _deltaSeconds: number,
    _context: SentinelAttackContext,
  ): void {}
  protected onActiveStart(_context: SentinelAttackContext): void {}
  protected abstract onActiveUpdate(
    deltaSeconds: number,
    context: SentinelAttackContext,
  ): void;
  protected onRecoveryStart(_context: SentinelAttackContext): void {}
  protected onRecoveryUpdate(
    _deltaSeconds: number,
    _context: SentinelAttackContext,
  ): void {}
  protected onComplete(_context: SentinelAttackContext): void {}
  protected onCancel(_reason: SentinelAttackCancelReason): void {}
  protected onReset(): void {}
  protected onDispose(): void {}

  private durationFor(stage: SentinelAttackStage): number {
    if (stage === 'telegraph') return this.durations.telegraphSeconds;
    if (stage === 'active') return this.durations.activeSeconds;
    if (stage === 'recovery') return this.durations.recoverySeconds;
    return EPSILON_SECONDS;
  }

  private advanceStage(context: SentinelAttackContext): void {
    this.stageElapsedSeconds = 0;
    this.model.stageProgress = 0;
    if (this.model.stage === 'telegraph') {
      this.transition('active');
      this.onActiveStart(context);
      return;
    }
    if (this.model.stage === 'active') {
      this.transition('recovery');
      this.onRecoveryStart(context);
      return;
    }
    if (this.model.stage === 'recovery') {
      this.transition('complete');
      this.model.stageProgress = 1;
      this.onComplete(context);
    }
  }

  private transition(stage: SentinelAttackStage): void {
    if (this.model.stage === stage) return;
    const previousStage = this.model.stage;
    this.model.stage = stage;
    this.events.emit('stageChanged', {
      attackId: this.id,
      previousStage,
      stage,
    });
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(
        `Cannot ${operation} Sentinel attack "${this.id}" after disposal.`,
      );
    }
  }
}
