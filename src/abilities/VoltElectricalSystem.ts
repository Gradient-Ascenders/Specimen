import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import {
  CollisionHit,
  CollisionLayer,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type {
  ElectricalTargetRegistration,
  ElectricalTargetRegistry,
} from './ElectricalTargetRegistry.ts';

const DISTANCE_EPSILON = 1e-6;

export interface VoltElectricalConfig {
  readonly acquisitionRangeMetres: number;
  readonly instabilityWarningRangeMetres: number;
  readonly tetherBreakRangeMetres: number;
}

export const DEFAULT_VOLT_ELECTRICAL_CONFIG: Readonly<VoltElectricalConfig> = {
  acquisitionRangeMetres: 15,
  instabilityWarningRangeMetres: 16,
  tetherBreakRangeMetres: 20,
};

export type VoltDisconnectReason =
  | 'intentional'
  | 'target-invalid'
  | 'target-removed'
  | 'range-exceeded'
  | 'death'
  | 'reset'
  | 'restart'
  | 'merge'
  | 'completion'
  | 'unload';

export type VoltBeamMode = 'none' | 'search' | 'connected';

export interface VoltElectricalControls {
  readonly aimHeld: boolean;
  readonly fireHeld: boolean;
  readonly firePressed: boolean;
  readonly gameplayInputEnabled: boolean;
  readonly pointerLocked: boolean;
}

export interface VoltElectricalBody {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMetres: number;
}

export interface VoltElectricalSlimeManager<Body extends VoltElectricalBody> {
  readonly activeSlimeId: string | undefined;
  getBody(id: 'volt'): Body | undefined;
  canActiveUseAbility(ability: 'electrical'): boolean;
}

export interface VoltAimRayProvider {
  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void;
}

export interface VoltElectricalReadModel {
  readonly aimActive: boolean;
  readonly searching: boolean;
  readonly selectedTargetId: string | undefined;
  readonly selectedTargetName: string | undefined;
  readonly selectedTargetValid: boolean;
  readonly connectedTargetId: string | undefined;
  readonly connectedTargetName: string | undefined;
  readonly connectionUnstable: boolean;
  readonly tetherDistanceMetres: number;
  readonly acquisitionRangeMetres: number;
  readonly instabilityWarningRangeMetres: number;
  readonly tetherBreakRangeMetres: number;
  readonly beamMode: VoltBeamMode;
  readonly beamStart: ReadonlyVectorState;
  readonly beamEnd: ReadonlyVectorState;
  readonly aimPoint: ReadonlyVectorState;
}

interface MutableVoltElectricalReadModel {
  aimActive: boolean;
  searching: boolean;
  selectedTargetId: string | undefined;
  selectedTargetName: string | undefined;
  selectedTargetValid: boolean;
  connectedTargetId: string | undefined;
  connectedTargetName: string | undefined;
  connectionUnstable: boolean;
  tetherDistanceMetres: number;
  readonly acquisitionRangeMetres: number;
  readonly instabilityWarningRangeMetres: number;
  readonly tetherBreakRangeMetres: number;
  beamMode: VoltBeamMode;
  readonly beamStart: MutableVectorState;
  readonly beamEnd: MutableVectorState;
  readonly aimPoint: MutableVectorState;
}

export interface ReadonlyVectorState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface MutableVectorState {
  x: number;
  y: number;
  z: number;
}

export interface VoltElectricalEvents {
  aimStarted: Record<string, never>;
  aimStopped: Record<string, never>;
  searchStarted: Record<string, never>;
  searchStopped: Record<string, never>;
  connected: {
    readonly targetId: string;
    readonly targetName: string;
  };
  disconnected: {
    readonly targetId: string;
    readonly reason: VoltDisconnectReason;
  };
  instabilityChanged: {
    readonly targetId: string;
    readonly unstable: boolean;
    readonly distanceMetres: number;
  };
}

export interface VoltElectricalSystemOptions<Body extends VoltElectricalBody> {
  readonly slimeManager: VoltElectricalSlimeManager<Body>;
  readonly collisionWorld: CollisionWorld;
  readonly targetRegistry: ElectricalTargetRegistry;
  readonly aimRayProvider: VoltAimRayProvider;
  readonly config?: Partial<VoltElectricalConfig>;
}

/**
 * Authoritative Volt aim/search/connection state.
 *
 * Acquisition performs camera selection plus a separate Volt-body LOS check.
 * Once a target is latched, obstruction and camera motion are intentionally
 * ignored; only explicit disconnect, invalidation/removal, reset/death, or
 * range can break the tether.
 */
export class VoltElectricalSystem<Body extends VoltElectricalBody> {
  readonly events = new EventBus<VoltElectricalEvents>();

  private readonly slimeManager: VoltElectricalSlimeManager<Body>;
  private readonly collisionWorld: CollisionWorld;
  private readonly targetRegistry: ElectricalTargetRegistry;
  private readonly aimRayProvider: VoltAimRayProvider;
  private readonly config: VoltElectricalConfig;
  private readonly readModelValue: MutableVoltElectricalReadModel;
  private readonly unsubscribeTargetRemoved: () => void;

  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3(0, 0, -1);
  private readonly voltPosition = new THREE.Vector3();
  private readonly socketPosition = new THREE.Vector3();
  private readonly bodyToSocketDirection = new THREE.Vector3();
  private readonly aimRangePoint = new THREE.Vector3();
  private readonly searchBeamEnd = new THREE.Vector3();
  private readonly searchBeamDirection = new THREE.Vector3();
  private readonly targetHit = new CollisionHit();
  private readonly worldHit = new CollisionHit();
  private readonly bodyLineOfSightHit = new CollisionHit();
  private readonly searchBeamHit = new CollisionHit();

  private connectedRegistration: ElectricalTargetRegistration | undefined;
  private selectedRegistration: ElectricalTargetRegistration | undefined;
  private fireRequiresRelease = false;
  private disposed = false;

  constructor(options: VoltElectricalSystemOptions<Body>) {
    this.slimeManager = options.slimeManager;
    this.collisionWorld = options.collisionWorld;
    this.targetRegistry = options.targetRegistry;
    this.aimRayProvider = options.aimRayProvider;
    this.config = {
      ...DEFAULT_VOLT_ELECTRICAL_CONFIG,
      ...options.config,
    };
    this.validateConfig();

    this.readModelValue = {
      aimActive: false,
      searching: false,
      selectedTargetId: undefined,
      selectedTargetName: undefined,
      selectedTargetValid: false,
      connectedTargetId: undefined,
      connectedTargetName: undefined,
      connectionUnstable: false,
      tetherDistanceMetres: 0,
      acquisitionRangeMetres: this.config.acquisitionRangeMetres,
      instabilityWarningRangeMetres: this.config.instabilityWarningRangeMetres,
      tetherBreakRangeMetres: this.config.tetherBreakRangeMetres,
      beamMode: 'none',
      beamStart: createVectorState(),
      beamEnd: createVectorState(),
      aimPoint: createVectorState(),
    };

    this.unsubscribeTargetRemoved = this.targetRegistry.events.on(
      'unregistered',
      ({ registration }) => {
        if (this.connectedRegistration === registration) {
          this.disconnect('target-removed');
        }
        if (this.selectedRegistration === registration) {
          this.clearSelection();
        }
      },
    );
  }

  get readModel(): VoltElectricalReadModel {
    return this.readModelValue;
  }

  get connected(): boolean {
    return this.connectedRegistration !== undefined;
  }

  update(
    deltaSeconds: number,
    controls: VoltElectricalControls,
  ): void {
    this.assertNotDisposed('update Volt electrical state');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'VoltElectricalSystem deltaSeconds must be positive and finite.',
      );
    }

    if (!controls.fireHeld && this.fireRequiresRelease) {
      this.fireRequiresRelease = false;
    }

    this.maintainConnection();

    const activeVolt =
      controls.gameplayInputEnabled &&
      this.slimeManager.activeSlimeId === 'volt' &&
      this.slimeManager.canActiveUseAbility('electrical');
    const canAim = activeVolt && controls.pointerLocked && controls.aimHeld;

    this.setAimActive(canAim);

    if (this.connectedRegistration) {
      this.setSearching(false);
      this.clearSelection();

      // A fresh LMB press disconnects while controlling Volt even without RMB.
      if (
        activeVolt &&
        controls.firePressed &&
        !this.fireRequiresRelease
      ) {
        this.disconnect('intentional');
        this.fireRequiresRelease = true;
      }
      return;
    }

    if (!canAim) {
      this.setSearching(false);
      this.clearSelection();
      this.setBeamNone();
      return;
    }

    this.updateAimSelection();

    const searching =
      controls.fireHeld &&
      !this.fireRequiresRelease;
    this.setSearching(searching);
    this.readModelValue.beamMode = searching ? 'search' : 'none';
    this.writeVoltBeamStart();
    writeVectorState(this.readModelValue.beamEnd, this.searchBeamEnd);

    if (
      searching &&
      this.readModelValue.selectedTargetValid &&
      this.selectedRegistration
    ) {
      this.connect(this.selectedRegistration);
      // The press/hold that acquired the target can never also disconnect it.
      this.fireRequiresRelease = true;
    }
  }

  /** Cancel transient aim/search while preserving an established tether. */
  cancelAim(): void {
    if (this.disposed) return;
    this.setAimActive(false);
    this.setSearching(false);
    this.clearSelection();
    if (!this.connectedRegistration) this.setBeamNone();
  }

  disconnect(reason: VoltDisconnectReason): boolean {
    if (this.disposed && reason !== 'unload') return false;
    const registration = this.connectedRegistration;
    if (!registration) return false;

    const target = registration.target;
    this.connectedRegistration = undefined;
    target.setConnectionState(false);
    this.readModelValue.connectedTargetId = undefined;
    this.readModelValue.connectedTargetName = undefined;
    this.readModelValue.connectionUnstable = false;
    this.readModelValue.tetherDistanceMetres = 0;
    this.fireRequiresRelease = true;
    if (!this.readModelValue.searching) this.setBeamNone();
    this.events.emit('disconnected', {
      targetId: target.id,
      reason,
    });
    return true;
  }

  /**
   * Reset transient input state and ensure checkpoint snapshots never
   * resurrect a live tether.
   */
  reset(reason: Extract<VoltDisconnectReason, 'death' | 'reset' | 'restart'> = 'reset'): void {
    this.assertNotDisposed('reset Volt electrical state');
    this.disconnect(reason);
    this.cancelAim();
    this.fireRequiresRelease = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelAim();
    this.disconnect('unload');
    this.unsubscribeTargetRemoved();
    this.events.clear();
    this.disposed = true;
  }

  private maintainConnection(): void {
    const registration = this.connectedRegistration;
    if (!registration) return;

    if (!this.targetRegistry.isRegistered(registration)) {
      this.disconnect('target-removed');
      return;
    }
    const target = registration.target;
    if (!target.isAvailable()) {
      this.disconnect('target-invalid');
      return;
    }

    const voltBody = this.slimeManager.getBody('volt');
    if (!voltBody) {
      this.disconnect('target-invalid');
      return;
    }

    readVector(voltBody.position, this.voltPosition);
    target.copySocketWorldPosition(this.socketPosition);
    const distance = this.voltPosition.distanceTo(this.socketPosition);
    if (distance > this.config.tetherBreakRangeMetres) {
      this.disconnect('range-exceeded');
      return;
    }

    const unstable =
      distance >= this.config.instabilityWarningRangeMetres;
    if (unstable !== this.readModelValue.connectionUnstable) {
      this.readModelValue.connectionUnstable = unstable;
      this.events.emit('instabilityChanged', {
        targetId: target.id,
        unstable,
        distanceMetres: distance,
      });
    }

    this.readModelValue.tetherDistanceMetres = distance;
    this.readModelValue.connectedTargetId = target.id;
    this.readModelValue.connectedTargetName = target.displayName;
    this.readModelValue.beamMode = 'connected';
    writeVectorState(this.readModelValue.beamStart, this.voltPosition);
    writeVectorState(this.readModelValue.beamEnd, this.socketPosition);
  }

  private updateAimSelection(): void {
    const voltBody = this.slimeManager.getBody('volt');
    if (!voltBody) {
      this.clearSelection();
      this.setBeamNone();
      return;
    }

    readVector(voltBody.position, this.voltPosition);
    this.aimRayProvider.copyAimRay(this.aimOrigin, this.aimDirection);
    if (this.aimDirection.lengthSq() <= DISTANCE_EPSILON) {
      this.aimDirection.set(0, 0, -1);
    } else {
      this.aimDirection.normalize();
    }

    const rayDistance = this.config.tetherBreakRangeMetres;
    const hasTargetHit = this.collisionWorld.raycast(
      this.aimOrigin,
      this.aimDirection,
      rayDistance,
      this.targetHit,
      CollisionLayer.ElectricalTarget,
    );
    const hasWorldHit = this.collisionWorld.raycast(
      this.aimOrigin,
      this.aimDirection,
      rayDistance,
      this.worldHit,
      CollisionLayer.LineOfSight,
    );

    const targetVisible =
      hasTargetHit &&
      (!hasWorldHit ||
        this.targetHit.distance <= this.worldHit.distance + DISTANCE_EPSILON);

    if (targetVisible) {
      this.aimRangePoint.copy(this.targetHit.point);
    } else if (hasWorldHit) {
      this.aimRangePoint.copy(this.worldHit.point);
    } else {
      this.aimRangePoint
        .copy(this.aimDirection)
        .multiplyScalar(rayDistance)
        .add(this.aimOrigin);
    }
    writeVectorState(this.readModelValue.aimPoint, this.aimRangePoint);
    this.resolveSearchBeamEnd();

    const registration =
      targetVisible && this.targetHit.object
        ? this.targetRegistry.getRegistrationForMesh(this.targetHit.object)
        : undefined;
    if (!registration) {
      this.clearSelection();
      return;
    }

    const target = registration.target;
    target.copySocketWorldPosition(this.socketPosition);
    const distanceFromVolt = this.voltPosition.distanceTo(this.socketPosition);
    const available = target.isAvailable();
    const inRange =
      distanceFromVolt <= this.config.acquisitionRangeMetres;
    const unobstructed =
      available &&
      inRange &&
      this.hasInitialLineOfSight(this.voltPosition, this.socketPosition);

    this.selectedRegistration = registration;
    this.readModelValue.selectedTargetId = target.id;
    this.readModelValue.selectedTargetName = target.displayName;
    this.readModelValue.selectedTargetValid = unobstructed;
  }

  private resolveSearchBeamEnd(): void {
    this.searchBeamDirection.subVectors(this.aimRangePoint, this.voltPosition);
    const distance = this.searchBeamDirection.length();
    if (distance <= DISTANCE_EPSILON) {
      this.searchBeamEnd.copy(this.voltPosition);
      return;
    }

    this.searchBeamDirection.multiplyScalar(1 / distance);
    const blocked = this.collisionWorld.raycast(
      this.voltPosition,
      this.searchBeamDirection,
      distance,
      this.searchBeamHit,
      CollisionLayer.LineOfSight,
    );
    if (
      blocked &&
      this.searchBeamHit.distance + DISTANCE_EPSILON < distance
    ) {
      this.searchBeamEnd.copy(this.searchBeamHit.point);
    } else {
      this.searchBeamEnd.copy(this.aimRangePoint);
    }
  }

  private hasInitialLineOfSight(
    origin: THREE.Vector3,
    socket: THREE.Vector3,
  ): boolean {
    this.bodyToSocketDirection.subVectors(socket, origin);
    const distance = this.bodyToSocketDirection.length();
    if (distance <= DISTANCE_EPSILON) return true;

    this.bodyToSocketDirection.multiplyScalar(1 / distance);
    const blocked = this.collisionWorld.raycast(
      origin,
      this.bodyToSocketDirection,
      distance,
      this.bodyLineOfSightHit,
      CollisionLayer.LineOfSight,
    );
    return (
      !blocked ||
      this.bodyLineOfSightHit.distance + DISTANCE_EPSILON >= distance
    );
  }

  private connect(registration: ElectricalTargetRegistration): void {
    if (
      this.connectedRegistration ||
      !this.targetRegistry.isRegistered(registration) ||
      !registration.target.isAvailable()
    ) {
      return;
    }

    const target = registration.target;
    const voltBody = this.slimeManager.getBody('volt');
    if (!voltBody) return;

    readVector(voltBody.position, this.voltPosition);
    target.copySocketWorldPosition(this.socketPosition);
    const distance = this.voltPosition.distanceTo(this.socketPosition);
    if (distance > this.config.acquisitionRangeMetres) return;

    this.connectedRegistration = registration;
    target.setConnectionState(true);
    this.readModelValue.connectedTargetId = target.id;
    this.readModelValue.connectedTargetName = target.displayName;
    this.readModelValue.tetherDistanceMetres = distance;
    this.readModelValue.connectionUnstable =
      distance >= this.config.instabilityWarningRangeMetres;
    this.readModelValue.beamMode = 'connected';
    writeVectorState(this.readModelValue.beamStart, this.voltPosition);
    writeVectorState(this.readModelValue.beamEnd, this.socketPosition);
    this.setSearching(false);
    this.clearSelection();
    this.events.emit('connected', {
      targetId: target.id,
      targetName: target.displayName,
    });
    if (this.readModelValue.connectionUnstable) {
      this.events.emit('instabilityChanged', {
        targetId: target.id,
        unstable: true,
        distanceMetres: distance,
      });
    }
  }

  private setAimActive(active: boolean): void {
    if (this.readModelValue.aimActive === active) return;
    this.readModelValue.aimActive = active;
    this.events.emit(active ? 'aimStarted' : 'aimStopped', {});
  }

  private setSearching(searching: boolean): void {
    if (this.readModelValue.searching === searching) return;
    this.readModelValue.searching = searching;
    this.events.emit(searching ? 'searchStarted' : 'searchStopped', {});
  }

  private clearSelection(): void {
    this.selectedRegistration = undefined;
    this.readModelValue.selectedTargetId = undefined;
    this.readModelValue.selectedTargetName = undefined;
    this.readModelValue.selectedTargetValid = false;
  }

  private setBeamNone(): void {
    this.readModelValue.beamMode = 'none';
    writeVectorState(this.readModelValue.beamStart, this.voltPosition);
    writeVectorState(this.readModelValue.beamEnd, this.voltPosition);
  }

  private writeVoltBeamStart(): void {
    const voltBody = this.slimeManager.getBody('volt');
    if (voltBody) readVector(voltBody.position, this.voltPosition);
    writeVectorState(this.readModelValue.beamStart, this.voltPosition);
  }

  private validateConfig(): void {
    const {
      acquisitionRangeMetres,
      instabilityWarningRangeMetres,
      tetherBreakRangeMetres,
    } = this.config;
    if (
      !Number.isFinite(acquisitionRangeMetres) ||
      acquisitionRangeMetres <= 0 ||
      !Number.isFinite(instabilityWarningRangeMetres) ||
      instabilityWarningRangeMetres < acquisitionRangeMetres ||
      !Number.isFinite(tetherBreakRangeMetres) ||
      tetherBreakRangeMetres < instabilityWarningRangeMetres
    ) {
      throw new Error(
        'Volt electrical ranges must be finite and ordered acquisition <= warning <= break.',
      );
    }
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after VoltElectricalSystem disposal.`);
    }
  }
}

function createVectorState(
  x = 0,
  y = 0,
  z = 0,
): MutableVectorState {
  return { x, y, z };
}

function writeVectorState(
  target: MutableVectorState,
  source: { readonly x: number; readonly y: number; readonly z: number },
): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function readVector(
  source: { readonly x: number; readonly y: number; readonly z: number },
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.set(source.x, source.y, source.z);
}
