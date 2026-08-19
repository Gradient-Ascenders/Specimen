import * as THREE from 'three';

import {
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../physics/CollisionWorld.ts';
import {
  type CameraLookSettings,
  exponentialDampingAlpha,
  mapPointerAxisToOrbitRadians,
  resolveCameraDistance,
} from './CameraMath.ts';

export const CAMERA_VERTICAL_FOV_DEGREES = 48;
export const CAMERA_NEAR_PLANE_METRES = 0.1;
export const CAMERA_FAR_PLANE_METRES = 200;
export const MIN_FOLLOW_DISTANCE_METRES = 3.5;
export const MAX_FOLLOW_DISTANCE_METRES = 7;

export interface ReadonlyCameraVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Read-only handoff from authoritative movement to render-side camera logic.
 *
 * `gameplayUp` is the orientation target. Future sticky-surface movement owns
 * that value and the attached transition; CameraRig only damps a private copy.
 */
export interface CameraFollowTarget {
  readonly position: ReadonlyCameraVector3;
  readonly previousPosition: ReadonlyCameraVector3;
  readonly velocity: ReadonlyCameraVector3;
  readonly gameplayUp: ReadonlyCameraVector3;
  readonly grounded: boolean;
  readonly attached: boolean;
}

export interface CameraRigConfig extends CameraLookSettings {
  /** Distance from the framing pivot to the camera in open space. */
  followDistanceMetres: number;
  /** Preferred lower distance; a nearer obstruction may override it. */
  minimumDistanceMetres: number;
  /** Framing-pivot height along gameplay-up from the body centre. */
  targetHeightMetres: number;
  /** Maximum render-only target lag before the rig catches up. */
  maximumFollowLagMetres: number;
  /** Exponential damping coefficient for the target pivot. */
  followDampingPerSecond: number;
  /** Exponential damping coefficient for gameplay-up transitions. */
  orientationDampingPerSecond: number;
  /** Exponential damping coefficient used only while moving back outward. */
  recoveryDampingPerSecond: number;
  /** Clear time before open-space distance recovery begins. */
  recoveryDelaySeconds: number;
  /** Swept-sphere radius that keeps the near plane away from geometry. */
  obstructionRadiusMetres: number;
  /** Extra inward offset from the swept-sphere contact. */
  obstructionBufferMetres: number;
  /** Follow errors beyond this are treated as teleports/checkpoint resets. */
  teleportSnapDistanceMetres: number;
  minimumPitchRadians: number;
  maximumPitchRadians: number;
  initialPitchRadians: number;
}

export const DEFAULT_CAMERA_RIG_CONFIG: Readonly<CameraRigConfig> = {
  followDistanceMetres: 5.2,
  minimumDistanceMetres: 0.2,
  targetHeightMetres: 0.35,
  maximumFollowLagMetres: 0.28,
  followDampingPerSecond: 18,
  orientationDampingPerSecond: 10,
  recoveryDampingPerSecond: 5,
  recoveryDelaySeconds: 0.08,
  obstructionRadiusMetres: 0.22,
  obstructionBufferMetres: 0.03,
  teleportSnapDistanceMetres: 3,
  horizontalSensitivityRadiansPerPixel: 0.0022,
  verticalSensitivityRadiansPerPixel: 0.002,
  invertHorizontal: false,
  invertVertical: false,
  minimumPitchRadians: THREE.MathUtils.degToRad(-25),
  maximumPitchRadians: THREE.MathUtils.degToRad(65),
  initialPitchRadians: THREE.MathUtils.degToRad(18),
};

export interface CameraRigDiagnostics {
  readonly currentDistanceMetres: number;
  readonly desiredDistanceMetres: number;
  readonly obstructed: boolean;
  readonly obstructionName: string;
  readonly targetGrounded: boolean;
  readonly targetAttached: boolean;
  readonly pitchRadians: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CAMERA_BASIS_EPSILON_SQ = 1e-10;

/**
 * Platforming-oriented third-person orbit/follow camera.
 *
 * The rig owns only visual state. It interpolates and damps read-only movement
 * values, then sphere-sweeps its boom against the camera-obstruction query
 * layer. It never mutates its follow target.
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(
    CAMERA_VERTICAL_FOV_DEGREES,
    1,
    CAMERA_NEAR_PLANE_METRES,
    CAMERA_FAR_PLANE_METRES,
  );

  private readonly config: CameraRigConfig;
  private followTarget: CameraFollowTarget | undefined;
  private obstructionWorld: CollisionWorld | undefined;

  private readonly interpolatedTarget = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private readonly followError = new THREE.Vector3();
  private readonly framingPivot = new THREE.Vector3();
  private readonly targetUp = new THREE.Vector3(0, 1, 0);
  private readonly smoothedUp = new THREE.Vector3(0, 1, 0);
  private readonly planarBack = new THREE.Vector3(0, 0, 1);
  private readonly boomDirection = new THREE.Vector3();
  private readonly boomDisplacement = new THREE.Vector3();
  private readonly groundBack = new THREE.Vector3(0, 0, 1);
  private readonly groundRight = new THREE.Vector3(1, 0, 0);
  private readonly surfaceUp = new THREE.Vector3(0, 1, 0);
  private readonly upRotation = new THREE.Quaternion();
  private readonly partialUpRotation = new THREE.Quaternion();
  private readonly yawRotation = new THREE.Quaternion();
  private readonly obstructionHit = new CollisionHit();

  private pitchRadians: number;
  private queuedYawRadians = 0;
  private queuedPitchRadians = 0;
  private currentDistanceMetres: number;
  private clearTimeSeconds = 0;
  private initialized = false;
  private obstructed = false;
  private obstructionName = 'none';
  private targetGrounded = false;
  private targetAttached = false;

  constructor(config: Partial<CameraRigConfig> = {}) {
    this.config = {
      ...DEFAULT_CAMERA_RIG_CONFIG,
      ...config,
    };
    this.validateConfig(this.config);

    this.pitchRadians = this.config.initialPitchRadians;
    this.currentDistanceMetres = this.config.followDistanceMetres;
    this.camera.name = 'game-perspective-camera';
    this.resize(1, 1);
  }

  setFollowTarget(
    target: CameraFollowTarget,
    obstructionWorld: CollisionWorld,
  ): void {
    this.followTarget = target;
    this.obstructionWorld = obstructionWorld;
    this.initialized = false;
  }

  setLookSettings(settings: Partial<CameraLookSettings>): void {
    if (settings.horizontalSensitivityRadiansPerPixel !== undefined) {
      this.validateSensitivity(
        'horizontalSensitivityRadiansPerPixel',
        settings.horizontalSensitivityRadiansPerPixel,
      );
      this.config.horizontalSensitivityRadiansPerPixel =
        settings.horizontalSensitivityRadiansPerPixel;
    }
    if (settings.verticalSensitivityRadiansPerPixel !== undefined) {
      this.validateSensitivity(
        'verticalSensitivityRadiansPerPixel',
        settings.verticalSensitivityRadiansPerPixel,
      );
      this.config.verticalSensitivityRadiansPerPixel =
        settings.verticalSensitivityRadiansPerPixel;
    }
    if (settings.invertHorizontal !== undefined) {
      this.config.invertHorizontal = settings.invertHorizontal;
    }
    if (settings.invertVertical !== undefined) {
      this.config.invertVertical = settings.invertVertical;
    }
  }

  setFollowDistanceMetres(distanceMetres: number): void {
    if (
      !Number.isFinite(distanceMetres) ||
      distanceMetres < MIN_FOLLOW_DISTANCE_METRES ||
      distanceMetres > MAX_FOLLOW_DISTANCE_METRES
    ) {
      throw new Error(
        `follow distance must be between ${MIN_FOLLOW_DISTANCE_METRES} and ${MAX_FOLLOW_DISTANCE_METRES} metres.`,
      );
    }

    this.config.followDistanceMetres = distanceMetres;
  }

  /** Queue centralized pointer-lock input for the next rendered pose. */
  queueLookInput(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

    this.queuedYawRadians += mapPointerAxisToOrbitRadians(
      deltaX,
      this.config.horizontalSensitivityRadiansPerPixel,
      this.config.invertHorizontal,
    );
    // Browser +Y points down, and positive rig pitch raises the camera so its
    // view points down. The generic mapper follows yaw's opposite sign, so
    // translate it only at this pitch integration boundary.
    this.queuedPitchRadians -= mapPointerAxisToOrbitRadians(
      deltaY,
      this.config.verticalSensitivityRadiansPerPixel,
      this.config.invertVertical,
    );
  }

  /**
   * Integrate queued pointer motion into the player-owned orbit immediately.
   *
   * The fixed update calls this before resolving movement, so a mouse turn and
   * a movement key observed in the same step use the same camera orientation.
   * Pointer deltas are already displacement samples and are deliberately not
   * multiplied by frame time.
   */
  applyQueuedLookInput(): void {
    if (this.queuedYawRadians !== 0) {
      this.yawRotation.setFromAxisAngle(
        this.smoothedUp,
        this.queuedYawRadians,
      );
      this.planarBack.applyQuaternion(this.yawRotation).normalize();
    }

    this.pitchRadians = THREE.MathUtils.clamp(
      this.pitchRadians + this.queuedPitchRadians,
      this.config.minimumPitchRadians,
      this.config.maximumPitchRadians,
    );
    this.queuedYawRadians = 0;
    this.queuedPitchRadians = 0;
  }

  /**
   * Convert an input vector into a normalized world-space ground direction.
   * `moveZ` follows the controller convention: -1 is forward, +1 is backward.
   * Camera pitch and the blob's facing are intentionally absent from this math.
   */
  copyGroundMovementDirection(
    moveX: number,
    moveZ: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    const clampedX = THREE.MathUtils.clamp(moveX, -1, 1);
    const clampedZ = THREE.MathUtils.clamp(moveZ, -1, 1);

    this.groundBack.copy(this.planarBack).projectOnPlane(WORLD_UP);
    if (this.groundBack.lengthSq() <= CAMERA_BASIS_EPSILON_SQ) {
      this.groundBack.set(0, 0, 1);
    } else {
      this.groundBack.normalize();
    }
    this.groundRight.crossVectors(WORLD_UP, this.groundBack).normalize();

    target
      .copy(this.groundRight)
      .multiplyScalar(clampedX)
      .addScaledVector(this.groundBack, clampedZ);
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  /**
   * Convert input into the displayed camera basis on an attached surface.
   * The authoritative support normal defines the movement plane; camera pitch
   * remains excluded, so left/right always follows screen-left/screen-right.
   */
  copySurfaceMovementDirection(
    moveX: number,
    moveZ: number,
    gameplayUp: ReadonlyCameraVector3,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    const clampedX = THREE.MathUtils.clamp(moveX, -1, 1);
    const clampedZ = THREE.MathUtils.clamp(moveZ, -1, 1);
    this.surfaceUp.set(gameplayUp.x, gameplayUp.y, gameplayUp.z);
    if (this.surfaceUp.lengthSq() <= CAMERA_BASIS_EPSILON_SQ) {
      this.surfaceUp.copy(WORLD_UP);
    } else {
      this.surfaceUp.normalize();
    }

    this.groundBack.copy(this.planarBack).projectOnPlane(this.surfaceUp);
    if (this.groundBack.lengthSq() <= CAMERA_BASIS_EPSILON_SQ) {
      this.groundBack.set(0, 0, 1).projectOnPlane(this.surfaceUp);
      if (this.groundBack.lengthSq() <= CAMERA_BASIS_EPSILON_SQ) {
        this.groundBack.set(1, 0, 0).projectOnPlane(this.surfaceUp);
      }
    }
    this.groundBack.normalize();
    this.groundRight
      .crossVectors(this.surfaceUp, this.groundBack)
      .normalize();

    target
      .copy(this.groundRight)
      .multiplyScalar(clampedX)
      .addScaledVector(this.groundBack, clampedZ);
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  update(interpolationAlpha: number, deltaSeconds: number): void {
    const target = this.followTarget;
    if (!target) return;

    const safeAlpha = THREE.MathUtils.clamp(interpolationAlpha, 0, 1);
    const safeDeltaSeconds = Math.max(0, deltaSeconds);
    this.interpolateTarget(target, safeAlpha);
    this.readTargetUp(target.gameplayUp);
    this.targetGrounded = target.grounded;
    this.targetAttached = target.attached;

    if (!this.initialized) this.initializePose();

    const presentationDiscontinuity = this.isPresentationDiscontinuity(
      target.velocity,
      safeDeltaSeconds,
    );
    if (presentationDiscontinuity) {
      this.resetPresentationForDiscontinuity();
    } else {
      this.updateOrientation(safeDeltaSeconds);
      this.updateFollowPosition(safeDeltaSeconds);
    }
    this.applyQueuedLookInput();
    this.updateCameraDistance(safeDeltaSeconds);
    this.writeCameraPose();
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
  }

  getDiagnostics(): CameraRigDiagnostics {
    return {
      currentDistanceMetres: this.currentDistanceMetres,
      desiredDistanceMetres: this.config.followDistanceMetres,
      obstructed: this.obstructed,
      obstructionName: this.obstructionName,
      targetGrounded: this.targetGrounded,
      targetAttached: this.targetAttached,
      pitchRadians: this.pitchRadians,
    };
  }

  private initializePose(): void {
    this.smoothedTarget.copy(this.interpolatedTarget);
    this.smoothedUp.copy(this.targetUp);
    this.ensurePlanarBack();
    this.currentDistanceMetres = this.config.followDistanceMetres;
    this.clearTimeSeconds = 0;
    this.initialized = true;
  }

  private interpolateTarget(
    target: CameraFollowTarget,
    interpolationAlpha: number,
  ): void {
    this.interpolatedTarget.set(
      THREE.MathUtils.lerp(
        target.previousPosition.x,
        target.position.x,
        interpolationAlpha,
      ),
      THREE.MathUtils.lerp(
        target.previousPosition.y,
        target.position.y,
        interpolationAlpha,
      ),
      THREE.MathUtils.lerp(
        target.previousPosition.z,
        target.position.z,
        interpolationAlpha,
      ),
    );
  }

  private readTargetUp(gameplayUp: ReadonlyCameraVector3): void {
    this.targetUp.set(gameplayUp.x, gameplayUp.y, gameplayUp.z);
    if (this.targetUp.lengthSq() <= 1e-12) {
      this.targetUp.set(0, 1, 0);
    } else {
      this.targetUp.normalize();
    }
  }

  private updateOrientation(deltaSeconds: number): void {
    const alpha = exponentialDampingAlpha(
      this.config.orientationDampingPerSecond,
      deltaSeconds,
    );
    if (alpha <= 0 || this.smoothedUp.dot(this.targetUp) >= 1 - 1e-10) {
      return;
    }

    this.upRotation.setFromUnitVectors(this.smoothedUp, this.targetUp);
    this.partialUpRotation.identity().slerp(this.upRotation, alpha);
    this.smoothedUp.applyQuaternion(this.partialUpRotation).normalize();
    this.planarBack
      .applyQuaternion(this.partialUpRotation)
      .projectOnPlane(this.smoothedUp);
    this.ensurePlanarBack();
  }

  private isPresentationDiscontinuity(
    velocity: ReadonlyCameraVector3,
    deltaSeconds: number,
  ): boolean {
    const targetSpeedMetresPerSecond = Math.hypot(
      velocity.x,
      velocity.y,
      velocity.z,
    );
    const snapDistance =
      this.config.teleportSnapDistanceMetres +
      targetSpeedMetresPerSecond * deltaSeconds;

    return (
      this.smoothedTarget.distanceTo(this.interpolatedTarget) > snapDistance
    );
  }

  private resetPresentationForDiscontinuity(): void {
    this.smoothedTarget.copy(this.interpolatedTarget);
    this.smoothedUp.copy(this.targetUp);
    // Preserve the accumulated orbit heading while rebuilding a valid tangent
    // against the destination up basis. Pitch is an independent scalar and is
    // intentionally left untouched.
    this.ensurePlanarBack();
    this.currentDistanceMetres = this.config.followDistanceMetres;
    this.clearTimeSeconds = 0;
    this.obstructed = false;
    this.obstructionName = 'none';
  }

  private updateFollowPosition(deltaSeconds: number): void {
    this.smoothedTarget.lerp(
      this.interpolatedTarget,
      exponentialDampingAlpha(
        this.config.followDampingPerSecond,
        deltaSeconds,
      ),
    );

    this.followError.subVectors(
      this.interpolatedTarget,
      this.smoothedTarget,
    );
    const lagMetres = this.followError.length();
    if (lagMetres <= this.config.maximumFollowLagMetres || lagMetres <= 1e-9) {
      return;
    }

    this.smoothedTarget
      .copy(this.interpolatedTarget)
      .addScaledVector(
        this.followError,
        -this.config.maximumFollowLagMetres / lagMetres,
      );
  }

  private updateCameraDistance(deltaSeconds: number): void {
    this.framingPivot
      .copy(this.smoothedTarget)
      .addScaledVector(this.smoothedUp, this.config.targetHeightMetres);

    const cosPitch = Math.cos(this.pitchRadians);
    this.boomDirection
      .copy(this.planarBack)
      .multiplyScalar(cosPitch)
      .addScaledVector(this.smoothedUp, Math.sin(this.pitchRadians))
      .normalize();
    this.boomDisplacement
      .copy(this.boomDirection)
      .multiplyScalar(this.config.followDistanceMetres);

    const hasObstruction =
      this.obstructionWorld?.sweepSphere(
        this.framingPivot,
        this.boomDisplacement,
        this.config.obstructionRadiusMetres,
        this.obstructionHit,
        CollisionLayer.CameraObstruction,
      ) ?? false;

    let obstructionLimitMetres: number | undefined;
    if (hasObstruction) {
      this.clearTimeSeconds = 0;
      obstructionLimitMetres = Math.max(
        0,
        this.obstructionHit.distance - this.config.obstructionBufferMetres,
      );
      this.obstructionName =
        this.obstructionHit.object?.name || '<unnamed>';
    } else {
      this.clearTimeSeconds += deltaSeconds;
      this.obstructionName = 'none';
    }
    this.obstructed = hasObstruction;

    const recoveryDeltaSeconds =
      hasObstruction ||
      this.clearTimeSeconds >= this.config.recoveryDelaySeconds
        ? deltaSeconds
        : 0;

    this.currentDistanceMetres = resolveCameraDistance(
      this.currentDistanceMetres,
      this.config.followDistanceMetres,
      obstructionLimitMetres,
      this.config.minimumDistanceMetres,
      this.config.recoveryDampingPerSecond,
      recoveryDeltaSeconds,
    );
  }

  private writeCameraPose(): void {
    this.camera.position
      .copy(this.framingPivot)
      .addScaledVector(this.boomDirection, this.currentDistanceMetres);
    this.camera.up.copy(this.smoothedUp);
    this.camera.lookAt(this.framingPivot);
    this.camera.updateMatrixWorld();
  }

  private ensurePlanarBack(): void {
    this.planarBack.projectOnPlane(this.smoothedUp);
    if (this.planarBack.lengthSq() > 1e-10) {
      this.planarBack.normalize();
      return;
    }

    this.planarBack.set(0, 0, 1).projectOnPlane(this.smoothedUp);
    if (this.planarBack.lengthSq() <= 1e-10) {
      this.planarBack.set(1, 0, 0).projectOnPlane(this.smoothedUp);
    }
    this.planarBack.normalize();
  }

  private validateConfig(config: CameraRigConfig): void {
    const positiveValues: ReadonlyArray<[string, number]> = [
      ['followDistanceMetres', config.followDistanceMetres],
      ['minimumDistanceMetres', config.minimumDistanceMetres],
      ['targetHeightMetres', config.targetHeightMetres],
      ['maximumFollowLagMetres', config.maximumFollowLagMetres],
      ['followDampingPerSecond', config.followDampingPerSecond],
      ['orientationDampingPerSecond', config.orientationDampingPerSecond],
      ['recoveryDampingPerSecond', config.recoveryDampingPerSecond],
      ['obstructionRadiusMetres', config.obstructionRadiusMetres],
      ['teleportSnapDistanceMetres', config.teleportSnapDistanceMetres],
    ];
    for (const [name, value] of positiveValues) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive finite number.`);
      }
    }

    const nonNegativeValues: ReadonlyArray<[string, number]> = [
      ['recoveryDelaySeconds', config.recoveryDelaySeconds],
      ['obstructionBufferMetres', config.obstructionBufferMetres],
    ];
    for (const [name, value] of nonNegativeValues) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative finite number.`);
      }
    }

    this.validateSensitivity(
      'horizontalSensitivityRadiansPerPixel',
      config.horizontalSensitivityRadiansPerPixel,
    );
    this.validateSensitivity(
      'verticalSensitivityRadiansPerPixel',
      config.verticalSensitivityRadiansPerPixel,
    );

    if (
      !Number.isFinite(config.minimumPitchRadians) ||
      !Number.isFinite(config.maximumPitchRadians) ||
      config.minimumPitchRadians >= config.maximumPitchRadians
    ) {
      throw new Error('Camera pitch limits must be finite and ordered.');
    }
    if (
      config.initialPitchRadians < config.minimumPitchRadians ||
      config.initialPitchRadians > config.maximumPitchRadians
    ) {
      throw new Error('initialPitchRadians must be within the pitch limits.');
    }
  }

  private validateSensitivity(name: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative finite number.`);
    }
  }
}
