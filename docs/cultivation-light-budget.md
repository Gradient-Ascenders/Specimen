# Cultivation render-scope light budget (#189)

Implementation baseline: `b00978e58eeea4f782c03c57d890ad02b5620b3a`.
Owner: Uzair; independent reviewer: Kevin. The issue stays open pending teammate
review, merge and assessment-hardware qualification under #198.

## Scope and policy

This change addresses the authored **Level 2** light arrays identified in #189.
It does not replace Level 1/3's rigs, change transmission/resolution, alter
colliders or change drone detection, shooting, damage, patrols or power logic.
In the original measured baseline the full authored path required production
`?debug=1`; the subsequent production parity fix enables it at the ordinary URL.
The `ProductionParity` smoke tests now check ordinary production content
separately. Removing authored content is not used as an optimization.

These are provisional engineering caps, not an agreed assessment-PC profile:

| Render layout | Point slots (including point shadows) | Point-shadow slots | Spot/shadow slots |
| --- | ---: | ---: | ---: |
| Isolated lift | 2 | 0 | 1 |
| Ordinary room / ordinary doorway overlap | 4 | 0 | 2 |
| Maintenance / lift-to-maintenance overlap | 4 | 1 | 3 |

Ambient/hemisphere and the existing directional foundation remain unchanged.
The maintenance maximum is four shadow sources: three spotlight maps and one
point-light cube map (six faces), **not four total shadow-render passes**.
Existing finite camera-shadow culling still applies. Shadow resolutions and
authored light colour, intensity, attenuation, transforms and ownership are kept.

`CultivationLightLayout` catalogs the authored lights once, not every scene mesh
each frame. Finite lights wholly outside the camera are omitted. Remaining
sources are ranked by their contribution near the controlled body and look-ahead
receivers, with a cone footprint and 25% selection hysteresis. Powered-down and
black sources cannot win selection. New source owners must explicitly refresh
the catalog; current encounters construct all their lights before preparation.

Selection temporarily excludes **light layer masks**, never emitter meshes or
their children. Masks are restored in `finally`, before asynchronous preparation
or the next simulation update. All nine guards, coloured volume meshes, eyes,
switch panels, engine meshes and existing emissive cues remain owned and updated
by their original systems. A newly reselected shadow source is invalidated before
use, preventing stale cached shadows after a handoff.

Unused slots have zero-radiance fillers. Shadow fillers have distant, empty
one-pixel maps initialized once, with recurring updates disabled. The three small
signatures avoid a new shader variant whenever a guard or power state changes;
they replace the previous large padding rather than removing signature stability.
The preparation queue uses the same budgets and clones the **authored** mask even
when a render selection is active. Only selected/filler preparation samplers get
temporary targets, which are disposed separately from live maps.

Resident maps are retained by their authored owners for reuse, so **resident map
count is not the same as the active shadow budget**. It is bounded by the static
source catalog plus four filler maps and is released on unload. Repeated toggles
must not create new lights, targets per toggle or shader signatures.

Static lightmaps were considered but are not introduced: moving coloured guards,
power changes, cover and dissolving geometry cannot share an unconditional baked
contribution. Existing emissive fixtures provide distant visual cues without
additional punctual-light slots. A future static bake needs authored assets and
power/occlusion ownership; it is not substituted for correct dynamic shadows here.

## Matched production evidence

Local device: AMD Radeon RX 6600, ANGLE D3D11, native Edge 155.0.4283.45 on Windows,
960×600 drawing buffer, DPR 1. This is **not** the assessment PC, whose only known
specification is a 12th-generation Intel i5. Exact assessment GPU, browser, power
state and numeric acceptance budgets remain outstanding.

The retained raw captures contain asset SHA-256 hashes, camera/actor transforms,
actual character identity, settled dark-room blend, light slots, power cycles,
raw timings and disposal results:

- [Baseline raw capture](evidence/189/baseline.json)
- [Candidate raw capture](evidence/189/candidate.json)

Each pose has 40 valid GPU queries for the full render and 40 for the same render
with shadow-map updates frozen, interleaved full/cached/cached/full. The complete
WebGL draw, including transmission, is inside the timer. Camera, actor, character,
lighting blend, viewport and resolution match. Compilation/warmup is recorded
separately and is not counted as steady GPU time. No disjoint/incomplete queries,
GL errors, console errors or failed requests occurred in these captures.
Timer scope can include CPU submission gaps inside the draw; it is not an
isolated shader or individual shadow-pass microbenchmark.

| Pose | Point/spot slots before → after | Full-render GPU p50 ms | Cached-shadow GPU p50 ms |
| --- | --- | ---: | ---: |
| Room 1 / Bob | 8/2 → 4/2 | 2.36 → 2.16 | 2.22 → 2.06 |
| Room 3 entry overlap / Bob | 17/4 → 4/2 | 8.96 → 7.05 | 5.88 → 3.67 |
| Lift boarding overlap / Bob | 8/3 → 4/2 | 8.15 → 4.23 | 4.64 → 3.98 |
| Sewer / Goop | 18/10 → 4/3 | 4.76 → 2.92 | 5.16 → 2.92 |
| Room 5 route / Bob | 18/10 → 4/3 | 7.46 → 2.18 | 4.25 → 2.15 |
| Room 5 route / Volt | 18/10 → 4/3 | 4.71 → 2.23 | 4.38 → 2.19 |

Slots include dormant fillers; they are actual forward-render array sizes, not
all authored light objects or a claim that each source contributes radiance.
Room 5 keeps one point-shadow slot while spot-shadow slots fall from ten to three.
Power-off/red/blue/green/reset captures retain the same bounded signatures.

Cached-shadow measurements separate receiver/scene shading from map updates; the
receiver improvement means this is not merely a shadow-resolution reduction.
Some short blocks have cached medians above updating medians (notably the sewer
baseline), so subtracting these timings is **not** a reliable isolated shadow-pass
GPU measurement. Raw block distributions are retained rather than hiding variance.

Observed Level 2 readiness was 27.41 s → 16.53 s; mandatory maintenance preparation
19.98 s → 8.88 s. These are single same-session, uncontrolled-driver-cache runs,
not a driver-cold startup distribution or an Intel loading guarantee. The sampled
route ended at 308 → 231 programs; three restarts stayed flat at those counts.
Live maps at unload were 17 → 12, each disposed exactly once. These counts are for
the captured route, not an exhaustive maximum-memory or all-room preload result.

Rendering is frozen and poses/power/Volt registration are staged through existing
runtime APIs. This is **not** sustained gameplay, frame pacing, puzzle completion,
native rescue traversal, or minimum-hardware qualification. The real assessment
capture and Kevin's independent visual/readability review remain required.

The matched visual probe retains all 21 flame instances and emitter geometry:
[before](evidence/189/route-before.png), [after](evidence/189/route-after.png).
Its separate [baseline](evidence/189/probe-before.json) and
[candidate](evidence/189/probe-after.json) logs retain the draw/instance diagnostics;
their short probe timings are not used for the performance table.
Frozen repeated draws can change booster appearance in **both** baseline and
candidate; the identical culling/reupload probe reproduces this on untouched main.
No booster shader/geometry is changed here. Normal-play visual review is still
needed, and pixel identity is not claimed for a light-selection quality trade-off.

Earlier local captures with an invalid zero encounter timestep, an unregistered
Volt silently falling back to Bob, or an unsettled bright Room 5 were excluded.
They are not used for the table or loading comparison above.

## Reproduce and verify

Build and serve baseline and candidate separately, with the same browser, GPU,
viewport and quality. Do not run competing tests/builds during timed captures.
The diagnostic script is not shipped in the game:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4185 --strictPort
node scripts/profile-cultivation-light-budget.mjs --url http://127.0.0.1:4185/ --cdp http://127.0.0.1:9349 --label candidate
```

`--cdp` refers to a separately owned, isolated native browser. Without it the
script launches installed Playwright Chromium; software-rendered results must be
labelled as correctness-only. Under WSL the existing Windows Node can drive native
Edge through its Windows localhost endpoint without firewall/port-proxy changes.
`--pose route-bob --probe --samples 8` reproduces the separate emitter diagnostic;
probe timings are not qualification data. Capture outputs go under ignored
`artifacts/light-budget/<label>/`; reviewed raw evidence above is retained in docs.

Checks cover fixed layouts, zero-radiance exclusion, camera rejection, hysteresis,
mask restoration on exceptions, explicit catalog refresh, filler-map ownership,
cloned preparation masks, valid comparison samplers, three characters, power
cycles, room handoffs, shader stability, restart and unload. The full unit suite,
type-check/build and production layout validation are required alongside the
Cultivation browser regressions. The browser manual fade probe explicitly enters
the same bounded scope as a real frame; drawing the unbudgeted authored graph is
not a valid production program-stability test.

Validation on this implementation:

- `npm run type-check`, `npm test` (138 test files), `npm run build`,
  `npm run validate:production` (83 files) and `git diff --check` passed.
- All six Cultivation browser regressions have passing results on native Edge.
  The original run passed five; the manual fade probe was updated to enter the
  production budget boundary and its rerun passed with zero new live programs.
  Background preparation interleaved 40 compiler batches and two primers with
  live draws: zero pixel difference, GL errors, light/map state changes or new
  live programs. The new bounds test exercises all rooms, all three characters,
  repeated power changes, restart, mask restoration and map disposal.
- Three production smoke tests passed beneath `/group-folder/`, including audio,
  plain-production boot/restart and authored Cultivation/Blackout transitions.
  These tests do not inject the diagnostic session exposure.
- All nine JavaScript asset hashes recorded by the candidate capture match the
  final production build. No dependencies or authored assets were changed.
