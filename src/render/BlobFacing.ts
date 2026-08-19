import * as THREE from 'three';

export const BLOB_TURN_SPEED_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(720);
export const BLOB_FACING_MINIMUM_SPEED_METRES_PER_SECOND = 0.05;

const TWO_PI = Math.PI * 2;

export interface BlobFacingConfig {
  turnSpeedRadiansPerSecond: number;
  minimumSpeedMetresPerSecond: number;
}

export interface ReadonlyFacingVelocity {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const DEFAULT_BLOB_FACING_CONFIG: Readonly<BlobFacingConfig> = {
  turnSpeedRadiansPerSecond: BLOB_TURN_SPEED_RADIANS_PER_SECOND,
  minimumSpeedMetresPerSecond: BLOB_FACING_MINIMUM_SPEED_METRES_PER_SECOND,
};

/** Return the signed shortest angular delta from `from` to `to`. */
export function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Move through at most `maximumDelta` radians along the shortest arc. */
export function moveAngleTowards(
  current: number,
  target: number,
  maximumDelta: number,
): number {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

/**
 * Render-side normal-ground facing driven only by actual horizontal velocity.
 * The blob stays upright, preserves its heading at rest, and never reads camera
 * orientation directly.
 */
export class BlobFacing {
  private readonly config: BlobFacingConfig;
  private currentYawRadians = 0;
  private previousYawRadians = 0;

  constructor(config: Partial<BlobFacingConfig> = {}) {
    this.config = { ...DEFAULT_BLOB_FACING_CONFIG, ...config };
    if (
      !Number.isFinite(this.config.turnSpeedRadiansPerSecond) ||
      this.config.turnSpeedRadiansPerSecond <= 0
    ) {
      throw new Error('turnSpeedRadiansPerSecond must be positive and finite.');
    }
    if (
      !Number.isFinite(this.config.minimumSpeedMetresPerSecond) ||
      this.config.minimumSpeedMetresPerSecond < 0
    ) {
      throw new Error(
        'minimumSpeedMetresPerSecond must be non-negative and finite.',
      );
    }
  }

  update(
    deltaSeconds: number,
    velocity: ReadonlyFacingVelocity,
    enabled = true,
  ): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error('BlobFacing deltaSeconds must be positive and finite.');
    }

    this.previousYawRadians = this.currentYawRadians;
    const planarSpeedSquared =
      velocity.x * velocity.x + velocity.z * velocity.z;
    const minimumSpeedSquared =
      this.config.minimumSpeedMetresPerSecond *
      this.config.minimumSpeedMetresPerSecond;
    if (!enabled || planarSpeedSquared <= minimumSpeedSquared) return;

    // Three.js objects conventionally face local -Z. This yaw keeps world Y as
    // the sole rotation axis, so ground-facing can never introduce pitch/roll.
    const targetYawRadians = Math.atan2(-velocity.x, -velocity.z);
    this.currentYawRadians = moveAngleTowards(
      this.currentYawRadians,
      targetYawRadians,
      this.config.turnSpeedRadiansPerSecond * deltaSeconds,
    );
    this.currentYawRadians = THREE.MathUtils.euclideanModulo(
      this.currentYawRadians + Math.PI,
      TWO_PI,
    ) - Math.PI;
  }

  getInterpolatedYaw(interpolationAlpha: number): number {
    const alpha = THREE.MathUtils.clamp(interpolationAlpha, 0, 1);
    return (
      this.previousYawRadians +
      shortestAngleDelta(this.previousYawRadians, this.currentYawRadians) *
        alpha
    );
  }

  get yawRadians(): number {
    return this.currentYawRadians;
  }
}
