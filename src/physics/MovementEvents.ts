export interface LandedEvent {
  /** Approach speed along gameplay-down immediately before collision. */
  impactSpeedMetresPerSecond: number;
}

export interface JumpedEvent {
  /** Launch speed selected by the charged-jump controller. */
  speedMetresPerSecond: number;
  /** Normalized charge used to select launch speed. */
  chargeFraction: number;
  /** Authoritative world-space launch direction. */
  directionWorld: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export interface MovementEvents {
  /** Fired once for a stable airborne -> grounded transition. */
  landed: LandedEvent;
  /** Fired once when stored jump charge becomes a launch impulse. */
  jumped: JumpedEvent;
}
