# Specimen performance investigation, 28–29 October 2026

Target: 1920×1080 Medium on the i3-1220P / Alder Lake integrated GPU / 16 GiB,
Ubuntu 24.04 evaluation machine. Results below are comparative server
software-renderer diagnostics, **not evaluation-machine FPS**.

## Worktree, environment and deadline

- Starting revision: `08d9a5ef174afdcac083df77229911ba94b382c2`, including all
  `perf/optimisations` work. Isolated branch `perf/cerberus-20261028`, worktree
  `/home/kevin/dev/worktrees/specimen/perf-20261028`. Original worktrees retained.
- Current server: hostname `login`, 88 logical Xeon Gold 6152 CPUs, 247 GiB RAM,
  Ubuntu 26.04. The user confirmed this is the host to use as Cerberus.
  `ssh cerberus` does not resolve here; execution is local on this confirmed
  host, with its actual identity recorded in captures. No accelerated GPU
  is available.
- User-local Node 24.14.1, npm 11.18.0, Playwright 1.61.0 and Chromium
  149.0.7827.55. Browser shared libraries extracted into the user account.
  Environment: `artifacts/cerberus-perf/control/env.sh`.
- Sequential jobs run in persistent user service `specimen-perf-20261028`, with
  user lingering enabled. The worker rejects new optimisation jobs after
  **29 October 09:15 UTC**. RuntimeMaxSec and an independent calendar timer stop
  its complete cgroup at **09:59:50 UTC**, with a five-second kill grace.
  The user's explicit earlier cutoffs supersede the general noon deadline.
- No push, merge, publish or deployment. Repository README, CI instructions,
  Medium 1080p pass, gameplay pass, Level 2 investigation and profiling tools
  were read before game edits. No applicable AGENTS.md was found.

## Comparable baselines

Clean `08d9a5e` production build and layout validation pass (209 files). Immutable
build: `artifacts/cerberus-perf/baseline-dist/`. Each capture records its build
manifest, runner hash, browser, renderer and host. Chromium uses ANGLE Vulkan
SwiftShader. Fresh browsers, 1920×1080 / DPR 1 / manual Medium, sequential runs;
routed modules disable HTTP caching, while OS/driver cache temperature is
uncontrolled. Level 1 skips the opening; later levels use the native selector.
Request-to-ready excludes the subsequent arrival cinematic.

| Level | Request → ready | Programs | Uploaded buffer storage | Shader source submitted | Geometries / textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| Containment | 159.108 s | 301 | 16.75 MB | 26.37 MB | 492 / 72 |
| Cultivation | 79.073 s | 172 | 45.12 MB | 15.56 MB | 775 / 87 |
| Blackout | 196.671 s | 204 | 29.63 MB | 15.87 MB | 883 / 95 |

Upload/source totals include the initial live capture. They are not retained
VRAM or compiled driver-code sizes. Raw loading data: `baseline-loading-valid/`
under `artifacts/cerberus-perf/`.

Room baselines cover two opposing views in all five Containment/Cultivation
rooms and four Blackout rooms (28 views). Blackout Room 4's authored boss intro
overrides both requested yaws: these are intro views, not combat coverage.
Six frozen readbacks follow camera settling; exclude the first readback, which
drains queued software-renderer work. These are not interactive FPS samples.

- All views: no new programs or GL errors; no browser errors.
- Steady samples: no storage allocations. Containment and Blackout arrivals also
  have no storage allocations or program inspections.
- Cultivation arrivals/turns first allocate seven depth-backed shadow targets:
  four 1024×1024, two 512×512 and one 1×1. No new programs/inspections accompany
  them. Measure their practical cost before expanding startup preparation.
- Largest sampled submissions: Blackout maintenance/ascent, up to 820 calls;
  Cultivation Room 3, up to 1.17 million triangles. Counts include all passes.
- Raw data and images: `baseline-rooms/`. Distinct combat, power and broader
  movement states remain necessary when evaluating a gameplay optimisation.

## Retained Blackout bounded rehearsal

Only the hidden raster viewport of the temporary cinematic cameras is bounded
to 320×180 physical pixels. All 40 research and 30 ending poses, program
preparation, shadow sampler preparation and GPU fences remain. The retained
camera's full-size transmission target is prepared before these rehearsals.
Viewport, scissor, target and transmission scale restore synchronously.

| Stage | Baseline | Candidate |
| --- | ---: | ---: |
| Request → ready, matching loading runs | 196.671 / 195.878 s | 103.600 s |
| Research rehearsal, 40 poses | 67.327 s | 20.196 s |
| Ending rehearsal, 30 poses | 68.243 s | 24.267 s |
| General presentation preparation | 53.651 s | 51.954 s |

A separate cinematic capture repeated candidate readiness at 103.615 s. The
matching loading reduction is **47.1%** against the repeat baseline. The small
general-preparation difference is not attributed to the change.

Exact program cache-key sets remain identical (204), with 465 visible and 71
shadow preparation variants, 883 geometries and 95 textures. Temporary-camera
transmission targets become 240×135 / four samples. The retained target remains
1440×810; live output remains 1920×1080 Medium. Loading/native arrival captures
show no new live GPU storage, programs or program inspections.

Validation so far:

- Production build and 33 focused performance/shadow/GPU-fence unit cases pass.
- Milestone on clean commit `839aa84`: all 512 unit cases, production layout
  validation (209 files) and all eight standard production smoke cases pass
  (12.2 minutes). This covers opening preparation, all-level selection and
  nested-path startup/restart. Build manifest records `dirty: false`.
- Expanded Medium 1080p browser check passes: all 70 bounded rehearsals,
  retained full-size target, viewport/scissor restoration and full/distant/full
  Specimen LOD; no live storage or program inspections.
- All 70 frames inside the research and ending cinematics are pixel-identical
  at 1920×1080. No first-use programs, storage or inspections in either run.
- The extra combat-handoff frame initially selected a different random attack.
  A follow-up with an independent fixed boss RNG produces two pixel-identical
  final-shot/handoff frames, matching boss state, camera and submissions.
- Research, cinematic-music and ending journeys pass, including pause, skip,
  recovery, combat handoff, daylight and credits. The density-aware ending
  retry passes in 1.8 minutes.

Raw evidence: `bounded-warmup-loading/`, `baseline-loading-repeat/`,
`baseline-cinematics/`, `bounded-warmup-cinematics/`, `baseline-handoff-control/`
and `bounded-handoff-control/`. `warmup-dist/` freezes the tested candidate.
Retained in local commit `839aa84` after the correctness, image and first-use
checks above.

## Retained Containment reflection loop

A runtime room loop keeps one CubeUV sampling site, retaining the same one/two
room samples and blend order. The material cache version changes accordingly.

| Capture | Baseline ready | Candidate ready |
| --- | ---: | ---: |
| Routed diagnostic | 160.522 s | 148.430 s |
| Diagnostic repeat | 160.585 s | 147.668 s |
| Actual build, aligned fixed steps | 161.276 s | 148.500 s |

The built comparison reduces loading by **7.9%**. Compiler wait falls from
42.801 to 33.933 s. All 21 built room/doorway images are pixel-identical, with
identical program-key sets after normalizing the intentional cache-version
suffix (301 programs), submissions and first-use events. Both captures align to
20 ordinary fixed steps before posing. The first routed candidate had one fewer
native simulation step and small image differences; exclude that pair from
visual qualification. The repeated routed pair and both baselines match exactly.
Pooled steady-view medians differ by about 1%; no frame-rate gain is claimed.

Build, production layout and 28 focused units pass. The Medium/1080p five-room
travel/restart browser check passes in 4.4 minutes. The High-profile five-room travel/restart check also passes (3.1 minutes).
The corrected all-level graphics cycle passes
in 12.1 minutes: 12 mode changes, switching/fades and nine restarts, with no
new live programs, inspections or GL errors. No production room visibility or simulation changes.

Raw evidence: `containment-reflection-{before,loop}[-repeat]/`,
`containment-aligned-{before,built}/` and `containment-loop-*.log`.
The extended upper-observation view adds 17 geometries / 51 buffer-storage calls
in both versions: 13,056 bytes, 0.1–0.3 ms of measured submission time. This is
outside the earlier entry-view coverage and is a lower-priority first-use item.

## Retained inactive ending-sun shadow policy

The ending sun retains its allocated shadow sampler while its intensity is
zero. It updates whenever daylight becomes positive, including the first lit
frame, and returns to the inactive policy on reset. Its 1024-square map,
projection, shadow settings and authored intensity curve are unchanged.

- Eight built Medium/1080p room images match exactly. Six ordinary views save
  101 calls / 102,004 triangles per frame; two actual boss-combat views save
  95 calls / 26,612 triangles. Counts include shadow and transmission passes.
- All 74 cinematic checkpoints match exactly, including controlled research
  handoff and first positive daylight. No new storage, programs or inspections
  occur in the room or cinematic probes; the full-size sun map is retained.
- Build/layout, 28 focused units and the full 512-unit suite pass. Medium
  preparation/LOD and the complete ending journey pass (4.0 minutes). Blackout
  shadow-profile resizing passes (8.8 minutes), with 12 ordinary draws and no
  late allocation/program/inspection event. That focused test records, but
  does not excuse, the known Cultivation allocation failure below.
- Ready is 104.748 s versus 107.326 s; software frame-completion differences
  of -1.3% to +0.3% are not a supported timing improvement. Work reduction is
  the supported result.

Raw evidence: `inactive-sun-rooms-built/` against `directional-shader-before/`,
`inactive-sun-cinematics-{before,built}/`, `inactive-sun-functional.log`,
`inactive-sun-profile-switch.log` and `sun-milestone-unit.log`. The original
runtime control's two entries labelled Room 4 reused the Room 3 shortcut and
are excluded; built comparisons use `teleportToFinalBoss()` and actual combat.

## Retained zero-radiance directional shader guard

Dark directional lights now skip shadow sampling and physical lighting math
through the existing visibility guards. Nonzero lighting math and accumulation
order remain unchanged. The existing opt-in applies to Containment and Blackout;
Cultivation retains its previous shader path. The opt-in cache version advances
from v4 to v5, including inherited preparation hooks.

The first controlled pair improves software completion medians by 5.2–8.2%
in six ordinary Blackout views and 2.2–2.6% in two combat views. A reverse-order
repeat, with the retained sun policy on both sides, improves ordinary views by
5.7–7.8% and combat by 1.5–3.3%. The actual build reproduces approximately
5–8% and 2–4%, respectively. Draw counts and triangles are unchanged. These
are completed software-renderer draws, not evaluation-machine frame rates.

- All 103 built comparisons are pixel-identical: eight Blackout room/combat
  views, 74 cinematic checkpoints and 21 Containment room/doorway views.
- Program-key sets match after normalizing the intentional cache suffix:
  204 in Blackout, 301 in Containment. Graphics, resource counts and first-use
  events match. The first positive daylight frame uses the retained 1024-square
  sun map without new programs, storage or inspections.
- Build/layout and 28 focused units pass. Research escape, ending playback and
  Medium/1080p preparation pass (6.3 minutes). Cultivation's Bob/Goop pixel
  control passes with zero difference and no GL errors (4.3 minutes).
- No additional loading-time claim: the new Containment capture is 148.920 s,
  consistent with the retained reflection improvement, and Blackout loading
  differences are smaller than the original rehearsal saving.

Raw evidence: `directional-summary.json`, `directional-{control,guard}-repeat/`,
`directional-rooms-built/`, `directional-cinematics-built/`,
`directional-containment-built/` and `directional-{functional,cultivation}.log`.
The initial pair (`directional-shader-{before,guard}/`) predates the sun policy;
only compare timings within each matched pair.

## Test and instrumentation corrections

- `a3e3b03`: the baseline unit suite had 511 passes / one failure. The failing
  Cultivation route still used the service return sealed by `fb9b0e3`. The test
  now ends at Volt's rescue and checks that Goop remains independently parked;
  all three targeted traversal/grounding cases pass. Collision is unchanged.
- `552f392`: both existing performance runners assumed a direct-return Blackout
  constructor. Match the constructor expression so assigned-return factories
  attach correctly. Both factory forms and the production bundle parse check
  pass; the same pattern is exercised by the successful runtime captures.
- The expanded LOD probe initially bypassed HiddenMaterialCulling and uploaded
  250 invisible collider geometries. Matching the ordinary runtime draw scope
  resolves this test-path failure; the original failed log is retained.
- `84c39d1`: the ending test selected Low density but required more than 120 smoke
  instances. The untouched baseline reproduces the same count of 70. Its
  assertion now scales with the selected effects density; the full ending retry
  passes. Production effects remain unchanged.

- Graphics preparation fixtures now expect the existing Medium transmission
  scale of 0.75, finish the real arrivals before testing gated controls, and use
  Volt's supported finale skip/handoff before entering Blackout. The target
  check passes; the full all-level cycle passes in 12.1 minutes with 12 mode
  changes, switching/fades and nine restarts. No new live programs, program
  inspections or GL errors. The prior attempts stopped at fixture assumptions,
  not a rendering failure. Raw logs: `graphics-corrections.log` and
  `graphics-finale-handoff.log`; final evidence: `graphics-finale-handoff-results/`.

## Evidence limits and excluded attempts

The first loading attempt missed Blackout's assigned constructor and observed
its disposed predecessor; it is excluded. Corrected captures assert the owner.
Software arrival wall time is stretched by the normal fixed-step cap and is not
loading time. Initial readbacks can drain queued arrival work; do not label that
wait a new shader hitch. One ending request (81.5 s) follows 81.73 s in the
preparation list; both monotonic live probes record the actual 81.733 s state.
The original random combat handoff is excluded from pixel-equivalence claims.
Raw attempts remain available; the earlier progress journal is retained in
`artifacts/cerberus-perf/progress-journal-through-0114.md`.

The additional bounded-clear experiment scissored all 70 hidden draws. Ready
was 103.575 s versus the retained viewport's 103.600 / 103.615 s; rehearsal was
19.49 + 24.41 s. This is no useful improvement within measurement noise. No
production scissor change was made. Raw control: `scissored-warmup-probe/`.

The additional Containment irradiance-loop control matches all 21 room/doorway
images, program counts and first-use events. Ready changes from 146.808 to
145.148 s, while lighting preparation rises from 95.707 to 97.167 s and room
completion timings move in both directions. This does not establish a useful
gain; no production change is retained. Raw data: `containment-probe-{before,loop}/`.

## Baseline issues and CPU investigation

All 14 generated-asset checks have identical outcomes on untouched `08d9a5e`
and the candidate, using the same pinned dependencies: 12 pass; Containment
and Cultivation radiance inputs are stale. Containment's checker omits four duct
lights present in the committed input; other fields and remaining lights match.
Cultivation's source/geometry hashes differ, with 333 rather than 331 static
meshes and 787,349 rather than 787,245 triangles; its lights match. The standalone
512-unit suite passes. No lighting bake is changed.
Raw evidence: `baseline-containment-provenance.log`,
`containment-bake-input-{expected,actual,delta}.json` and
`cultivation-bake-input-{expected,actual,delta}.json`,
`generated-provenance-audit.json` and `sun-milestone-generated*.log`.

The same-shader shadow-profile test reproduces a pre-existing Cultivation
failure on the untouched `08d9a5e` build. After the preparation gate, it allocates
a 512×512 `cultivation-room-1-greybox-fixture-shadow-1` target while paused, then
a 1×1 padding spotlight target in play. Measured API submission is 0–0.1 ms;
that does not measure GPU completion cost. No new program or GL error accompanies
the allocations. No production change is justified by a claimed timing gain.
Raw evidence: `shadow-allocation-baseline-results/` and
`shadow-allocation-baseline-retry.log`. The initial artifact server attempt used
the wrong working directory and never launched the test; it is excluded.

CPU/heap attribution covers all 14 rooms at Medium/1080p. The first boss probe
rejected an invalid zero-length diagnostic update; its dedicated retry passes
in combat with a valid fixed step and no new programs or GL errors. Readback waits dominate this
software renderer. Three's program-parameter/cache-key work and uniform-array
flattening are prominent sampled allocation sites. Cultivation Room 3's sampled
fixed updates have a 5.7 ms median versus roughly 2–4 ms in its other rooms.
These profiler-assisted samples are diagnostic main-thread wall time, including
blocking native calls, not evaluation-machine frame pacing. Frozen A/B/A controls below test prepacked static lighting arrays before a source edit.
Text-typing work after staged room placement is expected and is not a steady
playback baseline. Raw data: `runtime-cpu-baseline/` (13 valid views; see its
recorded final error), `runtime-cpu-boss-baseline/` and `runtime-cpu-summary.json`.

## Retained static lighting layouts

Packing is retained only for Cultivation and Blackout after the controls below.
The initial profiled Cultivation control reduces sampled flattening work, but aggregate allocation estimates
vary. An unprofiled frozen A/B/A run preserves every image and resource count,
with submission medians as follows:

| View | Original arrays | Packed arrays | Restored arrays |
| --- | ---: | ---: | ---: |
| Containment Room 1 | 17.65 ms | 17.90 ms | 18.35 ms |
| Cultivation Room 3 | 19.85 ms | 25.75 ms | 26.95 ms |
| Blackout Room 1 | 26.10 ms | 35.50 ms | 26.10 ms |

The hot-switch experiment alone does not support adoption. Fresh browsers
subsequently supply the array format before module initialization, freeze native
start synchronously, and finish the real arrival with fixed steps. Both orders
preserve exact images, uploaded Float32 values, camera state, program counts,
draw/triangle counts and resource counts:

| Fresh view / order | Original submission median | Packed submission median | Completed-frame change |
| --- | ---: | ---: | ---: |
| Cultivation Room 3, original first | 27.40 ms | 24.15 ms | -0.52% |
| Blackout Room 1, original first | 38.70 ms | 35.65 ms | +2.97% |
| Cultivation Room 3, packed first | 27.60 ms | 16.95 ms | +0.69% |
| Blackout Room 1, packed first | 37.30 ms | 35.80 ms | -0.86% |

Each median contains 24 samples after five settling draws. Submission wall time
includes native blocking calls; the large spread limits the size of the claim.
The supported mechanism is avoiding repeated Vector3 coercion/flattening in
Three's uniform upload path. There is no supported GPU or evaluation-FPS gain.
The production change packs only the four immutable bounds/grid/capture arrays
in Cultivation and Blackout. The actual build passes all 512 units and production
layout validation; all three matched captures are exact, with unchanged GPU
values, program counts, draws and resource counts. Built submission medians are
24.85 ms for Cultivation and 36.15 ms for Blackout, against 27.60 and 37.30 ms
controls. Raw build checks: `uniform-{build,layout,unit}.log`; captures and the
strict value/resource comparison are `static-uniform-built/`,
`static-uniform-containment-built/` and `static-uniform-built-summary.json`. Containment is
excluded: its fresh median increases from 16.25 to 16.90 ms (+4.0%), consistent
with the earlier small hot-switch increase. Its pixels and GPU values match,
but these measurements do not support changing its five-zone layout.
Dynamic powers, origins, shader source and quality remain unchanged.
Raw data: `static-uniform-control/`, `static-uniform-repeat/`,
`static-uniform-fresh-{before,packed}/`, their `-repeat` counterparts, and
`static-uniform-containment-{before,packed}/` and
`static-uniform-fresh-summary.json`. The older profiled allocation totals are
noisy and do not establish an aggregate allocation reduction.

Manual capture review confirms the intended Containment doorway view, controlled
research-to-combat camera and ending daylight view are present in the retained
exact-image comparisons, including the separate ending-sun comparisons above.

## Other experiments

Tighter authored boxes in Cultivation Room 3 remove no triangles in the forward
view and 6,420 / 1,169,504 (0.55%) in reverse, without pixel changes. That small
result does not justify production code. The initial Blackout box probe selected
zero meshes because its art uses different metadata. The corrected control
selects 246 meshes and removes 0.4–5.9% of triangles across six views, with
identical pixels but no useful timing gain. No tighter-box change is retained.

Raw controls: `zero-directional-shadows/`, `authored-box-control/` and
`blackout-box-control/` beneath the artifact root.

Cultivation's original load attributes 47.05 s to program-log queries and
15.47 s to shader-log queries. A matched control suppresses log queries but
independently checks all 172 programs' link status before audited readiness.
Readiness changes from 81.520 to 79.184 s, comparable to the original 79.073 s
baseline. Waiting moves into program-parameter queries (61.738 s); there is no
supported benefit from removing diagnostics. Both runs pass every link check
and have no new programs or GL errors in six completed ordinary draws. Shader
error checks remain enabled. Raw data: `shader-logs-before/` and
`shader-logs-suppressed/`.

Draw attribution covers seven heavy views across the three levels, including
actual boss combat. In early Blackout, distant transit art accounts for 134
calls / 48,168 triangles, the ascent group 114 / 20,510, and lair static scenery
40 / 189,400 across all passes. Hiding distant static art cuts the maintenance
forward view from 719 calls / 433,412 triangles to 501 / 187,950, but changes
1,473 channels (530 pixels in the upper background). Transit forward changes
4,483 channels. Restored frames are exact and body positions unchanged.
This whole-root policy is rejected, regardless of its lower completion times.

The ascent landing reverse view is exact under old-room art hiding, saving
268 calls / 83,258 triangles. A narrower diagnostic checks bounding boxes
against the inset opaque rear-shutter rectangle, across 16 camera positions
and pitches, leaving shadow hooks untouched. Per-root controls show why the broad policy is unsafe: transit and
lair art change maintenance pixels, while ascent and lair art change transit
pixels. Hiding transit's own art there is only a positive visibility control.
Raw data: `draw-attribution/`, `draw-attribution-summary.json`,
`blackout-room-occlusion-control/`, `blackout-occlusion-components/` and
`blackout-gate-occlusion/`.

A Cultivation reflection mip-sharing control is inconclusive and is not
retained. Readiness changes from 82.047 to 79.759 s, within the preceding
control range, and ten room completion medians are mixed (-5.8% to +3.6%).
All ten images, program-key sets, resource counts, graphics and first-use
metadata match. The first attempt ended after a baseline browser audio-device
error and is excluded; both repeated runs are clean. Raw data:
`cultivation-mip-{before,loop}-retry/` and `cultivation-mip-summary.json`.

## Retained Blackout closed-shutter culling

The retained helper rejects only authored maintenance/transit mesh boxes
whose eight corners project inside the opaque ascent rear shutter's inset
rectangle. It uses current world transforms and only the fully closed gate.
The original 8.06 × 5.27 m body and bevel are checked against the authoring
script; the occlusion rectangle is inset to 7.6 × 4.8 m. Opening/hidden gates, non-perspective cameras
and cameras behind the gate bypass the helper. A conservative clip-space
near-plane check keeps all draws if any of the inset shutter volume can be
clipped, including close or sharply tilted cameras. Shadow-camera submissions,
actors, lights, scene visibility/layers and authoritative simulation are
unchanged. The renderer method restores synchronously, including on errors.
Preparation and all arrival, elevator, research, merging and ending cinematics
keep their original drawing path.

The revised production build passes all 518 unit tests and production layout
validation. Six helper cases cover conservative silhouette boundaries,
independent companions, shadow cameras, opening/hidden gates, camera layers,
rotated parents, moving art, clipped shutters and throwing-draw restoration. The built A/B/A
control includes 16 camera positions/pitches, two transit power states and
native Tab switching through Bob, Goop and Volt. All 20 views and restored
frames are pixel-identical at 1920×1080 Medium. Body positions and geometry
ranges match; every measured draw has zero new programs, GPU storage,
program-log inspections and GL errors.

| View | Calls before → after | Triangles before → after |
| --- | ---: | ---: |
| Near rear shutter, camera [0, 2, 177.1] | 316 → 150 | 155,219 → 106,079 |
| Central landing reverse, camera [0, 2, 189] | 705 → 445 | 411,346 → 340,414 |

The central view removes 260 calls (36.9%) and 70,932 triangles (17.2%).
Its software completion medians are 1,480.9 → 1,285.5 ms, but only two draws
per A/B/A phase were taken: the supported result is the deterministic draw
reduction and exact images, not an evaluation frame-rate claim. Side and
elevated cameras appropriately retain more scenery. Central and side images
were also reviewed manually. Raw evidence: `blackout-gate-submission/`,
`blackout-gate-built/`, `blackout-gate-summary.json` and `gate-{build,layout,unit}.log`.

All 74 cinematic checkpoints and the controlled research/combat handoff are
pixel-identical against the previously validated directional-light build, with
matching presentation metadata, program-key sets, resource counts and first-use
events. This includes the first positive daylight frame and its full 1024-square
shadow map. Raw evidence: `gate-cinematics-built/` (ready 102.484 s).
The initial four native elevator/research/ending/Medium preparation cases pass
(7.8 minutes). The near-plane refinement also passes the native elevator and Medium/1080p
preparation checks (3.8 minutes) and repeats all 20 image comparisons exactly,
including unchanged first-use state, body positions and geometry ranges.
The close, tilted case conservatively retains all 137 calls; the central
landing still removes 260 calls and 70,932 triangles. This final control is
`blackout-gate-near-built/`, with `gate-near-{build,layout,unit,functional}.log`.
Its first capture command referenced a nonexistent runner filename; that setup
failure is excluded and the corrected capture retry passes. The broader
smoke/integration/graphics milestone is in progress. Real Alder Lake GPU loading, frame pacing, first-use
behavior and visual checks remain outstanding.

## Additional browser coverage

User-local Firefox 151.0 / Playwright Firefox 1532 passes the native production
startup, credits and restart smoke (2.5 minutes), with software WebGL2 under
Xvfb. Its renderer reports `llvmpipe, or similar`. Dependencies are isolated
from Chromium in `~/.local/opt/specimen-perf-20261028/firefox-deps/`;
`control/firefox-env.sh` selects them. Headless Firefox did not provide WebGL2.
The user-local Xvfb copy needed a same-length keyboard-compiler path relocation;
the original package binary and both hashes are retained in
`firefox-xvfb-relocation.json`. No system libraries are replaced. Raw evidence:
`firefox-renderer.json`, `firefox-smoke.log` and `firefox-smoke-xvfb.log`.

## Remaining evaluation-machine checks

Run on the specified i3-1220P / Alder Lake integrated GPU / 16 GiB / Ubuntu
24.04 machine, with hardware-accelerated Intel/Mesa WebGL and the actual
1920×1080 drawing buffer, manual Medium and 100% render scale. Record browser,
Mesa/kernel, power mode and thermal conditions. Do not use the artifact
capture runners' forced SwiftShader backend for an evaluation FPS result.

1. Repeat loading from clean navigation and in-session reloads, separately
   recording cache conditions, asset preparation, program compilation,
   geometry upload and cinematic preparation. Check the retained full-size
   transmission target and all shadow variants before readiness.
2. Traverse every room and doorway with real input. Record p50/p95/p99 frame
   times, long frames, CPU/GPU timing where available and repeated-cycle
   memory. Prioritize Cultivation Room 3, Blackout maintenance/transit and
   both boss phases; software readbacks cannot establish frame pacing.
3. Compare the Containment reflection loop and zero-directional-light shader
   branch on Intel's compiler/GPU. Their software results do not establish
   the same gain, or a gain of the same size, on another driver.
4. Check close, tilted and side views around the ascent shutter, opening and
   closing, independently parked companions, power states and native character
   switching. Repeat abilities, hazards, death/retry and graphics changes.
5. Watch the complete ascent, research/combat handoff and ending with audio,
   including the first daylight shadow. Check for first-use hitches and
   unchanged transmission, shadows, lighting and Medium appearance.

The existing [Medium 1080p hardware protocol](medium-1080-performance-pass.md)
contains the native hardware loading and staged-route commands. Build a clean
commit before using those runners; retain both baseline and candidate evidence.
No visual tradeoff or lower global resolution is adopted in this run.
