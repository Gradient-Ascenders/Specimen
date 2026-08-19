import * as THREE from 'three';

const BASIS_EPSILON_SQ = 1e-12;
const WORLD_UP_X = 0;
const WORLD_UP_Y = 1;
const WORLD_UP_Z = 0;

export interface ReadonlyWallJumpVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WallJumpIntent {
  /** A/D axis: -1 is left, +1 is right. */
  lateral: number;
  /** W/S axis: +1 is up, -1 is down. */
  vertical: number;
}

/**
 * Build a camera-independent wall-up/right basis from the authoritative wall
 * normal. `wallUp` is projected world-up; `wallRight` is the lateral tangent
 * seen when facing the wall.
 *
 * Attached traversal already excludes floor/ceiling-like normals, but the
 * function still rejects a degenerate projected-up vector defensively.
 */
export function resolveWallJumpBasis(
  wallNormal: ReadonlyWallJumpVector3,
  wallUp: THREE.Vector3,
  wallRight: THREE.Vector3,
): boolean {
  const normalLengthSq =
    wallNormal.x * wallNormal.x +
    wallNormal.y * wallNormal.y +
    wallNormal.z * wallNormal.z;

  if (normalLengthSq <= BASIS_EPSILON_SQ) {
    wallUp.set(0, 0, 0);
    wallRight.set(0, 0, 0);
    return false;
  }

  const inverseNormalLength = 1 / Math.sqrt(normalLengthSq);
  const nx = wallNormal.x * inverseNormalLength;
  const ny = wallNormal.y * inverseNormalLength;
  const nz = wallNormal.z * inverseNormalLength;

  // Project world-up onto the wall plane:
  // up_tangent = worldUp - normal * dot(worldUp, normal)
  const upDotNormal =
    WORLD_UP_X * nx +
    WORLD_UP_Y * ny +
    WORLD_UP_Z * nz;

  wallUp.set(
    WORLD_UP_X - nx * upDotNormal,
    WORLD_UP_Y - ny * upDotNormal,
    WORLD_UP_Z - nz * upDotNormal,
  );

  const wallUpLengthSq = wallUp.lengthSq();
  if (wallUpLengthSq <= BASIS_EPSILON_SQ) {
    wallUp.set(0, 0, 0);
    wallRight.set(0, 0, 0);
    return false;
  }
  wallUp.multiplyScalar(1 / Math.sqrt(wallUpLengthSq));

  // right = wallUp × outwardNormal. For a +Z-facing vertical wall this is +X.
  wallRight.set(
    wallUp.y * nz - wallUp.z * ny,
    wallUp.z * nx - wallUp.x * nz,
    wallUp.x * ny - wallUp.y * nx,
  );

  const wallRightLengthSq = wallRight.lengthSq();
  if (wallRightLengthSq <= BASIS_EPSILON_SQ) {
    wallRight.set(0, 0, 0);
    return false;
  }
  wallRight.multiplyScalar(1 / Math.sqrt(wallRightLengthSq));
  return true;
}

/**
 * Resolve raw cardinal input against the stable wall-up/right basis.
 *
 * This intentionally does not accept camera heading or a camera-resolved world
 * movement direction. W/S therefore remain wall-up/down and A/D remain lateral
 * for every supported wall orientation.
 */
export function resolveWallJumpTangent(
  wallNormal: ReadonlyWallJumpVector3,
  intent: WallJumpIntent,
  target: THREE.Vector3,
  wallUpScratch: THREE.Vector3,
  wallRightScratch: THREE.Vector3,
): boolean {
  const lateral = THREE.MathUtils.clamp(intent.lateral, -1, 1);
  const vertical = THREE.MathUtils.clamp(intent.vertical, -1, 1);

  if (
    Math.abs(lateral) <= Number.EPSILON &&
    Math.abs(vertical) <= Number.EPSILON
  ) {
    target.set(0, 0, 0);
    return false;
  }

  if (
    !resolveWallJumpBasis(
      wallNormal,
      wallUpScratch,
      wallRightScratch,
    )
  ) {
    target.set(0, 0, 0);
    return false;
  }

  target
    .copy(wallRightScratch)
    .multiplyScalar(lateral)
    .addScaledVector(wallUpScratch, vertical);

  const targetLengthSq = target.lengthSq();
  if (targetLengthSq <= BASIS_EPSILON_SQ) {
    target.set(0, 0, 0);
    return false;
  }

  target.multiplyScalar(1 / Math.sqrt(targetLengthSq));
  return true;
}
