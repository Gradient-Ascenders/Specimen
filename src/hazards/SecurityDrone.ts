import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { DroneProjectileSystem } from './DroneProjectileSystem.ts';

const EPSILON = 1e-9;

export type DroneTargetPolicy = 'bob-only' | 'goop-only' | 'both';
export type SecurityDroneState =
  | 'scanning'
  | 'warning'
  | 'firing'
  | 'targetLost'
  | 'cooldown'
  | 'disabled';

export interface SecurityDroneTarget {
  readonly slimeId: 'bob' | 'goop';
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

export interface SecurityDroneConfig {
  readonly id: string;
  readonly type: 'ceiling' | 'ground';
  readonly initialPosition: THREE.Vector3;
  readonly initialRotation?: THREE.Euler;
  readonly colliderSize: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly scanAxis: THREE.Vector3;
  readonly scanHalfAngleRadians: number;
  readonly scanSpeedRadiansPerSecond: number;
  readonly detectionHalfAngleRadians: number;
  readonly detectionRangeMetres: number;
  readonly warningSeconds: number;
  readonly fireIntervalSeconds: number;
  readonly targetLossGraceSeconds: number;
  readonly cooldownSeconds: number;
  readonly muzzleAnchor: THREE.Vector3;
  readonly detectionAnchor?: THREE.Vector3;
  readonly targetPolicy: DroneTargetPolicy;
  readonly initialScanPhase: number;
}

export interface SecurityDroneReadModel {
  readonly id: string;
  readonly type: SecurityDroneConfig['type'];
  readonly enabled: boolean;
  readonly state: SecurityDroneState;
  readonly targetSlimeId: 'bob' | 'goop' | undefined;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly forward: { readonly x: number; readonly y: number; readonly z: number };
  readonly scanDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly detectionRangeMetres: number;
  readonly detectionHalfAngleRadians: number;
  readonly stateElapsedSeconds: number;
}

interface MutableReadModel {
  readonly id: string;
  readonly type: SecurityDroneConfig['type'];
  enabled: boolean;
  state: SecurityDroneState;
  targetSlimeId: 'bob' | 'goop' | undefined;
  readonly position: { x: number; y: number; z: number };
  readonly forward: { x: number; y: number; z: number };
  readonly scanDirection: { x: number; y: number; z: number };
  readonly detectionRangeMetres: number;
  readonly detectionHalfAngleRadians: number;
  stateElapsedSeconds: number;
}

export interface SecurityDroneEvents {
  stateChanged: {
    readonly droneId: string;
    readonly previousState: SecurityDroneState;
    readonly state: SecurityDroneState;
  };
  acquired: { readonly droneId: string; readonly slimeId: 'bob' | 'goop' };
  lost: { readonly droneId: string; readonly slimeId: 'bob' | 'goop' };
  warning: { readonly droneId: string; readonly slimeId: 'bob' | 'goop' };
  fired: { readonly droneId: string; readonly slimeId: 'bob' | 'goop' };
  reset: { readonly droneId: string };
}

/** Predictable fixed turret with bounded target candidates and authored LOS. */
export class SecurityDrone {
  readonly root = new THREE.Group();
  readonly events = new EventBus<SecurityDroneEvents>();
  readonly collider: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  readonly frontIndicator: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  readonly readModel: SecurityDroneReadModel;
  readonly id: string;

  private readonly config: SecurityDroneConfig;
  private readonly world: CollisionWorld;
  private readonly surfaces: SurfaceRegistry;
  private readonly projectiles: DroneProjectileSystem;
  private readonly model: MutableReadModel;
  private readonly initialQuaternion = new THREE.Quaternion();
  private readonly maximumAcquisitionAngleCos: number;
  private readonly baseForward = new THREE.Vector3();
  private readonly scanAxis = new THREE.Vector3();
  private readonly scanDirection = new THREE.Vector3();
  private readonly targetDirection = new THREE.Vector3();
  private readonly detectionOrigin = new THREE.Vector3();
  private readonly muzzlePosition = new THREE.Vector3();
  private readonly displacement = new THREE.Vector3();
  private readonly localAnchor = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();
  private readonly hit = new CollisionHit();
  private state: SecurityDroneState = 'scanning';
  private target: SecurityDroneTarget | undefined;
  private scanPhase: number;
  private stateElapsed = 0;
  private targetLossElapsed = 0;
  private fireElapsed = 0;
  private enabled = true;
  private disposed = false;

  constructor(
    config: SecurityDroneConfig,
    world: CollisionWorld,
    surfaces: SurfaceRegistry,
    projectiles: DroneProjectileSystem,
  ) {
    validateConfig(config);
    this.config = config;
    this.id = config.id;
    this.world = world;
    this.surfaces = surfaces;
    this.projectiles = projectiles;
    this.baseForward.copy(config.forward).normalize();
    this.scanAxis.copy(config.scanAxis).normalize();
    this.maximumAcquisitionAngleCos = Math.cos(Math.min(
      Math.PI,
      config.scanHalfAngleRadians + config.detectionHalfAngleRadians,
    ));
    this.scanPhase = normalizePhase(config.initialScanPhase);
    this.initialQuaternion.setFromEuler(config.initialRotation ?? new THREE.Euler());

    this.root.name = `${config.id}-runtime`;
    this.root.position.copy(config.initialPosition);
    this.root.quaternion.copy(this.initialQuaternion);
    this.collider = new THREE.Mesh(
      new THREE.BoxGeometry(config.colliderSize.x, config.colliderSize.y, config.colliderSize.z),
      new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 0.62, metalness: 0.55 }),
    );
    this.collider.name = `${config.id}-body`;
    this.collider.userData.authoringRole = 'acid-resistant-drone';
    this.collider.userData.droneId = config.id;
    this.collider.userData.soluble = false;
    this.collider.userData.surfaceTag = 'default';
    this.frontIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3048, toneMapped: false }),
    );
    this.frontIndicator.name = `${config.id}-front-indicator`;
    const indicatorDistance =
      Math.abs(this.baseForward.x) * config.colliderSize.x * 0.5 +
      Math.abs(this.baseForward.y) * config.colliderSize.y * 0.5 +
      Math.abs(this.baseForward.z) * config.colliderSize.z * 0.5 +
      0.08;
    this.frontIndicator.position.copy(this.baseForward).multiplyScalar(indicatorDistance);
    this.frontIndicator.userData.presentationOnly = true;
    this.frontIndicator.userData.droneId = config.id;
    this.root.add(this.collider, this.frontIndicator);
    this.world.register(this.collider);
    this.surfaces.register(this.collider);

    this.model = {
      id: config.id,
      type: config.type,
      enabled: true,
      state: 'scanning',
      targetSlimeId: undefined,
      position: { x: 0, y: 0, z: 0 },
      forward: { x: this.baseForward.x, y: this.baseForward.y, z: this.baseForward.z },
      scanDirection: { x: 0, y: 0, z: -1 },
      detectionRangeMetres: config.detectionRangeMetres,
      detectionHalfAngleRadians: config.detectionHalfAngleRadians,
      stateElapsedSeconds: 0,
    };
    this.readModel = this.model;
    this.updateScanningDirection();
    this.syncReadModel();
  }

  update(deltaSeconds: number, targets: readonly SecurityDroneTarget[]): void {
    this.assertActive('update drone');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('Security drone deltaSeconds must be positive and finite.');
    }
    if (!this.enabled) return;
    this.stateElapsed += deltaSeconds;

    if (this.state === 'scanning') {
      this.advanceScan(deltaSeconds);
      const candidate = this.selectTarget(targets);
      if (candidate) this.acquire(candidate);
    } else if (this.state === 'warning') {
      if (!this.validateCurrentTarget()) {
        this.targetLossElapsed += deltaSeconds;
        if (this.targetLossElapsed + EPSILON >= this.config.targetLossGraceSeconds) {
          this.loseTarget();
        }
      } else {
        this.targetLossElapsed = 0;
        this.trackTarget();
        if (this.stateElapsed + EPSILON >= this.config.warningSeconds) {
          this.transition('firing');
          this.fireElapsed = this.config.fireIntervalSeconds;
        }
      }
    } else if (this.state === 'firing') {
      const valid = this.validateCurrentTarget();
      this.targetLossElapsed = valid ? 0 : this.targetLossElapsed + deltaSeconds;
      if (valid) this.trackTarget();
      if (!valid && this.targetLossElapsed + EPSILON >= this.config.targetLossGraceSeconds) {
        this.loseTarget();
      } else {
        this.fireElapsed += deltaSeconds;
        while (this.fireElapsed + EPSILON >= this.config.fireIntervalSeconds) {
          this.fireElapsed -= this.config.fireIntervalSeconds;
          this.fire();
        }
      }
    } else if (this.state === 'targetLost') {
      this.transition('cooldown');
    } else if (this.state === 'cooldown') {
      if (this.stateElapsed + EPSILON >= this.config.cooldownSeconds) {
        this.transition('scanning');
      }
    }
    this.syncReadModel();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.projectiles.despawnOwner(this.id);
      this.target = undefined;
      this.transition('disabled');
    } else {
      this.transition('scanning');
      this.targetLossElapsed = 0;
      this.fireElapsed = 0;
      this.updateScanningDirection();
    }
    this.syncReadModel();
  }

  reset(): void {
    if (this.disposed) return;
    this.projectiles.despawnOwner(this.id);
    this.root.position.copy(this.config.initialPosition);
    this.root.quaternion.copy(this.initialQuaternion);
    this.scanPhase = normalizePhase(this.config.initialScanPhase);
    this.target = undefined;
    this.targetLossElapsed = 0;
    this.fireElapsed = 0;
    this.enabled = true;
    this.transition('scanning');
    this.stateElapsed = 0;
    this.updateScanningDirection();
    this.syncReadModel();
    this.events.emit('reset', { droneId: this.id });
  }

  dispose(): void {
    if (this.disposed) return;
    this.projectiles.despawnOwner(this.id);
    this.world.unregister(this.collider);
    this.surfaces.unregister(this.collider);
    this.events.clear();
    this.root.removeFromParent();
    this.root.clear();
    this.collider.geometry.dispose();
    this.collider.material.dispose();
    this.frontIndicator.geometry.dispose();
    this.frontIndicator.material.dispose();
    this.target = undefined;
    this.disposed = true;
  }

  private advanceScan(deltaSeconds: number): void {
    const cycleRadians = this.config.scanHalfAngleRadians * 4;
    this.scanPhase = normalizePhase(
      this.scanPhase + this.config.scanSpeedRadiansPerSecond * deltaSeconds / cycleRadians,
    );
    this.updateScanningDirection();
  }

  private updateScanningDirection(): void {
    const triangle = 1 - 4 * Math.abs(this.scanPhase - 0.5);
    this.scanDirection.copy(this.baseForward).applyAxisAngle(
      this.scanAxis,
      triangle * this.config.scanHalfAngleRadians,
    ).normalize();
  }

  private selectTarget(targets: readonly SecurityDroneTarget[]): SecurityDroneTarget | undefined {
    let selected: SecurityDroneTarget | undefined;
    let selectedDistanceSquared = Number.POSITIVE_INFINITY;
    for (const candidate of targets) {
      if (!this.policyAllows(candidate.slimeId) || !this.canSee(candidate)) continue;
      const distanceSquared = this.displacement.set(
        candidate.position.x - this.detectionOrigin.x,
        candidate.position.y - this.detectionOrigin.y,
        candidate.position.z - this.detectionOrigin.z,
      ).lengthSq();
      if (
        distanceSquared < selectedDistanceSquared - EPSILON ||
        (Math.abs(distanceSquared - selectedDistanceSquared) <= EPSILON &&
          candidate.slimeId.localeCompare(selected?.slimeId ?? '') < 0)
      ) {
        selected = candidate;
        selectedDistanceSquared = distanceSquared;
      }
    }
    return selected;
  }

  private acquire(target: SecurityDroneTarget): void {
    this.target = target;
    this.targetLossElapsed = 0;
    this.trackTarget();
    this.transition('warning');
    this.events.emit('acquired', { droneId: this.id, slimeId: target.slimeId });
    this.events.emit('warning', { droneId: this.id, slimeId: target.slimeId });
  }

  private loseTarget(): void {
    const slimeId = this.target?.slimeId;
    this.target = undefined;
    this.targetLossElapsed = 0;
    this.transition('targetLost');
    if (slimeId) this.events.emit('lost', { droneId: this.id, slimeId });
  }

  private validateCurrentTarget(): boolean {
    return this.target !== undefined && this.policyAllows(this.target.slimeId) && this.canSee(this.target);
  }

  private canSee(target: SecurityDroneTarget): boolean {
    this.copyAnchor(this.config.detectionAnchor, this.detectionOrigin);
    this.displacement.set(
      target.position.x - this.detectionOrigin.x,
      target.position.y - this.detectionOrigin.y,
      target.position.z - this.detectionOrigin.z,
    );
    const distanceSquared = this.displacement.lengthSq();
    if (
      distanceSquared <= EPSILON ||
      distanceSquared > this.config.detectionRangeMetres * this.config.detectionRangeMetres
    ) return false;
    this.targetDirection.copy(this.displacement).normalize();
    if (this.targetDirection.dot(this.baseForward) < this.maximumAcquisitionAngleCos) {
      return false;
    }
    if (this.targetDirection.dot(this.scanDirection) < Math.cos(this.config.detectionHalfAngleRadians)) {
      return false;
    }
    return !this.world.sweepSphere(
      this.detectionOrigin,
      this.displacement,
      0.001,
      this.hit,
      CollisionLayer.LineOfSight,
      this.collider,
    );
  }

  private trackTarget(): void {
    if (!this.target) return;
    this.copyAnchor(this.config.detectionAnchor, this.detectionOrigin);
    this.scanDirection.set(
      this.target.position.x - this.detectionOrigin.x,
      this.target.position.y - this.detectionOrigin.y,
      this.target.position.z - this.detectionOrigin.z,
    );
    if (this.scanDirection.lengthSq() > EPSILON) this.scanDirection.normalize();
  }

  private fire(): void {
    if (!this.target) return;
    this.copyAnchor(this.config.muzzleAnchor, this.muzzlePosition);
    this.targetDirection.set(
      this.target.position.x - this.muzzlePosition.x,
      this.target.position.y - this.muzzlePosition.y,
      this.target.position.z - this.muzzlePosition.z,
    );
    if (!this.projectiles.spawn(this.id, this.collider, this.muzzlePosition, this.targetDirection)) return;
    this.events.emit('fired', { droneId: this.id, slimeId: this.target.slimeId });
  }

  private copyAnchor(anchor: THREE.Vector3 | undefined, target: THREE.Vector3): void {
    this.localAnchor.copy(anchor ?? this.config.muzzleAnchor);
    this.root.updateWorldMatrix(true, false);
    target.copy(this.localAnchor).applyMatrix4(this.root.matrixWorld);
  }

  private transition(state: SecurityDroneState): void {
    if (this.state === state) return;
    const previousState = this.state;
    this.state = state;
    this.stateElapsed = 0;
    this.events.emit('stateChanged', { droneId: this.id, previousState, state });
  }

  /** Clears acquired targets and live fire without changing authored pose. */
  cancelTransientState(): void {
    if (this.disposed) return;
    this.projectiles.despawnOwner(this.id);
    this.target = undefined;
    this.targetLossElapsed = 0;
    this.fireElapsed = 0;
    if (this.enabled) {
      this.transition('scanning');
      this.stateElapsed = 0;
      this.updateScanningDirection();
    }
    this.syncReadModel();
  }

  private policyAllows(slimeId: 'bob' | 'goop'): boolean {
    return this.config.targetPolicy === 'both' || this.config.targetPolicy === `${slimeId}-only`;
  }

  private syncReadModel(): void {
    this.model.enabled = this.enabled;
    this.model.state = this.state;
    this.model.targetSlimeId = this.target?.slimeId;
    this.model.stateElapsedSeconds = this.stateElapsed;
    this.root.getWorldPosition(this.worldPosition);
    write(this.model.position, this.worldPosition);
    write(this.model.scanDirection, this.scanDirection);
  }

  private assertActive(operation: string): void {
    if (this.disposed) throw new Error(`Cannot ${operation} after drone disposal.`);
  }
}

function normalizePhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

function write(
  target: { x: number; y: number; z: number },
  source: { readonly x: number; readonly y: number; readonly z: number },
): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function validateConfig(config: SecurityDroneConfig): void {
  if (!config.id) throw new Error('Security drone IDs cannot be empty.');
  if (config.forward.lengthSq() <= EPSILON || config.scanAxis.lengthSq() <= EPSILON) {
    throw new Error(`Security drone "${config.id}" directions must be non-zero.`);
  }
  if (config.colliderSize.x <= 0 || config.colliderSize.y <= 0 || config.colliderSize.z <= 0) {
    throw new Error(`Security drone "${config.id}" collider size must be positive.`);
  }
  for (const [label, value] of [
    ['scanHalfAngleRadians', config.scanHalfAngleRadians],
    ['scanSpeedRadiansPerSecond', config.scanSpeedRadiansPerSecond],
    ['detectionHalfAngleRadians', config.detectionHalfAngleRadians],
    ['detectionRangeMetres', config.detectionRangeMetres],
    ['warningSeconds', config.warningSeconds],
    ['fireIntervalSeconds', config.fireIntervalSeconds],
    ['targetLossGraceSeconds', config.targetLossGraceSeconds],
    ['cooldownSeconds', config.cooldownSeconds],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Security drone ${label} must be positive and finite.`);
    }
  }
  if (!Number.isFinite(config.initialScanPhase)) {
    throw new Error('Security drone scan phase must be finite.');
  }
}
