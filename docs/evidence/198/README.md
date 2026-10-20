# #198 — hardware qualification infrastructure

**Assessment execution is delegated to the lab teammate. Target evidence and final
budget approval are pending; this work does not close #198.** Start with the
[Ubuntu/Chrome handoff](LAB-GUIDE.md), [intake template](results-template.json) and
[proposed budgets](proposed-budgets.json). No Node installation is needed for the
browser collection workflow; the maintainer runs the evaluator after return.

Baseline: latest main `433ced5838e173d9cc37d3dccd332cae4638559b`, including PR #218.
Branch `perf/issue-198-hardware-budgets`, clean primary checkout at start; no other
worktrees touched. Game simulation, rendering/shaders/quality policies and
ordinary production content are preserved.

## Audit against the five acceptance criteria

| #198 criterion | Engineering delivered | Remaining sign-off |
| --- | --- | --- |
| Target spec, content, settings, routes, budgets | Hardware/graphics template; seven stable-room routes; configurable versioned proposal | Actual Ubuntu assessment GPU/driver/spec and approved numerical budgets |
| Valid focus/input/motion/state/coverage/GPU scope | Recorder schema 4 includes named input activity, pointer lock, active-body positions (including Volt/Specimen), visibility/focus and actual render submissions; validator rejects invalid samples | Lab captures and independent console/network/interaction review |
| Before/after pacing, CPU/GPU, loss, cold/warm loading | Shared statistics/evaluator; clean-build manifest with asset hashes; loading request/ready/control timeline; explicit manual cold/warm protocol | Matched lab packages/runs; driver/OS caches remain uncontrolled and must be disclosed |
| Traversal, switching, combat, platforms, restart/lifecycle | Route contracts, behaviour evidence template, bounded stable restart samples; deterministic fixtures and browser export regression | Native interactions and repeated lifecycle checks on the actual minimum target |
| Raw evidence/reproduction; separate software CI | Browser-only bounded full exports, intake/report hashes and actionable handoff. Existing `npm test` CI discovers the new portable tests automatically | Shared lab raw evidence link, review and approval. SwiftShader/llvmpipe/lavapipe cannot qualify hardware |

## Contracts and limits

- Existing `PerformanceFlightRecorder`, `SimulationTimeSummary`, profiling and
  summarization scripts are extended rather than replaced. Normal diagnostic
  history remains 2048 frames; `?debug=1&benchmark=1` uses 8192 preallocated slots.
  Export serializes that bounded ring as `retainedFrames`; rollover is an explicit
  incomplete-coverage failure. Existing frame columns keep their positions.
- Sampling adds reusable scalar/tuple storage; no new per-frame objects are
  allocated. The opt-in lifecycle observer stops polling after 2 seconds of
  stable resource counts. Its 32-entry history is page-owned, survives recorder
  start/stop, and cleans up subscriptions/listeners with its owner.
- Stable playing comparisons exclude the first interval and reject pause,
  death/cutscene/room-transition contamination, reset/focus gaps, disabled input,
  missing pointer lock/draws, stationary actor/camera, changed graphics, incomplete
  rows and browser/GL errors. Switching checks movement within identities.
  The required scenario level/room/roles must match the named route, including
  numeric Room 1 for L1 traversal and L2 switching. Exactly three distinct page
  passes are required (one cold, two warm), each containing exactly one recording
  of all seven scenarios; duplicate or uneven page-level coverage is rejected.
- GPU statistics use valid timer-query results with at least 80% coverage when
  supported, no disjoint/error scope. Unsupported GPU and heap values are null,
  not zero. `requireGpuTiming` can make GPU timing mandatory in an approved copy.
- Renderer counts, JS heap, GPU duration and CPU intervals measure different
  things. CPU/GPU times overlap; counts are not allocation bytes or proof of a
  leak. Resource comparisons use stabilized post-warm restart samples, not cold
  construction peaks. Three restart cycles per level are required.
- Lifecycle records distinguish navigation-to-title, request-to-ready,
  ready-to-control/human delay and request-to-control. Initial measurements use
  prompt Start/Skip; handoffs use immediate Enter. These are observed application
  milestones, not synchronous GPU-only timers. The initial budget covers
  navigation-to-control, including title boot; transition budgets cover
  request-to-control. Human delays remain visible in the component timings.
- Build SHA, dirty status and build timestamp are embedded in recorder output;
  `build-manifest.json` hashes the emitted files, including nested assets. Dirty
  builds, mismatched packages, duplicate files/recording sessions and missing
  approval/evidence cannot pass. Hashes identify evidence, not its truth: target
  and behaviour review remain explicit human responsibilities.
- The evaluator returns `unqualified` (exit 2), `fail` (1), or `pass` (0). Proposed
  budgets always remain unqualified even if all available numeric checks pass.
  Missing/invalid files fail closed and still produce an actionable report.

The automated harness now defaults to the platform's browser/backend (Chrome on
Linux, Edge on Windows); `PROFILE_ANGLE` is optional, and D3D11 is rejected on
Linux. Actual WebGL renderer information is exported. **Its Playwright module
routing disables HTTP caching**, so those instrumented repetitions are not a
browser-cold/warm qualification pair. Use the ordinary browser handoff for that
measurement. This follows [Playwright's documented cache behavior](https://playwright.dev/docs/api/class-page#page-route).

## Budget proposal — not approved

The JSON proposal contains seven routes × three samples, at least 30 active
seconds per sample, Minimum/Normal graphics, frame p95 ≤33.34 ms, p99 ≤50 ms,
average ≥30 FPS, 1% low ≥20 FPS, zero >150 ms hitches per minute and ≤0.1% active
simulation loss. Optional GPU p95 is 33.34 ms. Proposed cold initial/transition
limits are 120/90 s; warm limits 60/45 s. After warm-up, proposed maximum growth
is 0 programs, 2 geometries and 2 textures across stabilized restart samples.

These are reviewable planning hypotheses, including the 30 FPS floor/60 FPS
aspiration, **not measured or approved target guarantees**. Review the lab data,
route difficulty and allowed quality before approving a versioned copy with
`approval.status/by/date`. Do not edit raw evidence or relax tests to force a pass.

## Reproduction on the development machine

Node 24.x / npm 11.x (`npm ci` for a fresh checkout). Run checks before profiling,
with no competing tests/browser/GPU workloads during a capture.

```powershell
node --test tests/PerformanceQualification.test.ts tests/QualificationTimeline.test.ts tests/PerformanceFlightRecorder.test.ts
npm run type-check
npm test
npm run build
npm run validate:production
$env:SPECIMEN_BROWSER_CHANNEL='msedge'
npm run test:smoke
npx playwright test tests/smoke/BenchmarkExport.spec.ts tests/smoke/SimulationTimeLoss.spec.ts --config playwright.smoke.config.ts
```

After committing source, build a clean package (`npm run archive`). Then the
existing instrumented smoke-profile route can validate export/report plumbing:

```powershell
$env:PROFILE_LABEL='198-development'
$env:PROFILE_RECORDER='1'
$env:PROFILE_RUNS='1'
$env:PROFILE_SCOPE='beta'
$env:PROFILE_HEADLESS='0'
$env:PROFILE_KEY_MS='2000'
$env:PROFILE_PRESET='normal'
node scripts/profile-performance.mjs
node scripts/summarize-performance.mjs 198-development
```

Ubuntu/Chrome equivalent (no Windows backend flag):

```bash
npm ci
npm run archive
PROFILE_BROWSER=chrome PROFILE_HEADLESS=0 PROFILE_RECORDER=1 PROFILE_RUNS=1 \
PROFILE_SCOPE=beta PROFILE_KEY_MS=2000 PROFILE_PRESET=normal \
PROFILE_LABEL=198-development node scripts/profile-performance.mjs
node scripts/summarize-performance.mjs 198-development
node scripts/qualify-performance.mjs /path/to/intake.json \
  docs/evidence/198/proposed-budgets.json artifacts/lab-results.json
```

The short staged harness route is infrastructure validation, not the full native
seven-route lab protocol. Local play remains `npm run dev`; a built game uses
`npm run preview`. Packaging/deployment is described in
[`docs/operations/deployment.md`](../../operations/deployment.md).

## Validation results and local evidence

Windows development results are not Ubuntu assessment evidence. Synthetic
approved fixtures test evaluator branches only; they are not hardware results.

Node 24.19.0 / npm 11.18.0; implementation commit
`1524675` (full SHA and package hashes in the development evidence). Checks ran
before captures, without simultaneous test/GPU workloads during measurement.

| Command / scope | Observed result |
| --- | --- |
| `node --test tests/PerformanceQualification.test.ts tests/QualificationTimeline.test.ts tests/PerformanceFlightRecorder.test.ts` | 54 passed, including final initial-boot-budget regression |
| `npm run type-check` | Passed |
| `npm test` | Latest concurrent run: 1200/1202; unchanged music deadline and background-preparation deadline failures |
| `node --test --test-concurrency=1 tests/*.test.ts` | 1202/1203; only unchanged `BackgroundMusic.test.ts:81` failed; preparation passed |
| `npm run build` / `npm run validate:production` | Passed; 72 production files; existing bundle-size advisory |
| `SPECIMEN_BROWSER_CHANNEL=msedge npm run test:smoke` | 2 passed on Windows Edge |
| `npx playwright test tests/smoke/BenchmarkExport.spec.ts tests/smoke/SimulationTimeLoss.spec.ts --config playwright.smoke.config.ts` (Edge) | 2 passed: native export and bounded-stall/recovery regression |
| `npm run archive` | Passed; clean committed-source manifest included |
| `SPECIMEN_BROWSER_CHANNEL=msedge SPECIMEN_SMOKE_ARCHIVE=artifacts/specimen-production.zip npx playwright test tests/smoke/ProductionSmoke.spec.ts tests/smoke/BenchmarkExport.spec.ts --config playwright.smoke.config.ts` | 3 passed (2.8 min), including clean native export, nested-path startup, all-level transitions and restart |
| `git diff --check` | Passed |

PowerShell uses `$env:NAME='value'` before commands; the inline environment syntax
in the table is shorthand. Full test logs remain in ignored
`artifacts/issue-198-*.log`. The music failure reproduces the unchanged baseline
documented in [#196 evidence](../196/README.md); its 455 ms callback deadline is
host-sensitive. No unrelated audio/preparation code or test was weakened.
The final serial suite includes one additional partial-page-evidence regression.
The subsequent startup-budget correction passed the focused suite; the full
suite results above precede that one-test addition. Provenance was also checked
with untracked evidence present: it correctly reports `dirty: true`.
Ubuntu execution, assessment interactions, complete 21-capture passes and
independent minimum-hardware review are pending.

PR #220 protocol/room review follow-up (21 October 2026):
`node --test tests/PerformanceQualification.test.ts` passed all 62 tests using
21-capture synthetic fixtures. After preserving the remote branch's integration
fixes, `npm test` passed all 1224 tests. Type-check, build,
production validation (72 files) and diff checks passed. No gameplay, graphics,
measurement calculations or hardware evidence changed.

### Actual development capture — unqualified

[Machine/configuration, measurements and hashes](development-validation.json),
[clean captured-package manifest](development-build-manifest.json), and six
unmodified [gzip exports](development-raw/) are committed (~230 KiB compressed).
Each capture has SHA-256 hashes for its compressed and original bytes. The
production ZIP is ignored; its hash is recorded in the report. The observations
identify source `1524675aaf0b0b55685e642345c66fe5f3d57e68`; the later evaluation/
provenance fixes do not change gameplay or the captured renderer.

Windows 11 Pro 10.0.26200; i7-8650U (8 logical CPUs), ~16 GiB RAM;
Edge 155.0.4283.62; actual Intel UHD 620 ANGLE D3D11 backend. Minimum/Normal,
1280×720 viewport, 960×540 buffer, DPR ~1, effective DPR 0.75, focused/visible,
headed browser, real WASD/jump/mouse input through the existing staged route.
Driver version and power/AC state were not independently observed. These are
new local measurements, not historical UHD 620 or university-PC evidence.

The first attempt accepted Level 1, then rejected Level 2 Room 5 because it
became paused with disabled input and lost pointer lock. Its cause was not
established. The raw recording is retained and excluded from gameplay claims.
One identical retry completed all four short staged captures:

| Retry route | Raw / eligible frames | Active s | Frame p50 / p95 / p99 ms | Update / render CPU p95 ms | GPU p95 ms |
| --- | --- | --- | --- | --- | --- |
| L1 Room 1 Bob | 523 / 522 | 8.70 | 16.7 / 16.8 / 16.9 | 1.3 / 8.4 | 9.20 |
| L2 Room 5 Bob | 520 / 519 | 8.65 | 16.7 / 16.8 / 16.9 | 1.7 / 6.2 | 10.52 |
| L2 Room 5 Goop | 521 / 520 | 8.66 | 16.7 / 16.8 / 16.8 | 1.6 / 5.4 | 11.45 |
| L3 Room 1 Bob | 519 / 518 | 8.63 | 16.7 / 16.8 / 16.9 | 1.2 / 6.1 | 10.48 |

All four have complete raw coverage, valid GPU scope, actor/camera motion,
zero >50/>100/>150 ms frames, and 0 ms / 0% dropped active simulation time.
These short near-spawn captures do not exercise the seven full lab scenarios:
notably L3 Bob here is not the Volt electrical scenario. Harness wall-clock
startup-to-control was 54.17 s; transitions were 19.05 s / 9.63 s. Module routing
disables HTTP caching, so these are explicitly **not** cold/warm qualification
numbers. CPU/GPU intervals overlap and must not be summed.

Reproduce both stored attempts with the command above, using labels
`198-development` and `198-development-retry`; summarize together with
`node scripts/summarize-performance.mjs 198-development 198-development-retry`.
Local full reports remain under `artifacts/performance-overhaul/`. Open the
committed JSON for resource/heap distributions, clock progression, applied
graphics and all invalid-attempt reasons. None of these development results
approve the proposed budgets or satisfy target-hardware acceptance.

## Final target-hardware sign-off

- [ ] Teammate returns all raw captures, clean package manifest/hash and complete
      hardware/graphics/power/cache record from the actual Ubuntu/Chrome target.
- [ ] All seven scenarios have three valid repetitions, including real
      electrical, moving-platform and surveillance-combat activity; separate
      native functional evidence covers recovery, switching and transitions.
- [ ] Browser-cold and browser-warm page passes include initial and both handoff
      timings, plus three stabilized restart cycles per level.
- [ ] Reviewer inspects console/network/GL evidence, limitations, raw coverage,
      settings and software-renderer detection; unsupported counters stay null.
- [ ] Team reviews target data, approves versioned numerical budgets and signs
      target/behaviour review. Evaluator passes that approved configuration.
- [ ] Independent PR review and final issue acceptance complete. Do not close
      #198 or parent #187 from development/CI results or proposal checks alone.
