import * as THREE from 'three';

import type { EventBus } from '../core/EventBus';
import { CollisionHit, CollisionWorld } from './CollisionWorld';
import type { MovementEvents } from './MovementEvents.ts';

const MOVEMENT_EPSILON_SQ = 1e-12;
const CONTACT_PUSH_METRES = 1e-5;

export interface ReadonlyVector3State {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface JumpInputState {
  pressed: boolean;
  held: boolean;
  released: boolean;
}

const NO_JUMP_INPUT: Readonly<JumpInputState> = {
  pressed: false,
  held: false,
  released: false,
};

export type JumpState = 'grounded' | 'coyote' | 'charging' | 'airborne';

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

  /** Tap-jump launch speed along gameplay-up, in metres per second. */
  minimumJumpSpeedMetresPerSecond: number;
  /** Full-charge launch speed along gameplay-up, in metres per second. */
  maximumJumpSpeedMetresPerSecond: number;
  /** Time required to reach full jump charge. */
  maximumJumpChargeSeconds: number;
  /** Exponent used to shape normalized charge before speed interpolation. */
  jumpChargeCurveExponent: number;
  /** Retained jump window after leaving valid ground. */
  coyoteTimeSeconds: number;
  /** Brief post-launch interval during which ground probing cannot reattach. */
  jumpGroundDetachSeconds: number;
  /** Minimum stable airborne duration required before a landing signal fires. */
  minimumLandingAirTimeSeconds: number;
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

  minimumJumpSpeedMetresPerSecond: 4.8,
  maximumJumpSpeedMetresPerSecond: 8.8,
  maximumJumpChargeSeconds: 0.7,
  jumpChargeCurveExponent: 1.35,
  coyoteTimeSeconds: 0.1,
  jumpGroundDetachSeconds: 0.05,
  minimumLandingAirTimeSeconds: 0.04,
};

export interface KinematicBodyOptions {
  world: CollisionWorld;
  initialPosition: ReadonlyVector3State;
  config?: Partial<KinematicBodyConfig>;
  events?: EventBus<MovementEvents>;
}

/**
 * Simple sphere-based kinematic gameplay body.
 *
 * This object owns authoritative movement state. The deformable slime visual
 * and camera may read current/previous position, velocity, charge and
 * gameplay-up, but they do not feed transforms back into the controller.
 */
export class KinematicBody {
  readonly radiusMetres: number;

  private readonly world: CollisionWorld;
  private readonly config: KinematicBodyConfig;
  private readonly events: EventBus<MovementEvents> | undefined;

  private readonly currentPosition = new THREE.Vector3();
  private readonly previousPositionValue = new THREE.Vector3();
  private readonly velocityValue = new THREE.Vector3();
  private readonly groundNormalValue = new THREE.Vector3(0, 1, 0);
  private readonly gameplayUpValue = new THREE.Vector3(0, 1, 0);
  private readonly lastContactNormalValue = new THREE.Vector3(0, 1, 0);

  private groundedValue = false;
  private attachedValue = false;

  private chargingJumpValue = false;
  private chargeSecondsValue = 0;
  private coyoteTimeRemainingSecondsValue = 0;
  private groundReacquireDelaySeconds = 0;
  private airborneSeconds = 0;
  private landedThisStepValue = false;
  private lastLandingImpactSpeedValue = 0;
  private lastJumpSpeedValue = 0;
  private lastJumpChargeFractionValue = 0;
  private lastContactImpactSpeedValue = 0;
  private lastContactNameValue = 'none';
  private lastContactSurfaceTagValue = 'default';

  private readonly moveInput = new THREE.Vector3();
  private readonly movementPlaneNormal = new THREE.Vector3();
  private readonly planarVelocity = new THREE.Vector3();
  private readonly normalVelocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly velocityDelta = new THREE.Vector3();
  private readonly remainingDisplacement = new THREE.Vector3();
  private readonly groundProbeDisplacement = new THREE.Vector3();
  private readonly gravityStep = new THREE.Vector3();

  private readonly movementHit = new CollisionHit();
  private readonly groundHit = new CollisionHit();

  contactsThisStep = 0;
  lastCollisionName = 'none';

  constructor(options: KinematicBodyOptions) {
    this.world = options.world;
    this.events = options.events;
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

  /** Reserved for the later sticky-surface issue. Always false in #12. */
  get attached(): boolean {
    return this.attachedValue;
  }

  get jumpState(): JumpState {
    if (this.chargingJumpValue) return 'charging';
    if (this.groundedValue) return 'grounded';
    if (this.coyoteTimeRemainingSecondsValue > 0) return 'coyote';
    return 'airborne';
  }

  get canJump(): boolean {
    return !this.chargingJumpValue && this.hasJumpOpportunity();
  }

  get chargingJump(): boolean {
    return this.chargingJumpValue;
  }

  get chargeSeconds(): number {
    return this.chargeSecondsValue;
  }

  get chargeFraction(): number {
    return THREE.MathUtils.clamp(
      this.chargeSecondsValue / this.config.maximumJumpChargeSeconds,
      0,
      1,
    );
  }

  get coyoteTimeRemainingSeconds(): number {
    return this.coyoteTimeRemainingSecondsValue;
  }

  get landedThisStep(): boolean {
    return this.landedThisStepValue;
  }

  get lastLandingImpactSpeedMetresPerSecond(): number {
    return this.lastLandingImpactSpeedValue;
  }

  get lastJumpSpeedMetresPerSecond(): number {
    return this.lastJumpSpeedValue;
  }

  get lastJumpChargeFraction(): number {
    return this.lastJumpChargeFractionValue;
  }

  get maximumJumpChargeSeconds(): number {
    return this.config.maximumJumpChargeSeconds;
  }

  get maximumLocomotionSpeedMetresPerSecond(): number {
    return this.config.maxSpeedMetresPerSecond;
  }

  get lastContactNormal(): ReadonlyVector3State {
    return this.lastContactNormalValue;
  }

  get lastContactImpactSpeedMetresPerSecond(): number {
    return this.lastContactImpactSpeedValue;
  }

  get lastContactName(): string {
    return this.lastContactNameValue;
  }

  get lastContactSurfaceTag(): string {
    return this.lastContactSurfaceTagValue;
  }

  /**
   * Advance one deterministic gameplay step.
   *
   * `moveX` and `moveZ` are normalized intent axes in [-1, 1]. `jumpInput`
   * uses action state captured by Input; a missing value means no jump input,
   * which keeps development regressions concise.
   */
  update(
    deltaSeconds: number,
    moveX: number,
    moveZ: number,
    jumpInput: Readonly<JumpInputState> = NO_JUMP_INPUT,
  ): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('KinematicBody deltaSeconds must be positive and finite.');
    }

    this.previousPositionValue.copy(this.currentPosition);
    this.contactsThisStep = 0;
    this.lastCollisionName = 'none';
    this.lastContactImpactSpeedValue = 0;
    this.lastContactNameValue = 'none';
    this.lastContactSurfaceTagValue = 'default';
    this.lastContactNormalValue.copy(this.gameplayUpValue);
    this.landedThisStepValue = false;

    const groundedAtStepStart = this.groundedValue;

    if (this.groundReacquireDelaySeconds > 0) {
      this.groundReacquireDelaySeconds = Math.max(
        0,
        this.groundReacquireDelaySeconds - deltaSeconds,
      );
    }

    if (groundedAtStepStart) {
      this.coyoteTimeRemainingSecondsValue = this.config.coyoteTimeSeconds;
      this.airborneSeconds = 0;
    } else {
      this.coyoteTimeRemainingSecondsValue = Math.max(
        0,
        this.coyoteTimeRemainingSecondsValue - deltaSeconds,
      );
      this.airborneSeconds += deltaSeconds;
    }

    this.updateJumpState(deltaSeconds, jumpInput);
    this.applyLocomotion(deltaSeconds, moveX, moveZ);
    this.applyGravity(deltaSeconds);

    const downwardSpeedBeforeCollision = Math.max(
      0,
      -this.velocityValue.dot(this.gameplayUpValue),
    );

    this.moveAndSlide(deltaSeconds);
    this.refreshGroundState();
    this.handleLanding(
      groundedAtStepStart,
      downwardSpeedBeforeCollision,
    );
  }

  teleport(position: ReadonlyVector3State, preserveVelocity = false): void {
    this.currentPosition.set(position.x, position.y, position.z);
    this.previousPositionValue.copy(this.currentPosition);

    if (!preserveVelocity) this.velocityValue.set(0, 0, 0);

    this.contactsThisStep = 0;
    this.lastCollisionName = 'none';
    this.attachedValue = false;
    this.cancelJumpCharge();
    this.groundReacquireDelaySeconds = 0;
    this.airborneSeconds = 0;
    this.landedThisStepValue = false;
    this.lastLandingImpactSpeedValue = 0;
    this.lastJumpSpeedValue = 0;
    this.lastJumpChargeFractionValue = 0;
    this.lastContactImpactSpeedValue = 0;
    this.lastContactNameValue = 'none';
    this.lastContactSurfaceTagValue = 'default';
    this.lastContactNormalValue.copy(this.gameplayUpValue);

    this.refreshGroundState();
    this.coyoteTimeRemainingSecondsValue = this.groundedValue
      ? this.config.coyoteTimeSeconds
      : 0;
  }

  private updateJumpState(
    deltaSeconds: number,
    jumpInput: Readonly<JumpInputState>,
  ): void {
    if (this.chargingJumpValue) {
      // Focus loss clears Input without synthesizing a release. Treat
      // "neither held nor released" as cancellation so a stale charge cannot
      // fire when the browser regains focus.
      if (!jumpInput.held && !jumpInput.released) {
        this.cancelJumpCharge();
        return;
      }

      if (!this.hasJumpOpportunity()) {
        this.cancelJumpCharge();
        return;
      }

      if (jumpInput.held) {
        this.chargeSecondsValue = Math.min(
          this.config.maximumJumpChargeSeconds,
          this.chargeSecondsValue + deltaSeconds,
        );
      }

      if (jumpInput.released) this.launchChargedJump();
      return;
    }

    if (!jumpInput.pressed || !this.hasJumpOpportunity()) return;

    this.chargingJumpValue = true;
    this.chargeSecondsValue = jumpInput.held
      ? Math.min(deltaSeconds, this.config.maximumJumpChargeSeconds)
      : 0;

    // A press and release can both occur between two fixed updates. Preserve
    // that as a valid tap jump instead of dropping the input.
    if (jumpInput.released) this.launchChargedJump();
  }

  private launchChargedJump(): void {
    const normalizedCharge = this.chargeFraction;
    const curvedCharge = Math.pow(
      normalizedCharge,
      this.config.jumpChargeCurveExponent,
    );
    const jumpSpeed = THREE.MathUtils.lerp(
      this.config.minimumJumpSpeedMetresPerSecond,
      this.config.maximumJumpSpeedMetresPerSecond,
      curvedCharge,
    );

    const currentUpSpeed = this.velocityValue.dot(this.gameplayUpValue);
    if (currentUpSpeed < jumpSpeed) {
      this.velocityValue.addScaledVector(
        this.gameplayUpValue,
        jumpSpeed - currentUpSpeed,
      );
    }

    this.lastJumpSpeedValue = jumpSpeed;
    this.lastJumpChargeFractionValue = normalizedCharge;

    this.chargingJumpValue = false;
    this.chargeSecondsValue = 0;
    this.groundedValue = false;
    this.groundNormalValue.copy(this.gameplayUpValue);
    this.coyoteTimeRemainingSecondsValue = 0;
    this.groundReacquireDelaySeconds =
      this.config.jumpGroundDetachSeconds;
    this.airborneSeconds = 0;

    this.events?.emit('jumped', {
      speedMetresPerSecond: jumpSpeed,
      chargeFraction: normalizedCharge,
      directionWorld: this.gameplayUpValue,
    });
  }

  private cancelJumpCharge(): void {
    this.chargingJumpValue = false;
    this.chargeSecondsValue = 0;
  }

  private hasJumpOpportunity(): boolean {
    return (
      this.groundedValue ||
      this.coyoteTimeRemainingSecondsValue > 0
    );
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

  private applyGravity(deltaSeconds: number): void {
    this.gravityStep
      .copy(this.gameplayUpValue)
      .multiplyScalar(
        -this.config.gravityMetresPerSecondSquared * deltaSeconds,
      );

    if (this.groundedValue) {
      // Walkable ground supports the body against gravity. Retain only the
      // component into the support normal, preventing passive slope drift.
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

      this.currentPosition.addScaledVector(
        this.movementHit.normal,
        CONTACT_PUSH_METRES,
      );

      const velocityIntoSurface = this.velocityValue.dot(
        this.movementHit.normal,
      );

      const contactImpactSpeed = Math.max(0, -velocityIntoSurface);
      if (contactImpactSpeed >= this.lastContactImpactSpeedValue) {
        this.lastContactImpactSpeedValue = contactImpactSpeed;
        this.lastContactNormalValue.copy(this.movementHit.normal);
        this.lastContactNameValue =
          this.movementHit.object?.name || '<unnamed>';
        const surfaceTag = this.movementHit.object?.userData.surfaceTag;
        this.lastContactSurfaceTagValue =
          typeof surfaceTag === 'string' ? surfaceTag : 'default';
      }

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

    if (this.groundReacquireDelaySeconds > 0) return;

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

    const velocityIntoGround = this.velocityValue.dot(this.groundNormalValue);
    if (velocityIntoGround < 0) {
      this.velocityValue.addScaledVector(
        this.groundNormalValue,
        -velocityIntoGround,
      );
    }
  }

  private handleLanding(
    groundedAtStepStart: boolean,
    impactSpeedMetresPerSecond: number,
  ): void {
    if (groundedAtStepStart || !this.groundedValue) return;

    const stableLanding =
      this.airborneSeconds >= this.config.minimumLandingAirTimeSeconds;

    this.airborneSeconds = 0;
    this.coyoteTimeRemainingSecondsValue = this.config.coyoteTimeSeconds;

    if (!stableLanding) return;

    this.landedThisStepValue = true;
    this.lastLandingImpactSpeedValue =
      impactSpeedMetresPerSecond;

    this.events?.emit('landed', {
      impactSpeedMetresPerSecond,
    });
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
      [
        'minimumJumpSpeedMetresPerSecond',
        config.minimumJumpSpeedMetresPerSecond,
      ],
      [
        'maximumJumpSpeedMetresPerSecond',
        config.maximumJumpSpeedMetresPerSecond,
      ],
      ['maximumJumpChargeSeconds', config.maximumJumpChargeSeconds],
      ['jumpChargeCurveExponent', config.jumpChargeCurveExponent],
    ];

    for (const [name, value] of positiveFinite) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive finite number.`);
      }
    }

    if (
      config.maximumJumpSpeedMetresPerSecond <
      config.minimumJumpSpeedMetresPerSecond
    ) {
      throw new Error(
        'maximumJumpSpeedMetresPerSecond must be >= minimumJumpSpeedMetresPerSecond.',
      );
    }

    const nonNegativeFinite: ReadonlyArray<[string, number]> = [
      ['airDragPerSecond', config.airDragPerSecond],
      ['coyoteTimeSeconds', config.coyoteTimeSeconds],
      ['jumpGroundDetachSeconds', config.jumpGroundDetachSeconds],
      [
        'minimumLandingAirTimeSeconds',
        config.minimumLandingAirTimeSeconds,
      ],
    ];

    for (const [name, value] of nonNegativeFinite) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative finite number.`);
      }
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
}
