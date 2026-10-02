# Issue #171: Containment shadow coverage

Local implementation for [#171](https://github.com/Gradient-Ascenders/Specimen/issues/171),
following the renderer and character boundaries in #169/#170.

## Coverage and authority

21 finite fixture-directed spotlights cover Rooms 1–5, both connecting ducts,
floor/platform traversal, adhesion surfaces and the elevator shaft. Sources use
256/512/1024-square maps, with no map spanning the entire level or following a
character. Room 4 uses three overlapping west-wall zones; tests sample the
centre of the full ascent every 0.25 m inside the actual cone and finite range.
Room 5's upper range extends to 32 m to include the lower Goop door.

The original palette, exposure 1, decay 2, alarm/arrival/release colour and
intensity mappings remain. Replacing point lights with fixture cones removes
omnidirectional spill, so palette/readability acceptance needs human review.
Three dim, visibly housed service keys now illuminate the enclosed Room 1 duct.

The active body's existing position selects coverage, using reversible smooth
doorway weights; progression/checkpoint state and Bob's reflection targets keep
their existing authority. Platform, elevator, panel, door/dissolve and cutscene
clocks remain unchanged. Shadow caching reads existing poses, visibility and
dissolve uniforms. It never advances a second animation or changes collision.
Bob's depth/fade/deformation and Goop's existing mesh remain the #170 ownership.

Explicit solid roles are selected before consolidation. All 85 original batch
names and source memberships were compared with the clean checkout and retained;
all 23 measured upload owners remain, including both instanced owners. Hidden
colliders, glass, acid, particles, signage, gaskets and status lenses are excluded.
Unbatched instrument/track details receive without independent caster draws.

Cached world boxes reject distant opaque structures from local shadow passes;
the character morph path retains Three.js's existing bounds. Maps containing
characters update continuously for stationary wobble and camera fade. Departure,
moving owners, art/shutter visibility, dissolve completion, reset/recovery and
cutscene transitions invalidate cached depth. Unaffected static zones reuse maps.

## Matched production evidence

Open [the 41-pair comparison viewer](iris-xe/compare.html).
[Raw measurements](iris-xe/measurements.json) include source/camera transforms,
map settings, caster names/calls, render counters, preparation and disposal.
The production bundle is exposed only in the browser-served test response;
no debugging export is added to the application.

Spawn, jump and landing use normal input. Other room, duct, adhesion, platform
and doorway views stage the existing production presentation at route poses.
Five lift views use the existing authoritative timer at 0/25/50/75/100% with
staged cameras. The Goop-door view uses the live persistent Goop development
mesh, not a new shadow body. Each off/on pair freezes simulation and asserts
identical camera and Bob morph weights; it changes only the renderer request.

Six release views use the existing lighting API and panel-art preview API;
four hatch views use the existing lighting and egg-art APIs. This checkout has
existing Room 5 ending-state progression, but no dedicated native hatch/release
cutscene camera sequence. These captures do **not** establish native
cutscene cameras, animation, skip sequencing or full normal-input traversal.
They retain the existing captive art placeholder; the staged reveal view can
overlap that placeholder with Bob and the live Goop proxy. It is an API lighting
and caster-workload view, not an accepted release composition.
The UI remains in its actual staged gameplay state and therefore displays the
Room 1 objective; no progression is fabricated for screenshots.

## Preparation and lifecycle

Loading compiles five room layouts and four adjacent pairs behind the loading
screen, distinguishing receiver/caster features and the observed cross-room
acid material. Existing room subsets borrow materials. The measured upload
guard retains all 23 owners and creates no additional program. Its geometry
delta is now zero because room shadow preparation already made them resident.

Three whole-level restarts retain stable geometry/texture/program counts.
Unload records 21 allocated maps, 21 disposal events, cleared map references and
disabled renderer shadows. Unit tests also exercise failed overlap preparation
restoration, idempotent map disposal, live/distant caching, old/new moving-owner
coverage, visibility swaps, dissolve completion and reset invalidation.

## Hardware timing and budget status

Captured 2026-10-01T19:09:58.359Z with Chrome 154.0.8037.58 in an isolated
Windows headless session. The physical Intel Iris Xe (`0x46A6`) uses ANGLE
D3D11; this is not software-renderer timing. Viewport/drawing buffer 960×600,
DPR 1, exposure 1. GPU samples use `EXT_disjoint_timer_query_webgl2`; all seven
poses have 40 valid samples in each off/on/on/off block, with no disjoint flag.
Five warm-up draws precede each block. Caster instrumentation runs in a separate
untimed draw. GPU time, CPU submission and browser frame cadence are distinct;
simulation is frozen, so these are render-only measurements.

| Pose | Updating maps | Caster calls | Total calls off/on | On GPU p50 ms (two blocks) | On GPU p95 ms (two blocks) | On submission p95 ms (two blocks) |
| --- | ---: | ---: | --- | --- | --- | --- |
| Room 1 spawn | 3 | 108 | 362 / 470 | 9.57 / 8.01 | 9.67 / 9.60 | 15.00 / 15.00 |
| Room 2 floor | 2 | 185 | 69 / 254 | 6.31 / 7.22 | 6.76 / 7.28 | 9.00 / 9.40 |
| Room 3 entry | 2 | 207 | 147 / 354 | 7.30 / 7.30 | 7.33 / 7.36 | 11.20 / 10.80 |
| Room 4 lower | 1 | 74 | 97 / 171 | 6.65 / 6.70 | 6.80 / 7.30 | 8.70 / 9.00 |
| Handoff 4–5 | 2 | 183 | 313 / 496 | 8.40 / 7.69 | 8.47 / 8.89 | 16.50 / 16.60 |
| Room 5 upper platform | 2 | 231 | 209 / 440 | 8.55 / 7.58 | 8.64 / 7.70 | 15.50 / 15.70 |
| Release API reveal | 4 | 334 | 228 / 562 | 9.66 / 9.66 | 10.56 / 9.78 | 20.10 / 19.70 |

The release pose has the largest settled simultaneous caster workload among
these captures. These counts include instanced/merged submissions, not original
source-mesh counts. A static map invalidation can add passes on the next frame;
the full configured maximum is ten passes at handoff 1–2. Map/pass/texel inventory
is in [containment-lighting.md](../../containment-lighting.md#map-pass-inventory-and-budget).

Maximum observed caster calls per source across the 41 settled poses:

| Sources | Calls |
| --- | --- |
| Room 1 west / east / pedestal | 51 / 43 / 16 |
| Room 1 duct low / ramp / turn / exit | 29 / 11 / 27 / 28 |
| Room 2 drop / lower / sticky-exit | 73 / 112 / 51 |
| Room 3 entry / industrial / vent | 119 / 88 / 71 |
| Room 4 lower / middle / upper | 74 / 49 / 58 |
| Room 5 entry / upper / chamber / reveal / observation | 128 / 106 / 52 / 48 / 17 |

**Performance acceptance remains open.** The #169 provisional Room 1 total GPU
p95 limit of 10 ms passes in this final capture, but its submission p95 limit of
14 ms fails at 15 ms. Release submission also exceeds the full gameplay target
of 16.7 ms before simulation. Handoff submission leaves essentially no gameplay
headroom. The per-source GPU allowance (p50 ≤2.5 ms / p95 ≤3 ms) was not measured
in isolation; the raw timings measure the complete shadow graph, and must not be
divided by source count or multiplied into a new allowance. No waiver or larger
budget is assumed. Further reduction or an explicitly approved budget is required
before accepting #171; #173 must validate continuous play, first invalidations,
native sequences and higher DPR. The implementation records this gap, not a
performance pass.

## Validation

- Final `npm test`: 108 test files pass, zero failures/skips.
- Production build/type-check and production-layout validation pass.
- Physical-browser checks pass for plain-production prewarm/traversal, debug
  traversal/program stability, and Bob reflection restart/reload. The debug
  acid-impact check timed out during a concurrent full-suite run, then passed
  alone; the other two checks passed in the final grouped run.
- All 41 off/on pairs pass camera/morph equality and resource disposal checks;
  no console errors or failed network requests were recorded.
- Preparation: 1,134.9 ms, 247 programs after the nine layouts. Three restarts
  stabilize at 513 geometries / 59 textures / 407 programs (including off-mode
  comparison variants), with all 21 maps disposed once at unload.

To reproduce captures after `npm run build`, run
`node scripts/capture-containment-shadows.mjs`. It starts its own local preview
unless `CONTAINMENT_SHADOW_URL` is supplied. Set `CONTAINMENT_SHADOW_CDP_URL` for
an already isolated physical-GPU browser and `CONTAINMENT_SHADOW_OUTPUT` for the
destination. The browser regression checks use the existing Playwright test
file; this run connected its browser fixture to that isolated Chrome session.

## Remaining acceptance

Human visual approval is pending, particularly soft contact in dark duct/shaft
views, Goop's lower-door contact, broad wall shadows and the lighting cone change.
Staged views and the representative browser traversal cannot establish the
entire native traversal or hatch/release flow. Higher DPR, headed continuous
play and full simulation performance remain #173. Do not close #171 from these
automated checks or staged screenshots alone.
