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
  /** Keep mouse pitch live for gameplay arenas that only change framing. */
  readonly playerControlledPitch?: boolean;
  readonly id: string;
  readonly distanceMetres: number;
  readonly targetHeightMetres: number;
  readonly pitchRadians: number;
  readonly transitionDurationSeconds: number;
  readonly framingDeadZoneHalfWidthMetres: number;
  readonly framingDeadZoneHalfHeightMetres: number;
  readonly framingDampingPerSecond: number;
  /** Optional radius for framing in the anchor's horizontal plane. Keeps a
   * moving-platform focus above its deck instead of following screen-up into
   * the floor, and limits how far edge movement can push the camera sideways. */
  readonly framingPlanarRadiusMetres?: number;
  /** World-space interior for the camera and its focus. Render-side bounds
   * complement obstruction sweeps without changing movement collision. */
  readonly cameraBounds?: {
    readonly min: ReadonlyCameraVector3;
    readonly max: ReadonlyCameraVector3;
  };
}

/** Stable handoff resolved by an authored camera zone. */
export interface ContextualCameraContext {
  readonly profile: ContextualCameraProfile;
  readonly anchor: ContextualCameraAnchor;
  /** Cinematic framing may stay upright while the followed slime is attached. */
  readonly gameplayUpOverride?: ReadonlyCameraVector3;
}
