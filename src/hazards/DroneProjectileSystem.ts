import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import { sweptSpherePairFraction } from '../physics/ContinuousCollision.ts';
import type { SlimeDamageSystem } from '../systems/SlimeDamageSystem.ts';

const EPSILON = 1e-9;

export interface DroneProjectileConfig {
  readonly speedMetresPerSecond: number;
  readonly radiusMetres: number;
  readonly maximumRangeMetres: number;
  readonly lifetimeSeconds: number;
  readonly damage: number;
  readonly poolCapacity: number;
}

export const DEFAULT_DRONE_PROJECTILE_CONFIG: Readonly<DroneProjectileConfig> = {
  // Close shots arrive before a normal reaction, while a shot crossing most
  // of Room 3 remains visible long enough for a deliberate lateral dodge.
  speedMetresPerSecond: 150,
  radiusMetres: 0.16,
  maximumRangeMetres: 100,
  lifetimeSeconds: 0.75,
  damage: 20,
  poolCapacity: 48,
};

interface VectorState { x: number; y: number; z: number }

export interface DroneProjectileReadState {
  readonly id: number;
  readonly active: boolean;
  readonly ownerDroneId: string;
  readonly position: Readonly<VectorState>;
  readonly previousPosition: Readonly<VectorState>;
  readonly direction: Readonly<VectorState>;
}

interface MutableDroneProjectileReadState {
  id: number;
  active: boolean;
  ownerDroneId: string;
  readonly position: VectorState;
  readonly previousPosition: VectorState;
  readonly direction: VectorState;
}

interface ProjectileSlot {
  readonly read: MutableDroneProjectileReadState;
  readonly position: THREE.Vector3;
  readonly previousPosition: THREE.Vector3;
  readonly direction: THREE.Vector3;
  ownerCollider: THREE.Mesh | undefined;
  ageSeconds: number;
  distanceMetres: number;
}

export interface DroneProjectileTarget {
  readonly slimeId: 'bob' | 'goop';
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly previousPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMetres: number;
  /** False while the persistent body is outside this encounter's room. */
  readonly eligible?: boolean;
}

export interface DroneProjectileEvents {
  spawned: { readonly projectileId: number; readonly ownerDroneId: string };
  worldImpact: {
    readonly projectileId: number;
    readonly ownerDroneId: string;
    readonly objectName: string;
    readonly point: Readonly<VectorState>;
  };
  slimeImpact: {
    readonly projectileId: number;
    readonly ownerDroneId: string;
    readonly slimeId: 'bob' | 'goop';
    readonly damage: number;
    readonly point: Readonly<VectorState>;
  };
  despawned: {
    readonly projectileId: number;
    readonly ownerDroneId: string;
    readonly reason: 'world' | 'slime' | 'expired' | 'owner-disabled' | 'reset';
  };
}

/** Bounded fixed-step projectile owner shared by all Room 3 drones. */
export class DroneProjectileSystem {
  readonly events = new EventBus<DroneProjectileEvents>();
  readonly states: readonly DroneProjectileReadState[];

  private readonly world: CollisionWorld;
  private readonly damage: SlimeDamageSystem;
  private readonly config: DroneProjectileConfig;
  private readonly slots: readonly ProjectileSlot[];
  private readonly displacement = new THREE.Vector3();
  private readonly targetDisplacement = new THREE.Vector3();
  private readonly hit = new CollisionHit();
  private nextId = 1;
  private disposed = false;

  constructor(
    world: CollisionWorld,
    damage: SlimeDamageSystem,
    config: Partial<DroneProjectileConfig> = {},
  ) {
    this.world = world;
    this.damage = damage;
    this.config = { ...DEFAULT_DRONE_PROJECTILE_CONFIG, ...config };
    for (const [label, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be positive and finite.`);
      }
    }
    if (!Number.isInteger(this.config.poolCapacity)) {
      throw new Error('Drone projectile pool capacity must be an integer.');
    }
    this.slots = Array.from({ length: this.config.poolCapacity }, createSlot);
    this.states = this.slots.map((slot) => slot.read);
  }

  spawn(
    ownerDroneId: string,
    ownerCollider: THREE.Mesh,
    position: { readonly x: number; readonly y: number; readonly z: number },
    direction: { readonly x: number; readonly y: number; readonly z: number },
  ): boolean {
    this.assertActive('spawn a drone projectile');
    let slot: ProjectileSlot | undefined;
    for (const candidate of this.slots) {
      if (candidate.read.active) continue;
      slot = candidate;
      break;
    }
    if (!slot || !ownerDroneId) return false;
    slot.direction.set(direction.x, direction.y, direction.z);
    if (slot.direction.lengthSq() <= EPSILON) return false;
    slot.direction.normalize();
    slot.position.set(position.x, position.y, position.z);
    slot.previousPosition.copy(slot.position);
    slot.ownerCollider = ownerCollider;
    slot.ageSeconds = 0;
    slot.distanceMetres = 0;
    slot.read.id = this.nextId++;
    slot.read.ownerDroneId = ownerDroneId;
    slot.read.active = true;
    syncSlot(slot);
    this.events.emit('spawned', {
      projectileId: slot.read.id,
      ownerDroneId,
    });
    return true;
  }

  update(deltaSeconds: number, targets: readonly DroneProjectileTarget[]): void {
    this.assertActive('update drone projectiles');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Drone projectile deltaSeconds must be positive and finite.');
    }
    for (const slot of this.slots) {
      if (!slot.read.active) continue;
      const remainingLifetime = Math.max(0, this.config.lifetimeSeconds - slot.ageSeconds);
      const remainingRange = Math.max(0, this.config.maximumRangeMetres - slot.distanceMetres);
      const distance = Math.min(
        this.config.speedMetresPerSecond * Math.min(deltaSeconds, remainingLifetime),
        remainingRange,
      );
      if (distance <= EPSILON) {
        this.deactivate(slot, 'expired');
        continue;
      }

      slot.previousPosition.copy(slot.position);
      this.displacement.copy(slot.direction).multiplyScalar(distance);
      const worldHit = this.world.sweepSphere(
        slot.position,
        this.displacement,
        this.config.radiusMetres,
        this.hit,
        CollisionLayer.Projectile,
        slot.ownerCollider,
      );
      const worldFraction = worldHit ? this.hit.fraction : Number.POSITIVE_INFINITY;
      let targetFraction = Number.POSITIVE_INFINITY;
      let targetHit: DroneProjectileTarget | undefined;
      for (const target of targets) {
        if (target.eligible === false) continue;
        this.targetDisplacement.set(
          target.position.x - target.previousPosition.x,
          target.position.y - target.previousPosition.y,
          target.position.z - target.previousPosition.z,
        );
        const fraction = sweptSpherePairFraction(
          slot.position,
          this.displacement,
          this.config.radiusMetres,
          target.previousPosition,
          this.targetDisplacement,
          target.radiusMetres,
        );
        if (fraction === undefined || fraction >= targetFraction) continue;
        targetFraction = fraction;
        targetHit = target;
      }

      if (targetHit && targetFraction < worldFraction - EPSILON) {
        slot.position.addScaledVector(this.displacement, targetFraction);
        syncSlot(slot);
        this.damage.applyDamage(targetHit.slimeId, this.config.damage, slot.direction);
        this.events.emit('slimeImpact', {
          projectileId: slot.read.id,
          ownerDroneId: slot.read.ownerDroneId,
          slimeId: targetHit.slimeId,
          damage: this.config.damage,
          point: point(slot.position),
        });
        this.deactivate(slot, 'slime');
        continue;
      }
      if (worldHit) {
        slot.position.copy(this.hit.point);
        syncSlot(slot);
        this.events.emit('worldImpact', {
          projectileId: slot.read.id,
          ownerDroneId: slot.read.ownerDroneId,
          objectName: this.hit.object?.name || '<unnamed>',
          point: point(slot.position),
        });
        this.deactivate(slot, 'world');
        continue;
      }

      slot.position.add(this.displacement);
      slot.distanceMetres += distance;
      slot.ageSeconds += Math.min(deltaSeconds, remainingLifetime);
      syncSlot(slot);
      if (
        slot.distanceMetres + EPSILON >= this.config.maximumRangeMetres ||
        slot.ageSeconds + EPSILON >= this.config.lifetimeSeconds
      ) this.deactivate(slot, 'expired');
    }
  }

  despawnOwner(ownerDroneId: string): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (slot.read.active && slot.read.ownerDroneId === ownerDroneId) {
        this.deactivate(slot, 'owner-disabled');
      }
    }
  }

  reset(): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (slot.read.active) this.deactivate(slot, 'reset');
    }
  }

  get liveCount(): number {
    let count = 0;
    for (const slot of this.slots) count += Number(slot.read.active);
    return count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.events.clear();
    this.disposed = true;
  }

  private deactivate(slot: ProjectileSlot, reason: DroneProjectileEvents['despawned']['reason']): void {
    if (!slot.read.active) return;
    const payload = {
      projectileId: slot.read.id,
      ownerDroneId: slot.read.ownerDroneId,
      reason,
    };
    slot.read.active = false;
    slot.ownerCollider = undefined;
    slot.ageSeconds = 0;
    slot.distanceMetres = 0;
    this.events.emit('despawned', payload);
  }

  private assertActive(operation: string): void {
    if (this.disposed) throw new Error(`Cannot ${operation} after projectile disposal.`);
  }
}

function createSlot(): ProjectileSlot {
  return {
    read: {
      id: 0,
      active: false,
      ownerDroneId: '',
      position: { x: 0, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
    },
    position: new THREE.Vector3(),
    previousPosition: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, -1),
    ownerCollider: undefined,
    ageSeconds: 0,
    distanceMetres: 0,
  };
}

function syncSlot(slot: ProjectileSlot): void {
  write(slot.read.position, slot.position);
  write(slot.read.previousPosition, slot.previousPosition);
  write(slot.read.direction, slot.direction);
}

function write(target: VectorState, source: { readonly x: number; readonly y: number; readonly z: number }): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function point(source: { readonly x: number; readonly y: number; readonly z: number }): VectorState {
  return { x: source.x, y: source.y, z: source.z };
}
