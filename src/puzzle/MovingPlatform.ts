import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';

const PROGRESS_EPSILON = 1e-10;

export type MovingPlatformState =
  | 'atStart'
  | 'movingToEnd'
  | 'atEnd'
  | 'movingToStart';

export interface MovingPlatformEvents {
  stateChanged: {
    readonly platform: MovingPlatform;
    readonly state: MovingPlatformState;
  };
}

export interface ReadonlyMovingPlatformVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MovingPlatformOptions {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly size?: THREE.Vector3;
  readonly travelDurationSeconds?: number;
  /** Authored starting point along the route in [0, 1]. */
  readonly initialProgress?: number;
  /** Direction the platform travels after construction and reset. */
  readonly initialTarget?: 'start' | 'end';
}

/**
 * An authored linear platform route.
 *
 * The platform owns deterministic fixed-step pose/displacement only. Rider
 * transport remains a KinematicBody responsibility so the platform never
 * parents the player or injects launch velocity.
 */
export class MovingPlatform {
  readonly root = new THREE.Group();
  readonly events = new EventBus<MovingPlatformEvents>();
  readonly displacement = new THREE.Vector3();
  readonly collisionMesh: THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshStandardMaterial
  >;

  private readonly startValue: THREE.Vector3;
  private readonly endValue: THREE.Vector3;
  private readonly sizeValue: THREE.Vector3;
  private readonly travelDurationSecondsValue: number;
  private readonly initialProgressValue: number;
  private readonly initialTargetEnd: boolean;
  private readonly previousPositionValue = new THREE.Vector3();
  private progressValue = 0;
  private targetEnd = false;
  private state: MovingPlatformState = 'atStart';

  constructor(options: MovingPlatformOptions) {
    this.root.name = `${options.id}-moving-platform`;
    this.startValue = options.start.clone();
    this.endValue = options.end.clone();
    this.travelDurationSecondsValue =
      options.travelDurationSeconds ?? 2.5;
    this.initialProgressValue = options.initialProgress ?? 0;
    this.initialTargetEnd = options.initialTarget === 'end';

    if (
      !Number.isFinite(this.travelDurationSecondsValue) ||
      this.travelDurationSecondsValue <= 0
    ) {
      throw new Error('Platform travel duration must be positive.');
    }
    if (
      !Number.isFinite(this.initialProgressValue) ||
      this.initialProgressValue < 0 ||
      this.initialProgressValue > 1
    ) {
      throw new Error('Platform initial progress must be between 0 and 1.');
    }

    this.sizeValue =
      options.size?.clone() ?? new THREE.Vector3(2.5, 0.3, 2.5);

    if (
      !Number.isFinite(this.sizeValue.x) ||
      !Number.isFinite(this.sizeValue.y) ||
      !Number.isFinite(this.sizeValue.z) ||
      this.sizeValue.x <= 0 ||
      this.sizeValue.y <= 0 ||
      this.sizeValue.z <= 0
    ) {
      throw new Error('Platform size must contain positive finite values.');
    }

    this.collisionMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        this.sizeValue.x,
        this.sizeValue.y,
        this.sizeValue.z,
      ),
      new THREE.MeshStandardMaterial({
        color: 0x62bf83,
        emissive: 0x0a3018,
        emissiveIntensity: 0.2,
        roughness: 0.55,
      }),
    );
    this.collisionMesh.name = `${options.id}-moving-platform-surface`;
    this.collisionMesh.userData.surfaceTag = 'default';
    this.collisionMesh.userData.movingPlatformId = options.id;
    this.root.add(this.collisionMesh);
    this.progressValue = this.initialProgressValue;
    this.targetEnd = this.initialTargetEnd;
    this.root.position.lerpVectors(
      this.startValue,
      this.endValue,
      this.progressValue,
    );
    this.previousPositionValue.copy(this.root.position);
    this.state = this.resolveState();
  }

  get platformState(): MovingPlatformState {
    return this.state;
  }

  /** Current route pose for read-only render interpolation consumers. */
  get position(): ReadonlyMovingPlatformVector3 {
    return this.root.position;
  }

  /** Fixed-step start pose paired with `position`. */
  get previousPosition(): ReadonlyMovingPlatformVector3 {
    return this.previousPositionValue;
  }

  get isAtEnd(): boolean {
    return this.progressValue >= 1 - PROGRESS_EPSILON;
  }

  get isAtStart(): boolean {
    return this.progressValue <= PROGRESS_EPSILON;
  }

  get progress(): number {
    return this.progressValue;
  }

  get startPosition(): Readonly<THREE.Vector3> {
    return this.startValue;
  }

  get endPosition(): Readonly<THREE.Vector3> {
    return this.endValue;
  }

  get size(): Readonly<THREE.Vector3> {
    return this.sizeValue;
  }

  get travelDurationSeconds(): number {
    return this.travelDurationSecondsValue;
  }

  setActive(active: boolean): void {
    if (this.targetEnd === active) return;
    this.targetEnd = active;
    this.setState(active ? 'movingToEnd' : 'movingToStart');
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        'Platform deltaSeconds must be non-negative and finite.',
      );
    }

    this.displacement.set(0, 0, 0);
    this.previousPositionValue.copy(this.root.position);

    // Normalize tiny floating-point remainders even on the zero-delta
    // bookkeeping call used by ElevatorSequence. Without this, a route can
    // visually reach 100% while remaining microscopically below 1 and never
    // transition from `ascending`.
    this.snapProgressToBoundary();

    if (deltaSeconds > 0) {
      const progressStep =
        deltaSeconds / this.travelDurationSecondsValue;

      this.progressValue = this.targetEnd
        ? Math.min(1, this.progressValue + progressStep)
        : Math.max(0, this.progressValue - progressStep);

      this.snapProgressToBoundary();
    }

    this.root.position.lerpVectors(
      this.startValue,
      this.endValue,
      this.progressValue,
    );
    this.displacement.subVectors(
      this.root.position,
      this.previousPositionValue,
    );
  }

  reset(): void {
    this.targetEnd = this.initialTargetEnd;
    this.progressValue = this.initialProgressValue;
    this.root.position.lerpVectors(
      this.startValue,
      this.endValue,
      this.progressValue,
    );
    this.previousPositionValue.copy(this.root.position);
    this.displacement.set(0, 0, 0);
    this.setState(this.resolveState());
  }

  dispose(): void {
    this.events.clear();
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      object.material.dispose();
    });
    this.root.clear();
  }

  private snapProgressToBoundary(): void {
    if (this.progressValue >= 1 - PROGRESS_EPSILON) {
      this.progressValue = 1;
      if (this.targetEnd) this.setState('atEnd');
      return;
    }

    if (this.progressValue <= PROGRESS_EPSILON) {
      this.progressValue = 0;
      if (!this.targetEnd) this.setState('atStart');
    }
  }

  private setState(state: MovingPlatformState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.emit('stateChanged', { platform: this, state });
  }

  private resolveState(): MovingPlatformState {
    if (this.progressValue <= PROGRESS_EPSILON && !this.targetEnd) {
      return 'atStart';
    }
    if (this.progressValue >= 1 - PROGRESS_EPSILON && this.targetEnd) {
      return 'atEnd';
    }
    return this.targetEnd ? 'movingToEnd' : 'movingToStart';
  }
}
