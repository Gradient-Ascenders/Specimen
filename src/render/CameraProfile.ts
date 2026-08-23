export interface ReadonlyCameraVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Read-only fixed-step anchor used by an authored contextual camera. */
export interface ContextualCameraAnchor {
  readonly position: ReadonlyCameraVector3;
  readonly previousPosition: ReadonlyCameraVector3;
}

/**
 * Reusable authored framing parameters for a bounded gameplay section.
 *
 * Positive pitch places the camera above the framing pivot and looks down.
 * Dead-zone values are half-extents in the displayed camera's screen plane.
 */
export interface ContextualCameraProfile {
  readonly id: string;
  readonly distanceMetres: number;
  readonly targetHeightMetres: number;
  readonly pitchRadians: number;
  readonly transitionDurationSeconds: number;
  readonly framingDeadZoneHalfWidthMetres: number;
  readonly framingDeadZoneHalfHeightMetres: number;
  readonly framingDampingPerSecond: number;
}

/** Stable handoff resolved by an authored camera zone. */
export interface ContextualCameraContext {
  readonly profile: ContextualCameraProfile;
  readonly anchor: ContextualCameraAnchor;
}
