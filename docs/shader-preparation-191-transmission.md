# Issue #191: direct transmission resource switching

Follow-up to [Standard attribution and main integration](shader-preparation-191-follow-up.md).
Work continues on `codex/191-shader-preparation`. The known fresh Standard
loading regression remains unresolved. This change does not skip shader checks,
remove required preparation or claim a new loading-time improvement.

## Confirmed cause and failing-first evidence

`graphicsShaderKey()` correctly treats physical and reduced transmission as one
shader family. Under Standard/Normal, however, the transmission target uses
full or half width/height. Three's `WebGLRenderer.renderTransmissionPass()` owns
that target per scene/camera and calls `setSize()` when it draws. Shader readiness
therefore does not imply render-target storage readiness.

The old `GraphicsPreparation.update()` fast path applied equal-shader-key
settings without a gate or preparation. The failing-first browser regression
switches physical/reduced twice per level while gameplay is actually running,
using the session boundary invoked by the real settings UI. A paused/menu draw
cannot consume the allocation before measurement. It records actual live
`RenderLayer.render()` calls, GL program/shader inspections, texture/renderbuffer
storage, synchronous draw time, request latency and consecutive draw intervals.

All 12 original switches (four in each level) allocate on the first live draw:
two `renderbufferStorageMultisample`, one `texImage2D`, one
`renderbufferStorage`. All have zero new programs and zero shader inspections.
The regression fails on the storage assertion. Failing test commit: `52f9a1d`.
Baseline production code is the integrated `2d9ad2f` build, also used at report
commit `97651ed`; its preserved ZIP hash is
`EE4B21FEB620E665AB388857D0CCAA17FC6176BE8437DCFEC74E597C87912CB4`.

Early diagnostic captures revealed background-window throttling near one second.
Those intervals are not GPU hitches and are excluded from timing conclusions.
The controlled rerun uses native headed Edge with background timer, occluded
window and renderer throttling disabled. It establishes preceding real draw
timestamps before each request. Its maximum observed interval is 47.4 ms;
first-draw intervals range 14.8–35.6 ms and synchronous first-draw CPU 4.2–14.7 ms.
The storage calls themselves are mostly below timer resolution. Avoided storage
is established; a statistically reliable hitch/FPS benefit is not.

Artifacts preserve both uncontrolled diagnostics and the controlled failing run:
`191-transmission-before*`, `191-transmission-controlled-before*`.

## Scoped implementation

- Track shader readiness and transmission-resource readiness separately in the
  existing serialized graphics gate. Commit readiness only on successful current
  generation completion; cancellation invalidates both, and a new owner's normal
  loading path adopts both. Rapid requests retain latest-wins serialization.
- Resource keys include effective transmission scale, effective resolution cap,
  requested render scale and profile pixel budget. Physical/reduced under the
  Performance cap share resource readiness at unchanged dimensions. Minimum
  returns `no-transmission`, retaining the existing fast path for resource-neutral
  changes. Window/DPR resize still uses its existing renderer lifecycle; this is
  not a general promise of zero allocation after arbitrary browser resize.
- Scale-only changes invoke `prepareRenderResources`, preserving shader programs
  and existing shader-preparation owners. The session stops gameplay behind its
  existing gate and passes retained interpolation with zero time deltas. The
  three runtime implementations use their real presentation/light-layout path.
  Optional future runtimes lacking this method fall back to full preparation
  rather than claiming unprepared storage ready.
- Cultivation keeps the same queue. If a doorway still requires its existing
  demand preparation, await that queue and recheck resource/queue ownership.
  Suppress unrelated speculative ticks during the resource draw. No queue
  replacement or full shader rebuild is introduced for scale-only changes.
- A camera may see no gel at all. The resource draw therefore uses one existing
  owned positive-transmission gel mesh, forced into the retained camera's render
  list through the established isolated-resource helper. Visibility, ancestor
  visibility, layers and frustum culling restore synchronously. No temporary
  material, geometry, scene, camera or persistent target is created.
- Use the live viewport and effective capture scale inside isolated GPU state.
  Suppress shadow updates with the existing shadow-preparation guard, retaining
  the current shadow-enabled policy. A gel-only mask must never overwrite live
  caster maps or consume pending cached-shadow updates. Error checks stay enabled.

Independent source review identified the absent-gel and shadow-cache cases
before completion. An intermediate build passed the ordinary/hidden allocation
test but lacked the shadow guard. Its remaining validation was deliberately
stopped; it is not the delivered build. Its ZIP is separately retained as
`specimen-production-191-transmission-intermediate.zip` (hash
`17F26C1F6B97B2752CBD8FFBED998B2A1CFBE5A4636EB4A71288041D781E576F`).

## Regression coverage

The final switching test retains four switches per level. Two switches hide all
transmissive meshes for 12 live draws, then reveal them for another 12; the reveal
must not allocate. Every live frame requires zero program growth, program/shader
inspection, storage calls and GL errors. Shader preparation must not restart,
and the queue and depth-prewarm group count must remain unchanged.

Each gated resource draw also tests pending shadow updates: inject pending global
and per-light flags at the render boundary, require flags/map identities to stay
identical across the isolated primer, then restore the test's original flags.
The strict gate transition and preparation inspection/program assertions remain.

Unit regressions cover resource-only serialization, stale readiness after resolve
or rejection, failed storage preparation, zero-time rendering, pause intent,
restart waiting and late completion after unload. Existing shader-key behavior,
pixel restoration, preparation isolation and resource lifecycle assertions remain.

## Validation results

Type-check and all **1,011 unit tests** pass on the final source. Build/archive and
production validation pass with **90 files**. The rebuilt switching test passes
all 12 switches, including the six no-visible-gel/reveal cases. Every switch has
four storage calls during preparation and zero during all measured resumed and
reveal frames. There are zero live/preparation shader inspections, zero live or
primer program growth, zero full shader-preparation calls, unchanged queue/depth
owners and preserved shadow flags/map identities. Cultivation's independent
speculative queue can still progress between live frames; its asynchronous calls
are retained separately in the evidence, not mislabeled as a shader rebuild.

The final capture's first resumed intervals range **12.2–49.6 ms**, maximum
interval 49.6 ms; no measured interval exceeds 50 ms. Gate elapsed is 2.3–4.9 ms,
with measured primer draw CPU 1.2–3.3 ms. This includes test snapshots and browser
scheduling; it is not GPU execution time. The earlier all-visible baseline's
maximum is 47.4 ms; the expanded hidden/reveal baseline's maximum is 49.6 ms.
These small, differently warmed samples do **not** demonstrate a frame
interval or FPS improvement. The reliable finding is allocation moved into an
explicit preparation phase, without new shaders or hidden first-use work.

Final production ZIP: `artifacts/specimen-production-191-transmission-final.zip`.
SHA-256: `A5C09E37147BBCB0D92F0ECE900497138487D0B54233E5CF8C69AE7FA9F45CBF`.
The previous integrated and intermediate archives remain separate. Native suites
and hardware captures run serially; unit/build work does not overlap controlled
captures.

All **12 focused native browser cases** pass: the new switching regression,
nine graphics/profile/quality/target/electrical cases, and two Cultivation
preparation-isolation cases. Both frozen pixel-restoration journeys retain the
maximum channel-difference bound of 1. Isolation is exactly pixel-equal in Normal
and Performance, with no state changes, live programs or GL errors across 466
primers each. The high-DPI lifecycle records 28 snapshots and 131 tracked shadow
maps each disposed exactly once, with zero errors. Three-level graphics cycles,
restart, character switching/fades and both native electrical profiles pass.
Existing graphics tests were not weakened or edited in this follow-up.

Source commit: `14494a0d25c8b1e0fc498a8b3d07d55af2572ef5`. Final archive and all
focused tests use this production source. Reproduction commands/configs and logs
are retained under `artifacts/191-transmission-*`; the sequential runner is
`artifacts/run-191-transmission-final-validation.ps1`.

The final hardware record is `artifacts/191-transmission-environment.json`:
Latitude 5590, i7-8650U, UHD 620 driver 31.0.101.2134, Windows 11 build 26200,
1920×1080/60 Hz, AC power/100% charge, High performance scheme. Switching probes
use 960×600/DPR1 and actual ANGLE D3D11. OS/driver caches and clock/thermal state
are not controlled; short switching windows are not loading benchmarks.

Both nested-path smoke journeys pass (1.3 minutes), followed by all seven longer
production integration journeys (4.0 minutes), against the extracted final ZIP
at `/group-folder/`. Coverage includes optional asset failures, audio ownership,
clean gameplay and no-query three-level parity for Minimum/Normal,
Standard/Normal and Standard/Performance.

The expanded regression was also run against the preserved pre-fix archive.
All 12 switches produce four storage calls on the first **visible** transmission
draw. In six hidden-body cases, the initial hidden draws allocate nothing, then
revealing a body allocates four times. On the final build, every resumed/reveal
frame is allocation-free; all 48 storage calls occur in gated primers instead.
Program growth and shader inspection remain zero. The extended baseline fails
as expected because it lacks the resource gate. Evidence and derived rows are
`191-transmission-extended-before-results`, `191-transmission-final-after-results`
and `191-transmission-comparison.json`.

## Five matched Minimum pairs

The initial final-build sanity capture was slower than the earlier session.
Instead of comparing sessions, five current pre-fix/final fresh/warm pairs were
captured against the frozen integrated feature ZIP and final output. These test
whether this resource fix preserves #191's existing Minimum improvement; the
baseline here is **the previous #191 implementation**, not upstream main.

Labels are `transmission-before-minimum-0`…`-4` and
`transmission-final-minimum-1`…`-5`. Pair indices correspond in that order;
execution alternates final→before, before→final. Pair 0 reuses the initial sanity
capture. The extended Standard regression check occurred between pairs 1 and 2;
no tests/builds overlap or intervene within a pair. HTTP routing/cache policy and
measurement hooks match. Browser/GPU/backend/settings/buffer/extensions and
enabled shader checks match in all 20 valid gameplay windows. As in earlier
studies, a fresh browser is not a guaranteed driver-cold machine.

| Median, five per cell | Pre-fix fresh | Final fresh | Pre-fix warm | Final warm |
| --- | ---: | ---: | ---: | ---: |
| Navigation to Level 1 control | 29.053 s | 26.872 s | 4.043 s | 3.972 s |
| Level 2 readiness | 21.898 s | 22.997 s | 3.765 s | 3.827 s |
| Later overlays | 2.727 s | 2.810 s | 0.704 s | 0.755 s |
| Navigation + measured Level 2 waiting, per run | 53.996 s | 54.041 s | 8.327 s | 8.246 s |
| Complete staged route to final input window | 54.271 s | 54.276 s | 8.484 s | 8.481 s |

Individual navigation + measured waiting totals, in seconds:

| Pair | Pre-fix fresh | Final fresh | Pre-fix warm | Final warm |
| --- | ---: | ---: | ---: | ---: |
| 0 | 51.052 | 59.753 | 7.620 | 11.227 |
| 1 | 54.251 | 54.041 | 8.327 | 7.810 |
| 2 | 53.996 | 54.698 | 9.218 | 8.198 |
| 3 | 54.295 | 50.635 | 7.828 | 8.841 |
| 4 | 53.646 | 50.528 | 8.875 | 8.246 |

The initial slow pair is retained. Paired fresh waiting changes range
−3.660…+8.701 s; three are faster and two slower. Mean waiting increases by
0.483 s fresh and 0.491 s warm, dominated by that first pair; median staged-route
time differs by only +5 ms fresh / −4 ms warm. These show similar observed overall
Minimum medians, not a new loading gain or strict statistical equivalence.
Level 2 readiness alone is 5.0% higher fresh and 1.7% higher warm and must not be
hidden by the total. The broader initial 26.636 s final observation is not a
repeatable +35% regression: subsequent final fresh values are 24.944, 22.997,
21.271 and 20.845 s.

For additive context, mean fresh boot is 28.754→27.493 s (−1.261 s), while Level 2
readiness is 21.701→23.338 s (+1.638 s). The Level 2 difference partitions into
submission +0.277 s, pending async elapsed +1.168 s, inspection +0.031 s,
other primer CPU +0.024 s and residual +0.138 s. This is observed timing variation
in existing preparation, not evidence of new required shader work. Its driver,
cache and scheduling contributions are not isolated; no speculative optimization
or error-check reduction is justified. The Minimum resource-only callback is
skipped, all startups retain 144 programs, all initial Level 1 source sets contain
the **same 155 byte-identical shaders**, and all rows retain 402 materials / 70
observed feature combinations. Final capture inventories differ with background
progress; they are not equal-coverage variant counts.

Frame p50/p95/p99 medians are 16.7/16.8/16.9 ms fresh on both; warm p99 is
17.0→16.9 ms. One pre-fix fresh window contains a 66.7 ms interval; no final
window exceeds 50 ms (maximum 17.0 ms fresh, 33.3 ms warm). No dropped simulation,
live shader growth/inspection or GL errors occur. Both sides retain 862 geometries
and 79 textures at all endpoints. These short capped windows do not establish
worst-case FPS, VRAM bytes or a general hitch improvement.

CPU/GPU tail measurements also vary rather than establishing a uniform gain:

| Median CPU render / GPU p50,p95,p99, ms | Pre-fix | Final |
| --- | --- | --- |
| Fresh CPU render | 5.4 / 7.6 / 8.4 | 4.3 / 6.9 / 7.9 |
| Warm CPU render | 4.1 / 6.2 / 6.8 | 4.9 / 7.6 / 8.8 |
| Fresh valid GPU queries | 5.73 / 6.97 / 9.60 | 5.20 / 6.57 / 7.54 |
| Warm valid GPU queries | 4.87 / 6.05 / 6.89 | 5.44 / 7.19 / 8.23 |

Background preparation overlaps these windows and endpoint progress differs.
Do not treat those numbers as isolated steady-state rendering-cost changes.
Derived evidence includes `191-transmission-minimum-comparison.json`,
`191-transmission-minimum-attribution.json`, and
`191-transmission-minimum-initial-shader-equivalence.json`. Raw captures preserve
pending/invalid GPU queries, phase timings and screenshots. Earlier main-vs-#191
performance evidence remains in the previous report and review bundle; it is
not substituted for this current matched resource-fix comparison.

## Review deliverables

Additional commits are `52f9a1d` (failing-first case), `14494a0` (resource readiness
and expanded regressions), followed by the report commit containing this record.
The final report SHA is recorded in `191-transmission-evidence-manifest.json` and
`191-transmission-commits.txt`.

`artifacts/191-transmission-evidence.zip` contains raw controlled and diagnostic
switching captures, all five matched Minimum pairs and summaries, original
failures/intermediate logs, final verification logs, graphics/electrical
screenshots, current capture tools, reproduction configs/runners and the branch
diff from `97651ed`. Every archived entry, including the manifest, is checked
against its byte length and SHA-256 after writing. Production archives and
dependency/source snapshots are delivered separately rather than duplicated in
the evidence bundle. The package log records the bundle hash.

No push or PR creation has occurred. The supplied untracked review patch and
unrelated original-checkout changes remain untouched. Stop for independent review.

Windows UHD 620 / ANGLE D3D11 results do not qualify the expected Ubuntu i3-1220P
/ Alder Lake GT2 assessment machine. No driver-cold, thermal-soak or full legal
three-level playthrough claim is made. Keep the prior Standard loading results
visible; this resource-only correction is not evidence that their regression is
resolved.
