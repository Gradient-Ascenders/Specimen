# Final loading optimization results

## Submission decision

**Retain the validated Blackout leak fix and accepted A/B preparation fixes. Proposal D was implemented, failed native validation, and was completely reverted before any production commit.** The final build contains no opening shader bank, speculative compiler, worker, Vite fingerprint hooks or extra opening callbacks. No additional loading-time gain from D is claimed.

The candidate shortened some measured waits, but recorded approximately 400 ms cinematic frame gaps and `GL_INVALID_VALUE` (1281). A cleanup correction and a repeat without worker-memory inspection still failed. A later restored-build capture also recorded a large frame gap, so the timing evidence does not establish that D caused all observed stuttering. The repeatable GL failure and lack of an adequately validated improvement independently trigger rejection under the submission instructions. Further optimization work stopped; Proposal C and other caching experiments were not started.

## Integration and retained changes

Fetched main and reviewed dependencies. Started the dedicated branch from the validated leak fix, then replayed that fix onto current main. Original investigation/implementation branches, reports and commit objects remain intact. Accepted A/B source changes were extracted separately rather than importing their investigation diagnostics or reports wholesale.

| Included commit | Origin / purpose |
| --- | --- |
| `3a1abb8` | Latest fetched main, including its graphics auto-detection and Ultra profile changes |
| `9bd9d8c` | Replay of validated `fcfc409`: borrow the retained gameplay camera identity for hidden Blackout transmission draws, restoring the authored view/state afterward |
| `5f04fc6` | Accepted A from `52d58ca`: prepare the Containment plaque shader before readiness |
| `f8ba542` | Accepted B from `51f8723`: prepare clipping seeds before expensive submissions, with focused tests |

The final source, asset generators, Vite configuration, credits and dependency manifests were checked against `f8ba542` after rollback and match it exactly. Remaining additions are this report, compact evidence and diagnostic scripts. No quality, texture, lighting, transmission, timing, camera choreography, gameplay or readiness/fence settings were changed for D in the retained build. Latest-main profile changes are preserved, including High's balanced transmission; these are not changes introduced by this task.

## Measurement protocol and results

Native headed Chrome on this Windows laptop / Intel UHD 620; Medium, 1920×1080, DPR 1. Three independent browser launches produced three fresh/warm pairs for the combined baseline. HTTP response routing exposes runtime owners and disables HTTP cache; “warm” means the second navigation in the same browser/driver process, not a cached-download benchmark. OS/driver caches and existing background workload were not controlled. Request-to-ready is the real ready UI; control is the first input-eligible update following Enter. CPU frame observations are not optical presentation timestamps.

The measured baseline includes A, B and the leak fix. It is not the earlier Phase 3 baseline. Its request interval includes the real asset/preparation path. Candidate intervals additionally include bank request, decompression, parsing and preparation. No preloaded diagnostic JSON was substituted into these timings.

| Capture | Samples | Request→ready | Post-film wait | Request→control | Film wall time | Longest film RAF gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Combined baseline, fresh, median | 3 | 95.740 s | 40.692 s | 95.765 s | 53.204 s | 19.0 ms median; 19.5 ms worst |
| Combined baseline, warm, median | 3 | 57.073 s | 2.579 s | 57.085 s | 53.205 s | 22.4 ms median; 22.7 ms worst |
| Rejected D pilot, worker heap sampled | 1, failed | 74.407 s | 16.346 s | 74.427 s | 55.829 s | 416.4 ms |
| Rejected D cleanup correction, no heap sampling | 1, failed | 78.600 s | 20.704 s | 78.630 s | 56.101 s | 412.5 ms |
| Restored combined source, final staged-progression capture | 1 | 89.841 s | 32.079 s | 89.865 s | 56.062 s | 418.5 ms |

Individual fresh baseline waits were 40.722, 40.692 and 38.446 seconds; ready times were 95.811, 95.740 and 93.516 seconds. The failed candidates' apparent wait reductions are **not a qualified improvement**: film playback lengthened and GL validation failed. The final restored capture also lengthened and stalled under the existing workload, with zero GL errors; timing variability therefore limits causal conclusions about D's frame pacing and performance. There is no valid optimized median or three-pair matched optimized cohort. Planned optimized captures stopped on hard assertions rather than collecting more unsafe runs. Shipping post-film improvement attributable to D: **none; D was removed**. The separate intrusive GL diagnostic is excluded from timing comparisons.

## Rejected implementation and investigation

The real production candidate used the existing WebGL context, one outstanding compiler job, `KHR_parallel_shader_compile` completion and link status, and no speculative draws. Admission started after the first visible authored frame plus two animation frames. Skip/completion/cancellation stopped admission and terminated the worker. Original mandatory preparation and final fences remained in place. Settings/context loss/failure/stale data selected the original path; no second Three.js instance or renderer was introduced.

A generated bank captured the actual required program combinations for current Medium/High configurations. Source/installed-Three fingerprints and capability checks rejected incompatible data. Both profile captures produced the same exact source sets, allowing one shared asset. Lossless stage/line deduplication reduced 147 program/binding combinations, 211 unique stages and 2,821 lines to approximately **74.6 kB compressed / 1.199 MB decoded JSON**. A worker fetched, decompressed and parsed the bank. Relative build asset URLs, bounded decoded/source sizes and explicit cancellation were implemented. Stale-source detection and exact-stage round trips were tested. This avoided shipping the old 13 MB catalog, but did not make the compiler behavior safe enough to retain.

The pilot admitted 109 jobs and completed 108; requested creation/deletion counts were 109/109 programs and 218/218 shaders. An intrusive per-call GL trace located error 1281 at `deleteShader` in completion cleanup. Marking attached shaders for deletion before deleting their program, following Three's order, was tried and tested. The clean repeat still recorded 1281 with 108/108 program and 216/216 shader create/delete requests, and a 412.5 ms frame gap. Requested deletion counts do **not** prove successful native cleanup in a run with GL errors. No error was accepted, suppressed or cleared to manufacture a passing result. No private Three cache was changed.

The pilot's main-thread sampled heap peak was 144.603 MB, compared with fresh baseline peaks of 132.825–138.330 MB. Worker `Runtime.getHeapUsage` had 55 samples, a peak used heap of 2.951 MB and no sampling errors. These are separate heaps; sampled maxima are not total process memory or peak VRAM, and simultaneous peaks are not established. The repeat without worker inspection peaked at 145.772 MB on the main heap. The smaller bank controlled delivery/CPU storage reasonably, but native GL and cinematic pacing failures remained decisive. Low per-call submission/polling times did not guarantee smooth GPU presentation.

Five focused candidate unit cases covered lossless encoding, first-paint/one-job scheduling, cancellation, failure/settings handling and context invalidation. They passed during development. They and all candidate production/generated files were removed with D; they are not counted as shipping regression coverage. The rejected source is preserved only as an ignored local patch at `artifacts/final-loading/rejected-opening-warmup.patch`, SHA-256 `1bf83d5818cc034cb05b195f1f5a7bacdc7a5bcdf7515b7783b31cbc54d2dac1`, with file/source provenance in `rejected-source.json`.

## Verification

Before trying D, the combined baseline passed **589/589 unit tests**, type checking, production build and production-layout validation (205 files). Native Chrome passed all five targeted browser cases: the three Blackout lifecycle/cancellation cases and the two clipping-restoration cases (parallel compilation enabled/disabled). Tests and expectations were preserved.

After complete rollback, **589/589 unit tests**, type checking, build and production-layout validation passed again. `npm run archive` created and validated the nested-host-compatible production ZIP (72,303,157 bytes). Build output retains its existing large-chunk warning.

`npm run check:generated-assets` exited nonzero at the existing Containment lighting text comparison. All preceding generators passed. The generator, source GLBs and tracked bake match current main exactly. An ignored diagnostic copy using LF-normalized text comparison passes, establishing a CRLF/LF false-stale result in this checkout. Neither the generator, generated bake nor expected output was changed to hide the failure. Later generators in that serial command were not reached; this is not reported as an all-assets pass.

Final restored-build natural-opening/staged progression passed through all three levels, with zero captured page/console errors, zero GL errors and movement displacements of 1.131 m, .856 m and .947 m. Level 1 retained the same 162 exact program/cache-key/vertex/fragment fingerprints as the combined baseline; no `linkProgram` calls occurred in any level's first ten seconds of control. Final Level 1 preparation still reports zero measured/burst geometry and program deltas. Its timing variability is disclosed in the table above. Gameplay screenshots for all three levels were inspected; these are sampled visual checks, not a pixel-difference qualification.

The fresh **ten-cycle Medium Blackout** trace passed plateau/target-ownership assertions. Every gameplay sample had 94 renderer textures / 137 programs; every menu sample had 10 / 13. Native gameplay counts held at 98 textures / 7 renderbuffers; menu counts held at **14 / 4**. The single retained gameplay transmission target stayed 320×180 (640×360 canvas, .5 Blackout scale), with the same allocation identity from prepared-before-Enter through gameplay and menu in each cycle. No per-cinematic target accumulated. Gameplay geometry count settled from 884 on first entry to 894, with menu geometries constant at 12; texture/renderbuffer counts did not grow. The protocol includes actual arrival, pause/restart, death/retry, menu return and re-entry, with no forced garbage collection.

Two supplementary **High** cycles have the same stable texture/program counts and native resource plateau. Its retained transmission target is 480×270 at the current main's .75 scale, preserving that profile's expected extent. All twelve cycles completed without captured page/console errors. Native traces record allocation/deletion requests and owner identities; these are object counts rather than VRAM measurements.

The final native Chrome suite passed **4/4 cases (2.6 minutes)** against the actual ZIP served at `/group-folder/`: standard normal/performance opening framebuffer completeness (including omitted MP4 backup), Minimum immediate Skip/start/restart, and staged Cultivation completion→Blackout entry/restart/menu. Together with the five combined-baseline rendering/cancellation cases, all nine selected browser cases passed. The transition fixture uses the real coordinator with staged completion, not a full puzzle playthrough. No browser expectation was weakened.

## Scope and limitations

The retained camera fix's previous authored camera/program/screenshot comparisons and full research/defeat journeys remain documented in [its report](blackout-transmission-leak-fix-results.md). The combined branch introduces no further cinematic rendering change. New captures include real rendered gameplay screenshots and shader/resource observations, but do not establish universal pixel identity or a complete legal three-level playthrough. Progression diagnostics stage completion events through the real coordinator.

Previously reproduced unrelated browser limitations are preserved: the missing `distant-shaft-bottom` fixture lookup, the global reduced-transmission-scale assumption, and old-context cleanup errors during forced in-place restoration. They were independently reproduced on the earlier main in the leak-fix investigation; this report does not claim they were repaired or newly qualified on current main. Ordinary cancellation/lifecycle checks are distinct from forced context recovery.

No Ubuntu lab, other GPU/browser, Ultra performance, peak VRAM or exhaustive forced-loss matrix qualification is claimed. Rejected D captures cannot establish compatibility or leak freedom. Native results here are local measurements under the existing workload. The reliable fixes are the stopping point; no push, PR or merge was performed.

## Evidence and reproduction

[Compact measurements](final-loading-optimization-evidence.json) retain raw SHA-256 identities, build manifests, timings, program coverage, error states, input/resource observations and lifecycle allocation/deletion summaries. Raw logs, screenshots, captures and the rejected patch remain ignored under `artifacts/final-loading/`.

Run GPU checks sequentially against a production preview. Baseline timing: `node scripts/diagnostics/investigate-level-loading.mjs --profile --levels 1 --opening natural --pairs 3 --passes 2 --observe 10 --output OUTPUT`. Staged progression adds `--route progression` and uses one pass. `--worker-heap` and `--trace-gl-errors` are intrusive diagnostic modes, excluded from qualified timing. Lifecycle: `node scripts/diagnostics/investigate-texture-cycles.mjs 10 OUTPUT standard`; select `high` for the supplementary profile. `summarize-final-loading.mjs OUTPUT.json RAW.json...` builds the compact record without converting failed captures into successes.
