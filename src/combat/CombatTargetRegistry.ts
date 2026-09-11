import * as THREE from 'three';

import {
  ColliderTransformMode,
  CollisionLayer,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';

export type CombatImpactKind = 'direct' | 'splash';

export interface CombatVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CombatImpact {
  readonly projectileId: number;
  readonly targetId: string;
  readonly kind: CombatImpactKind;
  readonly chargeAmount: number;
  readonly fullyCharged: boolean;
  readonly damageUnits: number;
  readonly point: CombatVector3;
  readonly direction: CombatVector3;
}

export type CombatImpactRejectionReason =
  | 'inactive'
  | 'armour'
  | 'weak-point-closed'
  | 'splash-not-allowed'
  | 'charge-required'
  | 'invulnerable';

export interface CombatImpactResult {
  readonly accepted: boolean;
  readonly destroyed: boolean;
  readonly rejectionReason?: CombatImpactRejectionReason;
}

export interface CombatTarget {
  readonly id: string;
  readonly hitMeshes: readonly THREE.Mesh[];
  isCombatActive(): boolean;
  copySplashWorldPosition(target: THREE.Vector3): THREE.Vector3;
  applyImpact(impact: CombatImpact): CombatImpactResult;
}

export interface CombatTargetRegistration {
  readonly target: CombatTarget;
  readonly order: number;
}

interface MutableRegistration extends CombatTargetRegistration {
  active: boolean;
  readonly collisionOwnedMeshes: readonly THREE.Mesh[];
}

export interface CombatTargetRegistrationOptions {
  /**
   * Register dedicated combat-only hit geometry on the Projectile layer.
   * Existing world/drone colliders should leave this false and keep their
   * current collision owner.
   */
  readonly registerCollision?: boolean;
  readonly transformMode?: ColliderTransformMode;
}

/**
 * Explicit combat eligibility registry.
 *
 * Appearance, dissolve flags, electrical compatibility and mesh names never
 * imply combat vulnerability. Registration object identity prevents a removed
 * target and a later target reusing the same authored ID from being treated as
 * the same live registration.
 */
export class CombatTargetRegistry {
  private readonly world: CollisionWorld;
  private readonly registrations: MutableRegistration[] = [];
  private readonly registrationsByMesh = new Map<THREE.Mesh, MutableRegistration>();
  private readonly ids = new Set<string>();
  private nextOrder = 1;
  private disposed = false;

  constructor(world: CollisionWorld) {
    this.world = world;
  }

  get registeredTargets(): readonly CombatTargetRegistration[] {
    return this.registrations;
  }

  get size(): number {
    return this.registrations.length;
  }

  register(
    target: CombatTarget,
    options: CombatTargetRegistrationOptions = {},
  ): () => void {
    this.assertActive('register combat targets');
    if (!target.id.trim()) throw new Error('Combat target IDs must be non-empty.');
    if (this.ids.has(target.id)) {
      throw new Error(`Duplicate combat target ID "${target.id}".`);
    }
    if (target.hitMeshes.length === 0) {
      throw new Error(`Combat target "${target.id}" requires hit geometry.`);
    }
    for (const mesh of target.hitMeshes) {
      if (this.registrationsByMesh.has(mesh)) {
        throw new Error(
          `Combat hit mesh "${mesh.name || '<unnamed>'}" is already registered.`,
        );
      }
    }

    const collisionOwnedMeshes: THREE.Mesh[] = [];
    if (options.registerCollision) {
      try {
        for (const mesh of target.hitMeshes) {
          this.world.register(
            mesh,
            CollisionLayer.Projectile,
            options.transformMode ?? ColliderTransformMode.Dynamic,
          );
          collisionOwnedMeshes.push(mesh);
        }
      } catch (error) {
        for (const mesh of collisionOwnedMeshes) this.world.unregister(mesh);
        throw error;
      }
    }

    const registration: MutableRegistration = {
      target,
      order: this.nextOrder++,
      active: true,
      collisionOwnedMeshes,
    };
    this.ids.add(target.id);
    this.registrations.push(registration);
    for (const mesh of target.hitMeshes) {
      this.registrationsByMesh.set(mesh, registration);
    }

    return () => this.unregister(registration);
  }

  getRegistrationForMesh(
    mesh: THREE.Mesh | null | undefined,
  ): CombatTargetRegistration | undefined {
    if (!mesh || this.disposed) return undefined;
    const registration = this.registrationsByMesh.get(mesh);
    return registration?.active ? registration : undefined;
  }

  isRegistered(registration: CombatTargetRegistration): boolean {
    if (this.disposed) return false;
    const mutable = registration as MutableRegistration;
    return mutable.active && this.registrations.includes(mutable);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const registration of [...this.registrations]) {
      this.unregister(registration);
    }
    this.registrationsByMesh.clear();
    this.ids.clear();
    this.disposed = true;
  }

  private unregister(registration: MutableRegistration): void {
    if (!registration.active) return;
    registration.active = false;
    const index = this.registrations.indexOf(registration);
    if (index >= 0) this.registrations.splice(index, 1);
    this.ids.delete(registration.target.id);
    for (const mesh of registration.target.hitMeshes) {
      if (this.registrationsByMesh.get(mesh) === registration) {
        this.registrationsByMesh.delete(mesh);
      }
    }
    for (const mesh of registration.collisionOwnedMeshes) {
      this.world.unregister(mesh);
    }
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after combat target registry disposal.`);
    }
  }
}
