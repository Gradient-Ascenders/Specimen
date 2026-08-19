# Directional sticky-wall jumping

This adjustment keeps ordinary floor jumping unchanged and extends the existing
sticky-wall charged jump.

## Behaviour

When Tack is attached to a sticky wall:

- Release Space with **no movement input**: preserve the original jump directly
  away from the wall.
- Hold **W/S/A/D** (or a diagonal) while releasing Space: resolve jump intent
  from a stable wall-up/lateral basis. W/S always mean up/down the wall and A/D
  always mean lateral movement, regardless of camera heading.

Attached locomotion still uses `CameraRig.copySurfaceMovementDirection`.
Directional **jump intent is separate**: `main.ts` passes the raw normalized
A/D and W/S axes into `KinematicBody`, which resolves them from the current
authoritative wall normal. The physics body therefore never asks CameraRig for
wall-jump direction.

Examples:

- W + release: jump upward along the wall.
- S + release: jump downward along the wall.
- A/D + release: lateral wall transfer.
- W+A / W+D: diagonal wall transfer.
- Space only: existing straight-away wall jump.

This supports wall-to-wall traversal while retaining a predictable fallback.

## Tuning

`DEFAULT_KINEMATIC_BODY_CONFIG` now includes:

- `directionalWallJumpOutwardSpeedMetresPerSecond = 1.2`
- `directionalWallJumpDetachCooldownSeconds = 0.08`

For a directional wall jump, the outward component is fixed and the remaining
charged jump speed is placed along the wall tangent. The vector is constructed
so the total launch magnitude remains the same tap/charged jump speed used by
normal jumping.

The shorter directional detach cooldown is intended to keep repeated sticky
traversal responsive. The existing `attachmentDetachCooldownSeconds` is still
used by the no-input straight-away wall jump.

## Verification

Check:

1. Ordinary floor tap/full-charge jumps are unchanged.
2. Space-only wall jump still launches directly away.
3. W + release launches mostly upward with visible outward separation.
4. A/D and diagonal launches follow the intended wall direction.
5. Full charge changes launch magnitude but not the selected direction.
6. Tack can transfer between suitably placed sticky walls.
7. Immediate reattachment to the wall being left is still prevented.
8. Existing adhesion-edge, bounce, elevator, laser, slope, and camera tests
   remain functional.


## Stable cardinal basis

For every supported sticky wall normal:

```text
wallUp    = project(worldUp onto wall plane)
wallRight = wallUp × wallNormal
```

Raw jump input then resolves as:

```text
jump tangent = wallRight × A/D + wallUp × W/S
```

This keeps the cardinal contract stable while ordinary attached locomotion can
remain camera-relative for comfort.

## Automated development coverage

`src/debug/WallJumpBasisRegression.ts` runs once in the existing browser
development harness and reports its result in runtime diagnostics. It does not
require `node:test` or Node type definitions.

It covers:

- W/S on ±X, ±Z, and representative tilted near-vertical wall normals;
- A/D as opposite lateral tangents on the same set;
- the explicit invariant that representative camera headings cannot alter the
  cardinal wall-jump result because camera heading is not an input to the
  resolver.

Expected diagnostic:

```text
wall jump basis regression: PASS — 6 wall normals — 4 camera headings — W/S vertical, A/D lateral
```
