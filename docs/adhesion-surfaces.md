# Authored adhesion surfaces and Tack traversal

Issue #13 keeps traversal authored and inspectable. CollisionWorld remains a
geometry query service; SurfaceRegistry supplies gameplay meaning for each
registered mesh.

## Surface metadata

Each authored collision mesh has `mesh.userData.surfaceTag`.

| Tag | Adhesion | Traction | Bounce |
| --- | --- | ---: | ---: |
| `default` | no | 1.00 | none |
| `sticky` | yes, on validated wall normals | 1.00 | none |
| `nonStick` | explicitly no | 0.22 | none |
| `bouncy` | no | 1.00 | fixed 8.2 m/s outgoing normal speed |

Optional authoring overrides:

- `mesh.userData.tractionMultiplier`: finite value in `[0, 1]`.
- `mesh.userData.bounceSpeedMetresPerSecond`: non-negative finite value.

Unknown tags and invalid override values throw during registry setup so
authoring mistakes fail loudly instead of silently changing traversal.

## Attachment policy

Attachment is intentionally constrained instead of attempting general
soft-body or arbitrary contact simulation.

Tack may attach only when:

1. the contacted mesh is registered as `sticky`;
2. the authored contact normal is near vertical, based on
   `maximumAttachmentWorldUpDot`; and
3. the post-detach cooldown has expired.

Floors and ceilings are rejected by the wall-normal constraint. Ceiling
traversal is therefore **not enabled in this issue**.

When attachment succeeds:

- `attached` becomes true immediately in the movement simulation;
- `gameplayUp` becomes the wall's outward contact normal;
- gravity acts along `-gameplayUp`, keeping the body supported;
- the camera reads the new `gameplayUp` and smooths only its own visual copy;
- W/S use projected world-up for climb/down movement;
- A/D use the wall-tangent lateral axis.

The camera never writes its smoothed orientation back into movement.

## Detachment

Tack detaches when:

- a charged jump releases from the wall;
- the sticky support probe loses valid sticky geometry; or
- traversal reaches geometry that no longer permits adhesion.

A 0.12-second attachment cooldown prevents an immediate jump-away from
reattaching to the same wall.

A wall jump first applies the existing charged-jump impulse along the current
wall `gameplayUp`, then restores world-up movement. This means charged jumps
naturally launch away from the wall without a separate wall-jump formula.

## Bounce contract

`bouncy` surfaces do not use elastic rigid-body physics. On an approach contact
of at least 0.12 m/s, the controller sets the outgoing normal component to the
authored bounce speed while preserving tangent velocity.

The default grey-box pad uses 8.2 m/s. A 0.12-second cooldown prevents repeated
same-contact impulses while still allowing deterministic re-bounces after the
body returns to the pad.

## Non-stick / slippery surfaces

`nonStick` is intentionally distinct from `default`: it is an explicit level
authoring statement that Tack must not adhere. Its reduced traction multiplier
is also available for authored slippery floor geometry. The grey-box includes a
red non-stick wall so the rejection path is visible and testable.

## Camera integration and comfort fallback

CameraRig already consumes read-only `gameplayUp` and `attached` state and
damps its private visual orientation. No camera-side transform is authoritative.

The current fallback is deliberately constrained to authored near-vertical
walls. Ceiling traversal and arbitrary surface wrapping remain disabled unless
separate comfort testing validates them.

## Manual verification

1. Run the existing slope regression and confirm it still passes.
2. Drive into the ordinary blue wall: `attached` must remain false.
3. Drive into the teal sticky wall: `attached` becomes true and `gameplayUp`
   changes to the wall normal.
4. While attached, verify W/S climb/down and A/D move laterally.
5. Hold/release Space while attached: Tack launches away and detaches.
6. Re-contact the same wall immediately after jumping: the cooldown prevents
   instant reattachment.
7. Drive into the red non-stick wall: it must never attach.
8. Move repeatedly at sticky-wall edges/corners and confirm attachment does not
   oscillate or trap the body.
9. Land on the purple bounce pad several times and confirm the diagnostic
   reports the same authored bounce speed on each valid contact.
10. Confirm the body can always leave awkward contacts or use the existing
    recovery/reset controls.
11. Record the expanded diagnostics showing `attached`, `gameplay up`, surface
    tags, attachment target, cooldowns, and bounce values.
