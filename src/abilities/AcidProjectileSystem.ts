import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import {
  CollisionHit,
  CollisionLayer,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import { DissolveSystem } from './DissolveSystem.ts';
import type { DissolveTarget } from './DissolveTarget.ts';

const DISTANCE_EPSILON = 1e-8;
const COOLDOWN_EPSILON_SECONDS = 1e-9;

export interface AcidProjectileConfig {
  readonly maximumRangeMetres: number;
  readonly projectileSpeedMetresPerSecond: number;
  readonly projectileRadiusMetres: number;
  readonly projectileLifetimeSeconds: number;
  readonly fireCooldownSeconds: number;
  readonly launchClearanceMetres: number;
  readonly aimProbeRadiusMetres: number;
  readonly maximumLiveProjectiles: number;
  readonly maximumVisibleTargets: number;
}

export const DEFAULT_ACID_PROJECTILE_CONFIG: Readonly<AcidProjectileConfig> = {
  maximumRangeMetres: 75,
  projectileSpeedMetresPerSecond: 18,
  projectileRadiusMetres: 0.1,
  // A default shot needs just over 4.1 seconds to cover the full 75 m range.
  projectileLifetimeSeconds: 4.2,
  fireCooldownSeconds: 0.45,
  launchClearanceMetres: 0.02,
  aimProbeRadiusMetres: 0.001,
  // Ten slots preserve cooldown-paced firing throughout that longer flight.
  maximumLiveProjectiles: 10,
  maximumVisibleTargets: 16,
};

export interface ReadonlyVector3State {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface MutableVector3State {
  x: number;
  y: number;
  z: number;
}

export interface AcidAimReadModel {
  readonly active: boolean;
  readonly aimOrigin: ReadonlyVector3State;
  readonly aimDirection: ReadonlyVector3State;
  readonly aimPoint: ReadonlyVector3State;
  readonly maximumRangeMetres: number;
  readonly targetedSolubleId: string | undefined;
  readonly visibleSolubleIds: readonly string[];
  readonly canFire: boolean;
  /** Zero immediately after firing and one when the cooldown is ready. */
  readonly cooldownProgress: number;
  readonly cooldownRemainingSeconds: number;
}

interface MutableAcidAimReadModel {
  active: boolean;
  readonly aimOrigin: MutableVector3State;
  readonly aimDirection: MutableVector3State;
  readonly aimPoint: MutableVector3State;
  readonly maximumRangeMetres: number;
  targetedSolubleId: string | undefined;
  readonly visibleSolubleIds: string[];
  canFire: boolean;
  cooldownProgress: number;
  cooldownRemainingSeconds: number;
}

export interface AcidProjectileReadState {
  readonly id: number;
  readonly active: boolean;
  readonly position: ReadonlyVector3State;
  readonly previousPosition: ReadonlyVector3State;
  readonly direction: ReadonlyVector3State;
}

interface MutableAcidProjectileReadState {
  id: number;
  active: boolean;
  readonly position: MutableVector3State;
  readonly previousPosition: MutableVector3State;
  readonly direction: MutableVector3State;
}

interface AcidProjectileSlot {
  readonly state: MutableAcidProjectileReadState;
  readonly position: THREE.Vector3;
  readonly previousPosition: THREE.Vector3;
  readonly direction: THREE.Vector3;
  ageSeconds: number;
  distanceTravelledMetres: number;
}

export interface AcidProjectileControls {
  readonly aimHeld: boolean;
  readonly firePressed: boolean;
  readonly gameplayInputEnabled: boolean;
  readonly pointerLocked: boolean;
}

export interface AcidProjectileBody {
  readonly position: ReadonlyVector3State;
  readonly radiusMetres: number;
}

export interface AcidSlimeManager<Body extends AcidProjectileBody> {
  readonly activeSlimeId: string | undefined;
  readonly activeBody: Body | undefined;
  canActiveUseAbility(ability: 'dissolve'): boolean;
}

export interface AimRayProvider {
  copyAimRay(origin: THREE.Vector3, direction: THREE.Vector3): void;
}

interface PointEventPayload {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AcidProjectileEvents {
  aimEntered: Record<string, never>;
  aimExited: Record<string, never>;
  projectileFired: {
    readonly projectileId: number;
    readonly position: PointEventPayload;
    readonly direction: PointEventPayload;
  };
  solubleImpact: {
    readonly projectileId: number;
    readonly targetId: string;
    readonly point: PointEventPayload;
    readonly burnStarted: boolean;
  };
  worldImpact: {
    readonly projectileId: number;
    readonly objectName: string;
    readonly authoringRole?: string;
    readonly point: PointEventPayload;
  };
  burnStarted: { readonly targetId: string };
  burnCompleted: { readonly targetId: string };
  burnReset: { readonly targetId: string };
}

export interface AcidProjectileSystemOptions<Body extends AcidProjectileBody> {
  readonly slimeManager: AcidSlimeManager<Body>;
  readonly collisionWorld: CollisionWorld;
  readonly dissolveSystem: DissolveSystem;
  readonly aimRayProvider: AimRayProvider;
  readonly config?: Partial<AcidProjectileConfig>;
  readonly isTargetEnabled?: (target: DissolveTarget) => boolean;
}

export interface AcidProjectileDiagnostics {
  readonly aimActive: boolean;
  readonly targetedSolubleId: string;
  readonly visibleTargetCount: number;
  readonly visibilityProbeCount: number;
  readonly liveProjectileCount: number;
  readonly activeBurnCount: number;
  readonly cooldownRemainingSeconds: number;
  readonly firedCount: number;
  readonly solubleImpactCount: number;
  readonly worldImpactCount: number;
}

/**
 * Goop-only fixed-step aim and acid-projectile authority.
 *
 * Camera collision chooses a presentation aim point. A separate swept sphere
 * launched from Goop's real body position remains authoritative for impacts,
 * so an offset camera can never shoot around nearby world geometry.
 */
export class AcidProjectileSystem<Body extends AcidProjectileBody> {
  readonly events = new EventBus<AcidProjectileEvents>();

  private readonly slimeManager: AcidSlimeManager<Body>;
  private readonly collisionWorld: CollisionWorld;
  private readonly dissolveSystem: DissolveSystem;
  private readonly aimRayProvider: AimRayProvider;
  private readonly config: AcidProjectileConfig;
  private readonly isTargetEnabled: (target: DissolveTarget) => boolean;
  private readonly projectiles: AcidProjectileSlot[];
  private readonly projectileReadStates: readonly AcidProjectileReadState[];
  private readonly unsubscribeBurnEvents: readonly (() => void)[];

  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3(0, 0, -1);
  private readonly aimDisplacement = new THREE.Vector3();
  private readonly aimPoint = new THREE.Vector3();
  private readonly targetPoint = new THREE.Vector3();
  private readonly rangePoint = new THREE.Vector3();
  private readonly candidateDisplacement = new THREE.Vector3();
  private readonly launchDirection = new THREE.Vector3();
  private readonly launchDisplacement = new THREE.Vector3();
  private readonly launchPosition = new THREE.Vector3();
  private readonly projectileDisplacement = new THREE.Vector3();
  private readonly aimHit = new CollisionHit();
  private readonly candidateHit = new CollisionHit();
  private readonly launchHit = new CollisionHit();
  private readonly projectileHit = new CollisionHit();

  private readonly aimReadModelValue: MutableAcidAimReadModel;
  private cooldownRemainingSecondsValue = 0;
  private nextProjectileId = 1;
  private firedCount = 0;
  private solubleImpactCount = 0;
  private worldImpactCount = 0;
  private visibilityProbeCountValue = 0;
  private disposed = false;

  constructor(options: AcidProjectileSystemOptions<Body>) {
    this.slimeManager = options.slimeManager;
    this.collisionWorld = options.collisionWorld;
    this.dissolveSystem = options.dissolveSystem;
    this.aimRayProvider = options.aimRayProvider;
    this.isTargetEnabled = options.isTargetEnabled ?? (() => true);
    this.config = {
      ...DEFAULT_ACID_PROJECTILE_CONFIG,
      ...options.config,
    };
    this.validateConfig();

    this.aimReadModelValue = {
      active: false,
      aimOrigin: createVectorState(),
      aimDirection: createVectorState(0, 0, -1),
      aimPoint: createVectorState(),
      maximumRangeMetres: this.config.maximumRangeMetres,
      targetedSolubleId: undefined,
      visibleSolubleIds: [],
      canFire: false,
      cooldownProgress: 1,
      cooldownRemainingSeconds: 0,
    };

    this.projectiles = Array.from(
      { length: this.config.maximumLiveProjectiles },
      () => createProjectileSlot(),
    );
    this.projectileReadStates = this.projectiles.map(
      (projectile) => projectile.state,
    );

    this.unsubscribeBurnEvents = [
      this.dissolveSystem.events.on('burnStarted', ({ target }) => {
        this.events.emit('burnStarted', { targetId: target.id });
      }),
      this.dissolveSystem.events.on('burnCompleted', ({ target }) => {
        this.events.emit('burnCompleted', { targetId: target.id });
      }),
      this.dissolveSystem.events.on('burnReset', ({ target }) => {
        this.events.emit('burnReset', { targetId: target.id });
      }),
    ];
  }

  get aimReadModel(): AcidAimReadModel {
    return this.aimReadModelValue;
  }

  get projectileStates(): readonly AcidProjectileReadState[] {
    return this.projectileReadStates;
  }

  update(deltaSeconds: number, controls: AcidProjectileControls): void {
    this.assertNotDisposed('update acid projectiles');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'AcidProjectileSystem deltaSeconds must be positive and finite.',
      );
    }

    this.cooldownRemainingSecondsValue = Math.max(
      0,
      this.cooldownRemainingSecondsValue - deltaSeconds,
    );

    const canAim =
      controls.gameplayInputEnabled &&
      controls.pointerLocked &&
      controls.aimHeld &&
      this.slimeManager.activeSlimeId === 'goop' &&
      this.slimeManager.canActiveUseAbility('dissolve');

    this.setAimActive(canAim);
    if (canAim) {
      this.updateAimState();
      if (controls.firePressed && this.aimReadModelValue.canFire) {
        this.fireProjectile();
      }
    } else {
      this.clearAimTargetingState();
    }

    this.updateProjectiles(deltaSeconds);
    this.updateCooldownReadModel();
  }

  /** Immediately hide/cancel aim when another runtime owner takes control. */
  cancelAim(): void {
    if (this.disposed) return;
    this.setAimActive(false);
    this.clearAimTargetingState();
  }

  /** Clear transient shot state before the corresponding puzzle reset. */
  reset(): void {
    this.assertNotDisposed('reset acid projectiles');
    this.cancelAim();
    for (const projectile of this.projectiles) {
      this.deactivateProjectile(projectile);
    }
    this.cooldownRemainingSecondsValue = 0;
    this.updateCooldownReadModel();
  }

  getDiagnostics(): AcidProjectileDiagnostics {
    this.assertNotDisposed('read acid projectile diagnostics');
    return {
      aimActive: this.aimReadModelValue.active,
      targetedSolubleId:
        this.aimReadModelValue.targetedSolubleId ?? 'none',
      visibleTargetCount: this.aimReadModelValue.visibleSolubleIds.length,
      visibilityProbeCount: this.visibilityProbeCountValue,
      liveProjectileCount: this.projectiles.filter(
        (projectile) => projectile.state.active,
      ).length,
      activeBurnCount: this.dissolveSystem.activeBurnCount,
      cooldownRemainingSeconds: this.cooldownRemainingSecondsValue,
      firedCount: this.firedCount,
      solubleImpactCount: this.solubleImpactCount,
      worldImpactCount: this.worldImpactCount,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelAim();
    for (const unsubscribe of this.unsubscribeBurnEvents) unsubscribe();
    for (const projectile of this.projectiles) {
      this.deactivateProjectile(projectile);
    }
    this.events.clear();
    this.disposed = true;
  }

  private updateAimState(): void {
    this.aimRayProvider.copyAimRay(this.aimOrigin, this.aimDirection);
    if (this.aimDirection.lengthSq() <= DISTANCE_EPSILON) {
      this.aimDirection.set(0, 0, -1);
    } else {
      this.aimDirection.normalize();
    }

    this.aimDisplacement
      .copy(this.aimDirection)
      .multiplyScalar(this.config.maximumRangeMetres);
    if (
      this.collisionWorld.sweepSphere(
        this.aimOrigin,
        this.aimDisplacement,
        this.config.aimProbeRadiusMetres,
        this.aimHit,
        CollisionLayer.CameraObstruction,
      )
    ) {
      this.aimPoint.copy(this.aimHit.point);
    } else {
      this.aimPoint.copy(this.aimOrigin).add(this.aimDisplacement);
    }

    writeVectorState(this.aimReadModelValue.aimOrigin, this.aimOrigin);
    writeVectorState(this.aimReadModelValue.aimDirection, this.aimDirection);
    writeVectorState(this.aimReadModelValue.aimPoint, this.aimPoint);
    const aimedTarget = this.aimHit.object
      ? this.dissolveSystem.getTargetForMesh(this.aimHit.object)
      : undefined;
    this.updateVisibleTargets(aimedTarget);
    this.aimReadModelValue.targetedSolubleId =
      aimedTarget &&
      this.aimReadModelValue.visibleSolubleIds.includes(aimedTarget.id)
        ? aimedTarget.id
        : undefined;
    this.updateCooldownReadModel();
  }

  private updateVisibleTargets(aimedTarget: DissolveTarget | undefined): void {
    const visibleIds = this.aimReadModelValue.visibleSolubleIds;
    visibleIds.length = 0;
    this.visibilityProbeCountValue = 0;
    const activeBody = this.slimeManager.activeBody;
    if (!activeBody) return;

    // The main camera-ray sweep already proved this target is unobstructed.
    // Seed it before bounded secondary probes so registration order can never
    // suppress the target directly under the crosshair.
    if (
      aimedTarget &&
      this.isAvailableTargetInRange(aimedTarget, activeBody)
    ) {
      visibleIds.push(aimedTarget.id);
    }

    for (const target of this.dissolveSystem.registeredTargets) {
      if (visibleIds.length >= this.config.maximumVisibleTargets) break;
      if (target === aimedTarget) continue;
      if (!this.isAvailableTargetInRange(target, activeBody)) continue;

      // Probe the representative centre instead of the point nearest the
      // camera. On a hanging rope, the nearest point is its lower tip, which
      // can be hidden by the suspended platform even while most of the rope is
      // plainly visible and shootable.
      target.copyWorldBoundsCenter(this.targetPoint);
      this.candidateDisplacement.subVectors(
        this.targetPoint,
        this.aimOrigin,
      );
      if (this.candidateDisplacement.lengthSq() <= DISTANCE_EPSILON) {
        visibleIds.push(target.id);
        continue;
      }

      // Bound expensive occlusion sweeps independently from successful
      // results. Otherwise a long run of occluded candidates could probe every
      // registered target even though visibleIds itself is capped.
      if (
        this.visibilityProbeCountValue >=
        this.config.maximumVisibleTargets
      ) {
        break;
      }
      this.visibilityProbeCountValue += 1;
      const hasHit = this.collisionWorld.sweepSphere(
        this.aimOrigin,
        this.candidateDisplacement,
        this.config.aimProbeRadiusMetres,
        this.candidateHit,
        CollisionLayer.CameraObstruction,
      );
      if (hasHit && this.candidateHit.object === target.mesh) {
        visibleIds.push(target.id);
      }
    }
  }

  private isAvailableTargetInRange(
    target: DissolveTarget,
    activeBody: Body,
  ): boolean {
    if (
      !this.isTargetEnabled(target) ||
      target.completed ||
      !target.collisionEnabled ||
      !target.mesh.visible
    ) {
      return false;
    }

    target.copyClosestWorldPoint(activeBody.position, this.rangePoint);
    return (
      this.rangePoint.distanceToSquared(activeBody.position) <=
      this.config.maximumRangeMetres * this.config.maximumRangeMetres
    );
  }

  private fireProjectile(): void {
    const activeBody = this.slimeManager.activeBody;
    const projectile = this.projectiles.find((item) => !item.state.active);
    if (!activeBody || !projectile) return;

    this.launchDirection.subVectors(this.aimPoint, activeBody.position);
    if (this.launchDirection.lengthSq() <= DISTANCE_EPSILON) {
      this.launchDirection.copy(this.aimDirection);
    } else {
      this.launchDirection.normalize();
    }

    const launchDistance =
      activeBody.radiusMetres +
      this.config.projectileRadiusMetres +
      this.config.launchClearanceMetres;
    this.launchDisplacement
      .copy(this.launchDirection)
      .multiplyScalar(launchDistance);

    const launchBlocked = this.collisionWorld.sweepSphere(
      vectorFromState(activeBody.position, this.launchPosition),
      this.launchDisplacement,
      this.config.projectileRadiusMetres,
      this.launchHit,
      CollisionLayer.Projectile,
    );
    if (launchBlocked) {
      this.launchPosition.copy(this.launchHit.point);
    } else {
      this.launchPosition.add(this.launchDisplacement);
    }

    this.activateProjectile(
      projectile,
      this.launchPosition,
      this.launchDirection,
    );
    this.cooldownRemainingSecondsValue = this.config.fireCooldownSeconds;
    this.firedCount += 1;
    this.events.emit('projectileFired', {
      projectileId: projectile.state.id,
      position: pointPayload(projectile.position),
      direction: pointPayload(projectile.direction),
    });

    if (launchBlocked) {
      this.resolveImpact(projectile, this.launchHit);
    }
  }

  private updateProjectiles(deltaSeconds: number): void {
    for (const projectile of this.projectiles) {
      if (!projectile.state.active) continue;

      const lifetimeRemaining = Math.max(
        0,
        this.config.projectileLifetimeSeconds - projectile.ageSeconds,
      );
      const rangeRemaining = Math.max(
        0,
        this.config.maximumRangeMetres -
          projectile.distanceTravelledMetres,
      );
      const movementDistance = Math.min(
        this.config.projectileSpeedMetresPerSecond *
          Math.min(deltaSeconds, lifetimeRemaining),
        rangeRemaining,
      );

      if (movementDistance <= DISTANCE_EPSILON) {
        this.deactivateProjectile(projectile);
        continue;
      }

      projectile.previousPosition.copy(projectile.position);
      this.projectileDisplacement
        .copy(projectile.direction)
        .multiplyScalar(movementDistance);

      if (
        this.collisionWorld.sweepSphere(
          projectile.position,
          this.projectileDisplacement,
          this.config.projectileRadiusMetres,
          this.projectileHit,
          CollisionLayer.Projectile,
        )
      ) {
        projectile.position.copy(this.projectileHit.point);
        projectile.distanceTravelledMetres += this.projectileHit.distance;
        projectile.ageSeconds += deltaSeconds * this.projectileHit.fraction;
        this.syncProjectileReadState(projectile);
        this.resolveImpact(projectile, this.projectileHit);
        continue;
      }

      projectile.position.add(this.projectileDisplacement);
      projectile.distanceTravelledMetres += movementDistance;
      projectile.ageSeconds += Math.min(deltaSeconds, lifetimeRemaining);
      this.syncProjectileReadState(projectile);

      if (
        projectile.ageSeconds + COOLDOWN_EPSILON_SECONDS >=
          this.config.projectileLifetimeSeconds ||
        projectile.distanceTravelledMetres + DISTANCE_EPSILON >=
          this.config.maximumRangeMetres
      ) {
        this.deactivateProjectile(projectile);
      }
    }
  }

  private resolveImpact(
    projectile: AcidProjectileSlot,
    hit: CollisionHit,
  ): void {
    const target = hit.object
      ? this.dissolveSystem.getTargetForMesh(hit.object)
      : undefined;
    if (target && this.isTargetEnabled(target)) {
      const result = this.dissolveSystem.startBurn(target);
      this.solubleImpactCount += 1;
      this.events.emit('solubleImpact', {
        projectileId: projectile.state.id,
        targetId: target.id,
        point: pointPayload(hit.point),
        burnStarted: result === 'started',
      });
    } else {
      this.worldImpactCount += 1;
      this.events.emit('worldImpact', {
        projectileId: projectile.state.id,
        objectName: hit.object?.name || 'unnamed-world-collider',
        authoringRole: typeof hit.object?.userData.authoringRole === 'string'
          ? hit.object.userData.authoringRole
          : undefined,
        point: pointPayload(hit.point),
      });
    }
    this.deactivateProjectile(projectile);
  }

  private activateProjectile(
    projectile: AcidProjectileSlot,
    position: THREE.Vector3,
    direction: THREE.Vector3,
  ): void {
    projectile.state.id = this.nextProjectileId;
    this.nextProjectileId += 1;
    projectile.state.active = true;
    projectile.position.copy(position);
    projectile.previousPosition.copy(position);
    projectile.direction.copy(direction);
    projectile.ageSeconds = 0;
    projectile.distanceTravelledMetres = 0;
    this.syncProjectileReadState(projectile);
  }

  private deactivateProjectile(projectile: AcidProjectileSlot): void {
    projectile.state.active = false;
    projectile.ageSeconds = 0;
    projectile.distanceTravelledMetres = 0;
  }

  private syncProjectileReadState(projectile: AcidProjectileSlot): void {
    writeVectorState(projectile.state.position, projectile.position);
    writeVectorState(
      projectile.state.previousPosition,
      projectile.previousPosition,
    );
    writeVectorState(projectile.state.direction, projectile.direction);
  }

  private setAimActive(active: boolean): void {
    if (this.aimReadModelValue.active === active) return;
    this.aimReadModelValue.active = active;
    this.events.emit(active ? 'aimEntered' : 'aimExited', {});
  }

  private clearAimTargetingState(): void {
    this.aimReadModelValue.targetedSolubleId = undefined;
    this.aimReadModelValue.visibleSolubleIds.length = 0;
    this.visibilityProbeCountValue = 0;
    this.aimReadModelValue.canFire = false;
    this.updateCooldownReadModel();
  }

  private updateCooldownReadModel(): void {
    this.aimReadModelValue.cooldownRemainingSeconds =
      this.cooldownRemainingSecondsValue;
    this.aimReadModelValue.cooldownProgress = THREE.MathUtils.clamp(
      1 -
        this.cooldownRemainingSecondsValue /
          this.config.fireCooldownSeconds,
      0,
      1,
    );
    this.aimReadModelValue.canFire =
      this.aimReadModelValue.active &&
      this.cooldownRemainingSecondsValue <= COOLDOWN_EPSILON_SECONDS &&
      this.projectiles.some((projectile) => !projectile.state.active);
  }

  private validateConfig(): void {
    for (const [name, value] of [
      ['maximumRangeMetres', this.config.maximumRangeMetres],
      [
        'projectileSpeedMetresPerSecond',
        this.config.projectileSpeedMetresPerSecond,
      ],
      ['projectileRadiusMetres', this.config.projectileRadiusMetres],
      ['projectileLifetimeSeconds', this.config.projectileLifetimeSeconds],
      ['fireCooldownSeconds', this.config.fireCooldownSeconds],
      ['aimProbeRadiusMetres', this.config.aimProbeRadiusMetres],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive finite number.`);
      }
    }
    if (
      !Number.isFinite(this.config.launchClearanceMetres) ||
      this.config.launchClearanceMetres < 0
    ) {
      throw new Error(
        'launchClearanceMetres must be a non-negative finite number.',
      );
    }
    for (const [name, value] of [
      ['maximumLiveProjectiles', this.config.maximumLiveProjectiles],
      ['maximumVisibleTargets', this.config.maximumVisibleTargets],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
      }
    }
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(
        `Cannot ${operation} after AcidProjectileSystem disposal.`,
      );
    }
  }
}

function createVectorState(
  x = 0,
  y = 0,
  z = 0,
): MutableVector3State {
  return { x, y, z };
}

function createProjectileSlot(): AcidProjectileSlot {
  return {
    state: {
      id: 0,
      active: false,
      position: createVectorState(),
      previousPosition: createVectorState(),
      direction: createVectorState(0, 0, -1),
    },
    position: new THREE.Vector3(),
    previousPosition: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, -1),
    ageSeconds: 0,
    distanceTravelledMetres: 0,
  };
}

function writeVectorState(
  target: MutableVector3State,
  source: ReadonlyVector3State,
): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function vectorFromState(
  source: ReadonlyVector3State,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.set(source.x, source.y, source.z);
}

function pointPayload(source: ReadonlyVector3State): PointEventPayload {
  return { x: source.x, y: source.y, z: source.z };
}
