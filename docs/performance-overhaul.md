# Performance overhaul — final pass for PR #185

For the opt-in graphics presets and latest-main Intel UHD 620 gameplay measurements, see [the beta smoothness report](beta-gameplay-smoothness.md). The historical measurements below use their original build and graphics settings.

**Latest retained state:** see [Level 2 startup regression resolution](level2-startup-regression.md). The Level 2 early-zero opt-in from the later investigation is reverted; Level 1 startup and Level 3 shader improvements remain. Level 2 gameplay rows in this older report were subsequently found to contain stationary body positions and must not be used as interactive gameplay evidence. The current report uses newly validated moving recordings and reports the loading/GPU trade-off explicitly.

The subsequent Level 2 investigation, retained zero-radiance change, new hardware captures and architectural review boundary are documented in [Level 2 performance investigation](level2-performance-investigation.md). The tables below preserve the earlier reviewed delivery. Subsequent raw position/state checks exposed death-contaminated and stationary room captures in that earlier protocol; those FPS tables must not be treated as verified continuous gameplay. Frozen shader/pixel comparisons remain valid. See the linked report for corrected capture validation and new evidence.

This pass starts from PR #185 head `40de099` on the existing `codex/performance-overhaul` branch. Nothing was pushed and the PR was not updated.

**Retained result:** Level 3's finite-light shading now reuses the tested guard already used in Levels 1/2. In the matched gameplay recordings, Room 1 average GPU time fell **44.66 → 20.83 ms** and Room 2 **37.91 → 19.74 ms**, with 81 programs throughout. A separate frozen-pose comparison produced identical pixels.

**This is not an all-level performance fix or an unconditional merge recommendation.** Level 1 startup remains under the previously achieved approximately 29 seconds, but no additional Level 1 gameplay improvement was established. Authored Level 2 still takes about a minute to load and still has severe stalls. Its unsuccessful optimization candidates were removed.

## Measurement reliability and scope

- Production builds at `?debug=1`, hardware Edge 155 through ANGLE D3D11 on Intel UHD Graphics 620. Every exported recording confirms a 1536×730 viewport, 1920×912 drawing buffer, effective DPR 1.25, and resolution tier 2. No software renderer or quality reduction was used.
- The owned browser is headed, brought to the front, and launched with native-window occlusion and background timer/render throttling disabled. All sampled harness frames report `visibilityState=visible` and `hasFocus()=true`. No game-side animation clock or visibility policy was overridden.
- This recovered normal hardware frame delivery rather than the previous near-exact 1,016 ms automated cadence. The exact cause inside that earlier Chrome/extension session was not isolated; its FPS remains excluded. The current baseline's 38.7 ms Level 1 GPU average also agrees reasonably with the earlier manual approximately 40.1 ms result. Occlusion/throttling is a supported explanation, not a proven sole cause.
- Each room is staged through existing debug controls, settles for one second, then receives W/D/S/A for five seconds each, a jump, and mouse movement. Input and camera/body motion are genuine. Every measured harness frame performed a live draw. Loading/transition screens are excluded. These are representative room sequences, **not a complete native puzzle/combat/lift playthrough**.
- Final tables use the unmodified flight-recorder exports for both builds. Every recording retains all frame sequences in its deduplicated hitch windows, so the quantiles cover the whole recording rather than just a selected hitch subset. Post-stop export frames in the supplementary harness are excluded from the final table. This same calculation is applied to before and after.
- FPS is 1000 divided by the recorder's average frame interval. Quantiles use sorted index floor(N×p), capped to N−1; the 1% low is 1000 divided by the mean of the slowest ceil(1%×N) intervals. Strict hitch thresholds use exported frame intervals. Durations below are sums of recorded frame intervals, not `session.durationMs`, which includes stopped time before export.
- GPU means use all completed valid timer queries; medians use the corresponding raw rows. Missing pending results are not invented. GPU timing is supported in all files, with zero disjoint events. Timer scope includes the runtime's render/preparation commands and submission gaps, not an isolated raster pass. Recorder self-overhead was approximately 0.08–0.18 ms/frame; that does not measure every possible observer/driver side effect.
- One fresh browser profile was used per full run. Driver shader caches, temperature and power state were not controlled. Single runs and short tails cannot establish small performance differences. Before and after use the same viewport, DPR, backend, inputs and instrumentation. Some Level 1 final samples are slower despite no Level 1 rendering changes; no Level 1 gameplay gain is claimed.

## Root causes and decisions

### Level 1

The earlier pass reduced light-layout permutations from 306 to 99 programs and navigation-to-control from 60.4 to 29.3 seconds. Its loading breakdown was dominated by compilation: 53.79 → 21.28 seconds of compile waits within 58.12 → 25.88 seconds of preparation. Those changes remain intact.

Current gameplay still exceeds this GPU's budget at DPR 1.25, with approximately 26–43 ms GPU means in the final sampled views and large cadence spikes. Programs remain at 99, with no cold programs during sampled live draws. Physics is much smaller than GPU cost in the ordinary views. Source inspection and movement/climbing regressions did not reproduce an interpolation defect; the existing interpolated camera/body contract is preserved. GPU saturation/driver frame delivery is supported by the measurements, but the precise compositor/submission cause of every cadence spike was not isolated. This pass does not claim to fix Level 1 jitter.

### Level 2

Entry is dominated by mandatory preparation, particularly maintenance-sector shader preparation, rather than module import or texture decoding. The final run spends 58.69 seconds in presentation preparation: approximately 6.81 seconds for the entry configuration and another 51.77 seconds in mandatory startup work. Runtime resource construction is 4.26 seconds. Module loading, Bob/Goop asset preparation, collision construction and individual shadow/upload costs were not all separately timed; overlapping asynchronous totals must not be added as wall time.

The render-stall investigation found preparation-primer calls taking 260–303 ms in the baseline, and up to 359 ms in the final run. Their program-count delta was zero. The runtime CPU render interval includes the queue's tail work after the live scene draw: these are first-use preparation/driver stalls even when no new program object is created. The exact blocking GL operation and split between driver initialization, binding/upload work and GPU backpressure remain unresolved. Skipping necessary warmups would move those stalls to first gameplay use and was not retained.

Room 5 is independently GPU-bound: approximately 134 ms average in the final gameplay sample. A frozen-pose experiment measured 142.34 ms with current shading, 149.44 ms with cached shadows, and 66.17 ms with the visible gels removed while shadows remained cached. The shadow comparison shows no meaningful reduction at that pose. The gel diagnostic includes character shading, the transmission-related opaque pass and some character work; it is not a pure transmission-pass timer and was never shipped. Both room surface lighting and the character/transmission path require further work.

The newly corrected dropped-time counter reports **16.25 seconds discarded across 24.43 seconds** of Room 5 frame intervals. Long gaps hit the existing 100 ms/six-step limits, so simulation advances more slowly than wall time even when per-step physics is relatively cheap. That explains part of the perceived movement lag. The safety limits and simulation behavior were preserved.

The outstanding lighting/shadow regression check now interleaves 39 compilation batches and two primers with frozen live draws. It checks pixels, GL errors, actual live-draw program growth, global shadow settings, and live light/map identities after temporary target cleanup. The prior prototype counter incorrectly included queue submissions at the end of `runtime.render`; it was corrected to bracket actual live draws. No extra lighting-state refresh was necessary or retained.

### Level 3

Its persistent light layout includes distant and unpowered fixtures, but ordinary shaders previously evaluated direct-light BRDF work even where Three's own finite-light test reported no contribution. `BlackoutLevelRuntime.preparePresentation()` now applies the existing `optimizeFiniteLightEvaluation(material, true)` before warming all material forms. Real light values, attenuation, shadow samplers, physical transmission, texture maps, geometry and existing shader hooks remain intact. The existing helper is idempotent and preserves inherited hooks/cache keys.

The clean frozen-pose comparison measured **46.62 ms guarded versus 80.76 ms stock median GPU time**, with zero changed pixel channels, zero GL errors and 12 valid queries per mode. Cached-shadow measurements were 45.34/77.70 ms respectively; without gels, 21.03/35.36 ms. Shadows are a small part of that pose's cost; skipping zero-contribution lighting work is the verified retained improvement. Frozen rendering does not establish continuous gameplay pacing; the separate moving gameplay recordings below do.

## Before/after gameplay

Before is `40de099`; after is the final retained game implementation (`280e5c1` plus diagnostic correction `908ca22`). All arrows are before → after. Times are milliseconds.

| Room | Frames / seconds (before → after) | Mean FPS | Frame p50 | p95 | p99 | 1% low FPS | >50 / >100 / >150 ms |
|---|---|---:|---:|---:|---:|---:|---|
| L1/R1 | 477 / 21.7 → 444 / 21.9 | 22.0 → 20.2 | 16.7 → 16.7 | 150.0 → 150.3 | 166.7 → 183.3 | 5.5 → 5.4 | 124 / 89 / 20 → 132 / 86 / 28 |
| L1/R3 | 652 / 21.1 → 595 / 21.2 | 30.8 → 28.0 | 33.3 → 33.3 | 33.6 → 50.0 | 116.6 → 133.3 | 7.5 → 6.5 | 19 / 11 / 1 → 29 / 11 / 2 |
| L1/R5 | 584 / 21.6 → 584 / 21.2 | 27.1 → 27.5 | 16.7 → 16.8 | 116.5 → 100.1 | 133.4 → 133.3 | 6.7 → 6.9 | 132 / 46 / 2 → 132 / 35 / 1 |
| L2/R1 | 486 / 22.3 → 461 / 21.9 | 21.8 → 21.1 | 33.3 → 33.3 | 150.0 → 150.1 | 183.2 → 233.3 | 5.4 → 3.5 | 105 / 59 / 21 → 87 / 69 / 24 |
| L2/R2 | 389 / 21.8 → 398 / 22.0 | 17.8 → 18.1 | 16.7 → 16.7 | 183.3 → 183.3 | 216.6 → 200.0 | 4.6 → 4.8 | 97 / 95 / 65 → 103 / 100 / 65 |
| L2/R3 | 340 / 22.5 → 341 / 22.5 | 15.1 → 15.2 | 33.3 → 33.3 | 216.6 → 216.6 | 233.3 → 233.4 | 4.0 → 4.2 | 88 / 75 / 61 → 88 / 76 / 61 |
| L2/R4 | 264 / 23.2 → 260 / 22.9 | 11.4 → 11.3 | 33.3 → 33.3 | 300.0 → 300.0 | 333.2 → 366.7 | 2.9 → 2.6 | 72 / 70 / 70 → 75 / 72 / 71 |
| L2/R5 | 168 / 24.0 → 172 / 24.4 | 7.0 → 7.0 | 33.4 → 33.3 | 499.9 → 499.7 | 516.6 → 499.9 | 1.9 → 2.0 | 47 / 43 / 43 → 49 / 47 / 47 |
| L3/R1 | 422 / 22.1 → 743 / 21.1 | 19.1 → 35.2 | 50.0 → 33.3 | 83.5 → 50.0 | 100.0 → 50.1 | 10.0 → 19.9 | 142 / 2 / 0 → 18 / 0 / 0 |
| L3/R2 | 478 / 21.6 → 770 / 21.0 | 22.1 → 36.6 | 33.7 → 33.2 | 66.9 → 50.0 | 83.6 → 50.2 | 9.4 → 17.1 | 133 / 2 / 0 → 20 / 1 / 0 |


| Room | GPU mean | GPU p50 | CPU update mean | CPU render mean | CPU render p95 | Valid GPU queries |
|---|---:|---:|---:|---:|---:|---|
| L1/R1 | 38.7 → 42.7 | 37.7 → 39.2 | 0.9 → 0.8 | 11.8 → 13.5 | 19.9 → 20.2 | 471/477 → 439/444 |
| L1/R3 | 22.2 → 25.6 | 21.7 → 24.7 | 0.3 → 0.3 | 7.2 → 9.1 | 12.0 → 14.0 | 646/652 → 589/595 |
| L1/R5 | 30.3 → 29.8 | 29.8 → 29.4 | 0.9 → 0.8 | 16.1 → 16.5 | 26.6 → 27.4 | 579/584 → 579/584 |
| L2/R1 | 36.0 → 37.8 | 37.8 → 39.5 | 1.9 → 1.9 | 8.2 → 8.5 | 12.9 → 13.4 | 480/486 → 455/461 |
| L2/R2 | 49.4 → 48.7 | 48.3 → 48.2 | 2.4 → 2.3 | 22.1 → 21.8 | 28.4 → 59.7 | 384/389 → 393/398 |
| L2/R3 | 59.4 → 59.5 | 59.3 → 59.3 | 5.1 → 4.8 | 28.5 → 26.5 | 39.8 → 40.0 | 334/340 → 336/341 |
| L2/R4 | 79.8 → 80.0 | 78.0 → 78.1 | 2.6 → 2.4 | 33.0 → 32.3 | 38.3 → 42.5 | 260/264 → 253/260 |
| L2/R5 | 135.2 → 134.0 | 133.3 → 132.7 | 14.9 → 14.8 | 10.7 → 9.9 | 15.1 → 13.0 | 162/168 → 167/172 |
| L3/R1 | 44.7 → 20.8 | 37.2 → 17.8 | 1.0 → 0.6 | 5.0 → 4.7 | 7.3 → 7.1 | 416/422 → 737/743 |
| L3/R2 | 37.9 → 19.7 | 32.2 → 17.5 | 0.8 → 0.5 | 4.8 → 4.6 | 7.0 → 7.1 | 472/478 → 764/770 |


| End-of-export room | Draw calls / triangles | Programs | Geometries / textures |
|---|---|---|---|
| L1/R1 | 246 / 137048 → 309 / 144604 | 99 → 99 | 604 / 70 → 604 / 70 |
| L1/R3 | 144 / 22548 → 243 / 41132 | 99 → 99 | 604 / 70 → 604 / 70 |
| L1/R5 | 437 / 171564 → 495 / 176112 | 99 → 99 | 604 / 70 → 604 / 70 |
| L2/R1 | 132 / 111803 → 131 / 111778 | 229 → 227 | 530 / 59 → 530 / 59 |
| L2/R2 | 382 / 131574 → 382 / 131574 | 316 → 312 | 674 / 65 → 674 / 65 |
| L2/R3 | 737 / 505276 → 737 / 505276 | 398 → 390 | 794 / 67 → 794 / 67 |
| L2/R4 | 581 / 588214 → 581 / 588214 | 523 → 523 | 822 / 65 → 822 / 65 |
| L2/R5 | 159 / 45761 → 159 / 45761 | 523 → 523 | 834 / 103 → 834 / 103 |
| L3/R1 | 143 / 6220 → 133 / 5868 | 81 → 81 | 436 / 56 → 436 / 56 |
| L3/R2 | 141 / 6088 → 132 / 5836 | 81 → 81 | 436 / 56 → 436 / 56 |


Every sampled live draw introduced zero new programs. Level 2's program count can grow during background preparation, so intermediate room endpoint counts vary with scheduling; it ends at 523 in both runs. Resource counters include Three.js shadow/transmission work. Geometries/textures are counts, not GPU byte measurements. Movement endpoints can differ because of frame pacing, collisions, death/recovery and fixed-step clamping; these resource snapshots are not an identical-pose draw-call A/B.

Level 3 Room 1 p95 is 83.5 → 50.0 ms and 1% low 10.0 → 19.9 FPS; Room 2 p95 is 66.9 → 50.0 ms and 1% low 9.4 → 17.1 FPS. These establish a substantial improvement on this machine, not a 60 FPS guarantee. Level 1/2 gameplay targets remain unmet.

## Loading

Seconds, from the same current before/after runs. Most Level 1 work occurs before Play is ready; navigation-to-control must not be described as a delay after pressing Play.

| Phase | Before | After |
|---|---:|---:|
| Level 1 navigation → control | 25.171 | 26.873 |
| Navigation → Play ready | 24.981 | 26.553 |
| Play click → control | 0.190 | 0.319 |
| Level 1 resource construction (`load`) | 0.970 | 1.114 |
| Level 1 lighting/presentation preparation | 22.774 | 24.021 |
| Compile waits within that preparation | 18.699 | 19.418 |
| Level 1 unload | 0.074 | 0.056 |
| Fully authored Level 2 transition | 62.015 | 63.924 |
| Level 2 resource construction (`load`) | 4.020 | 4.263 |
| Level 2 presentation preparation | 57.178 | 58.688 |
| Queue entry preparation | 6.219 | 6.808 |
| Remaining mandatory startup queue work | 50.854 | 51.771 |
| Level 3 transition | 17.058 | 14.639 |
| Level 3 resource construction (`load`) | 0.114 | 0.106 |
| Level 3 presentation preparation | 16.179 | 13.398 |

Level 1's approximately 29-second target and 99-program signature remain preserved, but the current single-run startup difference is not an improvement. Level 2 is unchanged by retained optimizations. Queue counters measured across startup **and all sampled rooms** are approximately 154 seconds of asynchronous compile waits and 8.3–8.4 seconds of primer submission; these include later work and are not additional entry phases. Explicit queue texture initialization across that whole run is about 18 ms, not a complete texture-loading/decoding measurement.

A restart resets existing resources rather than repeating all loading; browser restart/reload checks cover that contract. Driver-cold startup and exhaustive warm-restart timing distributions were not established in this final pass.

## Rejected work

- A program/geometry primer-binding cache showed no clear gameplay benefit: the Level 2 experiment still had roughly 60.8-second entry and CPU render outliers above 330 ms. First instance uploads and unknown bindings were retained, but the added cache complexity was not justified. It was removed; the original queue warmups and scheduling are preserved.
- Reusing the existing unrolled physical-material spotlight loop for ordinary Room 5 materials was pixel-identical but slower: 142.34 → 166.75 ms median GPU time at the same frozen pose. It was not applied to production.
- The first version of that diagnostic had a missing newline in a shader splice. It emitted shader errors and changed pixels; those timings are excluded. The corrected control explicitly rejects GL errors/pixel differences and completed with zero errors. An earlier optional frozen probe stalled while polling on RAF after stopping the game animation loop; its optional result was discarded. The moving recorder exports completed before that probe and are not substituted for the clean final run.
- Earlier shader-output sharing and larger preparation batches remain rejected as documented in the previous checkpoint (`2de93c4`). No render features were disabled in the shipped implementation.

## Retained code and ownership

- `280e5c1`: `src/levels/BlackoutLevelRuntime.ts` applies the existing finite-light optimization after character assets are ready and before all original warmups. It adds no renderer pass, dependency or owned GPU resource. Existing runtime material disposal remains responsible for programs/materials.
- `908ca22`: `src/core/Loop.ts` counts time discarded by both the frame-delta clamp and the accumulator step cap. Two regressions verify the same six-step/custom-step budgets and absence of a later backlog. Only diagnostics change; the counter is consumed by the flight recorder, not gameplay authority.
- The final evidence commit extends the profiling CLI with viewport/DPR, headed operation and genuine recorder exports; it adds the interleaved Level 2 regression and this report. Capture code stays outside the shipped game.

No physics, collision, checkpoint, ability, puzzle, character ownership, authored geometry, PR #180 texture asset, quality setting, audio resource, Vite relative base or release/debug content gate was changed. No third-party resources or dependencies were introduced.

## Validation

- **90 targeted Node tests passed**, covering finite shaders, frame diagnostics/recorder, shadow ownership/cache/preparation, Cultivation preparation, Blackout runtime/gameplay and PR #180 texture/material data contracts.
- Type-check and production build passed; the existing Vite large-chunk warning remains.
- **12 hardware browser regressions passed** (6.0 minutes), including the new compilation/primer interleaving and cleanup check.
- **2 nested-path production smoke tests passed on their first run** (2.2 minutes): plain production boot/credits/start/restart, then authored Cultivation/Blackout transitions and restarts. No console/request failures were reported. Production validation passed all 81 files.
- Gameplay captures: zero console/page/network errors in both final comparison runs, all samples visible/focused, no cold live programs, hardware timer queries supported with zero disjoint events.
- Clean controlled GPU/pixel comparisons: zero GL errors, unchanged pixels for lighting alternatives and cached shadows. Removing gels was diagnostic only and is not a visual-equivalence claim.

The browser suites cover movement, reversal, climbing, death timing, fades, switching/merge/split, active maps, restart/reload and unload ownership across the three levels. This is not an exhaustive long-duration GPU-memory leak proof, full native puzzle/combat traversal or validation on a second GPU. Subjective camera/character feel still needs manual review. The Intel UHD 620 does not sustain 60 FPS at default quality in the heavy views.

## Reproduction and artifacts

From the existing worktree with Node 24.x/npm 11.x:

```powershell
npm ci
npm run build
$env:PROFILE_LABEL = 'review'
$env:PROFILE_RUNS = '1'
$env:PROFILE_HEADLESS = '0'
$env:PROFILE_WIDTH = '1536'
$env:PROFILE_HEIGHT = '730'
$env:PROFILE_DPR = '1.25'
$env:PROFILE_KEY_MS = '5000'
$env:PROFILE_RECORDER = '1'
node scripts/profile-performance.mjs # Capture raw.json and flight-recorder exports first.
node scripts/summarize-performance.mjs review # Summarize that completed capture.
```

Do not run tests, builds, other GPU workloads or expensive analysis during captures. Recorder and supplementary harness GPU queries are mutually exclusive. `PROFILE_GPU=1` is available when recorder mode is off; legacy startup/Level 1-only and reference-dist options remain supported. Constructor instrumentation fails visibly if future minification changes its expected shape.

Raw exports, screenshots, frame/phase data, browser version and build asset hashes are ignored under `artifacts/performance-overhaul/pr185-before/` and `pr185-final/`. Clean frozen controls are in `pr185-controlled-valid/raw.json`; rejected experiments remain ignored. `scripts/summarize-performance.mjs pr185-before pr185-final` regenerates the combined summary. The raw JSON was never rewritten to adjust results.

Relevant unit commands and logs are recorded in ignored `artifacts/final-pass-unit.log`. Hardware regressions use the existing three presentation/program-stability suites and an ignored local Edge/D3D11 Playwright adapter at 640×360; the new test is in the normal Cultivation suite and can also run with the standard project configuration. Regression viewport and performance-capture viewport differ intentionally. Nested smoke serves shipped files at `/group-folder/` without route interception/runtime injection.

The branch contains local commits only. Compare the final work against the PR's starting head with `git diff 40de099..HEAD`. The final delivery names the documentation/evidence commit and clean status. The existing untracked `performance-overhaul-review.patch` is preserved unchanged at `artifacts/pr185-final-review/performance-overhaul-review.patch` rather than committed.

The next investigation should isolate live transmission/opaque shader cost and GPU submission/backpressure on a reproducible native Level 2 route. Neither a shadow-only fix, larger preparation batches nor the tested shader-loop alternative resolves the measured bottleneck. This report does not support claiming that Level 2 or all-level frame pacing is fixed.
