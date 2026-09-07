import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import type { DroneProjectileSystem } from './DroneProjectileSystem.ts';
import {
  SecurityDrone,
  type SecurityDroneConfig,
  type SecurityDroneReadModel,
  type SecurityDroneTarget,
} from './SecurityDrone.ts';

const EPSILON = 1e-9;

export type GroundSecurityDroneState =
  | 'active'
  | 'beingPushed'
  | 'tipping'
  | 'permanentlyDisabled';

export interface GroundSecurityDroneConfig {
  readonly drone: SecurityDroneConfig;
  readonly rearPushCentreLocal: THREE.Vector3;
  readonly rearPushSize: THREE.Vector3;
  readonly pushIntentDotThreshold: number;
  readonly pushProgressPerSecond: number;
  readonly pushDecayPerSecond: number;
  readonly tippingDurationSeconds: number;
  readonly radioactiveFinalPosition: THREE.Vector3;
  readonly radioactiveFinalRotation: THREE.Euler;
}

export interface GroundSecurityDroneReadModel {
  readonly id: string;
  readonly state: GroundSecurityDroneState;
  readonly pushProgress: number;
  readonly stateElapsedSeconds: number;
  readonly drone: SecurityDroneReadModel;
}

interface MutableGroundReadModel {
  readonly id: string;
  state: GroundSecurityDroneState;
  pushProgress: number;
  stateElapsedSeconds: number;
  readonly drone: SecurityDroneReadModel;
}

export interface GroundSecurityDroneEvents {
  stateChanged: {
    readonly droneId: string;
    readonly previousState: GroundSecurityDroneState;
    readonly state: GroundSecurityDroneState;
  };
  pushProgressChanged: { readonly droneId: string; readonly progress: number };
  tipping: { readonly droneId: string };
  disabled: { readonly droneId: string };
  reset: { readonly droneId: string };
}

/** Bob-only deliberate rear-push lifecycle for one fixed ground drone. */
export class GroundSecurityDrone {
  readonly events = new EventBus<GroundSecurityDroneEvents>();
  readonly drone: SecurityDrone;
  readonly readModel: GroundSecurityDroneReadModel;
  readonly radiationTarget: {
    readonly id: string;
    readonly kind: 'drone';
    readonly position: THREE.Vector3;
    readonly radiusMetres: number;
    readonly response: 'signal';
  };

  private readonly config: GroundSecurityDroneConfig;
  private readonly initialPosition: THREE.Vector3;
  private readonly finalPosition: THREE.Vector3;
  private readonly initialQuaternion = new THREE.Quaternion();
  private readonly finalQuaternion = new THREE.Quaternion();
  private readonly authoredForward = new THREE.Vector3();
  private readonly localBob = new THREE.Vector3();
  private readonly movementDirection = new THREE.Vector3();
  private readonly radiationPosition = new THREE.Vector3();
  private readonly model: MutableGroundReadModel;
  private state: GroundSecurityDroneState = 'active';
  private pushProgress = 0;
  private stateElapsed = 0;
  private radiationContactPending = false;
  private disposed = false;

  constructor(
    config: GroundSecurityDroneConfig,
    world: CollisionWorld,
    surfaces: SurfaceRegistry,
    projectiles: DroneProjectileSystem,
    presentationResources?: SecurityDronePresentationResources,
  ) {
    validateConfig(config);
    this.config = config;
    this.initialPosition = config.drone.initialPosition.clone();
    this.finalPosition = config.radioactiveFinalPosition.clone();
    this.initialQuaternion.setFromEuler(config.drone.initialRotation ?? new THREE.Euler());
    this.finalQuaternion.setFromEuler(config.radioactiveFinalRotation);
    this.authoredForward.copy(config.drone.forward).normalize();
    this.drone = new SecurityDrone(
      config.drone,
      world,
      surfaces,
      projectiles,
      presentationResources,
    );
    this.radiationTarget = {
      id: config.drone.id,
      kind: 'drone',
      position: this.radiationPosition,
      radiusMetres: Math.min(config.drone.colliderSize.x, config.drone.colliderSize.z) * 0.5,
      response: 'signal',
    };
    this.model = {
      id: config.drone.id,
      state: 'active',
      pushProgress: 0,
      stateElapsedSeconds: 0,
      drone: this.drone.readModel,
    };
    this.readModel = this.model;
    this.syncRadiationPosition();
  }

  update(
    deltaSeconds: number,
    targets: readonly SecurityDroneTarget[],
    bobBody: KinematicBody,
    activeSlimeId: 'bob' | 'goop',
    bobMovementIntent: { readonly x: number; readonly y: number; readonly z: number },
  ): void {
    this.assertActive();
    validateDelta(deltaSeconds);
    this.stateElapsed += deltaSeconds;
    if (this.state === 'active' || this.state === 'beingPushed') {
      this.drone.update(deltaSeconds, targets);
      this.updatePush(deltaSeconds, bobBody, activeSlimeId, bobMovementIntent);
    } else if (this.state === 'tipping') {
      const t = Math.min(1, this.stateElapsed / this.config.tippingDurationSeconds);
      this.drone.root.position.lerpVectors(this.initialPosition, this.finalPosition, t);
      this.drone.root.quaternion.slerpQuaternions(this.initialQuaternion, this.finalQuaternion, t);
      if (this.radiationContactPending && t >= 1 - EPSILON) this.disablePermanently();
    }
    this.syncRadiationPosition();
    this.syncReadModel();
  }

  signalRadiationContact(): void {
    if (this.disposed || this.state !== 'tipping') return;
    this.radiationContactPending = true;
    if (this.drone.root.position.distanceToSquared(this.finalPosition) <= EPSILON) {
      this.disablePermanently();
    }
  }

  cancelTransientState(): void {
    if (this.disposed) return;
    this.drone.cancelTransientState();
  }

  reset(): void {
    if (this.disposed) return;
    this.state = 'active';
    this.pushProgress = 0;
    this.stateElapsed = 0;
    this.radiationContactPending = false;
    this.drone.reset();
    this.syncRadiationPosition();
    this.syncReadModel();
    this.events.emit('reset', { droneId: this.drone.id });
  }

  dispose(): void {
    if (this.disposed) return;
    this.drone.dispose();
    this.events.clear();
    this.disposed = true;
  }

  private updatePush(
    deltaSeconds: number,
    bobBody: KinematicBody,
    activeSlimeId: 'bob' | 'goop',
    movementIntent: { readonly x: number; readonly y: number; readonly z: number },
  ): void {
    let deliberate = activeSlimeId === 'bob' && bobBody.lastContactCollider === this.drone.collider;
    if (deliberate) {
      this.localBob.copy(bobBody.position);
      this.drone.root.worldToLocal(this.localBob);
      const half = this.config.rearPushSize;
      deliberate =
        Math.abs(this.localBob.x - this.config.rearPushCentreLocal.x) <= half.x * 0.5 + bobBody.radiusMetres &&
        Math.abs(this.localBob.y - this.config.rearPushCentreLocal.y) <= half.y * 0.5 + bobBody.radiusMetres &&
        Math.abs(this.localBob.z - this.config.rearPushCentreLocal.z) <= half.z * 0.5 + bobBody.radiusMetres;
    }
    if (deliberate) {
      this.movementDirection.set(movementIntent.x, movementIntent.y, movementIntent.z);
      deliberate =
        this.movementDirection.lengthSq() > EPSILON &&
        this.movementDirection.normalize().dot(this.authoredForward) >= this.config.pushIntentDotThreshold;
    }

    const previous = this.pushProgress;
    this.pushProgress = THREE.MathUtils.clamp(
      this.pushProgress + (deliberate ? this.config.pushProgressPerSecond : -this.config.pushDecayPerSecond) * deltaSeconds,
      0,
      1,
    );
    if (Math.abs(previous - this.pushProgress) > EPSILON) {
      this.events.emit('pushProgressChanged', { droneId: this.drone.id, progress: this.pushProgress });
    }
    if (this.pushProgress >= 1 - EPSILON) {
      this.drone.setEnabled(false);
      this.transition('tipping');
      this.events.emit('tipping', { droneId: this.drone.id });
    } else if (this.pushProgress > EPSILON) {
      this.transition('beingPushed');
    } else {
      this.transition('active');
    }
  }

  private disablePermanently(): void {
    if (this.state !== 'tipping') return;
    this.drone.root.position.copy(this.finalPosition);
    this.drone.root.quaternion.copy(this.finalQuaternion);
    this.radiationContactPending = false;
    this.transition('permanentlyDisabled');
    this.events.emit('disabled', { droneId: this.drone.id });
  }

  private transition(state: GroundSecurityDroneState): void {
    if (this.state === state) return;
    const previousState = this.state;
    this.state = state;
    this.stateElapsed = 0;
    this.model.state = state;
    this.model.stateElapsedSeconds = 0;
    this.events.emit('stateChanged', { droneId: this.drone.id, previousState, state });
  }

  private syncReadModel(): void {
    this.model.state = this.state;
    this.model.pushProgress = this.pushProgress;
    this.model.stateElapsedSeconds = this.stateElapsed;
  }

  private syncRadiationPosition(): void {
    this.drone.root.getWorldPosition(this.radiationPosition);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Cannot update a disposed ground drone.');
  }
}

function validateDelta(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error('Ground drone deltaSeconds must be positive and finite.');
  }
}

function validateConfig(config: GroundSecurityDroneConfig): void {
  if (config.drone.type !== 'ground') throw new Error('Ground lifecycle requires a ground drone.');
  if (
    config.rearPushSize.x <= 0 || config.rearPushSize.y <= 0 || config.rearPushSize.z <= 0 ||
    config.pushProgressPerSecond <= 0 || config.pushDecayPerSecond <= 0 ||
    config.tippingDurationSeconds <= 0
  ) throw new Error('Ground drone push tuning must be positive.');
  if (config.pushIntentDotThreshold < -1 || config.pushIntentDotThreshold > 1) {
    throw new Error('Ground drone push intent threshold must be within [-1, 1].');
  }
}
