const EPSILON = 1e-12;

export interface ReadonlyCollisionVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Earliest contact fraction for two moving spheres over one fixed step.
 * Positions are step starts and displacements are the complete step motion.
 */
export function sweptSpherePairFraction(
  firstPosition: ReadonlyCollisionVector3,
  firstDisplacement: ReadonlyCollisionVector3,
  firstRadius: number,
  secondPosition: ReadonlyCollisionVector3,
  secondDisplacement: ReadonlyCollisionVector3,
  secondRadius: number,
): number | undefined {
  const radius = firstRadius + secondRadius;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('Swept sphere radii must have a positive finite sum.');
  }

  const px = firstPosition.x - secondPosition.x;
  const py = firstPosition.y - secondPosition.y;
  const pz = firstPosition.z - secondPosition.z;
  const vx = firstDisplacement.x - secondDisplacement.x;
  const vy = firstDisplacement.y - secondDisplacement.y;
  const vz = firstDisplacement.z - secondDisplacement.z;
  const c = px * px + py * py + pz * pz - radius * radius;
  if (c <= 0) return 0;

  const a = vx * vx + vy * vy + vz * vz;
  if (a <= EPSILON) return undefined;
  const b = 2 * (px * vx + py * vy + pz * vz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;

  const fraction = (-b - Math.sqrt(discriminant)) / (2 * a);
  return fraction >= 0 && fraction <= 1 ? fraction : undefined;
}
