# Mandatory Room 2 drone encounter

This follow-up to PR #236 makes Goop's three accepted acid reactions per drone
an authoritative progression requirement. It preserves the approved drone
positions, dormant acid poses, emergence, tunnel, catwalk, bridge alignment and
existing solid cover. The user confirmed that the removed overhead drop-cover
puzzle should not be restored.

## Progression interlocks

`BlackoutTransitController` derives all locks from `WeakSewerDroneState`'s
`destroyed` phase, rather than spotlight visibility, target acquisition, damage
to a slime, selected character, or emergence timing:

| Requirement | Unlocks |
| --- | --- |
| East guard 1 destroyed | Volt can power Bob's first lift |
| East guard 2 destroyed | Volt can power Bob's second lift |
| Both east guards destroyed | Bob's wall switch can be held; second checkpoint is eligible |
| West guard destroyed, plus both east guards | Bridge may extend and Volt may latch it |
| All three destroyed | Exit security shutter opens; room completion is permitted |

Lifts remain at their original unpowered positions while locked. Their existing
contacts glow red to explain the lock; the objective text names the guards Goop
must eliminate. Normal electrical operation, carrying, bridge timing and
Bob-hold/Volt-lock cooperation remain necessary after the interlocks release.
Existing traversal tests also prove neither lift can be skipped by a full-charge
unpowered jump.

One additional visible metal shutter seals the existing exit hallway at
`(0, 3.1, 159)`, spanning 7.9 m wide by 5.4 m high. It uses the existing machinery
material and metric UVs. Three red-to-green status fittings identify its guard
interlock in the dark hall, reusing the existing contact box and emissive exhaust
material in a single instanced draw. They are visual indicators, not lights.
It leaves the approved jammed door, crate, hallway,
platforms and all their collisions untouched. Its visible mesh and actual
collider are removed together on clearance. This final physical seal and the
completion condition prevent an alternate approach from completing the room
while a required guard survives. There are no invisible barriers.

Checkpoint restoration derives these locks again from restored drone states.
Stale deployed/locked/complete flags cannot override living guards. A normal
room restart restores all three enemies, red contacts and the shutter; an
all-destroyed checkpoint leaves the routes open. No extra independent unlock
state can become inconsistent with the enemies.

## Retaliation and coverage

The previous accepted-hit path called `WeakSewerDroneState.hit()` but never
redirected the shell or selected Goop. Each Room 2 adapter now subscribes to its
own accepted `burnStarted` event, after the shared damage handler. A miss or a
duplicate projectile during the same burn cannot create an alert or extra hit.

A surviving guard prioritizes persistent Goop for five simulation seconds,
turning its actual damped shell, spotlight and cone together toward Goop's
current position. Acquiring him still requires the visible cone, range and real
line of sight. The existing 0.4-second warning gives a readable reaction before
fire. Further accepted hits refresh the alert without restarting the warning
or suppressing fire. Character switching does not change the target.

Visible Goop keeps the alert alive. Losing sight behind solid cover stops
acquisition/fire, retains a brief search toward Goop, then returns to the
authored platform sweep if he stays hidden. Alert time is serialized with the
existing drone snapshot; pause uses no simulation time. Reset and disposal
clear the state and subscriptions. The third hit permanently destroys the
guard, disables its light/weapon and releases its pooled shots.

Normal half-angle is now 0.275 radians, 25% wider than 0.22 (approximately 32
degrees across, still narrower than the original 46-degree flood cone). Normal
range remains 10 m. Retaliation uses 30 m so shooting from the acid basin does
not leave Goop outside the weapon's previous short route-surveillance range.
The same range drives AI, spotlight distance and the scaled existing cone.
Existing beam occlusion remains budgeted; solid geometry blocks projectiles.
Damage (30), projectile speed (120 m/s), warning and firing cadence (0.65 s)
are unchanged. Close exposed shots remain dangerous; moving at longer range
and using solid cover provide counterplay.

No drone repositioning was necessary. Goop can walk the existing acid basin to
`(-8, -0.52, 125)` and shoot the west guard at its accepted hover position,
without crossing Volt's locked bridge. Browser and Node tests fire real acid
projectiles from this location and destroy it. The first two tested basin
positions are `(18, -0.52, 93)` and `(18, -0.52, 117)`.

## Verification

`tests/BlackoutDroneEncounter.test.ts` exercises real acid projectiles, all three
guards' live retaliation/destruction, matched light/AI gaze, wrong-guard and
partial-damage interlocks, physical sweeps at multiple heights and horizontal
positions, stale checkpoint flags, switching, cover/search timeout, nearby
misses and long-range movement counterplay. Existing traversal, runtime,
electrical and geometry tests retain their assertions and now stage destroyed
guards when testing solved machinery.

The production Chromium scenario in `tests/smoke/EmergingSewerDrones.spec.ts`
uses the shipped controller, real bodies and real acid/projectile systems.
It stages repeatable authored-room situations rather than claiming an
uninterrupted full playthrough. It checks locked lifts, Bob's real switch
attachment, a failed unassisted Volt run, hallway rushing/jumping, all guards'
acid-hit retaliation, existing landing cover at `(9.5, -0.52, 102)`, destruction and subsequent
passage/bridge operation, plus locked/open checkpoint recovery.

Final local results:

- `npm test`: **1,549 passed, 0 failed, 0 skipped**.
- `npm run type-check`: passed.
- `npm run build`: passed; the existing large-chunk advisory remains.
- `npm run validate:production`: **120 files validated**.
- Production Chromium: **all four scenarios passed** (Level 2 reference, Level 3
  combat, mandatory encounter and tunnel/bridge geometry).
- The final targeted encounter/evidence rerun also passed, showing the real
  Goop model from a survey perspective without the ability-aim fade.
- No console, asset-loading or WebGL errors; the encounter's GL error was zero.
- Both Bob and Volt were physically blocked at `z=158.42` before clearance,
  including Bob's charged-jump attempt. After destruction, both walked grounded
  through the same hallway to `z=163.07`. The original bridge switch then worked.
- All three guards accepted real acid hits, acquired Goop and fired. Goop took
  real damage; the actual landing cover produced zero further impacts and the
  five-second search expired. Locked/open checkpoint recovery passed.

The final [screenshot gallery](evidence/mandatory-drone-encounter/README.md)
includes normal surveillance, emergence, retaliation with live projectiles,
and consistent closed/open crossing and hallway views. Earlier browser harness
expectations were corrected for the intentionally wider cone and existing
health regeneration; cover is tested by impact events rather than constant
health. Its fully sheltered location is inside the landing, away from the edge
that the drone can intermittently see beneath during hover bob.

## Performance and limits

One resident box geometry, at most two visible draws and one static collider are
added for the shutter and its instanced status indicators. They borrow existing
materials/textures. No new light,
shadow map, render target, texture, projectile slot or per-tick vector is added.
The 48-shot pool, three non-shadowed spotlights and bounded two-beam/10 Hz
occlusion sampler are retained. The alert range only extends the existing
beam's transform and spotlight distance.

The final production snapshot reported **550 geometries and 51 textures**,
compared with the previous review snapshot's 549 and 51. This matches the one
new shutter geometry; status fittings reuse an already-rendered contact box.
These are resource observations, not a controlled hardware FPS benchmark.

Hardware FPS on lab machines and a complete boss/ending playthrough remain
unmeasured. This change does not alter other levels' default drone behavior.

## Changed files

- `src/hazards/EmergingSewerDrone.ts`: Level 3 retaliation, shared visible/AI
  coverage, saved alert state and cleanup.
- `src/hazards/SecurityDrone.ts`: opt-in detection-range setter; other encounters
  retain their authored defaults.
- `src/levels/BlackoutTransitController.ts`: destruction interlocks, visible
  shutter/status fittings, objectives and recovery invariants.
- `tests/BlackoutDroneEncounter.test.ts`: seven new encounter regressions.
- Existing prerequisite/geometry/combat checks updated in
  `tests/BlackoutGeometryCleanup.test.ts`, `tests/BlackoutRoomOneRuntime.test.ts`,
  `tests/BlackoutTransitController.test.ts`, `tests/BlackoutTransitInteraction.test.ts`,
  `tests/BlackoutTransitMaterials.test.ts`, `tests/BlackoutTransitTraversal.test.ts`,
  `tests/EmergingSewerDrone.test.ts`, and `tests/smoke/EmergingSewerDrones.spec.ts`.
- This document, cross-references in `docs/acid-drone-refinement.md`,
  `docs/emerging-sewer-drones.md` and
  `docs/level-3-polish-review.md`, and the screenshot gallery under
  `docs/evidence/mandatory-drone-encounter/`.

## Local verification

1. Run `npm run dev`, select Level 3 Blackout, and reach Room 2.
2. Approach with Bob/Volt: confirm emergence and wider flickering route beams.
   Check the red lift contacts; neither lift should accept power while its
   guard survives. Rushing Volt cannot produce a bridge crossing.
3. Switch to Goop and land one acid shot. Confirm the shell/beam turn toward
   him and fire after a warning. Move or use a landing as cover; wait out the
   search, then land another shot and confirm the alert refreshes.
4. Destroy both east guards with three separate accepted acid hits each.
   Power the original lifts and traverse Bob's unchanged route to his switch.
5. Take Goop across the existing acid basin to the west guard's firing position
   above; destroy it. Hold Bob's switch, cross with Volt and power the original
   door-edge bridge lock. Confirm the hallway security shutter has opened.
6. Retry/restart the room: all guards and their locks return. Verify the
   previously corrected tunnel, catwalk and bridge joins remain clean.
