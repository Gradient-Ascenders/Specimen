# Sticky-wall jumping

Sticky walls use the same charged-jump rules as ordinary floors, rotated into
the wall's local gravity frame.

## Behaviour

When Bob is attached to a sticky wall:

- Charging and releasing Space adds the normal charged-jump impulse directly
  away from the wall, along the current `gameplayUp` direction.
- W/S/A/D continue to control ordinary camera-relative surface locomotion.
- Movement velocity along the wall is preserved through takeoff, just as floor
  movement carries into a normal jump.
- Movement input never receives charged-jump speed, so holding a direction does
  not turn the jump into a dash.

This means a wall behaves like rotated ground: jump charge affects local height,
while movement and air control affect travel along the local ground plane.

## Airborne gravity frame

A deliberate jump from a sticky wall retains that wall's local up axis while
Bob is airborne. Gravity therefore pulls him back toward the wall, the camera
keeps its wall-relative orientation, and air movement remains aligned with the
displayed surface frame while crossing a gap between sticky tiles.

The retained frame ends when Bob attaches to another sticky surface, lands on
ordinary ground, bounces, recovers, or reaches the deterministic 1.35-second
fallback. Simply walking or falling off a sticky edge does not enable retained
surface gravity and returns to world-up immediately.

## Tuning

`DEFAULT_KINEMATIC_BODY_CONFIG` includes:

- `stickyJumpGravityDurationSeconds = 1.35`
- `attachmentDetachCooldownSeconds = 0.12`

The ordinary minimum and maximum charged-jump speeds apply along local up for
both floor and sticky-wall jumps. No separate directional wall-jump speed or
detach cooldown is used.

## Verification

Check:

1. Ordinary floor tap/full-charge jumps are unchanged.
2. A stationary sticky-wall jump launches directly away from the wall.
3. Holding movement while charging preserves normal locomotion speed without a
   directional burst on release.
4. Facing the floor and holding forward keeps Bob travelling toward the floor;
   it never reverses him, and it never promotes that movement into jump speed.
5. Gravity, camera orientation, and air control remain wall-relative across a
   sticky-tile gap.
6. The gravity frame returns to world-up after the fallback if Bob reaches no
   surface.

The Node physics suite covers the reported floor-facing case, checks that the
jump event still reports local up, and verifies that tangential speed stays at
ordinary locomotion speed rather than becoming a charged dash.
