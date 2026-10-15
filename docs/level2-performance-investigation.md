# Level 2 performance investigation — review continuation

**Current retained result:** [Level 2 startup regression resolution](level2-startup-regression.md) supersedes this report's candidate/retention and startup conclusions. The early-zero opt-in evaluated below was subsequently reverted after controlled ablation. Its genuine recordings remain historical evidence of the GPU benefit that is being given up. The other reviewed improvements remain retained.

This continues the reviewed `280e5c1`, `908ca22` and `9374683` changes. Those commits are retained. The PR and remote branch have not been updated. The validation fixes are in `7265101`.

## Evaluated early-zero candidate and scope (subsequently reverted)

The evaluated Level 2 candidate opted its existing finite-light helper into the zero-radiance path already used by Levels 1 and 3. Seven call sites cover room material creation, cloned finishes, the scout batches and runtime-owned materials. This matters because the helper is idempotent: changing only the runtime traversal would leave previously configured room materials on the older path.

Only an exactly zero light color skips direction, distance and cone evaluation. Nonzero contributions, accumulation order, BRDFs, shadow samples and transmission settings retain their existing calculations. The same guard covers the ordinary screen draw and the linear-color environment draw used by transmission. No new renderer, material settings, render targets, shader warmup policy or resource ownership was introduced. The Bob-camera experiment primarily benefited room rendering. An active-Goop control also showed a substantial physical-material benefit; the split depends on character screen coverage and view.

The baseline-image regression now rejects black/blank captures before comparing pixels. Shadow CPU diagnostics reset at each runtime render and accumulate calls within that frame. Reproduction instructions explicitly capture before summarizing.

## Hardware and method

- Production builds, Edge 155, ANGLE Intel UHD Graphics 620 / D3D11, `?debug=1`.
- All original flight-recorder exports report viewport 1536×730, drawing buffer 1920×912, effective DPR 1.25. No quality setting or renderer substitution was used.
- Matched before/after runs use the same instrumentation and bounded opposing keyboard movements, a jump and pointer-locked camera motion in Room 5, separately with Bob and Goop active. Preparation finishes before recording. Loading, death and transition frames are rejected. This is interactive room gameplay, not a full native puzzle/lift playthrough.
- No concurrent builds, tests or expensive analysis during GPU measurements. Owned headed browsers use the existing focus/occlusion settings. Driver caches, GPU temperature and clocks remain uncontrolled. Small differences in other rooms are inconclusive.
- Tables use original recorder rows, not post-stop harness frames. Accepted recordings must retain every frame sequence in their deduplicated hitch windows. Timer results are actual WebGL hardware queries; no synthetic samples or edited raw JSON.
- Frozen controls stop animation and simulation, retain camera culling, and use 12–16 non-overlapping hardware timer queries per full-frame variant. Pass attribution uses sequential, non-nested queries around render-target and draw-category boundaries (eight frames); independently timed full frames check the scale. Query overhead and independently varying GPU clocks mean pass medians need not sum exactly to a full-frame median.

## Interactive capture validation and results

The first continuation capture used the earlier long W/D/S/A route. Raw position/state validation found a death in Room 1, followed by disabled input after later debug teleports. Rooms 2–5 were stationary despite attempted keyboard input. Their FPS/hitch tables are **excluded as gameplay evidence**. The frozen shader controls, original GL traces and startup measurements remain useful in their explicitly stated scopes. No raw JSON was repaired or rewritten.

The maintained profiler now uses the normal Level 2 stop/start lifecycle after debug staging, requires enabled input and pointer lock, uses short opposing moves near the safe spawn, and validates the exported recorder itself. Every retained sequence must contain only playing/no-cutscene frames, one active slime, complete raw-frame coverage and meaningful body/camera motion. Bob and Goop use distinct export names. Failed recordings remain excluded rather than silently summarized.

Validated replacement results (Room 5, before → after) use all original recorder rows. CPU values are mean/median milliseconds; hitch counts are strict >50/>100/>150 ms.

| Active slime | Frames / duration (s) | FPS | Interval p50 / p95 (ms) | GPU mean / median (ms) | CPU update mean / median | CPU render mean / median | Hitch counts |
|---|---|---|---|---|---|---|---|
| Bob | 180/27.58 → 219/24.43 | 6.53 → 8.97 | 33.4/583.1 → 33.3/383.2 | 147.00/141.55 → 104.56/103.52 | 15.94/11.1 → 16.29/10.8 | 10.99/10.5 → 12.77/10.5 | 55/49/45 → 69/59/56 |
| Goop | 156/26.01 → 197/25.34 | 6.00 → 7.77 | 33.3/649.7 → 33.3/450.0 | 160.75/163.69 → 121.93/121.68 | 14.56/9.5 → 15.47/10.0 | 10.01/9.4 → 10.06/9.3 | 43/41/41 → 55/52/52 |

All four recordings confirm viewport **1536×730**, buffer **1920×912**, effective DPR **1.25**, Intel UHD 620/D3D11 hardware timing and zero disjoint events. Valid GPU samples are 174/180 and 150/156 before, 213/219 and 191/197 after; six pending samples at each stop are not invented. Programs stay **189 → 189** throughout these directly staged Room 5 runs, with zero new programs in live draws. Optional earlier-room configurations are not all compiled in this direct route; the earlier 523-program totals apply to runs visiting all five rooms.

Bob's observed GPU mean falls 28.9% and FPS rises 37.4%; Goop's GPU mean falls 24.1% and FPS rises 29.6%. P95 intervals fall about 34% and 31%. Severe stutter remains, and raw hitch counts increase rather than disappear. Fixed-step discarded time is still 13.61/24.43 seconds for Bob and 15.95/25.34 for Goop after the change (before: 18.61/27.58 and 18.71/26.01). The physics limits were not changed.

These are single runs with matching requested inputs and authored starting poses, not a locked movement path. Actual trajectories differ as frame/input sampling and discarded simulation time differ; frozen shader controls provide the separate causal check. Raw ranges prove movement and camera motion in every recording, and every frame remains playing/no-cutscene. Harness frames are all focused/visible. There are zero console/page/network errors in both accepted runs.

Manual Shift+H markers are deliberately issued for raw-frame coverage; the recorder's default “felt hitch” label denotes instrumentation here, not a human subjective report. The first corrected Bob attempt was rejected only because ordinary frames fell outside hitch windows (194/201 retained); its movement and states were valid, but it is not used in this table. Earlier historical PR recordings were also checked: Level 2 Room 5 body coordinates do not change in either pr185-before or pr185-final. Their old FPS comparisons must not be presented as interactive gameplay.

## Why hiding gels appeared so effective

A frozen Bob-camera view separates the duplicated environment work from the characters:

| GPU scope, median ms | Before | After |
|---|---:|---:|
| Full normal frame, independent query | 130.24 | 104.90 |
| Environment in transmission target | 58.15 | 50.87 |
| Bob in transmission target (opaque eyes) | 2.09 | 2.02 |
| Environment on screen | 58.70 | 48.46 |
| Bob on screen | 11.13 | 5.98 |
| Goop on screen | 0.28 | 0.28 |
| Shadow drawing at this pose | 0.15 | 0.15 |

Both body materials retain transmission 0.28, front side, transparency and their authored roughness (Bob 0.28, Goop 0.26). Three r185 re-renders opaque scene objects into a full-resolution, half-float, multisampled transmission target, resolves it and builds mipmaps. Either visible transmissive character requires that environment pass. Removing both also removes that pass; it is not a measurement of body shading alone.

In the baseline view with cached valid shadows, full-frame medians were 131.79 ms with both, 130.59 with only Bob, 130.21 with only Goop, and 62.06 with neither. Returning to both gave 137.23 ms, exposing drift. These root visibility experiments include eyes and body and are diagnostic only. They do not justify removing either character, turning off transmission, changing shadows or judging intrinsic Bob/Goop shader efficiency from their different screen coverage.

Within the same frozen baseline page, zero-radiance guards on physical materials alone gave 137.63 ms versus 137.02 ms initially. Extending them to room materials gave 113.13 ms; restoring the original shaders gave 143.31 ms. Both physical-only and full controls changed **zero RGBA bytes**. This supported the small retained change before source modification.

With Goop active in the corrected-view frozen diagnostic, candidate pass medians were 49.77 ms for the transmission environment, 47.90 ms for the screen environment, 15.48 ms for Goop on screen and 0.04 ms for Bob on screen (plus 2.19 ms for Bob’s opaque transmission-pass eyes). Reversing only physical guards raised full-frame median from 121.56 to 141.29 ms; reversing all guards raised it to 168.13 ms. Restoring the candidate returned 121.80 ms. Both reverse controls again changed zero RGBA bytes, and 471 actual guard substitutions verified that the control was effective. The earlier physical-only Bob result therefore cannot be generalized to Goop or other views.

## Startup and primer stalls

The optimization does not solve mandatory startup preparation:

| Wall-time phase (s) | Before | After |
|---|---:|---:|
| Level 2 transition to running | 65.45 | 70.16 |
| Queue startup preparation | 59.88 | 64.71 |
| Entry configuration | 7.09 | 7.66 |
| Mandatory Room 4 + 5 configuration | 52.78 | 57.04 |

Startup is dominated by real asynchronous program compilation for the maintenance light/shadow/material layouts. In the initial isolated baseline run, 24 compile batches accounted for 61.24 seconds across startup; resource priming accounted for only 0.71 seconds. Individual large maintenance batches waited 4.67, 5.30 and 8.38 seconds while their synchronous submission took about 24–50 ms. Subsequent gameplay/background totals overlap other work and are not additive startup wall time. Shader warmups remain in place, and no loading work was moved into gameplay. Maintenance preparation is 4.26 seconds longer in the accepted comparison; the earlier stationary protocol also measured 54.53 → 57.43 seconds. This is a possible loading-time regression and a limitation of the retained GPU optimization, not a startup improvement. Cache/clock variation is uncontrolled, so its exact attribution remains uncertain. The remaining startup objective is unresolved.

GL-call instrumentation reproduced a 312.6 ms resource primer with zero new program objects: 298.1 ms was blocked inside `getProgramInfoLog`, another 13.0 ms in shader-log queries. Other primers took 291.2 ms (287.8 in the program-log query), 278.1 ms (276.0), and 276.8 ms (273.0). Uniform inspection and buffer uploads were small in those samples. Three's `WebGLProgram.onFirstUse()` performs diagnostic retrieval and caches uniforms/attributes lazily, after `compileAsync` has returned and the program count has stabilized. Program-count growth alone cannot detect this synchronization.

The measured API is a synchronization point; that trace alone does not prove that log generation, deferred driver work, or outstanding GPU commands caused the entire wait. A separate pre-primer GPU-drain control took 0–0.1 ms in the largest cases, while the following program-log query still took 283–320.5 ms. This rules out ordinary queued GPU draws as the dominant cause in those samples and localizes the wait to the driver diagnostic/first-use inspection path. It does not identify the driver’s internal implementation. This deliberately synchronized run is excluded from gameplay comparisons. Disabling error checking, skipping primers, or deferring required work into gameplay is not a retained solution.

## Rejected rendering architecture

The subsequent full-resolution Room 5 prototype failed pixel equivalence when reusing the resolved transmission image (maximum 10/255, with both characters visible). That architecture is rejected. The speculative dual-output MRT design is not implemented, and no Three.js renderer fork or dependency patch is authorized. This continuation resolves startup by reverting only the Level 2 early-zero opt-in; it leaves the existing rendering architecture and transmission quality intact. See the current report for retained results and limitations.

## Reproduction and local evidence

Absolute artifact root: C:\Users\Latitude 5590\.codex\worktrees\performance-overhaul\Specimen\artifacts\performance-overhaul\. The artifacts directory is ignored. Original recorder exports are not rewritten.

- level2-interactive-before-valid/run0-__two-5-bob-flight.json
- level2-interactive-before-valid/run0-__two-5-goop-flight.json
- level2-interactive-after-valid/run0-__two-5-bob-flight.json
- level2-interactive-after-valid/run0-__two-5-goop-flight.json
- level2-accepted-results.json: derived table and validation metadata; summary.json can be regenerated with the maintained summarizer.
- level2-before/ and level2-after/: rejected gameplay sequences, retained for original GL traces, startup measurements and valid frozen shader/pass controls.
- level2-cost-baseline/: independent initial pass breakdown and startup trace.
- level2-drain-goop-retry/: explicit GPU-drain and active-Goop frozen/reversed-shader controls. Its attempted gameplay had disabled input and is excluded. The earlier level2-drain-goop/ run timed out waiting for the disabled-input switch and is excluded.

The ignored artifacts/run-level2-interactive.mjs derives from the maintained production profiler, skips Level 1 gameplay, captures Room 5 with each character and stops before Level 3. It uses the existing runtime switch method for staging Goop, then genuine keyboard/jump/pointer input. Its normal stop/start lifecycle restores controls before measurement. It changes no production source. The reference build was produced through an ignored Vite transform that removes only the seven candidate arguments; its Level 2 bundle SHA-256 is **8695d63e9d2f00b40af407a381e73d35591d63ed27211b16891c79bec23ff7b3**, byte-identical to the reviewed baseline bundle. No branch or checkout change was needed.

Use the environment block in performance-overhaul.md, then run captures sequentially:

~~~powershell
$env:PROFILE_MODE = 'startup'
$env:PROFILE_DIST = 'artifacts/level2-reference-build'
$env:PROFILE_LABEL = 'level2-interactive-before-valid'
node artifacts/run-level2-interactive.mjs
Remove-Item Env:PROFILE_DIST -ErrorAction SilentlyContinue
$env:PROFILE_LABEL = 'level2-interactive-after-valid'
node artifacts/run-level2-interactive.mjs
node scripts/summarize-performance.mjs level2-interactive-before-valid level2-interactive-after-valid
~~~

The frozen/GL-call runners are also retained under artifacts/ (run-level2-before.mjs, run-level2-after.mjs, level2-cost-probe.mjs, level2-zero-probe.mjs and run-level2-drain-goop-retry.mjs). Their instrumentation is not shipped. Never treat their rejected input sequences as gameplay evidence.

## Verification and review state

- Retained game change: 46cd160 (seven Level 2 opt-ins plus the two-view pixel regression). Validation corrections: 7265101 and f35bfe2.
- Type checking and production build pass. A final rebuild produces exactly the JS asset hashes recorded by the candidate capture. The existing chunk-size warning remains.
- 26 targeted unit tests pass: finite-light shader/cache composition, Cultivation preparation, shadow preparation/policy, camera shadow culling and spatial shadow cache. Log: artifacts/level2-unit.log.
- 13 hardware browser regressions pass in 7.3 minutes across Cultivation, Blackout and Level 1 shader/program stability. The new control removes 246 guards in the Bob Room 1 view (maximum channel difference 1/255), and 480 in the Goop Room 5 view (difference 0). Both have meaningful images and zero GL errors. The preparation-isolation test has difference 0, no cold live programs and unchanged light/shadow state. Log: artifacts/level2-browser.log.
- Production layout validation passes for 81 files. Logs: artifacts/level2-final-build.log and artifacts/level2-production-validation.log.
- Both nested-path production smoke tests pass in 2.3 minutes, including startup, restart and Level 2/3 transitions. Log: artifacts/level2-production-smoke.log.

Level 1 and Level 3 gameplay/rendering source paths were not changed. Their hardware regression journeys pass; no new Level 3 performance gain is claimed. This is not an exhaustive native puzzle/combat/lift playthrough, subjective feel assessment, second-GPU validation or long-duration memory-leak proof.

The review diff starts at 9374683; all three reviewed commits remain ancestors. The existing untracked performance-final-review.patch was left untouched. No push or PR update was performed. Work stops before the proposed architectural change.
