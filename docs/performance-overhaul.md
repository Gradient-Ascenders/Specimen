# Performance overhaul: verified checkpoint

Branch: `codex/performance-overhaul`, based on `cf8fbf2` (main including PRs #180 and #181). Implementation commits: `5925905` and `7de95d5`. The old experiment branch and Room 2 texture work were not changed. Nothing was pushed and no PR was created.

This checkpoint improves Level 1 startup and fixes preparation correctness. **The overall performance targets are not achieved:** authored Level 2 still takes about a minute to enter, later-room stalls remain, and a complete continuous puzzle/combat traversal has not been measured. Further shader sharing was rejected because it slowed gameplay. No warmups, shadows, texture quality, gameplay content, or default quality settings were removed to produce these results.

## Measurement scope

Windows, Node 24.19.0/npm 11.18.0, hardware Edge through ANGLE D3D11, Intel UHD 620, 1280×720 at DPR 1. The GPU exposes 16 fragment texture units. These are production Vite builds, with runtime instrumentation injected by the diagnostic harness rather than shipped. Level 2 measurements explicitly use its debug-enabled fully authored environment; release content gating is unchanged.

The final matched pair is `gpu-main` versus `gpu-candidate`, one fresh browser profile each, with no concurrent tests or JSON analysis. Browser/driver shader caches cannot be completely controlled. Earlier independent runs provide variation rather than statistical confidence. Room samples contain only roughly 44–181 frames. Tail percentiles and 1% lows are descriptive, especially with such small samples.

For room measurements the harness stages the same authored room, settles for one second, then sends real W/D/S/A input for 900 ms each. It waits for Level 2 preparation to finish and an actual draw before sampling, excluding fake smoothness from loading-overlay frames. Positions and camera poses are recorded; timing can still change movement endpoints, deaths and cutscenes. Transitions are driven through completion events. **These are short movement samples, not a complete native continuous traversal through lifts, drones, acid, combat and machinery.** Existing browser regressions cover additional movement/climbing/reset contracts but do not fill that measurement gap.

GPU timer queries cover the runtime render interval, including preparation and submission gaps, rather than an isolated raster pass. Disjoint results are discarded. Fixed CPU time is the sum of simulation steps in a displayed frame; catch-up frames can contain six steps. Render CPU time is main-thread submission, not GPU execution. Instrumentation itself adds overhead. Geometry/texture counts are resource counts, not byte measurements; tagged instance buffer bytes are not total GPU memory.

## Verified causes and retained changes

1. **Level 1 light-layout permutations dominate startup.** Nine authored room/door lighting overlaps produced 306 programs. Two padded signatures produce 99, preserving all real light parameters. Zero-radiance padding uses up to five allocated 1×1 shadow maps (ten additional texture objects including depth). The finite-light guard skips padding mathematics. Physical-material spot-light behavior remains unchanged. Frozen-pose comparisons produced identical pixels in Rooms 3/5 and a maximum one-channel difference of 1/255 in Room 1. The diagnostic GPU comparisons were contended by a unit worker, so their timings are not used as authoritative frame-performance evidence.
2. **Authored Level 2 still spends most of entry in shader preparation.** In the final candidate, entry preparation is 7.87 s and mandatory maintenance is another 49.84 s. Construction is 4.08 s; explicit queue texture initialization is only 0.014 s. Increasing compile/prime batches did not solve this and was reverted. Moving work behind gameplay is not counted as a loading improvement.
3. **Instance primers were uploading clone storage.** Primers now borrow the actual source instance matrix, colour and morph storage, including separate instances sharing a geometry. Disposal restores proxy-owned storage before disposing it. Level 2 live tagged instance uploads fell from ten/16,448 bytes to one/512 bytes; the remaining service-bay trim allocation is not claimed fixed. Blackout's two live uploads/2,280 bytes moved into preparation. Tests verify source storage survives proxy cleanup.
4. **Invalid and repeated Level 2 light states caused avoidable work.** Entry visibility is established before Goop's death primer; previously all authored roots could contribute an illegal shader exceeding the 16-sampler limit. Main emitted two sampler errors; candidate emitted none. Refreshing the empty light state now follows actual isolated preparation draws or visibility changes: the measured Room 5 refresh count fell from 43 to zero. Speculative background preparation pauses in Room 5; required current resources remain guarded, and all destination warmups remain present.

Implementation details:

- `src/render/ContainmentLightLayout.ts`: owns padded light families and their shadow-map teardown.
- `src/levels/GreyboxLevelRuntime.ts`: prepares materials and synchronizes the layout during every original warmup and live lighting change.
- `src/render/environment/cultivation/FiniteLightEvaluation.ts`: idempotent finite-light guards; cache-key normalization preserves inherited custom-hook ordering.
- `src/render/ShadowPrewarmMaterial.ts`: shared source-buffer-aware proxy helper.
- `src/render/CultivationPreparationQueue.ts`: primes each actual instance buffer, marks it uploaded only after drawing, reports entry/startup time separately, and tracks render-state revisions.
- Cultivation and Blackout preparation/runtime owners use those proxies and dispose them with their existing lifecycles. Physics, authored colliders, input ownership, reset order and assets are unchanged.

## Loading breakdown

Times are seconds. Startup work happens before the title's Play button becomes ready; navigation-to-control must not be mislabeled as a delay after pressing Play.

| Stage | Main | Candidate |
|---|---:|---:|
| Level 1 navigation → responsive control | 60.416 | 29.296 |
| Navigation → Play ready | 60.246 | 29.139 |
| Play click → responsive control | 0.170 | 0.157 |
| Level 1 construction | 1.003 | 1.872 |
| Level 1 preparation | 58.119 | 25.881 |
| Lighting warmup loop, within preparation | 57.794 | 25.506 |
| Compile waits, within lighting loop | 53.794 | 21.279 |
| Resource primer draws, within lighting loop | 3.942 | 4.169 |
| Level 1 unload during handoff | 0.199 | 0.057 |
| Full authored Level 2 transition | 70.340 | 62.361 |
| Level 2 construction | 5.247 | 4.085 |
| Level 2 preparation | 64.199 | 57.834 |
| Queue entry preparation | 9.795 | 7.869 |
| Queue mandatory maintenance | 54.045 | 49.838 |
| Queue texture initialization | 0.024 | 0.014 |
| Queue primer draws | 0.779 | 0.552 |
| Largest synchronous queue step, milliseconds | 63.2 | 48.3 |
| Level 3 transition | 17.535 | 18.358 |
| Level 3 construction | 0.180 | 0.142 |
| Level 3 preparation | 16.495 | 17.265 |

Nested asynchronous compile totals overlap other phase measurements and must not be added to wall time. The queue historically called entry plus maintenance `initialMs`; candidate reports the distinction. Module loading, collision construction, individual Bob/Goop asset preparation, shadow-only draws and upload time are not all separately isolated. The unassigned Level 2 transition residual is about 0.89/0.44 s; it is not a precise module-import measurement. Explicit queue GPU preparation is only part of total GPU initialization. No fabricated complete attribution is supplied.

Independent earlier runs: main Level 1 60.666 s, authored Level 2 65.068 s, Level 3 20.406 s; candidate Level 1 40.569/32.357 s, Level 2 75.345/72.642 s, Level 3 19.330/17.588 s. Thus Level 1's large improvement is supported across runs; **Level 2's 11% reduction in the final pair is not a robust or dramatic loading fix**, and Level 3 variation is not credited as an optimization.

The old experimental commits were evaluated on their own common asset base, not automatically cherry-picked. Old parent `97e5dc0` measured 66.624 s cold-profile / 5.735 s immediate repeat; experiment `6e92794` (including `ff64cab`) measured 60.992 / 6.126 s. This did not reproduce the reported loading regression. Shader-cache sensitivity is clear, but it does not establish why the user's earlier build regressed. Comparing the old experiment directly with newer Goop assets would not isolate its cause.

## Frame delivery and GPU cost

Each cell is main → candidate. Frame times are milliseconds; FPS is 1000 / mean cadence. The 1% low is 1000 / the mean of the slowest ceil(1% × N) frame intervals. Quantiles use sorted sample index floor(N × percentile), capped to N−1.

| Level/room | Frame p50 | p95 | p99 | Mean FPS | 1% low FPS | GPU p50 | Fixed CPU p50 | Render CPU p50 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| L1/R1 | 33.4 → 33.3 | 50.1 → 49.9 | 183.2 → 50.1 | 26.7 → 34.8 | 5.5 → 10.0 | 32.1 → 22.7 | 0.8 → 0.6 | 9.8 → 9.2 |
| L1/R3 | 33.1 → 16.7 | 49.9 → 33.4 | 116.6 → 83.2 | 36.5 → 49.4 | 7.5 → 9.2 | 20.5 → 13.8 | 0.2 → 0.1 | 8.1 → 6.0 |
| L1/R5 | 33.3 → 17.0 | 50.1 → 33.4 | 66.8 → 33.5 | 33.0 → 40.4 | 10.9 → 29.8 | 23.8 → 19.6 | 0.1 → 0.1 | 20.6 → 20.9 |
| L2/R1 | 33.3 → 16.9 | 50.0 → 33.4 | 83.3 → 66.8 | 33.0 → 39.1 | 10.9 → 12.0 | 26.4 → 21.9 | 2.6 → 2.2 | 11.4 → 10.9 |
| L2/R2 | 33.3 → 33.3 | 83.3 → 50.2 | 99.9 → 116.7 | 28.3 → 27.5 | 10.0 → 8.0 | 29.3 → 30.7 | 2.5 → 2.9 | 11.2 → 13.4 |
| L2/R3 | 33.4 → 33.4 | 50.1 → 50.1 | 50.2 → 50.1 | 25.4 → 25.6 | 19.9 → 20.0 | 34.7 → 35.7 | 4.4 → 4.4 | 21.1 → 22.7 |
| L2/R4 | 50.0 → 50.0 | 116.5 → 66.7 | 166.6 → 99.9 | 17.9 → 19.1 | 6.0 → 10.0 | 49.0 → 48.4 | 3.6 → 5.6 | 21.2 → 28.7 |
| L2/R5 | 83.4 → 83.3 | 149.9 → 100.0 | 300.0 → 299.9 | 11.0 → 12.6 | 3.3 → 3.3 | 88.4 → 76.6 | 28.8 → 25.0 | 12.6 → 10.8 |
| L3/R1 | 33.2 → 16.8 | 50.1 → 50.0 | 50.5 → 50.1 | 33.8 → 36.1 | 17.1 → 19.9 | 18.5 → 16.9 | 0.7 → 0.6 | 2.9 → 2.8 |
| L3/R2 | 49.8 → 33.4 | 83.3 → 66.8 | 99.9 → 83.4 | 21.2 → 23.4 | 10.0 → 12.0 | 34.1 → 31.3 | 0.1 → 0.1 | 7.1 → 6.0 |

All measured real gameplay draws introduced zero new programs. This does not prove that background preparation is harmless along every native arrival route. Level 2 staged entry waits remain: Rooms 2/3/4 took 9.40/13.33/14.19 s on main versus 9.08/12.18/12.51 s on candidate. They are real blocking overlays and are reported separately, not counted as gameplay frames.

Room 5 is still far over a 16.7 ms budget: median GPU interval 76.6 ms, plus 25 ms of fixed work across catch-up steps. A contended 20-second diagnostic saw gaps up to 383 ms with no contemporaneous cold program or preparation completion. GC alone did not explain them. That trace is excluded from the controlled comparison because a unit worker was running. **The precise cause of every 100–350 ms gap remains unresolved.** Source inspection identifies many moving searchlight shadows, point-light cube faces, physical transmission and catch-up simulation as investigation targets, not independently measured causes of the full gap.

A frozen-scene diagnostic under the rejected sharing prototype showed shadow updates contributing approximately 10.2/1.6/3.5 ms in Level 1 Rooms 1/3/5, with identical cached-shadow pixels at that frozen pose. This is not a live Level 2 shadow budget or permission to stop shadow updates. The integrated GPU does not sustain 60 FPS at default quality in the heavy views measured here.

## Resource evidence

Calls/triangles include shadow and transmission rendering as reported by Three.js. End-of-sample values can vary with the movement endpoint. Resource counts do not imply byte-accurate memory or prove an absence of leaks.

| Sample | Main calls / triangles / geometries / textures / programs | Candidate |
|---|---|---|
| L1/R1 | 353 / 185326 / 604 / 60 / 306 | 351 / 178414 / 604 / 70 / 99 |
| L1/R3 | 237 / 39684 / 604 / 60 / 306 | 237 / 39684 / 604 / 70 / 99 |
| L1/R5 | 486 / 164472 / 604 / 60 / 306 | 486 / 164472 / 604 / 70 / 99 |
| L2/R1 | 164 / 169703 / 529 / 88 / 211 | 164 / 169703 / 529 / 59 / 197 |
| L2/R2 | 382 / 145540 / 665 / 88 / 288 | 381 / 138706 / 674 / 63 / 274 |
| L2/R3 | 737 / 505276 / 792 / 90 / 363 | 737 / 505276 / 793 / 69 / 349 |
| L2/R4 | 557 / 571941 / 820 / 92 / 462 | 559 / 578853 / 821 / 73 / 443 |
| L2/R5 | 159 / 45761 / 833 / 92 / 479 | 159 / 45761 / 834 / 92 / 450 |
| L3/R1 | 211 / 56756 / 436 / 56 / 86 | 211 / 56756 / 436 / 56 / 81 |
| L3/R2 | 279 / 10612 / 436 / 56 / 86 | 286 / 11544 / 436 / 56 / 81 |

Tagged actual instance buffer uploads:

| Level | Main preparation / live | Candidate preparation / live |
|---|---|---|
| 1 | 166 / 46072 bytes; none live | 166 / 46072 bytes; none live |
| 2 | 8 / 9960 bytes; 10 / 16448 bytes | 25 / 37944 bytes; 1 / 512 bytes |
| 3 | 6 / 9768 bytes; 2 / 2280 bytes | 8 / 12048 bytes; none live |

The number before each byte count is the allocation count. Heap samples and long-task records are available in raw artifacts, but no trustworthy attribution of heap growth or total GPU bytes was established. Restart/reload and ownership tests pass; exhaustive multi-cycle memory profiling remains outstanding.

## Rejected experiments

- Larger Level 2 preparation batches: did not consistently shorten entry; original scheduling limits retained.
- Dynamic finite-light loop counts: no meaningful loading gain; reverted.
- Shared canvas/offscreen shader output: reduced startup programs and authored Level 2 entry to roughly 48–52 s, but slowed gameplay. A same-page frozen-pose A/B still increased GPU time about 16% in Room 1 and 11% in Room 5. Pixel output was equal in Rooms 1/3 and differed by at most 2/255 in a small Room 5 area. The prototype was removed in accordance with the no-regression requirement; its source and evidence remain ignored. It is not a proposed ready-to-ship solution.
- Captures contaminated by concurrent workers or a large PowerShell JSON parser are excluded from the final matched pair. The first invalid visual baseline is also excluded; only the corrected comparison is used.

## Verification

- Targeted tests: 18 passed (finite-light behavior/cache keys, layout/disposal, preparation scheduling, source-buffer uploads).
- Full Node suite: 804/807 passed. Two unchanged Python-generator hash assertions fail because Windows checked the files out with CRLF while expected hashes match their committed LF bytes. The production symlink test fails with Windows EPERM. These environmental failures were investigated; checks were not weakened.
- Type-check and production build: passed. Vite retains its existing large-chunk warning.
- Hardware Edge browser regressions: 11 passed, covering Level 1 traversal/program stability, plain production prewarm, movement/reversal, sticky climbs, damage/death timing, reflections across restart/reload, authored Cultivation rooms/fade/death/cleanup, and Blackout movement/switch/merge/split/cleanup.
- Production validation: 27 files passed. Relative base and asset casing are preserved.
- Canonical `npm run archive`: blocked by missing `unzip.exe` on this machine. A Windows .NET ZIP fallback was created and extracted; all 27 file names and SHA-256 file contents matched `dist`. ZIP SHA-256: `143dc765577f6745cb7f5518379661429afec41c702d1b84ff72c19d18bf4bd6`. This is not a claim that the canonical archive command passed.
- Nested extracted-archive smoke on hardware Edge: plain production boot/credits/Play/restart passed. The authored transition/restart test reached Blackout but initially reported a maintenance-map HTTP 200 request ending in `net::ERR_ABORTED`; the unchanged test passed on its single retry (2.2 min). This intermittent request failure remains recorded, rather than claiming an entirely clean initial run. No route interception or runtime injection was used. The final extracted archive was rechecked against the current build: all 27 file hashes match.

No dependencies or third-party resources were introduced. No full native playthrough, exhaustive leak proof, uniformly responsive background-preparation proof, or elimination of later-room freezes is claimed.

## Reproduction and evidence

From this worktree in PowerShell, using the pinned Node/npm versions:

```powershell
npm ci
npm run build
$env:PROFILE_LABEL = 'candidate'
$env:PROFILE_RUNS = '2'
$env:PROFILE_GPU = '1'
node scripts/profile-performance.mjs
node scripts/summarize-performance.mjs candidate
```

Verification commands were `npm test`, `npm run type-check`, `npm run build`, `npm run validate:production`, and targeted Node tests for `FiniteLightEvaluation`, `ContainmentLightLayout`, `ShadowPreparation` and `CultivationPresentationPreparation`. Browser suites were `BlackoutBobPresentation`, `CultivationBobPresentation` and `LevelOneShaderProgramStability`, using an ignored local Playwright configuration selecting hardware Edge/D3D11, one worker and the existing 640×360 regression viewport. Nested smoke used `ProductionSmoke.spec.ts` against the extracted archive at `/group-folder/` with the same backend. Hardware settings for regression tests differ from the 1280×720 performance captures.

Run captures without concurrent builds, tests, parsers or GPU workloads. A fresh harness invocation launches a fresh browser profile; a second run within it uses a new context but retains process/driver cache effects. Immediate Level 1 repeats and repeats after a full game can have very different cache behavior. Use identical viewport, DPR, backend, paths and sequencing for comparisons.

Optional environment variables: `PROFILE_BROWSER` (default `msedge`), `PROFILE_HEADLESS=0` for headed diagnostics, `PROFILE_MODE=startup` to omit room samples, `PROFILE_SCOPE=one` to end after Level 1, `PROFILE_KEY_MS` (default 900), `PROFILE_ROOT`, and `PROFILE_DIST` for a preserved reference build. The harness instruments current minified composition-root constructors; a future build-shape change must fail visibly rather than silently treating missing data as success. Never compare foundation-only Level 2 with authored Level 2. Raw files, screenshots, cache keys, staged poses, environment, build asset hashes and summaries go under ignored `artifacts/performance-overhaul/<label>/`.

Final pair: `gpu-main/raw.json` and `gpu-candidate/raw.json` in this worktree. Earlier `matched-main`, `final`, `verified-visual-gpu` and isolated old-branch evidence live under the original checkout's ignored artifacts; the old experiment's capture is inside its extracted `experiment-source`. Rejected prototype captures are in this worktree's ignored `display-*` directories. These machine-local artifacts are intentionally not committed. Run `node scripts/summarize-performance.mjs gpu-main gpu-candidate` to regenerate the final summary.

The next useful investigation is a reproducible full native Level 2 route with separately timed shadow, transmission, render submission and fixed-step work, followed by a smaller verified shader-variant reduction that preserves GPU cost. The current evidence does not justify another unbounded shader rewrite or a claim that Level 2 is fixed.
