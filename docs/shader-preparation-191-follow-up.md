# Issue #191: Standard loading and latest-main integration

Subsequent review follow-up: [direct transmission resource switching](shader-preparation-191-transmission.md).

This follows [the initial implementation report](shader-preparation-191.md).
The work remains on `codex/191-shader-preparation`; no push, PR creation or PR
merge is authorized. Merging upstream main into the feature branch is explicitly
requested. Historical evidence and all existing feature commits are retained.

## Revisions and controlled comparison

- Original baseline: `0cbd21ade13b5dba584d1858c49db93747a8dadf`.
- Pre-integration candidate: `8fccf151a9a3bc2f2977141d49cc3a180b95e271`
  (production rendering source `4117b6f`).
- Latest main fetched for integration:
  `9b7a4803daa09d3fa0c14595dd012835b1f94ca3`, including PRs #208–#211.

Standard repeat labels are `standard-repeat-before-0` through `-4` and
`standard-repeat-after-0` through `-4`. Each label contains one fresh/warm pair;
five pairs per revision are compared. Execution is serial, alternating AB/BA
order across matched pairs. No build, browser test or other benchmark runs in
parallel. Frozen production output is used throughout each comparison.

Hardware is the same Windows 11 i7-8650U / UHD 620 machine, AC connected at 100%
battery with High performance power scheme. Headed Edge uses ANGLE D3D11,
960×600 CSS pixels, requested DPR 1 and the same settings and diagnostic wrappers
on both builds. The raw rows record browser version, actual renderer, extensions,
effective buffer and `checkShaderErrors`. The environment record is
`artifacts/191-standard-repeat-environment.json`.

A fresh profile is not a guaranteed cold driver cache. HTTP cache is disabled
by interception; OS/driver caches, CPU/GPU clocks and thermal state remain
uncontrolled. Alternating order reduces ordering bias but does not remove it.
Warm means the second navigation in the same browser context. The route uses
ordinary production URLs and staged controller completion/room entry followed by
real bounded input. It is not a complete puzzle playthrough or thermal soak.

`profile-shader-preparation.mjs` now records title readiness, the settings request,
Level 1 preparation/verification and `prepareGraphics` intervals. The same
instrumentation is used on every compared source revision. Existing raw evidence
is unchanged.

`analyze-shader-loading.mjs` produces `loading.json` per capture. It partitions
wall time without double counting: compile submission, first-use inspection,
other primer CPU, pending async compilation elapsed, then residual work. Pending
async intervals include browser scheduling and other work; they are not isolated
GPU compiler time. Upload CPU is a nested submetric. Queue totals and nested
runtime method timings are contextual and must not be added to those partitions.
The broad residual includes module/asset loading, construction, title preparation,
UI automation and uninstrumented work; it is not all game CPU time.

## Repeated Standard result before integration

All 20 gameplay windows (five fresh and five warm per revision) pass validation.
The one-pair regression is repeatable in total waiting, although individual
values vary. Median route waiting increases by 6.918 s (10.9%) fresh and 0.313 s
(3.4%) warm. This does not meet the no-increase Standard waiting target.

| Median, five runs per cell | Original main fresh | #191 fresh | Original main warm | #191 warm |
| --- | ---: | ---: | ---: | ---: |
| Navigation to Level 1 control | 27.723 s | 33.125 s | 4.093 s | 4.523 s |
| Level 2 transition to control | 31.426 s | 33.121 s | 3.977 s | 4.199 s |
| Later Level 2 overlays | 4.863 s | 4.063 s | 1.212 s | 0.897 s |
| Navigation plus all measured Level 2 waiting, per run | 63.464 s | 70.381 s | 9.266 s | 9.578 s |
| Live Level 2 program inspections, each run | 51 | 0 | 51 | 0 |
| Median frame p50 / p95 / p99 | 16.7 / 16.8 / 16.8 ms | 16.7 / 16.8 / 16.8 ms | 16.7 / 16.8 / 16.9 ms | 16.7 / 16.8 / 16.8 ms |
| Maximum observed frame interval | 19.7 ms | 17.7 ms | 19.6 ms | 17.0 ms |
| Hitches >50 ms, all five windows | 0 | 0 | 0 | 0 |

These short, capped windows do not establish sustained FPS or thermal behavior.
The report separates medians of per-run values from additive accounting below.

Individual matched waiting measurements, in seconds (navigation plus measured
Level 2 readiness and later overlays):

| Pair | Original main fresh | #191 fresh | Original main warm | #191 warm |
| --- | ---: | ---: | ---: | ---: |
| 0 | 60.860 | 69.616 | 9.291 | 9.830 |
| 1 | 63.464 | 74.645 | 9.796 | 10.809 |
| 2 | 64.841 | 69.501 | 9.113 | 9.578 |
| 3 | 64.509 | 70.381 | 9.056 | 9.497 |
| 4 | 63.427 | 72.420 | 9.266 | 9.555 |

### Where the fresh waiting difference occurs

The following **means** partition the route; their differences sum to the mean
route difference of 7.893 s, subject to rounding. The route starts with default
Minimum preparation, selects Standard at the title, then immediately completes
Level 1 through the diagnostic controller shortcut. It never traverses Level 1's
later rooms, so formerly deferred work for those rooms is absent from the
baseline's waiting figure.

| Mean wall-clock phase, five fresh runs | Main | #191 | Difference |
| --- | ---: | ---: | ---: |
| Navigation to title ready | 24.639 s | 25.625 s | +0.986 s |
| Title ready to settings request | 0.095 s | 0.100 s | +0.005 s |
| Standard settings request to Level 1 control | 1.858 s | 8.376 s | +6.518 s |
| Level 2 transition to control | 31.843 s | 32.880 s | +1.037 s |
| Later overlays | 4.985 s | 4.332 s | −0.653 s |
| Total | 63.420 s | 71.313 s | +7.893 s |

The settings phase supplies most of the difference. Its exclusive mean breakdown
is 0.079 s compile submission, 7.220 s pending async elapsed, 0.017 s inspection,
0.807 s other primer CPU and 0.253 s residual. The old baseline instead spends
1.418 s in first-use inspection, 0.006 s in other primer CPU and 0.434 s residual,
without an awaited Standard preparation pass. #191 performs 36 compile calls and
36 inspection calls in this phase; the baseline makes zero compile calls and six
inspection calls before immediate control. This is principally earlier required
first-use coverage, with repeated binding/primer work also present.
Attribution inspection counts combine program-log and shader-log queries; they
are not shader variant counts. The table's live program inspections count only
`getProgramInfoLog`.

Level 2's extra mean 1.037 s comprises +0.009 s submission, +0.771 s pending async
elapsed, +0.043 s inspection, +0.058 s other primer CPU and +0.156 s residual.
Uploads are about 20–21 ms nested CPU on both sides, not the source of a
multi-second regression. Queue collection is about 12 ms in the candidate;
queue CPU/primer totals cover later work too and cannot be added to this startup
partition. Full per-run and fresh/warm breakdowns are in
`191-standard-repeat-loading.json`, `191-standard-repeat-attribution.json` and
`191-standard-repeat-mean-attribution.json`.

There is substantial variability in default boot timing and the split between
async completion and blocking inspection. For example, median initial-boot
pending async time is 19.152→13.330 s while inspection is 2.527→8.264 s. The
underlying driver work is not isolated by those categories. The total result,
rather than one favorable internal clock, determines acceptance.

## Focused correction

The new first-draw allocation probe fails on `8fccf15`: four calls resize/rebuild
the retained transmission target (two multisample storage calls, one texture
image and one depth storage call). It already has zero new programs, zero lazy
inspections and zero GL errors. The final Containment primer inherits isolation's
scale 1, whereas Standard's effective scale is 0.5.

`a4e55f9` captures the gameplay scale outside isolation and reapplies it inside
the final full-viewport primer, matching the existing Cultivation pattern. The
same probe then passes with zero storage calls as well. This fixes measured
first-control resource work; those calls take less than the clock resolution
in the raw runs, so it is not presented as a multi-second loading win.

Skipping the full Standard pass or its error checks would remove coverage.
A transmission-only delta path would need explicit per-signature readiness and
binding ownership across every light layout, fade and cancellation. The measured
fresh settings phase is dominated by newly awaited compiler work, so that larger
change is not justified as a safe quick fix here. No shader or pixel assertions
are relaxed. The allocation probe covers 960×600/DPR1; title resolution caps and
later resize/settings changes can legitimately require differently sized targets.

## Integration scope

Main includes direct collision-candidate iteration (#211), scanner-beam clipping
per presented frame (#209), layered Volt electrical effects (#210), legacy
browser audio/resize support, and a split between short production smoke and
longer integration checks (#208). Preserve each change and its tests. Running
`test:smoke` alone now covers only two journeys; run `test:integration` as well.
The submission ZIP workflow remains a separate release requirement.

Read-only peer inspection found no new shader-family coverage hole from Volt's
hidden ribbon/fork/travel/corona/impact objects: Blackout preparation traverses
hidden drawables and retains their custom attributes and shader hooks. Scanner
updates reuse existing geometry/materials and occur after the preparation gate.
The integrated browser checks additionally exercise both electrical profiles.

Integration commit: `2d9ad2fa9b320134d4bccfb41f9ecb4b6a85a713`. There were no
conflicts. Git automatically combined the Cultivation runtime insertion, and
ancestry checks confirm both main `9b7a480` and feature `8fccf15` are preserved.
No upstream optimization or workflow change was dropped.

The integrated electrical browser fixture retains its existing five-draw,
resource, contact-position, instability, disconnect and recovery assertions.
It adds Standard and strict live shader/inspection guards. Decorative particle
counts are exact for the existing profiles: Minimum 12, Standard 24. This checks
the authored density policy rather than forcing both profiles to look identical.

Independent read-only review found no remaining production-source blocker in
the scale correction or integration. It identified an instrumentation limitation:
the optional `compile.configuration` field closes over the first attached runtime
and is therefore unavailable for Level 2 in these captures. Global owner, wall
timestamps, counts and the queue's own diagnostics are correct and are the inputs
to the reported comparison. Do not infer per-configuration compiler timings from
that optional field. Instrumentation is kept unchanged throughout a matched
series; the missing metadata does not become a guessed configuration.
After both series finished, the optional hook was corrected to read the current
attached runtime for future captures. The exact capture script used for these
measurements is retained as `artifacts/191-capture-tool-used.mjs`; existing raw
data is not rewritten or backfilled.

## Reproduction and review inputs

Baseline output is built from a Git archive of the exact SHA, with its own
`npm ci`; it is not the dirty original checkout. The integrated production source
is `2d9ad2f`; subsequent browser-test/report edits do not change the served build.
Use Node 24 / locked npm 11.18.0, and preserve Vite's relative base.

For each paired index, alternate before/after ordering and run these captures
serially. Use unique labels to preserve earlier evidence:

```powershell
node scripts/profile-shader-preparation.mjs --label integrated-before-standard-0 --dist artifacts/191-latest-main-source/dist --profile standard --runs 1 --channel msedge --headed
node scripts/profile-shader-preparation.mjs --label integrated-after-standard-0 --dist dist --profile standard --runs 1 --channel msedge --headed
```

The integrated labels use indices 0–4 for Standard, 0–1 for Minimum. The order is
AB at index 0, BA at index 1, and alternates thereafter. Standard runs first at
each index; Minimum runs after it at indices 0 and 1. This gives five fresh/warm
Standard pairs and two fresh/warm Minimum pairs **per revision**. HTTP routing
and all instrumentation are the same; shader checking remains enabled.

```powershell
node scripts/summarize-shader-preparation.mjs <space-separated-labels>
node scripts/analyze-shader-loading.mjs <space-separated-labels>
node scripts/compare-shader-preparation.mjs <comma-separated-before-labels> <comma-separated-after-labels>
```

Local native browser configuration and the sequential verification command are
preserved as `artifacts/playwright.hardware.config.ts` and
`artifacts/run-191-integrated-browser.ps1`. They run the affected renderer tests,
graphics/quality/target tests, both electrical profiles, acid ripples, then the
new short smoke and longer integration suites against the extracted production
ZIP at `/group-folder/`. Native headed input-driven suites never overlap.

Integrated type-check and all **1,003 unit tests** passed. Build, production ZIP
creation and layout/HTML/CSS validation passed with **90 files**. Logs are
`191-integrated-types.log`, `191-integrated-unit.log`,
`191-integrated-archive.log` and `191-integrated-validation.log`.

Integrated production ZIP: `artifacts/specimen-production-191-integrated.zip`.
SHA-256: `EE4B21FEB620E665AB388857D0CCAA17FC6176BE8437DCFEC74E597C87912CB4`.
The pre-integration ZIP is separately retained as
`artifacts/specimen-production-191-pre-integration.zip`; earlier measurements and
reports must not be interpreted as measurements of the integrated build.

## Matched results after integration

All 28 gameplay windows validate: five fresh/warm Standard pairs and two
fresh/warm Minimum pairs per revision. Browser, renderer/backend, extensions,
profile, transmission mode and effective buffer match. The comparison rejects
invalid gameplay or disabled shader checks. The production source stayed frozen
throughout capture; no tests or builds ran concurrently.

| Median metric | Main fresh | Integrated fresh | Main warm | Integrated warm |
| --- | ---: | ---: | ---: | ---: |
| Standard: navigation to Level 1 control | 26.962 s | 32.830 s | 4.444 s | 4.547 s |
| Standard: Level 2 readiness | 30.880 s | 31.890 s | 3.798 s | 4.098 s |
| Standard: later overlays | 5.127 s | 4.071 s | 1.226 s | 0.891 s |
| Standard: navigation plus measured Level 2 waiting | 63.819 s | 67.960 s | 10.293 s | 9.925 s |
| Standard: complete staged route to final Room 1 input window | 64.135 s | 68.200 s | 10.526 s | 10.114 s |
| Minimum: navigation to Level 1 control | 25.225 s | 24.705 s | 3.811 s | 3.500 s |
| Minimum: Level 2 readiness | 31.474 s | 19.685 s | 3.786 s | 3.312 s |
| Minimum: later overlays | 4.651 s | 2.256 s | 1.741 s | 0.659 s |
| Minimum: navigation plus measured Level 2 waiting | 61.350 s | 46.645 s | 9.338 s | 7.470 s |
| Minimum: complete staged route to final Room 1 input window | 61.554 s | 46.889 s | 9.499 s | 7.647 s |

The complete staged-route endpoint is `gameplayStartAt`, measured from navigation
and already retained in raw captures. It includes non-overlay work during room
visits and automation overhead. It complements the original waiting metric;
neither is a complete authored playthrough. Medians of columns need not add up.
The original repeat's corresponding full-route medians are 63.756→70.622 s fresh
and 9.514→9.800 s warm, confirming the same conclusion.

Fresh Standard still misses the waiting target: +4.141 s (6.5%) on the original
metric and +4.066 s (6.3%) on full staged-route elapsed. Four of five matched fresh
pairs are slower; one is faster by 2.160 s. Warm paired differences have both
signs (−0.745 to +0.641 s); the apparent median warm benefit is not a demonstrated
general speedup. The larger pre-integration study had all five fresh and all five
warm waiting differences positive. The required readiness pass is repeatable;
the exact total delta also contains meaningful variability.

Minimum retains the gain: fresh readiness is 37.5% lower, and full staged-route
elapsed is 23.8% lower. Its two-pair integration recheck is smaller than the
earlier five-pair study and cannot establish exhaustive frame-tail or thermal
qualification.

### Integrated Standard accounting

The fresh **mean** waiting difference is +3.786 s (64.9997→68.7854 s). The additive
phase deltas are boot −1.871 s, title/settings gap +0.022 s, Standard selection to
control +6.438 s, Level 2 readiness +0.269 s and later overlays −1.072 s.
The Standard settings phase again dominates: mean 8.235 s, partitioned into
0.078 s submission, 7.103 s pending async elapsed, 0.018 s inspection, 0.790 s
other primer CPU and 0.247 s residual. Baseline is 1.797 s, dominated by 1.371 s
first-use inspection without the full awaited pass. Mean warm waiting is nearly
flat (10.0934→10.0695 s), illustrating why the median alone is not enough.

Queue diagnostics supply a separate, nested cross-check. Mean fresh Level 2
queue startup is 29.770→30.038 s; construction is 0.544→0.482 s. Cumulative
queue-step CPU through the endpoint is 1.562→1.598 s, including primer CPU
0.764→0.917 s and texture warmup 0.014→0.012 s. Candidate collection costs
0.011 s. Candidate compile submission/async counters are 0.527/34.929 s
cumulatively, including later foreground/background work; the async total is
not startup-only or isolated GPU time. The old queue lacks those separate
submission/collection counters, which must not be interpreted as zero work.
Warm queue startup is 2.502→2.633 s; cumulative queue CPU is 1.486→1.546 s.
These overlapping queue counters cannot be added to the exclusive phase table.

All ten integrated Standard first-control captures show **zero upload/storage
calls**, compared with four per pre-integration candidate capture. The focused
before/after probe independently verifies that correction. No multi-second gain
is attributed to these sub-clock-resolution calls. Comparisons between different
study sessions cannot isolate the allocation correction from main and variability.

### Frames, compiler pressure and retained resources

No final candidate window has a >50 ms hitch, dropped simulation or live program
growth/inspection. Maximum candidate interval is 17.8 ms across both profiles.
Standard p50/p95/p99 medians are 16.7/16.8/16.8 ms fresh and warm; main is
16.7/16.8/16.8 fresh and 16.7/16.8/16.9 warm. Capped, short windows are not a
sustained FPS or worst-case assessment-PC qualification.

Fresh Standard CPU render p50/p95/p99 medians are 8.8/10.9/17.7→5.4/7.4/8.0 ms;
fixed-update 1.6/2.8/3.3→1.1/1.8/2.2 ms; valid GPU query equivalents
12.18/13.65/15.64→9.93/10.94/12.66 ms. Fresh Minimum equivalents are CPU render
5.85/7.35/15.50→3.95/5.60/6.15 ms and GPU 6.06/6.87/8.94→4.63/5.52/6.39 ms.
These reflect different competing prefetch work, not proof of cheaper steady-state
physics/rendering. Invalid, disjoint and pending queries remain in raw evidence.

Standard startup stays at 209 programs on both builds; Minimum falls 209→144.
All have 402 live materials / 70 observed feature combinations. Fresh Standard
compile submissions process median 1827→1112 objects, with zero-growth objects
837→256 and submission CPU 620→518 ms. Minimum equivalents are
1838→677.5 objects, 841→186 zero-growth objects and 622→330 ms CPU. A fractional
two-run median is an aggregate, not half an actual object.

End-of-window counts depend on prefetch progress: Standard 260→247–250 fresh,
297→257–259 warm; Minimum 266→173 fresh, 297→182 warm. Do not count that entire
difference as eliminated variants. Pending batches are explicitly retained in
summaries. All endpoints have 862 geometries. Standard textures are 80→81 fresh
(main warm 78–80, candidate 81); Minimum fresh 79 on both, warm 77→79. These
include retained preparation/renderer caches and differing in-flight work; they
are not equal-coverage VRAM byte measurements or proof of a resource leak.

Derived evidence: `191-integrated-standard-comparison.json`,
`191-integrated-minimum-comparison.json`, `191-integrated-attribution.json`,
`191-paired-standard-deltas.json` and `191-follow-up-loading.json`.

Individual matched latest-main Standard waiting measurements, in seconds:

| Pair | Latest main fresh | Integrated fresh | Latest main warm | Integrated warm |
| --- | ---: | ---: | ---: | ---: |
| 0 | 65.797 | 71.758 | 10.717 | 10.607 |
| 1 | 63.619 | 67.960 | 8.759 | 9.399 |
| 2 | 69.490 | 67.330 | 10.228 | 9.483 |
| 3 | 63.819 | 69.081 | 10.470 | 9.925 |
| 4 | 62.274 | 67.797 | 10.293 | 10.934 |

## Verification and review handoff

The native Edge renderer suite passed all 10 cases: Cultivation preparation,
Room 5's immediate PCF draw, normal/performance room and fade traversal,
bounded light/power lifecycle, preparation isolation, and debug/plain Level 1
traversal in both profiles. Both isolation captures have maximum pixel difference
0, no state changes, no live programs and no GL errors; each executes 466 primer
draws including transmission. Plain traversal also requires zero lazy program
inspections.

The three-level graphics/settings cycle passed, recording 12 snapshots across
all levels with no live program growth, inspections or GL errors. First Standard
gameplay draw has zero target allocation calls. Acid ripple variants passed in
normal, performance and Minimum modes.

The initial graphics group passed 9/12 and exposed three fixture problems; its
failure log is preserved rather than replaced:

- The high-DPI journey sampled CSS dimensions before ResizeObserver delivered
  the matching renderer resize. Sampling now waits at most 10 seconds for actual
  renderer/CSS agreement; all original buffer, aspect and budget checks remain.
- The debug pixel fixture could record its first reference before a synchronized
  runtime draw. Sampling now uses the actual runtime render path with fixed
  interpolation/time. Normal/restored camera, body and presentation matrices and
  material values must match exactly, in addition to the unchanged pixel bound
  of at most 1 channel value.
- Standard uses a 24-particle geometry with the default unrestricted draw range
  (`Infinity`). The fixture now measures the effective count as the smaller of
  draw range and position count, requiring exactly 12/24 for Minimum/Standard
  and an unchanged 24-particle pool. Five extra draws, stable lights/resources,
  contact positions, power/instability/disconnect/recovery, and zero live shader
  compilation/inspection remain strict.

Read-only independent peer review found no production blocker or weakened
assertion in these corrections. All seven scoped native rerun cases passed
(4.1 minutes), including the complete high-DPI lifecycle, narrow framebuffers,
profile comparison, both pixel-restoration cases and both electrical profiles.
The production source and ZIP remain frozen at integration commit
`2d9ad2f`; these fixture and report corrections do not alter measured code.
The high-DPI lifecycle records 28 snapshots, zero errors and 131 shadow-map
resources each disposed exactly once at unload.

Native Volt samples explicitly report Intel UHD 620 / ANGLE D3D11. Both profiles
have zero live program growth and inspections through connection, instability,
three disconnect/reconnect cycles and checkpoint recovery. Minimum/Standard
effective impact counts are 12/24, pool 24 on both. Representative connected and
unstable captures were visually inspected: the tether, bright contact and orange
instability cue remain visible. This is a scoped visual check, not exhaustive
assessment-hardware qualification. Logs are `191-repaired-native.log`; samples
and images are under `artifacts/evidence/issue-131/native-channel/`.
Both electrical profiles also pass separately on actual SwiftShader/Vulkan
(3.2 minutes), with zero live growth/inspections/errors and the same exact
12/24 particle counts. This software-renderer correctness run is separate from
all hardware timing measurements. Its log is `191-repaired-software.log` and
captures are under `artifacts/evidence/issue-131/swiftshader/`.

Both short nested-path production smoke cases passed (1.3 minutes). All seven
longer integration cases passed (3.7 minutes): optional character-detail failure,
normal/performance clean gameplay across levels, audio decoding/ownership/reset,
and no-query three-level gameplay parity in Minimum/Normal, Standard/Normal and
Standard/Performance. These run against the extracted archive at `/group-folder/`.
Logs are `191-integrated-smoke.log` and `191-integrated-production.log`; extraction
and actual browser journeys complement the static archive validation.

The Linux assessment machine remains untested. Its expected verified hardware
is the photographed i3-1220P / Alder Lake GT2 NUC, distinct from the older parent
issue's i5 assumption and this Windows UHD 620 test host. Browser version,
WebGL backend, actual display/settings and CPU/GPU behavior on that machine
still need capture. No full legal three-level playthrough, thermal soak or VRAM
byte measurement is claimed. Fresh Standard waiting remains an unmet target
for independent review; it is not hidden by moving work into gameplay.

Follow-up commits preserve the original feature history:

- `07162b2`: phase attribution and failing first-draw target regression probe.
- `a4e55f9`: effective Standard transmission scale during final primer.
- `2d9ad2f`: merge latest main `9b7a480`, without conflicts.
- `32e3e89`: integrated graphics fixture repairs and both-profile electrical QA.
- The final report/tooling commit contains this document, full-route derived
  metrics and the future-capture metadata correction; find its exact SHA in the
  evidence manifest and commit log.

Review package: `artifacts/191-follow-up-evidence.zip`, with embedded
`artifacts/191-follow-up-evidence-manifest.json`. It contains all 24 capture
labels (48 fresh/warm windows), per-run summaries/attribution, screenshots,
environment records, both allocation probes, original failure logs and reruns,
native/software VFX evidence, production smoke/integration outputs, current
diagnostic tools, the exact capture tool used, and the diff against latest main.
Source snapshots/dependency folders and production ZIPs are excluded; the
production archive is delivered separately. Packaging verifies every entry's
length and SHA-256 by reading it back from the archive, including the manifest.
The package log records the final archive SHA-256. The older review bundle and
pre-integration archive remain separate historical evidence.

No push, PR creation or PR merge has occurred. Stop here for independent review.
