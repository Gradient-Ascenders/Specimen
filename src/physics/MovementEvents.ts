export interface LandedEvent {
  /** Approach speed along gameplay-down immediately before collision. */
  impactSpeedMetresPerSecond: number;
}

export interface MovementEvents {
  /** Fired once for a stable airborne -> grounded transition. */
  landed: LandedEvent;
}
