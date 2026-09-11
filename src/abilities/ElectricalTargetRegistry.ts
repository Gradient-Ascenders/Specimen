import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import {
  ColliderTransformMode,
  CollisionLayer,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';

export interface ElectricalConnectionTarget {
  readonly id: string;
  readonly displayName: string;
  /**
   * Dedicated targeting geometry. These meshes are registered on the
   * ElectricalTarget query layer by the registry and should not double as
   * movement colliders.
   */
  readonly hitMeshes: readonly THREE.Mesh[];
  copySocketWorldPosition(target: THREE.Vector3): THREE.Vector3;
  isAvailable(): boolean;
  /** Device implementations must make this operation idempotent. */
  setConnectionState(connected: boolean): void;
}

export interface ElectricalTargetRegistration {
  readonly serial: number;
  readonly target: ElectricalConnectionTarget;
}

export interface ElectricalTargetRegistryEvents {
  registered: { readonly registration: ElectricalTargetRegistration };
  unregistered: { readonly registration: ElectricalTargetRegistration };
}

interface MutableRegistration extends ElectricalTargetRegistration {
  readonly hitMeshes: readonly THREE.Mesh[];
  active: boolean;
}

export interface ElectricalTargetRegistrationOptions {
  readonly transformMode?: ColliderTransformMode;
}

/**
 * Level-owned electrical compatibility registry.
 *
 * Electrical compatibility is explicit authored data rather than a material,
 * colour, mesh-name, or soluble-metadata convention. Registration identity is
 * stronger than target.id so removing a target and later reusing the same ID
 * cannot silently inherit an old Volt tether.
 */
export class ElectricalTargetRegistry {
  readonly events = new EventBus<ElectricalTargetRegistryEvents>();

  private readonly collisionWorld: CollisionWorld;
  private readonly registrationsById = new Map<string, MutableRegistration>();
  private readonly registrationsByMesh = new Map<THREE.Mesh, MutableRegistration>();
  private readonly registrations = new Set<MutableRegistration>();
  private nextSerial = 1;
  private disposed = false;

  constructor(collisionWorld: CollisionWorld) {
    this.collisionWorld = collisionWorld;
  }

  get size(): number {
    return this.registrations.size;
  }

  register(
    target: ElectricalConnectionTarget,
    options: ElectricalTargetRegistrationOptions = {},
  ): () => void {
    this.assertNotDisposed('register electrical targets');
    if (!target.id.trim()) throw new Error('Electrical target ID must be non-empty.');
    if (!target.displayName.trim()) {
      throw new Error('Electrical target display name must be non-empty.');
    }
    if (target.hitMeshes.length === 0) {
      throw new Error(`Electrical target "${target.id}" requires at least one hit mesh.`);
    }
    if (this.registrationsById.has(target.id)) {
      throw new Error(`Duplicate electrical target ID "${target.id}".`);
    }
    for (const mesh of target.hitMeshes) {
      if (this.registrationsByMesh.has(mesh)) {
        throw new Error(
          `Electrical target mesh "${mesh.name || '<unnamed>'}" is already registered.`,
        );
      }
    }

    const registration: MutableRegistration = {
      serial: this.nextSerial++,
      target,
      hitMeshes: [...target.hitMeshes],
      active: true,
    };
    const transformMode = options.transformMode ?? ColliderTransformMode.Dynamic;
    const attached: THREE.Mesh[] = [];

    try {
      for (const mesh of registration.hitMeshes) {
        this.collisionWorld.register(
          mesh,
          CollisionLayer.ElectricalTarget,
          transformMode,
        );
        attached.push(mesh);
      }
      this.registrations.add(registration);
      this.registrationsById.set(target.id, registration);
      for (const mesh of registration.hitMeshes) {
        this.registrationsByMesh.set(mesh, registration);
      }
      this.events.emit('registered', { registration });
    } catch (error) {
      for (const mesh of attached) this.collisionWorld.unregister(mesh);
      throw error;
    }

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      this.unregister(registration);
    };
  }

  getRegistrationForMesh(
    mesh: THREE.Mesh,
  ): ElectricalTargetRegistration | undefined {
    this.assertNotDisposed('query electrical target meshes');
    return this.registrationsByMesh.get(mesh);
  }

  isRegistered(registration: ElectricalTargetRegistration): boolean {
    if (this.disposed) return false;
    const mutable = registration as MutableRegistration;
    return mutable.active && this.registrations.has(mutable);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const registration of [...this.registrations]) {
      this.unregister(registration);
    }
    this.events.clear();
    this.disposed = true;
  }

  private unregister(registration: MutableRegistration): void {
    if (!registration.active) return;
    registration.active = false;

    // Emit while the authored target object is still reachable. Systems that
    // own a live connection can disconnect it synchronously before the target
    // geometry and registry mappings disappear.
    this.events.emit('unregistered', { registration });

    this.registrations.delete(registration);
    if (this.registrationsById.get(registration.target.id) === registration) {
      this.registrationsById.delete(registration.target.id);
    }
    for (const mesh of registration.hitMeshes) {
      if (this.registrationsByMesh.get(mesh) === registration) {
        this.registrationsByMesh.delete(mesh);
      }
      this.collisionWorld.unregister(mesh);
    }
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after ElectricalTargetRegistry disposal.`);
    }
  }
}
