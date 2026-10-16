# Issue #191: integration with Cultivation workloads and the opening cinematic

For the subsequent PR-review correction, see the [dark-room readiness report](shader-preparation-191-dark-readiness.md). The measurements below describe the earlier integration revision. Earlier [implementation](shader-preparation-191.md),
[Standard regression](shader-preparation-191-follow-up.md) and
[transmission switching](shader-preparation-191-transmission.md) reports are historical
measurements under their explicitly recorded revisions and startup routes.
The user's latest instruction authorizes a push and PR after correctness checks;
previous no-push/no-PR statements describe those earlier review stages.

## Integrated revisions and conflicts

Upstream main is `8f6722bc8662b06dcf1cf6efdc0d1988365a9f4d`, including
[#212](https://github.com/Gradient-Ascenders/Specimen/pull/212) and
[#213](https://github.com/Gradient-Ascenders/Specimen/pull/213). Merge commit
`d8d58086af9521c90f93091e54854fbe9665e9dc` retains both parents and the full
existing #191 history. No rebasing, resets or discarded source were used.

Six files conflicted:

- `GreyboxLevelRuntime.ts`: retain `prepareRenderResources`, cinematic aftermath
  methods, and the new yields between individual preparation jobs. Derive the
  retained-camera primer dimensions from future gameplay settings, not the
  cinematic's current buffer.
- `main.ts`: retain the graphics overlay and key handling. Defer runtime loading
  until the cinematic's `prepareLevel`, and call the session's
  `prepareInitialGraphics` there. Retain the small title-only boot and the
  cinematic's readiness/skip/handoff ownership.
- `CultivationPresentationPreparation.test.ts`: retain both the Minimum shader
  assertions and #212's assertion that enumeration does not mutate live scopes.
- `CultivationBobPresentation.spec.ts`: retain the real asynchronous graphics
  preparation helper rather than mutating materials directly; retain the
  explicit cinematic handoff and workload checks.
- `GraphicsQuality.spec.ts`: retain the exact frozen-pose pixel comparison and
  wait for the real cinematic handoff before entering paused gameplay.
- `LevelOneShaderProgramStability.spec.ts`: retain program/inspection probes,
  establish the requested profile before Start, skip through actual readiness,
  and arm traversal checks after the cinematic hands off. Remove duplicate Start.

Gameplay-only browser cases and the Volt electrical probe now explicitly skip the
opening while still waiting for real readiness. They do not bypass preparation.

## Confirmed integration defects and fixes

Title settings now precede level construction. The session applies settings on
an unloaded runtime without requesting its nonexistent GPU resources. The
opening still performs a mandatory initial pass for the resulting settings.
Settings during that pass retain the existing serialized, latest-request behavior.
A new coordinator test checks that several title changes construct no level,
perform no shader preparation, then prepare exactly once when the opening loads.

The complete initial unit suite found one double disposal in newly combined main:
`OpeningRoomOne` registered newly created batch instances in its own disposal set,
while #212's batching owner also disposed them. Remove only that duplicate
registration. Original source instances, including detached ones, keep their
existing owner. The existing exact-once cinematic disposal assertion now passes.

The new browser probe used Standard/Normal, 1280 x 800 CSS pixels, DPR 1 and
75% gameplay scale, so cinematic and gameplay dimensions differ. Before the
resource correction it recorded:

| Visible draw | New programs | Shader inspections | Storage calls |
| --- | ---: | ---: | ---: |
| Cinematic, first transmissive Bob | 0 | 0 | 4 |
| First gameplay frame after natural handoff | 0 | 0 | 4 |
| First gameplay frame after early skip | 0 | 0 | 4 |

The four calls are two `renderbufferStorageMultisample`, one `texImage2D` and one
`renderbufferStorage`. Their driver completion time is not measured by call count.
The first run's Minimum case had no cold draws but an overly strict observation
of the transient `complete` attribute: it is set and removed in the same handoff
task. The probe now requires all substantial visible stages and actual gameplay;
the delayed-asset nested test separately checks the retained complete/waiting state.

`OpeningGameScene` now uses the real cinematic viewport and transmission scale
inside its existing hero primer. The off-canvas scissor and synchronous restoration
remain enforced by the unit test. No new compile or extra primer was added.
`RenderLayer.getGameplayPrewarmViewport` resolves future physical gameplay
resolution from the existing bounds/caps. Containment uses that viewport for its
existing retained-camera primer without resizing/clearing the visible cinematic.
The unit fixture checks the high-DPI formula and disallows resize calls.

Cultivation's prepared room set is a diagnostic union, not permission to draw.
The queue still checks exact visible roots and compatible light signatures before
any live draw. #212's camera/body/lift visibility rules, split-body simulation,
static batching and frozen transforms remain intact. Queue enumeration calls the
non-recording visibility path and restores every root and lift-geometry flag.

A further ownership interaction was corrected in `e97045a`: replacing a queue
for shader-affecting settings retains the old compiler resources until safe release.
Its eventual completion/disposal must not publish into, or clear, the replacement
queue's workload records. Updates are guarded by the existing diagnostics owner;
settings explicitly clear old preparation scope before rebuilding. A regression
prepares a replacement and verifies that retiring the old queue leaves its new
prepared/preparing records unchanged. No shader cache or readiness criterion was
weakened. Resource-only switches keep their existing queue and avoid shader rebuilds.

## Measurement boundaries and remaining performance work

The historical Standard regression remains unresolved. Against main `9b7a480`,
five matched pairs measured median navigation plus Level 2 waiting
**63.819 -> 67.960 seconds fresh**; warm medians were 10.293 -> 9.925 seconds.
The mean warm total was nearly unchanged, and short warm frame/CPU/GPU tails were
mixed. Required inspection/preparation formerly paid lazily is now awaited, but
that does not prove the entire fresh regression is necessary or acceptable.
The earlier report contains exclusive phase attribution and raw run references.

Historical Minimum shader reduction (209 -> 144 Level 2 startup programs) and
transmission-free preparation remain implemented. The earlier latest-main study
measured Level 2 readiness 31.474 -> 19.685 seconds fresh; that study had two
pairs. The later five-pair resource-fix recheck showed similar route medians
54.271 -> 54.276 seconds fresh and 8.484 -> 8.481 seconds warm, but fresh Level 2
alone rose 5% and warm CPU/GPU tails worsened. None of these numbers qualifies
performance after the new cinematic or establishes worst-case assessment behavior.

The capture tool now records observed `pre-cinematic-v1`, `opening-natural-v1`,
or `opening-skip-v1` routes. Opening wall time includes overlapping Level 1
preparation; it is recorded separately from Level 2 transition/readiness/overlay
waiting. Visible cinematic draws have their own phase and are not counted as
preparation primers. Summaries preserve the route and opening timeline; the
comparison tool rejects mixed routes. Natural playback, early skip and the old
title-preparation route must never be compared as interchangeable startup totals.

All current browser evidence is local Windows / Intel UHD 620 / native Edge,
not Ubuntu qualification. The expected Wits machine remains the photographed
ASUS NUC12WSK-B, i3-1220P / Alder Lake GT2, 16 GiB, Ubuntu 24.04.1,
GNOME 46/Wayland, kernel 6.8.0-124-generic. Its actual browser/backend, resolution,
settings, thermal behavior, CPU/GPU frame tails and full three-level authored
playthrough remain outstanding. No driver-cold or VRAM byte claim is made.

## Validation record

Final validation results and artifact hashes are recorded below. Raw files use the `artifacts/191-main213-*` prefix;
the reproduction runner is `artifacts/run-191-main213-validation.ps1`.

Production rendering source is `e97045a`; subsequent capture-tool/report changes
do not alter the served game. The submission workflow is preserved: it still
builds/validates a production ZIP after merges to main, performs nested-path smoke,
and uploads the verified downloadable ZIP. Opening this PR does not merge it or
claim that the main-only submission workflow has already run for the feature branch.

The completed checks include 1,062 unit tests (zero failures/skips), type-check, generated assets,
build/archive validation (90 files), 15 graphics/browser cases, four Cultivation
cases, three Level 1 traversal cases and two native-channel nested smoke cases.
The Cultivation isolation probes each exercise 313 compile submissions and 508
primers: maximum pixel difference 0, live program growth 0, state changes empty,
GL errors empty. The direct switching probe covers 12 switches: 48 gated storage
calls, zero resumed/reveal storage/inspection/program growth, zero full shader
passes and preserved queue/depth/shadow ownership. Its maximum observed frame
interval is 49.6 ms; no stable frame-rate improvement is inferred.

The initial nested production parity run exposed an inherited fixture mismatch:
#212 regenerated 138 repaired meshes, but `ProductionParity.spec.ts` still
expected 137. The runtime and manifest both report 138 and generated assets
reproduce exactly. Commit `780200f` changes both exact expected counts to 138;
no assertion is removed or relaxed. Original failures remain recorded separately
from the subsequent profile-specific rerun.

## Final integrated captures and verification

All final selections pass: 15 graphics/opening/resource/electrical cases, four
Cultivation cases, three Level 1 traversal cases, two native nested smoke cases,
four unchanged integration cases plus all three corrected parity reruns, one
natural delayed-asset nested cinematic case, one DPR 1.5 handoff rerun and two
CI-configured software-renderer nested smoke cases: **35 passing browser cases**.
The initial integration log retains four passes/three stale-fixture failures;
`191-main213-parity-final.log` records the three passing replacement runs.
The additional runner exits successfully with every check zero. The main runner's
integration exit 1 is retained and explained, rather than overwritten as a pass.

The high-DPI probe uses requested DPR 1.5 and a different cinematic/gameplay
resolution. It retains zero first-gameplay storage/inspection/program growth.
Natural DPR 1 captures contain 1,591 Minimum and 1,585 Standard visible cinematic
draws, all with zero measured storage/inspection/program growth. Their captured
initial gameplay windows contain 26 and 30 draws; both early-skip windows contain
13 draws. Representative experiment signage, pod/cracking, goo formation and
first gameplay screenshots were inspected. These are representative visual checks,
not a complete human playthrough or proof of continuous cinematic frame pacing.

New captures `main213-minimum-natural` and `main213-standard-natural` each contain
one fresh/warm pair at 960 x 600 CSS pixels, requested DPR 1, native headed Edge
155.0.4283.45 / ANGLE UHD 620 D3D11. Runs are serialized after build/test jobs.
They are **single-pair sanity measurements without a matched new-main baseline**,
not a before/after performance claim. Fresh means a new browser, not a cold driver;
warm is a second navigation in the same context. HTTP interception disables the
HTTP cache; OS/driver cache, thermal state and clock variation are uncontrolled.

| Profile/cache | Navigation to title (s) | Opening wall (s) | Navigation to control-ready (s) | Level 2 readiness (s) | Later room waiting (s) | Complete staged route (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Minimum fresh | 3.080 | 71.237 | 74.585 | 20.722 | 2.652 | 98.260 |
| Minimum warm | 1.105 | 55.553 | 56.802 | 3.764 | 0.660 | 61.375 |
| Standard fresh | 2.394 | 67.884 | 70.779 | 38.272 | 5.447 | 115.023 |
| Standard warm | 0.817 | 55.747 | 57.054 | 4.170 | 0.893 | 62.326 |

Opening wall time is the observed opening-state span. It includes waits and
Level 1 preparation overlapping the authored animation; it is **not** an additive
phase beside navigation-to-control, nor pure animation time. Control-ready means
running runtime, enabled input and an actual Level 1 draw; automatic cinematic
completion still needs the normal canvas click to acquire mouse pointer lock.
Level 2 readiness starts at the staged Level 1 completion boundary and includes
the transition click. Later waiting is measured queue-overlay time after that.
The full route also includes staged room visits and automation. Do not subtract
or compare these totals to the old pre-cinematic route as an optimization result.
The slow fresh opening spans and fresh Standard Level 2 value remain visible.

Minimum starts Level 2 at **144 programs** in both samples, Standard at 209;
all four inventories contain 403 source materials and 70 feature signatures.
Endpoints have 891 geometries and 79 Minimum / 82 Standard textures. These are
resource counts rather than VRAM byte estimates; background preparation progress
varies. All four input windows are validator-approved, alive/running, visible,
focused, actually drawn and moving, with zero dropped simulation, live program
inspections/growth, console errors or GL errors. Shader error checks stay enabled.

The roughly four-second Room 1 windows have the following distributions in ms:

| Profile/cache | Frame p50/p95/p99 | CPU render p50/p95/p99 | Valid GPU query p50/p95/p99 | Maximum frame | Derived FPS / 1% low |
| --- | --- | --- | --- | ---: | --- |
| Minimum fresh | 16.7 / 16.8 / 16.9 | 3.7 / 10.2 / 17.8 | 5.07 / 7.43 / 10.84 | 33.3 | 59.76 / 44.44 |
| Minimum warm | 16.7 / 16.9 / 16.9 | 3.8 / 6.3 / 11.9 | 5.12 / 6.25 / 7.95 | 17.0 | 60.02 / 59.06 |
| Standard fresh | 16.7 / 16.8 / 16.9 | 7.0 / 10.8 / 15.8 | 11.30 / 13.62 / 16.64 | 16.9 | 60.01 / 59.17 |
| Standard warm | 16.7 / 16.8 / 16.8 | 5.0 / 6.8 / 7.8 | 9.68 / 11.33 / 11.72 | 17.6 | 60.01 / 58.48 |

There are no >50 ms intervals in these four short windows. The Minimum fresh
33.3 ms interval and 44.44 derived 1% low must not be hidden by p99 or average FPS.
CPU render excludes fixed update; raw/summary evidence records that separately.
Valid GPU query counts are 240/240/241/240, with 1/0/2/1 pending respectively;
pending queries are not converted to zero. Background work overlaps these windows.
These single-pair samples neither resolve the earlier warm-tail limitations nor
establish sustained 60 FPS, thermal stability or worst-case gameplay performance.

Production archive: `artifacts/specimen-production-191-main213.zip`.
SHA-256: `3F84021362C04569A1477587BFC923909E3C0D8AF4006DD57134A73C1E747FF6`.
Its production source remains `e97045a`; later commits change tests, capture tools
and reports. A final fetch still finds main at `8f6722b`.

Reproduction runners/configurations, original failures, all final logs, raw
fresh/warm captures, screenshots, derived summaries, current tools and the branch
diff are packaged in `artifacts/191-main213-evidence.zip`. Its separate manifest
records the final branch SHA and every entry length/hash; the package is read
back to verify all entries. The production ZIP is delivered separately.

Independent source review found no verified blocker in the normal integrated
paths. A direct manual scene disposal while its cinematic compile remains pending
was not newly browser-tested; ordinary early Skip waits for preparation and was
exercised. Target hardware, a legal full playthrough, independent PR/visual review,
Standard loading and warm-tail qualification remain outstanding. This PR must
reference #191 without automatically closing it and must not be merged by this task.
