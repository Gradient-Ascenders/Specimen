# Emerging sewer drones — Polish Batch 3, Fix 1

## Implementation

Level 3 Room 2 now has three damaged sewer drones at `(18, -0.68, 100)`,
`(18, -0.68, 124)` and `(18, -0.68, 146)`. These are acid emergence anchors;
the hidden shells begin 3 m below them and rise to hover approximately 4 m above
them. The third anchor occupies the far-right acid area.

`WeakSewerDrone` extracts the existing Level 2 Room 5 state machine, damped
rise/hover/aim motion, damaged-eye pulse and three-reaction acid coordinator.
Level 2 now calls those shared functions and retains its original behaviour.
`EmergingSewerDrone` adapts the same rusted asset, damage VFX and SecurityDrone
AI for the transit room. Health remains three acid hits; warning is 0.4 seconds,
fire interval 0.65 seconds, projectile speed 120 m/s and damage 30.

Transit deliberately uses different range tuning: any persistent Bob, Goop or
Volt body within 16 m activates that area's drone; attack range is 10 m. Level
2 keeps its original Goop-only proximity trigger and 40 m weapon range. The
original Level 2 warm point lamp remains unchanged. Transit's damaged spotlight
uses the shared eye pulse continuously after emergence, with a matching cone.

The old three cover panels, soluble supports, guide rails, cradles, release link,
armoured drones and their collider registrations are removed. Checkpoint
milestones now follow drone clears and the original Bob landing pads. Bridge,
lifts, lasers and traversal surfaces remain unchanged. The retained-surface
regression still compares every unaffected surface to the reviewed baseline.

Shared damage/projectile contracts now support an explicitly requested Volt
health slot; other encounters retain their original Bob/Goop defaults. The new
drone's authored shell is excluded from its own LOS and projectile collision
queries, while remaining an actual soluble target for Goop.

## Performance

The room still owns three drone light slots. Three non-shadowed spotlights
replace three shadow-casting spotlights; no new shadow maps or render targets
are introduced. Browser inspection confirmed all three new shadow maps remain
unallocated. Machinery is merged by material and damage stage, preserving
progressive damage without dozens of small draws per shell. The existing
bounded scanner-beam sampler and 48-slot projectile pool remain in use. Motion,
target vectors and damage particles are reused rather than allocated per tick.

The software Chromium inspection measured 550 renderer geometries and 51
textures in the inspected Level 3 state. These are whole-scene diagnostics,
not a before/after FPS benchmark. Hardware performance qualification remains a
manual check.

## Validation and evidence

Node coverage exercises all three slime triggers, safe activation distance,
completed emergence, active spotlight flicker, warning/cadence, independent
health, self-collider exclusion, three real acid reactions per enemy, obsolete
collider sweeps, checkpoints, disposal and the preserved traversal/bridge tests.

The production-browser regression is
`tests/smoke/EmergingSewerDrones.spec.ts`. It stages reproducible authored room
states using the shipped controllers and camera, not production debug globals.
It verifies Level 2 Room 5's reference enemy and all three new enemies, soluble
highlighting, real acid projectile impacts, sequential emergence, the safe
activation annulus and preserved Bob/Volt bridge cooperation. This is staged
integration coverage, not an uninterrupted start-to-finish playthrough.

Generated screenshots and diagnostic JSON are ignored under
`artifacts/evidence/batch-3-sewer-drones/`. They include the Level 2 reference,
the powered Level 3 room survey and individual drone views. The survey camera
is deliberately reproducible rather than presented as a normal player camera.

## Local testing

1. Run `npm run dev`, select **Level 3 Blackout**, and enter the level. In the
   development build press **2** to use the existing Room 2 shortcut.
2. Keep the other bodies at the entry. Approach along Bob's route or Goop's
   acid route. Observe each area activate independently before shooting range.
3. Check the far-right acid area for the third drone. Restore the room light
   banks with Volt to inspect the rusted shells in the dark facility.
4. Switch to Goop, hold right mouse to aim, and fire three separate left-click
   acid shots at each drone. Confirm highlighting, progressive missing parts,
   sparks and destruction. No support latches or falling cover panels remain.
5. Ride both powered lifts, cross the lasers, hold Bob's bridge switch, and
   have Volt power the existing far-side door contact. Regroup at the exit.
   Check Retry/restart resets the drones and progression appropriately.
6. Select **Level 2 Cultivation** and use its existing **5** development room
   shortcut. Compare the original sewer enemy's emergence and three-hit fight.

Repeat automated validation with `npm test`, `npm run type-check`,
`npm run build`, `npm run validate:production`, and
`npx playwright test tests/smoke/EmergingSewerDrones.spec.ts --config playwright.smoke.config.ts`.

## Completed checks

- `npm test`: 1,487 passed, zero failures.
- `npm run type-check`: passed.
- `npm run build`: passed; existing large-chunk advisory remains.
- `npm run validate:production`: 77 production files validated.
- Production Chromium: both Level 2/Level 3 scenarios passed; extended Level 3 bridge and non-shadowed-light inspection also passed.
- Browser console, asset requests and WebGL error checks: no errors observed.

## Files changed

- `docs/emerging-sewer-drones.md`
- `docs/levels/blackout.md`
- `src/hazards/DroneProjectileSystem.ts`
- `src/hazards/ElevatorDroneEncounter.ts`
- `src/hazards/EmergingSewerDrone.ts`
- `src/hazards/RoomFiveDroneEncounter.ts`
- `src/hazards/RoomThreeDroneEncounter.ts`
- `src/hazards/SecurityDrone.ts`
- `src/hazards/WeakSewerDrone.ts`
- `src/levels/BlackoutLevelRuntime.ts`
- `src/levels/BlackoutTransitController.ts`
- `src/levels/CultivationRoomFiveController.ts`
- `src/levels/LevelTwoRoomFiveGreybox.ts`
- `src/render/hazards/SewerDroneDamage.ts`
- `src/systems/SlimeDamageSystem.ts`
- `src/ui/SlimeDamageVignette.ts`
- `tests/BlackoutRoomOneRuntime.test.ts`
- `tests/BlackoutTransitController.test.ts`
- `tests/BlackoutTransitInteraction.test.ts`
- `tests/BlackoutTransitMaterials.test.ts`
- `tests/EmergingSewerDrone.test.ts`
- `tests/GameplayAudio.test.ts`
- `tests/smoke/EmergingSewerDrones.spec.ts`
