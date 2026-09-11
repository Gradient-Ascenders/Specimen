import * as THREE from 'three';

import type { ElectricalConnectionTarget } from '../abilities/ElectricalTargetRegistry.ts';
import { EventBus } from '../core/EventBus.ts';

export type ElectricalPowerMode = 'sustained' | 'latched';

export interface PoweredDeviceLocalSnapshot {
  readonly available: boolean;
  readonly latched: boolean;
}

export interface PoweredDeviceReadModel {
  readonly id: string;
  readonly displayName: string;
  readonly powerMode: ElectricalPowerMode;
  readonly compatible: true;
  readonly available: boolean;
  /** Direct Volt tether only; upstream supply is reported separately. */
  readonly connected: boolean;
  readonly powered: boolean;
  readonly latched: boolean;
  readonly blocked: boolean;
  readonly supplyCount: number;
}

interface MutablePoweredDeviceReadModel {
  id: string;
  displayName: string;
  powerMode: ElectricalPowerMode;
  compatible: true;
  available: boolean;
  connected: boolean;
  powered: boolean;
  latched: boolean;
  blocked: boolean;
  supplyCount: number;
}

export interface PoweredDeviceEvents {
  availabilityChanged: {
    readonly id: string;
    readonly available: boolean;
  };
  connectionChanged: {
    readonly id: string;
    readonly connected: boolean;
  };
  powerChanged: {
    readonly id: string;
    readonly powered: boolean;
  };
  latchChanged: {
    readonly id: string;
    readonly latched: boolean;
  };
  blockedChanged: {
    readonly id: string;
    readonly blocked: boolean;
  };
}

export interface PoweredDeviceCoreOptions {
  readonly id: string;
  readonly displayName: string;
  readonly hitMeshes: readonly THREE.Mesh[];
  readonly socketObject?: THREE.Object3D;
  readonly socketLocalPosition?: THREE.Vector3;
  readonly powerMode?: ElectricalPowerMode;
  readonly initialAvailable?: boolean;
  readonly initialLatched?: boolean;
}

/**
 * Shared electrical-device state authority.
 *
 * Direct Volt connection, upstream supply and authored latch are deliberately
 * separate inputs. Effective power is derived and never serialized as though a
 * live tether still existed.
 */
export class PoweredDeviceCore implements ElectricalConnectionTarget {
  readonly id: string;
  readonly displayName: string;
  readonly hitMeshes: readonly THREE.Mesh[];
  readonly events = new EventBus<PoweredDeviceEvents>();

  private readonly socketObject: THREE.Object3D;
  private readonly socketLocalPosition = new THREE.Vector3();
  private readonly powerModeValue: ElectricalPowerMode;
  private readonly initialAvailableValue: boolean;
  private readonly initialLatchedValue: boolean;
  private readonly supplySources = new Set<string>();
  private readonly readModelValue: MutablePoweredDeviceReadModel;

  private availableValue: boolean;
  private connectedValue = false;
  private poweredValue = false;
  private latchedValue: boolean;
  private blockedValue = false;
  private disposed = false;

  constructor(options: PoweredDeviceCoreOptions) {
    if (!options.id.trim()) throw new Error('Powered device ID must be non-empty.');
    if (!options.displayName.trim()) {
      throw new Error('Powered device display name must be non-empty.');
    }
    if (options.hitMeshes.length === 0) {
      throw new Error(`Powered device "${options.id}" requires target hit geometry.`);
    }

    this.id = options.id;
    this.displayName = options.displayName;
    this.hitMeshes = [...options.hitMeshes];
    this.socketObject = options.socketObject ?? this.hitMeshes[0]!;
    if (options.socketLocalPosition) {
      this.socketLocalPosition.copy(options.socketLocalPosition);
    }
    this.powerModeValue = options.powerMode ?? 'sustained';
    this.initialAvailableValue = options.initialAvailable ?? true;
    this.initialLatchedValue = options.initialLatched ?? false;
    if (
      this.powerModeValue === 'sustained' &&
      this.initialLatchedValue
    ) {
      throw new Error('Sustained devices cannot start latched.');
    }

    this.availableValue = this.initialAvailableValue;
    this.latchedValue = this.initialLatchedValue;
    this.readModelValue = {
      id: this.id,
      displayName: this.displayName,
      powerMode: this.powerModeValue,
      compatible: true,
      available: this.availableValue,
      connected: false,
      powered: false,
      latched: this.latchedValue,
      blocked: false,
      supplyCount: 0,
    };
    this.recomputePower();
  }

  get powerMode(): ElectricalPowerMode {
    return this.powerModeValue;
  }

  get readModel(): PoweredDeviceReadModel {
    return this.readModelValue;
  }

  copySocketWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    target.copy(this.socketLocalPosition);
    return this.socketObject.localToWorld(target);
  }

  isAvailable(): boolean {
    return !this.disposed && this.availableValue;
  }

  setConnectionState(connected: boolean): void {
    if (this.disposed) return;
    const nextConnected = connected && this.availableValue;
    if (this.connectedValue === nextConnected) return;

    this.connectedValue = nextConnected;
    this.readModelValue.connected = nextConnected;
    if (nextConnected) this.maybeLatch();
    this.events.emit('connectionChanged', {
      id: this.id,
      connected: nextConnected,
    });
    this.recomputePower();
  }

  setAvailable(available: boolean): void {
    if (this.disposed || this.availableValue === available) return;
    this.availableValue = available;
    this.readModelValue.available = available;
    this.events.emit('availabilityChanged', {
      id: this.id,
      available,
    });
    this.recomputePower();
  }

  /**
   * Set one upstream source without affecting any other supplier.
   * Duplicate writes are true no-ops.
   */
  setSupply(sourceId: string, supplied: boolean): void {
    if (this.disposed) return;
    if (!sourceId.trim()) throw new Error('Electrical supply source ID must be non-empty.');

    const hadSource = this.supplySources.has(sourceId);
    if (hadSource === supplied) return;
    if (supplied) {
      this.supplySources.add(sourceId);
      this.maybeLatch();
    } else {
      this.supplySources.delete(sourceId);
    }
    this.readModelValue.supplyCount = this.supplySources.size;
    this.recomputePower();
  }

  clearSupplies(): void {
    if (this.supplySources.size === 0) return;
    this.supplySources.clear();
    this.readModelValue.supplyCount = 0;
    this.recomputePower();
  }

  setBlocked(blocked: boolean): void {
    if (this.disposed || this.blockedValue === blocked) return;
    this.blockedValue = blocked;
    this.readModelValue.blocked = blocked;
    this.events.emit('blockedChanged', {
      id: this.id,
      blocked,
    });
  }

  captureLocalState(): PoweredDeviceLocalSnapshot {
    return {
      available: this.availableValue,
      latched: this.latchedValue,
    };
  }

  /**
   * Restore authored/checkpoint-local state. Live Volt connection and derived
   * upstream supply are always cleared and recomputed by the device network.
   */
  restoreLocalState(snapshot: PoweredDeviceLocalSnapshot): void {
    this.assertNotDisposed('restore powered device state');
    if (
      typeof snapshot.available !== 'boolean' ||
      typeof snapshot.latched !== 'boolean'
    ) {
      throw new Error(`Invalid snapshot for powered device "${this.id}".`);
    }
    if (this.powerModeValue === 'sustained' && snapshot.latched) {
      throw new Error(`Sustained device "${this.id}" cannot restore a latch.`);
    }

    const previousAvailable = this.availableValue;
    const previousConnected = this.connectedValue;
    const previousLatched = this.latchedValue;

    this.availableValue = snapshot.available;
    this.connectedValue = false;
    this.supplySources.clear();
    this.latchedValue =
      this.powerModeValue === 'latched' ? snapshot.latched : false;
    this.blockedValue = false;
    this.readModelValue.available = this.availableValue;
    this.readModelValue.connected = false;
    this.readModelValue.supplyCount = 0;
    this.readModelValue.latched = this.latchedValue;
    this.readModelValue.blocked = false;

    if (previousAvailable !== this.availableValue) {
      this.events.emit('availabilityChanged', {
        id: this.id,
        available: this.availableValue,
      });
    }
    if (previousConnected) {
      this.events.emit('connectionChanged', {
        id: this.id,
        connected: false,
      });
    }
    if (previousLatched !== this.latchedValue) {
      this.events.emit('latchChanged', {
        id: this.id,
        latched: this.latchedValue,
      });
    }
    this.recomputePower();
  }

  reset(): void {
    if (this.disposed) return;
    this.restoreLocalState({
      available: this.initialAvailableValue,
      latched: this.initialLatchedValue,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.connectedValue = false;
    this.supplySources.clear();
    this.latchedValue = false;
    this.blockedValue = false;
    this.readModelValue.connected = false;
    this.readModelValue.supplyCount = 0;
    this.readModelValue.latched = false;
    this.readModelValue.blocked = false;
    this.recomputePower();
    this.events.clear();
    this.disposed = true;
  }

  private maybeLatch(): void {
    if (
      this.powerModeValue !== 'latched' ||
      this.latchedValue
    ) {
      return;
    }
    this.latchedValue = true;
    this.readModelValue.latched = true;
    this.events.emit('latchChanged', {
      id: this.id,
      latched: true,
    });
  }

  private recomputePower(): void {
    const hasLiveInput =
      this.connectedValue || this.supplySources.size > 0;
    const nextPowered =
      !this.disposed &&
      this.availableValue &&
      (hasLiveInput ||
        (this.powerModeValue === 'latched' && this.latchedValue));

    if (this.poweredValue === nextPowered) return;
    this.poweredValue = nextPowered;
    this.readModelValue.powered = nextPowered;
    this.events.emit('powerChanged', {
      id: this.id,
      powered: nextPowered,
    });
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after powered device disposal.`);
    }
  }
}
