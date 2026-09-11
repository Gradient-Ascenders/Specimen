import { EventBus } from '../core/EventBus.ts';
import type { ControlledForm } from './SpecimenTypes.ts';

const MERGE_TIME_EPSILON_SECONDS = 1e-9;

export interface SpecimenFormReadModel {
  readonly controlledForm: ControlledForm;
  readonly mergeActive: boolean;
  readonly mergeProgress: number;
  readonly mergeDurationSeconds: number;
  readonly splitActive: boolean;
}

interface MutableReadModel {
  controlledForm: ControlledForm;
  mergeActive: boolean;
  mergeProgress: number;
  mergeDurationSeconds: number;
  splitActive: boolean;
}

export interface SpecimenFormEvents {
  mergeStarted: Record<string, never>;
  mergeProgressChanged: {
    readonly progress: number;
  };
  mergeCompleted: Record<string, never>;
  splitStarted: Record<string, never>;
  splitCompleted: Record<string, never>;
  reset: {
    readonly controlledForm: ControlledForm;
  };
}

export interface SpecimenFormControllerOptions {
  readonly mergeDurationSeconds?: number;
}

/**
 * Deterministic form handoff timer.
 *
 * BlackoutPhaseController remains phase authority. This class owns only the
 * group-vs-Specimen body participation and the fixed-step merge duration.
 */
export class SpecimenFormController {
  readonly events = new EventBus<SpecimenFormEvents>();

  private readonly mergeDurationSeconds: number;
  private readonly readModelValue: MutableReadModel;
  private mergeElapsedSeconds = 0;
  private disposed = false;

  constructor(options: SpecimenFormControllerOptions = {}) {
    this.mergeDurationSeconds = options.mergeDurationSeconds ?? 6;
    if (
      !Number.isFinite(this.mergeDurationSeconds) ||
      this.mergeDurationSeconds <= 0
    ) {
      throw new Error('Specimen merge duration must be positive and finite.');
    }
    this.readModelValue = {
      controlledForm: 'group',
      mergeActive: false,
      mergeProgress: 0,
      mergeDurationSeconds: this.mergeDurationSeconds,
      splitActive: false,
    };
  }

  get readModel(): SpecimenFormReadModel {
    return this.readModelValue;
  }

  beginMerge(): boolean {
    this.assertActive('begin Specimen merge');
    if (
      this.readModelValue.controlledForm !== 'group' ||
      this.readModelValue.mergeActive ||
      this.readModelValue.splitActive
    ) {
      return false;
    }
    this.mergeElapsedSeconds = 0;
    this.readModelValue.mergeActive = true;
    this.readModelValue.mergeProgress = 0;
    this.events.emit('mergeStarted', {});
    return true;
  }

  /**
   * Advance one fixed step. Returns true exactly on the step that completes
   * the body handoff.
   */
  updateMerge(deltaSeconds: number): boolean {
    this.assertActive('update Specimen merge');
    if (!this.readModelValue.mergeActive) return false;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Specimen merge deltaSeconds must be positive and finite.');
    }

    const nextElapsed = this.mergeElapsedSeconds + deltaSeconds;
    this.mergeElapsedSeconds =
      nextElapsed + MERGE_TIME_EPSILON_SECONDS >= this.mergeDurationSeconds
        ? this.mergeDurationSeconds
        : nextElapsed;
    const progress =
      this.mergeElapsedSeconds / this.mergeDurationSeconds;
    if (progress !== this.readModelValue.mergeProgress) {
      this.readModelValue.mergeProgress = progress;
      this.events.emit('mergeProgressChanged', { progress });
    }

    if (progress < 1) return false;

    this.readModelValue.mergeActive = false;
    this.readModelValue.controlledForm = 'specimen';
    this.events.emit('mergeCompleted', {});
    return true;
  }

  beginSplit(): boolean {
    this.assertActive('begin Specimen split');
    if (
      this.readModelValue.controlledForm !== 'specimen' ||
      this.readModelValue.mergeActive ||
      this.readModelValue.splitActive
    ) {
      return false;
    }
    this.readModelValue.splitActive = true;
    this.events.emit('splitStarted', {});
    return true;
  }

  completeSplit(): boolean {
    this.assertActive('complete Specimen split');
    if (!this.readModelValue.splitActive) return false;
    this.readModelValue.splitActive = false;
    this.readModelValue.controlledForm = 'group';
    this.events.emit('splitCompleted', {});
    return true;
  }

  restore(controlledForm: ControlledForm): void {
    this.assertActive('restore Specimen form');
    this.mergeElapsedSeconds = 0;
    this.readModelValue.mergeActive = false;
    this.readModelValue.mergeProgress =
      controlledForm === 'specimen' ? 1 : 0;
    this.readModelValue.splitActive = false;
    this.readModelValue.controlledForm = controlledForm;
    this.events.emit('reset', { controlledForm });
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.clear();
    this.disposed = true;
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after Specimen form disposal.`);
    }
  }
}
