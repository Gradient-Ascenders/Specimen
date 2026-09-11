import * as THREE from 'three';

import {
  CollisionHit,
  CollisionLayer,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type { ReadonlyVector3State } from '../physics/KinematicBody.ts';
import {
  DEFAULT_MAINTENANCE_DRONE_FLIGHT_CONFIG,
  type MaintenanceDroneFlightConfig,
} from './MaintenanceDroneTypes.ts';

const EPSILON_SQ = 1e-12;
const CONTACT_PUSH_METRES = 1e-5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface MaintenanceDroneFlightBodyOptions {
  readonly world: CollisionWorld;
  readonly root: THREE.Object3D;
  readonly collider: THREE.Mesh;
  readonly config?: Partial<MaintenanceDroneFlightConfig>;
}

/**
 * Upright deterministic kinematic flight/fall body derived from the authored
 * maintenance-drone collider. The conservative sphere means the same physical
 * authored dimensions block walls and the narrow Room 1 vent.
 */
export class MaintenanceDroneFlightBody {
  readonly clearanceRadiusMetres: number;

  private readonly world: CollisionWorld;
  private readonly root: THREE.Object3D;
  private readonly config: MaintenanceDroneFlightConfig;
  private readonly centreOffset = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly previousCentre = new THREE.Vector3();
  private readonly velocityValue = new THREE.Vector3();
  private readonly displacement = new THREE.Vector3();
  private readonly remaining = new THREE.Vector3();
  private readonly desiredHorizontal = new THREE.Vector3();
  private readonly horizontalVelocity = new THREE.Vector3();
  private readonly velocityDelta = new THREE.Vector3();
  private readonly hit = new CollisionHit();
  private supportedValue = false;

  constructor(options: MaintenanceDroneFlightBodyOptions) {
    this.world = options.world;
    this.root = options.root;
    this.config = {
      ...DEFAULT_MAINTENANCE_DRONE_FLIGHT_CONFIG,
      ...options.config,
    };
    this.validateConfig();

    options.root.updateWorldMatrix(true, true);
    if (!options.collider.geometry.boundingBox) {
      options.collider.geometry.computeBoundingBox();
    }
    const localBounds = options.collider.geometry.boundingBox;
    if (!localBounds) {
      throw new Error('Maintenance drone collider requires bounding bounds.');
    }

    const worldBounds = new THREE.Box3().setFromObject(options.collider);
    const size = worldBounds.getSize(new THREE.Vector3());
    this.clearanceRadiusMetres =
      Math.max(size.x, size.y, size.z) * 0.5 +
      this.config.collisionSkinMetres;
    if (
      !Number.isFinite(this.clearanceRadiusMetres) ||
      this.clearanceRadiusMetres <= 0
    ) {
      throw new Error('Maintenance drone collider produced invalid clearance.');
    }

    const rootWorld = options.root.getWorldPosition(new THREE.Vector3());
    worldBounds.getCenter(this.centre);
    this.centreOffset.subVectors(this.centre, rootWorld);
    this.previousCentre.copy(this.centre);
  }

  get position(): ReadonlyVector3State {
    return this.centre;
  }

  get previousPosition(): ReadonlyVector3State {
    return this.previousCentre;
  }

  get velocity(): ReadonlyVector3State {
    return this.velocityValue;
  }

  get supported(): boolean {
    return this.supportedValue;
  }

  get horizontalSpeedMetresPerSecond(): number {
    return Math.hypot(this.velocityValue.x, this.velocityValue.z);
  }

  get verticalSpeedMetresPerSecond(): number {
    return this.velocityValue.y;
  }

  updatePowered(
    deltaSeconds: number,
    horizontalDirection: ReadonlyVector3State,
    verticalInput: number,
    frozenForAim: boolean,
  ): void {
    this.validateDelta(deltaSeconds);
    this.beginStep();

    if (frozenForAim) {
      this.velocityValue.set(0, 0, 0);
    } else {
      this.updatePoweredVelocity(
        deltaSeconds,
        horizontalDirection,
        verticalInput,
      );
    }

    this.displacement
      .copy(this.velocityValue)
      .multiplyScalar(deltaSeconds);
    this.moveAndSlide(this.displacement);
    this.supportedValue = false;
  }

  moveKinematically(displacement: ReadonlyVector3State): void {
    if (
      !Number.isFinite(displacement.x) ||
      !Number.isFinite(displacement.y) ||
      !Number.isFinite(displacement.z)
    ) {
      throw new Error('Maintenance drone displacement must be finite.');
    }
    this.beginStep();
    this.velocityValue.set(0, 0, 0);
    this.displacement.set(displacement.x, displacement.y, displacement.z);
    this.moveAndSlide(this.displacement);
  }

  updateFalling(deltaSeconds: number): boolean {
    this.validateDelta(deltaSeconds);
    this.beginStep();
    this.velocityValue.x = moveTowards(
      this.velocityValue.x,
      0,
      this.config.brakingMetresPerSecondSquared * deltaSeconds,
    );
    this.velocityValue.z = moveTowards(
      this.velocityValue.z,
      0,
      this.config.brakingMetresPerSecondSquared * deltaSeconds,
    );
    this.velocityValue.y = Math.max(
      -this.config.maximumFallSpeedMetresPerSecond,
      this.velocityValue.y -
        this.config.fallingGravityMetresPerSecondSquared * deltaSeconds,
    );

    this.displacement
      .copy(this.velocityValue)
      .multiplyScalar(deltaSeconds);
    this.supportedValue = false;
    this.moveAndSlide(this.displacement, true);
    return this.supportedValue;
  }

  park(): void {
    this.velocityValue.set(0, 0, 0);
    this.previousCentre.copy(this.centre);
  }

  teleport(position: ReadonlyVector3State): void {
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new Error('Maintenance drone teleport position must be finite.');
    }
    this.centre.set(position.x, position.y, position.z);
    this.previousCentre.copy(this.centre);
    this.velocityValue.set(0, 0, 0);
    this.supportedValue = false;
    this.syncRootFromCentre();
  }

  private beginStep(): void {
    this.previousCentre.copy(this.centre);
  }

  private updatePoweredVelocity(
    deltaSeconds: number,
    horizontalDirection: ReadonlyVector3State,
    verticalInput: number,
  ): void {
    this.desiredHorizontal.set(
      horizontalDirection.x,
      0,
      horizontalDirection.z,
    );
    if (this.desiredHorizontal.lengthSq() > 1) {
      this.desiredHorizontal.normalize();
    }

    this.horizontalVelocity.set(
      this.velocityValue.x,
      0,
      this.velocityValue.z,
    );

    if (this.desiredHorizontal.lengthSq() > EPSILON_SQ) {
      this.desiredHorizontal
        .normalize()
        .multiplyScalar(
          this.config.maximumHorizontalSpeedMetresPerSecond,
        );
      this.velocityDelta
        .subVectors(this.desiredHorizontal, this.horizontalVelocity);
      clampVectorLength(
        this.velocityDelta,
        this.config.horizontalAccelerationMetresPerSecondSquared *
          deltaSeconds,
      );
      this.horizontalVelocity.add(this.velocityDelta);
    } else {
      moveVectorTowardsZero(
        this.horizontalVelocity,
        this.config.brakingMetresPerSecondSquared * deltaSeconds,
      );
    }

    this.velocityValue.x = this.horizontalVelocity.x;
    this.velocityValue.z = this.horizontalVelocity.z;

    const clampedVertical = THREE.MathUtils.clamp(verticalInput, -1, 1);
    const verticalTarget =
      clampedVertical *
      this.config.maximumVerticalSpeedMetresPerSecond;
    const verticalAcceleration =
      clampedVertical === 0
        ? this.config.brakingMetresPerSecondSquared
        : this.config.verticalAccelerationMetresPerSecondSquared;
    this.velocityValue.y = moveTowards(
      this.velocityValue.y,
      verticalTarget,
      verticalAcceleration * deltaSeconds,
    );
  }

  private moveAndSlide(
    displacement: THREE.Vector3,
    falling = false,
  ): void {
    this.remaining.copy(displacement);
    for (
      let iteration = 0;
      iteration < this.config.maximumCollisionIterations;
      iteration += 1
    ) {
      if (this.remaining.lengthSq() <= EPSILON_SQ) break;

      if (
        !this.world.sweepSphere(
          this.centre,
          this.remaining,
          this.clearanceRadiusMetres,
          this.hit,
          CollisionLayer.Movement,
        )
      ) {
        this.centre.add(this.remaining);
        this.remaining.set(0, 0, 0);
        break;
      }

      const fraction = THREE.MathUtils.clamp(this.hit.fraction, 0, 1);
      if (fraction > 0) {
        this.centre.addScaledVector(this.remaining, fraction);
      }
      this.centre.addScaledVector(this.hit.normal, CONTACT_PUSH_METRES);

      if (
        falling &&
        this.velocityValue.y <= 0 &&
        this.hit.normal.dot(WORLD_UP) >= 0.55
      ) {
        this.supportedValue = true;
        this.velocityValue.y = 0;
      }

      this.remaining.multiplyScalar(1 - fraction);
      const intoSurface = this.remaining.dot(this.hit.normal);
      if (intoSurface < 0) {
        this.remaining.addScaledVector(this.hit.normal, -intoSurface);
      }

      const velocityIntoSurface = this.velocityValue.dot(this.hit.normal);
      if (velocityIntoSurface < 0) {
        this.velocityValue.addScaledVector(
          this.hit.normal,
          -velocityIntoSurface,
        );
      }
    }

    this.syncRootFromCentre();
  }

  private syncRootFromCentre(): void {
    this.root.position.set(
      this.centre.x - this.centreOffset.x,
      this.centre.y - this.centreOffset.y,
      this.centre.z - this.centreOffset.z,
    );
    // Gameplay flight never banks, pitches or rolls.
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.root.updateWorldMatrix(true, true);
  }

  private validateDelta(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'Maintenance drone deltaSeconds must be positive and finite.',
      );
    }
  }

  private validateConfig(): void {
    for (const [name, value] of Object.entries(this.config)) {
      if (
        name === 'maximumCollisionIterations'
          ? !Number.isInteger(value) || value <= 0
          : !Number.isFinite(value) || value <= 0
      ) {
        throw new Error(
          `Maintenance drone flight ${name} must be positive and finite.`,
        );
      }
    }
  }
}

function moveTowards(current: number, target: number, amount: number): number {
  if (Math.abs(target - current) <= amount) return target;
  return current + Math.sign(target - current) * amount;
}

function moveVectorTowardsZero(vector: THREE.Vector3, amount: number): void {
  const length = vector.length();
  if (length <= amount || length <= EPSILON_SQ) {
    vector.set(0, 0, 0);
    return;
  }
  vector.multiplyScalar((length - amount) / length);
}

function clampVectorLength(vector: THREE.Vector3, maximum: number): void {
  const length = vector.length();
  if (length <= maximum || length <= EPSILON_SQ) return;
  vector.multiplyScalar(maximum / length);
}
