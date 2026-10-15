# Beta gameplay smoothness — 15 October 2026

Baseline: origin/main b00978e (merged PR #185), on fix/beta-gameplay-smoothness. No renderer fork, dependency patch, gameplay change or shader rewrite. Normal graphics remains the default. All changes and evidence are local; no push or PR.

## Demo settings

Use the production build with ?debug=1, then Settings → Graphics preset → Performance and Render resolution → 0.75×. Keep the same browser window size throughout the demonstration. At the measured 1536 × 730 viewport this produces a 1152 × 547 drawing buffer, effective DPR 0.75, and transmissionResolutionScale 0.5. The DOM interface stays at native resolution. Performance by itself caps resolution at 1×; the lower 0.75× choice is explicit and optional. Normal remembers the selected resolution and restores full transmission detail. Selecting a resolution explicitly changes that session preference.

**Detailed Level 2 is still gated by ?debug=1 in this baseline.** A plain production URL uses the Cultivation foundation scene. The beta route must include the query parameter; this pass does not change content gating. The debug route also exposes diagnostic UI/shortcuts. Allow mandatory preparation to finish behind the loading screen before demonstrating movement; no warmup was removed or deferred into play.

The 0.75× image is softer, especially thin geometry and refracted detail. Lighting, PCF shadows, materials, transmission amount, navigation light, gameplay cues and HUD resolution are retained. Room 5 remains substantially slower than the other levels. These measurements do not establish sustained 60 FPS.

## Confirmed causes and scoped fixes

- GPU work dominates the Normal captures: roughly 40 ms in L1, 149–165 ms in Room 5, and 42 ms in L3. The renderer still renders opaque surroundings for transmission and for presentation. The supported transmissionResolutionScale property reduces the first workload without changing Three.js internals. Downscaling the canvas additionally reduces final presentation and character fragment work.
- Long gaps trigger the existing 100 ms / six-step catch-up limit. Normal Room 5 loses 16.8–19.5 seconds of simulation time in roughly 26–28 seconds of capture. The accepted final Performance 0.75× run loses 0 ms for Bob and 249.8 ms for Goop. The improvement is actual admitted simulation time and frame delivery; Loop, its clocks and physics are unchanged.
- Normal has bursts of short intervals followed by long GPU-bound gaps. Its median interval alone conceals the freezes. The p95/p99, 1% lows and discarded time are more informative here.
- CameraRig and all character placement anchors use the same previous/current body interpolation. Instrumented gameplay found maximum target/anchor errors around 3.2e-14 metres; the separate 34-frame active-Volt check was below 5e-16 metres. Body/camera motion and complete recorder coverage were required. No defect in running interpolation was established, so active camera smoothing, physics interpolation and Loop remain unchanged. A later strict pause regression did establish a separate defect: the browser keeps changing alpha while the runtime is stopped, so frozen previous/current poses oscillate. A deterministic session test reproduced fractions 0.1/0.9 instead of the last displayed 0.6; the browser also caught a paused blink changing 0.6530→0.6517. The session now holds the last rendered fraction only while stopped and resets it for a new runtime. Running frames still receive the original fraction unchanged. This fixes paused presentation, not the measured GPU bottleneck.
- Hidden, locked Volt still called its ceiling-clearance presentation during fixed updates. A separate frozen-loop observation measured 24 calls costing 11.5 ms out of 134.2 ms of real fixed updates, about 9%. Explicitly hidden Volt now skips those nine-ray clearance probes. Animation and presentation state still advance, and the first visible pose queries the current ceiling before drawing. A real-GLB regression checks hidden queries, continuing animation and immediate ceiling compression on reveal. This is a modest CPU saving, not the explanation for the large GPU gain.
- CPU work remains significant in Level 2. Recorded fixed updates cost approximately 6.2–6.6 ms per step in the compared Room 5 sequences; more admitted simulation time can increase update time per rendered frame. No collision, puzzle, movement or input code was changed to make the numbers look better.

Two further browser regressions caught issues that simple FPS capture would miss:

- Performance's fractional transmission scale made the existing 1×1 isolated primers request a sub-pixel transmission framebuffer, producing GL_INVALID_FRAMEBUFFER_OPERATION (1286). Isolated preparation now temporarily uses scale 1 and restores the selected scale synchronously, including before asynchronous compile settlement and on errors. At DPR 0.75 the primer also needs a two-unit logical viewport: r185 rounds in setViewport but floors while restoring the target after shadow rendering, otherwise its one-unit viewport becomes zero physical pixels. The minimum span now survives both operations and stays offscreen. Gameplay still uses scale 0.5. This preserves valid warmup work rather than getting an apparent loading benefit from failed primer draws.
- The first Volt death removed his point light from the render list and added 25 shader programs (82→107). The light now retains its warmed slot with intensity zero during death; specimen mode still replaces that slot as before. Living colour/intensity, shadows and materials are unchanged. The checked death/retry/merge/split/restart sequence retains 82 programs. Normal and Performance fixed-scene controls compare zero-radiance rendering against the original removed-light signature; acceptance additionally requires meaningful pixels and zero GL errors.

Intermediate UI/0.75× captures precede the primer correction and did not check GL flags. They remain genuine archived recordings, but are not accepted as final preset/warmup validation. Final-build captures use the corrected primer path and explicit end-of-capture GL checks. The pre-code bracketed 1× and fixed-view transmission experiments are diagnostic evidence, not substitutes for that final validation.

## Public transmission-scale experiment

Same fixed Room 5 view, Intel UHD 620, full 1920 × 912 canvas; 16 non-overlapping hardware GPU queries per setting. Allocation/first draws and readback were outside the timed samples. Four-sample HDR half-float linear transmission targets were observed through the public target-setting boundary. No program changes occurred (207 programs throughout the first experiment).

| Transmission scale | Observed target | Median GPU ms | Full-frame difference from scale 1 |
|---|---:|---:|---|
| 1.0 | 1920 × 912 | 134.46 | Reference |
| 0.75 | 1440 × 684 | 116.25 | 3,905 / 1,751,040 pixels; max 1/255 |
| 0.5 | 960 × 456 | 91.32 | 8,208 / 1,751,040 pixels; max 2/255 |
| 1.0 restored | 1920 × 912 | 135.85 | Exact match, zero changed pixels |

A repeated fixed view gave 133.43 / 114.43 / 93.46 / 140.36 ms. These are fixed-view costs, not gameplay FPS. Half scale has a measurable visual difference, so it is restricted to the opt-in Performance preset. A permanent quality reduction in Normal, material replacement, framebuffer reuse and changes to private renderer passes were not implemented.

The alternating Normal / Performance-1× / Normal gameplay experiment independently showed L1 17.0 / 35.6 / 19.6 FPS, Room 5 Bob 6.44 / 14.15 / 6.54 FPS and Goop 5.74 / 11.77 / 5.91 FPS. Counts stayed at 99 or 208 respectively, with no new programs in live draws. This established a gain while bracketing drift. The explicit 0.75× diagnostic then improved Room 5 further and was exposed as a user choice.

## Genuine gameplay measurements

Production files, Edge 155, ANGLE Intel UHD Graphics 620 D3D11, headed foreground browser, viewport 1536 × 730 and device DPR 1.25. No software renderer. Normal uses a 1920 × 912 buffer / effective DPR 1.25; Performance 0.75× uses 1152 × 547 / effective DPR 0.75. The final maintained-harness repeat reports actual transmission scale 0.5 for every capture. Hardware identity and buffer/DPR values are retained in the original recorder exports.

The table compares beta-baseline-complete against beta-final-validated, captured after all source corrections. Each sequence uses real keyboard movement, jumping and pointer camera input near a staged room spawn. Loading, room preparation overlays, death and cutscene frames are excluded. Inputs and staging are matched; trajectories can differ because Normal discards so much simulation time. These are bounded interactive sequences, including the tight Room 5 entrance camera, not a complete manual puzzle playthrough or a claim about every camera view. Every accepted row has full raw frame coverage and all harness frames were visible/focused. Values come from deduplicated original Flight Recorder frame rows, not the extra harness/export frames. GPU disjoint counts are zero; pending queries at stop remain pending. The accepted final run has no console errors and GL error zero after each capture.

| Scene | Mode | Frames / seconds | FPS / 1% low | Frame p50 / p95 / p99 ms | GPU mean / median ms | CPU update / render ms |
|---|---|---:|---:|---:|---:|---:|
| L1 R1 Bob | Normal | 476 / 22.36 | 21.29 / 4.61 | 16.70 / 150.00 / 200.00 | 40.26 / 38.70 | 0.91 / 13.39 |
| L1 R1 Bob | Performance 0.75× | 1110 / 23.43 | 47.38 / 24.63 | 16.70 / 33.40 / 33.50 | 15.08 / 14.91 | 0.64 / 17.15 |
| L2 R5 Bob | Normal | 166 / 25.81 | 6.43 / 1.48 | 49.90 / 566.40 / 633.20 | 148.72 / 143.99 | 21.65 / 12.83 |
| L2 R5 Bob | Performance 0.75× | 512 / 23.11 | 22.15 / 13.32 | 49.90 / 66.60 / 66.80 | 39.82 / 38.53 | 16.46 / 10.40 |
| L2 R5 Goop | Normal | 159 / 27.79 | 5.72 / 1.46 | 49.90 / 633.20 / 683.30 | 165.23 / 163.08 | 19.50 / 10.93 |
| L2 R5 Goop | Performance 0.75× | 384 / 23.94 | 16.04 / 6.49 | 66.60 / 83.40 / 116.70 | 55.27 / 54.71 | 18.44 / 19.94 |
| L3 R1 Bob | Normal | 468 / 22.86 | 20.47 / 14.92 | 50.00 / 66.60 / 66.70 | 42.16 / 43.09 | 1.66 / 9.43 |
| L3 R1 Bob | Performance 0.75× | 956 / 22.31 | 42.85 / 27.14 | 16.80 / 33.40 / 33.50 | 16.96 / 17.07 | 0.99 / 8.47 |

| Scene | Mode | >50 / >100 / >150 ms | Dropped simulation ms | GPU valid / pending | Programs |
|---|---|---:|---:|---:|---:|
| L1 R1 Bob | Normal | 119 / 104 / 17 | 4032.20 | 470 / 6 | 99 |
| L1 R1 Bob | Performance 0.75× | 1 / 0 / 0 | 0.00 | 1102 / 8 | 99 |
| L2 R5 Bob | Normal | 61 / 43 / 43 | 16778.90 | 160 / 6 | 207 |
| L2 R5 Bob | Performance 0.75× | 117 / 0 / 0 | 0.00 | 505 / 7 | 207 |
| L2 R5 Goop | Normal | 54 / 43 / 43 | 19495.10 | 154 / 5 | 207 |
| L2 R5 Goop | Performance 0.75× | 264 / 8 / 2 | 249.80 | 380 / 4 | 207 |
| L3 R1 Bob | Normal | 125 / 0 / 0 | 0.00 | 464 / 4 | 81 |
| L3 R1 Bob | Performance 0.75× | 1 / 0 / 0 | 0.00 | 951 / 5 | 83 |

CPU and GPU work overlap; their durations are not additive frame budgets. FPS = frames divided by the sum of recorded intervals. The 1% low is 1000 divided by the mean of the slowest ceil(1% × frame count) intervals. Percentiles use sorted raw intervals at floor(N × percentile). Threshold counts are strictly greater than the threshold. More frames above 50 ms can coexist with far fewer long freezes because Performance presents many more frames; Room 5 is still below a smooth 30 FPS target.

Earlier intermediate builds measured L1 53–56, Room 5 Bob 21–22, Goop 17–18 and L3 42–49 FPS. Those captures predate the primer, pause and Volt-death corrections and do not establish final-build ranges. The local interpolation harness briefly moves Volt before selecting Bob in L3, changing his navigation-light position; the maintained captures do not. The shader cache contained 207 or 208 Level 2 programs depending on preparation reached before capture; the pre-code alternating Normal captures already reached 208. The final L3 capture has 83 warmed programs versus 81 in the baseline; no new programs appear in its live draws. The finite-light shader implementation is unchanged. The separate full Volt lifecycle test stays at its own 82-program warmed count through death/retry/merge/split/restart.

The first corrected-build attempt, beta-final-verified, lost its WebGL context in Room 5 (37442 / CONTEXT_LOST_WEBGL). That run is rejected, including its otherwise completed Level 1 measurement. A single fresh-browser retry, beta-final-validated above, completed all levels with GL error zero. The cause of the first reset is unresolved; no software renderer, GL-error suppression or system-settings change was used to obtain the retry. These short checks do not establish long-session driver stability. This remains a beta reliability risk.

## Remaining preparation and loading limits

A separate intermediate Level 2 Room 1 Goop sample includes optional background preparation: 1,089 frames / 24.94 seconds, 43.66 FPS, GPU mean 15.34 ms, p95/p99 intervals 49.9/66.7 ms. Cached programs grow 210 → 244 while background compilation proceeds; active world draws create zero new programs. It includes one interval above 100 ms and none above 150 ms. Render CPU reaches 82.9 ms. The two newly appended queue slow steps are compile submissions of 35.7 and 22.3 ms; cumulative startup slow-step entries must not be mislabeled as gameplay stalls. This short sample does not exhaust the optional preparation queue.

The earlier lazy-driver program-inspection stalls remain documented in level2-startup-regression.md. This pass does not disable shader error inspection, remove primers, shift mandatory work into play, or claim to eliminate every driver stall. No 260–359 ms primer stall was reproduced in the short intermediate Room 1 sequence. Geometry/resource preparation also remains visible in Room 5. The intermediate repeat grows from 561→562 geometries for Bob and 562→563 for Goop; the first intermediate Goop run grows 562→1,017 as existing background work advances. In that first run, sequence 355 spends 160.8 ms in CPU rendering while adding 28 geometries and zero programs; the following interval reaches 199.9 ms. This is direct new evidence that program stability alone does not mean resource preparation is stall-free. In the intermediate repeat, a 117.9 ms render-CPU spike occurs with no geometry or program increase in that frame, so geometry uploads do not explain every stall. Texture counts stay at 88 in these Room 5 captures. No preparation scheduling or ownership was changed; mandatory work remains behind loading. Faster rendering lets existing optional preparation advance farther, and the new settings do not eliminate its stalls.

The accepted final Goop capture confirms this remaining issue: geometries grow 562→1,200, programs remain 207 and textures remain 88. Render CPU reaches 162.6 ms at sequence 101 while geometry preparation is advancing; a separate 103.6 ms render-CPU sample occurs at sequence 71 before the geometry count increases. Two intervals exceed 150 ms and discarded simulation totals 249.8 ms. The queue budget cannot preempt an individual blocking WebGL/driver call. The safe preset improves rendering throughput but does not solve this resource-preparation bottleneck.

Matched Normal controls use the same production viewport/DPR and fresh Edge contexts, in baseline/candidate then candidate/baseline order. The first pair predates the final primer correctness fixes; at Normal DPR 1.25 and transmission scale 1 the primer viewport and transmission scale are unchanged by those fixes. The reverse pair uses the final corrected build.

| Order / build | L1 title ready s | L2 entry s | L2 compile calls total s | L2 synchronous compile submission s |
|---|---:|---:|---:|---:|
| Forward baseline | 32.94 | 75.18 | 67.38 | 0.44 |
| Forward candidate | 30.21 | 77.90 | 70.33 | 0.54 |
| Reverse candidate | 33.94 | 83.09 | 75.36 | 0.59 |
| Reverse baseline | 30.13 | 80.96 | 73.38 | 1.14 |

Compile totals include asynchronous waits and are not pure CPU execution. Candidate Level 2 entry is +2.72 s and +2.13 s in these pairs; most of the difference is in asynchronous compile completion. A zero-loading-regression claim is **not established**. GLSL captured at the actual WebGL shaderSource/linkProgram boundary in the reverse controls is byte-identical as a multiset: 103 Level 1 link submissions (99 cached programs) and 207 Level 2 submissions/cached programs in each build, with identical cache-key sets. Both reverse runs report GL error zero after each level's preparation and no console errors. Identical sources exclude increased shader source complexity in these controls, but do not explain the wait difference or establish equal driver cost. More repetitions would be required to attribute this small loading difference to runtime behavior versus driver/run variability.

The earliest fresh baseline reached the title in 28.55 s and the first candidate in 26.09 s; later controls are above that original 27–29 s range. Level 1's validated warmup reduction and 99-program shader set are retained in source and in the captured GLSL, but 27–29 s is not guaranteed on every repeat. The accepted final Performance run takes 81.07 s to enter Level 2. Allow this loading time for the beta. No mandatory warmup was removed to improve that result. Original control logs, complete shader sources/hashes and comparison output are stored under artifacts/performance-overhaul/beta-startup-* and artifacts/beta/startup-comparison.txt.

## Validation

- Type-check and the final production build pass. The existing Vite large-chunk advisory remains; no dependency or lockfile changed.
- Targeted unit groups pass: 31 settings/resolution/Volt presentation checks; 127 affected movement, lighting, physics, acid, drone and electrical regressions; 38 checks after the final low-DPR primer correction, including isolation restoration on success/failure and asynchronous compilation; and 21 final session/loop/lifecycle checks. These groups overlap and are not a unique combined test count.
- The broad hardware browser suite passed 16 tests and exposed a Volt harness bug: two rapid Tab taps were coalesced within one fixed input step. The test now waits for each ownership transition. Subsequent strict runs exposed and verified the paused-pose, cold death shader and fractional-primer defects described above. The final complete Volt test passes with GL error zero through controls, drone mounting/dismounting, low vent collision, death/retry, merge/split, restart, preparation failure/retry and late cancellation. Death-light pixel controls are meaningful and exactly equal in Normal and Performance; the warmed count stays 82.
- Hardware browser checks cover Level 1 Bob/Goop movement, jumping, sticky-wall climbing/detachment, acid/damage feedback and camera motion; Level 2 fade/appearance and background-light/shadow preservation; Level 3 Bob/Volt controls and presentation. Graphics UI tests pass on both plain production and debug URLs, including Normal restoration, preset switching, 0.75× and resize. These are targeted staged journeys, not a complete unassisted puzzle playthrough.
- The final performance run has four genuine 22–24 second recorder sequences with full raw coverage, body/camera motion, focused/visible frames, zero disjoint queries, zero live shader growth and zero end-of-capture GL errors. The earlier context-loss attempt remains rejected.
- The final Performance 0.75× background-isolation rerun passes: 40 compile submissions and two primers, maximum pixel difference zero, no active lighting/shadow state changes, no new programs from active world draws, and no GL errors. Production asset validation passes for 83 files.

- Nested-path hardware smoke passes both journeys: plain production title/credits/start/restart, and Performance 0.75× debug progression through Cultivation and Blackout with a restart in each. No console errors, asset 404s or requests escaping the nested deployment directory occur. The first invocation failed before launching a browser because the local imported test configuration resolved its server command relative to artifacts/beta; the corrected local configuration sets the repository working directory. Both logs are retained.
- Startup forward/reverse controls complete without console errors; final reverse controls also check GL error zero and actual submitted shader sources. The measured +2.1–2.7 s Level 2 difference and repeated Level 1 timing variability remain limitations, not waived checks.
- No full puzzle completion or long-duration stability soak was performed. No push or PR creation/update was performed. Source changes are confined to the opt-in preset, valid isolated warmups, paused presentation, hidden-Volt ceiling queries and death-light shader stability; physics, puzzle logic, Loop, CameraRig, finite-light shaders, dependencies and resource owners remain intact.

## Local evidence and reproduction

Artifact root: C:/Users/Latitude 5590/Documents/Specimen/artifacts/.

- beta/results.json: per-recording metrics, actual dimensions/DPR, hardware, GPU availability, frame coverage, hitches and discarded simulation time. beta/scale-summary.json and beta/bob-scale-summary.json contain fixed-view samples and pixel differences; PNG views are adjacent.
- performance-overhaul/beta-baseline-complete/: original Normal recordings, raw.json, screenshots and asset hashes.
- performance-overhaul/beta-paired/: pre-code alternating Normal/Performance-1×/Normal recordings and interpolation telemetry.
- performance-overhaul/beta-final-validated/: accepted final-build original recordings, raw.json, screenshots and asset hashes; beta-final-verified/ preserves the rejected context-loss attempt.
- performance-overhaul/beta-ui-1x-and-075/: first UI preset validation and lower-resolution diagnostic recordings. The diagnostic overrides were never silently applied to Normal.
- performance-overhaul/beta-demo-final/ and beta-demo-repeat/: intermediate source recordings before the final correctness fixes. The repeat uses the maintained script below, including the additional background-preparation sample. These do not validate the final warmup path.
- beta/: hardware/browser/unit logs, startup-control logs, validation-status.json and final review diff. Original recorder JSON files are not summarized in place or rewritten.
- The early beta-baseline Room 3 attempt entered death/game-over and was rejected by the capture validator; it is not used in these results.

Reproduce the controlled beta route from a production build in PowerShell. Run the profiler before the summarizer; do not run simultaneous GPU workloads:

~~~powershell
npm run build
$env:PROFILE_LABEL='beta-review'
$env:PROFILE_SCOPE='beta'
$env:PROFILE_PRESET='performance'
$env:PROFILE_RESOLUTION_CAP='0.75'
$env:PROFILE_WIDTH='1536'
$env:PROFILE_HEIGHT='730'
$env:PROFILE_DPR='1.25'
$env:PROFILE_HEADLESS='0'
$env:PROFILE_RUNS='1'
$env:PROFILE_KEY_MS='5000'
$env:PROFILE_RECORDER='1'
node scripts/profile-performance.mjs
node scripts/summarize-performance.mjs beta-review
~~~

PROFILE_EXTRA_ROOM_ONE=1 adds the separate background-preparation sample. For Normal use PROFILE_PRESET=normal and PROFILE_RESOLUTION_CAP=2. Optional PROFILE_TRANSMISSION_SCALE=1, 0.75 or 0.5 is a diagnostic public-API override, with a settling interval before capture; leave it unset for shipped-preset validation. Actual scale is written beside each room in raw.json. The original recorder export schema is unchanged. The archived fixed-view experiment harnesses under beta/ are local diagnostic artifacts, not shipped game code.
