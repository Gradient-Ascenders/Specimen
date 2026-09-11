import * as THREE from 'three';

import type { SerializableValue } from '../levels/BlackoutRuntimeState.ts';
import {
  ColliderTransformMode,
  CollisionHit,
  CollisionLayer,
  DEFAULT_SOLID_COLLISION_LAYERS,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type {
  ReadonlyVector3State,
} from '../physics/KinematicBody.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import {
  MovingPlatform,
  type MovingPlatformSnapshot,
} from '../puzzle/MovingPlatform.ts';
import {
  VerticalBlastDoor,
  type VerticalBlastDoorSnapshot,
} from '../puzzle/VerticalBlastDoor.ts';
import type { LaserHazard } from '../hazards/LaserHazard.ts';
import {
  PoweredDeviceCore,
  type ElectricalPowerMode,
  type PoweredDeviceLocalSnapshot,
} from './PoweredDeviceCore.ts';

const MOTION_EPSILON_SQ = 1e-12;
const FULL_SWEEP_FRACTION_EPSILON = 1e-6;

export interface PoweredCarrierBody {
  readonly id: string;
  readonly position: ReadonlyVector3State;
  readonly radiusMetres: number;
  isSupportedBy(collider: THREE.Mesh): boolean;
  applyCarrierDisplacement(
    displacement: ReadonlyVector3State,
    carrierCollider: THREE.Mesh,
  ): void;
}

export interface ElectricalDevice {
  readonly id: string;
  readonly core: PoweredDeviceCore;
  readonly root: THREE.Object3D;
  readonly targetTransformMode: ColliderTransformMode;
  readonly canSupply: boolean;
  captureState(): SerializableValue;
  restoreState(state: SerializableValue): void;
  reset(): void;
  updateMechanics(
    deltaSeconds: number,
    bodies: readonly PoweredCarrierBody[],
  ): void;
  syncPowerOutputs(): void;
  dispose(): void;
}

interface CoreSnapshotEnvelope {
  readonly core: PoweredDeviceLocalSnapshot;
}

export interface PoweredLightOptions {
  readonly id: string;
  readonly displayName: string;
  readonly position: THREE.Vector3;
  readonly powerMode?: ElectricalPowerMode;
  readonly initialLatched?: boolean;
  readonly lightIntensity?: number;
}

export class PoweredLightDevice implements ElectricalDevice {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly core: PoweredDeviceCore;
  readonly targetTransformMode = ColliderTransformMode.Static;
  readonly canSupply = false;

  private readonly housingMaterial: THREE.MeshStandardMaterial;
  private readonly pointLight: THREE.PointLight;
  private readonly lightIntensity: number;
  private disposed = false;

  constructor(options: PoweredLightOptions) {
    this.id = options.id;
    this.root.name = `${options.id}-powered-light`;
    this.root.position.copy(options.position);

    const targetMesh = createTargetMesh(`${options.id}-target`);
    this.root.add(targetMesh);

    const housingGeometry = new THREE.BoxGeometry(1.1, 0.35, 0.45);
    this.housingMaterial = new THREE.MeshStandardMaterial({
      color: 0x5d5a38,
      emissive: 0xffdf45,
      emissiveIntensity: 0.05,
      roughness: 0.5,
      metalness: 0.35,
    });
    const housing = new THREE.Mesh(housingGeometry, this.housingMaterial);
    housing.name = `${options.id}-light-housing`;
    housing.position.y = 0.65;
    this.root.add(housing);

    this.lightIntensity = options.lightIntensity ?? 2;
    this.pointLight = new THREE.PointLight(
      0xffe887,
      0,
      7,
      2,
    );
    this.pointLight.name = `${options.id}-light`;
    this.pointLight.position.y = 0.55;
    this.pointLight.castShadow = false;
    this.root.add(this.pointLight);

    this.core = new PoweredDeviceCore({
      id: options.id,
      displayName: options.displayName,
      hitMeshes: [targetMesh],
      socketObject: targetMesh,
      powerMode: options.powerMode,
      initialLatched: options.initialLatched,
    });
    this.syncPowerOutputs();
  }

  captureState(): SerializableValue {
    return { core: this.core.captureLocalState() };
  }

  restoreState(state: SerializableValue): void {
    this.core.restoreLocalState(readCoreSnapshot(this.id, state).core);
    this.syncPowerOutputs();
  }

  reset(): void {
    this.core.reset();
    this.syncPowerOutputs();
  }

  updateMechanics(): void {}

  syncPowerOutputs(): void {
    const powered = this.core.readModel.powered;
    this.housingMaterial.emissiveIntensity = powered ? 1.4 : 0.05;
    this.pointLight.intensity = powered ? this.lightIntensity : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.core.dispose();
    disposeOwnedObject(this.root);
  }
}

export interface PoweredDoorOptions {
  readonly id: string;
  readonly displayName: string;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly closedPosition: THREE.Vector3;
  readonly panelSize: THREE.Vector3;
  readonly travelAxis: THREE.Vector3;
  readonly travelDistance: number;
  readonly openingDurationSeconds?: number;
  readonly closingDurationSeconds?: number;
  readonly powerMode?: ElectricalPowerMode;
  readonly initialLatched?: boolean;
  readonly initialMechanicalPermission?: boolean;
}

interface PoweredDoorSnapshot extends CoreSnapshotEnvelope {
  readonly door: VerticalBlastDoorSnapshot;
  readonly mechanicalPermission: boolean;
}

export class PoweredDoorDevice implements ElectricalDevice {
  readonly id: string;
  readonly core: PoweredDeviceCore;
  readonly root: THREE.Group;
  readonly targetTransformMode = ColliderTransformMode.Static;
  readonly canSupply = false;
  readonly door: VerticalBlastDoor;

  private readonly initialMechanicalPermission: boolean;
  private mechanicalPermission: boolean;
  private disposed = false;

  constructor(options: PoweredDoorOptions) {
    this.id = options.id;
    this.initialMechanicalPermission =
      options.initialMechanicalPermission ?? true;
    this.mechanicalPermission = this.initialMechanicalPermission;

    this.door = new VerticalBlastDoor({
      id: options.id,
      collisionWorld: options.collisionWorld,
      surfaceRegistry: options.surfaceRegistry,
      closedPosition: options.closedPosition,
      panelSize: options.panelSize,
      travelAxis: options.travelAxis,
      travelDistance: options.travelDistance,
      openingDurationSeconds: options.openingDurationSeconds ?? 1,
      closingDurationSeconds: options.closingDurationSeconds ?? 1,
      obstructionCentre: new THREE.Vector3(),
      obstructionSize: options.panelSize.clone().addScalar(0.8),
    });
    this.root = this.door.root;

    const targetMesh = createTargetMesh(`${options.id}-target`);
    targetMesh.position.set(
      options.panelSize.x * 0.5 + 0.65,
      0,
      0,
    );
    this.root.add(targetMesh);

    this.core = new PoweredDeviceCore({
      id: options.id,
      displayName: options.displayName,
      hitMeshes: [targetMesh],
      socketObject: targetMesh,
      powerMode: options.powerMode,
      initialLatched: options.initialLatched,
    });
  }

  setMechanicalPermission(allowed: boolean): void {
    this.mechanicalPermission = allowed;
  }

  captureState(): SerializableValue {
    return {
      core: this.core.captureLocalState(),
      door: this.door.captureState(),
      mechanicalPermission: this.mechanicalPermission,
    };
  }

  restoreState(state: SerializableValue): void {
    const snapshot = readObject(this.id, state);
    this.core.restoreLocalState(
      readPoweredCoreSnapshot(this.id, snapshot.core),
    );
    this.mechanicalPermission = readBoolean(
      this.id,
      snapshot.mechanicalPermission,
      'mechanicalPermission',
    );
    this.door.restoreState(readDoorSnapshot(this.id, snapshot.door));
    this.core.setBlocked(false);
  }

  reset(): void {
    this.core.reset();
    this.mechanicalPermission = this.initialMechanicalPermission;
    this.door.reset();
    this.core.setBlocked(false);
  }

  updateMechanics(
    deltaSeconds: number,
    bodies: readonly PoweredCarrierBody[],
  ): void {
    const requestedOpen =
      this.core.readModel.powered && this.mechanicalPermission;
    this.door.setOpen(requestedOpen);
    this.door.update(deltaSeconds, bodies);
    this.core.setBlocked(
      !this.mechanicalPermission ||
      this.door.state === 'blocked' ||
      this.door.state === 'reopening',
    );
  }

  syncPowerOutputs(): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.core.dispose();
    this.door.dispose();
  }
}

export type PoweredPlatformRoutePolicy = 'one-way' | 'shuttle';

export interface PoweredPlatformOptions {
  readonly id: string;
  readonly displayName: string;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly size?: THREE.Vector3;
  readonly travelDurationSeconds?: number;
  readonly routePolicy?: PoweredPlatformRoutePolicy;
  readonly powerMode?: ElectricalPowerMode;
  readonly initialLatched?: boolean;
  readonly initialMechanicalPermission?: boolean;
}

interface PoweredPlatformSnapshot extends CoreSnapshotEnvelope {
  readonly platform: MovingPlatformSnapshot;
  readonly shuttleTarget: 'start' | 'end';
  readonly mechanicalPermission: boolean;
}

export class PoweredPlatformDevice implements ElectricalDevice {
  readonly id: string;
  readonly root: THREE.Group;
  readonly core: PoweredDeviceCore;
  readonly targetTransformMode = ColliderTransformMode.Dynamic;
  readonly canSupply = false;
  readonly platform: MovingPlatform;

  private readonly collisionWorld: CollisionWorld;
  private readonly surfaceRegistry: SurfaceRegistry;
  private readonly routePolicy: PoweredPlatformRoutePolicy;
  private readonly initialMechanicalPermission: boolean;
  private readonly proposedDisplacement = new THREE.Vector3();
  private readonly carrierHit = new CollisionHit();
  private readonly sweptBounds = new THREE.Box3();
  private readonly scratchClosest = new THREE.Vector3();
  private readonly supportedBodies: PoweredCarrierBody[] = [];
  private mechanicalPermission: boolean;
  private shuttleTarget: 'start' | 'end' = 'end';
  private disposed = false;

  constructor(options: PoweredPlatformOptions) {
    this.id = options.id;
    this.collisionWorld = options.collisionWorld;
    this.surfaceRegistry = options.surfaceRegistry;
    this.routePolicy = options.routePolicy ?? 'one-way';
    this.initialMechanicalPermission =
      options.initialMechanicalPermission ?? true;
    this.mechanicalPermission = this.initialMechanicalPermission;

    this.platform = new MovingPlatform({
      id: options.id,
      start: options.start,
      end: options.end,
      size: options.size,
      travelDurationSeconds: options.travelDurationSeconds,
      initialTarget: 'end',
    });
    this.root = this.platform.root;
    this.collisionWorld.register(
      this.platform.collisionMesh,
      DEFAULT_SOLID_COLLISION_LAYERS,
      ColliderTransformMode.Dynamic,
    );
    try {
      this.surfaceRegistry.register(this.platform.collisionMesh);
    } catch (error) {
      this.collisionWorld.unregister(this.platform.collisionMesh);
      this.platform.dispose();
      throw error;
    }

    const targetMesh = createTargetMesh(`${options.id}-target`);
    targetMesh.position.set(0, 0.65, 0);
    this.root.add(targetMesh);
    this.core = new PoweredDeviceCore({
      id: options.id,
      displayName: options.displayName,
      hitMeshes: [targetMesh],
      socketObject: targetMesh,
      powerMode: options.powerMode,
      initialLatched: options.initialLatched,
    });
  }

  setMechanicalPermission(allowed: boolean): void {
    this.mechanicalPermission = allowed;
  }

  captureState(): SerializableValue {
    return {
      core: this.core.captureLocalState(),
      platform: this.platform.captureState(),
      shuttleTarget: this.shuttleTarget,
      mechanicalPermission: this.mechanicalPermission,
    };
  }

  restoreState(state: SerializableValue): void {
    const snapshot = readObject(this.id, state);
    this.core.restoreLocalState(
      readPoweredCoreSnapshot(this.id, snapshot.core),
    );
    this.platform.restoreState(
      readPlatformSnapshot(this.id, snapshot.platform),
    );
    this.shuttleTarget = readRouteTarget(
      this.id,
      snapshot.shuttleTarget,
      'shuttleTarget',
    );
    this.mechanicalPermission = readBoolean(
      this.id,
      snapshot.mechanicalPermission,
      'mechanicalPermission',
    );
    this.core.setBlocked(false);
  }

  reset(): void {
    this.core.reset();
    this.platform.reset();
    this.shuttleTarget = 'end';
    this.mechanicalPermission = this.initialMechanicalPermission;
    this.core.setBlocked(false);
  }

  updateMechanics(
    deltaSeconds: number,
    bodies: readonly PoweredCarrierBody[],
  ): void {
    this.platform.hold();
    if (
      !this.core.readModel.powered ||
      !this.mechanicalPermission ||
      deltaSeconds <= 0
    ) {
      this.core.setBlocked(!this.mechanicalPermission);
      return;
    }

    if (this.routePolicy === 'shuttle') {
      if (this.platform.isAtEnd) this.shuttleTarget = 'start';
      if (this.platform.isAtStart) this.shuttleTarget = 'end';
      this.platform.setActive(this.shuttleTarget === 'end');
    } else {
      this.platform.setActive(true);
    }

    this.platform.copyProposedDisplacement(
      deltaSeconds,
      this.proposedDisplacement,
    );
    if (this.proposedDisplacement.lengthSq() <= MOTION_EPSILON_SQ) {
      this.core.setBlocked(false);
      return;
    }

    if (this.isMotionBlocked(bodies)) {
      this.core.setBlocked(true);
      return;
    }

    this.core.setBlocked(false);
    this.platform.update(deltaSeconds);
    if (this.platform.displacement.lengthSq() <= MOTION_EPSILON_SQ) return;

    for (const body of this.supportedBodies) {
      body.applyCarrierDisplacement(
        this.platform.displacement,
        this.platform.collisionMesh,
      );
    }
  }

  syncPowerOutputs(): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.core.dispose();
    this.collisionWorld.unregister(this.platform.collisionMesh);
    this.surfaceRegistry.unregister(this.platform.collisionMesh);
    this.platform.dispose();
  }

  private isMotionBlocked(
    bodies: readonly PoweredCarrierBody[],
  ): boolean {
    this.supportedBodies.length = 0;
    for (const body of bodies) {
      if (body.isSupportedBy(this.platform.collisionMesh)) {
        this.supportedBodies.push(body);
        if (
          this.collisionWorld.sweepSphere(
            new THREE.Vector3(
              body.position.x,
              body.position.y,
              body.position.z,
            ),
            this.proposedDisplacement,
            body.radiusMetres,
            this.carrierHit,
            CollisionLayer.Movement,
            this.platform.collisionMesh,
          ) &&
          this.carrierHit.fraction < 1 - FULL_SWEEP_FRACTION_EPSILON
        ) {
          return true;
        }
      }
    }

    this.copySweptPlatformBounds(this.sweptBounds);
    for (const body of bodies) {
      if (this.supportedBodies.includes(body)) continue;
      if (
        sphereIntersectsBox(
          body.position,
          body.radiusMetres,
          this.sweptBounds,
          this.scratchClosest,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private copySweptPlatformBounds(target: THREE.Box3): void {
    const half = this.platform.size.clone().multiplyScalar(0.5);
    const current = this.platform.root.position;
    const proposed = this.proposedDisplacement
      .clone()
      .add(current);
    target.min.set(
      Math.min(current.x, proposed.x) - half.x,
      Math.min(current.y, proposed.y) - half.y,
      Math.min(current.z, proposed.z) - half.z,
    );
    target.max.set(
      Math.max(current.x, proposed.x) + half.x,
      Math.max(current.y, proposed.y) + half.y,
      Math.max(current.z, proposed.z) + half.z,
    );
  }
}

export interface PoweredLiftOptions extends PoweredPlatformOptions {}

export class PoweredLiftDevice extends PoweredPlatformDevice {
  constructor(options: PoweredLiftOptions) {
    if (
      Math.abs(options.start.x - options.end.x) > 1e-6 ||
      Math.abs(options.start.z - options.end.z) > 1e-6
    ) {
      throw new Error('Powered lifts require a vertical authored route.');
    }
    super(options);
  }
}

export interface RotatingBridgeOptions {
  readonly id: string;
  readonly displayName: string;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly position: THREE.Vector3;
  readonly size: THREE.Vector3;
  readonly startAngleRadians?: number;
  readonly endAngleRadians: number;
  readonly rotationDurationSeconds?: number;
  readonly powerMode?: ElectricalPowerMode;
  readonly initialLatched?: boolean;
  readonly initialMechanicalPermission?: boolean;
}

interface RotatingBridgeSnapshot extends CoreSnapshotEnvelope {
  readonly progress: number;
  readonly mechanicalPermission: boolean;
}

export class RotatingBridgeDevice implements ElectricalDevice {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly core: PoweredDeviceCore;
  readonly targetTransformMode = ColliderTransformMode.Dynamic;
  readonly canSupply = false;
  readonly collisionMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

  private readonly collisionWorld: CollisionWorld;
  private readonly surfaceRegistry: SurfaceRegistry;
  private readonly size: THREE.Vector3;
  private readonly startAngle: number;
  private readonly endAngle: number;
  private readonly rotationDurationSeconds: number;
  private readonly initialMechanicalPermission: boolean;
  private readonly sweptBounds = new THREE.Box3();
  private readonly currentBounds = new THREE.Box3();
  private readonly proposedBounds = new THREE.Box3();
  private readonly scratchClosest = new THREE.Vector3();
  private progressValue = 0;
  private mechanicalPermission: boolean;
  private disposed = false;

  constructor(options: RotatingBridgeOptions) {
    if (
      !Number.isFinite(options.rotationDurationSeconds ?? 2) ||
      (options.rotationDurationSeconds ?? 2) <= 0
    ) {
      throw new Error('Rotating bridge duration must be positive.');
    }
    this.id = options.id;
    this.collisionWorld = options.collisionWorld;
    this.surfaceRegistry = options.surfaceRegistry;
    this.size = options.size.clone();
    this.startAngle = options.startAngleRadians ?? 0;
    this.endAngle = options.endAngleRadians;
    this.rotationDurationSeconds = options.rotationDurationSeconds ?? 2;
    this.initialMechanicalPermission =
      options.initialMechanicalPermission ?? true;
    this.mechanicalPermission = this.initialMechanicalPermission;

    this.root.name = `${options.id}-rotating-bridge`;
    this.root.position.copy(options.position);
    this.root.rotation.y = this.startAngle;

    this.collisionMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z),
      new THREE.MeshStandardMaterial({
        color: 0x505a63,
        roughness: 0.62,
        metalness: 0.5,
      }),
    );
    this.collisionMesh.name = `${options.id}-bridge-deck`;
    this.collisionMesh.userData.surfaceTag = 'default';
    this.root.add(this.collisionMesh);

    const targetMesh = createTargetMesh(`${options.id}-target`);
    targetMesh.position.set(0, 0.5, -this.size.z * 0.35);
    this.root.add(targetMesh);

    this.collisionWorld.register(
      this.collisionMesh,
      DEFAULT_SOLID_COLLISION_LAYERS,
      ColliderTransformMode.Dynamic,
    );
    try {
      this.surfaceRegistry.register(this.collisionMesh);
    } catch (error) {
      this.collisionWorld.unregister(this.collisionMesh);
      disposeOwnedObject(this.root);
      throw error;
    }

    this.core = new PoweredDeviceCore({
      id: options.id,
      displayName: options.displayName,
      hitMeshes: [targetMesh],
      socketObject: targetMesh,
      powerMode: options.powerMode,
      initialLatched: options.initialLatched,
    });
  }

  get progress(): number {
    return this.progressValue;
  }

  setMechanicalPermission(allowed: boolean): void {
    this.mechanicalPermission = allowed;
  }

  captureState(): SerializableValue {
    return {
      core: this.core.captureLocalState(),
      progress: this.progressValue,
      mechanicalPermission: this.mechanicalPermission,
    };
  }

  restoreState(state: SerializableValue): void {
    const snapshot = readObject(this.id, state);
    this.core.restoreLocalState(
      readPoweredCoreSnapshot(this.id, snapshot.core),
    );
    this.progressValue = readUnitInterval(
      this.id,
      snapshot.progress,
      'progress',
    );
    this.mechanicalPermission = readBoolean(
      this.id,
      snapshot.mechanicalPermission,
      'mechanicalPermission',
    );
    this.applyProgress();
    this.core.setBlocked(false);
  }

  reset(): void {
    this.core.reset();
    this.progressValue = 0;
    this.mechanicalPermission = this.initialMechanicalPermission;
    this.applyProgress();
    this.core.setBlocked(false);
  }

  updateMechanics(
    deltaSeconds: number,
    bodies: readonly PoweredCarrierBody[],
  ): void {
    if (
      !this.core.readModel.powered ||
      !this.mechanicalPermission ||
      this.progressValue >= 1 ||
      deltaSeconds <= 0
    ) {
      this.core.setBlocked(!this.mechanicalPermission);
      return;
    }

    const nextProgress = Math.min(
      1,
      this.progressValue + deltaSeconds / this.rotationDurationSeconds,
    );
    const currentAngle = THREE.MathUtils.lerp(
      this.startAngle,
      this.endAngle,
      this.progressValue,
    );
    const proposedAngle = THREE.MathUtils.lerp(
      this.startAngle,
      this.endAngle,
      nextProgress,
    );
    this.copyAngleBounds(currentAngle, this.currentBounds);
    this.copyAngleBounds(proposedAngle, this.proposedBounds);
    this.sweptBounds.copy(this.currentBounds).union(this.proposedBounds);

    for (const body of bodies) {
      if (
        sphereIntersectsBox(
          body.position,
          body.radiusMetres,
          this.sweptBounds,
          this.scratchClosest,
        )
      ) {
        this.core.setBlocked(true);
        return;
      }
    }

    this.progressValue = nextProgress;
    this.applyProgress();
    this.core.setBlocked(false);
  }

  syncPowerOutputs(): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.core.dispose();
    this.collisionWorld.unregister(this.collisionMesh);
    this.surfaceRegistry.unregister(this.collisionMesh);
    disposeOwnedObject(this.root);
  }

  private applyProgress(): void {
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.startAngle,
      this.endAngle,
      this.progressValue,
    );
    this.root.updateWorldMatrix(true, true);
  }

  private copyAngleBounds(angle: number, target: THREE.Box3): void {
    const halfX = this.size.x * 0.5;
    const halfY = this.size.y * 0.5;
    const halfZ = this.size.z * 0.5;
    const cosine = Math.abs(Math.cos(angle));
    const sine = Math.abs(Math.sin(angle));
    const worldHalfX = cosine * halfX + sine * halfZ;
    const worldHalfZ = sine * halfX + cosine * halfZ;
    target.min.set(
      this.root.position.x - worldHalfX,
      this.root.position.y - halfY,
      this.root.position.z - worldHalfZ,
    );
    target.max.set(
      this.root.position.x + worldHalfX,
      this.root.position.y + halfY,
      this.root.position.z + worldHalfZ,
    );
  }
}

export type LaserJunctionMode =
  | 'suppress-when-powered'
  | 'activate-when-powered';

export interface LaserJunctionOptions {
  readonly id: string;
  readonly displayName: string;
  readonly position: THREE.Vector3;
  readonly hazards: readonly LaserHazard[];
  readonly mode: LaserJunctionMode;
  readonly powerMode?: ElectricalPowerMode;
  readonly initialLatched?: boolean;
}

export class LaserJunctionDevice implements ElectricalDevice {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly core: PoweredDeviceCore;
  readonly targetTransformMode = ColliderTransformMode.Static;
  readonly canSupply = false;

  private readonly hazards: readonly LaserHazard[];
  private readonly mode: LaserJunctionMode;
  private disposed = false;

  constructor(options: LaserJunctionOptions) {
    if (options.hazards.length === 0) {
      throw new Error('Laser junction requires at least one authored hazard.');
    }
    this.id = options.id;
    this.hazards = [...options.hazards];
    this.mode = options.mode;
    this.root.name = `${options.id}-laser-junction`;
    this.root.position.copy(options.position);
    const targetMesh = createTargetMesh(`${options.id}-target`);
    this.root.add(targetMesh);
    this.core = new PoweredDeviceCore({
      id: options.id,
      displayName: options.displayName,
      hitMeshes: [targetMesh],
      powerMode: options.powerMode,
      initialLatched: options.initialLatched,
    });
    this.syncPowerOutputs();
  }

  captureState(): SerializableValue {
    return { core: this.core.captureLocalState() };
  }

  restoreState(state: SerializableValue): void {
    this.core.restoreLocalState(readCoreSnapshot(this.id, state).core);
    this.syncPowerOutputs();
  }

  reset(): void {
    this.core.reset();
    this.syncPowerOutputs();
  }

  updateMechanics(): void {}

  syncPowerOutputs(): void {
    const powered = this.core.readModel.powered;
    const gateEnabled =
      this.mode === 'activate-when-powered'
        ? powered
        : !powered;
    for (const hazard of this.hazards) {
      hazard.setCircuitGateEnabled(gateEnabled);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.core.dispose();
    for (const hazard of this.hazards) hazard.setCircuitGateEnabled(true);
    disposeOwnedObject(this.root);
  }
}

export interface RelayDeviceOptions {
  readonly id: string;
  readonly displayName: string;
  readonly position: THREE.Vector3;
  readonly powerMode?: ElectricalPowerMode;
  readonly initialLatched?: boolean;
}

class RelayDeviceBase implements ElectricalDevice {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly core: PoweredDeviceCore;
  readonly targetTransformMode = ColliderTransformMode.Static;
  readonly canSupply = true;
  private disposed = false;

  constructor(options: RelayDeviceOptions, kind: string) {
    this.id = options.id;
    this.root.name = `${options.id}-${kind}`;
    this.root.position.copy(options.position);
    const targetMesh = createTargetMesh(`${options.id}-target`);
    this.root.add(targetMesh);
    this.core = new PoweredDeviceCore({
      id: options.id,
      displayName: options.displayName,
      hitMeshes: [targetMesh],
      powerMode: options.powerMode,
      initialLatched: options.initialLatched,
    });
  }

  captureState(): SerializableValue {
    return { core: this.core.captureLocalState() };
  }

  restoreState(state: SerializableValue): void {
    this.core.restoreLocalState(readCoreSnapshot(this.id, state).core);
  }

  reset(): void {
    this.core.reset();
  }

  updateMechanics(): void {}
  syncPowerOutputs(): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.core.dispose();
    disposeOwnedObject(this.root);
  }
}

export class GeneratorDevice extends RelayDeviceBase {
  constructor(options: RelayDeviceOptions) {
    super(options, 'generator');
  }
}

export class TerminalDevice extends RelayDeviceBase {
  constructor(options: RelayDeviceOptions) {
    super(options, 'terminal');
  }
}

function createTargetMesh(name: string): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0x8b771c,
      emissive: 0xffdf45,
      emissiveIntensity: 0.24,
      roughness: 0.45,
      metalness: 0.55,
    }),
  );
  mesh.name = name;
  mesh.userData.authoringRole = 'electrical-target';
  return mesh;
}

function readCoreSnapshot(
  id: string,
  state: SerializableValue,
): CoreSnapshotEnvelope {
  const object = readObject(id, state);
  return {
    core: readPoweredCoreSnapshot(id, object.core),
  };
}

function readPoweredCoreSnapshot(
  id: string,
  value: SerializableValue | undefined,
): PoweredDeviceLocalSnapshot {
  const object = readObject(id, value);
  return {
    available: readBoolean(id, object.available, 'core.available'),
    latched: readBoolean(id, object.latched, 'core.latched'),
  };
}

function readPlatformSnapshot(
  id: string,
  value: SerializableValue | undefined,
): MovingPlatformSnapshot {
  const object = readObject(id, value);
  return {
    progress: readUnitInterval(id, object.progress, 'platform.progress'),
    target: readRouteTarget(id, object.target, 'platform.target'),
  };
}

function readDoorSnapshot(
  id: string,
  value: SerializableValue | undefined,
): VerticalBlastDoorSnapshot {
  const object = readObject(id, value);
  return {
    progress: readUnitInterval(id, object.progress, 'door.progress'),
    desiredOpen: readBoolean(id, object.desiredOpen, 'door.desiredOpen'),
  };
}

function readObject(
  id: string,
  value: SerializableValue | undefined,
): Readonly<Record<string, SerializableValue>> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`Invalid serialized state for electrical device "${id}".`);
  }
  return value as Readonly<Record<string, SerializableValue>>;
}

function readBoolean(
  id: string,
  value: SerializableValue | undefined,
  field: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${field} for electrical device "${id}".`);
  }
  return value;
}

function readUnitInterval(
  id: string,
  value: SerializableValue | undefined,
  field: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`Invalid ${field} for electrical device "${id}".`);
  }
  return value;
}

function readRouteTarget(
  id: string,
  value: SerializableValue | undefined,
  field: string,
): 'start' | 'end' {
  if (value !== 'start' && value !== 'end') {
    throw new Error(`Invalid ${field} for electrical device "${id}".`);
  }
  return value;
}

function sphereIntersectsBox(
  position: ReadonlyVector3State,
  radius: number,
  box: THREE.Box3,
  scratchClosest: THREE.Vector3,
): boolean {
  scratchClosest.set(
    THREE.MathUtils.clamp(position.x, box.min.x, box.max.x),
    THREE.MathUtils.clamp(position.y, box.min.y, box.max.y),
    THREE.MathUtils.clamp(position.z, box.min.z, box.max.z),
  );
  const dx = position.x - scratchClosest.x;
  const dy = position.y - scratchClosest.y;
  const dz = position.z - scratchClosest.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

function disposeOwnedObject(root: THREE.Object3D): void {
  root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      for (const material of object.material) materials.add(material);
    } else {
      materials.add(object.material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}
