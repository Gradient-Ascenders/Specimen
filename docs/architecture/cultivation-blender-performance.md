# Cultivation Blender performance pass

Baseline: `ab70697`, after merging the authored Level 2. Measurements below
use Medium, a 1920 × 1080 viewport, DPR 1, the existing scene/shadow settings,
and native Chrome on the development Intel Iris Xe GPU. This is not a
qualification of the university i3-1220P / Alder Lake GT2 machine.

## Retained changes

| Resource | Before | After |
| --- | ---: | ---: |
| Compressed authored asset bank | 18,826,940 bytes | 11,447,636 bytes (-39.2%) |
| Unpacked authored asset bank | 104,004,312 bytes | 68,223,592 bytes (-34.4%) |
| Used ceramic GPU textures, including mipmaps | 24 MiB RGBA | 6 MiB BC7 |

The bank deduplicates identical array payloads and losslessly delta-encodes
geometry words before gzip. Decoding writes directly into each geometry's
owned arrays; there is no second decoded-bank cache. Authored positions, UVs,
topology, groups and bounds stay exact. Presentation-only normals/colours use
normalized 16-bit/8-bit attributes; suitable indices use 16 bits. Colliders and
their surface metadata retain their existing authority.

The used Containment ceramic finish family uses the already accepted native
BC7 mip chain. The unused resin payload is omitted. Without BPTC, preparation
fetches the original RGBA family before compilation/upload. Cancellation aborts
the request and prevents late adoption into an unloaded scene.

Room 5 has conservative chamber/sewer visibility regions. Static batches and
explicitly registered chamber skins, beams, boosters and captive presentation
are masked only during the synchronous draw. Both camera and active player
must be inside the same region; portal/return-route views retain both sides.
Registration rejects branches containing lights. Every draw restores original
visibility in `finally`, including existing hidden/LOD states. Physics,
simulation, source selection, shadow signatures and mandatory preparation stay
under their existing owners. The finale bypasses sector culling while it borrows
and flies the chamber craft into the escape route.

Preparation no longer treats `receiveShadow` as a shader feature: in pinned
Three r185 it is a uniform. Copies still separate live materials, instancing,
geometry/morph features and custom shader keys. All compile and first-use
priming guards remain in place; compiler waits are not deferred into gameplay.

Level 2 budgets Balanced/reduced-transmission capture at 0.25 of each viewport
dimension, versus the previous 0.75. At 1080p this is a 480 × 270 offscreen
refraction buffer instead of 1440 × 810. Main-scene resolution and gel surface
shading stay at the selected settings. Full physical refraction ignores this
level budget; release on unload restores the session policy. The request starts
before framebuffer priming, so the first controllable frame does not resize it.
Graphics resource keys distinguish gel modes even when nominal preset caps
coincide, retaining the settings-change preparation gate.

## Local evidence and limits

Fresh browser contexts disabled HTTP caching through the routed production
entry module. Driver caches were shared and uncontrolled. The initial baseline
took 25.46 s to reach Enter, including 20.51 s in compilation waits. Its repeat
took 3.57 s; a reverse-order warmed baseline took 3.35 s. Final repeat loads
measured 3.36 s and 3.28 s; earlier candidate samples ranged from 2.73 to 4.26 s.
This does not establish a reliable reduction in local elapsed startup time.
The smaller download/unpacked bank is verified; cold shader compilation remains
the principal first-load cost. Warm timings are not first-ever driver-cold loading.

The two final initial-gameplay samples contained 377 real, controllable frames:
13.33 ms mean interval, 13.5 ms p95 and 13.7 ms maximum. No new programs or
buffer/texture allocations occurred in the sampled gameplay or staged views.
This short sample is not a full traversal or a sustained FPS guarantee.

Frozen-pose render-only comparisons isolate the visibility change from
simulation and camera movement:

| View | Submissions before / after | Triangles before / after |
| --- | ---: | ---: |
| Chamber | 436 / 420 | 581,474 / 557,858 |
| Sewer | 390 / 356 | 711,443 / 594,975 |

Within each pose, enabled/disabled culling produced identical RGBA pixels with time held fixed.
Transitions, both camera/player sides and original visibility restoration have
focused coverage; the exact lab machine still needs a normal playthrough.

With identical scene/settings and culling, toggling only capture resolution
within each frozen pose measured:

| View | Previous 0.75 capture | Budgeted 0.25 capture | GPU cost reduction |
| --- | ---: | ---: | ---: |
| Chamber | 14.30 ms | 9.81 ms | 31.4% |
| Sewer | 15.69 ms | 11.57 ms | 26.2% |

These are GPU timer-query render costs, not gameplay FPS. The capture comparison
changed at most one channel unit in the chamber image and four in the sewer
image (0–255 range); only 12 sewer colour components changed by more than two.
Refraction can be softer at other close views. The main scene and full physical
gel option retain their requested resolution. Zero new programs/allocations
were recorded during ordinary timed frames; diagnostic capture-size changes
were warmed before sampling.

Experiments with larger compiler batches and a combined point/spot response
were removed: loading submissions paused the UI longer, or GPU cost increased.
A static world-matrix cache also showed no consistent benefit and was removed.
The retained capture budget is the explicit visual tradeoff: it reduces only
the background buffer sampled through Balanced gel. No scene-resolution, light
count or particle-density defaults were lowered.

## Reproduce

Build and serve the production bundle at its nested smoke path. Start a
hardware-accelerated Chrome with remote debugging enabled, then connect:

```bash
npm run build
node scripts/serve-production-smoke.mjs
# In another terminal; use the reachable debug endpoint for that Chrome:
SPECIMEN_CDP_URL=http://127.0.0.1:9222 PERF_LABEL=local npm run benchmark:level-two
```

The benchmark owns a fresh context and closes it on completion; it leaves the
external browser running. `PERF_BASE`, `PERF_DIST`, `PERF_REPEATS` and
`PERF_VIEWS=room-5,sewer` narrow repeat comparisons.
`PERF_REFERENCE_TRANSMISSION_SCALE=.75` compares the previous capture size and
saves paired scene images. Reports/screenshots live
under ignored `artifacts/level-two-performance/<label>/`. It records live
movement separately from staged render-only views, GPU disjoint state, errors,
new programs, allocation frames and culling pixel checks. Compare matched
settings and warm-cache states; retain a baseline build for reverse-order runs.

Lighting bake geometry/lights/layout checksums stayed identical after asset
repacking. The existing bake was rerun to update its source-bank provenance.
