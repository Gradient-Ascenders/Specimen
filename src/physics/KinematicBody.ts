import * as THREE from 'three';

import type { EventBus } from '../core/EventBus';
import { CollisionHit, CollisionWorld } from './CollisionWorld';
import type { MovementEvents } from './MovementEvents.ts';
import {
  type SurfaceRegistry,
  type SurfaceTag,
} from './SurfaceRegistry';

const MOVEMENT_EPSILON_SQ = 1e-12;
const CONTACT_PUSH_METRES = 1e-5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FORWARD = new THREE.Vector3(0, 0, -1);

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
  radiusMetres: number;
  skinWidthMetres: number;
  gravityMetresPerSecondSquared: number;
  maxSpeedMetresPerSecond: number;
  groundAccelerationMetresPerSecondSquared: number;
  airAccelerationMetresPerSecondSquared: number;
  groundBrakingMetresPerSecondSquared: number;
  airDragPerSecond: number;
  groundProbeDistanceMetres: number;
  minimumGroundNormalDot: number;
  maxCollisionIterations: number;

  minimumJumpSpeedMetresPerSecond: number;
  maximumJumpSpeedMetresPerSecond: number;
  maximumJumpChargeSeconds: number;
  jumpChargeCurveExponent: number;
  coyoteTimeSeconds: number;
  jumpGroundDetachSeconds: number;
  minimumLandingAirTimeSeconds: number;

  /** Maximum abs(dot(surfaceNormal, worldUp)) that may be used as a wall attachment. */
  maximumAttachmentWorldUpDot: number;
  /** Time after an authored detach before the same/new wall may attach again. */
  attachmentDetachCooldownSeconds: number;
  /** Minimum time between authored bounce impulses. */
  bounceCooldownSeconds: number;
  /** Required approach speed into a bounce surface before it fires. */
  minimumBounceApproachSpeedMetresPerSecond: number;
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

  // Constrained authored-wall policy: supports near-vertical walls, excludes
  // floors and ceilings until ceiling traversal is separately validated.
  maximumAttachmentWorldUpDot: Math.cos(THREE.MathUtils.degToRad(70)),
  attachmentDetachCooldownSeconds: 0.12,
  bounceCooldownSeconds: 0.12,
  minimumBounceApproachSpeedMetresPerSecond: 0.12,
};

export interface KinematicBodyOptions {
  world: CollisionWorld;
  surfaces: SurfaceRegistry;
  initialPosition: ReadonlyVector3State;
  config?: Partial<KinematicBodyConfig>;
  events?: EventBus<MovementEvents>;
}

/**
 * Sphere-based authoritative gameplay body with authored surface behaviour.
 *
 * Visual deformation and CameraRig read the state exposed here. The camera
 * smooths gameplayUp privately; it never writes smoothed orientation back.
 */
export class KinematicBody {
  readonly radiusMetres: number;

  private readonly world: CollisionWorld;
  private readonly surfaces: SurfaceRegistry;
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
  private attachmentSurface: THREE.Mesh | null = null;
  private supportSurfaceTagValue: SurfaceTag = 'default';
  private supportTractionMultiplier = 1;
  private lastContactSurfaceTagValue: SurfaceTag = 'default';

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

  private attachmentCooldownSecondsValue = 0;
  private bounceCooldownSecondsValue = 0;
  private lastBounceSpeedValue = 0;
  private lastBounceSurfaceNameValue = 'none';

  private readonly moveInput = new THREE.Vector3();
  private readonly movementPlaneNormal = new THREE.Vector3();
  private readonly planarVelocity = new THREE.Vector3();
  private readonly normalVelocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly velocityDelta = new THREE.Vector3();
  private readonly remainingDisplacement = new THREE.Vector3();
  private readonly groundProbeDisplacement = new THREE.Vector3();
  private readonly gravityStep = new THREE.Vector3();
  private readonly surfaceForward = new THREE.Vector3();
  private readonly surfaceRight = new THREE.Vector3();

  private readonly movementHit = new CollisionHit();
  private readonly groundHit = new CollisionHit();

  contactsThisStep = 0;
  lastCollisionName = 'none';

  constructor(options: KinematicBodyOptions) {
    this.world = options.world;
    this.surfaces = options.surfaces;
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

  get attached(): boolean {
    return this.attachedValue;
  }

  get attachmentSurfaceName(): string {
    return this.attachmentSurface?.name || 'none';
  }

  get supportSurfaceTag(): SurfaceTag {
    return this.supportSurfaceTagValue;
  }

  get lastContactSurfaceTag(): SurfaceTag {
    return this.lastContactSurfaceTagValue;
  }

  get attachmentCooldownSeconds(): number {
    return this.attachmentCooldownSecondsValue;
  }

  get bounceCooldownSeconds(): number {
    return this.bounceCooldownSecondsValue;
  }

  get lastBounceSpeedMetresPerSecond(): number {
    return this.lastBounceSpeedValue;
  }

  get lastBounceSurfaceName(): string {
    return this.lastBounceSurfaceNameValue;
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
    this.lastContactNormalValue.copy(this.gameplayUpValue);
    this.lastContactSurfaceTagValue = this.supportSurfaceTagValue;
    this.landedThisStepValue = false;

    const groundedAtStepStart = this.groundedValue;

    this.attachmentCooldownSecondsValue = Math.max(
      0,
      this.attachmentCooldownSecondsValue - deltaSeconds,
    );
    this.bounceCooldownSecondsValue = Math.max(
      0,
      this.bounceCooldownSecondsValue - deltaSeconds,
    );

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
    this.handleLanding(groundedAtStepStart, downwardSpeedBeforeCollision);
  }

  /**
   * Checkpoint recovery adapter.
   *
   * `teleport` already clears velocity, adhesion, charge, cooldowns and other
   * player-specific transient state, so CheckpointManager can use the body
   * directly as its recovery target without another restart path.
   */
  recoverAt(position: THREE.Vector3): void {
    this.teleport(position);
  }

  teleport(position: ReadonlyVector3State, preserveVelocity = false): void {
    this.currentPosition.set(position.x, position.y, position.z);
    this.previousPositionValue.copy(this.currentPosition);

    if (!preserveVelocity) this.velocityValue.set(0, 0, 0);

    this.contactsThisStep = 0;
    this.lastCollisionName = 'none';
    this.attachedValue = false;
    this.attachmentSurface = null;
    this.gameplayUpValue.copy(WORLD_UP);
    this.groundNormalValue.copy(WORLD_UP);
    this.supportSurfaceTagValue = 'default';
    this.supportTractionMultiplier = 1;
    this.lastContactSurfaceTagValue = 'default';
    this.cancelJumpCharge();
    this.groundReacquireDelaySeconds = 0;
    this.attachmentCooldownSecondsValue = 0;
    this.bounceCooldownSecondsValue = 0;
    this.airborneSeconds = 0;
    this.landedThisStepValue = false;
    this.lastLandingImpactSpeedValue = 0;
    this.lastJumpSpeedValue = 0;
    this.lastJumpChargeFractionValue = 0;
    this.lastContactImpactSpeedValue = 0;
    this.lastContactNameValue = 'none';
    this.lastContactNormalValue.copy(this.gameplayUpValue);
    this.lastBounceSpeedValue = 0;
    this.lastBounceSurfaceNameValue = 'none';

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

    // gameplayUp is still the attachment normal here, so a wall jump launches
    // away from the authored wall before detaching back to world-up movement.
    const currentUpSpeed = this.velocityValue.dot(this.gameplayUpValue);
    if (currentUpSpeed < jumpSpeed) {
      this.velocityValue.addScaledVector(
        this.gameplayUpValue,
        jumpSpeed - currentUpSpeed,
      );
    }

    this.lastJumpSpeedValue = jumpSpeed;
    this.lastJumpChargeFractionValue = normalizedCharge;

    if (this.attachedValue) {
      this.detachFromSurface(this.config.attachmentDetachCooldownSeconds);
    } else {
      this.groundedValue = false;
      this.groundNormalValue.copy(WORLD_UP);
    }

    this.chargingJumpValue = false;
    this.chargeSecondsValue = 0;
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

    if (this.attachedValue) {
      // W/S follows projected world-up so "forward" means climb on authored
      // near-vertical walls. A/D is the tangent lateral axis.
      this.surfaceForward
        .copy(WORLD_UP)
        .projectOnPlane(this.gameplayUpValue);

      if (this.surfaceForward.lengthSq() <= MOVEMENT_EPSILON_SQ) {
        this.surfaceForward
          .copy(WORLD_FORWARD)
          .projectOnPlane(this.gameplayUpValue);
      }

      this.surfaceForward.normalize();
      this.surfaceRight
        .crossVectors(this.gameplayUpValue, this.surfaceForward)
        .normalize();

      this.moveInput
        .copy(this.surfaceRight)
        .multiplyScalar(clampedX)
        .addScaledVector(this.surfaceForward, -clampedZ);
    } else {
      this.moveInput.set(clampedX, 0, clampedZ);
    }

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

        const traction = this.groundedValue
          ? this.supportTractionMultiplier
          : 1;
        const acceleration =
          (this.groundedValue
            ? this.config.groundAccelerationMetresPerSecondSquared
            : this.config.airAccelerationMetresPerSecondSquared) *
          traction;
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
        this.config.groundBrakingMetresPerSecondSquared *
          this.supportTractionMultiplier *
          deltaSeconds,
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

      const surface = this.surfaces.get(this.movementHit.object);
      this.lastContactSurfaceTagValue = surface.tag;

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
        this.lastContactSurfaceTagValue = surface.tag;
      }

      if (
        surface.bounceSpeedMetresPerSecond > 0 &&
        this.tryApplyBounce(
          surface.bounceSpeedMetresPerSecond,
          velocityIntoSurface,
          this.movementHit.normal,
          this.movementHit.object,
        )
      ) {
        this.remainingDisplacement
          .copy(this.velocityValue)
          .multiplyScalar(deltaSeconds * (1 - travelFraction));
        continue;
      }

      if (surface.adhesive) {
        this.tryAttach(
          this.movementHit.normal,
          this.movementHit.object,
          surface.tag,
          surface.tractionMultiplier,
        );
      }

      const updatedVelocityIntoSurface = this.velocityValue.dot(
        this.movementHit.normal,
      );

      if (updatedVelocityIntoSurface < 0) {
        this.velocityValue.addScaledVector(
          this.movementHit.normal,
          -updatedVelocityIntoSurface,
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

  private tryApplyBounce(
    bounceSpeedMetresPerSecond: number,
    velocityIntoSurface: number,
    surfaceNormal: THREE.Vector3,
    surfaceObject: THREE.Mesh | null,
  ): boolean {
    if (this.bounceCooldownSecondsValue > 0) return false;
    if (
      velocityIntoSurface >
      -this.config.minimumBounceApproachSpeedMetresPerSecond
    ) {
      return false;
    }

    if (this.attachedValue) {
      this.detachFromSurface(this.config.attachmentDetachCooldownSeconds);
    }

    if (velocityIntoSurface < 0) {
      this.velocityValue.addScaledVector(
        surfaceNormal,
        -velocityIntoSurface,
      );
    }

    const outgoingNormalSpeed = this.velocityValue.dot(surfaceNormal);
    if (outgoingNormalSpeed < bounceSpeedMetresPerSecond) {
      this.velocityValue.addScaledVector(
        surfaceNormal,
        bounceSpeedMetresPerSecond - outgoingNormalSpeed,
      );
    }

    this.groundedValue = false;
    this.supportSurfaceTagValue = 'bouncy';
    this.supportTractionMultiplier = 1;
    this.cancelJumpCharge();
    this.coyoteTimeRemainingSecondsValue = 0;
    this.groundReacquireDelaySeconds = Math.max(
      this.groundReacquireDelaySeconds,
      this.config.jumpGroundDetachSeconds,
    );
    this.airborneSeconds = 0;
    this.bounceCooldownSecondsValue = this.config.bounceCooldownSeconds;
    this.lastBounceSpeedValue = bounceSpeedMetresPerSecond;
    this.lastBounceSurfaceNameValue =
      surfaceObject?.name || '<unnamed>';

    return true;
  }

  private tryAttach(
    surfaceNormal: THREE.Vector3,
    surfaceObject: THREE.Mesh | null,
    surfaceTag: SurfaceTag,
    tractionMultiplier: number,
  ): boolean {
    if (!surfaceObject) return false;
    if (!this.isAuthoredWallNormal(surfaceNormal)) return false;
    if (!this.attachedValue && this.attachmentCooldownSecondsValue > 0) {
      return false;
    }

    this.attachedValue = true;
    this.attachmentSurface = surfaceObject;
    this.gameplayUpValue.copy(surfaceNormal).normalize();
    this.groundNormalValue.copy(this.gameplayUpValue);
    this.groundedValue = true;
    this.supportSurfaceTagValue = surfaceTag;
    this.supportTractionMultiplier = tractionMultiplier;
    this.coyoteTimeRemainingSecondsValue = this.config.coyoteTimeSeconds;
    this.groundReacquireDelaySeconds = 0;
    this.airborneSeconds = 0;

    // Attachment support owns the normal axis; keep only tangent motion.
    const normalSpeed = this.velocityValue.dot(this.gameplayUpValue);
    this.velocityValue.addScaledVector(
      this.gameplayUpValue,
      -normalSpeed,
    );

    return true;
  }

  private detachFromSurface(cooldownSeconds: number): void {
    this.attachedValue = false;
    this.attachmentSurface = null;
    this.gameplayUpValue.copy(WORLD_UP);
    this.groundNormalValue.copy(WORLD_UP);
    this.groundedValue = false;
    this.supportSurfaceTagValue = 'default';
    this.supportTractionMultiplier = 1;
    this.attachmentCooldownSecondsValue = Math.max(
      this.attachmentCooldownSecondsValue,
      cooldownSeconds,
    );
  }

  private isAuthoredWallNormal(normal: THREE.Vector3): boolean {
    return (
      Math.abs(normal.dot(WORLD_UP)) <=
      this.config.maximumAttachmentWorldUpDot
    );
  }

  private refreshGroundState(): void {
    this.groundedValue = false;
    this.supportSurfaceTagValue = 'default';
    this.supportTractionMultiplier = 1;

    if (this.groundReacquireDelaySeconds > 0) return;

    if (this.attachedValue) {
      this.groundProbeDisplacement
        .copy(this.gameplayUpValue)
        .multiplyScalar(-this.config.groundProbeDistanceMetres);

      const hasAttachmentSupport = this.world.sweepSphere(
        this.currentPosition,
        this.groundProbeDisplacement,
        this.config.radiusMetres + this.config.skinWidthMetres,
        this.groundHit,
      );

      if (hasAttachmentSupport) {
        const surface = this.surfaces.get(this.groundHit.object);
        const supportDot = this.groundHit.normal.dot(
          this.gameplayUpValue,
        );

        if (
          surface.adhesive &&
          supportDot >= this.config.minimumGroundNormalDot &&
          this.isAuthoredWallNormal(this.groundHit.normal)
        ) {
          this.attachedValue = true;
          this.attachmentSurface = this.groundHit.object;
          this.gameplayUpValue.copy(this.groundHit.normal).normalize();
          this.groundNormalValue.copy(this.gameplayUpValue);
          this.groundedValue = true;
          this.supportSurfaceTagValue = surface.tag;
          this.supportTractionMultiplier = surface.tractionMultiplier;
          this.removeVelocityIntoGround();
          return;
        }
      }

      // Sticky geometry ended or the next authored surface explicitly rejects
      // adhesion. Fall back to world-up and test for ordinary ground below.
      this.detachFromSurface(0);
    }

    this.gameplayUpValue.copy(WORLD_UP);
    this.groundNormalValue.copy(WORLD_UP);
    this.groundProbeDisplacement
      .copy(WORLD_UP)
      .multiplyScalar(-this.config.groundProbeDistanceMetres);

    const hasGroundHit = this.world.sweepSphere(
      this.currentPosition,
      this.groundProbeDisplacement,
      this.config.radiusMetres + this.config.skinWidthMetres,
      this.groundHit,
    );

    if (!hasGroundHit) return;

    const groundDot = this.groundHit.normal.dot(WORLD_UP);
    if (groundDot < this.config.minimumGroundNormalDot) return;

    const surface = this.surfaces.get(this.groundHit.object);
    this.groundedValue = true;
    this.groundNormalValue.copy(this.groundHit.normal);
    this.supportSurfaceTagValue = surface.tag;
    this.supportTractionMultiplier = surface.tractionMultiplier;
    this.removeVelocityIntoGround();
  }

  private removeVelocityIntoGround(): void {
    const velocityIntoGround = this.velocityValue.dot(
      this.groundNormalValue,
    );

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
    // Authored wall attachment is a traversal-state transition, not a
    // floor landing. Keep the existing landing signal reserved for genuine
    // airborne -> walkable-ground contacts used by visual impact effects.
    if (
      groundedAtStepStart ||
      !this.groundedValue ||
      this.attachedValue
    ) {
      return;
    }

    const stableLanding =
      this.airborneSeconds >= this.config.minimumLandingAirTimeSeconds;

    this.airborneSeconds = 0;
    this.coyoteTimeRemainingSecondsValue = this.config.coyoteTimeSeconds;

    if (!stableLanding) return;

    this.landedThisStepValue = true;
    this.lastLandingImpactSpeedValue = impactSpeedMetresPerSecond;

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
      ['attachmentDetachCooldownSeconds', config.attachmentDetachCooldownSeconds],
      ['bounceCooldownSeconds', config.bounceCooldownSeconds],
      [
        'minimumBounceApproachSpeedMetresPerSecond',
        config.minimumBounceApproachSpeedMetresPerSecond,
      ],
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
      ['minimumLandingAirTimeSeconds', config.minimumLandingAirTimeSeconds],
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
      !Number.isFinite(config.maximumAttachmentWorldUpDot) ||
      config.maximumAttachmentWorldUpDot < 0 ||
      config.maximumAttachmentWorldUpDot > 1
    ) {
      throw new Error(
        'maximumAttachmentWorldUpDot must be within [0, 1].',
      );
    }

    if (
      !Number.isInteger(config.maxCollisionIterations) ||
      config.maxCollisionIterations <= 0
    ) {
      throw new Error('maxCollisionIterations must be a positive integer.');
    }
  }
}
