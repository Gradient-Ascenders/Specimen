import { MathUtils } from 'three';

/** Room 5's straight entrance stays lit; either turn loses the entrance light. */
export function ventEntranceLightingWeight(x: number, z: number): number {
  return Math.max(
    MathUtils.smoothstep(Math.abs(x), .8, 8),
    MathUtils.smoothstep(z, 10.5, 12),
  );
}
