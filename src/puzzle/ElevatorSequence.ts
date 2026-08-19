import * as THREE from 'three';

import type {
  ReadonlyVector3State,
} from '../physics/KinematicBody';
import { MovingPlatform } from './MovingPlatform';

const TIME_EPSILON_SECONDS = 1e-9;

export type ElevatorSequenceState =
  | 'waitingForRider'
  | 'warning'
  | 'ascending'
  | 'arrivalPause'
  | 'exitReady';

export interface ElevatorCarrierTarget {
  readonly grounded: boolean;
  readonly supportCollider: THREE.Mesh | null;
  isSupportedBy(collider: THREE.Mesh): boolean;
  applyCarrierDisplacement(
    displacement: ReadonlyVector3State,
    carrierCollider: THREE.Mesh,
  ): void;
}

export interface ElevatorSequenceOptions {
  readonly id: string;
  readonly platform: MovingPlatform;
  readonly checkpointGroupId: string;
  readonly startDelaySeconds?: number;
  readonly arrivalDelaySeconds?: number;
  /** If true, stable support on the roof begins the sequence automatically. */
  readonly autoStartOnRider?: boolean;
}

/**
 * Fixed-step Room 4 cargo-elevator state machine.
 *
 * It owns only authored sequence state and carrier handoff. MovingPlatform owns
 * route interpolation. KinematicBody owns player movement and collision.
 */
export class ElevatorSequence {
  readonly id: string;
  readonly root: THREE.Group;

  private readonly platformValue: MovingPlatform;
  private readonly checkpointGroupIdValue: string;
  private readonly startDelaySecondsValue: number;
  private readonly arrivalDelaySecondsValue: number;
  private readonly autoStartOnRider: boolean;

  private stateValue: ElevatorSequenceState = 'waitingForRider';
  private stateElapsedSecondsValue = 0;
  private sequenceElapsedSecondsValue = 0;

  constructor(options: ElevatorSequenceOptions) {
    if (!options.id) throw new Error('Elevator IDs cannot be empty.');
    if (!options.checkpointGroupId) {
      throw new Error(
        'Elevators must reference a checkpoint puzzle group.',
      );
    }

    this.id = options.id;
    this.platformValue = options.platform;
    this.root = this.platformValue.root;
    this.checkpointGroupIdValue = options.checkpointGroupId;
    this.startDelaySecondsValue = options.startDelaySeconds ?? 0.85;
    this.arrivalDelaySecondsValue =
      options.arrivalDelaySeconds ?? 0.65;
    this.autoStartOnRider = options.autoStartOnRider ?? true;

    this.validateDelay(
      'startDelaySeconds',
      this.startDelaySecondsValue,
    );
    this.validateDelay(
      'arrivalDelaySeconds',
      this.arrivalDelaySecondsValue,
    );

    this.root.userData.elevatorSequenceId = this.id;
    this.root.userData.runtimeProxy = true;
  }

  get state(): ElevatorSequenceState {
    return this.stateValue;
  }

  get platform(): MovingPlatform {
    return this.platformValue;
  }

  get checkpointGroupId(): string {
    return this.checkpointGroupIdValue;
  }

  get startDelaySeconds(): number {
    return this.startDelaySecondsValue;
  }

  get arrivalDelaySeconds(): number {
    return this.arrivalDelaySecondsValue;
  }

  get travelDurationSeconds(): number {
    return this.platformValue.travelDurationSeconds;
  }

  get routeStart(): Readonly<THREE.Vector3> {
    return this.platformValue.startPosition;
  }

  get routeEnd(): Readonly<THREE.Vector3> {
    return this.platformValue.endPosition;
  }

  get displacement(): Readonly<THREE.Vector3> {
    return this.platformValue.displacement;
  }

  get ascentProgress(): number {
    return this.platformValue.progress;
  }

  get stateElapsedSeconds(): number {
    return this.stateElapsedSecondsValue;
  }

  get sequenceElapsedSeconds(): number {
    return this.sequenceElapsedSecondsValue;
  }

  get exitReady(): boolean {
    return this.stateValue === 'exitReady';
  }

  /**
   * Idempotently begin the warning phase.
   *
   * Level integration may call this when the elevator-roof checkpoint becomes
   * active. The development harness additionally uses auto-start-on-rider.
   */
  begin(): void {
    if (this.stateValue !== 'waitingForRider') return;
    this.setState('warning');
  }

  update(
    deltaSeconds: number,
    carrier?: ElevatorCarrierTarget,
  ): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'Elevator deltaSeconds must be positive and finite.',
      );
    }

    // Clear the platform displacement every fixed step even while stationary.
    this.platformValue.update(0);

    const riderSupported =
      carrier?.isSupportedBy(
        this.platformValue.collisionMesh,
      ) ?? false;

    if (
      this.stateValue === 'waitingForRider' &&
      this.autoStartOnRider &&
      riderSupported
    ) {
      this.begin();
    }

    if (this.stateValue === 'waitingForRider') return;

    this.sequenceElapsedSecondsValue += deltaSeconds;
    let remainingSeconds = deltaSeconds;

    while (remainingSeconds > TIME_EPSILON_SECONDS) {
      if (this.stateValue === 'warning') {
        const remainingWarning = Math.max(
          0,
          this.startDelaySecondsValue -
            this.stateElapsedSecondsValue,
        );
        const consumed = Math.min(
          remainingSeconds,
          remainingWarning,
        );

        this.stateElapsedSecondsValue += consumed;
        remainingSeconds -= consumed;

        if (
          this.stateElapsedSecondsValue +
            TIME_EPSILON_SECONDS <
          this.startDelaySecondsValue
        ) {
          break;
        }

        this.platformValue.setActive(true);
        this.setState('ascending');
        continue;
      }

      if (this.stateValue === 'ascending') {
        const timeToEnd =
          (1 - this.platformValue.progress) *
          this.platformValue.travelDurationSeconds;
        const consumed = Math.min(
          remainingSeconds,
          Math.max(0, timeToEnd),
        );

        if (consumed > TIME_EPSILON_SECONDS) {
          this.platformValue.update(consumed);

          if (
            riderSupported &&
            carrier &&
            this.platformValue.displacement.lengthSq() > 0
          ) {
            carrier.applyCarrierDisplacement(
              this.platformValue.displacement,
              this.platformValue.collisionMesh,
            );
          }
        }

        this.stateElapsedSecondsValue += consumed;
        remainingSeconds -= consumed;

        if (!this.platformValue.isAtEnd) break;

        this.setState('arrivalPause');
        continue;
      }

      if (this.stateValue === 'arrivalPause') {
        const remainingArrival = Math.max(
          0,
          this.arrivalDelaySecondsValue -
            this.stateElapsedSecondsValue,
        );
        const consumed = Math.min(
          remainingSeconds,
          remainingArrival,
        );

        this.stateElapsedSecondsValue += consumed;
        remainingSeconds -= consumed;

        if (
          this.stateElapsedSecondsValue +
            TIME_EPSILON_SECONDS <
          this.arrivalDelaySecondsValue
        ) {
          break;
        }

        this.setState('exitReady');
        continue;
      }

      // exitReady has no further authored motion.
      break;
    }
  }

  /** Restore authored start pose and all sequence timers/state. */
  reset(): void {
    this.platformValue.reset();
    this.stateValue = 'waitingForRider';
    this.stateElapsedSecondsValue = 0;
    this.sequenceElapsedSecondsValue = 0;
  }

  private setState(state: ElevatorSequenceState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.stateElapsedSecondsValue = 0;
  }

  private validateDelay(name: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `${name} must be a non-negative finite number.`,
      );
    }
  }
}
