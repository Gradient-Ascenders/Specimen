import type { ElectricalTargetRegistry } from '../abilities/ElectricalTargetRegistry.ts';
import type { BlackoutCheckpointParticipant } from '../levels/BlackoutCheckpointManager.ts';
import type { SerializableValue } from '../levels/BlackoutRuntimeState.ts';
import type { ResettablePuzzleComponent } from '../puzzle/PuzzleRegistry.ts';
import type {
  ElectricalDevice,
  PoweredCarrierBody,
} from './PoweredDevices.ts';

interface RegisteredDevice {
  readonly device: ElectricalDevice;
  readonly unregisterTarget: () => void;
}

interface DeviceCollectionSnapshot {
  readonly devices: Readonly<Record<string, SerializableValue>>;
}

/**
 * Level-owned deterministic electrical graph and checkpoint participant.
 *
 * Device-local state is restored for every node before upstream supply is
 * recomputed once, avoiding registration-order-dependent powered results.
 */
export class ElectricalDeviceCollection
implements ResettablePuzzleComponent, BlackoutCheckpointParticipant {
  readonly id = 'blackout-powered-devices';

  private readonly targetRegistry: ElectricalTargetRegistry;
  private readonly registrations = new Map<string, RegisteredDevice>();
  private readonly deviceOrder: ElectricalDevice[] = [];
  private readonly outgoing = new Map<string, string[]>();
  private topologicalOrder: ElectricalDevice[] = [];
  private disposed = false;

  constructor(targetRegistry: ElectricalTargetRegistry) {
    this.targetRegistry = targetRegistry;
  }

  get size(): number {
    return this.deviceOrder.length;
  }

  get devices(): readonly ElectricalDevice[] {
    return this.deviceOrder;
  }

  addDevice(device: ElectricalDevice): void {
    this.assertNotDisposed('add devices');
    if (!device.id.trim()) throw new Error('Electrical device IDs must be non-empty.');
    if (this.registrations.has(device.id)) {
      throw new Error(`Duplicate electrical device ID "${device.id}".`);
    }

    const unregisterTarget = this.targetRegistry.register(device.core, {
      transformMode: device.targetTransformMode,
    });
    this.registrations.set(device.id, {
      device,
      unregisterTarget,
    });
    this.deviceOrder.push(device);
    this.outgoing.set(device.id, []);
    this.rebuildTopologicalOrder();
    this.recomputePower();
  }

  removeDevice(id: string): boolean {
    this.assertNotDisposed('remove devices');
    const registration = this.registrations.get(id);
    if (!registration) return false;

    registration.unregisterTarget();

    // Remove this source's contribution before deleting its outgoing links.
    for (const recipientId of this.outgoing.get(id) ?? []) {
      this.registrations.get(recipientId)?.device.core.setSupply(id, false);
    }

    this.registrations.delete(id);
    const orderIndex = this.deviceOrder.indexOf(registration.device);
    if (orderIndex >= 0) this.deviceOrder.splice(orderIndex, 1);
    this.outgoing.delete(id);
    for (const recipients of this.outgoing.values()) {
      let index = recipients.indexOf(id);
      while (index >= 0) {
        recipients.splice(index, 1);
        index = recipients.indexOf(id);
      }
    }
    registration.device.dispose();
    this.rebuildTopologicalOrder();
    this.recomputePower();
    return true;
  }

  addSupplyLink(sourceId: string, recipientId: string): void {
    this.assertNotDisposed('wire electrical devices');
    const source = this.requireDevice(sourceId);
    this.requireDevice(recipientId);
    if (!source.canSupply) {
      throw new Error(
        `Electrical device "${sourceId}" cannot supply downstream devices.`,
      );
    }
    if (sourceId === recipientId) {
      throw new Error('Electrical supply graph cannot contain self-links.');
    }

    const recipients = this.outgoing.get(sourceId)!;
    if (recipients.includes(recipientId)) return;
    recipients.push(recipientId);

    try {
      this.rebuildTopologicalOrder();
    } catch (error) {
      recipients.pop();
      this.rebuildTopologicalOrder();
      throw error;
    }
    this.recomputePower();
  }

  removeSupplyLink(sourceId: string, recipientId: string): boolean {
    this.assertNotDisposed('unwire electrical devices');
    const recipients = this.outgoing.get(sourceId);
    if (!recipients) return false;
    const index = recipients.indexOf(recipientId);
    if (index < 0) return false;

    recipients.splice(index, 1);
    this.registrations
      .get(recipientId)
      ?.device.core.setSupply(sourceId, false);
    this.rebuildTopologicalOrder();
    this.recomputePower();
    return true;
  }

  getDevice<T extends ElectricalDevice = ElectricalDevice>(
    id: string,
  ): T | undefined {
    return this.registrations.get(id)?.device as T | undefined;
  }

  recomputePower(): void {
    if (this.disposed) return;

    // Topological order guarantees an upstream node has already had every one
    // of its own supplies refreshed before its output is copied downstream.
    // Diffing each stable source ID avoids false off/on transitions on every
    // fixed-step recompute.
    for (const source of this.topologicalOrder) {
      const supplied = source.canSupply && source.core.readModel.powered;
      const recipients = this.outgoing.get(source.id) ?? [];
      for (const recipientId of recipients) {
        this.requireDevice(recipientId).core.setSupply(
          source.id,
          supplied,
        );
      }
    }

    for (const device of this.deviceOrder) {
      device.syncPowerOutputs();
    }
  }

  updateMechanics(
    deltaSeconds: number,
    bodies: readonly PoweredCarrierBody[],
  ): void {
    if (this.disposed) return;
    for (const device of this.deviceOrder) {
      device.updateMechanics(deltaSeconds, bodies);
    }
  }

  capture(): SerializableValue {
    const devices: Record<string, SerializableValue> = {};
    for (const device of this.deviceOrder) {
      devices[device.id] = cloneSerializable(device.captureState());
    }
    return { devices };
  }

  restore(state: SerializableValue): void {
    this.assertNotDisposed('restore electrical devices');
    const snapshot = readCollectionSnapshot(state);

    // Local state first. No device is allowed to observe a partially restored
    // upstream network.
    for (const device of this.deviceOrder) {
      const deviceState = snapshot.devices[device.id];
      if (deviceState === undefined) {
        throw new Error(
          `Electrical checkpoint is missing device "${device.id}".`,
        );
      }
      device.restoreState(cloneSerializable(deviceState));
    }

    this.recomputePower();
  }

  resetTransient(): void {
    // Live Volt tether cleanup belongs to VoltElectricalSystem and happens
    // before PuzzleRegistry.reset(). Upstream supply is derived and rebuilt by
    // reset/restore, so there is no transient object to tear down here.
  }

  reset(): void {
    if (this.disposed) return;
    for (const device of this.deviceOrder) device.reset();
    this.recomputePower();
  }

  dispose(): void {
    if (this.disposed) return;

    // Unregister targeting first so an attached Volt tether receives target
    // removal while the concrete device is still alive.
    for (const device of [...this.deviceOrder]) {
      const registration = this.registrations.get(device.id);
      registration?.unregisterTarget();
    }
    for (const device of [...this.deviceOrder].reverse()) {
      device.dispose();
    }

    this.registrations.clear();
    this.deviceOrder.length = 0;
    this.outgoing.clear();
    this.topologicalOrder = [];
    this.disposed = true;
  }

  private rebuildTopologicalOrder(): void {
    const indegree = new Map<string, number>();
    for (const device of this.deviceOrder) indegree.set(device.id, 0);
    for (const recipients of this.outgoing.values()) {
      for (const recipientId of recipients) {
        indegree.set(recipientId, (indegree.get(recipientId) ?? 0) + 1);
      }
    }

    const queue: ElectricalDevice[] = [];
    for (const device of this.deviceOrder) {
      if ((indegree.get(device.id) ?? 0) === 0) queue.push(device);
    }

    const ordered: ElectricalDevice[] = [];
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const device = queue[queueIndex++]!;
      ordered.push(device);
      for (const recipientId of this.outgoing.get(device.id) ?? []) {
        const nextDegree = (indegree.get(recipientId) ?? 0) - 1;
        indegree.set(recipientId, nextDegree);
        if (nextDegree === 0) {
          queue.push(this.requireDevice(recipientId));
        }
      }
    }

    if (ordered.length !== this.deviceOrder.length) {
      throw new Error('Electrical supply graph must be acyclic.');
    }
    this.topologicalOrder = ordered;
  }

  private requireDevice(id: string): ElectricalDevice {
    const device = this.registrations.get(id)?.device;
    if (!device) throw new Error(`Unknown electrical device "${id}".`);
    return device;
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after electrical device collection disposal.`);
    }
  }
}

function readCollectionSnapshot(
  value: SerializableValue,
): DeviceCollectionSnapshot {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Invalid electrical device collection snapshot.');
  }
  const devices = (
    value as Readonly<Record<string, SerializableValue>>
  ).devices;
  if (!devices || Array.isArray(devices) || typeof devices !== 'object') {
    throw new Error('Electrical device collection snapshot is missing devices.');
  }
  return {
    devices: devices as Readonly<Record<string, SerializableValue>>,
  };
}

function cloneSerializable(value: SerializableValue): SerializableValue {
  if (Array.isArray(value)) return value.map(cloneSerializable);
  if (value !== null && typeof value === 'object') {
    const clone: Record<string, SerializableValue> = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = cloneSerializable(child as SerializableValue);
    }
    return clone;
  }
  return value;
}
