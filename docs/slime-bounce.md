# Slime hard-landing reaction

Bob produces one fixed hop after a genuinely hard landing on an ordinary
walkable floor or slope. Normal jumps, charged jumps that return to the same
elevation, small drops, and ordinary traversal settle without an automatic
follow-up launch.

The controller uses the authoritative downward speed captured immediately
before collision resolution. A stable landing qualifies when that speed is at
least `slimeHardLandingImpactSpeedMetresPerSecond`, currently `10 m/s`. A
same-height full-charge jump lands at approximately `9.66 m/s`, so charge alone
does not trigger the reaction. A charged jump that lands sufficiently below its
launch surface can exceed the threshold and does qualify.

Qualifying landings use one fixed
`slimeLandingReactionHopSpeedMetresPerSecond` impulse, currently `5 m/s`. Under
the default `18 m/s²` gravity this reaches an approximate `0.69 m` apex. The
impulse remains below the normal `5.37 m/s` jump, and configuration validation
enforces that ordering.

The landing event is emitted before the hop is applied, preserving the normal
impact squash and ripple presentation. A buffered player jump takes priority
over the passive reaction and is consumed through the normal landing-buffer
path.

The reaction cannot recursively trigger itself: its `5 m/s` return impact is
well below the `10 m/s` hard-landing threshold. Configuration validation also
requires the hop impulse to remain below both the trigger threshold and the
normal jump impulse.

Authored `bouncy` surfaces remain a separate gameplay mechanic. Their explicit
surface impulse is handled before the hard-landing reaction and is not replaced
by this behavior.
