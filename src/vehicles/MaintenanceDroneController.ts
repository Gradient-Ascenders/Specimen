import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { BlackoutCheckpointParticipant } from '../levels/BlackoutCheckpointManager.ts';
import type { SerializableValue } from '../levels/BlackoutRuntimeState.ts';
import {
  ColliderTransformMode,
  CollisionLayer,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type {
  KinematicBody,
  ReadonlyVector3State,
} from '../physics/KinematicBody.ts';
import type { PersistentThreeSlimeId } from '../slimes/PersistentSlimeGroup.ts';
import { MaintenanceDroneFlightBody } from './MaintenanceDroneFlightBody.ts';
import {
  DEFAULT_MAINTENANCE_DRONE_CONFIG,
  type MaintenanceDroneConfig,
  type MaintenanceDroneDismountRejectReason,
  type MaintenanceDroneEvents,
  type MaintenanceDroneMountRejectReason,
  type MaintenanceDroneReadModel,
  type MaintenanceDroneRecoveryReason,
  type MaintenanceDroneState,
} from './MaintenanceDroneTypes.ts';

const EPSILON = 1e-9;

export interface MaintenanceDroneAuthoring {
  readonly root: THREE.Object3D;
  readonly collider: THREE.Mesh;
  readonly mountAnchor: THREE.Object3D;
  readonly riderAnchor: THREE.Object3D;
  readonly dismountAnchor: THREE.Object3D;
  /** Fixed authored world/level anchor, not parented to the moving drone root. */
  readonly recoveryAnchor: THREE.Object3D;
}

export interface MaintenanceDroneControllerOptions {
  readonly world: CollisionWorld;
  readonly authoring: MaintenanceDroneAuthoring;
  readonly config?: Partial<MaintenanceDroneConfig>;
  readonly isVoltPlacementSafe: (
    position: THREE.Vector3,
    clearanceRadius: number,
  ) => boolean;
  readonly voltRadiusMetres: number;
}

interface MutableReadVector {
  x: number;
  y: number;
  z: number;
}

interface MutableMaintenanceDroneReadModel {
  state: MaintenanceDroneState;
  mountAvailable: boolean;
  mounted: boolean;
  parked: boolean;
  powered: boolean;
  startupProgress: number;
  startupCompleted: boolean;
  tutorialCompleted: boolean;
  firstMountTutorialAvailable: boolean;
  supported: boolean;
  lightEnabled: boolean;
  readonly position: MutableReadVector;
  readonly previousPosition: MutableReadVector;
  readonly velocity: MutableReadVector;
  horizontalSpeed: number;
  verticalSpeed: number;
  recoveryReason?: MaintenanceDroneRecoveryReason;
}

interface MaintenanceDroneSnapshot {
  readonly position: readonly [number, number, number];
  readonly stableState:
    | 'damaged-idle'
    | 'mounted'
    | 'parked-hover'
    | 'grounded-idle';
  readonly startupCompleted: boolean;
  readonly tutorialCompleted: boolean;
  readonly voltMounted: boolean;
}

/**
 * Level 3 maintenance-drone gameplay authority.
 *
 * Volt remains the one real slime body known by camera/electrical systems.
 * This controller only owns the drone state/flight and synchronizes Volt to
 * authored rider anchors while powered mounting owns movement.
 */
export class MaintenanceDroneController
implements BlackoutCheckpointParticipant {
  readonly id = 'maintenance-drone';
  readonly events = new EventBus<MaintenanceDroneEvents>();
  readonly readModel: MaintenanceDroneReadModel;
  readonly flight: MaintenanceDroneFlightBody;
  readonly collider: THREE.Mesh;

  private readonly authoring: MaintenanceDroneAuthoring;
  private readonly world: CollisionWorld;
  private readonly config: MaintenanceDroneConfig;
  private readonly isVoltPlacementSafe: MaintenanceDroneControllerOptions['isVoltPlacementSafe'];
  private readonly voltRadiusMetres: number;
  private readonly model: MutableMaintenanceDroneReadModel;
  private readonly anchorPosition = new THREE.Vector3();
  private readonly previousAnchorPosition = new THREE.Vector3();
  private readonly recoveryPosition = new THREE.Vector3();
  private readonly startupOrigin = new THREE.Vector3();
  private readonly startupDisplacement = new THREE.Vector3();
  private readonly fallingSupportDisplacement = new THREE.Vector3();
  private startupElapsedSeconds = 0;
  private recoveryElapsedSeconds = 0;
  private recoveryReasonValue: MaintenanceDroneRecoveryReason | undefined;
  private voltMountedValue = false;
  private pendingMountedRestore = false;
  private fallingSupportStepPending = false;
  private disposed = false;

  constructor(options: MaintenanceDroneControllerOptions) {
    this.world = options.world;
    this.authoring = options.authoring;
    this.collider = options.authoring.collider;
    this.config = {
      ...DEFAULT_MAINTENANCE_DRONE_CONFIG,
      ...options.config,
    };
    this.isVoltPlacementSafe = options.isVoltPlacementSafe;
    this.voltRadiusMetres = options.voltRadiusMetres;
    this.validateConfig();

    this.flight = new MaintenanceDroneFlightBody({
      world: options.world,
      root: options.authoring.root,
      collider: options.authoring.collider,
    });

    try {
      this.world.register(
        this.collider,
        CollisionLayer.MaintenanceDroneSupport,
        ColliderTransformMode.Dynamic,
      );
    } catch (error) {
      // CollisionWorld registration can be observed/injected after mutation.
      // Quarantine partial construction so a failed Level 3 load cannot leave
      // an invisible support collider behind.
      this.world.unregister(this.collider);
      throw error;
    }

    this.model = {
      state: 'damaged-idle',
      mountAvailable: false,
      mounted: false,
      parked: false,
      powered: false,
      startupProgress: 0,
      startupCompleted: false,
      tutorialCompleted: false,
      firstMountTutorialAvailable: false,
      supported: false,
      lightEnabled: false,
      position: { x: 0, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      horizontalSpeed: 0,
      verticalSpeed: 0,
    };
    this.readModel = this.model;
    this.syncModel();
  }

  get voltMounted(): boolean {
    return this.voltMountedValue;
  }

  updateMountAvailability(
    activeSlimeId: PersistentThreeSlimeId,
    voltPosition: ReadonlyVector3State,
    gameplayInputEnabled: boolean,
  ): boolean {
    if (this.disposed) return false;
    this.authoring.mountAnchor.getWorldPosition(this.anchorPosition);
    const distanceSquared =
      distanceSquaredTo(this.anchorPosition, voltPosition);
    this.model.mountAvailable =
      gameplayInputEnabled &&
      activeSlimeId === 'volt' &&
      (this.model.state === 'damaged-idle' ||
        this.model.state === 'grounded-idle') &&
      distanceSquared <=
        this.config.interactionRangeMetres *
          this.config.interactionRangeMetres;
    return this.model.mountAvailable;
  }

  requestMount(
    activeSlimeId: PersistentThreeSlimeId,
    voltPosition: ReadonlyVector3State,
  ): boolean {
    this.assertActive('mount');
    this.updateMountAvailability(activeSlimeId, voltPosition, true);
    if (activeSlimeId !== 'volt') {
      return this.rejectMount('not-volt');
    }
    if (!this.model.mountAvailable) {
      this.authoring.mountAnchor.getWorldPosition(this.anchorPosition);
      return this.rejectMount(
        distanceSquaredTo(this.anchorPosition, voltPosition) >
          this.config.interactionRangeMetres *
            this.config.interactionRangeMetres
          ? 'out-of-range'
          : 'unavailable',
      );
    }

    this.authoring.riderAnchor.getWorldPosition(this.anchorPosition);
    if (
      !this.isVoltPlacementSafe(
        this.anchorPosition,
        this.voltRadiusMetres,
      )
    ) {
      return this.rejectMount('unsafe-rider');
    }

    this.voltMountedValue = true;
    this.flight.park();
    this.model.mountAvailable = false;
    this.startupElapsedSeconds = 0;
    if (!this.model.startupCompleted) {
      this.startupOrigin.set(
        this.flight.position.x,
        this.flight.position.y,
        this.flight.position.z,
      );
      this.setState('starting');
      this.events.emit('startupStarted', {});
    } else {
      this.setState('mounted');
      this.events.emit('mounted', {});
    }
    this.syncModel();
    return true;
  }

  update(
    deltaSeconds: number,
    controls: {
      readonly horizontalDirection: ReadonlyVector3State;
      readonly ascendHeld: boolean;
      readonly descendHeld: boolean;
      readonly aimHeld: boolean;
      readonly controllingVolt: boolean;
    },
  ): void {
    this.assertActive('update');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'Maintenance drone deltaSeconds must be positive and finite.',
      );
    }

    this.fallingSupportStepPending = false;

    if (this.model.state === 'starting') {
      this.updateStartup(deltaSeconds);
    } else if (this.model.state === 'mounted') {
      if (!controls.controllingVolt) {
        this.parkForSwitch();
      } else {
        const vertical =
          (controls.ascendHeld ? 1 : 0) -
          (controls.descendHeld ? 1 : 0);
        this.flight.updatePowered(
          deltaSeconds,
          controls.horizontalDirection,
          vertical,
          controls.aimHeld,
        );
        this.enforceMountedRiderClearance();
      }
    } else if (this.model.state === 'parked-hover') {
      this.flight.park();
    } else if (this.model.state === 'unpowered-falling') {
      const landed = this.flight.updateFalling(deltaSeconds);
      this.fallingSupportStepPending = true;
      if (landed) {
        this.setState('grounded-idle');
        this.events.emit('landed', {});
      }
    } else if (
      this.model.state === 'shorted' ||
      this.model.state === 'recovering'
    ) {
      this.updateRecovery(deltaSeconds);
    }

    this.syncModel();
  }

  syncMountedVolt(voltBody: KinematicBody): void {
    if (!this.voltMountedValue) return;
    this.authoring.riderAnchor.getWorldPosition(this.anchorPosition);
    this.previousAnchorPosition.set(
      this.anchorPosition.x -
        (this.flight.position.x - this.flight.previousPosition.x),
      this.anchorPosition.y -
        (this.flight.position.y - this.flight.previousPosition.y),
      this.anchorPosition.z -
        (this.flight.position.z - this.flight.previousPosition.z),
    );
    voltBody.syncKinematicPose(
      this.anchorPosition,
      this.previousAnchorPosition,
    );
  }

  parkForSwitch(): boolean {
    if (
      this.disposed ||
      !this.voltMountedValue ||
      (this.model.state !== 'mounted' &&
        this.model.state !== 'starting')
    ) {
      return false;
    }
    this.flight.park();
    if (this.model.state === 'starting') {
      // Switching during the one-time startup leaves the powered mount
      // attached but freezes motion/timing until Volt is controlled again.
      this.setState('parked-hover');
    } else {
      this.setState('parked-hover');
    }
    this.events.emit('parked', {});
    this.syncModel();
    return true;
  }

  resumeMountedControl(): boolean {
    if (
      this.disposed ||
      !this.voltMountedValue ||
      this.model.state !== 'parked-hover'
    ) {
      return false;
    }
    this.flight.park();
    if (!this.model.startupCompleted) {
      this.setState('starting');
    } else {
      this.setState('mounted');
      this.events.emit('controlResumed', {});
    }
    this.syncModel();
    return true;
  }

  requestDismount(voltBody: KinematicBody): boolean {
    this.assertActive('dismount');
    if (
      !this.voltMountedValue ||
      (this.model.state !== 'mounted' &&
        this.model.state !== 'parked-hover')
    ) {
      return this.rejectDismount('not-mounted');
    }

    this.authoring.dismountAnchor.getWorldPosition(this.anchorPosition);
    if (
      !this.isVoltPlacementSafe(
        this.anchorPosition,
        this.voltRadiusMetres,
      )
    ) {
      return this.rejectDismount('unsafe-rider');
    }

    const previous = new THREE.Vector3(
      voltBody.position.x,
      voltBody.position.y,
      voltBody.position.z,
    );
    voltBody.syncKinematicPose(this.anchorPosition, previous);
    this.voltMountedValue = false;
    this.fallingSupportStepPending = false;
    this.flight.park();
    this.setState('unpowered-falling');
    this.events.emit('dismounted', {});
    this.syncModel();
    return true;
  }

  applyFallingSupportToVolt(voltBody: KinematicBody): void {
    if (!this.fallingSupportStepPending) return;
    this.fallingSupportStepPending = false;
    if (!voltBody.isSupportedBy(this.collider)) return;
    this.fallingSupportDisplacement.set(
      this.flight.position.x - this.flight.previousPosition.x,
      this.flight.position.y - this.flight.previousPosition.y,
      this.flight.position.z - this.flight.previousPosition.z,
    );
    voltBody.applyCarrierDisplacement(
      this.fallingSupportDisplacement,
      this.collider,
    );
  }

  requestRecovery(reason: MaintenanceDroneRecoveryReason): boolean {
    if (this.disposed || this.model.state === 'disposed') return false;
    if (
      this.model.state === 'shorted' ||
      this.model.state === 'recovering'
    ) {
      return false;
    }

    this.voltMountedValue = false;
    this.pendingMountedRestore = false;
    this.fallingSupportStepPending = false;
    this.flight.park();
    this.recoveryElapsedSeconds = 0;
    this.recoveryReasonValue = reason;
    if (reason === 'acid' || reason === 'shorted') {
      this.setState('shorted');
      this.events.emit('shorted', { reason });
    } else {
      this.setState('recovering');
      this.events.emit('recoveryStarted', { reason });
    }
    this.syncModel();
    return true;
  }

  suspendInput(): void {
    if (this.disposed) return;
    this.flight.park();
    this.model.mountAvailable = false;
    this.syncModel();
  }

  cancelTransient(reason: MaintenanceDroneRecoveryReason): void {
    if (this.disposed) return;
    this.suspendInput();
    if (reason === 'death') {
      // Checkpoint recovery will restore the authoritative stable state.
      this.recoveryReasonValue = reason;
    }
    this.syncModel();
  }

  recoverImmediately(reason: MaintenanceDroneRecoveryReason): void {
    if (this.disposed) return;
    this.authoring.recoveryAnchor.getWorldPosition(this.recoveryPosition);
    this.voltMountedValue = false;
    this.pendingMountedRestore = false;
    this.fallingSupportStepPending = false;
    this.startupElapsedSeconds = 0;
    this.recoveryElapsedSeconds = 0;
    this.recoveryReasonValue = undefined;
    this.flight.teleport(this.recoveryPosition);
    this.setState(
      this.model.startupCompleted ? 'grounded-idle' : 'damaged-idle',
    );
    this.events.emit('recoveryCompleted', { reason });
    this.syncModel();
  }

  capture(): SerializableValue {
    this.assertActive('capture');
    const transient =
      this.model.state === 'starting' ||
      (this.model.state === 'parked-hover' &&
        !this.model.startupCompleted) ||
      this.model.state === 'unpowered-falling' ||
      this.model.state === 'shorted' ||
      this.model.state === 'recovering';

    if (transient) {
      this.authoring.recoveryAnchor.getWorldPosition(this.recoveryPosition);
      return {
        position: toTuple(this.recoveryPosition),
        stableState: this.model.startupCompleted
          ? 'grounded-idle'
          : 'damaged-idle',
        startupCompleted: this.model.startupCompleted,
        tutorialCompleted: this.model.tutorialCompleted,
        voltMounted: false,
      };
    }

    return {
      position: toTuple(this.flight.position),
      stableState:
        this.model.state === 'parked-hover'
          ? 'parked-hover'
          : this.model.state === 'mounted'
            ? 'mounted'
            : this.model.state === 'grounded-idle'
              ? 'grounded-idle'
              : 'damaged-idle',
      startupCompleted: this.model.startupCompleted,
      tutorialCompleted: this.model.tutorialCompleted,
      voltMounted: this.voltMountedValue,
    };
  }

  restore(state: SerializableValue): void {
    this.assertActive('restore');
    const snapshot = readSnapshot(state);
    this.flight.teleport(tupleToVector(snapshot.position));
    this.flight.park();
    this.fallingSupportStepPending = false;
    this.startupElapsedSeconds = 0;
    this.recoveryElapsedSeconds = 0;
    this.recoveryReasonValue = undefined;
    this.model.startupCompleted = snapshot.startupCompleted;
    this.model.tutorialCompleted = snapshot.tutorialCompleted;
    this.model.firstMountTutorialAvailable =
      snapshot.startupCompleted && !snapshot.tutorialCompleted;
    this.voltMountedValue = false;
    this.pendingMountedRestore = snapshot.voltMounted;
    this.setState(snapshot.stableState);
    this.model.mountAvailable = false;
    this.syncModel();
  }

  resetTransient(): void {
    if (this.disposed) return;
    this.flight.park();
    this.fallingSupportStepPending = false;
    this.model.mountAvailable = false;
    this.recoveryReasonValue = undefined;
    this.recoveryElapsedSeconds = 0;
  }

  reconcileAfterBodyRecovery(
    activeSlimeId: PersistentThreeSlimeId,
    voltBody: KinematicBody,
  ): void {
    if (!this.pendingMountedRestore) return;
    this.pendingMountedRestore = false;
    this.voltMountedValue = true;
    this.authoring.riderAnchor.getWorldPosition(this.anchorPosition);
    if (
      !this.isVoltPlacementSafe(
        this.anchorPosition,
        this.voltRadiusMetres,
      )
    ) {
      this.voltMountedValue = false;
      this.authoring.recoveryAnchor.getWorldPosition(this.recoveryPosition);
      this.flight.teleport(this.recoveryPosition);
      this.setState(
        this.model.startupCompleted ? 'grounded-idle' : 'damaged-idle',
      );
      this.syncModel();
      return;
    }

    voltBody.syncKinematicPose(this.anchorPosition, this.anchorPosition);
    this.setState(activeSlimeId === 'volt' ? 'mounted' : 'parked-hover');
    this.flight.park();
    this.syncModel();
  }

  reset(): void {
    if (this.disposed) return;
    this.authoring.recoveryAnchor.getWorldPosition(this.recoveryPosition);
    this.flight.teleport(this.recoveryPosition);
    this.voltMountedValue = false;
    this.pendingMountedRestore = false;
    this.startupElapsedSeconds = 0;
    this.recoveryElapsedSeconds = 0;
    this.recoveryReasonValue = undefined;
    this.model.startupCompleted = false;
    this.model.tutorialCompleted = false;
    this.model.firstMountTutorialAvailable = false;
    this.model.startupProgress = 0;
    this.model.mountAvailable = false;
    this.setState('damaged-idle');
    this.syncModel();
  }

  markTutorialCompleted(): void {
    if (this.disposed || !this.model.startupCompleted) return;
    this.model.tutorialCompleted = true;
    this.model.firstMountTutorialAvailable = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.flight.park();
    this.voltMountedValue = false;
    this.pendingMountedRestore = false;
    this.fallingSupportStepPending = false;
    this.model.mountAvailable = false;
    this.world.unregister(this.collider);
    this.setState('disposed');
    this.events.clear();
    this.disposed = true;
    this.syncModel();
  }

  private updateStartup(deltaSeconds: number): void {
    this.startupElapsedSeconds = Math.min(
      this.config.startupSeconds,
      this.startupElapsedSeconds + deltaSeconds,
    );
    const progress =
      this.startupElapsedSeconds / this.config.startupSeconds;
    const desiredY =
      this.startupOrigin.y +
      this.config.startupRiseMetres * progress;
    this.startupDisplacement.set(
      0,
      desiredY - this.flight.position.y,
      0,
    );
    this.flight.moveKinematically(this.startupDisplacement);
    this.enforceMountedRiderClearance();
    this.model.startupProgress = progress;

    if (
      this.startupElapsedSeconds + EPSILON <
      this.config.startupSeconds
    ) {
      return;
    }

    this.model.startupCompleted = true;
    this.model.startupProgress = 1;
    this.setState('mounted');
    this.events.emit('startupCompleted', {});
    this.events.emit('mounted', {});
    if (!this.model.tutorialCompleted) {
      this.model.firstMountTutorialAvailable = true;
      this.events.emit('firstMountTutorialRequested', {});
    }
  }

  private enforceMountedRiderClearance(): void {
    if (!this.voltMountedValue) return;
    this.authoring.riderAnchor.getWorldPosition(this.anchorPosition);
    if (
      this.isVoltPlacementSafe(
        this.anchorPosition,
        this.voltRadiusMetres,
      )
    ) {
      return;
    }

    // The authored drone body may fit below a ceiling while Volt's sphere
    // protrudes above it. Revert the whole flight step rather than allowing the
    // rider to be synchronized inside world geometry.
    this.flight.teleport(this.flight.previousPosition);
    this.flight.park();
  }

  private updateRecovery(deltaSeconds: number): void {
    const reason = this.recoveryReasonValue ?? 'inaccessible';
    this.recoveryElapsedSeconds += deltaSeconds;

    if (
      this.model.state === 'shorted' &&
      this.recoveryElapsedSeconds + EPSILON >=
        this.config.shortedSeconds
    ) {
      this.recoveryElapsedSeconds = 0;
      this.setState('recovering');
      this.events.emit('recoveryStarted', { reason });
      return;
    }

    if (
      this.model.state === 'recovering' &&
      this.recoveryElapsedSeconds + EPSILON >=
        this.config.recoverySeconds
    ) {
      this.authoring.recoveryAnchor.getWorldPosition(this.recoveryPosition);
      this.flight.teleport(this.recoveryPosition);
      this.recoveryElapsedSeconds = 0;
      this.recoveryReasonValue = undefined;
      this.setState(
        this.model.startupCompleted ? 'grounded-idle' : 'damaged-idle',
      );
      this.events.emit('recoveryCompleted', { reason });
    }
  }

  private setState(state: MaintenanceDroneState): void {
    this.model.state = state;
    this.model.mounted =
      state === 'starting' ||
      state === 'mounted' ||
      state === 'parked-hover';
    this.model.parked = state === 'parked-hover';
    this.model.powered = this.model.mounted;
    this.model.lightEnabled = this.model.powered;
    if (
      (state === 'damaged-idle' || state === 'grounded-idle') &&
      !this.model.startupCompleted
    ) {
      this.model.startupProgress = 0;
    }
  }

  private syncModel(): void {
    copyReadVector(this.model.position, this.flight.position);
    copyReadVector(
      this.model.previousPosition,
      this.flight.previousPosition,
    );
    copyReadVector(this.model.velocity, this.flight.velocity);
    this.model.supported = this.flight.supported;
    this.model.horizontalSpeed =
      this.flight.horizontalSpeedMetresPerSecond;
    this.model.verticalSpeed =
      this.flight.verticalSpeedMetresPerSecond;
    if (this.recoveryReasonValue) {
      this.model.recoveryReason = this.recoveryReasonValue;
    } else {
      delete this.model.recoveryReason;
    }
  }

  private rejectMount(reason: MaintenanceDroneMountRejectReason): false {
    this.events.emit('mountRejected', { reason });
    return false;
  }

  private rejectDismount(
    reason: MaintenanceDroneDismountRejectReason,
  ): false {
    this.events.emit('dismountRejected', { reason });
    return false;
  }

  private validateConfig(): void {
    for (const [name, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(
          `Maintenance drone ${name} must be positive and finite.`,
        );
      }
    }
    if (
      !Number.isFinite(this.voltRadiusMetres) ||
      this.voltRadiusMetres <= 0
    ) {
      throw new Error('Maintenance drone Volt radius must be positive.');
    }
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(
        `Cannot ${operation} maintenance drone after disposal.`,
      );
    }
  }
}

function copyReadVector(
  target: MutableReadVector,
  source: ReadonlyVector3State,
): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function distanceSquaredTo(
  a: THREE.Vector3,
  b: ReadonlyVector3State,
): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

function toTuple(
  value: ReadonlyVector3State,
): readonly [number, number, number] {
  return [value.x, value.y, value.z] as const;
}

function tupleToVector(
  value: readonly [number, number, number],
): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function readSnapshot(value: SerializableValue): MaintenanceDroneSnapshot {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Invalid maintenance drone checkpoint snapshot.');
  }
  const object = value as Readonly<Record<string, SerializableValue>>;
  const position = object.position;
  const stableState = object.stableState;
  const startupCompleted = object.startupCompleted;
  const tutorialCompleted = object.tutorialCompleted;
  const voltMounted = object.voltMounted;

  if (
    !Array.isArray(position) ||
    position.length !== 3 ||
    !position.every(
      (component) =>
        typeof component === 'number' && Number.isFinite(component),
    ) ||
    (stableState !== 'damaged-idle' &&
      stableState !== 'mounted' &&
      stableState !== 'parked-hover' &&
      stableState !== 'grounded-idle') ||
    typeof startupCompleted !== 'boolean' ||
    typeof tutorialCompleted !== 'boolean' ||
    typeof voltMounted !== 'boolean'
  ) {
    throw new Error('Invalid maintenance drone checkpoint snapshot.');
  }

  const mountedStableState =
    stableState === 'mounted' || stableState === 'parked-hover';
  if (mountedStableState !== voltMounted) {
    throw new Error(
      'Invalid maintenance drone checkpoint mounted-state ownership.',
    );
  }
  if (mountedStableState && !startupCompleted) {
    throw new Error(
      'Invalid maintenance drone checkpoint: mounted stable state requires completed startup.',
    );
  }

  return {
    position: [
      position[0] as number,
      position[1] as number,
      position[2] as number,
    ],
    stableState,
    startupCompleted,
    tutorialCompleted,
    voltMounted,
  };
}
