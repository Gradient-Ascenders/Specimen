# Issue #173 integration evidence

Implementation for [#173](https://github.com/Gradient-Ascenders/Specimen/issues/173),
part of [#168](https://github.com/Gradient-Ascenders/Specimen/issues/168).
The [preparation and ownership guide](../../shadow-validation.md) describes the
shipped paths and reproduction commands. This evidence does not close the
parent's separate native traversal and teammate visual acceptance gates.

## Change and regression boundaries

Containment compiles caster depth programs independently of the hidden camera
frustum and restores rendering state before asynchronous compilation yields.
Cultivation prepares fade, transmission receiver and actual depth/distance
signatures while retaining its staged readiness boundary. It no longer draws
Bob's transmissive body into temporary scenes: hardware reload testing exposed
implicit transmission targets retained on each reload. The depth pass uploads
that same morph geometry and the live camera retains the gameplay target.
Blackout prepares hidden forms, fade and shadow programs during loading.
The strict room regression also exposed omitted visible foundation meshes:
their dissolve and hazard programs now prepare with each authored room layout.

Custom shader hooks and uniform objects, textures and geometry stay borrowed;
preparation owns only its material/instance copies and temporary targets.
Cancellation/failure checks cover pending compilation, single disposal, target
face/mip restoration and preservation of the next renderer owner. The upload
frame generation remains monotonic when public render counters restore.

No gameplay or authoritative timers, character assets, source positions,
coverage, shadow map sizes or caster detail were changed. No player-facing
quality setting or revised budget was introduced.

## Hardware and method

Final captures use the physical Intel Iris Xe (`0x46A6`) through ANGLE D3D11,
Windows Chrome 154.0.8037.93, driver `32.0.101.7085`, exposure 1. The host also
has an NVIDIA adapter, which the recorded GPU identity confirms was not used.
The session was headed, isolated, and local. DPR 1 uses a 960×600 viewport and
drawing buffer; the DPR 2 run uses a 1920×1200 drawing buffer at that viewport.

[Raw DPR 1 measurements](iris-xe/measurements.json) record asset SHA-256 hashes,
camera/source state, loading durations, resources, raw timing blocks, settled
GPU/submission distributions and continuous fixed-simulation frame samples.
Frozen comparisons use off/on/on/off order, 15 warm-up draws and 60 measured
draws per block. GPU queries use `EXT_disjoint_timer_query_webgl2`, discard
disjoint results and preserve incomplete-sample counts. Continuous samples
measure the actual running fixed-update and presentation loop at spawn, discarding
the first 15 frames. These are idle-spawn samples, not full-game FPS guarantees.

The profiler deliberately compiles off-mode comparison programs that production
never requests. If the debug program guard later sees precisely that measured
increase, the raw warning remains recorded in `errors` and is explained in
`expectedComparisonWarnings`. Any other error or unexplained warning fails the
harness. Plain-production browser traversal has a separate strict no-new-program
check, without comparison variants.

## Measured limits

The final-build DPR 1 render-only samples are below the Room 1 total limits.
The two on blocks remain separate; off/on ranges overlap on this host, so these
numbers do not establish a speedup. All timed GPU queries completed, with no
disjoint result. Running samples include fixed simulation and presentation.

| DPR 1 checkpoint | On GPU p95, two blocks (ms) | On submission p95 (ms) | Running CPU / GPU / frame cadence p95 (ms) |
| --- | --- | --- | --- |
| Containment Room 1 spawn | 7.36 / 5.61 | 4.90 / 4.50 | 4.60 / 11.12 / 13.50 |
| Cultivation Room 1 spawn | 6.03 / 4.10 | 3.70 / 3.50 | 4.70 / 9.36 / 13.50 |
| Blackout Room 1 spawn | 4.45 / 4.69 | 3.50 / 3.30 | 3.50 / 3.74 / 13.60 |

[DPR 2 raw measurements](iris-xe-dpr2/measurements.json) use the same viewport,
with a 1920×1200 drawing buffer. This is a separate workload, without repeated
lifecycle cycles, and does **not** meet the 16.7 ms cadence target in two sampled
spawn views. No budget increase or player quality setting is inferred.

| DPR 2 checkpoint | On GPU p95, two blocks (ms) | On submission p95 (ms) | Running frame cadence p95 (ms) |
| --- | --- | --- | --- |
| Containment Room 1 spawn | 16.16 / 16.12 | 7.60 / 8.10 | 26.70 |
| Cultivation Room 1 spawn | 12.41 / 11.03 | 3.70 / 3.90 | 13.50 |
| Blackout Room 1 spawn | 10.32 / 10.74 | 3.10 / 3.10 | 26.70 |

Preparation plus handoff/loading in the DPR 1 run measured 2.26 s for
Containment, 58.63 s for Cultivation and 1.55 s for Blackout. These are single
runs with already exercised driver caches, not cold-cache load guarantees.
Cultivation startup remains expensive and is a material acceptance limit.

All three restart samples match within each level. Rendered reloads stabilize
at these program/geometry/texture counts:

| Level | Reload programs / geometries / textures | Allocated maps disposed once per reload |
| --- | --- | --- |
| Containment | 281 / 483 / 59 | 21 |
| Cultivation | 303 / 524 / 59 | 2 |
| Blackout | 51 / 203 / 20 | 5 |

Cultivation's two maps are the active spawn maps allocated by startup/live
rendering, not all seventeen authored maps. Encounter capture separately
allocates the larger light graph. The first restart retains off-comparison
programs; unloading releases those copies before the reload measurements.

The [isolated pedestal source run](pedestal-source/measurements.json) leaves
every light's radiance intact and enables casting only on
`room-1-pedestal-soft-key`. It restores the full graph before the continuous
sample. For the sampled source, conservative differences between the maximum
on and minimum off block percentiles are **0.09 ms p50 / 1.53 ms p95**, below
the existing 2.5 / 3 ms allowances. These are differences of measured
percentiles, not a percentile of framewise differences. Overlapping ranges and
the slower trailing off block do not imply that shadows improve performance.
This verifies that source at that view; other individual sources remain unverified.

[Twelve encounter comparisons](compare.html) and their
[raw measurements](encounters/measurements.json) refresh Room 1–4, searchlight,
disabled-network, rescued point-light, lift handoff and powered/unpowered drone
views. Their ABBA blocks use five warm-up draws and twenty samples per block:

| Frozen staged encounter | On GPU p95, two blocks (ms) | On submission p95 (ms) |
| --- | --- | --- |
| Cultivation searchlights | 10.21 / 10.10 | 13.30 / 12.70 |
| Blackout powered hallway | 5.02 / 4.92 | 2.20 / 2.60 |

These are whole graphs. They cannot prove each source's allowance or a running
encounter cadence. No speedup or individual source contribution is inferred
from these whole-graph blocks. All seventeen allocated Cultivation maps dispose
once at handoff and Blackout's five dispose once at unload. Restart retains the
maps, power resets, and injected Blackout preparation failure releases resources
and restores the prior disabled owner without errors or failed requests.

Agent inspection sees matched geometry and lighting with shadow contact changes
in the powered-drone pair. The searchlight frame has foreground structure
occluding much of Bob, so it cannot establish all character/hazard readability.
Blackout stages Bob's pose while the unchanged HUD retains the actual active
Volt state. These staged pictures do not establish native camera or pose approval.
The capture harness initializes shadow-camera projections before both modes
and asserts identical camera, morph and full light/source settings for every pair.

## Acceptance and evidence inventory

The final source passes [110 unit-test files](unit-tests.log), type-checking,
production build, production reference validation (27 files) and diff checking.
The native [browser suite](browser-suite.log) passed seven of eight cases; the
debug traversal case initially paused during asynchronous pointer-lock changes.
After waiting for pointer capture/release and fixed updates, its
[focused rerun passes](browser-traversal-rerun.log). All eight cases therefore
pass across those runs. These are local checks; remote CI was not run.

| Gate | Evidence and status |
| --- | --- |
| Prepared visible/caster variants | Explicit Containment, Cultivation and Blackout passes; focused tests and production program checks. |
| Preparation restoration and cancellation | Unit regressions cover synchronous restoration, compiler rejection/cancellation, borrowed resources and newest renderer ownership. |
| Moving and cached maps | Existing occupied-map/old-new assembly/dissolve/visibility/reset invalidation regressions retained. Searchlight and powered-drone captures exercise their source owners. |
| Hardware budget | DPR 1 Room 1 total limits and sampled pedestal allowance pass. DPR 2 misses the cadence target in two spawn views; other source allowances and whole-game performance remain unverified. |
| Bounded lifecycle | Three restarts and three rendered reloads per level. Every allocated map disposes once; second-to-third reload counts must not grow. |
| Representative traversal | Production Rooms 1–5 jumps/camera sweeps, Goop switch/acid impact, Cultivation movement/death/retry/dark-room transition, and Blackout movement/switching/merge/split/reload browser paths. These use assisted room selection, not a complete normal-input playthrough. |
| Character pose, fading, rupture and dissolve | [#170 shape/mask evidence](../../evidence/issue-170/review.md), shared-material regressions, and current production character lifecycle browser checks. Prior staged captures remain dated evidence; they do not establish every final worst-case pose. |
| Room coverage, elevator and hatch/release | [#171 coverage/cutscene limits](../../evidence/issue-171/review.md). The existing hatch/release lighting and art API captures do not establish a dedicated native hatch camera sequence. |
| Searchlight networks, rescue and power | [#172 source inventory](../../cultivation-blackout-shadows.md), refreshed #173 encounter captures and powered-device unit checks. API-staged rescue/drone views do not replay native sequences. |
| Visual acceptance | Agent screenshot inspection is separate from teammate acceptance; teammate approval remains pending. |

## Remaining limits

A full normal-input playthrough, complete native lift/rescue/drone sequences and
cutscene completion/skip equivalence require separate final evidence. The
checkout's staged hatch/release APIs do not provide native hatch-camera
acceptance. Human review must accept contact shape, coverage handoffs,
surface/hazard readability and material response. These gates are not converted
to passes by tests or screenshots.

The [#169 budget](../../evidence/issue-169/review.md#initial-budget-for-subsequent-phases)
remains Room 1 render-only GPU p95 ≤10 ms / submission p95 ≤14 ms at DPR 1.
The gameplay target remains 16.7 ms. Per-source p50 ≤2.5 ms / p95 ≤3 ms requires
isolated source measurements, not division of a whole-graph cost. Results from
DPR 2 or the searchlight/drone workload must not be used to assume a multiplied
allowance or an accepted quality setting.
