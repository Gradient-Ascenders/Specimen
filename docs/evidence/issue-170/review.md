# Issue #170: character shadow passes

Implementation for [#170](https://github.com/Gradient-Ascenders/Specimen/issues/170),
following the renderer/Room 1 foundation in #169. The gameplay body, collider,
movement, contact, ability and timer implementations are unchanged.

## Production evidence

Open the [comparison viewer](compare.html). The final capture uses Chrome 154
on Windows with physical Intel Iris Xe (`0x46A6`) through ANGLE D3D11, at
960 × 600 CSS/drawing-buffer pixels and DPR 1. GPU identity, camera transforms,
morph weights, material program keys, resource counters and staged dissolve
progress are recorded in [measurements.json](iris-xe/measurements.json).

Room 1 uses its existing `room-1-pedestal-soft-key` spotlight with its authored
position, intensity and 1024-square map unchanged. Standing, movement, charging,
jumping and landing follow normal keyboard input and the production kinematic
controller. Simulation then stops for each capture; the initial gameplay camera
is retained to make floor contacts comparable. Impact, opacity, hiding, death and
recovery are explicitly staged through the existing presentation APIs.

The point proof uses the existing `room-5-volt-glow` inside Cultivation's Volt
pod: world position `(64, 25, 291)`, intensity `50`, map `512 × 512`, unchanged.
Bob's placement, charging/impact pose and camera are staged inside the pod while
simulation is stopped. Renderer material diagnostics confirm Bob's custom depth
program was used in Room 1 and its custom distance program was used under the
point source. This is a shader/pose proof, not a completed parkour or rescue route.

An existing Cultivation dissolve target is temporarily placed and scaled under
the same point source. Its own `advance()` drives 0 → 0.5 → 1 progress, followed
by its existing `reset()`. Captures show the partial surface/shadow mask,
completion hiding both, and restored geometry/shadow. The authoritative collision
state is recorded alongside progress; thresholds and reset logic are unchanged.
The harness restores the target's placement after the staged proof.

Agent inspection found readable cyan Bob in Room 1, an authored compressed pose
and corresponding compressed shadow in the point proof, reduced shadow coverage
at partial opacity, no Bob silhouette at zero opacity/hidden/rupture, and restored
coverage on recovery. The point source tints cyan towards green as expected from
its yellow light. The pod frame partially occludes Bob in that staged camera;
the projected floor shadow is visible. Partial fades have faint coverage stippling;
the opaque views do not use that mask. Human visual acceptance remains pending.

## Lifecycle and materials

Bob owns four extra materials: body depth/distance and a shared eye depth/distance
pair. Body deformation uniforms are identical objects across visible and both
shadow programs. Authored mesh morph influences remain the only morph authority.
Camera opacity is one uniform shared across all four shadow materials, without
allocating materials or changing program keys per opacity/time/impact value.

Three production Room 1 restarts retained identical custom material UUIDs and
stable counts: **143 programs, 453 geometries, 19 textures**. These are warmed
renderer counters, not FPS or a GPU timing benchmark. Unit checks additionally
exercise repeated fade/hide/death/recovery, preparation failure restoration and
disposal of each unique custom material exactly once. The eye transparent variant
is warmed during loading; the final capture reports no cold shader regressions.

Rupture core/droplets remain non-casting. Character casting is set on the authored
body and eyes, avoiding the earlier level-wide traversal. Existing Goop, Volt and
merged-specimen meshes cast/receive with their current geometry and standard
materials. Mesh/material visibility continues to control both render and shadow
passes through first-person aim and merge/split. No shadow-only proxy is added.

The Level 1 review follow-up hides Goop immediately after the shared Bob death
presentation accepts its position. This removes the duplicate caster throughout
the 75 ms anticipation, rather than waiting for rupture. A runtime regression
checks the accepted handoff before any frame update, anticipation, rupture,
rejected starts, Bob-only death and authoritative retry followed by pair updates.
It uses the authored Bob asset and actual visible character meshes. The physical
captures above predate this follow-up; Goop death was not recaptured in a browser.

## Verification

- `npm test`: all 107 unit-test files pass, including the Level 1 death handoff,
  shadow-uniform/order, fade, disposal, form-visibility and existing dissolve
  progress/reset checks.
- `node --test --test-isolation=none tests/GreyboxDeathPresentation.test.ts`:
  all three focused runtime regression cases pass.
- `npm run type-check`: passes.
- `npm run build`: passes, with the existing large-chunk advisory.
- `git diff --check`: passes.
- Production physical-GPU capture: spotlight and existing point passes, staged
  fades/death/recovery/dissolve, and three restart cycles pass. No browser console
  errors, failed requests or asset HTTP failures in the final capture.
- Format/lint scripts are not provided by the repository.

The earlier software-renderer attempt was superseded by this physical-GPU proof.
The full browser traversal suite, all wall/camera/device combinations and timing
profiling were not run; those remain broader #171–#173 rollout work. Human review
of fade stippling, point-light framing and material readability remains separate
from automated correctness checks. This document does not mark the issue merged
or visually approved.

## Reproduce

```sh
npm run build
node scripts/capture-character-shadows.mjs
```

For an isolated physical browser with CDP and a reachable production preview:

```sh
CHARACTER_SHADOW_CDP_URL=http://<local-cdp-address>:<port> \
CHARACTER_SHADOW_URL=http://<reachable-preview-address>:<port>/ \
CHARACTER_SHADOW_OUTPUT=docs/evidence/issue-170/iris-xe \
node scripts/capture-character-shadows.mjs
```

The script exposes runtime references only in the served bundle, closes its own
browser context, and leaves an externally supplied CDP browser alive. No debug
runtime API is added to production source.
