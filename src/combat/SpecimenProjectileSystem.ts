import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import {
  CollisionHit,
  CollisionLayer,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type { ReadonlyVector3State } from '../physics/KinematicBody.ts';
import {
  type CombatImpact,
  type CombatTargetRegistration,
  type CombatTargetRegistry,
} from './CombatTargetRegistry.ts';

const EPSILON = 1e-9;
const FULL_CHARGE_EPSILON = 1e-9;
const AIM_PROBE_RADIUS_METRES = 0.001;
const SPLASH_ORIGIN_OFFSET_METRES = 0.002;

export interface SpecimenAttackConfig {
  readonly fullChargeSeconds: number;
  readonly minimumCooldownSeconds: number;
  readonly maximumCooldownSeconds: number;
  readonly projectileSpeedMetresPerSecond: number;
  readonly maximumRangeMetres: number;
  readonly projectileLifetimeSeconds: number;
  readonly maximumLiveProjectiles: number;
  readonly minimumProjectileRadiusMetres: number;
  readonly maximumProjectileRadiusMetres: number;
  readonly minimumDamageUnits: number;
  readonly maximumDamageUnits: number;
  readonly maximumSplashRadiusMetres: number;
  readonly launchClearanceMetres: number;
}

export const DEFAULT_SPECIMEN_ATTACK_CONFIG: Readonly<SpecimenAttackConfig> = {
  fullChargeSeconds: 1.5,
  minimumCooldownSeconds: 0.35,
  maximumCooldownSeconds: 0.8,
  projectileSpeedMetresPerSecond: 30,
  maximumRangeMetres: 60,
  projectileLifetimeSeconds: 2,
  maximumLiveProjectiles: 12,
  minimumProjectileRadiusMetres: 0.1,
  maximumProjectileRadiusMetres: 0.2,
  minimumDamageUnits: 1,
  maximumDamageUnits: 3,
  maximumSplashRadiusMetres: 3,
  launchClearanceMetres: 0.02,
};

interface MutableVector3State {
  x: number;
  y: number;
  z: number;
}

export interface SpecimenAttackReadModel {
  readonly aimActive: boolean;
  readonly charging: boolean;
  readonly chargeAmount: number;
  readonly fullyCharged: boolean;
  readonly cooldownRemainingSeconds: number;
  readonly cooldownProgress: number;
  readonly canStartCharge: boolean;
  readonly aimOrigin: ReadonlyVector3State;
  readonly aimDirection: ReadonlyVector3State;
  readonly aimPoint: ReadonlyVector3State;
  readonly liveProjectileCount: number;
}

interface MutableAttackReadModel {
  aimActive: boolean;
  charging: boolean;
  chargeAmount: number;
  fullyCharged: boolean;
  cooldownRemainingSeconds: number;
  cooldownProgress: number;
  canStartCharge: boolean;
  readonly aimOrigin: MutableVector3State;
  readonly aimDirection: MutableVector3State;
  readonly aimPoint: MutableVector3State;
  liveProjectileCount: number;
}

export interface SpecimenProjectileReadState {
  readonly id: number;
  readonly active: boolean;
  readonly position: ReadonlyVector3State;
  readonly previousPosition: ReadonlyVector3State;
  readonly direction: ReadonlyVector3State;
  readonly chargeAmount: number;
  readonly fullyCharged: boolean;
  readonly radiusMetres: number;
}

interface MutableProjectileReadState {
  id: number;
  active: boolean;
  readonly position: MutableVector3State;
  readonly previousPosition: MutableVector3State;
  readonly direction: MutableVector3State;
  chargeAmount: number;
  fullyCharged: boolean;
  radiusMetres: number;
}

interface ProjectileSlot {
  readonly read: MutableProjectileReadState;
  readonly position: THREE.Vector3;
  readonly previousPosition: THREE.Vector3;
  readonly direction: THREE.Vector3;
  chargeAmount: number;
  fullyCharged: boolean;
  damageUnits: number;
  splashRadiusMetres: number;
  radiusMetres: number;
  ageSeconds: number;
  distanceMetres: number;
}

export interface SpecimenAttackBody {
  readonly position: ReadonlyVector3State;
  readonly radiusMetres: number;
}

export interface SpecimenAttackControls {
  readonly active: boolean;
  readonly aimHeld: boolean;
  readonly fireHeld: boolean;
  readonly firePressed: boolean;
  readonly fireReleased: boolean;
  readonly gameplayInputEnabled: boolean;
  readonly pointerLocked: boolean;
  readonly cancelled?: boolean;
}

export interface SpecimenAimRayProvider {
  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void;
}

export type SpecimenShotRejectReason = 'pool-full';

export interface SpecimenAttackEvents {
  aimEntered: Record<string, never>;
  aimExited: Record<string, never>;
  chargeStarted: Record<string, never>;
  chargeCancelled: { readonly chargeAmount: number };
  fullChargeReached: Record<string, never>;
  shotRejected: {
    readonly reason: SpecimenShotRejectReason;
    readonly chargeAmount: number;
  };
  projectileFired: {
    readonly projectileId: number;
    readonly chargeAmount: number;
    readonly fullyCharged: boolean;
    readonly damageUnits: number;
    readonly splashRadiusMetres: number;
    readonly position: ReadonlyVector3State;
    readonly direction: ReadonlyVector3State;
  };
  impact: {
    readonly projectileId: number;
    readonly targetId: string | undefined;
    readonly kind: 'direct' | 'world';
    readonly chargeAmount: number;
    readonly fullyCharged: boolean;
    readonly point: ReadonlyVector3State;
  };
  targetImpact: {
    readonly impact: CombatImpact;
    readonly accepted: boolean;
    readonly destroyed: boolean;
    readonly rejectionReason?: string;
  };
  projectileDespawned: {
    readonly projectileId: number;
    readonly reason: 'impact' | 'expired' | 'reset';
  };
}

interface SplashCandidate {
  registration: CombatTargetRegistration;
  damageUnits: number;
}

/**
 * Specimen-only charged electric-acid authority.
 *
 * Charging and projectile simulation are deterministic fixed-step state. The
 * projectile pool is allocated once and never grows after construction.
 */
export class SpecimenProjectileSystem {
  readonly events = new EventBus<SpecimenAttackEvents>();

  private readonly world: CollisionWorld;
  private readonly targets: CombatTargetRegistry;
  private readonly body: SpecimenAttackBody;
  private readonly aimRayProvider: SpecimenAimRayProvider;
  private readonly config: SpecimenAttackConfig;
  private readonly slots: ProjectileSlot[];
  private readonly projectileReadStates: readonly SpecimenProjectileReadState[];

  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3(0, 0, -1);
  private readonly aimDisplacement = new THREE.Vector3();
  private readonly aimPoint = new THREE.Vector3();
  private readonly launchDirection = new THREE.Vector3();
  private readonly launchPosition = new THREE.Vector3();
  private readonly launchDisplacement = new THREE.Vector3();
  private readonly projectileDisplacement = new THREE.Vector3();
  private readonly splashTargetPosition = new THREE.Vector3();
  private readonly splashDirection = new THREE.Vector3();
  private readonly splashLosOrigin = new THREE.Vector3();
  private readonly aimHit = new CollisionHit();
  private readonly launchHit = new CollisionHit();
  private readonly projectileHit = new CollisionHit();
  private readonly splashHit = new CollisionHit();
  private readonly splashCandidates: SplashCandidate[] = [];

  private readonly readModelValue: MutableAttackReadModel;
  private charging = false;
  private chargeSeconds = 0;
  private fullChargeCueEmitted = false;
  private cooldownRemainingSeconds = 0;
  private cooldownDurationSeconds = 0;
  private nextProjectileId = 1;
  private disposed = false;

  constructor(options: {
    readonly collisionWorld: CollisionWorld;
    readonly targetRegistry: CombatTargetRegistry;
    readonly body: SpecimenAttackBody;
    readonly aimRayProvider: SpecimenAimRayProvider;
    readonly config?: Partial<SpecimenAttackConfig>;
  }) {
    this.world = options.collisionWorld;
    this.targets = options.targetRegistry;
    this.body = options.body;
    this.aimRayProvider = options.aimRayProvider;
    this.config = {
      ...DEFAULT_SPECIMEN_ATTACK_CONFIG,
      ...options.config,
    };
    this.validateConfig();

    this.slots = Array.from(
      { length: this.config.maximumLiveProjectiles },
      createProjectileSlot,
    );
    this.projectileReadStates = this.slots.map((slot) => slot.read);
    this.readModelValue = {
      aimActive: false,
      charging: false,
      chargeAmount: 0,
      fullyCharged: false,
      cooldownRemainingSeconds: 0,
      cooldownProgress: 1,
      canStartCharge: false,
      aimOrigin: vectorState(),
      aimDirection: vectorState(0, 0, -1),
      aimPoint: vectorState(),
      liveProjectileCount: 0,
    };
    this.syncCooldownReadModel();
  }

  get readModel(): SpecimenAttackReadModel {
    return this.readModelValue;
  }

  get projectileStates(): readonly SpecimenProjectileReadState[] {
    return this.projectileReadStates;
  }

  get poolCapacity(): number {
    return this.slots.length;
  }

  update(deltaSeconds: number, controls: SpecimenAttackControls): void {
    this.assertActive('update Specimen projectiles');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'SpecimenProjectileSystem deltaSeconds must be positive and finite.',
      );
    }

    this.cooldownRemainingSeconds = Math.max(
      0,
      this.cooldownRemainingSeconds - deltaSeconds,
    );

    const canAim =
      controls.active &&
      controls.gameplayInputEnabled &&
      controls.pointerLocked &&
      controls.aimHeld;

    this.setAimActive(canAim);
    if (controls.cancelled) this.cancelCharge();

    if (canAim) {
      this.updateAimState();

      if (
        controls.firePressed &&
        !this.charging &&
        this.cooldownRemainingSeconds <= EPSILON
      ) {
        this.beginCharge();
      }

      if (this.charging && controls.fireHeld) {
        this.chargeSeconds = Math.min(
          this.config.fullChargeSeconds,
          this.chargeSeconds + deltaSeconds,
        );
        this.syncChargeReadModel();
        if (
          !this.fullChargeCueEmitted &&
          this.chargeAmount >= 1 - FULL_CHARGE_EPSILON
        ) {
          this.fullChargeCueEmitted = true;
          this.events.emit('fullChargeReached', {});
        }
      }

      if (this.charging && controls.fireReleased) {
        const chargeAmount = this.chargeAmount;
        this.finishChargeAndRelease(chargeAmount);
      }
    } else {
      this.cancelCharge();
      this.clearAim();
    }

    this.updateProjectiles(deltaSeconds);
    this.syncCooldownReadModel();
  }

  /** Cancel aim/charge only. Already-fired pooled projectiles remain frozen by pause. */
  cancelInput(): void {
    if (this.disposed) return;
    this.setAimActive(false);
    this.cancelCharge();
    this.clearAim();
    this.syncCooldownReadModel();
  }

  /** Death/recovery/restart boundary: clear every transient combat resource. */
  reset(): void {
    this.assertActive('reset Specimen projectiles');
    this.cancelInput();
    for (const slot of this.slots) {
      if (slot.read.active) this.deactivate(slot, 'reset');
    }
    this.cooldownRemainingSeconds = 0;
    this.cooldownDurationSeconds = 0;
    this.syncLiveCount();
    this.syncCooldownReadModel();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelInput();
    for (const slot of this.slots) {
      if (slot.read.active) this.deactivate(slot, 'reset');
    }
    this.events.clear();
    this.disposed = true;
  }

  private get chargeAmount(): number {
    return THREE.MathUtils.clamp(
      this.chargeSeconds / this.config.fullChargeSeconds,
      0,
      1,
    );
  }

  private beginCharge(): void {
    this.charging = true;
    this.chargeSeconds = 0;
    this.fullChargeCueEmitted = false;
    this.syncChargeReadModel();
    this.events.emit('chargeStarted', {});
  }

  private finishChargeAndRelease(chargeAmount: number): void {
    const fired = this.fireProjectile(chargeAmount);
    this.charging = false;
    this.chargeSeconds = 0;
    this.fullChargeCueEmitted = false;
    this.syncChargeReadModel();
    if (!fired) {
      this.events.emit('shotRejected', {
        reason: 'pool-full',
        chargeAmount,
      });
    }
  }

  private cancelCharge(): void {
    if (!this.charging) return;
    const chargeAmount = this.chargeAmount;
    this.charging = false;
    this.chargeSeconds = 0;
    this.fullChargeCueEmitted = false;
    this.syncChargeReadModel();
    this.events.emit('chargeCancelled', { chargeAmount });
  }

  private updateAimState(): void {
    this.aimRayProvider.copyAimRay(this.aimOrigin, this.aimDirection);
    if (this.aimDirection.lengthSq() <= EPSILON) {
      this.aimDirection.set(0, 0, -1);
    } else {
      this.aimDirection.normalize();
    }
    this.aimDisplacement
      .copy(this.aimDirection)
      .multiplyScalar(this.config.maximumRangeMetres);

    if (
      this.world.sweepSphere(
        this.aimOrigin,
        this.aimDisplacement,
        AIM_PROBE_RADIUS_METRES,
        this.aimHit,
        CollisionLayer.CameraObstruction,
      )
    ) {
      this.aimPoint.copy(this.aimHit.point);
    } else {
      this.aimPoint.copy(this.aimOrigin).add(this.aimDisplacement);
    }

    writeVector(this.readModelValue.aimOrigin, this.aimOrigin);
    writeVector(this.readModelValue.aimDirection, this.aimDirection);
    writeVector(this.readModelValue.aimPoint, this.aimPoint);
  }

  private clearAim(): void {
    this.readModelValue.aimOrigin.x = 0;
    this.readModelValue.aimOrigin.y = 0;
    this.readModelValue.aimOrigin.z = 0;
    this.readModelValue.aimPoint.x = 0;
    this.readModelValue.aimPoint.y = 0;
    this.readModelValue.aimPoint.z = 0;
  }

  private setAimActive(active: boolean): void {
    if (this.readModelValue.aimActive === active) return;
    this.readModelValue.aimActive = active;
    this.events.emit(active ? 'aimEntered' : 'aimExited', {});
  }

  private fireProjectile(chargeAmount: number): boolean {
    let slot: ProjectileSlot | undefined;
    for (const candidate of this.slots) {
      if (!candidate.read.active) {
        slot = candidate;
        break;
      }
    }
    if (!slot) return false;

    this.launchDirection.set(
      this.aimPoint.x - this.body.position.x,
      this.aimPoint.y - this.body.position.y,
      this.aimPoint.z - this.body.position.z,
    );
    if (this.launchDirection.lengthSq() <= EPSILON) {
      this.launchDirection.copy(this.aimDirection);
    } else {
      this.launchDirection.normalize();
    }

    const radiusMetres = THREE.MathUtils.lerp(
      this.config.minimumProjectileRadiusMetres,
      this.config.maximumProjectileRadiusMetres,
      chargeAmount,
    );
    const launchDistance =
      this.body.radiusMetres +
      radiusMetres +
      this.config.launchClearanceMetres;
    this.launchPosition.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z,
    );
    this.launchDisplacement
      .copy(this.launchDirection)
      .multiplyScalar(launchDistance);

    const launchBlocked = this.world.sweepSphere(
      this.launchPosition,
      this.launchDisplacement,
      radiusMetres,
      this.launchHit,
      CollisionLayer.Projectile,
    );
    if (launchBlocked) {
      this.launchPosition.copy(this.launchHit.point);
    } else {
      this.launchPosition.add(this.launchDisplacement);
    }

    const fullyCharged = chargeAmount >= 1 - FULL_CHARGE_EPSILON;
    const damageUnits = THREE.MathUtils.lerp(
      this.config.minimumDamageUnits,
      this.config.maximumDamageUnits,
      chargeAmount,
    );
    const splashRadiusMetres =
      this.config.maximumSplashRadiusMetres * chargeAmount;

    this.activateProjectile(
      slot,
      this.launchPosition,
      this.launchDirection,
      chargeAmount,
      fullyCharged,
      damageUnits,
      splashRadiusMetres,
      radiusMetres,
    );

    this.cooldownDurationSeconds = THREE.MathUtils.lerp(
      this.config.minimumCooldownSeconds,
      this.config.maximumCooldownSeconds,
      chargeAmount,
    );
    this.cooldownRemainingSeconds = this.cooldownDurationSeconds;
    this.events.emit('projectileFired', {
      projectileId: slot.read.id,
      chargeAmount,
      fullyCharged,
      damageUnits,
      splashRadiusMetres,
      position: point(slot.position),
      direction: point(slot.direction),
    });

    if (launchBlocked) {
      this.resolveImpact(slot, this.launchHit);
    }
    this.syncLiveCount();
    return true;
  }

  private updateProjectiles(deltaSeconds: number): void {
    for (const slot of this.slots) {
      if (!slot.read.active) continue;

      const lifetimeRemaining = Math.max(
        0,
        this.config.projectileLifetimeSeconds - slot.ageSeconds,
      );
      const rangeRemaining = Math.max(
        0,
        this.config.maximumRangeMetres - slot.distanceMetres,
      );
      const distance = Math.min(
        this.config.projectileSpeedMetresPerSecond *
          Math.min(deltaSeconds, lifetimeRemaining),
        rangeRemaining,
      );

      if (distance <= EPSILON) {
        this.deactivate(slot, 'expired');
        continue;
      }

      slot.previousPosition.copy(slot.position);
      this.projectileDisplacement
        .copy(slot.direction)
        .multiplyScalar(distance);

      if (
        this.world.sweepSphere(
          slot.position,
          this.projectileDisplacement,
          slot.radiusMetres,
          this.projectileHit,
          CollisionLayer.Projectile,
        )
      ) {
        slot.position.copy(this.projectileHit.point);
        slot.distanceMetres += this.projectileHit.distance;
        slot.ageSeconds += deltaSeconds * this.projectileHit.fraction;
        this.syncProjectile(slot);
        this.resolveImpact(slot, this.projectileHit);
        continue;
      }

      slot.position.add(this.projectileDisplacement);
      slot.distanceMetres += distance;
      slot.ageSeconds += Math.min(deltaSeconds, lifetimeRemaining);
      this.syncProjectile(slot);

      if (
        slot.distanceMetres + EPSILON >= this.config.maximumRangeMetres ||
        slot.ageSeconds + EPSILON >= this.config.projectileLifetimeSeconds
      ) {
        this.deactivate(slot, 'expired');
      }
    }
    this.syncLiveCount();
  }

  private resolveImpact(slot: ProjectileSlot, hit: CollisionHit): void {
    const directRegistration = this.targets.getRegistrationForMesh(hit.object);
    this.gatherSplashCandidates(slot, hit.point, directRegistration);

    if (
      directRegistration &&
      this.targets.isRegistered(directRegistration) &&
      directRegistration.target.isCombatActive()
    ) {
      this.applyTargetImpact(
        slot,
        directRegistration,
        'direct',
        slot.damageUnits,
        hit.point,
      );
    }

    for (const candidate of this.splashCandidates) {
      if (!this.targets.isRegistered(candidate.registration)) continue;
      if (!candidate.registration.target.isCombatActive()) continue;
      this.applyTargetImpact(
        slot,
        candidate.registration,
        'splash',
        candidate.damageUnits,
        hit.point,
      );
    }

    this.events.emit('impact', {
      projectileId: slot.read.id,
      targetId: directRegistration?.target.id,
      kind: directRegistration ? 'direct' : 'world',
      chargeAmount: slot.chargeAmount,
      fullyCharged: slot.fullyCharged,
      point: point(hit.point),
    });
    this.deactivate(slot, 'impact');
  }

  private gatherSplashCandidates(
    slot: ProjectileSlot,
    impactPoint: THREE.Vector3,
    directRegistration: CombatTargetRegistration | undefined,
  ): void {
    this.splashCandidates.length = 0;
    if (slot.splashRadiusMetres <= EPSILON) return;

    for (const registration of this.targets.registeredTargets) {
      if (registration === directRegistration) continue;
      const target = registration.target;
      if (!target.isCombatActive()) continue;

      target.copySplashWorldPosition(this.splashTargetPosition);
      const distance = this.splashTargetPosition.distanceTo(impactPoint);
      if (distance > slot.splashRadiusMetres + EPSILON) continue;

      const attenuation = Math.max(
        0,
        1 - distance / slot.splashRadiusMetres,
      );
      const damageUnits = slot.damageUnits * attenuation;
      if (damageUnits <= EPSILON) continue;
      if (!this.hasSplashLineOfSight(impactPoint, this.splashTargetPosition)) {
        continue;
      }

      const index = this.splashCandidates.length;
      const existing = this.splashCandidates[index];
      if (existing) {
        existing.registration = registration;
        existing.damageUnits = damageUnits;
      } else {
        this.splashCandidates.push({
          registration,
          damageUnits,
        });
      }
    }
  }

  private hasSplashLineOfSight(
    impactPoint: THREE.Vector3,
    targetPoint: THREE.Vector3,
  ): boolean {
    this.splashDirection.subVectors(targetPoint, impactPoint);
    const distance = this.splashDirection.length();
    if (distance <= SPLASH_ORIGIN_OFFSET_METRES * 2) return true;
    this.splashDirection.multiplyScalar(1 / distance);
    this.splashLosOrigin
      .copy(impactPoint)
      .addScaledVector(this.splashDirection, SPLASH_ORIGIN_OFFSET_METRES);
    const maximumDistance = Math.max(
      EPSILON,
      distance - SPLASH_ORIGIN_OFFSET_METRES,
    );
    return !this.world.raycast(
      this.splashLosOrigin,
      this.splashDirection,
      maximumDistance,
      this.splashHit,
      CollisionLayer.LineOfSight,
    );
  }

  private applyTargetImpact(
    slot: ProjectileSlot,
    registration: CombatTargetRegistration,
    kind: 'direct' | 'splash',
    damageUnits: number,
    pointValue: THREE.Vector3,
  ): void {
    const impact: CombatImpact = {
      projectileId: slot.read.id,
      targetId: registration.target.id,
      kind,
      chargeAmount: slot.chargeAmount,
      fullyCharged: slot.fullyCharged,
      damageUnits,
      point: point(pointValue),
      direction: point(slot.direction),
    };
    const result = registration.target.applyImpact(impact);
    this.events.emit('targetImpact', {
      impact,
      accepted: result.accepted,
      destroyed: result.destroyed,
      rejectionReason: result.rejectionReason,
    });
  }

  private activateProjectile(
    slot: ProjectileSlot,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    chargeAmount: number,
    fullyCharged: boolean,
    damageUnits: number,
    splashRadiusMetres: number,
    radiusMetres: number,
  ): void {
    slot.read.id = this.nextProjectileId++;
    slot.read.active = true;
    slot.position.copy(position);
    slot.previousPosition.copy(position);
    slot.direction.copy(direction);
    slot.chargeAmount = chargeAmount;
    slot.fullyCharged = fullyCharged;
    slot.damageUnits = damageUnits;
    slot.splashRadiusMetres = splashRadiusMetres;
    slot.radiusMetres = radiusMetres;
    slot.ageSeconds = 0;
    slot.distanceMetres = 0;
    this.syncProjectile(slot);
  }

  private deactivate(
    slot: ProjectileSlot,
    reason: SpecimenAttackEvents['projectileDespawned']['reason'],
  ): void {
    if (!slot.read.active) return;
    const projectileId = slot.read.id;
    slot.read.active = false;
    slot.ageSeconds = 0;
    slot.distanceMetres = 0;
    this.events.emit('projectileDespawned', {
      projectileId,
      reason,
    });
  }

  private syncProjectile(slot: ProjectileSlot): void {
    writeVector(slot.read.position, slot.position);
    writeVector(slot.read.previousPosition, slot.previousPosition);
    writeVector(slot.read.direction, slot.direction);
    slot.read.chargeAmount = slot.chargeAmount;
    slot.read.fullyCharged = slot.fullyCharged;
    slot.read.radiusMetres = slot.radiusMetres;
  }

  private syncChargeReadModel(): void {
    const amount = this.charging ? this.chargeAmount : 0;
    this.readModelValue.charging = this.charging;
    this.readModelValue.chargeAmount = amount;
    this.readModelValue.fullyCharged =
      this.charging && amount >= 1 - FULL_CHARGE_EPSILON;
  }

  private syncCooldownReadModel(): void {
    this.readModelValue.cooldownRemainingSeconds =
      this.cooldownRemainingSeconds;
    this.readModelValue.cooldownProgress =
      this.cooldownRemainingSeconds <= EPSILON ||
      this.cooldownDurationSeconds <= EPSILON
        ? 1
        : THREE.MathUtils.clamp(
            1 -
              this.cooldownRemainingSeconds /
                this.cooldownDurationSeconds,
            0,
            1,
          );
    this.readModelValue.canStartCharge =
      this.readModelValue.aimActive &&
      !this.charging &&
      this.cooldownRemainingSeconds <= EPSILON;
  }

  private syncLiveCount(): void {
    let count = 0;
    for (const slot of this.slots) count += Number(slot.read.active);
    this.readModelValue.liveProjectileCount = count;
  }

  private validateConfig(): void {
    const positive: ReadonlyArray<[string, number]> = [
      ['fullChargeSeconds', this.config.fullChargeSeconds],
      ['minimumCooldownSeconds', this.config.minimumCooldownSeconds],
      ['maximumCooldownSeconds', this.config.maximumCooldownSeconds],
      [
        'projectileSpeedMetresPerSecond',
        this.config.projectileSpeedMetresPerSecond,
      ],
      ['maximumRangeMetres', this.config.maximumRangeMetres],
      ['projectileLifetimeSeconds', this.config.projectileLifetimeSeconds],
      [
        'minimumProjectileRadiusMetres',
        this.config.minimumProjectileRadiusMetres,
      ],
      [
        'maximumProjectileRadiusMetres',
        this.config.maximumProjectileRadiusMetres,
      ],
      ['minimumDamageUnits', this.config.minimumDamageUnits],
      ['maximumDamageUnits', this.config.maximumDamageUnits],
      ['maximumSplashRadiusMetres', this.config.maximumSplashRadiusMetres],
      ['launchClearanceMetres', this.config.launchClearanceMetres],
    ];
    for (const [name, value] of positive) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be positive and finite.`);
      }
    }
    if (
      !Number.isInteger(this.config.maximumLiveProjectiles) ||
      this.config.maximumLiveProjectiles <= 0
    ) {
      throw new Error(
        'maximumLiveProjectiles must be a positive integer.',
      );
    }
    if (
      this.config.maximumCooldownSeconds <
      this.config.minimumCooldownSeconds
    ) {
      throw new Error(
        'maximumCooldownSeconds must be >= minimumCooldownSeconds.',
      );
    }
    if (
      this.config.maximumProjectileRadiusMetres <
      this.config.minimumProjectileRadiusMetres
    ) {
      throw new Error(
        'maximumProjectileRadiusMetres must be >= minimumProjectileRadiusMetres.',
      );
    }
    if (this.config.maximumDamageUnits < this.config.minimumDamageUnits) {
      throw new Error(
        'maximumDamageUnits must be >= minimumDamageUnits.',
      );
    }
  }

  private assertActive(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after Specimen projectile disposal.`);
    }
  }
}

function createProjectileSlot(): ProjectileSlot {
  return {
    read: {
      id: 0,
      active: false,
      position: vectorState(),
      previousPosition: vectorState(),
      direction: vectorState(0, 0, -1),
      chargeAmount: 0,
      fullyCharged: false,
      radiusMetres: DEFAULT_SPECIMEN_ATTACK_CONFIG.minimumProjectileRadiusMetres,
    },
    position: new THREE.Vector3(),
    previousPosition: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, -1),
    chargeAmount: 0,
    fullyCharged: false,
    damageUnits: 0,
    splashRadiusMetres: 0,
    radiusMetres: DEFAULT_SPECIMEN_ATTACK_CONFIG.minimumProjectileRadiusMetres,
    ageSeconds: 0,
    distanceMetres: 0,
  };
}

function vectorState(
  x = 0,
  y = 0,
  z = 0,
): MutableVector3State {
  return { x, y, z };
}

function writeVector(
  target: MutableVector3State,
  source: ReadonlyVector3State,
): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function point(source: ReadonlyVector3State): ReadonlyVector3State {
  return {
    x: source.x,
    y: source.y,
    z: source.z,
  };
}
