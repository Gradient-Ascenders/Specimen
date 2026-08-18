import * as THREE from 'three';

import { CollisionHit, CollisionWorld } from './CollisionWorld';

const MOVEMENT_EPSILON_SQ = 1e-12;
const CONTACT_PUSH_METRES = 1e-5;

export interface ReadonlyVector3State {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface KinematicBodyConfig {
  /** Collision sphere radius in metres. */
  radiusMetres: number;
  /** Small separation used by queries to keep the body off exact surfaces. */
  skinWidthMetres: number;
  /** Downward acceleration in metres per second squared. */
  gravityMetresPerSecondSquared: number;
  /** Maximum intended locomotion speed in metres per second. */
  maxSpeedMetresPerSecond: number;
  /** Ground acceleration in metres per second squared. */
  groundAccelerationMetresPerSecondSquared: number;
  /** Air-control acceleration in metres per second squared. */
  airAccelerationMetresPerSecondSquared: number;
  /** Ground braking when there is no movement input, in m/s^2. */
  groundBrakingMetresPerSecondSquared: number;
  /** Exponential horizontal air drag coefficient in 1/seconds. */
  airDragPerSecond: number;
  /** Distance below the body used to maintain a stable grounded state. */
  groundProbeDistanceMetres: number;
  /** Minimum dot(surfaceNormal, gameplayUp) considered walkable ground. */
  minimumGroundNormalDot: number;
  /** Maximum collision/slide resolutions performed in one fixed update. */
  maxCollisionIterations: number;
}

export const DEFAULT_KINEMATIC_BODY_CONFIG: Readonly<KinematicBodyConfig> = {
  radiusMetres: 0.45,
  skinWidthMetres: 0.01,
  gravityMetresPerSecondSquared: 18,
  maxSpeedMetresPerSecond: 5.5,
  groundAccelerationMetresPerSecondSquared: 32,
  airAccelerationMetresPerSecondSquared: 12,
  groundBrakingMetresPerSecondSquared: 36,
  airDragPerSecond: 0.8,
  groundProbeDistanceMetres: 0.08,
  minimumGroundNormalDot: Math.cos(THREE.MathUtils.degToRad(50)),
  maxCollisionIterations: 3,
};

export interface KinematicBodyOptions {
  world: CollisionWorld;
  initialPosition: ReadonlyVector3State;
  config?: Partial<KinematicBodyConfig>;
}

/**
 * Simple sphere-based kinematic gameplay body.
 *
 * This object owns authoritative movement state. The deformable slime visual
 * and camera may read current/previous position, velocity and gameplay-up, but
 * they do not feed transforms back into the controller.
 */
export class KinematicBody {
  readonly radiusMetres: number;

  private readonly world: CollisionWorld;
  private readonly config: KinematicBodyConfig;

  private readonly currentPosition = new THREE.Vector3();
  private readonly previousPositionValue = new THREE.Vector3();
  private readonly velocityValue = new THREE.Vector3();
  private readonly groundNormalValue = new THREE.Vector3(0, 1, 0);
  private readonly gameplayUpValue = new THREE.Vector3(0, 1, 0);

  private groundedValue = false;
  private attachedValue = false;

  private readonly moveInput = new THREE.Vector3();
  private readonly movementPlaneNormal = new THREE.Vector3();
  private readonly planarVelocity = new THREE.Vector3();
  private readonly normalVelocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly velocityDelta = new THREE.Vector3();
  private readonly remainingDisplacement = new THREE.Vector3();
  private readonly groundProbeDisplacement = new THREE.Vector3();

  private readonly movementHit = new CollisionHit();
  private readonly groundHit = new CollisionHit();

  private readonly gravityStep = new THREE.Vector3();

  contactsThisStep = 0;
  lastCollisionName = 'none';

  constructor(options: KinematicBodyOptions) {
    this.world = options.world;
    this.config = {
      ...DEFAULT_KINEMATIC_BODY_CONFIG,
      ...options.config,
    };

    this.validateConfig(this.config);
    this.radiusMetres = this.config.radiusMetres;
    this.teleport(options.initialPosition);
  }

  get position(): ReadonlyVector3State {
    return this.currentPosition;
  }

  get previousPosition(): ReadonlyVector3State {
    return this.previousPositionValue;
  }

  get velocity(): ReadonlyVector3State {
    return this.velocityValue;
  }

  get groundNormal(): ReadonlyVector3State {
    return this.groundNormalValue;
  }

  get gameplayUp(): ReadonlyVector3State {
    return this.gameplayUpValue;
  }

  get grounded(): boolean {
    return this.groundedValue;
  }

  /** Reserved for the later sticky-surface issue. Always false in #11. */
  get attached(): boolean {
    return this.attachedValue;
  }

  /**
   * Advance one deterministic gameplay step.
   *
   * `moveX` and `moveZ` are normalized intent axes in [-1, 1]. They currently
   * use the world X/Z movement basis; the camera can provide a rotated basis in
   * a later integration without changing the collision solver.
   */
  update(deltaSeconds: number, moveX: number, moveZ: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('KinematicBody deltaSeconds must be positive and finite.');
    }

    this.previousPositionValue.copy(this.currentPosition);
    this.contactsThisStep = 0;
    this.lastCollisionName = 'none';

    this.applyLocomotion(deltaSeconds, moveX, moveZ);
    this.applyGravity(deltaSeconds);

    this.moveAndSlide(deltaSeconds);
    this.refreshGroundState();
  }

  teleport(position: ReadonlyVector3State, preserveVelocity = false): void {
    this.currentPosition.set(position.x, position.y, position.z);
    this.previousPositionValue.copy(this.currentPosition);
    if (!preserveVelocity) this.velocityValue.set(0, 0, 0);
    this.contactsThisStep = 0;
    this.lastCollisionName = 'none';
    this.attachedValue = false;
    this.refreshGroundState();
  }

  private applyLocomotion(
    deltaSeconds: number,
    moveX: number,
    moveZ: number,
  ): void {
    const clampedX = THREE.MathUtils.clamp(moveX, -1, 1);
    const clampedZ = THREE.MathUtils.clamp(moveZ, -1, 1);

    this.moveInput.set(clampedX, 0, clampedZ);
    if (this.moveInput.lengthSq() > 1) this.moveInput.normalize();

    this.movementPlaneNormal.copy(
      this.groundedValue ? this.groundNormalValue : this.gameplayUpValue,
    );

    // Separate movement tangent to the current support plane from velocity
    // normal to it. On a slope this preserves an uphill/downhill tangent rather
    // than flattening locomotion back onto world XZ.
    const normalSpeed = this.velocityValue.dot(this.movementPlaneNormal);
    this.normalVelocity
      .copy(this.movementPlaneNormal)
      .multiplyScalar(normalSpeed);
    this.planarVelocity
      .copy(this.velocityValue)
      .sub(this.normalVelocity);

    if (this.moveInput.lengthSq() > MOVEMENT_EPSILON_SQ) {
      this.targetVelocity
        .copy(this.moveInput)
        .projectOnPlane(this.movementPlaneNormal);

      if (this.targetVelocity.lengthSq() > MOVEMENT_EPSILON_SQ) {
        this.targetVelocity
          .normalize()
          .multiplyScalar(this.config.maxSpeedMetresPerSecond);

        this.velocityDelta
          .subVectors(this.targetVelocity, this.planarVelocity);

        const acceleration = this.groundedValue
          ? this.config.groundAccelerationMetresPerSecondSquared
          : this.config.airAccelerationMetresPerSecondSquared;
        const maximumVelocityChange = acceleration * deltaSeconds;
        const deltaLength = this.velocityDelta.length();
        if (deltaLength > maximumVelocityChange && deltaLength > 0) {
          this.velocityDelta.multiplyScalar(
            maximumVelocityChange / deltaLength,
          );
        }
        this.planarVelocity.add(this.velocityDelta);
      }
    } else if (this.groundedValue) {
      this.moveVectorTowardsZero(
        this.planarVelocity,
        this.config.groundBrakingMetresPerSecondSquared * deltaSeconds,
      );
    }

    if (!this.groundedValue && this.config.airDragPerSecond > 0) {
      this.planarVelocity.multiplyScalar(
        Math.exp(-this.config.airDragPerSecond * deltaSeconds),
      );
    }

    this.velocityValue
      .copy(this.planarVelocity)
      .add(this.normalVelocity);
  }

  private moveAndSlide(deltaSeconds: number): void {
    this.remainingDisplacement
      .copy(this.velocityValue)
      .multiplyScalar(deltaSeconds);

    const queryRadius =
      this.config.radiusMetres + this.config.skinWidthMetres;

    for (
      let iteration = 0;
      iteration < this.config.maxCollisionIterations;
      iteration += 1
    ) {
      if (this.remainingDisplacement.lengthSq() <= MOVEMENT_EPSILON_SQ) break;

      const hit = this.world.sweepSphere(
        this.currentPosition,
        this.remainingDisplacement,
        queryRadius,
        this.movementHit,
      );

      if (!hit) {
        this.currentPosition.add(this.remainingDisplacement);
        this.remainingDisplacement.set(0, 0, 0);
        break;
      }

      this.contactsThisStep += 1;
      this.lastCollisionName = this.movementHit.object?.name || '<unnamed>';

      const travelFraction = THREE.MathUtils.clamp(
        this.movementHit.fraction,
        0,
        1,
      );
      if (travelFraction > 0) {
        this.currentPosition.addScaledVector(
          this.remainingDisplacement,
          travelFraction,
        );
      }

      // Tiny outward push avoids numerical re-entry at exact boundaries. The
      // real gameplay skin is already represented by the enlarged query radius.
      this.currentPosition.addScaledVector(
        this.movementHit.normal,
        CONTACT_PUSH_METRES,
      );

      const velocityIntoSurface = this.velocityValue.dot(
        this.movementHit.normal,
      );
      if (velocityIntoSurface < 0) {
        this.velocityValue.addScaledVector(
          this.movementHit.normal,
          -velocityIntoSurface,
        );
      }

      this.remainingDisplacement.multiplyScalar(1 - travelFraction);
      const displacementIntoSurface = this.remainingDisplacement.dot(
        this.movementHit.normal,
      );
      if (displacementIntoSurface < 0) {
        this.remainingDisplacement.addScaledVector(
          this.movementHit.normal,
          -displacementIntoSurface,
        );
      }
    }
  }

  private refreshGroundState(): void {
    this.groundedValue = false;
    this.groundNormalValue.copy(this.gameplayUpValue);

    this.groundProbeDisplacement
      .copy(this.gameplayUpValue)
      .multiplyScalar(-this.config.groundProbeDistanceMetres);

    const hasGroundHit = this.world.sweepSphere(
      this.currentPosition,
      this.groundProbeDisplacement,
      this.config.radiusMetres + this.config.skinWidthMetres,
      this.groundHit,
    );

    if (!hasGroundHit) return;

    const groundDot = this.groundHit.normal.dot(this.gameplayUpValue);
    if (groundDot < this.config.minimumGroundNormalDot) return;

    this.groundedValue = true;
    this.groundNormalValue.copy(this.groundHit.normal);

    // Do not retain velocity that pushes into the support surface. This keeps
    // the grounded state stable while gravity continues to be applied every
    // fixed step.
    const velocityIntoGround = this.velocityValue.dot(this.groundNormalValue);
    if (velocityIntoGround < 0) {
      this.velocityValue.addScaledVector(
        this.groundNormalValue,
        -velocityIntoGround,
      );
    }
  }

  private moveVectorTowardsZero(vector: THREE.Vector3, amount: number): void {
    const length = vector.length();
    if (length <= amount || length <= MOVEMENT_EPSILON_SQ) {
      vector.set(0, 0, 0);
      return;
    }
    vector.multiplyScalar((length - amount) / length);
  }

  private validateConfig(config: KinematicBodyConfig): void {
    const positiveFinite: ReadonlyArray<[string, number]> = [
      ['radiusMetres', config.radiusMetres],
      ['skinWidthMetres', config.skinWidthMetres],
      ['gravityMetresPerSecondSquared', config.gravityMetresPerSecondSquared],
      ['maxSpeedMetresPerSecond', config.maxSpeedMetresPerSecond],
      [
        'groundAccelerationMetresPerSecondSquared',
        config.groundAccelerationMetresPerSecondSquared,
      ],
      [
        'airAccelerationMetresPerSecondSquared',
        config.airAccelerationMetresPerSecondSquared,
      ],
      [
        'groundBrakingMetresPerSecondSquared',
        config.groundBrakingMetresPerSecondSquared,
      ],
      ['groundProbeDistanceMetres', config.groundProbeDistanceMetres],
    ];

    for (const [name, value] of positiveFinite) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive finite number.`);
      }
    }

    if (!Number.isFinite(config.airDragPerSecond) || config.airDragPerSecond < 0) {
      throw new Error('airDragPerSecond must be a non-negative finite number.');
    }
    if (
      !Number.isFinite(config.minimumGroundNormalDot) ||
      config.minimumGroundNormalDot < -1 ||
      config.minimumGroundNormalDot > 1
    ) {
      throw new Error('minimumGroundNormalDot must be within [-1, 1].');
    }
    if (
      !Number.isInteger(config.maxCollisionIterations) ||
      config.maxCollisionIterations <= 0
    ) {
      throw new Error('maxCollisionIterations must be a positive integer.');
    }
  }

  private applyGravity(deltaSeconds: number): void {
    this.gravityStep
      .copy(this.gameplayUpValue)
      .multiplyScalar(
        -this.config.gravityMetresPerSecondSquared * deltaSeconds,
      );

    if (this.groundedValue) {
      // Walkable ground supports the body against gravity. Keep only the
      // component pushing into the support surface so gravity cannot introduce
      // unintended downhill motion after ground braking has run.
      const gravityIntoGround = this.gravityStep.dot(
        this.groundNormalValue,
      );

      if (gravityIntoGround < 0) {
        this.velocityValue.addScaledVector(
          this.groundNormalValue,
          gravityIntoGround,
        );
      }

      return;
    }

    this.velocityValue.add(this.gravityStep);
  }
}
