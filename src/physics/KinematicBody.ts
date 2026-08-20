import * as THREE from 'three';

import type { EventBus } from '../core/EventBus.ts';
import { CollisionHit, CollisionWorld } from './CollisionWorld.ts';
import type { MovementEvents } from './MovementEvents.ts';
import {
  type SurfaceRegistry,
  type SurfaceTag,
} from './SurfaceRegistry.ts';

const MOVEMENT_EPSILON_SQ = 1e-12;
const CONTACT_PUSH_METRES = 1e-5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface ReadonlyVector3State {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface JumpInputState {
  pressed: boolean;
  held: boolean;
  released: boolean;
  /** True when an input-boundary reset must invalidate retained intent. */
  cancelled?: boolean;
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

  /** Whether this body may attach to authored sticky surfaces. */
  adhesionEnabled: boolean;
  /** Whether this body may use authored/passive rebound behaviour. */
  reboundEnabled: boolean;
  /**
   * When false, jump presses launch immediately at the minimum jump speed.
   * When true, the existing hold/release charged-jump behaviour is used.
   */
  chargedJumpEnabled: boolean;

  minimumJumpSpeedMetresPerSecond: number;
  maximumJumpSpeedMetresPerSecond: number;
  maximumJumpChargeSeconds: number;
  jumpChargeCurveExponent: number;
  coyoteTimeSeconds: number;
  jumpInputBufferSeconds: number;
  jumpGroundDetachSeconds: number;
  minimumLandingAirTimeSeconds: number;

  /** Maximum abs(dot(surfaceNormal, worldUp)) that may be used as a wall attachment. */
  maximumAttachmentWorldUpDot: number;
  /** Time after an authored detach before the same/new wall may attach again. */
  attachmentDetachCooldownSeconds: number;
  /** Maximum time a deliberate sticky jump retains wall-relative gravity. */
  stickyJumpGravityDurationSeconds: number;
  /** Minimum time between authored bounce impulses. */
  bounceCooldownSeconds: number;
  /** Required approach speed into a bounce surface before it fires. */
  minimumBounceApproachSpeedMetresPerSecond: number;
  /** Minimum downward landing speed that triggers the slime's innate rebound. */
  slimeMinimumBounceImpactSpeedMetresPerSecond: number;
  /** Fraction of vertical impact speed retained by the slime after landing. */
  slimeBounceRestitution: number;
  /** Safety cap for the slime's rebound speed after a very high fall. */
  slimeMaximumBounceSpeedMetresPerSecond: number;
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
  adhesionEnabled: true,
  reboundEnabled: true,
  chargedJumpEnabled: true,

  // Jump height scales with launch speed squared. Multiplying the original
  // 4.8-8.8 m/s charge range by sqrt(1.25) raises every charged jump apex by
  // approximately 25% while preserving the existing charge response.
  minimumJumpSpeedMetresPerSecond: 5.37,
  maximumJumpSpeedMetresPerSecond: 9.84,
  maximumJumpChargeSeconds: 0.7,
  jumpChargeCurveExponent: 1.35,
  coyoteTimeSeconds: 0.1,
  jumpInputBufferSeconds: 0.12,
  jumpGroundDetachSeconds: 0.05,
  minimumLandingAirTimeSeconds: 0.04,

  // Constrained authored-wall policy: supports near-vertical walls, excludes
  // floors and ceilings until ceiling traversal is separately validated.
  maximumAttachmentWorldUpDot: Math.cos(THREE.MathUtils.degToRad(70)),
  attachmentDetachCooldownSeconds: 0.12,
  stickyJumpGravityDurationSeconds: 1.35,
  bounceCooldownSeconds: 0.12,
  minimumBounceApproachSpeedMetresPerSecond: 0.12,
  slimeMinimumBounceImpactSpeedMetresPerSecond: 3.1,
  slimeBounceRestitution: 0.68,
  slimeMaximumBounceSpeedMetresPerSecond: 11,
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
  private supportColliderValue: THREE.Mesh | null = null;

  private groundedValue = false;
  private attachedValue = false;
  private attachmentSurface: THREE.Mesh | null = null;
  private supportSurfaceTagValue: SurfaceTag = 'default';
  private supportTractionMultiplier = 1;
  private lastContactSurfaceTagValue: SurfaceTag = 'default';

  private chargingJumpValue = false;
  private chargeSecondsValue = 0;
  private coyoteTimeRemainingSecondsValue = 0;
  private jumpInputBufferRemainingSecondsValue = 0;
  private bufferedJumpReleasedValue = false;
  private groundReacquireDelaySeconds = 0;
  private airborneSeconds = 0;
  private landedThisStepValue = false;
  private lastLandingImpactSpeedValue = 0;
  private lastJumpSpeedValue = 0;
  private lastJumpChargeFractionValue = 0;
  private lastContactImpactSpeedValue = 0;
  private lastContactNameValue = 'none';

  private attachmentCooldownSecondsValue = 0;
  private stickyJumpGravityActiveValue = false;
  private stickyJumpGravityRemainingSecondsValue = 0;
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
  private readonly movementUpAtStepStart = new THREE.Vector3();
  private readonly launchDirection = new THREE.Vector3();
  private readonly edgeOldUp = new THREE.Vector3();
  private readonly edgeTravelDirection = new THREE.Vector3();
  private readonly edgeProbeDisplacement = new THREE.Vector3();
  private readonly edgeTransitionRotation = new THREE.Quaternion();

  private readonly movementHit = new CollisionHit();
  private readonly groundHit = new CollisionHit();
  private readonly edgeHit = new CollisionHit();
  private readonly carrierHit = new CollisionHit();
  private readonly carrierRemainingDisplacement = new THREE.Vector3();

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

  /** Collider currently providing stable ground/attachment support. */
  get supportCollider(): THREE.Mesh | null {
    return this.supportColliderValue;
  }

  get supportColliderName(): string {
    return this.supportColliderValue?.name || 'none';
  }

  isSupportedBy(collider: THREE.Mesh): boolean {
    return this.groundedValue && this.supportColliderValue === collider;
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

  /** True while attachment or a deliberate sticky jump owns the local up axis. */
  get usingSurfaceGravity(): boolean {
    return this.attachedValue || this.stickyJumpGravityActiveValue;
  }

  get stickyJumpGravityRemainingSeconds(): number {
    return this.stickyJumpGravityRemainingSecondsValue;
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

  get jumpInputBufferRemainingSeconds(): number {
    return this.jumpInputBufferRemainingSecondsValue;
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

  get lastJumpDirection(): ReadonlyVector3State {
    return this.launchDirection;
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
   * `movementDirectionWorld` is the already-resolved camera-relative locomotion
   * direction. Jump charge only affects the impulse along gameplay-up, matching
   * ordinary floor jumping even when gameplay-up belongs to a sticky wall.
   */
  update(
    deltaSeconds: number,
    movementDirectionWorld: ReadonlyVector3State,
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
    const attachedAtStepStart = this.attachedValue;
    if (attachedAtStepStart) {
      this.movementUpAtStepStart.copy(this.gameplayUpValue);
    }

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
    this.updateStickyJumpGravity(deltaSeconds);

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

    this.updateJumpBuffer(deltaSeconds, jumpInput);
    this.updateJumpState(
      deltaSeconds,
      jumpInput,
      this.movementUpAtStepStart,
    );
    this.applyLocomotion(
      deltaSeconds,
      movementDirectionWorld,
      attachedAtStepStart,
      this.movementUpAtStepStart,
    );
    this.applyGravity(deltaSeconds);

    const downwardSpeedBeforeCollision = Math.max(
      0,
      -this.velocityValue.dot(this.gameplayUpValue),
    );

    this.moveAndSlide(deltaSeconds);
    this.refreshGroundState(deltaSeconds);
    this.handleLanding(groundedAtStepStart, downwardSpeedBeforeCollision);
    this.consumeBufferedJumpAfterLanding(jumpInput);
  }


  /**
   * Apply an authored moving-platform displacement without changing velocity.
   *
   * This method is called after the normal body update for the fixed step.
   * `previousPosition` is intentionally left untouched so render interpolation
   * contains both player locomotion and carrier motion. The carrier itself is
   * ignored during the sweep because its transform has already advanced; all
   * other movement colliders still block transport.
   */
  applyCarrierDisplacement(
    displacement: ReadonlyVector3State,
    carrierCollider: THREE.Mesh,
  ): void {
    if (
      !Number.isFinite(displacement.x) ||
      !Number.isFinite(displacement.y) ||
      !Number.isFinite(displacement.z)
    ) {
      throw new Error(
        'Carrier displacement components must be finite.',
      );
    }

    this.carrierRemainingDisplacement.set(
      displacement.x,
      displacement.y,
      displacement.z,
    );

    if (
      this.carrierRemainingDisplacement.lengthSq() <=
      MOVEMENT_EPSILON_SQ
    ) {
      return;
    }

    const queryRadius =
      this.config.radiusMetres + this.config.skinWidthMetres;

    for (
      let iteration = 0;
      iteration < this.config.maxCollisionIterations;
      iteration += 1
    ) {
      if (
        this.carrierRemainingDisplacement.lengthSq() <=
        MOVEMENT_EPSILON_SQ
      ) {
        break;
      }

      const hit = this.world.sweepSphere(
        this.currentPosition,
        this.carrierRemainingDisplacement,
        queryRadius,
        this.carrierHit,
        undefined,
        carrierCollider,
      );

      if (!hit) {
        this.currentPosition.add(
          this.carrierRemainingDisplacement,
        );
        this.carrierRemainingDisplacement.set(0, 0, 0);
        break;
      }

      const travelFraction = THREE.MathUtils.clamp(
        this.carrierHit.fraction,
        0,
        1,
      );

      if (travelFraction > 0) {
        this.currentPosition.addScaledVector(
          this.carrierRemainingDisplacement,
          travelFraction,
        );
      }

      this.currentPosition.addScaledVector(
        this.carrierHit.normal,
        CONTACT_PUSH_METRES,
      );

      this.carrierRemainingDisplacement.multiplyScalar(
        1 - travelFraction,
      );
      const intoSurface =
        this.carrierRemainingDisplacement.dot(
          this.carrierHit.normal,
        );

      if (intoSurface < 0) {
        this.carrierRemainingDisplacement.addScaledVector(
          this.carrierHit.normal,
          -intoSurface,
        );
      }
    }
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
    this.supportColliderValue = null;
    this.stickyJumpGravityActiveValue = false;
    this.stickyJumpGravityRemainingSecondsValue = 0;
    this.gameplayUpValue.copy(WORLD_UP);
    this.groundNormalValue.copy(WORLD_UP);
    this.supportSurfaceTagValue = 'default';
    this.supportTractionMultiplier = 1;
    this.lastContactSurfaceTagValue = 'default';
    this.cancelJumpCharge();
    this.clearJumpBuffer();
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
    movementUpAtStepStart: THREE.Vector3,
  ): void {
    if (!this.config.chargedJumpEnabled) {
      // Normal-jump bodies launch on the press edge instead of entering the
      // charge/hold/release state. Holding Space cannot repeatedly relaunch
      // because Input emits `pressed` only once per physical press.
      if (this.chargingJumpValue) this.cancelJumpCharge();
      if (jumpInput.pressed && this.hasJumpOpportunity()) {
        this.launchNormalJump();
      }
      return;
    }

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

      if (jumpInput.released) {
        this.launchChargedJump(movementUpAtStepStart);
      }
      return;
    }

    if (!jumpInput.pressed || !this.hasJumpOpportunity()) return;

    this.chargingJumpValue = true;
    this.chargeSecondsValue = jumpInput.held
      ? Math.min(deltaSeconds, this.config.maximumJumpChargeSeconds)
      : 0;

    if (jumpInput.released) {
      this.launchChargedJump(movementUpAtStepStart);
    }
  }

  /** Retain a deliberate airborne press briefly so landing does not eat it. */
  private updateJumpBuffer(
    deltaSeconds: number,
    jumpInput: Readonly<JumpInputState>,
  ): void {
    if (jumpInput.cancelled) this.clearJumpBuffer();

    if (this.jumpInputBufferRemainingSecondsValue > 0) {
      this.jumpInputBufferRemainingSecondsValue = Math.max(
        0,
        this.jumpInputBufferRemainingSecondsValue - deltaSeconds,
      );

      if (this.jumpInputBufferRemainingSecondsValue === 0) {
        this.bufferedJumpReleasedValue = false;
      } else if (jumpInput.released) {
        this.bufferedJumpReleasedValue = true;
      } else if (!jumpInput.held && !this.bufferedJumpReleasedValue) {
        // Focus loss clears held input without synthesizing a release. Do not
        // turn that cleared state into a stale jump after focus returns.
        this.clearJumpBuffer();
      }
    }

    if (jumpInput.pressed && !this.hasJumpOpportunity()) {
      this.jumpInputBufferRemainingSecondsValue =
        this.config.jumpInputBufferSeconds;
      this.bufferedJumpReleasedValue = jumpInput.released;
    }
  }

  /** Consume buffered intent after collision has established new support. */
  private consumeBufferedJumpAfterLanding(
    jumpInput: Readonly<JumpInputState>,
  ): void {
    if (
      this.jumpInputBufferRemainingSecondsValue <= 0 ||
      this.chargingJumpValue ||
      !this.hasJumpOpportunity()
    ) {
      return;
    }

    if (!this.config.chargedJumpEnabled) {
      this.clearJumpBuffer();
      this.launchNormalJump();
      return;
    }

    const launchImmediately =
      this.bufferedJumpReleasedValue || jumpInput.released;
    this.clearJumpBuffer();
    this.chargingJumpValue = true;
    this.chargeSecondsValue = 0;

    if (launchImmediately) {
      this.launchChargedJump(this.gameplayUpValue);
    }
  }

  /**
   * Immediate non-charged jump used by identities such as Goop.
   *
   * It reuses the minimum jump speed as the authored normal-jump strength,
   * preserves coyote/buffer behaviour, and never enters the charge state.
   */
  private launchNormalJump(): void {
    const jumpSpeed = this.config.minimumJumpSpeedMetresPerSecond;
    this.launchDirection.copy(this.gameplayUpValue);

    const currentLaunchSpeed =
      this.velocityValue.dot(this.launchDirection);
    if (currentLaunchSpeed < jumpSpeed) {
      this.velocityValue.addScaledVector(
        this.launchDirection,
        jumpSpeed - currentLaunchSpeed,
      );
    }

    this.lastJumpSpeedValue = jumpSpeed;
    this.lastJumpChargeFractionValue = 0;

    if (this.attachedValue) {
      this.detachFromSurface(this.config.attachmentDetachCooldownSeconds);
    } else {
      this.groundedValue = false;
      this.groundNormalValue.copy(WORLD_UP);
    }

    this.cancelJumpCharge();
    this.clearJumpBuffer();
    this.coyoteTimeRemainingSecondsValue = 0;
    this.groundReacquireDelaySeconds =
      this.config.jumpGroundDetachSeconds;
    this.airborneSeconds = 0;

    this.events?.emit('jumped', {
      speedMetresPerSecond: jumpSpeed,
      chargeFraction: 0,
      directionWorld: this.launchDirection,
    });
  }

  private launchChargedJump(movementUpAtStepStart: THREE.Vector3): void {
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

    // A sticky wall is simply the body's current ground: charge controls only
    // the local-up impulse. Existing tangent locomotion is preserved naturally
    // instead of being replaced by a charged directional dash.
    this.launchDirection.copy(this.gameplayUpValue);
    const currentLaunchSpeed =
      this.velocityValue.dot(this.launchDirection);

    if (currentLaunchSpeed < jumpSpeed) {
      this.velocityValue.addScaledVector(
        this.launchDirection,
        jumpSpeed - currentLaunchSpeed,
      );
    }

    this.lastJumpSpeedValue = jumpSpeed;
    this.lastJumpChargeFractionValue = normalizedCharge;

    if (this.attachedValue) {
      this.beginStickyJumpGravity(movementUpAtStepStart);
      this.detachFromSurface(
        this.config.attachmentDetachCooldownSeconds,
        true,
      );
    } else {
      this.groundedValue = false;
      this.groundNormalValue.copy(WORLD_UP);
    }

    this.chargingJumpValue = false;
    this.chargeSecondsValue = 0;
    this.clearJumpBuffer();
    this.coyoteTimeRemainingSecondsValue = 0;
    this.groundReacquireDelaySeconds =
      this.config.jumpGroundDetachSeconds;
    this.airborneSeconds = 0;

    this.events?.emit('jumped', {
      speedMetresPerSecond: jumpSpeed,
      chargeFraction: normalizedCharge,
      directionWorld: this.launchDirection,
    });
  }

  private cancelJumpCharge(): void {
    this.chargingJumpValue = false;
    this.chargeSecondsValue = 0;
  }

  private clearJumpBuffer(): void {
    this.jumpInputBufferRemainingSecondsValue = 0;
    this.bufferedJumpReleasedValue = false;
  }

  private hasJumpOpportunity(): boolean {
    return (
      this.groundedValue ||
      this.coyoteTimeRemainingSecondsValue > 0
    );
  }

  private applyLocomotion(
    deltaSeconds: number,
    movementDirectionWorld: ReadonlyVector3State,
    attachedAtStepStart: boolean,
    movementUpAtStepStart: THREE.Vector3,
  ): void {
    this.moveInput.set(
      THREE.MathUtils.clamp(movementDirectionWorld.x, -1, 1),
      THREE.MathUtils.clamp(movementDirectionWorld.y, -1, 1),
      THREE.MathUtils.clamp(movementDirectionWorld.z, -1, 1),
    );

    if (this.moveInput.lengthSq() > 1) this.moveInput.normalize();

    // Freeze only an attached support plane selected at the start of the fixed
    // step. A wall-jump release must retain its already-resolved wall direction,
    // while an ordinary slope jump must use the current airborne world-up plane.
    this.movementPlaneNormal.copy(
      attachedAtStepStart
        ? movementUpAtStepStart
        : this.groundedValue
          ? this.groundNormalValue
          : this.gameplayUpValue,
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
      .copy(this.usingSurfaceGravity ? this.gameplayUpValue : WORLD_UP)
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

  private moveAndSlide(deltaSeconds: number, allowSurfaceTransitions = true): void {
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
        allowSurfaceTransitions &&
        this.config.reboundEnabled &&
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

      if (
        allowSurfaceTransitions &&
        this.tryApplySlimeLandingBounce(
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

      if (
        allowSurfaceTransitions &&
        this.config.adhesionEnabled &&
        surface.adhesive
      ) {
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

    this.applyBounceImpulse(
      bounceSpeedMetresPerSecond,
      velocityIntoSurface,
      surfaceNormal,
      surfaceObject,
    );

    return true;
  }

  /**
   * Default slime rebound: only genuine floor/slope landings bounce. Rebound
   * speed is proportional to the impact, retains less than full energy, and
   * is capped so a very tall fall remains controllable.
   */
  private tryApplySlimeLandingBounce(
    velocityIntoSurface: number,
    surfaceNormal: THREE.Vector3,
    surfaceObject: THREE.Mesh | null,
  ): boolean {
    if (!this.config.reboundEnabled) return false;
    if (this.bounceCooldownSecondsValue > 0) return false;
    // Deliberate buffered input wins over the slime's passive floor rebound.
    // The collision may then establish support and consume the buffer below;
    // authored bouncy surfaces have already been handled before this path.
    if (this.jumpInputBufferRemainingSecondsValue > 0) return false;
    if (
      surfaceNormal.dot(WORLD_UP) < this.config.minimumGroundNormalDot ||
      velocityIntoSurface >=
        -this.config.slimeMinimumBounceImpactSpeedMetresPerSecond
    ) {
      return false;
    }

    const reboundSpeed = Math.min(
      this.config.slimeMaximumBounceSpeedMetresPerSecond,
      -velocityIntoSurface * this.config.slimeBounceRestitution,
    );
    this.applyBounceImpulse(
      reboundSpeed,
      velocityIntoSurface,
      surfaceNormal,
      surfaceObject,
    );

    return true;
  }

  private applyBounceImpulse(
    bounceSpeedMetresPerSecond: number,
    velocityIntoSurface: number,
    surfaceNormal: THREE.Vector3,
    surfaceObject: THREE.Mesh | null,
  ): void {
    if (this.attachedValue) {
      this.detachFromSurface(this.config.attachmentDetachCooldownSeconds);
    } else if (this.stickyJumpGravityActiveValue) {
      this.clearStickyJumpGravity();
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
    this.supportColliderValue = null;
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
    this.supportColliderValue = surfaceObject;
    this.stickyJumpGravityActiveValue = false;
    this.stickyJumpGravityRemainingSecondsValue = 0;
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

  private detachFromSurface(
    cooldownSeconds: number,
    preserveStickyJumpGravity = false,
  ): void {
    this.attachedValue = false;
    this.attachmentSurface = null;
    this.groundedValue = false;
    this.supportSurfaceTagValue = 'default';
    this.supportTractionMultiplier = 1;
    this.supportColliderValue = null;
    if (preserveStickyJumpGravity) {
      this.groundNormalValue.copy(this.gameplayUpValue);
    } else {
      this.clearStickyJumpGravity();
    }
    this.attachmentCooldownSecondsValue = Math.max(
      this.attachmentCooldownSecondsValue,
      cooldownSeconds,
    );
  }

  private detachAfterLosingSurfaceSupport(): void {
    this.attachedValue = false;
    this.attachmentSurface = null;
    this.supportColliderValue = null;
    this.groundedValue = false;
    this.supportSurfaceTagValue = 'default';
    this.supportTractionMultiplier = 1;
    this.clearStickyJumpGravity();
  }

  private isAuthoredWallNormal(normal: THREE.Vector3): boolean {
    return (
      Math.abs(normal.dot(WORLD_UP)) <=
      this.config.maximumAttachmentWorldUpDot
    );
  }

  private refreshGroundState(deltaSeconds = 0): void {
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
          this.supportColliderValue = this.groundHit.object;
          this.gameplayUpValue.copy(this.groundHit.normal).normalize();
          this.groundNormalValue.copy(this.gameplayUpValue);
          this.groundedValue = true;
          this.supportSurfaceTagValue = surface.tag;
          this.supportTractionMultiplier = surface.tractionMultiplier;
          this.removeVelocityIntoGround();
          return;
        }
      }

      if (this.tryTransitionAcrossAttachedEdge(deltaSeconds)) return;

      // CameraRig smooths presentation independently. Authoritative movement,
      // gravity, and landing calculations return to world-up immediately.
      this.detachAfterLosingSurfaceSupport();
    }

    if (this.stickyJumpGravityActiveValue) {
      this.groundNormalValue.copy(this.gameplayUpValue);
    } else {
      this.gameplayUpValue.copy(WORLD_UP);
      this.groundNormalValue.copy(WORLD_UP);
    }
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
    this.clearStickyJumpGravity();
    this.groundedValue = true;
    this.groundNormalValue.copy(this.groundHit.normal);
    this.supportColliderValue = this.groundHit.object;
    this.supportSurfaceTagValue = surface.tag;
    this.supportTractionMultiplier = surface.tractionMultiplier;
    this.removeVelocityIntoGround();
  }

  /**
   * Continue across a convex edge of authored sticky geometry.
   *
   * Once the old support probe passes an edge, sweep a short distance back
   * along the just-travelled tangent. The adjacent face is the one whose normal
   * points along that travel direction. Rotating velocity with the support
   * frame carries motion over the edge instead of dropping or snapping axes.
   */
  private tryTransitionAcrossAttachedEdge(deltaSeconds: number): boolean {
    this.edgeOldUp.copy(this.gameplayUpValue);
    this.edgeTravelDirection
      .copy(this.velocityValue)
      .projectOnPlane(this.edgeOldUp);
    const tangentialSpeed = this.edgeTravelDirection.length();
    if (tangentialSpeed * tangentialSpeed <= MOVEMENT_EPSILON_SQ) return false;

    this.edgeTravelDirection.multiplyScalar(1 / tangentialSpeed);
    this.edgeProbeDisplacement
      .copy(this.edgeTravelDirection)
      .multiplyScalar(
        -(
          this.config.groundProbeDistanceMetres +
          tangentialSpeed * Math.max(0, deltaSeconds)
        ),
      )
      .addScaledVector(
        this.edgeOldUp,
        -this.config.groundProbeDistanceMetres,
      );

    if (
      !this.world.sweepSphere(
        this.currentPosition,
        this.edgeProbeDisplacement,
        this.config.radiusMetres + this.config.skinWidthMetres,
        this.edgeHit,
      )
    ) {
      return false;
    }

    const surface = this.surfaces.get(this.edgeHit.object);
    if (!this.config.adhesionEnabled || !surface.adhesive) return false;

    const transitionNormal = this.edgeHit.normal;
    if (
      transitionNormal.dot(this.edgeTravelDirection) <
      this.config.minimumGroundNormalDot
    ) {
      return false;
    }

    const walkableGround =
      transitionNormal.dot(WORLD_UP) >= this.config.minimumGroundNormalDot;
    const attachableWall = this.isAuthoredWallNormal(transitionNormal);
    if (!walkableGround && !attachableWall) return false;

    this.edgeTransitionRotation.setFromUnitVectors(
      this.edgeOldUp,
      transitionNormal,
    );
    this.velocityValue
      .applyQuaternion(this.edgeTransitionRotation)
      .projectOnPlane(transitionNormal);
    this.currentPosition
      .copy(this.edgeHit.point)
      .addScaledVector(transitionNormal, CONTACT_PUSH_METRES);

    this.groundedValue = true;
    this.attachedValue = attachableWall;
    this.attachmentSurface = attachableWall ? this.edgeHit.object : null;
    this.stickyJumpGravityActiveValue = false;
    this.stickyJumpGravityRemainingSecondsValue = 0;
    this.gameplayUpValue.copy(
      attachableWall ? transitionNormal : WORLD_UP,
    );
    this.groundNormalValue.copy(transitionNormal);
    this.supportSurfaceTagValue = surface.tag;
    this.supportTractionMultiplier = surface.tractionMultiplier;
    this.coyoteTimeRemainingSecondsValue = this.config.coyoteTimeSeconds;
    this.groundReacquireDelaySeconds = 0;
    this.airborneSeconds = 0;
    return true;
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

  private beginStickyJumpGravity(surfaceUp: THREE.Vector3): void {
    this.gameplayUpValue.copy(surfaceUp).normalize();
    this.groundNormalValue.copy(this.gameplayUpValue);
    this.stickyJumpGravityActiveValue = true;
    this.stickyJumpGravityRemainingSecondsValue =
      this.config.stickyJumpGravityDurationSeconds;
  }

  private updateStickyJumpGravity(deltaSeconds: number): void {
    if (!this.stickyJumpGravityActiveValue || this.attachedValue) return;
    this.stickyJumpGravityRemainingSecondsValue = Math.max(
      0,
      this.stickyJumpGravityRemainingSecondsValue - deltaSeconds,
    );
    if (this.stickyJumpGravityRemainingSecondsValue === 0) {
      this.clearStickyJumpGravity();
    }
  }

  private clearStickyJumpGravity(): void {
    this.stickyJumpGravityActiveValue = false;
    this.stickyJumpGravityRemainingSecondsValue = 0;
    this.gameplayUpValue.copy(WORLD_UP);
    this.groundNormalValue.copy(WORLD_UP);
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
    if (
      typeof config.adhesionEnabled !== 'boolean' ||
      typeof config.reboundEnabled !== 'boolean' ||
      typeof config.chargedJumpEnabled !== 'boolean'
    ) {
      throw new Error(
        'adhesionEnabled, reboundEnabled, and chargedJumpEnabled must be boolean values.',
      );
    }

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
      [
        'stickyJumpGravityDurationSeconds',
        config.stickyJumpGravityDurationSeconds,
      ],
      ['bounceCooldownSeconds', config.bounceCooldownSeconds],
      [
        'minimumBounceApproachSpeedMetresPerSecond',
        config.minimumBounceApproachSpeedMetresPerSecond,
      ],
      [
        'slimeMinimumBounceImpactSpeedMetresPerSecond',
        config.slimeMinimumBounceImpactSpeedMetresPerSecond,
      ],
      [
        'slimeMaximumBounceSpeedMetresPerSecond',
        config.slimeMaximumBounceSpeedMetresPerSecond,
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

    if (
      !Number.isFinite(config.slimeBounceRestitution) ||
      config.slimeBounceRestitution <= 0 ||
      config.slimeBounceRestitution >= 1
    ) {
      throw new Error(
        'slimeBounceRestitution must be finite and within (0, 1).',
      );
    }

    const nonNegativeFinite: ReadonlyArray<[string, number]> = [
      ['airDragPerSecond', config.airDragPerSecond],
      ['coyoteTimeSeconds', config.coyoteTimeSeconds],
      ['jumpInputBufferSeconds', config.jumpInputBufferSeconds],
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
