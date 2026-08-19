# Baseline movement feel and charged jumping

Issue #12 adds Tack's first production-intent jump behaviour on top of the
kinematic controller from #11. Wall adhesion, bounce-pad impulses and final
visual animation remain separate work.

## Controls

- `W`, `A`, `S`, `D`: locomotion.
- Hold `Space`: build jump charge while a jump opportunity is valid.
- Release `Space`: launch along the current `gameplayUp`.
- `R`: reset the grey-box probe.
- `F`: run the recovery-volume check.
- Debug panel `−` / `+`: collapse or expand the development diagnostics while playtesting.

Mapped game keys call `preventDefault()` in the browser input boundary. This
prevents `Space` from activating a previously focused debug button while the
player is charging a jump.

## Central tuning values

All movement and jump feel remains in `DEFAULT_KINEMATIC_BODY_CONFIG`.

| Constant | Initial value | Unit / meaning |
| --- | ---: | --- |
| `maxSpeedMetresPerSecond` | 5.5 | m/s locomotion speed |
| `groundAccelerationMetresPerSecondSquared` | 32 | m/s² |
| `airAccelerationMetresPerSecondSquared` | 12 | m/s² |
| `groundBrakingMetresPerSecondSquared` | 36 | m/s² |
| `gravityMetresPerSecondSquared` | 18 | m/s² |
| `minimumJumpSpeedMetresPerSecond` | 5.88 | tap-jump launch speed (~50% higher apex) |
| `maximumJumpSpeedMetresPerSecond` | 10.78 | full-charge launch speed (~50% higher apex) |
| `maximumJumpChargeSeconds` | 0.70 | seconds to full charge |
| `jumpChargeCurveExponent` | 1.35 | shapes the charge response |
| `coyoteTimeSeconds` | 0.10 | retained jump window after leaving ground |
| `jumpGroundDetachSeconds` | 0.05 | prevents immediate ground re-acquisition |
| `minimumLandingAirTimeSeconds` | 0.04 | filters one-frame contact noise |

The charge is clamped to `[0, 1]`. Launch speed interpolates from the minimum
to maximum jump speed after applying the configured exponent. Holding beyond
`maximumJumpChargeSeconds` gives no additional power.

Both endpoints are approximately the original launch speeds multiplied by
`sqrt(1.5)`. Because ballistic height is proportional to launch speed squared,
this makes tap, partial-charge, and full-charge jumps rise about 50% higher
without changing their charge timing or response curve.

## Retained movement aids

### Coyote time

A 0.10-second coyote window is retained for baseline playability. It allows a
jump requested immediately after walking off an edge without making late jumps
visibly implausible. The value is deliberately small and centrally tunable.

### Post-jump ground detach

The controller ignores ground reacquisition for 0.05 seconds after launch.
Without this, the existing short ground probe can classify the body as grounded
during the first frames of a small tap jump. This is a controller-stability
measure, not extra jump power.

### Stable landing signal

A landing is a discrete airborne-to-grounded transition after at least 0.04
seconds of stable airborne time. `MovementEvents.landed` carries the approach
speed measured immediately before collision response removes the downward
component. Continuous position and velocity remain direct read-only body state
and are not broadcast through the EventBus.

## Focus and pause behaviour

The fixed-step `Loop` does not update gameplay while the page is paused or
unfocused, so jump charge cannot accumulate during that time.

`Input` clears held and transient actions on blur/visibility loss without
synthesizing a release. If the body was charging, the first resumed gameplay
step sees neither a held nor released jump and cancels the charge. Therefore a
stale charged jump cannot fire after Alt-Tab or focus recovery.

## Manual verification for #12

Repeat the following in the browser harness:

1. Tap `Space` on flat ground and record the reported launch speed.
2. Hold to full charge, release, and confirm a clearly higher jump.
3. Hold beyond 0.70 seconds and confirm charge remains capped at 100%.
4. Repeat tap/full jumps while moving forward and diagonally.
5. Traverse the authored 15-degree slope and repeat jump/land tests there.
6. Walk off an edge and press/release within the 0.10-second coyote window.
7. Repeat outside the coyote window and confirm no jump starts.
8. Hold `Space`, Alt-Tab away, release outside the game, return, and verify no
   stale jump launches.
9. Repeat jump/land cycles and confirm the landing event count increases once
   per stable landing.
10. Run the existing idle-slope regression to ensure #11 stability remains.

For PR evidence, capture a short feel-test clip that shows at least a tap jump,
a full charged jump, a moving jump, a slope or edge case, and the expanded
diagnostics with charge, coyote and landing values visible.
