# Shader preparation (#191)

Baseline: `0cbd21ade13b5dba584d1858c49db93747a8dadf`.
Implementation branch: `codex/191-shader-preparation`. No push/PR/merge is part
of this work. The photographed expected Wits target is an ASUS NUC12WSK-B,
i3-1220P / Alder Lake GT2, 16 GiB, Ubuntu 24.04.1, GNOME 46 / Wayland.
That machine has not been measured here.

Scope: [issue #191](https://github.com/Gradient-Ascenders/Specimen/issues/191),
under [performance parent #187](https://github.com/Gradient-Ascenders/Specimen/issues/187).
The parent's earlier possible-i5 assumption is superseded by the photographed
i3-1220P specification, pending access to the actual assessment machine.

## Reproduction and evidence

Use Node 24 / locked npm 11 dependencies. Build an untouched baseline checkout
and the candidate, then use the SAME diagnostic script with each build:

```powershell
npm ci
npm run build
node scripts/profile-shader-preparation.mjs --label before-matched --dist <baseline-dist> --runs 2 --channel msedge --headed
node scripts/profile-shader-preparation.mjs --label after-matched --runs 2 --channel msedge --headed
node scripts/profile-shader-preparation.mjs --label before-standard --dist <baseline-dist> --profile standard --runs 1 --channel msedge --headed
node scripts/profile-shader-preparation.mjs --label after-standard --profile standard --runs 1 --channel msedge --headed
```

The script does not force a Windows backend and can select a locally installed
Chromium channel on Linux. Record the actual renderer, browser, buffer, settings
and extension data; software rendering cannot qualify hardware performance.
It serves production files, opens an ordinary URL and only exposes existing
runtime owners. Controller completion/room entry is staged. Short opposing real
keyboard movements, jump and mouse input follow room inspection; this is not a
full puzzle playthrough or a sustained performance/thermal qualification.

Fresh means a new browser process/profile per pair; warm means another navigation
in that same browser context. Playwright response routing disables HTTP cache.
Driver/OS caches, temperature and clocks are uncontrolled. Never call these
guaranteed driver-cold measurements. Navigation-to-control includes automatic
title preparation; Start-to-control is reported separately. Level 2 readiness
starts at completion/transition request, BEFORE the Enter button becomes visible.
The early exploratory `before-minimum` run incorrectly timed only Enter-to-control
as Level 2 loading; exclude that field. Its individual preparation phases remain
raw diagnostic evidence, not the matched comparison.

Raw JSON, shader source text/SHA-256 hashes, program cache keys, GL call times,
screenshots and test logs live under ignored `artifacts/`. The implementation
report must identify the exact final captures and hashes. Reviewers need the
evidence bundle as well as these committed reproduction commands.

Compilation submission is measured separately from elapsed promise time. The
latter includes browser scheduling and any other overlapping work; it is not
isolated GPU compiler time. Frame GPU queries cover the complete live renderer
draw, including its transmission/shadow work. Invalid/disjoint/pending samples
are not invented. Inspector wrappers and shader-source retention have overhead;
use identical instrumentation before/after and keep raw rows.

## Confirmed regressions

Main already had bounded room light layouts, asynchronous compilation, isolated
material copies, texture/geometry primers, a room-readiness overlay, graphics
profiles/pixel caps, production gameplay parity and the submission ZIP workflow.
This work extends those mechanisms; it does not replace the light layouts or
introduce a separate loading/teardown architecture.

- The Settings regression on the baseline creates new physical/linear programs
  after switching Minimum to Standard. Its log is `artifacts/191-readiness-before.log`.
- With its old exception removed, the baseline F1 smoke fails on exactly three
  depth programs with seven point lights (`artifacts/191-f1-before.log`). The
  layer-probe test called `RenderLayer.render()` outside Cultivation's bounded
  runtime light selection, poisoning Three's previous-light state. F1 was not
  the cause. The corrected probe must use `runtime.render()` and reject growth.
- The stronger inspection test fails even after compilation-count stability:
  opaque linear-output and gel programs run `getProgramInfoLog` on the live
  draw (`artifacts/191-inspection-before.log`). Compile completion alone did not
  establish first-use readiness.

## Implementation decisions

Only crossing between zero and positive gel transmission changes shader
features in current profiles. Resolution/capture scale, shadow-map size and
decorative draw counts remain resource changes. Physical/reduced transmission
share shader programs. Session preparation serializes shader-affecting material
mutations, coalesces queued changes, and gates rendering/simulation/resume.
Startup/transition preparation also excludes overlapping settings mutations.
Cancellation invalidates owner/readiness state; stale completions cannot restart
an unloaded runtime. Failure keeps an explicit reload-to-retry status.

Preparation continues to own copies and borrow live geometry/textures/uniforms.
Cultivation reuses copies and completed visible coverage only for the SAME source
material, drawable features, shader-affecting material state and bounded light
signature. It does not merge live materials on GLSL similarity. Unique linked
programs and duplicate submissions are distinct metrics.

Effective materials, including dormant/captive forms, determine whether opaque
linear-output variants are needed. Minimum can omit those forms. Depth/distance
programs, comparison samplers, fades, morphs, instance attributes and uploads
remain required. Character LOD uses one immutable index bank with draw-range
changes, so LOD transitions must retain its existing uploaded bindings.

Real isolated linear primers exercise inspection/bindings. Transmissive screen
primers use cloned bounded lights but the retained live scene/camera. All live
objects are excluded from the temporary layer and masks/hierarchy are restored
synchronously. Effective capture scale/dimensions are retained; a one-pixel
temporary scene must not create a separate renderer-owned transmission target.
The canvas scissor preserves live pixels, but does NOT make transmission-target
work free. Individual driver operations remain indivisible; nominal queue slice
budgets are not maximum stall guarantees.

`4117b6f` reduces background compile batches from eight objects to one while
retaining 32-object foreground batches. The first implementation improved loading
but regressed fresh-run frame tails. Pausing speculation diagnostically made both
builds smooth; two diagnostic pairs using single-object batches were also smooth.
A trace without a severe hitch showed only two minor GCs (about 4 and 6 ms), so
major GC was not established as the cause. The change limits asynchronous driver
pressure after submission, which the synchronous scheduler budget cannot bound.
It preserves all future configurations and demand promotion. It also reduces
prefetch throughput: fewer programs can finish within a fixed gameplay window.
That cost requires separate wait/deadline measurements, not merely a better p99.

The optional `--trace`, `--suppressSpeculation` and `--backgroundBatch` modes are
diagnostic interventions. The default `backgroundBatch=unchanged` leaves served
production code intact. They are excluded from the ordinary before/after set.
`--sweep` is a separate render-only visibility stress: authoritative bodies move
through synthetic positions at at most 5.5 m/s, the camera stays 12 m ahead,
travel pauses for required preparation, and physics/puzzles remain stopped.
It records visibility/light signatures, wait positions and completed work. It is
not a legal playthrough or gameplay-FPS measurement. Inactive Goop's offset does
not widen visibility; paused lift controllers omit boarded/departed/early-dark
states. Existing lift tests remain necessary, as does a legal continuous route
before claiming exhaustive prefetch coverage.

## Validation and measurements

The source baseline is `0cbd21a`; final measured candidate production code is
`4117b6f`. Capture tooling changes after that commit do not modify the served
production code. Hardware captures used native headed Edge 155.0.4283.45,
Windows 11 Pro build 26200, i7-8650U (4 cores / 8 threads), approximately 16 GiB
RAM, Intel UHD Graphics 620 driver 31.0.101.2134, ANGLE D3D11. Desktop display:
1920 x 1080 / 60 Hz; capture viewport: 960 x 600 CSS pixels, requested DPR 1
(native reported value `1.0000000149011612`).
Raw environment records include effective drawing buffer, graphics settings,
extensions and `checkShaderErrors=true`. This is not the Linux assessment PC.

The final Minimum comparison comprises `final-before-minimum` (2 pairs),
`final-before-minimum-repeat` (3), and `accepted-after-minimum` (5). Earlier
`final-after-minimum` / `final-after-minimum-repeat` contain rejected candidate
`4940d79` and are retained for the tail-regression diagnosis. Baseline samples
bracket those earlier captures; final candidate samples follow the scheduling
fix. Ordering does not control temperature or driver caches. Each compared build
has five fresh and five warm samples. `final-before-standard` / `accepted-after-standard`
have only one pair each; treat them as diagnostic examples, not stable estimates.
All captured gameplay windows pass the validator: running, alive, enabled input,
visible/focused page, actual renderer draws, measurable body movement, no pending
overlay, no console/GL errors. They cover about four seconds of Room 1 input
following controller-staged visits to Rooms 1–5 and return. They cannot establish
worst-case FPS, sustained thermals or complete authored puzzle compatibility.

| Minimum metric | Main fresh | Candidate fresh | Main warm | Candidate warm |
| --- | ---: | ---: | ---: | ---: |
| Median Level 2 transition-to-control | 29.323 s | 19.795 s | 3.495 s | 3.436 s |
| Median later Level 2 overlays | 4.292 s | 2.364 s | 1.092 s | 0.604 s |
| Median total Level 2 waiting, per run | 34.045 s | 22.263 s | 5.210 s | 4.067 s |
| Median navigation-to-Level-1-control | 24.200 s | 24.851 s | 3.741 s | 3.895 s |
| Median Start-to-Level-1-control | 116 ms | 341 ms | 116 ms | 106 ms |
| Median navigation plus all Level 2 waiting, per run | 59.297 s | 47.114 s | 9.098 s | 7.979 s |
| Programs at Level 2 first actual draw | 209 | 144 | 209 | 144 |
| Programs at end of capture (different prefetch progress) | 266 | 173 | 297 | 182–185 |
| Median compile submissions, complete capture | 87 | 79 | 164 | 160 |
| Median submitted objects / zero-program-growth objects | 1866 / 861 | 678 / 186 | 2458 / 1398 | 759 / 284 |
| Median compile submission CPU | 599 ms | 349 ms | 577 ms | 312 ms |
| Median completed asynchronous elapsed time | 32.649 s | 21.657 s | 2.139 s | 2.487 s |
| Median per-run frame p50 / p95 / p99 | 16.7 / 16.8 / 16.8 ms | 16.7 / 16.8 / 16.9 ms | 16.7 / 16.9 / 17.0 ms | 16.7 / 16.9 / 16.9 ms |
| Hitch counts >50 / >100 / >150 ms, all five windows | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Maximum observed frame interval | 33.3 ms | 17.7 ms | 33.3 ms | 17.3 ms |
| FPS range | 59.77–60.02 | 60.01–60.02 | 59.76–60.02 | 60.02–60.02 |
| 1% low range | 44.78–58.94 | 58.14–59.06 | 44.71–58.82 | 58.48–58.94 |
| New programs in actual live renderer / live program inspections | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

These are medians of per-run percentiles, not pooled percentiles. FPS includes
the measured interval sum; 1% low is the reciprocal of the mean slowest 1% of
intervals. Short windows make tail estimates particularly sensitive. Asynchronous
elapsed sums span completed batches across startup, staged rooms and gameplay;
they overlap other work and omit explicitly recorded pending batches (one in
each fresh capture and candidate warm capture). Do not add those sums to wall
time or describe them as isolated GPU compiler time.

Fresh Minimum startup programs fall by 65 (31.1%). End-of-capture program counts
also differ because single-object prefetch completes less work in four seconds;
do not call that entire difference eliminated variants. The live inventory
remains 402 materials / 70 observed material feature combinations. Submitted
shader source strings are 528→342, distinct vertex/fragment source SHA-256 hashes
379→285 at the measured endpoints. These source counts are not linked
program signature counts. Exact linked program cache keys, source strings and
material/object feature inventory are retained in raw JSON. End counts include
speculative progress and are not a claim that all 12 visibility configurations
have finished. Minimum fresh resources are 862 geometries / 79 textures on both
builds; final candidate warm counts are also 862 / 79. Baseline warm textures
vary with pending temporary preparation. Three's
resource counts are not GPU memory bytes or a VRAM measurement.

CPU render p50/p95/p99 medians (fresh Minimum) are 5.9/11.8/15.0→4.0/5.6/6.3 ms;
fixed-update equivalents are 1.3/3.4/4.8→1.0/1.7/2.2 ms. Valid full-render GPU
query equivalents are 6.40/8.87/10.38→4.64/5.96/6.75 ms. This is performance
while different amounts of prefetch compete with gameplay, not proof of reduced
steady-state rendering cost or faster physics. Raw query validity and
pending/disjoint states remain in the evidence. Maximum synchronous queue steps
are 54.7–80.6 ms before and 52.6–72.3 ms after across complete fresh captures;
most are loading work. The configured slice budget is not a blocking-time bound.

Standard's single pair gives fresh Level 2 readiness 32.865→31.545 s and warm
4.517→5.049 s; total Level 2 waiting 37.591→36.310 s and 5.832→6.450 s. It retains
209 startup programs because transmission is required. Live program inspections
fall 51→0. Navigation-to-Level-1-control increases 22.887→32.874 s fresh and
4.346→4.407 s warm when Standard is selected on the title screen. The readiness
gate now pays formerly deferred first-use work before controls. This correctness
cost is included, not concealed as a loading improvement. Navigation plus Level 2
waiting is 60.478→69.184 s fresh and 10.179→10.857 s warm: this sample does not
meet the no-increase waiting target for Standard. Its final gameplay maximum is
17.5 ms fresh / 16.9 ms warm, with zero >50 ms hitches, but one pair is
insufficient to establish a distribution or frame-tail equivalence.

The final Minimum sample meets the loading aim: median Level 2 readiness falls
32.5%, Level 2 waiting 34.6%, and navigation plus measured Level 2 waiting 20.5%.
The earlier candidate's nine >50 ms / two >100 ms hitches, 133.3 ms maximum and
50 ms dropped simulation are retained in `191-minimum-comparison.json`; do not
pool them with `4117b6f`. Final five-pair intervals show no repeatable tail
regression in this short route. **That does not establish exhaustive prefetch
deadline coverage or Standard-profile waiting equivalence.** The completed timed
visibility stress below, legal playthroughs, longer thermal runs and target
hardware qualification remain distinct from the four-second gameplay comparison.

`sweep-before-minimum` / `sweep-after-minimum` each contain one fresh/warm pair.
All four render-only sweeps took approximately 48.1 s, encountered nine
visibility/light signatures and incurred **zero preparation waits**. Both builds
completed all 12 enumerated preparation configurations by z=203 / about 35.9 s
fresh and z=90 / about 15.4 s warm. This checks the measured prefetch horizon at
at most 5.5 m/s with the camera ahead; it does not exercise legal puzzle/lift
controller timing. Signatures, pending status and completed counts at each
boundary are preserved in raw `sweep.visited` and `191-sweep-summary.log`.

The fully drained sweep endpoints provide a more comparable signature inventory
than the short gameplay endpoints above. Both fresh and warm samples give:

| After all 12 preparation configurations are ready | Main | Candidate |
| --- | ---: | ---: |
| Linked programs / distinct program cache keys | 317 / 317 | 213 / 213 |
| Submitted shader sources / distinct source hashes | 630 / 426 | 422 / 331 |
| Submitted compile objects / zero-program-growth objects | 4449 / 3517 | 1032 / 625 |
| Retained renderer geometries / textures | 921 / 77 | 921 / 77 |
| Live program additions / program inspections / GL errors | 0 / 0 / 0 | 0 / 0 / 0 |

That is 104 fewer linked programs (32.8%) with equal completed configuration
counts and geometry/texture counts. Zero-growth object submissions fall by 2892
(82.2%); some zero-growth work remains necessary for distinct per-material hooks
and bindings. These are measured inventory differences, not estimated FPS gains
or GPU memory byte savings.

Generate the comparison from preserved raw rows:

```powershell
node scripts/summarize-shader-preparation.mjs final-before-minimum final-before-minimum-repeat accepted-after-minimum final-before-standard accepted-after-standard
node scripts/compare-shader-preparation.mjs final-before-minimum,final-before-minimum-repeat accepted-after-minimum
node scripts/compare-shader-preparation.mjs final-before-standard accepted-after-standard
```

Evidence labels under `artifacts/shader-preparation/`:

| Labels | Interpretation |
| --- | --- |
| `final-before-minimum`, `final-before-minimum-repeat` | Untouched main, five matched fresh/warm pairs combined |
| `accepted-after-minimum` | Final production candidate, five fresh/warm pairs |
| `final-before-standard`, `accepted-after-standard` | One Standard pair per build; exploratory sample size |
| `sweep-before-minimum`, `sweep-after-minimum` | Drained inventory and paced visibility stress, one pair each |
| `final-after-minimum`, `final-after-minimum-repeat`, `final-after-standard` | Superseded `4940d79`, retained to disclose the rejected frame tails |
| `diagnostic-*` | Trace, suppressed speculation or batch override; never production acceptance results |
| Other `before-*` labels | Exploratory baseline captures; timing caveat above applies |

Each label retains its `raw.json` and screenshots; selected labels also have
regenerable `summary.json`. The comparison tools reject invalid gameplay rows.
Run-level percentiles are aggregated as medians, rather than pooling frames from
different runs. Short capped 60 Hz windows cannot establish sustained FPS gains.

The expected Wits machine still needs its actual browser version, WebGL
renderer/backend, display/buffer dimensions, graphics settings and CPU/GPU frame
measurements recorded. Historical Windows UHD 620 and Radeon reports cannot
qualify that target. No visual quality reduction, shader-error-check disablement,
Three.js fork or gameplay shortcut was used.

## Source changes and review milestones

- `6f2d887`: baseline capture tool and evidence protocol.
- `4940d79`: serialized graphics readiness, lifecycle/cancellation guards,
  effective-transmission preparation, retained source-material copy/coverage
  reuse, resumable scene collection, real first-use primers, resource retirement,
  and focused regressions. Its frame-tail result was rejected and investigated.
- `4117b6f`: one-object background compiler submissions, preserving foreground
  batches and every required future configuration.
- `21b42fe`: repaired browser fixtures and production audio instrumentation;
  retains strict shader, gameplay, recovery and pixel assertions.
- The final report commit contains the summarizer/comparison tools, diagnostic
  modes and this report. Neither validation commit changes rendering.

The main affected owners are `GameSessionCoordinator`, the three level runtimes,
`GraphicsPreparation`, `GraphicsPreparationOverlay`, `CultivationPreparationQueue`,
`BlackoutPresentationPreparation` and `IsolatedResourcePrewarm`. Graphics settings
continue through the existing renderer/profile policies. Unload, transition,
deferred restart/resume and stale compiler completion use the owning session's
generation; they do not introduce a second runtime lifecycle.

Browser fixture repairs use the current settings-object API, expose the already
constructed initial runtime through the session constructor, and wait for actual
graphics readiness before inspecting requested settings. The one-pixel test pins
the real host dimensions because native headed browser viewport emulation can
round up. Its exact canvas/CSS/aspect/framebuffer-completeness assertions remain.
The native DPR check uses a bounded numeric tolerance rather than exact equality
on a browser-exposed floating value. Isolated Goop motion/presentation fixtures
now assert the initial lock, explicitly stage an available Goop and retain every
motion/death/retry assertion; the first actual Goop draw additionally rejects new
programs and lazy program inspections. This staging does not test authored rescue.
Death fixtures capture the staged checkpoint roster and use checkpoint recovery;
full initial-state restoration intentionally locks Goop again. The Level 1 shader
traversals likewise stage availability and verify the active character before
placing that active body at Room 2 and requiring a real acid impact and droplet
upload. The debug shader guard is sampled after Start, matching its existing
activation on `playing`; its baseline/highest assertions remain exact. Audio
smoke observes the current session constructor instead of the removed
startup-promise call site. Mouse-aim checks require canvas pointer lock and use
bounded waits.
The F1 layer probe uses the production runtime render path; no depth-program
exception remains. No assertions were weakened to accept cold programs.

Independent read-only peer review covered source ownership/cancellation and
first-use isolation, the tail-regression diagnosis, batch-size trade-offs and the
visibility-sweep limits. It found no source-correctness blocker after repairs;
it specifically required acknowledging slower prefetch and testing waits.
This is not an independent hardware run or a merged-PR approval.

## Verification record

All production measurements and the ZIP below use source `4117b6f`; later changes
repair test fixtures and add evidence/report tooling only.

- `npm test`: 989 passed, zero failures (`191-unit-final.log`).
- `npm run type-check`, `npm run build`, `npm run archive`: passed; the archive
  validator checked all 89 packaged files (`191-type-final.log`,
  `191-build-final.log`, `191-archive-final.log`).
- Final source browser runs passed acid ripples in normal/performance/Minimum,
  Blackout Bob, Volt presentation and graphics cycles across all three levels
  (`191-browser-repaired.log`, with unrelated fixture failures retained).
- Scoped fixture reruns passed Goop motion and the graphics-profile journey
  (`191-fixture-repairs.log`), plus both Cultivation room/fade cases, both
  preparation-isolation cases, frozen profile comparison and both graphics-quality
  cases (`191-browser-final-repairs.log`). Its remaining Goop recovery failure is
  preserved for comparison with the subsequent checkpoint-fixture rerun.
- Both final Cultivation isolation cases retained zero pixel difference, zero
  live program growth, zero inspection calls, zero state changes and zero GL
  errors, including the actual transmissive screen primer.
- A three-level ordinary-URL settings journey exercised reduced/Minimum/physical
  cycles, character switches, camera fades, F1 and three restarts per level with
  zero live cold programs or inspections and a stable Level 1 depth-group count.
  Durable evidence: `artifacts/191-browser-evidence-final/graphics-cycles.json`.
- Final Goop presentation/recovery across all three levels and the plain
  production Level 1 traversal passed (`191-traversal-final.log`, two passes;
  the obsolete debug title-guard wait was its one failure). The plain traversal
  requires an authoritative acid impact, droplet upload and stable programs.
- The corrected debug Level 1 traversal also passed (`191-debug-traversal-final.log`,
  31.0 s), retaining its exact guard baseline/highest and all room assertions.
- Nested extracted-ZIP smoke: eight cases passed in `191-smoke-final.log`;
  its sole failure was the obsolete audio instrumentation hook. The repaired
  audio case passed in `191-audio-smoke-final.log` (34.8 s). All nine smoke cases
  therefore passed across the full run and scoped rerun. They cover optional
  asset failure, both F1 modes, three production profiles/modes across all levels,
  nested startup/credits/restart, transitions and audio. No smoke assertion or
  shader-growth exception was relaxed.

The initial native headed traversal overlapped another functional browser job;
it was interrupted and excluded (`191-level-one-overlap-aborted.log`,
`191-functional-run-note.txt`). All benchmark captures were serial and finished
before this overlap. Subsequent input-driven checks run sequentially.
A subsequent Goop mouse-input stall was interrupted before outcome and retained
as `191-traversal-input-aborted.log`; the final all-level journey passes after
explicit pointer-lock acquisition. The obsolete debug guard wait at the title
also has its failed log retained. Neither interrupted run is benchmark evidence.

Owned temporary resources are checked for exactly-once disposal; borrowed live
geometry, textures, uniforms, instance attributes and morph state survive.
Interleaved preparation preserves pixels, light masks, shadow ownership and
renderer state synchronously. Resource counts are not VRAM byte measurements.

Production ZIP: `artifacts/specimen-production.zip`, SHA-256
`2BDA7B99525F24983525D33590D9D889231AE7CB8E9B50AF38F714C3E26B2BD7`.

Review evidence is packaged separately as `artifacts/191-review-evidence.zip`.
It preserves the raw shader captures (including rejected and diagnostic runs),
selected browser evidence, hardware record, logs, test configs, report, capture
tools and the complete branch diff. `artifacts/191-evidence-manifest.json`
records SHA-256 hashes of packaged files. The production ZIP is a separate file;
the evidence archive contains measurements and is not deployable game content.

The `submission-build.yml` workflow and relative Vite `base: './'` remain intact.
Local checks exercise the same production ZIP at a nested static path. A GitHub
Actions artifact cannot be generated here without a push; none was authorized.
The downloadable local production ZIP is the candidate for review, not a claim
that a new submission build has run on main.
