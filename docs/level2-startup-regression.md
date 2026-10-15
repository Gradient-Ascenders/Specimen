# Level 2 startup regression — retained merge candidate

Investigation checkpoint: `fc94766392d94fc7825e5f7b23810626e685b9ba`. The reviewed commits remain in history. This follow-up reverts only Level 2's early-zero-radiance opt-in from `46cd160`; the compact finite-light loops, direct-contribution visibility guards, hook/cache-key composition, resource lifetimes, and mandatory preparation remain intact. Levels 1 and 3 keep their existing early-zero guards. No renderer architecture, Three.js internals, dependency, quality setting or gameplay system changed.

## Regression cause and controlled ablation

The additional zero-color branches around `getPointLightInfo` / `getSpotLightInfo`, enabled at eight invocations across six Level 2 files, reproducibly increase asynchronous shader preparation on Intel UHD Graphics 620 / ANGLE D3D11. Identical program counts did not imply equal compilation work. The application-level culprit is the Level 2 early-zero shader opt-in, not the retained hook/cache-key fix or a new set of mandatory variants. The captures do not identify an internal D3D compiler pass or separate compiler optimization from every driver-cache effect.

All ablations keep current checkpoint runtime code, assets, warmups and resource ownership. Only the Level 2 helper/imports or early-zero arguments vary. Level 1 and Level 3 remain current in every build. An ignored Vite transform creates production builds without changing branches, checking out historical source over the worktree, or patching Three.js.

| Shader variant | Precise substitution | Runs | Mean Level 2 transition | Prepared programs |
|---|---|---:|---:|---:|
| Earlier helper | Level 2 uses `cf8fbf2` helper, before inherited-hook/key normalization | 2 | 66.58 s | 191 |
| Before latest Level 2 opt-in | Current helper/hook composition, eight Level 2 early-zero arguments removed | 2 | 65.22 s | 189 |
| Checkpoint | Unmodified `fc94766`, both early-zero guards enabled | 2 | 69.29 s | 189 |

Order: earlier / pre-zero / checkpoint / pre-zero / checkpoint / earlier. The two adjacent pre-zero → checkpoint differences are +4.13 and +4.02 seconds. Mean compile waits increase 58.66 → 62.90 seconds, while mean primers decrease 0.714 → 0.658 seconds. The earlier helper retains duplicated finite-light key markers in 46 submitted program keys and produces two more prepared programs; reverting that improvement is unnecessary.

The diagnostic captures the exact GLSL passed to `shaderSource`, hashes both stages, and additionally hashes fragment source with only the known early-zero blocks/comment removed. Across the 189 matching checkpoint/pre-zero program keys, all vertex hashes match and all 189 normalized fragment hashes match. Sixty fragment sources are already byte-identical; the other 129 differ only by those guard blocks. The guard-enabled submissions contain 1,224 guard sites and 247,539 additional characters in total. These are uploaded-source counts, including preprocessor-disabled branches, not executed-branch counts. This isolates the shader-source change independently of the program count.

Three bounded alternatives failed the loading requirement and were discarded without production promotion:

| Reversible trial | Level 2 transition | Compile waits | Programs |
|---|---:|---:|---:|
| Zero test inside the two light-info functions | 82.89 s | 75.56 s | 189 |
| Point-light guard only | 70.75 s | 63.74 s | 189 |
| Spotlight guard only | 76.13 s | 69.38 s | 189 |

These are one screening run per rejected variant, with a fresh 66.03-second pre-zero baseline immediately before the point/spot trials. They show that those forms miss the loading budget on this machine; they do not establish a universal ranking of shader control-flow forms. Combining/removing branches changes driver behavior nonlinearly, so branch count alone is not a cost model. None qualified for a gameplay-performance claim. No more invasive shader/compiler or renderer work was undertaken.

## Retained change

The six production files return to `optimizeFiniteLightEvaluation(material)` for Level 2. This preserves the validated v3 Level 2 shader path, including compact ordinary-point/shared standard-material spotlight loops and Three's existing visibility test before direct BRDF evaluation. The shared helper itself is unchanged, preserving the Level 1 startup reduction and Level 3 guard behavior.

Every production JavaScript asset in the fixed build is byte-identical to the previously validated pre-guard baseline build. The complete hash maps are saved, not just the Level 2 bundle. Mandatory loading/primers, scheduling, first-use preparation, live light-state isolation, PCF shadow ownership and physical transmission remain unchanged. No work is moved into active gameplay.

The existing browser pixel regression now asserts that Level 2 uses the retained v3 path, then compares it with an explicitly reintroduced early-zero control for Bob/Room 1 and Goop/Room 5. It retains the meaningful-image check and verifies that guards were actually inserted. The control only exists in the test and is restored afterward. Other regressions continue checking cold live programs, fade/shadow variants and interleaved background compilation/primers.

## Final alternating startup comparison

Three alternating checkpoint/fix pairs, with a fresh headed Edge process/profile for each run:

| Pair | Guarded checkpoint | Retained fix | Difference |
|---|---:|---:|---:|
| 1 | 70.18 s | 63.81 s | -6.37 s |
| 2 | 68.35 s | 64.00 s | -4.36 s |
| 3 | 71.77 s | 63.79 s | -7.98 s |
| Mean | 70.10 s | 63.87 s | -6.23 s |

| Mean phase | Checkpoint | Retained fix |
|---|---:|---:|
| Scene load | 4.46 s | 4.51 s |
| Presentation preparation | 64.77 s | 58.46 s |
| Mandatory queue preparation | 64.65 s | 58.33 s |
| Compile waits within queue | 63.51 s | 57.18 s |
| Primer wall time within queue | 0.65 s | 0.68 s |
| Time through first controllable draw | 70.10 s | 63.87 s |

All six captures report Intel UHD 620 / D3D11, identical viewport/buffer/DPR, visible/focused state, no GL/browser errors, both mandatory configurations complete, and 189 prepared programs. Every final captured vertex/fragment source matches the corresponding pre-zero baseline source (189/189 per run), without source normalization. The fixed startup mean is below the prior validated 64.84-second baseline and within the baseline variation seen across runs. Exact wall-time savings vary with driver/cache/clock conditions; the new three-pair difference is not a universal 6.23-second guarantee.

The startup diagnostic excludes optional background queue work only after mandatory presentation preparation completes, identically in both builds, then observes the first controllable draw. Production warmups are unchanged. Inspection/reflection is contained in primer time; compile waits include asynchronous driver work and scheduling. These nested phase rows must not be summed as an additive budget.

## Room 5 gameplay and GPU trade-off

The same production settings and bounded opposing keyboard/jump/pointer inputs are used for each character. These are actual moving Room 5 sequences; every exported frame is playing/no-cutscene, with one active slime and meaningful body/camera motion. No loading, death or transition frames are retained. This is one matched recording per character/build, not a locked trajectory or a complete puzzle/lift playthrough.

| Character / build | Exported frames / seconds | FPS | Frame p50 / p95 (ms) | GPU mean / p50 (ms) | CPU update / render mean (ms) | >50 / >100 / >150 ms |
|---|---|---:|---|---|---|---|
| bob / guarded checkpoint | 232 / 25.13 | 9.23 | 33.30 / 349.90 | 101.68 / 100.60 | 15.51 / 11.71 | 67 / 62 / 62 |
| goop / guarded checkpoint | 204 / 25.24 | 8.08 | 33.30 / 450.00 | 117.70 / 116.35 | 13.77 / 9.40 | 53 / 52 / 52 |
| bob / retained fix | 178 / 27.33 | 6.51 | 33.40 / 549.90 | 146.17 / 141.64 | 16.40 / 11.51 | 59 / 50 / 46 |
| goop / retained fix | 162 / 26.93 | 6.02 | 33.40 / 616.60 | 160.87 / 157.62 | 15.78 / 10.55 | 45 / 41 / 41 |

**The loading fix gives up the Level 2 GPU gain.** Room 5 remains severely GPU-bound and stutters more on the retained path. This is the authorized fallback after the three bounded shader alternatives failed the loading gate; it is not a claim that every possible selective/material-specific strategy has been exhausted.

Each recording confirms 1536×730 viewport, 1920×912 buffer, DPR 1.25, UHD 620/D3D11 and supported hardware queries, with zero disjoint events or browser/GL errors. Raw-frame coverage is complete. Six GPU results are still pending at each stop; they are not invented. Frame quantiles use sorted index floor(N×p), as in the maintained summarizer. Durations sum exported frame intervals; frames after recorder stop are excluded. All sampled live draws introduce zero programs, and program counts remain 189.

Frozen full-frame controls in the fixed build independently verify the lost GPU benefit without movement-path differences. For each view the sequence is retained → reintroduced old guards → retained again, with 12 warmed non-overlapping hardware queries per stage:

| View | Retained GPU median | Old guards GPU median | Restored retained GPU median | Changed pixels (all controls) |
|---|---:|---:|---:|---:|
| bob | 134.02 ms | 84.63 ms | 142.68 ms | 0 / 1,751,040 |
| goop | 158.20 ms | 101.11 ms | 157.83 ms | 0 / 1,751,040 |

The brackets expose clock/driver drift; do not treat these short sequences as a precise universal percentage. Shader controls are compiled/warmed before timing and add diagnostic-only cached programs (up to 252); no program/texture/geometry count changes within any 12-frame timed stage. The real gameplay recordings above remain at 189 programs. Control hooks/keys are restored and the owned browser closes. No light, shadow, material parameter, transmission setting, sample count or resolution is reduced. These diagnostic synchronization/compilation operations are not shipped.

CPU render spikes remain: bob/checkpoint 280.50 ms, goop/checkpoint 15.80 ms, bob/fixed 118.20 ms, goop/fixed 15.70 ms. No new live programs appear in either build. The several-hundred-ms checkpoint spike and the previously localized optional first-use driver inspection stalls are not claimed fixed. This direct Room 5 route does not exhaust later-room first use; the separate background-preparation regression checks active lighting/shadow isolation. Resource counters alone do not prove that no driver synchronization can ever occur. Geometry/texture ranges and all raw phase data are retained in the derived summary.


## Level 1 and Level 3 preservation

Level 1's isolated final runs reach control in 27.92–28.66 seconds (mean 28.30), retaining 99 prepared programs. No Level 1 source or shared helper changes were made.

Level 3 Room 1 has 501 genuine exported frames over 22.64 seconds: 22.12 FPS, 38.53 ms mean GPU / 38.63 ms GPU p50, 50.20 ms interval p95, 66 programs and zero cold live programs. Hardware queries are supported with zero disjoint events. It uses the same viewport, DPR and UHD 620 backend. This direct Room 1 route does not claim the higher program count from visiting later rooms.

At the final frozen Bob view, the preserved optimized renderer measures 36.81 ms median GPU versus 72.02 ms with the pre-optimization stock lighting chunk; restoring it returns 37.09 ms. Each stage has 12 valid non-overlapping queries, with at most 0/255 channel difference across the full frame, restored pixels max 0/255 and no GL errors. These same-view controls confirm that the Level 3 shader benefit remains; the moving run is not directly interchangeable with an earlier Volt-camera trajectory.

The first Level 3 attempt was rejected and excluded: Room 1 begins with Volt, whose position is not exported, and its normal state is `three-slime`, whereas the inherited validator assumed Bob/`playing`. The maintained profiler now selects Bob/Goop through normal Tab input, confirms selection before recording, and validates the correct normal phase for Level 3. Unsupported actors/states, death, incomplete raw coverage and missing movement still fail validation. This changes capture diagnostics only. The rejected recording remains under regression-level3-final; the accepted retry is regression-level3-bob-final.

## Validation and remaining limits

- Type-check and production build passed; the existing large-chunk warning remains.
- All 23 affected Node tests passed (finite-light hooks, Cultivation preparation/layout, Containment layout, shadow preparation and shared shadow coverage), with no skips.
- The maintained profiler and diagnostic scripts passed syntax checks; the corrected profiler completed a genuine validated Level 3 recording.
- All 15 hardware Edge browser regressions passed (9.3 minutes), covering Level 1 traversal/programs/bindings, Bob/Goop motion/death/recovery, Level 2 room/fade/shadow variants and Level 3 switching/merge/split/unload.
- Background preparation interleaved 39 compilation batches and two primers: max pixel difference 0, no live program growth, no light/map/global-shadow state changes, no GL errors.
- The retained-versus-early-zero browser controls verified meaningful framebuffer data and actual guard insertion (246 for Bob/Room 1 and 483 for Goop/Room 5). Maximum channel difference is 1/255 in Room 1 and 0 in Room 5; no GL errors. Full-resolution Room 5 and Level 3 frozen comparisons are exact matches.
- Both nested-path production smoke tests passed (2.3 minutes): plain boot/credits/start/restart, then authored level transitions and restarts. No request/console failures were reported.
- Production layout/reference validation passed all 81 files. Relative base and exact asset casing remain unchanged.

No full native puzzle/combat/lift playthrough, long-duration resource-leak proof, second GPU/backend qualification or subjective smoothness review is claimed. The measured Room 5 route has no cold live programs, but existing CPU/driver and frame-delivery stalls remain. Later optional first use is not exhaustively profiled. No mandatory warmup or diagnostic error checking is disabled. Loading is restored by returning to the exact validated baseline shaders, with the measured GPU trade-off reported above.

Local implementation commits: `2d222c9f88b7c874ce9797ff2beef42a9f0fda90` (Level 2 revert/regression), `175e24df25aee52a7918288c8fe268a444fef1d5` (capture validation). The evidence/report commit follows these without changing production code.

The direct resolved-transmission-image reuse architecture is rejected after its prior pixel-equivalence failure. The speculative MRT design is not implemented. Level 2 remains severely GPU-bound at the validated quality/resolution; restoring startup does not solve that gameplay limitation. This follow-up deliberately accepts that trade-off rather than retaining a reproducible loading regression or deferring warmup work.

## Reproduction and evidence

Node 24.x / npm 11.x; production builds at `?debug=1`; owned headed Edge, Intel UHD 620 / ANGLE D3D11; 1536×730 viewport, 1920×912 drawing buffer, DPR 1.25. Fresh browser processes/profiles are used for startup runs. Driver cache, clocks and temperature are uncontrolled; timings are descriptive for this machine. Captures, builds and tests run sequentially with no overlapping profiling/build/test workload.

The capture helpers and isolated Vite configs are preserved locally under ignored artifacts/. They are diagnostic tools, not shipped application code. All original recorder JSON files remain unmodified; summaries are derived separately. The rejected Volt capture and unsuccessful shader trials remain available and are excluded from retained results.

~~~powershell
npm run type-check
npm run build
node --test tests/FiniteLightEvaluation.test.ts tests/CultivationPresentationPreparation.test.ts tests/CultivationLightLayout.test.ts tests/ContainmentLightLayout.test.ts tests/ShadowPreparation.test.ts tests/CultivationBlackoutShadowCoverage.test.ts

# Uses the preserved, hash-verified checkpoint build and the current fixed dist.
$env:ABLATION_PREFIX = 'review-startup'
$env:ABLATION_PLAN = '[["checkpoint","artifacts/level2-checkpoint-build"],["final","dist"],["checkpoint","artifacts/level2-checkpoint-build"],["final","dist"],["checkpoint","artifacts/level2-checkpoint-build"],["final","dist"]]'
node artifacts/run-startup-ablation-plan.mjs

$env:PROFILE_MODE = 'startup'
$env:PROFILE_RUNS = '1'
$env:PROFILE_HEADLESS = '0'
$env:PROFILE_WIDTH = '1536'
$env:PROFILE_HEIGHT = '730'
$env:PROFILE_DPR = '1.25'
$env:PROFILE_KEY_MS = '5000'
$env:PROFILE_RECORDER = '1'
$env:PROFILE_GPU = '0' # Recorder owns gameplay queries; avoid nested harness queries.
$env:PROFILE_LABEL = 'review-room5-before'
$env:PROFILE_DIST = 'artifacts/level2-checkpoint-build'
$env:PROFILE_GUARD_CONTROL = '0'
node artifacts/run-level2-final-comparison.mjs
$env:PROFILE_LABEL = 'review-room5-after'
$env:PROFILE_DIST = 'dist'
$env:PROFILE_GUARD_CONTROL = '1'
node artifacts/run-level2-final-comparison.mjs
$env:PROFILE_LABEL = 'review-level3'
node artifacts/run-level3-regression.mjs
node scripts/summarize-performance.mjs review-room5-before review-room5-after review-level3

node node_modules/@playwright/test/cli.js test --config artifacts/playwright.hardware.config.ts
node node_modules/@playwright/test/cli.js test --config artifacts/playwright.final-smoke.config.ts tests/smoke/ProductionSmoke.spec.ts
npm run validate:production
~~~

The checkpoint assets were copied before source edits; their JS hash map matches the original checkpoint captures. Do not label a rebuild from the fixed sources as the old checkpoint. The final JS map is byte-identical to artifacts/level2-reference-build, the validated pre-zero build. Source substitutions are documented in create-startup-ablation.mjs, vite-level2-earlier.config.ts and the point/spot/function trial configs; no historical branch was created or checked out.

Absolute local artifact root: C:/Users/Latitude 5590/.codex/worktrees/performance-overhaul/Specimen/artifacts/.

- performance-artifacts/level2-startup-regression/: checkpoint.json; ablation-summary.json; final-startup-summary.json; final-assets.json; gameplay-summary.json; level3-summary.json; original run/test logs; final-validation.json (including the rejected attempt and accepted retry); final verification and review diff.
- performance-overhaul/startup-ablation-N-KIND/raw.json: the six three-version ablations, including source hashes and native GL timings. startup-light-info-trial and startup-split-guards hold the rejected screened alternatives.
- performance-overhaul/startup-final-N-KIND/raw.json: the six final alternating startup captures. First-control source snapshots match the baseline 189/189 in each fixed run.
- performance-overhaul/regression-room5-before/ and regression-room5-after/: original run0-__two-5-bob-flight.json and run0-__two-5-goop-flight.json, raw.json, and screenshots. The after raw.json additionally holds the out-of-recording GPU/pixel controls.
- performance-overhaul/regression-level3-bob-final/: accepted run0-__three-1-flight.json, raw.json and screenshot, including the stock-lighting GPU control. regression-level3-final/ is the rejected initial Volt attempt.
- The pre-existing untracked performance-final-review.patch was preserved unchanged under performance-artifacts/level2-startup-regression/; preserved-review-patch.json records its original path and SHA-256. It is not included in a commit.

The final-review.patch and final-verification.json under performance-artifacts/level2-startup-regression/ record the completed local diff/checkpoint checks. All previously reviewed commits remain ancestors. No additional branch was created. No remote, PR, dependency or Three.js implementation was changed.
