export const DEFAULT_DEATH_BURST_DURATION_SECONDS = 0.86;

export type DeathSequenceState = 'playing' | 'bursting' | 'gameOver';

export interface DeathSequenceOptions {
  readonly burstDurationSeconds?: number;
}

export interface DeathSequenceDiagnostics {
  readonly state: DeathSequenceState;
  readonly elapsedSeconds: number;
  readonly acceptedDeathCount: number;
  readonly completedRetryCount: number;
}

/**
 * Authoritative fixed-step state for the player death journey.
 *
 * Presentation and DOM code mirror this state; neither owns transition timing.
 * A caller supplies the actual checkpoint recovery only after `canRetry` is true.
 */
export class DeathSequence {
  private readonly burstDurationSeconds: number;
  private stateValue: DeathSequenceState = 'playing';
  private elapsedSecondsValue = 0;
  private acceptedDeathCountValue = 0;
  private completedRetryCountValue = 0;

  constructor(options: DeathSequenceOptions = {}) {
    this.burstDurationSeconds =
      options.burstDurationSeconds ?? DEFAULT_DEATH_BURST_DURATION_SECONDS;

    if (
      !Number.isFinite(this.burstDurationSeconds) ||
      this.burstDurationSeconds <= 0
    ) {
      throw new Error('Death burst duration must be positive and finite.');
    }
  }

  get state(): DeathSequenceState {
    return this.stateValue;
  }

  get isPlaying(): boolean {
    return this.stateValue === 'playing';
  }

  get canRetry(): boolean {
    return this.stateValue === 'gameOver';
  }

  get diagnostics(): DeathSequenceDiagnostics {
    return {
      state: this.stateValue,
      elapsedSeconds: this.elapsedSecondsValue,
      acceptedDeathCount: this.acceptedDeathCountValue,
      completedRetryCount: this.completedRetryCountValue,
    };
  }

  /** Accept the first fatal request for the current life. */
  requestDeath(): boolean {
    if (!this.isPlaying) return false;

    this.stateValue = 'bursting';
    this.elapsedSecondsValue = 0;
    this.acceptedDeathCountValue += 1;
    return true;
  }

  /** Advance death timing from the same fixed-step delta as gameplay. */
  update(deltaSeconds: number): boolean {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Death sequence deltaSeconds must be positive and finite.');
    }
    if (this.stateValue !== 'bursting') return false;

    this.elapsedSecondsValue = Math.min(
      this.burstDurationSeconds,
      this.elapsedSecondsValue + deltaSeconds,
    );
    if (this.elapsedSecondsValue < this.burstDurationSeconds) return false;

    this.stateValue = 'gameOver';
    return true;
  }

  /** Mark a successful externally-owned recovery as complete. */
  completeRetry(): boolean {
    if (!this.canRetry) return false;

    this.stateValue = 'playing';
    this.elapsedSecondsValue = 0;
    this.completedRetryCountValue += 1;
    return true;
  }

  /** Clear an in-flight sequence during teardown or an explicit harness reset. */
  reset(): void {
    this.stateValue = 'playing';
    this.elapsedSecondsValue = 0;
  }
}
