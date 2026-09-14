/** Deliberately lab-local. Production callers still own their KinematicBody. */
export const GROUND_STEP = 1 / 60;
export type BodyKind = 'deformable' | 'kinematic';
export type Vec3 = readonly [number, number, number];
export interface GroundInput {
  readonly x: number;
  readonly z: number;
  /** Release the angular brake as well as propulsion. */
  readonly coast: boolean;
}
export const IDLE: GroundInput = { x: 0, z: 0, coast: false };

export interface GroundMetrics {
  centre: Vec3;
  velocity: Vec3;
  contacts: number;
  acquired: number;
  released: number;
  volumeRatio: number;
  maxStrain: number;
  penetration: number;
  height: number;
}

export interface GroundBody {
  readonly kind: BodyKind;
  reset(position?: Vec3): void;
  /** Exactly one 60 Hz tick; render time never enters a body. */
  step(input: GroundInput): void;
  metrics(): GroundMetrics;
  /** Same-runtime repeatability, including retained solver/contact state. */
  snapshot(): unknown;
  dispose(): void;
}
