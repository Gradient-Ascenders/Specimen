# #196 — sustained simulation-time loss

**Result:** state-aware diagnostics and stall/recovery checks are implemented.
Selected local routes show **0 ms / 0% active loss in both builds**; assessment
hardware and tolerance qualification remain unresolved.

Work for [#196](https://github.com/Gradient-Ascenders/Specimen/issues/196),
parent [#187](https://github.com/Gradient-Ascenders/Specimen/issues/187).
Baseline: `ffa6bd6a541239fb57a9155c2d56bf3e5b1f4605` (latest fetched main).
Candidate: `91fcc16995921fa4153bac0e8033da6458c0fcde`.
The working checkout was clean; implementation uses the primary checkout on
`perf/issue-196-simulation-time-loss`. Other worktrees were left untouched.

## Decision and diagnostic contract

Keep 60 Hz, the 100 ms clamp and the six-step cap. A 500 ms frame still admits
at most 100 ms and drops 400 ms. Raising the cap would hide rendering stalls
and increase catch-up work. No gameplay timing, rendering, collision or beam
algorithm changes are included. Issues #188–#195 are closed on the baseline;
closure alone does not establish a sustained-loss tolerance on this hardware.

Flight-recorder schema 3 appends `fixedDeltaMs` and `simulationState` columns;
existing column positions remain intact. `summary.simulationTime` includes:

- `eligibleElapsedMs`: raw frame intervals in stable playing, fixed-step
  cutscene and recovery states, while Loop admits focused/visible frames.
- `droppedActiveSimulationMs` and `lostPercent`: dropped time divided by that
  eligible elapsed time; an empty denominator produces `null`.
- `eligibleFixedStepMs`: scheduled fixed-step callbacks × configured step size.
  This is admitted simulation progression, not proof that every subsystem ran
  on every tick. Accumulator remainder and resets can prevent exact equality
  with elapsed minus dropped; never call it elapsed wall time.
- `totalLoopDroppedMs`: drops including loading/menu/boundary frames. Loop can
  tick behind menus while gameplay is deliberately stopped; those drops are
  excluded from active loss.
- `states`: constant-storage totals for loading, playing, cutscene, paused,
  recovery, inactive and boundary. A state/level/room change between the prior
  frame, frame start and frame end is conservatively a boundary, never silently
  included in a playing-only comparison. Multiple transitions entirely between
  samples are not observable.
- `unobservedGapMs`: timestamp gaps absent from raw Loop intervals, normally
  blur/visibility/explicit clock resets. These are excluded, not active loss.
  This cannot distinguish individual reasons or measure a trailing hidden
  interval before another frame arrives. Recorder start/stop tails are excluded.

The first frame's interval is excluded because it may predate recorder start.
Whole-session totals survive bounded raw-history/hitch-window eviction; partial
raw windows cannot be used for whole-session quantiles. Stop freezes session
duration. Start resets all aggregates. Sampling allocates no new objects;
snapshot/export may allocate. The recorder remains debug-only and opt-in.

Session snapshots override retained runtime phases during loading and menu
pause. Level 3 now exposes death state rather than its retained gameplay phase.
Volt release is marked as a cutscene; the latched `room-three-complete` puzzle
marker is not a running cutscene. The opening movie runs while gameplay is
unloaded/stopped and is deliberately excluded from eligible simulation time.

## Clock and behaviour checks

| System | Clock and expected stall behaviour | Evidence |
| --- | --- | --- |
| Input | Browser events accumulate until admitted ticks; a press/release edge is consumed once, held charge uses fixed steps | `LoopGameplayStalls` plus existing Input coverage |
| Body, movement, charge/jump | KinematicBody integrates fixed dt; no wall-time jump impulse or movement catch-up | Stalled and normal admitted-step journeys compare equal |
| Laser hazards | Fixed-step timeline and latched recovery; no extra contacts per rendered frame | Real LaserHazardSystem in the integrated journey |
| Drone projectiles | Pooled swept progression, lifetime and range use admitted dt | Real projectile travels 1 m at 10 m/s after six steps, even across 1 s wall time |
| Recovery | DeathSequence burst clock uses fixed dt; retry runs retained recovery once | Integrated journey reaches gameOver then retries once |
| Gameplay release/cutscenes | Room 5 release, Containment ending and Blackout merge use fixed dt; progress slows under discarded active time | Real CultivationRoomFiveController integration; other clocks source-audited |
| Sound effects | Web Audio `AudioContext.currentTime` schedules samples/limiter; audio can continue while the main thread stalls. Gameplay loop intents update at fixed ticks; pause/focus suspend context | Production browser stall/charge regression and existing GameplayAudio tests |
| Music / opening movie | Media playback is independent; music crossfade uses sixteen 25 ms callbacks and can stretch under stalls. Movie blackout fade uses clamped render dt | Source audit; full media synchronisation during stalls not qualified |
| Camera / cosmetic presentation | Render interpolation and clamped frame dt; presentation cannot advance authoritative bodies | Loop alpha bounds, production body/camera capture validation |

Controlled tests cover 100/500/1000 ms frames, 20 repeated stalls, step caps 2
and 6, conservation including interpolation remainder, backlog-free recovery,
blur/visibility/focus, explicit pause/resume and disposal. The integrated journey
uses real components with injected timestamps; it is correctness evidence,
not GPU performance evidence or a full puzzle playthrough.

## Reproduction

Node `v24.19.0`, npm `11.18.0`; dependencies already installed. Fresh setups use
`npm ci`. From the repository in PowerShell:

```powershell
npm run build
$env:PROFILE_LABEL = '196-candidate'
$env:PROFILE_RECORDER = '1'
$env:PROFILE_RUNS = '1'
$env:PROFILE_SCOPE = 'beta'
$env:PROFILE_HEADLESS = '0'
$env:PROFILE_KEY_MS = '2000'
$env:PROFILE_PRESET = 'performance'
$env:PROFILE_RESOLUTION_CAP = '1'
node scripts/profile-performance.mjs
node scripts/summarize-performance.mjs 196-baseline-final 196-candidate
```

Build the baseline in a separate checkout or before candidate edits. Reuse the
same repaired profiling script for both builds: the baseline harness's Level 1
constructor hook predates the current composition root and omitted opening
handoff and bypassed the completion handler that unlocks Goop. The repaired
harness observes `initialRuntime`, uses the opening UI and controller completion
contract, and leaves production content intact. It records git SHA, OS, asset
hashes, browser/backend and applied graphics settings. Do not run other tests
or GPU workloads concurrently with captures.

The beta route stages L1/R1, L2/R5 Bob then Goop, and L3/R1 through existing
debug/reset contracts. It uses real pointer lock, camera movement, jump and
opposing W/S/D/A moves (four × 500 ms, repeated four times). It rejects wrong
state, death/cutscene contamination, stationary actor/camera, missing raw frames,
non-draw frames and GL errors. Debug enables diagnostics; all authored production
rooms remain loaded. Staging is not a native traversal/combat completion claim.

```powershell
node --test tests/LoopPerformanceProfiler.test.ts tests/SimulationTimeSummary.test.ts tests/LoopGameplayStalls.test.ts tests/PerformanceFlightRecorder.test.ts tests/GameSessionCoordinator.test.ts
npm run type-check
npm test
npm run build
$env:SPECIMEN_BROWSER_CHANNEL = 'msedge'
npx playwright test tests/smoke/SimulationTimeLoss.spec.ts tests/smoke/ProductionSmoke.spec.ts --config playwright.smoke.config.ts
node docs/evidence/196/summarize-captures.mjs
```

For ordinary local play use `npm run dev`; for the production build use
`npm run preview`. Nested-path checks use `playwright.smoke.config.ts` and the
deployment guidance at `docs/operations/deployment.md` (the old path mentioned
in AGENTS.md no longer exists).

## Measurements and qualification

Available device is Intel UHD 620
through hardware ANGLE D3D11 on Windows 11 Pro 10.0.26200, Edge 155.0.4283.62.
Viewport 1280×720, requested DPR 1, applied effective DPR 0.75 / 960×540 buffer,
Minimum hardware profile + Performance preset. Focus/visibility are validated
by the harness. This is fresh local evidence, not historical UHD 620 results
and not the Dell Precision 5570 or the assessment PC. Driver cache, power,
thermals and background OS activity are uncontrolled.

Numbers are baseline → candidate. Both exclude the initial interval because it
may predate recorder start; candidate rows must also be classified `playing`.
All retained raw frames are present and post-stop harness frames are excluded.
Quantiles use sorted index floor(N×p); hitch thresholds are strict. Every capture
passed state, focus/visibility, actor/camera movement and raw-coverage checks,
with no browser errors, asset failures or GL errors. Both level handoffs passed.

| Route | Eligible frames | Eligible / fixed-step seconds | Frame p50/p95/p99 ms | >50/>100/>150 ms | Dropped ms / % |
| --- | --- | --- | --- | --- | --- |
| L1/R1 Bob | 513 → 521 | 9.215/9.217 → 8.681/8.683 | 16.7/33.2/50.0 → 16.7/16.8/16.9 | 4/0/0 → 0/0/0 | 0/0 → 0/0 |
| L2/R5 Bob | 521 → 522 | 8.681/8.683 → 8.698/8.700 | 16.7/16.8/17.0 → 16.7/16.8/16.9 | 0/0/0 → 0/0/0 | 0/0 → 0/0 |
| L2/R5 Goop | 507 → 519 | 8.748/8.750 → 8.648/8.633 | 16.7/17.0/33.3 → 16.7/16.8/16.8 | 0/0/0 → 0/0/0 | 0/0 → 0/0 |
| L3/R1 Bob | 441 → 521 | 8.781/8.783 → 8.681/8.683 | 16.7/33.3/33.5 → 16.7/16.8/16.9 | 0/0/0 → 0/0/0 | 0/0 → 0/0 |

| Route | Mean update CPU ms | Mean render CPU ms | Mean GPU ms | Valid GPU / eligible frames |
| --- | --- | --- | --- | --- |
| L1/R1 | 1.79 → 0.64 | 9.37 → 6.11 | 10.54 → 6.87 | 512/513 → 520/521 |
| L2/R5 Bob | 1.37 → 1.33 | 5.03 → 4.88 | 7.39 → 7.86 | 520/521 → 521/522 |
| L2/R5 Goop | 1.24 → 1.13 | 5.91 → 4.48 | 11.09 → 8.89 | 501/507 → 518/519 |
| L3/R1 | 0.95 → 0.75 | 8.26 → 4.83 | 14.28 → 8.79 | 437/441 → 520/521 |

Total eligible elapsed is **35.425 → 34.709 seconds**, with zero active drops.
Recorder overhead averaged 0.15–0.27 ms/frame. GPU numbers use completed valid
queries only, with zero disjoints; scope includes renderer/preparation submissions,
not an isolated pass. CPU/GPU intervals overlap and must not be added.

Single short runs establish no causal performance improvement. Navigation to
control was 189.07 → 50.30 s; L2/L3 handoffs were 184.58/46.41 → 19.52/9.76 s.
These include UI/preparation and are not controlled cold/warm loading benchmarks.
Focus is qualified for sampled gameplay, not every loading interval. No evidence
here justifies a timing change or attributes a gain to individual #188–#195
algorithms. Worst-case rooms and minimum-target qualification remain open.

`captures.json` retains source SHA, bundle hashes, environment and validation.
Eight `.json.gz` files retain unmodified recorder exports; the small
`summarize-captures.mjs` reader decompresses/deduplicates them and recomputes these
tables. Large harness traces stay ignored. Room 5 captures sample encounter-room
movement, not native combat/puzzle completion.

## Verification results

| Command/check | Result |
| --- | --- |
| Targeted command above | 43 passed |
| `npm run type-check`; `npm run build` | Passed; existing large-chunk advisory |
| `npm test` in sandbox | 1154/1156; Windows denied symlink creation and the existing music test failed |
| `npm test` outside sandbox | 1155/1156; only `BackgroundMusic.test.ts:81` failed |
| `node --test --test-concurrency=1 tests/*.test.ts` outside sandbox | 1155/1156; same music failure |
| `node --test tests/BackgroundMusic.test.ts` | 4/5; same failure in isolation. Implementation/test bytes match baseline; the 455 ms deadline precedes completion of sixteen scheduled callbacks on this host. No check was weakened. |
| Browser command above | 3 passed (2.5 min): plain nested-path startup/restart, all-level transitions/restarts, controlled stall/audio/pause/restart |
| `npm run validate:production` | Passed, 71 files |
| Both profile runs; both summarizers; `git diff --check` | Passed |

The production stall regression confirms six admitted steps / 900 ms dropped for
an injected 1 s frame, bounded interpolation, independent Web Audio time during
a 500 ms main-thread stall, the existing launch sound, context suspension on
pause and restart. Bob deliberately has no charge loop in the current palette.

## Acceptance status

1. **Satisfied:** controlled long-frame bounded-work/interpolation/visibility
   tests and the production stall regression.
2. Accepted representative gameplay meets explicit sustained-loss tolerance:
   **unresolved**. #198 is open and has no numeric loss budget or verified
   minimum-target specification. No performance acceptance claim is possible.
3. **Partial:** proportional integrated/browser checks cover the listed clocks;
   native combat completion and full visual cutscene/media qualification
   remain outstanding.
4. No improvement via unbounded catch-up or gameplay speed changes: satisfied
   by unchanged Loop policy and gameplay semantics; independent review required.

Use `Refs #196` and `Refs #187`; do not close #196 based on diagnostics/tests
alone. Issue triage still needs an assigned owner and independent reviewer.
