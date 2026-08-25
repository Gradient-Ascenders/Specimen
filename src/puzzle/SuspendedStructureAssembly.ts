import * as THREE from 'three';

import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import { EventBus } from '../core/EventBus.ts';
import {
  ColliderTransformMode,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry, SurfaceTag } from '../physics/SurfaceRegistry.ts';

const PROGRESS_EPSILON = 1e-10;
const subscribedSupportTargets = new WeakMap<DissolveTarget, string>();

export type DropToAcidAssemblyState =
  | 'suspended'
  | 'dissolving'
  | 'released'
  | 'falling'
  | 'landed';

export type RopeCatchAssemblyState =
  | 'suspended'
  | 'braceDissolving'
  | 'released'
  | 'dropping'
  | 'ropeTaut'
  | 'settling'
  | 'stable';

export type SuspendedStructureAssemblyState =
  | DropToAcidAssemblyState
  | RopeCatchAssemblyState;

export interface SuspendedStructureAssemblyEvents {
  stateChanged: {
    readonly assembly: SuspendedStructureAssembly;
    readonly previousState: SuspendedStructureAssemblyState;
    readonly state: SuspendedStructureAssemblyState;
  };
  released: { readonly assembly: SuspendedStructureAssembly };
  landed: { readonly assembly: DropToAcidAssembly };
  ropeTaut: { readonly assembly: RopeCatchAssembly };
  settled: { readonly assembly: RopeCatchAssembly };
  reset: { readonly assembly: SuspendedStructureAssembly };
}

export interface SuspendedStructureAssemblyDiagnostics {
  readonly id: string;
  readonly supportTargetId: string;
  readonly state: SuspendedStructureAssemblyState;
  readonly supportProgress: number;
  readonly travelProgress: number;
  readonly position: readonly [number, number, number];
  readonly collisionEnabled: boolean;
  readonly transitionCount: number;
}

interface SuspendedStructureAssemblyOptions {
  readonly id: string;
  readonly supportTargetId: string;
  readonly supportRole: 'soluble-rope' | 'soluble-brace';
  readonly supportTarget: DissolveTarget;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly initialPosition: THREE.Vector3;
  readonly finalPosition: THREE.Vector3;
  readonly size: THREE.Vector3;
  readonly initialRotation?: THREE.Euler;
  readonly finalRotation?: THREE.Euler;
  readonly releaseDelaySeconds?: number;
  readonly travelDurationSeconds: number;
  readonly collisionWhileSuspended?: boolean;
  readonly collisionDuringTravel?: boolean;
  readonly collisionAtRest?: boolean;
  readonly finalSurfaceTag?: SurfaceTag;
  readonly colour?: number;
}

export interface DropToAcidAssemblyOptions
  extends SuspendedStructureAssemblyOptions {}

export interface RopeCatchAssemblyOptions
  extends SuspendedStructureAssemblyOptions {
  readonly settlingDurationSeconds?: number;
  readonly settlingSwingRadians?: number;
}

/**
 * Shared deterministic pose/collision owner for one dissolved-support assembly.
 * The support target owns dissolve progress; subclasses only react to completion.
 */
export abstract class SuspendedStructureAssembly {
  readonly root = new THREE.Group();
  readonly events = new EventBus<SuspendedStructureAssemblyEvents>();
  readonly displacement = new THREE.Vector3();
  readonly collisionMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  readonly id: string;
  readonly supportTargetId: string;

  protected readonly supportTarget: DissolveTarget;
  protected readonly releaseDelaySeconds: number;
  protected readonly travelDurationSeconds: number;
  protected elapsedSeconds = 0;
  protected travelProgressValue = 0;
  protected stateValue: SuspendedStructureAssemblyState = 'suspended';

  private readonly collisionWorld: CollisionWorld;
  private readonly surfaceRegistry: SurfaceRegistry;
  private readonly initialPosition: THREE.Vector3;
  private readonly finalPosition: THREE.Vector3;
  private readonly initialQuaternion = new THREE.Quaternion();
  private readonly finalQuaternion = new THREE.Quaternion();
  private readonly previousPositionValue = new THREE.Vector3();
  private readonly collisionWhileSuspended: boolean;
  private readonly collisionDuringTravel: boolean;
  private readonly collisionAtRest: boolean;
  private readonly unsubscribeSupport: () => void;
  private collisionEnabledValue = false;
  private transitionCountValue = 0;
  private disposed = false;

  protected constructor(options: SuspendedStructureAssemblyOptions) {
    validateOptions(options);
    if (options.supportTarget.id !== options.supportTargetId) {
      throw new Error(
        `Assembly "${options.id}" expected support "${options.supportTargetId}" but received "${options.supportTarget.id}".`,
      );
    }
    const existingOwner = subscribedSupportTargets.get(options.supportTarget);
    if (existingOwner) {
      throw new Error(
        `Dissolve support "${options.supportTargetId}" is already associated with assembly "${existingOwner}".`,
      );
    }
    if (
      options.supportTarget.mesh.userData.assemblyId !== options.id ||
      options.supportTarget.mesh.userData.supportRole !== options.supportRole
    ) {
      throw new Error(
        `Assembly "${options.id}" support metadata does not match its explicit registration.`,
      );
    }

    this.id = options.id;
    this.supportTargetId = options.supportTargetId;
    this.supportTarget = options.supportTarget;
    this.collisionWorld = options.collisionWorld;
    this.surfaceRegistry = options.surfaceRegistry;
    this.initialPosition = options.initialPosition.clone();
    this.finalPosition = options.finalPosition.clone();
    this.initialQuaternion.setFromEuler(options.initialRotation ?? new THREE.Euler());
    this.finalQuaternion.setFromEuler(options.finalRotation ?? new THREE.Euler());
    this.releaseDelaySeconds = options.releaseDelaySeconds ?? 0;
    this.travelDurationSeconds = options.travelDurationSeconds;
    this.collisionWhileSuspended = options.collisionWhileSuspended ?? true;
    this.collisionDuringTravel = options.collisionDuringTravel ?? true;
    this.collisionAtRest = options.collisionAtRest ?? true;

    this.root.name = `${this.id}-assembly`;
    this.root.userData.assemblyId = this.id;
    this.collisionMesh = new THREE.Mesh(
      new THREE.BoxGeometry(options.size.x, options.size.y, options.size.z),
      new THREE.MeshStandardMaterial({
        color: options.colour ?? 0x75847d,
        roughness: 0.72,
        metalness: 0.38,
      }),
    );
    this.collisionMesh.name = `${this.id}-moving-surface`;
    this.collisionMesh.userData.assemblyId = this.id;
    this.collisionMesh.userData.supportRole = 'moving-surface';
    this.collisionMesh.userData.surfaceTag = options.finalSurfaceTag ?? 'default';
    this.root.add(this.collisionMesh);

    this.root.position.copy(this.initialPosition);
    this.root.quaternion.copy(this.initialQuaternion);
    this.previousPositionValue.copy(this.root.position);
    this.ensureCollision(this.collisionWhileSuspended);

    subscribedSupportTargets.set(this.supportTarget, this.id);
    this.unsubscribeSupport = this.supportTarget.events.on('completed', ({ target }) => {
      if (target === this.supportTarget) this.onSupportCompleted();
    });
  }

  get state(): SuspendedStructureAssemblyState {
    return this.stateValue;
  }

  get travelProgress(): number {
    return this.travelProgressValue;
  }

  get collisionEnabled(): boolean {
    return this.collisionEnabledValue;
  }

  get transitionCount(): number {
    return this.transitionCountValue;
  }

  get previousPosition(): Readonly<THREE.Vector3> {
    return this.previousPositionValue;
  }

  abstract update(deltaSeconds: number): void;

  getDiagnostics(): SuspendedStructureAssemblyDiagnostics {
    return {
      id: this.id,
      supportTargetId: this.supportTargetId,
      state: this.stateValue,
      supportProgress: this.supportTarget.progress,
      travelProgress: this.travelProgressValue,
      position: this.root.position.toArray(),
      collisionEnabled: this.collisionEnabledValue,
      transitionCount: this.transitionCountValue,
    };
  }

  reset(): void {
    if (this.disposed) return;
    this.elapsedSeconds = 0;
    this.travelProgressValue = 0;
    this.previousPositionValue.copy(this.initialPosition);
    this.root.position.copy(this.initialPosition);
    this.root.quaternion.copy(this.initialQuaternion);
    this.displacement.set(0, 0, 0);
    this.setState('suspended');
    this.ensureCollision(this.collisionWhileSuspended);
    this.onReset();
    this.events.emit('reset', { assembly: this });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeSupport();
    if (subscribedSupportTargets.get(this.supportTarget) === this.id) {
      subscribedSupportTargets.delete(this.supportTarget);
    }
    this.ensureCollision(false);
    this.events.clear();
    this.root.removeFromParent();
    this.collisionMesh.geometry.dispose();
    this.collisionMesh.material.dispose();
    this.root.clear();
  }

  protected beginStep(deltaSeconds: number): void {
    if (this.disposed) throw new Error(`Cannot update disposed assembly "${this.id}".`);
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('Assembly deltaSeconds must be non-negative and finite.');
    }
    this.previousPositionValue.copy(this.root.position);
    this.displacement.set(0, 0, 0);
  }

  protected finishStep(): void {
    this.displacement.subVectors(this.root.position, this.previousPositionValue);
  }

  protected updatePartialState(dissolvingState: SuspendedStructureAssemblyState): void {
    if (
      this.stateValue === 'suspended' &&
      this.supportTarget.progress > PROGRESS_EPSILON &&
      !this.supportTarget.completed
    ) {
      this.setState(dissolvingState);
    }
  }

  protected advanceReleaseDelay(deltaSeconds: number): number | undefined {
    const remainingDelay = Math.max(0, this.releaseDelaySeconds - this.elapsedSeconds);
    const consumed = Math.min(deltaSeconds, remainingDelay);
    this.elapsedSeconds += consumed;
    if (this.elapsedSeconds + PROGRESS_EPSILON < this.releaseDelaySeconds) return undefined;
    this.elapsedSeconds = 0;
    return deltaSeconds - consumed;
  }

  protected advanceTravel(deltaSeconds: number): boolean {
    this.elapsedSeconds = Math.min(this.travelDurationSeconds, this.elapsedSeconds + deltaSeconds);
    this.travelProgressValue = THREE.MathUtils.clamp(
      this.elapsedSeconds / this.travelDurationSeconds,
      0,
      1,
    );
    const easedProgress = this.travelProgressValue * this.travelProgressValue;
    this.root.position.lerpVectors(this.initialPosition, this.finalPosition, easedProgress);
    this.root.quaternion.slerpQuaternions(
      this.initialQuaternion,
      this.finalQuaternion,
      easedProgress,
    );
    this.ensureCollision(this.collisionDuringTravel);
    return this.travelProgressValue >= 1 - PROGRESS_EPSILON;
  }

  protected snapToFinalPose(): void {
    this.elapsedSeconds = 0;
    this.travelProgressValue = 1;
    this.root.position.copy(this.finalPosition);
    this.root.quaternion.copy(this.finalQuaternion);
    this.ensureCollision(this.collisionAtRest);
  }

  protected applyFinalSwing(angleRadians: number): void {
    this.root.position.copy(this.finalPosition);
    this.root.quaternion.copy(this.finalQuaternion);
    this.root.rotateZ(angleRadians);
  }

  protected setState(state: SuspendedStructureAssemblyState): void {
    if (state === this.stateValue) return;
    const previousState = this.stateValue;
    this.stateValue = state;
    this.transitionCountValue += 1;
    this.events.emit('stateChanged', { assembly: this, previousState, state });
  }

  protected emitReleased(): void {
    this.events.emit('released', { assembly: this });
  }

  protected abstract onSupportCompleted(): void;

  protected onReset(): void {}

  private ensureCollision(enabled: boolean): void {
    if (enabled) {
      this.collisionWorld.register(
        this.collisionMesh,
        undefined,
        ColliderTransformMode.Dynamic,
      );
      this.surfaceRegistry.register(this.collisionMesh);
    } else {
      this.collisionWorld.unregister(this.collisionMesh);
      this.surfaceRegistry.unregister(this.collisionMesh);
    }
    this.collisionEnabledValue = enabled;
  }
}

export class DropToAcidAssembly extends SuspendedStructureAssembly {
  constructor(options: DropToAcidAssemblyOptions) {
    super(validateDropToAcidOptions(options));
  }

  override update(deltaSeconds: number): void {
    this.beginStep(deltaSeconds);
    this.updatePartialState('dissolving');

    let remainingSeconds = deltaSeconds;
    if (this.stateValue === 'released') {
      const remainingAfterDelay = this.advanceReleaseDelay(remainingSeconds);
      if (remainingAfterDelay === undefined) {
        this.finishStep();
        return;
      }
      remainingSeconds = remainingAfterDelay;
      this.setState('falling');
    }

    if (this.stateValue === 'falling' && this.advanceTravel(remainingSeconds)) {
      this.snapToFinalPose();
      this.setState('landed');
      this.events.emit('landed', { assembly: this });
    }
    this.finishStep();
  }

  protected override onSupportCompleted(): void {
    if (this.stateValue !== 'suspended' && this.stateValue !== 'dissolving') return;
    this.elapsedSeconds = 0;
    this.setState('released');
    this.emitReleased();
  }
}

export class RopeCatchAssembly extends SuspendedStructureAssembly {
  private readonly settlingDurationSeconds: number;
  private readonly settlingSwingRadians: number;

  constructor(options: RopeCatchAssemblyOptions) {
    super(validateRopeCatchOptions(options));
    this.settlingDurationSeconds = options.settlingDurationSeconds ?? 0.45;
    this.settlingSwingRadians = options.settlingSwingRadians ?? 0.055;
  }

  override update(deltaSeconds: number): void {
    this.beginStep(deltaSeconds);
    this.updatePartialState('braceDissolving');

    let remainingSeconds = deltaSeconds;
    if (this.stateValue === 'released') {
      const remainingAfterDelay = this.advanceReleaseDelay(remainingSeconds);
      if (remainingAfterDelay === undefined) {
        this.finishStep();
        return;
      }
      remainingSeconds = remainingAfterDelay;
      this.setState('dropping');
    }

    if (this.stateValue === 'dropping') {
      if (this.advanceTravel(remainingSeconds)) {
        this.snapToFinalPose();
        this.setState('ropeTaut');
        this.events.emit('ropeTaut', { assembly: this });
      }
      this.finishStep();
      return;
    }

    if (this.stateValue === 'ropeTaut') {
      this.elapsedSeconds = 0;
      this.setState('settling');
    }

    if (this.stateValue === 'settling') {
      this.elapsedSeconds = Math.min(
        this.settlingDurationSeconds,
        this.elapsedSeconds + remainingSeconds,
      );
      const settleProgress = this.elapsedSeconds / this.settlingDurationSeconds;
      const damping = (1 - settleProgress) * (1 - settleProgress);
      const angle =
        Math.sin(settleProgress * Math.PI * 4) *
        damping *
        this.settlingSwingRadians;
      this.applyFinalSwing(angle);
      if (settleProgress >= 1 - PROGRESS_EPSILON) {
        this.snapToFinalPose();
        this.setState('stable');
        this.events.emit('settled', { assembly: this });
      }
    }
    this.finishStep();
  }

  protected override onSupportCompleted(): void {
    if (this.stateValue !== 'suspended' && this.stateValue !== 'braceDissolving') return;
    this.elapsedSeconds = 0;
    this.setState('released');
    this.emitReleased();
  }
}

function validateOptions(options: SuspendedStructureAssemblyOptions): void {
  if (!options.id || !options.supportTargetId) {
    throw new Error('Assembly and support target IDs must be non-empty.');
  }
  for (const [label, vector] of [
    ['initial position', options.initialPosition],
    ['final position', options.finalPosition],
    ['size', options.size],
  ] as const) {
    if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
      throw new Error(`Assembly ${label} must contain finite values.`);
    }
  }
  if (options.size.x <= 0 || options.size.y <= 0 || options.size.z <= 0) {
    throw new Error('Assembly size must contain positive values.');
  }
  for (const rotation of [options.initialRotation, options.finalRotation]) {
    if (
      rotation &&
      ![rotation.x, rotation.y, rotation.z].every(Number.isFinite)
    ) {
      throw new Error('Assembly rotations must contain finite values.');
    }
  }
  if (!Number.isFinite(options.travelDurationSeconds) || options.travelDurationSeconds <= 0) {
    throw new Error('Assembly travel duration must be positive and finite.');
  }
  const delay = options.releaseDelaySeconds ?? 0;
  if (!Number.isFinite(delay) || delay < 0) {
    throw new Error('Assembly release delay must be non-negative and finite.');
  }
}

function validateRopeCatchOptions(
  options: RopeCatchAssemblyOptions,
): RopeCatchAssemblyOptions {
  if (options.supportRole !== 'soluble-brace') {
    throw new Error('Rope-catch assemblies require a soluble-brace support.');
  }
  const settlingDurationSeconds = options.settlingDurationSeconds ?? 0.45;
  const settlingSwingRadians = options.settlingSwingRadians ?? 0.055;
  if (!Number.isFinite(settlingDurationSeconds) || settlingDurationSeconds <= 0) {
    throw new Error('Rope-catch settling duration must be positive and finite.');
  }
  if (!Number.isFinite(settlingSwingRadians) || settlingSwingRadians < 0) {
    throw new Error('Rope-catch swing angle must be non-negative and finite.');
  }
  return options;
}

function validateDropToAcidOptions(
  options: DropToAcidAssemblyOptions,
): DropToAcidAssemblyOptions {
  if (options.supportRole !== 'soluble-rope') {
    throw new Error('Drop-to-acid assemblies require a soluble-rope support.');
  }
  return options;
}
