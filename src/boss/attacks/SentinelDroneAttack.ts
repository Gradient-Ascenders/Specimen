import * as THREE from 'three';

import type {
  CombatImpact,
  CombatImpactResult,
  CombatTarget,
} from '../../combat/CombatTargetRegistry.ts';
import type { CombatTargetRegistry } from '../../combat/CombatTargetRegistry.ts';
import { EventBus } from '../../core/EventBus.ts';
import {
  ColliderTransformMode,
  CollisionHit,
  CollisionLayer,
  type CollisionWorld,
} from '../../physics/CollisionWorld.ts';
import { sweptSpherePairFraction } from '../../physics/ContinuousCollision.ts';
import type {
  SentinelAttackCancelReason,
  SentinelAttackContext,
  SentinelSpecimenTarget,
} from '../SentinelBossTypes.ts';
import {
  TimedSentinelAttack,
  type TimedSentinelAttackDurations,
} from './SentinelAttack.ts';

const EPSILON = 1e-9;

export interface SentinelDroneSquadEvents {
  deployed: { readonly droneId: string; readonly slotIndex: number };
  destroyed: { readonly droneId: string; readonly slotIndex: number };
  projectileFired: {
    readonly droneId: string;
    readonly projectileId: number;
  };
}

export interface SentinelDroneProjectileReadState {
  readonly id: number;
  readonly active: boolean;
  readonly ownerDroneId: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

interface MutableProjectileReadState {
  id: number;
  active: boolean;
  ownerDroneId: string;
  readonly position: { x: number; y: number; z: number };
}

interface ProjectileSlot {
  readonly read: MutableProjectileReadState;
  readonly position: THREE.Vector3;
  readonly previousPosition: THREE.Vector3;
  readonly direction: THREE.Vector3;
  ownerCollider: THREE.Mesh | undefined;
  ageSeconds: number;
  distanceMetres: number;
}

class SentinelDroneProjectilePool {
  readonly states: readonly SentinelDroneProjectileReadState[];

  private readonly world: CollisionWorld;
  private readonly slots: ProjectileSlot[];
  private readonly speedMetresPerSecond: number;
  private readonly radiusMetres: number;
  private readonly lifetimeSeconds: number;
  private readonly maximumRangeMetres: number;
  private readonly hit = new CollisionHit();
  private readonly displacement = new THREE.Vector3();
  private readonly targetDisplacement = new THREE.Vector3();
  private nextId = 1;
  private disposed = false;

  constructor(
    world: CollisionWorld,
    options: {
      readonly capacity?: number;
      readonly speedMetresPerSecond?: number;
      readonly radiusMetres?: number;
      readonly lifetimeSeconds?: number;
      readonly maximumRangeMetres?: number;
    } = {},
  ) {
    this.world = world;
    const capacity = options.capacity ?? 16;
    this.speedMetresPerSecond = options.speedMetresPerSecond ?? 14;
    this.radiusMetres = options.radiusMetres ?? 0.12;
    this.lifetimeSeconds = options.lifetimeSeconds ?? 4;
    this.maximumRangeMetres = options.maximumRangeMetres ?? 50;
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('Sentinel hostile projectile pool capacity must be a positive integer.');
    }
    for (const [label, value] of [
      ['speed', this.speedMetresPerSecond],
      ['radius', this.radiusMetres],
      ['lifetime', this.lifetimeSeconds],
      ['range', this.maximumRangeMetres],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Sentinel hostile projectile ${label} must be positive and finite.`);
      }
    }
    this.slots = Array.from({ length: capacity }, () => ({
      read: {
        id: 0,
        active: false,
        ownerDroneId: '',
        position: { x: 0, y: 0, z: 0 },
      },
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      ownerCollider: undefined,
      ageSeconds: 0,
      distanceMetres: 0,
    }));
    this.states = this.slots.map((slot) => slot.read);
  }

  get liveCount(): number {
    let count = 0;
    for (const slot of this.slots) count += Number(slot.read.active);
    return count;
  }

  spawn(
    ownerDroneId: string,
    ownerCollider: THREE.Mesh,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): number | undefined {
    this.assertActive('spawn');
    const slot = this.slots.find((candidate) => !candidate.read.active);
    if (!slot || !ownerDroneId || direction.lengthSq() <= EPSILON) {
      return undefined;
    }
    slot.read.id = this.nextId++;
    slot.read.active = true;
    slot.read.ownerDroneId = ownerDroneId;
    slot.position.copy(origin);
    slot.previousPosition.copy(origin);
    slot.direction.copy(direction).normalize();
    slot.ownerCollider = ownerCollider;
    slot.ageSeconds = 0;
    slot.distanceMetres = 0;
    syncProjectile(slot);
    return slot.read.id;
  }

  update(
    deltaSeconds: number,
    target: SentinelSpecimenTarget,
    requestFailure: () => boolean,
  ): void {
    this.assertActive('update');
    let failureRequested = false;

    for (const slot of this.slots) {
      if (!slot.read.active) continue;
      const remainingLifetime = Math.max(
        0,
        this.lifetimeSeconds - slot.ageSeconds,
      );
      const remainingRange = Math.max(
        0,
        this.maximumRangeMetres - slot.distanceMetres,
      );
      const distance = Math.min(
        this.speedMetresPerSecond *
          Math.min(deltaSeconds, remainingLifetime),
        remainingRange,
      );
      if (distance <= EPSILON) {
        deactivateProjectile(slot);
        continue;
      }

      slot.previousPosition.copy(slot.position);
      this.displacement.copy(slot.direction).multiplyScalar(distance);
      const worldHit = this.world.sweepSphere(
        slot.position,
        this.displacement,
        this.radiusMetres,
        this.hit,
        CollisionLayer.Projectile,
        slot.ownerCollider,
      );
      const worldFraction = worldHit
        ? this.hit.fraction
        : Number.POSITIVE_INFINITY;

      this.targetDisplacement.set(
        target.position.x - target.previousPosition.x,
        target.position.y - target.previousPosition.y,
        target.position.z - target.previousPosition.z,
      );
      const targetFraction = sweptSpherePairFraction(
        slot.position,
        this.displacement,
        this.radiusMetres,
        target.previousPosition,
        this.targetDisplacement,
        target.radiusMetres,
      );

      if (
        targetFraction !== undefined &&
        targetFraction < worldFraction - EPSILON
      ) {
        slot.position.addScaledVector(
          this.displacement,
          targetFraction,
        );
        syncProjectile(slot);
        deactivateProjectile(slot);
        if (!failureRequested) {
          failureRequested = true;
          requestFailure();
        }
        continue;
      }

      if (worldHit) {
        slot.position.copy(this.hit.point);
        syncProjectile(slot);
        deactivateProjectile(slot);
        continue;
      }

      slot.position.add(this.displacement);
      slot.ageSeconds += Math.min(deltaSeconds, remainingLifetime);
      slot.distanceMetres += distance;
      syncProjectile(slot);
      if (
        slot.ageSeconds + EPSILON >= this.lifetimeSeconds ||
        slot.distanceMetres + EPSILON >= this.maximumRangeMetres
      ) {
        deactivateProjectile(slot);
      }
    }
  }

  despawnOwner(ownerDroneId: string): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (
        slot.read.active &&
        slot.read.ownerDroneId === ownerDroneId
      ) {
        deactivateProjectile(slot);
      }
    }
  }

  reset(): void {
    if (this.disposed) return;
    for (const slot of this.slots) deactivateProjectile(slot);
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(
        `Cannot ${operation} Sentinel hostile projectiles after disposal.`,
      );
    }
  }
}

class SentinelBossDrone implements CombatTarget {
  readonly id: string;
  readonly hitMeshes: readonly THREE.Mesh[];
  readonly root = new THREE.Group();

  private readonly world: CollisionWorld;
  private readonly projectiles: SentinelDroneProjectilePool;
  private readonly fireIntervalSeconds: number;
  private readonly healthMaximum: number;
  private readonly onDestroyed: (drone: SentinelBossDrone) => void;
  private readonly position = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3();

  private activeValue = false;
  private colliderRegistered = false;
  private healthValue: number;
  private fireElapsedSeconds = 0;
  private disposed = false;

  constructor(options: {
    readonly id: string;
    readonly world: CollisionWorld;
    readonly projectiles: SentinelDroneProjectilePool;
    readonly healthUnits: number;
    readonly fireIntervalSeconds: number;
    readonly onDestroyed: (drone: SentinelBossDrone) => void;
  }) {
    this.id = options.id;
    this.world = options.world;
    this.projectiles = options.projectiles;
    this.healthMaximum = options.healthUnits;
    this.healthValue = this.healthMaximum;
    this.fireIntervalSeconds = options.fireIntervalSeconds;
    this.onDestroyed = options.onDestroyed;
    if (
      !Number.isFinite(this.healthMaximum) ||
      this.healthMaximum <= 0 ||
      !Number.isFinite(this.fireIntervalSeconds) ||
      this.fireIntervalSeconds <= 0
    ) {
      throw new Error('Sentinel drone health/fire interval must be positive and finite.');
    }

    this.root.name = `${this.id}-sentinel-drone`;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.55, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0x59636b,
        emissive: 0x5b1016,
        emissiveIntensity: 0.55,
        roughness: 0.5,
        metalness: 0.65,
      }),
    );
    mesh.name = `${this.id}-hit`;
    mesh.userData.authoringRole = 'sentinel-boss-drone';
    this.root.add(mesh);
    this.hitMeshes = [mesh];
    this.root.visible = false;
  }

  get active(): boolean {
    return this.activeValue;
  }

  get healthUnits(): number {
    return this.healthValue;
  }

  deploy(position: THREE.Vector3): void {
    this.assertActive('deploy');
    this.deactivate(false);
    this.root.position.copy(position);
    this.root.visible = true;
    this.healthValue = this.healthMaximum;
    this.fireElapsedSeconds = 0;
    this.activeValue = true;
    this.registerCollider();
  }

  update(
    deltaSeconds: number,
    target: SentinelSpecimenTarget,
    onProjectileFired: (projectileId: number) => void,
  ): void {
    if (!this.activeValue) return;
    this.fireElapsedSeconds += deltaSeconds;
    while (
      this.fireElapsedSeconds + EPSILON >= this.fireIntervalSeconds
    ) {
      this.fireElapsedSeconds -= this.fireIntervalSeconds;
      this.root.getWorldPosition(this.position);
      this.aimDirection.set(
        target.position.x - this.position.x,
        target.position.y - this.position.y,
        target.position.z - this.position.z,
      );
      const projectileId = this.projectiles.spawn(
        this.id,
        this.hitMeshes[0]!,
        this.position,
        this.aimDirection,
      );
      if (projectileId !== undefined) onProjectileFired(projectileId);
    }
  }

  isCombatActive(): boolean {
    return this.activeValue;
  }

  copySplashWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.root.getWorldPosition(target);
  }

  applyImpact(impact: CombatImpact): CombatImpactResult {
    if (!this.activeValue) {
      return {
        accepted: false,
        destroyed: false,
        rejectionReason: 'inactive',
      };
    }
    if (!Number.isFinite(impact.damageUnits) || impact.damageUnits <= 0) {
      return {
        accepted: false,
        destroyed: false,
        rejectionReason: 'invulnerable',
      };
    }
    this.healthValue = Math.max(
      0,
      this.healthValue - impact.damageUnits,
    );
    if (this.healthValue > EPSILON) {
      return { accepted: true, destroyed: false };
    }

    this.deactivate(true);
    return { accepted: true, destroyed: true };
  }

  reset(): void {
    if (this.disposed) return;
    this.deactivate(false);
    this.healthValue = this.healthMaximum;
    this.fireElapsedSeconds = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.deactivate(false);
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.root.clear();
    this.disposed = true;
  }

  private deactivate(destroyed: boolean): void {
    const wasActive = this.activeValue;
    this.projectiles.despawnOwner(this.id);
    this.unregisterCollider();
    this.activeValue = false;
    this.root.visible = false;
    this.fireElapsedSeconds = 0;
    if (destroyed && wasActive) this.onDestroyed(this);
  }

  private registerCollider(): void {
    if (this.colliderRegistered) return;
    this.world.register(
      this.hitMeshes[0]!,
      CollisionLayer.Projectile | CollisionLayer.LineOfSight,
      ColliderTransformMode.Dynamic,
    );
    this.colliderRegistered = true;
  }

  private unregisterCollider(): void {
    if (!this.colliderRegistered) return;
    this.world.unregister(this.hitMeshes[0]!);
    this.colliderRegistered = false;
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(
        `Cannot ${operation} Sentinel drone "${this.id}" after disposal.`,
      );
    }
  }
}

export class SentinelDroneSquad {
  readonly root = new THREE.Group();
  readonly events = new EventBus<SentinelDroneSquadEvents>();
  readonly projectileStates: readonly SentinelDroneProjectileReadState[];

  private readonly world: CollisionWorld;
  private readonly projectiles: SentinelDroneProjectilePool;
  private readonly drones: SentinelBossDrone[] = [];
  private readonly anchors: readonly THREE.Vector3[];
  private readonly unregisterTargets: Array<() => void> = [];
  private disposed = false;

  constructor(options: {
    readonly collisionWorld: CollisionWorld;
    readonly targetRegistry: CombatTargetRegistry;
    readonly anchors: readonly THREE.Vector3[];
    readonly maximumDrones?: number;
    readonly droneHealthUnits?: number;
    readonly fireIntervalSeconds?: number;
    readonly projectileCapacity?: number;
  }) {
    this.world = options.collisionWorld;
    const maximumDrones = options.maximumDrones ?? 4;
    if (
      !Number.isInteger(maximumDrones) ||
      maximumDrones < 1 ||
      maximumDrones > 4 ||
      options.anchors.length < maximumDrones
    ) {
      throw new Error(
        'Sentinel drone squad requires 1-4 slots and one anchor per slot.',
      );
    }
    this.anchors = options.anchors
      .slice(0, maximumDrones)
      .map((anchor) => anchor.clone());
    this.projectiles = new SentinelDroneProjectilePool(
      this.world,
      { capacity: options.projectileCapacity ?? 16 },
    );
    this.projectileStates = this.projectiles.states;
    this.root.name = 'sentinel-drone-squad';

    try {
      for (let index = 0; index < maximumDrones; index += 1) {
        const drone = new SentinelBossDrone({
          id: `sentinel-drone-${index + 1}`,
          world: this.world,
          projectiles: this.projectiles,
          healthUnits: options.droneHealthUnits ?? 2,
          fireIntervalSeconds: options.fireIntervalSeconds ?? 1.25,
          onDestroyed: (destroyed) => {
            this.events.emit('destroyed', {
              droneId: destroyed.id,
              slotIndex: this.drones.indexOf(destroyed),
            });
          },
        });
        this.drones.push(drone);
        this.root.add(drone.root);
        this.unregisterTargets.push(
          options.targetRegistry.register(drone),
        );
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get activeCount(): number {
    let count = 0;
    for (const drone of this.drones) count += Number(drone.active);
    return count;
  }

  get poolCapacity(): number {
    return this.projectileStates.length;
  }

  get liveProjectileCount(): number {
    return this.projectiles.liveCount;
  }

  deploy(count: number): void {
    this.assertActive('deploy');
    if (!Number.isInteger(count) || count < 0 || count > this.drones.length) {
      throw new Error('Sentinel drone deploy count exceeds the bounded squad.');
    }
    this.clear();
    for (let index = 0; index < count; index += 1) {
      const drone = this.drones[index]!;
      drone.deploy(this.anchors[index]!);
      this.events.emit('deployed', {
        droneId: drone.id,
        slotIndex: index,
      });
    }
  }

  update(
    deltaSeconds: number,
    target: SentinelSpecimenTarget,
    requestFailure: () => boolean,
  ): void {
    this.assertActive('update');
    for (const drone of this.drones) {
      drone.update(deltaSeconds, target, (projectileId) => {
        this.events.emit('projectileFired', {
          droneId: drone.id,
          projectileId,
        });
      });
    }
    this.projectiles.update(deltaSeconds, target, requestFailure);
  }

  clear(): void {
    if (this.disposed) return;
    for (const drone of this.drones) drone.reset();
    this.projectiles.reset();
  }

  reset(): void {
    this.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    for (let index = this.unregisterTargets.length - 1; index >= 0; index -= 1) {
      this.unregisterTargets[index]?.();
    }
    this.unregisterTargets.length = 0;
    for (const drone of this.drones) drone.dispose();
    this.drones.length = 0;
    this.projectiles.dispose();
    this.events.clear();
    this.root.removeFromParent();
    this.root.clear();
    this.disposed = true;
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(
        `Cannot ${operation} Sentinel drone squad after disposal.`,
      );
    }
  }
}

export interface SentinelDroneAttackOptions {
  readonly id: string;
  readonly squad: SentinelDroneSquad;
  readonly deployCount: number;
  readonly durations: TimedSentinelAttackDurations;
}

export class SentinelDroneAttack extends TimedSentinelAttack {
  private readonly squad: SentinelDroneSquad;
  private readonly deployCount: number;
  private deployed = false;

  constructor(options: SentinelDroneAttackOptions) {
    super(options.id, options.durations);
    this.squad = options.squad;
    this.deployCount = options.deployCount;
    if (
      !Number.isInteger(this.deployCount) ||
      this.deployCount < 1 ||
      this.deployCount > 4
    ) {
      throw new Error('Sentinel drone attack deployCount must be 1-4.');
    }
  }

  protected onTelegraphStart(): void {
    this.squad.clear();
    this.deployed = false;
  }

  protected onActiveStart(): void {
    this.squad.deploy(this.deployCount);
    this.deployed = true;
  }

  protected onActiveUpdate(
    deltaSeconds: number,
    context: SentinelAttackContext,
  ): void {
    this.squad.update(
      deltaSeconds,
      context.specimen,
      () => context.requestFailure(),
    );
  }

  protected activeCompletedEarly(): boolean {
    return this.deployed && this.squad.activeCount === 0;
  }

  protected onRecoveryStart(): void {
    this.squad.clear();
  }

  protected onCancel(_reason: SentinelAttackCancelReason): void {
    this.squad.clear();
    this.deployed = false;
  }

  protected onReset(): void {
    this.squad.clear();
    this.deployed = false;
  }

  protected onDispose(): void {
    // Squad lifetime is encounter-owned and shared by phase attack instances.
  }
}

function syncProjectile(slot: ProjectileSlot): void {
  slot.read.position.x = slot.position.x;
  slot.read.position.y = slot.position.y;
  slot.read.position.z = slot.position.z;
}

function deactivateProjectile(slot: ProjectileSlot): void {
  slot.read.active = false;
  slot.read.ownerDroneId = '';
  slot.ownerCollider = undefined;
  slot.ageSeconds = 0;
  slot.distanceMetres = 0;
}
