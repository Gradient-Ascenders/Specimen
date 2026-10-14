# Issue #163 — Room 2 transit materials

Baseline: main `97e5dc0` (merged PR #179). Issue #165 is closed. This change
implements texture/material integration only; Room 3 and issue #132 lighting
remain outside this change.

## Surface treatment and ownership

| Authored surfaces | Existing finish |
| --- | --- |
| Chamber/corridor walls; sticky climbs | wallPanel (sticky retains green tint and authored emission) |
| Chamber/corridor ceilings | ceilingPanel |
| Bob platforms, Volt catwalk, entry/exit decks, moving lifts and bridge | floorDeck |
| Acid basin structure | basinMetal |
| Lift shafts, ramp, shutter hardware and retained cover panels | ductSteel / machineryMetal |
| Warning edges, bezels, caution strips and shipping label | warningPaint |
| Soluble support latches and crate | acidPlatform with distinct brown tint |
| Rails, conduits, beams, housings and electrical contacts | machineryMetal; steel / copper detail finishes |

Acid, bulbs and existing passage accent strips retain their authored appearance.
The crate remains brown. Cover panels use worn metal; their soluble latches use
a distinct brown finish. Authored surface/soluble metadata supplies all gameplay
meaning. Static UVs are authored in metres before batching. Scaled fittings own
small UV-chart geometry copies; collider meshes retain their identities.

Room 1's maintenance bay remains the sole GPU-kit owner. The live scene passes
its kit to Room 2. Static Room 2 meshes borrow cached materials. Moving decks,
contacts, cover/support bases and dissolve shaders retain owned materials that
borrow the kit's maps. Borrowers dispose before the bay, including static batch
copies. Controller-owned lift fittings detach before MovingPlatform teardown,
so their material/geometry disposal happens once. The owner disposes each map
once. There is no new generator, bundle, dependency or global GPU cache.

Receivers, lift contacts, switch and lock contact keep independent material
instances and the existing controller emissive/colour hooks. Unpowered lamps
and lifts stay dark; latched lamps and lock, switch feedback and powered exhaust
remain controller-driven. Existing lights, lasers and searchlights are unchanged.
The bridge reuses its UV buffer: length tracks deployment, with texture phase
anchored to the fixed end. End-cap UVs and translating lift/cover charts stay fixed.

## Geometry and gameplay evidence

`tests/fixtures/blackout-transit-authored-surfaces.json` captures 243 source meshes
from unchanged main, including machinery/hazard primitives. The regression
checks position/normal/index hashes, transforms, collider membership, metadata
and shadow roles. It excludes batch proxies; only presentation UVs/materials
change. The existing Room 1 63-mesh/55-collider audit also passes.

The textured traversal fixture passes Bob's entire route with both lifts, Goop's
basin/ramp exit and Volt's approach/crossing. Controller regressions cover light
latching, contact isolation, supports/retained-cover LOS, switch/bridge locking,
checkpoint capture/restore, reset and collider teardown. New checks cover lift
UV stability, bridge deployment/retraction phases 0/0.15/0.3/0.5/0.75/1, constant
texel density, fixed-end phase, borrowed-map survival and exact-once disposal.

## Performance

Matched production snapshots on Chrome 155 / ANGLE D3D11 / Intel UHD 620,
1280×800, DPR 1. GPU values are median / p95 milliseconds from 20 completed
non-disjoint timer queries per view; CPU submission plus GPU finish uses 40
samples. These are local measurements, not a hardware-independent performance
claim. Raw metrics, scripts, before/after captures and partial bridge views live
in ignored `artifacts/issue-163/`.

| Matched staged view | Draw calls before → after | GPU median/p95 before → after (ms) | Submission/finish median before → after (ms) |
| --- | ---: | ---: | ---: |
| Dark entry | 445 → 455 | 64.3/68.0 → 67.7/74.3 | 11.3 → 11.4 |
| First powered platform | 401 → 411 | 67.4/70.5 → 71.1/81.6 | 10.6 → 10.8 |
| Lift shaft | 393 → 403 | 59.7/63.4 → 64.1/67.4 | 10.6 → 10.1 |
| Locked bridge crossing | 220 → 227 | 35.9/37.7 → 38.6/42.5 | 3.5 → 4.3 |
| Solved exit | 252 → 260 | 62.1/65.1 → 58.9/60.5 | 6.1 → 6.9 |

Renderer textures remain 56, programs remain 65; kit materials/maps remain 14/27
and estimated complete RGBA8 mip storage remains 7,864,284 bytes. Renderer
geometries in the matched pass rise 417 → 432 because differently scaled fittings
need distinct metre-scale charts. Static batching changes submission/culling
partitions; visible-pass triangle counts are not an authored geometry audit.

Three prepared reload cycles each return to 1 geometry / 4 textures unloaded,
and 400 geometries / 56 textures / 65 programs after reload and Room 2 entry.
This proves stable repeated allocation on the sampled path, not zero driver memory.
Warm complete Level 3 scene construction (5 warmups + 30 samples, CPU maps already
prepared) measures 9.83/12.41 → 10.08/14.28 ms median/p95. A contended earlier run
was discarded. The bundle remains 1,181,449 bytes. Cold network/loading and shader
preparation were not separately benchmarked; raw gate-to-running timestamps
exclude preload and must not be treated as full Level 3 loading times.

## Verification and limitations

- Full Node suite before the final bridge UV phase refinement: 774 tests, 771 pass, 3 fail. All failures reproduce on unchanged
  main: BobGateOneAsset and BobMorphAsset generator-hash assertions, and
  ProductionBuild's Windows symlink creation (`EPERM`). No checks were weakened.
- Final affected motion/material/traversal run: 24/24 pass after bridge phase
  anchoring. Earlier Room 1/Room 2 focused regressions: 40/40 pass.
- Type-check, final build, production layout validation (27 files), and exact
  cross-platform prebaked bundle regeneration check pass. CI generator check is
  unchanged. Vite retains the existing large-chunk warning.
- Unmodified Blackout browser regression: pass. Both unmodified nested-path
  smoke journeys: pass, including production transitions/restarts and console,
  request and deployment-directory assertions. Local ignored configurations
  select installed hardware Chrome instead of the unavailable pinned Playwright
  executable. No shipping browser code was changed for these tests.
- Matched capture and three reload cycles report no console/page errors or HTTP
  failures. Final representative captures also check partial bridge poses.
- The normal archive script cannot run completely here because `unzip` is absent.
  A native Windows ZIP fallback contains all 27 files, root index.html, exact
  filename casing and byte-for-byte validated contents. This fallback does not
  claim the script's reproducible ZIP metadata. Archive is ignored at
  `artifacts/specimen-production.zip`.
- Browser journeys and physical route tests validate the affected behaviour;
  there was no complete manual solve of the whole cooperation/softlock matrix.
  The existing very dark unpowered lighting remains a presentation limitation
  for issue #132; this task adds no lights or exposure changes.

## Representative views

These use the shipping follow camera at achievable route positions, staged with
checkpoint/body and controller snapshot APIs. They are visual evidence, not proof
of an uninterrupted manual solve. Light banks/covers and bridge lock are staged;
Bob's lift pose is staged at its raised end, and the solved view stages all three
bodies at the shared exit. Raw matched performance captures use their own fixed
viewpoints; these final review views improve framing and HUD reconciliation.

1. [Initial dark/unpowered entry](01-dark.png)
2. [First powered light and released cover](02-powered-cover.png)
3. [Bob on the raised first lift](03-bob-lift.png)
4. [Volt on the locked bridge](04-bridge-lock.png)
5. [Solved room, shutter and corridor toward Room 3](05-solved-exit.png)
