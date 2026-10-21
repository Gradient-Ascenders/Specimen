# Lab performance optimisation specification

Status: implementation in progress; hardware validation is partial. Baseline: 21 October 2026, commit
`74af50d911c84ac26797c812b5a5384f7dd1b4ad`.

Tracking: [parent #222](https://github.com/Gradient-Ascenders/Specimen/issues/222); preparation [#223](https://github.com/Gradient-Ascenders/Specimen/issues/223), shader coverage [#224](https://github.com/Gradient-Ascenders/Specimen/issues/224), startup [#225](https://github.com/Gradient-Ascenders/Specimen/issues/225), validation [#226](https://github.com/Gradient-Ascenders/Specimen/issues/226).

Improve Level 2 frame delivery during preparation, reduce Level 1 startup time,
and complete Level 1 shader warmup coverage. Preserve the existing gameplay,
graphics profiles and resource ownership. Deliver three implementation changes
and a final hardware validation package; do not treat the diagnostic pause of
background preparation as a production fix.

## Measured baseline

The assessment machine has an Intel Core i3-1220P, integrated Alder Lake
graphics, 16 GB class RAM, Ubuntu 24.04.4, i915/Mesa 25.2.8 and Chrome
156.0.8078.47. Hardware ANGLE OpenGL ES and GPU timer queries were verified.
The display is 1920 by 1080 at approximately 60 Hz, with balanced power settings.

The benchmark used Minimum hardware, Normal, 75% requested render scale,
minimum gel mode and a 512 pixel shadow cap. At a 1920 by 1080 viewport, the
pixel budget produces a **1280 by 720 drawing buffer**, effective DPR 0.667.
These are the required comparison settings, not native 1080p rendering.

| Measurement | Stock baseline | Diagnostic or settled comparison |
| --- | --- | --- |
| Level 2 initial Room 1, two approximately 35 second captures | 55.2–55.4 FPS; 1% low 7.7–8.1 FPS; worst interval 183.4–200 ms | Optional background preparation paused: 60.0 FPS; 1% low 58.1 FPS; worst interval 24.6 ms |
| Level 2 severe intervals above 150 ms | 5 and 3 per capture | 0 with optional preparation paused |
| Level 2 discarded active simulation time | 1.85% and 1.62% | 0% with optional preparation paused |
| Level 2 warmed Room 1 | 59.9 FPS; 1% low 49.1 FPS; worst interval 33.4 ms | Preparation complete at 12 of 12 configurations |
| Other sampled settled views | Approximately 59.8–60 FPS, including Level 3 Volt/transit and Level 2 chamber/sewer observations | Limited native routes; not a complete puzzle or combat playthrough |
| Initial navigation to control with early opening skip | Approximately 29.1 s | Title ready approximately 1.0 s; Start to control approximately 28.1 s |
| Level 1 lighting and presentation preparation | Approximately 26.0 s | Includes compilation, first-use priming and yields |
| Level 1 final-room staging | Four cold-program guard warnings; 139 to 143 retained programs | Later settled captures introduce no new live programs |
| Four restarts per level | Programs/geometries/textures stay at 143/630/76, 229/972/71 and 55/529/60 respectively | No growth in these counters within each level |

The controlled pause left mandatory startup preparation intact and retained
2 of 12 ready Level 2 configurations. Re-enabling optional preparation in a
fresh stock control reproduced the stalls. This identifies preparation as the
trigger; the exact driver/compositor synchronization mechanism remains open.

Local audit material is in
[`artifacts/lab-benchmark/report.html`](../../artifacts/lab-benchmark/report.html)
and [`results.json`](../../artifacts/lab-benchmark/results.json), with original
exports under `artifacts/performance-overhaul/`. These ignored local artifacts
must be preserved as issue/PR attachments with checksums before another machine
is used. The table above is the portable baseline, not an attachment substitute.

The project brief explicitly penalises lag under Gameplay and Experience
(25%) and Polish (10%), and requires acceptable lab frame rates and stable
memory across three levels. It supplies no numerical FPS requirement. Targets
below are engineering proposals for these changes; they do not approve or
replace [the existing proposed qualification budgets](../evidence/198/proposed-budgets.json).

## Shared requirements

- Preserve authored materials, lighting, shadows, gel modes, effects, camera
  behaviour, audio, controls, physics, simulation limits, colliders, hazards,
  persistent inactive bodies, checkpoints and level progression.
- Keep Minimum and Standard choices intact. Do not achieve a pass by reducing
  resolution, changing defaults, removing effects or choosing a software renderer.
- Preserve mandatory preparation before exposing a new configuration. A stable
  program count or completed `compileAsync` promise alone does not establish
  first-use readiness.
- Preserve renderer state across preparation and every asynchronous yield:
  viewport/scissor, render target, camera, light visibility, shadow policy,
  transmission scale and render-scope ownership. Hidden work must not flash onto
  the visible canvas.
- Keep cancellation, failure/retry, settings changes, restart and unload safe.
  Retired asynchronous work must not publish into a replacement runtime or queue;
  resources must retain their existing exact-once disposal owners.
- Keep instrumentation bounded and outside normal production gameplay. Preserve
  clean-build manifests, raw evidence and active simulation-time accounting.
- Retain the pinned Three.js/toolchain and existing renderer architecture. This
  work does not introduce a renderer fork, dependency upgrade, streaming system,
  shader-quality reduction or gameplay redesign.

## Priority 1 Smooth Level 2 preparation

### Required behaviour

From the first controllable Room 1 frame, movement and camera delivery must stay
smooth while later configurations become ready. Normal traversal, separated
Bob/Goop routes, backtracking and the lift-to-maintenance handoff must remain
correct. Deferring preparation must not merely move the same stalls to a doorway.

### Implementation requirements

1. Make preparation intent explicit: current configuration required for drawing,
   upcoming destination required for a handoff, or speculative future work.
   Inspect `CultivationPreparationQueue` and the call to `tick` at the end of
   `CultivationLevelRuntime.render`.
2. Add admission control for speculative compilation and first-use priming.
   Prefer existing loading or fully occluded preparation windows. Any work
   admitted during visible gameplay must demonstrate the frame budgets below.
   The existing 0.5–1.5 ms JavaScript slice is insufficient protection against
   asynchronous driver work; account for outstanding submissions and measured
   frame delivery, not just submission CPU time.
3. Preserve current-configuration readiness and startup entry/maintenance
   coverage. Required work must take priority over speculative work. A device
   without `KHR_parallel_shader_compile` must still reach every configuration
   without starvation or unsafe first draws.
4. Preserve and extend anticipation of the lift exit and any newly deferred
   doorway layouts. Use the ordinary preparation overlay and input lifecycle
   while genuinely required resources are unavailable. Record those waits as
   transition latency; do not silently drop them from end-to-end results.
5. Expose debug diagnostics for intent, admitted/deferred work, outstanding
   batches, readiness, compile submission/wait, primer time and destination waits.
   Keep histories bounded and preserve source/runtimes when attributing stalls.

Starting points: [CultivationPreparationQueue](../../src/render/CultivationPreparationQueue.ts),
[CultivationLevelRuntime](../../src/levels/CultivationLevelRuntime.ts),
[room workload ownership](room-workload.md).

### Acceptance targets

For each of three valid captures per route, at least 30 active seconds:

| Metric | Target |
| --- | --- |
| Average FPS | At least 59 |
| 1% low FPS | At least 45 |
| Frame interval p95 / p99 | At most 20 / 33.34 ms |
| Intervals above 100 ms | Zero |
| Discarded active simulation time | At most 0.1% |
| Browser, network, shader or WebGL errors | Zero |

Apply these targets to initial Room 1 immediately after input becomes available,
the same warmed room, the existing stable room samples and the chamber/sewer
observation workloads. An entry capture must not wait for all optional work to
finish before starting. Include moving Bob/Goop switching in Room 1 as a separate
native functional/performance check.

Measure native room crossings, backtracking and lift arrival separately with
matched baseline/candidate routes. Median destination-preparation delay must
not increase by more than 250 ms, and the worst must not increase by more than
500 ms. Level 2 and Level 3 request-to-enabled-input medians must not regress
by more than 10%; each local early-entry run must remain within 15 seconds.
Include Level 3's authored arrival in its time-to-input metric. Never rename
runtime-running time as time-to-control.

No candidate may pass solely because the queue was permanently stopped, input
was disabled, a loading overlay occupied capture time, or fewer native route
interactions were performed. A different bottleneck discovered on an unmeasured
combat/platform route must be reported separately with its own baseline.

## Priority 2 Reduce Level 1 startup

### Required behaviour

Reduce the wait before the player can control Bob while retaining the title,
opening presentation and all preparation coverage, including Priority 3 fixes.
An earlier title or Start button is not sufficient if the same wait moves later.

### Implementation requirements

1. Record navigation, title ready, Start, skip request, graphics preparation
   start/end, GPU readiness and first enabled-input live draw. Report navigation
   to control and Start to control independently. Record natural playback and
   its blocked preparation tail separately from the earliest-supported-skip route.
2. Attribute preparation wall time to configuration enumeration, construction,
   asynchronous compilation, synchronous first-use inspection, resource priming,
   retained-camera target allocation and scheduling yields. Identify overlap;
   do not add nested or concurrent phase totals as independent wall time.
3. Consolidate redundant material/light-layout permutations and duplicate binding
   or resource work only when signatures prove compatibility. Account for dark
   layouts, shadows, hidden/cross-room objects, instance attributes, camera fades,
   character death resources and per-camera transmission storage.
4. Preserve responsive painting between GPU jobs. Existing coverage/scheduling
   tests require yielding between jobs. A batching change must replace that
   policy with demonstrated bounded work and equivalent opening responsiveness;
   increasing batch size without evidence does not meet the requirement.
5. Retain generation checks around asynchronous work, safe retries, the final GPU
   completion fence, real gameplay viewport/resource preparation, and title-only
   resource disposal before arming the gameplay shader guard.

Starting points: [GreyboxLevelRuntime.runLightingPrewarm](../../src/levels/GreyboxLevelRuntime.ts),
[GraphicsPreparation](../../src/render/GraphicsPreparation.ts),
[main opening handoff](../../src/main.ts), and
[GameSessionCoordinator](../../src/levels/GameSessionCoordinator.ts).

### Acceptance targets

On the assessment machine, for three matched local captures using the earliest
supported opening skip, each run must reach control within **20 seconds of
navigation** and **19 seconds of Start**. This is a proposed approximately 31%
reduction from the measured 29.1 second navigation baseline. Report title-ready
time so it cannot conceal a relocated wait.

Maintain these limits after the complete shader-coverage fix, with Priority 1
enabled. No Level 1 cold program, first-use shader inspection or newly allocated
gameplay render-target storage may move into the covered live draws. Natural
opening playback must retain authored timing, readiness/skip behaviour and
visual continuity; measure its post-film preparation wait against baseline and
require no regression. Standard remains a correctness and relative-performance
regression case, not a claim that its unmeasured loading time meets the Minimum
profile's absolute target.

Measure explicit browser-cold and browser-warm pairs with HTTP caching enabled,
as described in the lab guide. The earlier module-routed captures disable HTTP
caching and are diagnostic references, not cold/warm pairs. Reproduce the old
route on both revisions as a continuity check before claiming a speedup.

## Priority 3 Complete Level 1 shader warmup

### Required behaviour

After the actual opening handoff and warm boundary, ordinary Level 1 traversal
must expose no unprepared shader programs or first-use bindings/storage in the
covered views. Resolve the four final-room staging warnings and establish
whether they also occur on the natural route.

### Implementation requirements

1. Attribute every growth event to the live runtime, actual draw/pass, material,
   program signature, geometry features, light/shadow layout and camera/fade
   state. Reproduce final-room staging and the natural doorway/return route.
   Check title/cinematic cleanup, cache eviction and other-level preparation
   before treating a total renderer program-count change as proof of a cold draw.
2. Extend the existing bounded preparation sources/configurations only for
   demonstrated missing variants. Preserve prepared-program reuse when the
   complete material, lighting, shadow and geometry signature is compatible.
3. Keep `PerformanceFlightRecorder` warnings meaningful. Do not fix the symptom
   by raising the baseline to 143, re-arming after cold draws, suppressing logs,
   disabling shader checks or declaring debug routes exempt. Correct a confirmed
   attribution error with a regression that still catches real cold live draws.
4. Verify actual WebGL program creation and first-use inspection in addition to
   retained program totals: disposal can mask growth. Verify buffer/instance
   bindings and first live-camera render-target storage at the relevant boundary.
5. Cover Bob/Goop presentation, cross-room surfaces, camera reversal and fade,
   shadows, the final-room reveal, death/retry and restart. Graphics changes may
   establish a new warm boundary only after their normal mandatory preparation;
   the following live draws must then be stable.

Starting points: `LIGHTING_PREWARM_CROSS_ROOM_RENDERABLE_NAMES` and the room
compile/prime helpers in [GreyboxLevelRuntime](../../src/levels/GreyboxLevelRuntime.ts),
plus the guard in [PerformanceFlightRecorder](../../src/debug/PerformanceFlightRecorder.ts).

### Acceptance targets

- Three independent runs of the final-room staging route and natural traversal
  produce zero correctly attributed cold-program events after readiness.
- Covered live draws create zero new programs and perform no deferred first-use
  shader inspections or initial gameplay render-target storage allocation.
  Recreating a missing program while another is disposed is still a failure.
- Minimum and Standard both pass correctness checks, including early skip,
  natural opening, graphics setting changes, camera fades and shadow/transmission
  state restoration. Distinguish expected preparation work from subsequent draws.
- Priority 2's final startup target and Priority 1's applicable frame budgets
  still pass. Adding indiscriminate warmup for every possible object combination
  is not an acceptable coverage fix.

## Validation and resource stability

Implement the hardware replay/export work before judging a candidate. Promote
the useful local harness options into a maintained tool or preserve a versioned
runner with the evidence. Diagnostic overrides must be named in metadata and
excluded from production acceptance captures. Record the exact source SHA,
clean build manifest, asset and runner hashes, browser/backend, applied settings,
viewport/buffer dimensions, cache protocol and power conditions.

| Coverage | Required verification |
| --- | --- |
| Preparation scheduling | Extend `CultivationPresentationPreparation.test.ts` for intent/priority, bounded submissions, no starvation without parallel compilation, superseded work and disposal |
| Startup and handoff | Extend `ContainmentPrewarmScheduling.test.ts`, `ProgramBindingPrewarm.test.ts`, `MeasuredFirstUseGeometryPrime.test.ts` and `OpeningPreparation.spec.ts` for retained coverage, responsiveness and real first-use readiness |
| Shader coverage | Extend `LevelOneShaderProgramStability.spec.ts` and recorder tests with the missing route/signature, attribution controls and real program/inspection probes |
| Settings and ownership | Run `ShaderPreparationSettings.spec.ts`, `GraphicsProfiles.spec.ts`, relevant lifecycle tests and production parity journeys |
| Native gameplay | Verify the seven routes in the lab guide, including both bodies moving, Volt electrical interaction, powered lift travel and active Room 2 combat; include hazard death/retry, pause/resume, restart and backtracking |

Run Node 24 with the locked dependencies: `npm run type-check`, `npm test`,
`npm run build`, `npm run validate:production`, the relevant browser cases,
`npm run test:smoke` and `npm run test:integration`. Regenerate/check assets only
if authoring inputs change. Software-rendered CI verifies behaviour; acceptance
FPS/GPU measurements require the real assessment GPU. Run captures sequentially
without overlapping builds, tests, traces or video encoding.

For pacing comparisons, collect three valid repetitions of at least 30 active
seconds for each specified route. Keep the first controllable entry intervals,
full raw frame coverage, native input, body/camera movement, active draw and
focus/visibility. Preserve rejected death, cutscene, loading or focus-contaminated
captures with reasons and repeat them; do not crop the slow frames into a pass.
Use the maintained analyser's FPS, quantile, 1% low and simulation-loss formulas.
Retain pending/unsupported GPU results as such and report disjoint events.

After scenario warmup, perform four ordinary pause-menu restarts per level and
sample each after at least five seconds of resumed input and two seconds of
stable counters. Programs, geometries and textures must show **zero growth**
between comparable settled samples. Compare the same level, pose and settings;
Level 2 legitimately owns more resources than Level 1. Repeat the full
Level 1 to Level 2 to Level 3 lifecycle three times, including unloading and
recreating levels, and demonstrate the same settled resource plateau. Any new
bounded cache must document its finite ownership and warmup limit.

Observe heap over those cycles and investigate sustained retained growth.
Heap fluctuations and renderer object counts are not GPU allocation bytes or
a proof of no leaks. Keep forced-GC memory diagnostics separate from gameplay
timing captures. Preserve exact-once disposal, stale-generation cancellation
and settings-replacement tests even when the counters appear stable.

## Delivery order and completion

1. Preserve the baseline evidence and implement reproducible capture/attribution.
2. Deliver Priority 1 with native doorway and lift checks.
3. Resolve Priority 3's missing coverage before finalising Priority 2 reductions,
   so startup optimisation is judged against the complete readiness contract.
4. Deliver Priority 2 and run combined hardware, visual and lifecycle validation.

Use small linked implementation issues and PRs. Each PR must state its concrete
change, source revision, tests actually run, raw before/after evidence, visual
parity checks and loading/pacing/resource trade-offs. Keep actual results separate
from targets. A failed target remains open; do not lower quality, revise a budget
silently, or mark work complete based solely on a software CI run.

Close the parent work only after all three changes and final validation are
reviewed, the measured targets pass, the raw evidence is durably accessible,
and the existing project review/merge requirements are satisfied. Full assessment
qualification remains governed by the versioned budgets and
[lab guide](../evidence/198/LAB-GUIDE.md).
