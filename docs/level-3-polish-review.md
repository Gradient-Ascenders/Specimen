# Level 3 improvements: final review

Branch: `codex/final-polish-batch-3`. Base reviewed:
`5d016507016cc0e9877e819b9a3d9d58e25ecbae` (`origin/main`, including PRs #233 and #234).
The original implementation commit `af8c412` is preserved; the final refinement
commit follows it without rewriting history.

## Scope

The original implementation replaced Room 2's shoot-support/drop-cover puzzle
with three acid-emerging weak sewer drones. This PR includes that accepted change
as well as the later visually approved drone and geometry refinements:

- Half-submerged passive shells, smooth proximity-triggered emergence, narrower
  flickering route-focused spotlights, and the third drone beside Volt's catwalk.
- Three separate Goop acid reactions per enemy, shared detection/projectile
  behavior, solid-cover blocking, and checkpoint pose restoration.
- Removal of three vertical light-bank hangers and the two requested east-wall
  horizontal conduits, including those conduits' obsolete colliders.
- One rendered catwalk top, an approach aligned with the extending bridge,
  flush tunnel ribs/wall joins, and the final closed lower wall corner.
- Flush Room 1 hazard markings and under-apron lips.

Preserved: authored routes and deck heights, Bob's hold-button/Volt's bridge-lock
cooperation, bridge timing, lift controls, lasers, checkpoints and room resets,
slime switching, existing fixed-step/render interpolation boundaries, and
existing static batching and bounded beam sampling. Local geometry changes to
the approach and tunnel are intentional; the final wall-gap correction retains
identical side-wall collision boxes.

Shared Level 2 changes extract its existing weak sewer-drone state/motion/burn
logic for reuse. Bob/Goop remain the default damage roster outside Level 3;
Level 3 explicitly opts Volt into health/projectile targeting. The reference
Level 2 encounter is covered by automated and production-browser tests.

## Implementation and performance

`EmergingSewerDrone` adapts the shared weak-drone behavior, existing rusted shell,
damage/dissolve effects, pooled projectiles and route-scanning AI. Its actual
gaze drives detection, light and visible beam. Snapshots retain the damped pose.
The obsolete cover system and its geometry are removed.

Room construction repairs duplicate opaque coverage before batching, preserves
metric UVs and authored box bounds, and releases replaced geometry. Rising wall
skins extend before clipping to vertical join planes, filling the lower corner
without new patch meshes or coplanar faces. The bridge uses the existing precise
movement-corner policy for its exact seam.

The three drone spotlights are non-shadowed, the projectile pool remains bounded
at 48 slots, and existing beam refresh limits remain intact. No new render
targets/textures or per-tick vector allocations are introduced by the refinement.
An earlier hanger-only browser diagnostic dropped geometry count from 550 to
547 while textures stayed at 51; that is a scoped resource observation, not an
FPS benchmark. Static surface cuts can add triangles. Hardware FPS on lab
machines has not been measured.

The final staged Level 3 post-combat browser snapshot reported 549 renderer
geometries, 51 textures and 154 calls. These whole-scene counts depend on camera,
game state and asset/detail preparation; they are not a controlled before/after
benchmark. The final check confirmed all three drone lights had no shadow map
and the projectile pool capacity stayed at 48.

## Final validation

- Full unit suite: **1,494 passed, 0 failed**.
- TypeScript type-check: passed.
- Production build: passed, with the existing large-chunk advisory.
- Production layout and HTML/CSS references: **77 files validated**.
- Production Chromium: **3 scenarios passed** (Level 2 reference, Level 3
  encounters, Level 3 tunnel/bridge geometry), with no console, asset-loading
  or WebGL errors. The final local logs are ignored under
  `test-results/batch-3-final-unit.log` and `test-results/batch-3-final-browser.log`.

Commands:

```text
npm test
npm run type-check
npm run build
npm run validate:production
npx playwright test tests/smoke/EmergingSewerDrones.spec.ts tests/smoke/BlackoutGeometryCleanup.spec.ts --config playwright.smoke.config.ts
```

The full suite includes focused drone activation, spotlight/detection alignment,
real acid/projectile interactions, collision, tunnel/bridge traversal, checkpoint
and reset behavior, shared Level 2 compatibility and disposal regressions. The
new wall coverage test fails against the prior triangular gap and passes after
the correction. Production browser tests run from `/group-folder/`.

Manual visual acceptance was supplied by the user. Browser checks are staged
integration journeys, not a complete uninterrupted playthrough. Boss/ending
content is outside this PR. Local Chromium checks do not substitute for GitHub
CI; pending/finished CI status is reported separately on the pull request.

## Evidence and supporting notes

- [Committed screenshots, including the wall-gap comparison](evidence/level-3-polish/README.md)
- [Shared emerging-drone design](emerging-sewer-drones.md)
- [Drone refinement details and historical validation](acid-drone-refinement.md)
- [Geometry causes, corrections and historical validation](blackout-geometry-cleanup.md)

## Changed files

The final manifest below is generated from the staged branch diff against the
reviewed `origin/main`; it includes the original implementation and refinements.

- `docs/acid-drone-refinement.md`
- `docs/blackout-geometry-cleanup.md`
- `docs/emerging-sewer-drones.md`
- `docs/evidence/level-3-polish/README.md`
- `docs/evidence/level-3-polish/bob-drone-1-dormant.png`
- `docs/evidence/level-3-polish/bob-drone-1-guarding-route.png`
- `docs/evidence/level-3-polish/bridge-join-looking-back.png`
- `docs/evidence/level-3-polish/catwalk-end-clean.png`
- `docs/evidence/level-3-polish/room-1-flush-floor-strip.png`
- `docs/evidence/level-3-polish/tunnel-corner.png`
- `docs/evidence/level-3-polish/tunnel-entrance.png`
- `docs/evidence/level-3-polish/tunnel-wall-after.png`
- `docs/evidence/level-3-polish/tunnel-wall-before.png`
- `docs/evidence/level-3-polish/volt-drone-dormant.png`
- `docs/evidence/level-3-polish/volt-drone-guarding-catwalk.png`
- `docs/level-3-polish-review.md`
- `docs/levels/blackout.md`
- `src/hazards/DroneProjectileSystem.ts`
- `src/hazards/ElevatorDroneEncounter.ts`
- `src/hazards/EmergingSewerDrone.ts`
- `src/hazards/RoomFiveDroneEncounter.ts`
- `src/hazards/RoomThreeDroneEncounter.ts`
- `src/hazards/SecurityDrone.ts`
- `src/hazards/WeakSewerDrone.ts`
- `src/levels/BlackoutLevelRuntime.ts`
- `src/levels/BlackoutMaintenanceBay.ts`
- `src/levels/BlackoutTransitController.ts`
- `src/levels/BlackoutTransitRoom.ts`
- `src/levels/CultivationRoomFiveController.ts`
- `src/levels/LevelTwoRoomFiveGreybox.ts`
- `src/render/geometry/CoplanarSurfaceGeometry.ts`
- `src/render/hazards/SewerDroneDamage.ts`
- `src/systems/SlimeDamageSystem.ts`
- `src/ui/SlimeDamageVignette.ts`
- `tests/BlackoutGeometryCleanup.test.ts`
- `tests/BlackoutMaintenanceMaterials.test.ts`
- `tests/BlackoutRoomOneRuntime.test.ts`
- `tests/BlackoutTransitController.test.ts`
- `tests/BlackoutTransitInteraction.test.ts`
- `tests/BlackoutTransitMaterials.test.ts`
- `tests/BlackoutTransitRoom.test.ts`
- `tests/EmergingSewerDrone.test.ts`
- `tests/GameplayAudio.test.ts`
- `tests/fixtures/blackout-maintenance-authored-surfaces.json`
- `tests/fixtures/blackout-transit-authored-surfaces.json`
- `tests/smoke/BlackoutGeometryCleanup.spec.ts`
- `tests/smoke/EmergingSewerDrones.spec.ts`
