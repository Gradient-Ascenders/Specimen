# Cultivation room workload ownership

Issue: [#195](https://github.com/Gradient-Ascenders/Specimen/issues/195).

`LevelTwoPreviewScene` owns the authored production scene's workload selection.
Rendering never unregisters colliders or stops persistent slime physics.

| Scope | Owner and transition rule |
| --- | --- |
| Resident | Scene construction installs all five rooms. They remain resident through restart and backtracking; level disposal removes them. This change does not stream assets. |
| Simulated | Each fixed update selects the progression room, both persistent occupants' resolved rooms, released/falling assemblies, pending button release/control work, lift travel/arrival pose changes, rescue animation, and rooms with live encounter projectiles. |
| Rendered | The existing camera/body range and lift occlusion rules select geometry on each presentation frame. Doorways retain the existing overlap. Room 4's finite lights can remain registered for Room 5 while its geometry is outside this set. |
| Prepared | The preparation queue records rooms included in completed GPU configurations. This is a union for diagnostics, **not permission to render any light/material configuration**: `requireCurrent` still checks the exact configuration and compatible lighting layout. |
| Preparing | The queue reports its current configuration's rooms. Speculative enumeration does not change live scope records. Queue disposal/cancellation clears preparation ownership and pending status, including when an asynchronous compile still needs to release its retained resources. |

Passage and lift entrance sensors, radiation contact/leave bookkeeping, acid
contacts, body physics, dissolve authority, and player projectiles retain their
existing global ownership. These small cross-room authorities are not included
in the room-update count. Encounter projectiles keep their room simulated until
they drain; hiding projectile uploads never stops their fixed-step motion.
Inactive bodies still operate hazards, support, buttons, circuits and plates.

Cosmetic fan/captive Volt work and projectile/beam presentation are suspended
outside the relevant render scope. Shared acid animation advances once while
authored rooms render. Local transforms of immutable authored nodes are computed
once after baked surface cleanup. Explicit dynamic assembly roots, controls,
doors, laser systems, soluble objects and their children retain automatic local
updates. World matrices remain automatic so scene placement, moving ancestors,
collision queries and checkpoint recovery continue to work. New animated
authoring must declare its root in `dynamicTransformRoots` (or use the existing
dynamic ownership metadata) before this freeze pass.

Restart clears simulation selection and restores the entry render scope while
retaining ready GPU configurations. Backtracking reselects scopes from current
positions without reconstructing resources. Unload clears every scope and
releases the scene and preparation queue through their existing owners.

## Batching and shadow policy

`StaticBatchPolicy` shares compatibility keys and room-local spatial partitions.
Containment retains its 8 m default and authored 4 m override. Large Cultivation
and Blackout geometry uses 16 m cells. Material identity, attributes/indexing,
shadow roles, layer masks, render order and explicit partitions remain batching
boundaries; materials with shader hooks are reused rather than structurally
deduplicated. Instanced buffers and merged geometry have distinct disposal
ownership. Collider identities, geometry and metadata are retained.

Room 3's static colliders and detailed laboratory cover now use spatial cells.
Cover cells reuse six finishes; baked geometry generation and surface repair
stay offline. Detailed cover receives shadows, while eight original cover-box
envelopes, merged by cell, cast them using the same colour/depth-write-disabled
hull technique as Room 5's decks. Shadow silhouettes are deliberately simpler;
their appearance and hazard readability require independent visual review.

## Diagnostics and reproducible evidence

The Cultivation debug panel reports resident/simulated/rendered/prepared/preparing
rooms, room/cosmetic update counts, visible/total objects, automatic/frozen local
transforms, spatial batches, visible material count and renderer program count.
Material and shader-program counts are independent measurements. Hierarchy
counting only runs on demand for diagnostics, not in fixed gameplay updates.

Run with the repository's pinned Node 24 toolchain, without competing CPU work:

```bash
node scripts/measure-room-workload.ts > artifacts/room-workload.json
```

Create `artifacts/` first if needed. The script specifies all camera/body poses,
uses authored production assets, warms each action 100 times and takes 1,000
samples. To reproduce the baseline, copy this script into a checkout of
`9b7a4803daa09d3fa0c14595dd012835b1f94ca3`, install its locked dependencies and run
it there. [Raw before/after results](../evidence/issue-195/workload.json) include
the environment, counts, median and p95 CPU samples. These are measurements on
an Intel Xeon runner, not the assessment PC.

| View | Hierarchy median ms, before → after | Room update median ms | Camera draws | Camera submitted triangles | Shadow draws | Shadow submitted triangles |
| --- | --- | --- | --- | --- | --- | --- |
| Room 1 | 0.512 → 0.410 | 0.033 → 0.019 | 74 → 74 | 39,123 → 39,123 | 127 → 127 | 68,109 → 68,109 |
| Doorway 1–2 | 0.563 → 0.448 | 0.028 → 0.019 | 188 → 188 | 58,115 → 58,115 | 467 → 467 | 165,930 → 165,930 |
| Doorway 2–3 | 0.564 → 0.450 | 0.044 → 0.032 | 72 → 109 | 89,432 → 89,492 | 435 → 461 | 350,284 → 294,170 |
| Room 3 | 0.566 → 0.450 | 0.038 → 0.028 | 28 → 44 | 82,118 → 73,478 | 103 → 127 | 164,824 → 127,616 |
| Room 5 | 0.568 → 0.450 | 0.021 → 0.028 | 133 → 133 | 63,313 → 63,313 | 228 → 228 | 32,630 → 32,630 |

Automatic local updates fall from 1,604 to 448 (72%). These spatial batches
reduce Room 3 camera triangles by 10.5% and shadow triangles by 22.6%, at the
cost of more submissions. Doorway 2–3 adds 60 main-pass triangles (0.067%) from
invisible shadow hulls, while reducing shadow triangles by 16%. Room 5's isolated
update gains about 0.007 ms of scope bookkeeping; its hierarchy saves about
0.119 ms. This explicitly records the submission/culling trade-off rather than
using draw reduction as the only success metric.

The script estimates camera/shadow frustum submissions from Three.js bounds and
authored lights. It does not run WebGL, encounters, bounded live lighting,
transmission, shader compilation, pixel shading or shadow-map rasterization.
It cannot establish GPU time, FPS, visible image equivalence or program counts.
Fewer shadow triangles alongside more draws is not proof of lower GPU cost.

Assessment qualification remains outstanding on the ASUS NUC12WSK-B with
i3-1220P (12 logical processors), integrated Alder Lake GT2 graphics, 16 GiB RAM,
Ubuntu 24.04.1, GNOME 46/Wayland and kernel 6.8.0-124-generic. Capture matched
production moving-gameplay runs, actual GPU/frame/submission/shadow times,
material and program counts, and loading/resource stability under the parent
issue's agreed budgets. No numeric GPU budget was supplied with #195, and none
is inferred from these CPU results. Independent implementation/visual approval
and target-hardware qualification are still required before issue closure.

## Verification

Local checks passed with Node 24.14.1:

- `npm run type-check`
- `npm test` (153 test files), including hidden collision, split occupants,
  remote drops, explicit projectile continuation, lift recovery, mutable
  controls, restart/unload, preparation cancellation and buffer ownership.
- `npm run check:generated-assets`
- `npm run build` and `npm run validate:production`
- `npm run test:smoke` (two Chromium production journeys at a nested path,
  covering startup, level transitions and restart).
- `npx playwright test tests/browser/CultivationBobPresentation.spec.ts --grep 'draws prepared room and fade shadow variants'`
  (both graphics presets passed all five room jumps, fade variants and
  backtracking without new programs on prepared draws). The Cultivation test
  fixtures now use the current graphics-settings object API.
