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

## Next work

Containment reflection shader expansion is now running as a routed diagnostic
against the immutable baseline, with 21 matched room/doorway views.
Directional zero-light work and tighter authored-batch camera bounds still need
measured controls. Preserve independently positioned companions and simulation.

Next broader validation should exercise graphics changes and first-use coverage
through those changes across levels. Real Alder Lake GPU loading,
frame pacing, first-use behavior and visual checks remain outstanding.
