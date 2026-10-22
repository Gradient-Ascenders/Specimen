# Level 3 Room 2 — acid drone refinement

This pass continues on `codex/final-polish-batch-3`, preserving `af8c412`.

The later [mandatory encounter follow-up](mandatory-drone-encounter.md) adds
destruction-based route interlocks, Goop retaliation and a 0.275-radian cone.
The refinement measurements below describe the preceding review pass.

## Positions and dormancy

| Drone | Dormant body centre (metres) | Guarded route point (metres) |
| --- | --- | --- |
| 1 | `(18, -0.98, 100)` | `(10.5, 1.65, 102)` |
| 2 | `(18, -0.98, 124)` | `(11.5, 4.85, 126)` |
| 3 | `(-11.5, -0.98, 132)` | `(-16, 2.95, 132)` |

The acid crosses each level shell through its body centre. The skids and lower
half stay submerged while the rusted upper body and broken rotor assemblies
remain visible. Visibility does not enable weapons or searchlights. All three
retain the 16 m proximity trigger and 1.5-second emergence state. The first two
hover at 3.32 m; the Volt-side guard hovers at 4.72 m after the PR #236 rail-clearance
correction, with the existing small bob. The shared motion accepts an optional
starting height; Level 2 retains its existing starting height and behaviour.

Drone 3 is in the acid on the inner side of Volt's catwalk, whose centre is
`x=-16`. Its shell stays clear of the actual walking surface and rails. Volt
can activate it near `z=117.5` without entering attack range. The tested Bob and
Goop approaches, including the later checkpoint positions, leave it dormant.
The existing any-persistent-slime proximity rule remains: deliberately exploring
the same area with another slime can still activate it.

Checkpoint snapshots retain actual shell position, rotation and scan time, so
restoring during emergence resumes from the saved damped pose. Snapshots without
these optional presentation values still accept the original state fields.

## Spotlight and combat

The old 0.4-radian outer half-angle is now 0.22 radians: roughly 46 degrees
across the original cone versus 25 degrees now. At 10 m, its full width falls
from about 8.5 m to 4.5 m. Intensity, warm colour, damaged-eye flicker, health,
warning, firing cadence, projectile speed and damage remain unchanged.

Each drone's aim now sweeps slowly around its authored route point, by 1 m along
the Bob-side landings and 2 m along Volt's catwalk. Drone 2 guards the exposed
near edge because its original hover height is below the upper deck; aiming at
the deck centre would put the deck itself between the drone and Bob.

The actual shell gaze drives the light, visible cone and AI, with a common
origin 1.3 m ahead of the shell. The weapon's independent target tracking remains
disabled. After normal acquisition, the Volt-side adapter follows that target
with the actual shell gaze until LOS/range is lost, then resumes its route scan;
the Bob-side guards continue their authored scans. Nearby slimes outside the
visible cone are not acquired. Existing
LOS and projectile collisions still block combat behind solid cover. Beam
occlusion retains the existing bounded presentation sampler.

The implemented game has Goop's acid/dissolve interaction, not a cover-creation
ability. The former shoot-support/drop-barrier puzzle was removed in `af8c412`.
This pass preserves drone dissolution and solid-cover blocking; it does not
reintroduce that removed puzzle.

## Visual cleanup and performance

Removed `transit-light-bank-hanger-0`, `-1` and `-2`: the three thin
non-colliding rods between the overhead electrical light banks and the ceiling.
The user's subsequent crop clarified that the two horizontal rods also need
removal. `transit-east-service-conduit-96` and `transit-east-service-conduit-116`
are now omitted entirely, including their registered box colliders. These are
the rods in front of the first two observation panels. The panels themselves,
lights, contacts, platforms and structural catwalk supports remain intact.
The later east conduit at `z=136` and the west-wall conduits remain unchanged.
The other supplied views (`194415` and `194752`) show the earlier drone
placement; updated evidence below shows the refined dormant poses,
route-focused beams and Volt-side relocation.

The same three non-shadowed spotlight slots and 48-shot pool remain. There are
no added shadow maps, render targets, textures or per-tick vector allocations.
Removing the rods eliminates three owned geometries; the production-browser
diagnostic reports 547 geometries and 51 textures versus the earlier inspected
550 and 51. Draw counts depend on the survey camera and are not treated as a
before/after benchmark. The two horizontal conduits were subsequently removed
as well; the figures above describe the earlier hanger-only cleanup.
Hardware FPS qualification has not been performed.

## Verification and screenshots

Node regressions cover half-submerged bounds, dormant inactivity, continuous
emergence, independent activation, Volt-side clearance, focused detection,
unchanged weak-drone cadence/damage, solid-cover blocking and exact checkpoint
pose restoration. Existing room geometry, traversal, lifts, bridge and Level 2
reference-drone tests remain in the verification set.

Production Chromium exercises both the Level 2 reference and the refined Level
3 encounter. It checks all three dormant states and smooth emergence, sequential
Bob-side activation, Volt's independent approach, real camera-ray highlighting,
three real acid reactions per enemy, and Bob/Volt bridge cooperation. These
are staged integration checks rather than a complete uninterrupted playthrough.
No console, asset-loading or WebGL errors were observed in the completed runs.

Completed checks for this refinement:

- `npm test`: **1,490 passed**, zero failures.
- Focused room/drone/reference tests: **107 passed**.
- `npm run type-check`: passed.
- `npm run build`: passed, with the existing large-chunk advisory.
- `npm run validate:production`: passed; 77 production files validated.
- Production Chromium: **2 scenarios passed** (Level 2 and Level 3).

The horizontal-rod follow-up passed 10 relevant room/material/interaction tests,
type-check, production build and production-layout validation. The Level 3
browser scenario also verifies that only the later east-wall conduit remains.

The ignored `artifacts/evidence/batch-3-drone-refinement/` directory contains:

- `bob-drone-1-dormant.png` and `bob-drone-2-dormant.png`.
- `bob-drone-1-guarding-route.png` and `bob-drone-2-guarding-route.png`.
- `overhead-lights-cleaned.png`.
- `volt-drone-dormant.png` and `volt-drone-guarding-catwalk.png`.
- `level-2-room-5-reference.png` and machine-readable result JSON.

Screenshots use reproducible survey cameras and the room's powered light banks,
with the normal exposure and rendering configuration.

Run `npm run dev`, select Level 3 Blackout and press **2** for the development
Room 2 shortcut. Inspect the dormant bodies, power the light banks, approach
the two Bob-side areas, then advance Volt along the catwalk. Observe the scan
without entering it; step into its coverage and check that solid geometry still
blocks attacks. Use Goop's three acid shots, then test Bob's traversal, Volt's
lift power, the final bridge lock and Retry. Level 2's **5** shortcut provides
the unchanged reference encounter.

## Modified files

- `src/hazards/EmergingSewerDrone.ts`
- `src/hazards/WeakSewerDrone.ts`
- `src/levels/BlackoutTransitController.ts`
- `src/levels/BlackoutTransitRoom.ts`
- `tests/EmergingSewerDrone.test.ts`
- `tests/BlackoutTransitController.test.ts`
- `tests/BlackoutTransitMaterials.test.ts`
- `tests/smoke/EmergingSewerDrones.spec.ts`
- `docs/emerging-sewer-drones.md`
- `docs/levels/blackout.md`
- `docs/acid-drone-refinement.md`

## PR #236 review correction: Volt-side guard

The review's authored-room reproduction was valid. At grounded catwalk positions
`(-16, 2.96001, 130/132/134)` and near the inner edge, the original guard acquired
Volt but its live projectiles hit `volt-catwalk-rail--14.75`. Its 1 mm LOS sweep
could pass where a projectile with 16 cm radius could not. A 0.8 m control rise
fixed standing shots but still caught the rail in a moving edge case during the
hover bob. Raise only the third guard's hover reference by 1.4 m (nominal centre
4.72 m), leaving its half-submerged dormant centre and X/Z position unchanged.

Continuous runs exposed a separate issue: Volt was briefly acquired, but left
the narrow patrol cone before the unchanged 0.4-second warning completed. The
Volt-side adapter now follows an already acquired target with the same damped
shell aim. Light, beam and detection still use that actual gaze. No off-cone
acquisition, independent invisible tracking, warning reduction or LOS bypass is
introduced. Losing LOS/range releases the target and resumes the authored scan.
Bob-side guards and the shared Level 2 motion implementation are unchanged.

`tests/BlackoutVoltGuard.test.ts` registers the actual Room 2 colliders and uses
real grounded KinematicBody movement and pooled projectiles. Its 23 cases cover
the reviewed stationary positions, the nearest legal inner walking edge,
continuous 5.5 m/s runs across seven emergence/scan phases, uninterrupted runs
from the catwalk entry, damage, matched light/AI gaze, solid-cover blocking and
target loss/reacquisition. Before the correction, standing cases had zero hits
and running cases acquired briefly but fired no shots. The focused cases now pass.

The full suite passed 1,540 tests before the last two cold-entry cases were added;
the final focused run passed all 23, including those two additional cases.
Type-check, build and 120-file production-layout validation passed. Browser
coverage additionally uses actual runtime bodies at stationary positions and on
continuous centre/inner-edge runs, and checks Goop's real acid shots from the
acid-floor route against the raised drone.
Both Level 2/Level 3 browser scenarios passed, followed by a successful final
Level 3 rerun with all eight combat cases, including uninterrupted entry runs.
Every combat case acquired Volt and landed a real 30-damage projectile hit;
the moving cases remained grounded at 5.5 m/s. No console, asset-loading or
WebGL errors were observed. Logs and live-combat JSON remain ignored under
`test-results/pr-236-review-*.log` and
`artifacts/evidence/batch-3-drone-refinement/volt-guard-live-combat.json`.

This change adds no light, shadow map, geometry, material or pool allocation.
The extra bounded target lookup reuses the existing scan vector. To test locally,
enter Level 3 Room 2 and run Volt along the catwalk without stopping. Repeat near
the inner rail, stand around z=130/132/134, then use Goop's three acid reactions.
The rail must remain solid and other opaque cover must still block the guard.
