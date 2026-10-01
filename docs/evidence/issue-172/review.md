# Cultivation and Blackout shadow evidence (#172)

Implementation and focused verification pass locally. Hardware captures cover
ordinary Cultivation rooms, Room 5 searchlights, rescue/network states, lift
coexistence, and powered/unpowered Blackout views. **Human visual approval and
full native traversal/performance acceptance remain pending.** No issue closure
or merge approval is implied by these staged captures.

Open [the interactive comparison](compare.html) to move a divider across each
matched shadow-off/on pair. It also includes the original Room 5 baseline and
an original/implementation comparison with shadows enabled.

## Method and provenance

Captured on 2026-10-02 local time in isolated native Windows headless Chrome
154, using ANGLE **Intel Iris Xe (0x46A6), Direct3D11**. Canvas and drawing buffer
are 960 × 600, DPR 1, exposure 1. WebGL GPU timer queries were available and all
recorded timing blocks were non-disjoint. This is hardware evidence, distinct
from the automated Node tests.

The original baseline is a clean archive/build of commit
`70d3a0e8dc0ca6149290b140f335185206cb8bca`. Both builds use the same installed
package versions, frozen Room 5 camera/pose, character reflection settings,
source transforms and power state. The recorded camera, source configurations
and prepared Bob diagnostics compare exactly across these two captures. The baseline retains the nine 512² spots and
512²-per-face Volt point source; the implementation adds no source or resolution
in Room 5. Existing dark ambient/directional settings are retained.

The production harness intercepts built JavaScript only to expose runtime
instances to Playwright. It uses existing presentation/staging APIs and freezes
simulation/render callbacks for comparison. It does not add application debug
exports. Each pair asserts identical camera and body morph values. Bob's actual
prepared asset has 3,264 body triangles, 504 eye triangles, and 7/11 morph targets.
Raw records include sources, bias/range/near planes, camera, reflection state,
shadow draw counters, renderer counters, timings and lifecycle assertions:

- [Original Room 5](baseline/measurements.json)
- [Implementation: twelve view pairs and lifecycle checks](iris-xe/measurements.json)
- [Injected asynchronous preparation failure](failure-check/measurements.json)

Rooms 1 and 2 were recaptured with the camera inside their front wall, retaining
all other presentation settings. Their replacement records and the additional
capture timestamp are identified in `recapturedViews`.

All capture runs report zero console/page errors and zero non-aborted failed
requests. The listed `net::ERR_ABORTED` Bob GLB requests occurred during runtime
teardown; the captured characters had completed asset preparation.

## Retained Room 5 cost

All ten original sources remain registered: nine spot depth passes plus six
point cube faces, fifteen configured passes and 3,932,160 depth texels. Shadow
geometry counters include point-face submissions and instanced triangle counts.
They measure submitted work rather than unique scene geometry.

| Frozen searchlight view | Original | Implementation |
| --- | ---: | ---: |
| Configured sources / depth passes | 10 / 15 | 10 / 15 |
| Shadow draw submissions | 509 | 454 |
| Shadow triangles submitted | 113,220 | 109,952 |
| Total draw submissions, shadows on | 595 | 540 |
| Total triangles, shadows on | 168,876 | 165,608 |

The 55 fewer shadow submissions follow the opaque-lit role filter: beam/effect
Basic materials, acid, hidden geometry and transparent/captive exclusions no
longer submit unintended blockers. Platform hulls, batching membership and
finite-light shader hooks remain unchanged. The renderer still reports 21
instanced meshes and 388 unique scene materials in this view.

Timing uses five warm-up frames and twenty samples per block in off/on/on/off
order. CPU numbers time render submission; GPU numbers time the complete render
with `EXT_disjoint_timer_query_webgl2`. Neither includes fixed-step simulation,
and CPU and GPU timings must not be added as a full-frame estimate.

| Build / view | Block | Shadows | GPU p50 / p95 (ms) | Submission p50 / p95 (ms) |
| --- | ---: | --- | ---: | ---: |
| Original Room 5 | 1 | off | 7.21 / 8.50 | 6.30 / 8.90 |
| Original Room 5 | 2 | on | 9.02 / 9.65 | 19.10 / 21.80 |
| Original Room 5 | 3 | on | 8.84 / 9.41 | 20.30 / 21.50 |
| Original Room 5 | 4 | off | 6.74 / 7.37 | 6.30 / 7.90 |
| Room 5 | 1 | off | 6.35 / 7.00 | 7.30 / 8.70 |
| Room 5 | 2 | on | 8.42 / 9.29 | 18.90 / 20.90 |
| Room 5 | 3 | on | 9.23 / 9.88 | 19.40 / 21.50 |
| Room 5 | 4 | off | 6.40 / 7.40 | 7.10 / 8.30 |
| Blackout hallway | 1 | off | 4.17 / 4.34 | 2.20 / 3.10 |
| Blackout hallway | 2 | on | 4.97 / 5.18 | 3.50 / 5.20 |
| Blackout hallway | 3 | on | 4.67 / 8.80 | 3.10 / 5.60 |
| Blackout hallway | 4 | off | 2.64 / 2.86 | 1.70 / 3.80 |

The initial #169 single-source proof used GPU p95 ≤10 ms and submission p95
≤14 ms as provisional review limits, plus the full gameplay target of 16.7 ms.
Room 5's implementation submission p95 is 20.90–21.50 ms and the staged
lift/rescued-point coexistence view reaches 27.30 ms. **CPU submission does not
meet those initial proof limits.** The noisy Blackout GPU blocks also preclude
an exact per-source cost claim. Keep this measured baseline and source inventory
for #173; no performance acceptance or multiplied per-source allowance is assumed.

## Coverage review

Ordinary Cultivation retains the original low point fills and adds two fixed
512² overhead fixture keys per room. Lower point pools could not illuminate the
upper Room 3 route from above, which justified separate fixture keys rather than
raising existing fills or attaching a light to the character. The lift retains
one broad pool converted to a 512² spot. Seven ordinary maps add 1,835,008 depth
texels; all seventeen Cultivation maps total 5,767,168. Full source coordinates,
angles, ranges and overlap budgets are in the
[coverage inventory](../../cultivation-blackout-shadows.md).

| View reviewed | Recorded observation / limit |
| --- | --- |
| Room 1 / Room 2 | Bob and relevant floor/platform receivers are visible; contact shadow contrast is subtle under the retained neutral point fills. Room 1 also shows existing Goop presentation. |
| Room 3 upper route | Bob is on a high deck with platform/structure coverage. Automated cone/range checks sample every authored Bob route-beat platform. Coarse 512² maps across this wide room limit contact detail. |
| Lift | Existing colour/range/intensity retained with bounded downward coverage. |
| Room 5 searchlights | Existing coloured search cones and occlusion remain; the fixed crossing view includes cover hardware partly obscuring Bob. It does not validate all live scans or camera positions. |
| Red network disabled | Inactive searchlights keep their slots and skip depth updates. Six sources submit shadow geometry in this staged state. |
| Rescue / release | Existing point glow follows the pod; captive Volt and glass remain excluded. The release checkpoint is invoked through its existing API, rather than replaying the full rescue cutscene. |
| Lift / dark coexistence | Both rigs retain maps and ownership. This view follows the staged rescued checkpoint, so it proves point/lift coexistence rather than all nine active patrols at the lift boundary. |
| Blackout drone off / on | Unpowered drone submits no depth pass; powered downward source illuminates Bob and produces ground occlusion. The four hallway sources retain flicker behaviour in both states. |
| Blackout hallway off / on | Four 256² downward fixture maps cover the corridor; powered drone adds its existing 512² map. Conversion from point spill to spots changes ceiling/wall illumination and needs human palette/readability approval. |

The Blackout presentation is staged with Bob while the actual controller/HUD
remains on Volt. Its powered door is advanced through the native controller
update, but the drone pose/read model is staged for matching screenshots.
Detection, collision, damage, puzzle authority and native gameplay timing were
not changed by the implementation or claimed validated by these image pairs.

## Lifecycle and automated checks

Production assertions verify:

- Three Cultivation restarts retain map identity and stable resource counts:
  498 programs, 849 geometries, 93 textures before and after.
- Cultivation handoff frees all 17 allocated maps exactly once, clears their
  references, and leaves the newer Blackout request active.
- Blackout checkpoint recovery/restart retains maps and immediately restores the
  unpowered spotlight intensity/update flags. Repeated unload frees all five
  maps once, clears references and restores the disabled default policy.
- Injected rejected Blackout character preparation unloads resources and restores
  the surviving disabled `failed-preparation-prior` owner.

Local verification completed: `npm test` (all 109 test files pass),
`npm run type-check`, `npm run build`, `npm run validate:production` (27 asset
references), and `git diff --check`. Focused tests cover bounded ordinary/lift
source counts, Room 3 route cones, hallway coverage, map disposal, searchlight
source/gaze/power preservation, receiver/exclusion roles, custom dissolve
material preservation, and ordinary/dark preparation variants. Existing tests
cover movement, hazards, detection, rescue, power, recovery and runtime lifecycle.
The production build retains its existing large-chunk warning.

Remaining manual gates: native lift/rescue/drone sequences, full traversal with
normal input, character secondary/deformation/fade cases at worst-case light
poses, higher DPR/resolutions, and teammate visual approval. The exhaustive
browser suite was not run; these bounded hardware captures are separate evidence.

## Reproduction

After `npm run build`, run
`node scripts/capture-cultivation-blackout-shadows.mjs`. The default harness
starts a localhost Vite preview and writes `docs/evidence/issue-172/local`.
That default may use software WebGL; inspect `environment.gpu` before making
hardware claims.

Set `LEVEL_SHADOW_URL` for a pre-existing server, `LEVEL_SHADOW_CDP_URL` for an
isolated Chromium debug endpoint on localhost, and `LEVEL_SHADOW_OUTPUT` for the
evidence destination. `LEVEL_SHADOW_BASELINE=1` records only the original Room 5
pair/timing blocks against a clean original build. `LEVEL_SHADOW_ROOMS=1,2`
recaptures selected ordinary rooms; `LEVEL_SHADOW_FAILURE_ONLY=1` runs the
asynchronous failure audit without image capture. This run used native Windows
Node serving the production build and native Chrome, both on localhost.
