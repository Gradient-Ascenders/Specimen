# Specimen performance investigation, 28–29 October 2026

Target: 1920×1080 Medium on the i3-1220P / Alder Lake integrated GPU / 16 GiB,
Ubuntu 24.04 evaluation machine. Results below are comparative server
software-renderer diagnostics, **not evaluation-machine FPS**.

## Worktree, environment and deadline

- Starting revision: `08d9a5ef174afdcac083df77229911ba94b382c2`, including all
  `perf/optimisations` work. Isolated branch `perf/cerberus-20261028`, worktree
  `/home/kevin/dev/worktrees/specimen/perf-20261028`. Original worktrees retained.
- Current server: hostname `login`, 88 logical Xeon Gold 6152 CPUs, 247 GiB RAM,
  Ubuntu 26.04. `ssh cerberus` does not resolve here. Host confirmation was
  requested; work continues provisionally on this server, with actual identity
  recorded in captures. No accelerated GPU is available.
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

## Current investigation and validation

The generated-asset milestone stops at stale Containment radiance inputs.
Untouched `08d9a5e`, using the same pinned dependencies, reproduces the failure:
the checker omits four duct lights present in the committed bake input; all
other input fields and remaining lights match. The standalone 512-unit suite
passes. Cultivation's radiance check also reports stale inputs; an audit of
every generated check on both revisions is queued. No lighting bake is changed.
Raw evidence: `baseline-containment-provenance.log`,
`containment-bake-input-{expected,actual,delta}.json` and
`sun-milestone-generated*.log`.

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
blocking native calls, not evaluation-machine frame pacing. A frozen A/B/A
experiment will test prepacked static lighting arrays before a source edit.
Text-typing work after staged room placement is expected and is not a steady
playback baseline. Raw data: `runtime-cpu-baseline/` (13 valid views; see its
recorded final error), `runtime-cpu-boss-baseline/` and `runtime-cpu-summary.json`.

Manual capture review confirms the intended Containment doorway view, controlled
research-to-combat camera and ending daylight view are present in the retained
exact-image comparisons, including the separate ending-sun comparisons above.

## Next work

Tighter authored boxes in Cultivation Room 3 remove no triangles in the forward
view and 6,420 / 1,169,504 (0.55%) in reverse, without pixel changes. That small
result does not justify production code. The initial Blackout box probe selected
zero meshes because its art uses different metadata. The corrected control
selects 246 meshes and removes 0.4–5.9% of triangles across six views, with
identical pixels but no useful timing gain. No camera-culling change is retained.

Raw controls: `zero-directional-shadows/`, `authored-box-control/` and
`blackout-box-control/` beneath the artifact root.

A separate zero-radiance directional shader control matches all eight room
images exactly, with unchanged draws/programs and no first-use changes.
Software completion medians improve 5.2–8.2% in regular rooms and 2.2–2.6% in
combat. A reverse-order repeat is queued; no production shader change yet.
Raw evidence: `directional-shader-{before,guard}/`.

Next: assess static uniform packing and repeated directional controls, and
finish the generated-asset provenance audit. Preserve independently positioned companions and authoritative
simulation. Real Alder Lake GPU loading, frame pacing, first-use behavior and
visual checks remain outstanding.
