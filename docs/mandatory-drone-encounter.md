# Room 2 local drone encounters

PR #236 gates each protected traversal mechanism with its own authoritative
`WeakSewerDroneState.destroyed` state. There is no added exit shutter, status
array, exit collider, or separate all-drone completion predicate.

## Independent route permissions

| Guard | Local mechanism | After destruction |
| --- | --- | --- |
| First east guard | First required Bob lift | Volt may power that lift; Bob must ride/jump normally |
| Second east guard | Second required Bob lift | Volt may power that lift; Bob must ride/jump normally |
| West guard | Volt-side deployable bridge | Bob must hold his original wall switch; Volt must cross and power the original bridge lock |

Killing another guard does not release either lift. The bridge checks only the
west guard, not the two east guards. Bob's wall switch still detects his actual
attachment and proximity; its use is not separately gated by remote drone flags.
The east encounters already control Bob's legitimate access to that switch.

Destruction makes the corresponding machinery available. It does not supply
power, raise a lift, hold Bob's switch, extend an unrequested bridge or latch
Volt's receiver. Existing red lift contacts and the red bridge-lock contact
signal the restrictions without adding physical barriers or lights. Objectives
name the next relevant guard and electrical step.

Bob cannot skip the unpowered lift heights/gaps with his full charged jump,
including attempts from different deck offsets and preceding sticky walls.
Volt cannot span the acid gap without the existing bridge, including a jump
started during emergence. These restrictions remain independent of whether a
shot lands. The authored platform heights, walls, paths, bridge geometry,
movement durations, lasers and physics remain unchanged.

## Projectile damage and retaliation

Only the Room 2 projectile-system instance opts into per-character damage:
Bob and Volt receive 100 damage on an actual projectile collision, equal to
their maximum health; Goop retains 30. Impact events report the actual applied
damage. Other encounters retain their existing uniform damage configuration.
The existing damage/death events and runtime retry flow handle lethal hits.
Acquisition and entering a spotlight do not themselves damage or kill a slime.

Three accepted Goop acid reactions still permanently destroy a drone. Accepted
hits alert the surviving guard, redirect its actual damped shell and spotlight
toward persistent Goop, and prioritize him through the existing warning/LOS
checks. Switching slimes does not cancel retaliation. Solid cover blocks real
projectiles, and five seconds without reacquisition ends the search. Additional
accepted hits refresh the alert without repeatedly restarting the warning.

The approved 0.275-radian half-angle, damaged spotlight flicker, 16 m proximity
activation, smooth 1.5-second emergence, three drone positions, 4.72 m west-guard
hover clearance, 0.4-second warning, 0.65-second cadence and 120 m/s projectiles
are unchanged. Normal range is 10 m and Goop retaliation range is 30 m, with
matched visible and AI coverage.

## Goop access and cooperation

Goop uses the existing acid floor. Reachable firing positions include
`(18, -0.545, 93)`, `(18, -0.545, 117)` and `(-8, -0.545, 125)`.
The last is reached across the basin through `z=130`, before crossing Volt's
bridge. The browser scenario walks Goop along this route with the actual body
and collision system, then lands real acid projectiles on every guard.
The existing landing at `(9.5, -0.52, 102)` provides solid cover. No new route,
platform, shutter or cover geometry is introduced.

After each east guard dies, browser verification has Volt aim and power the
actual released lift socket, carry Bob upward, then use Bob's charged jump to
land on the next original platform. After the west guard dies, Bob must still
hold the wall switch and Volt must traverse the original bridge and power the
original door-edge receiver. Goop's damage and offensive mechanics are unchanged.

## Recovery and original exit

Checkpoints restore each guard first, then derive its machinery permission.
A living east guard resets a stale raised lift to its authored resting state,
clears residual power and disables that lift. A living west guard rejects stale
bridge progress, deployment, lock and receiver charge. Destroyed guards restore
their machinery normally; unrelated guard states do not affect that restoration.
A full room retry restores the existing Room 2 entrance, dormant drones, health
and original puzzle reset order through the established runtime.

Completion is the original condition: all three bodies occupy the original
exit volume and the cooperative bridge is locked. It does not directly check
drone destruction. The original jammed door, crate, exit hallway, collision and
Goop ramp remain intact. The hallway is physically open even while guards live.

## Validation

- `tests/BlackoutDroneEncounter.test.ts` covers independent permissions, partial
  damage, stale raised-carrier/bridge states, actual charged and sticky-wall
  bypass attempts, real lethal hits on Bob/Volt, Goop's 30-damage retaliation,
  cover, search, switching, and the original completion predicate.
- `tests/BlackoutVoltGuard.test.ts` checks real lethal shots over the authored
  railing and ends running attempts at the first impact.
- `tests/BlackoutRoomOneRuntime.test.ts` drives real projectile deaths through
  the actual runtime, death UI and room retry.
- `tests/smoke/EmergingSewerDrones.spec.ts` verifies local run/jump/wall attempts,
  emergence timing, real acid destruction, Goop's walking access, real Volt
  electrical connections, powered Bob traversal, bridge cooperation, stale
  recovery, hallway clearance and browser death/retry interactions.
- Existing Level 2 reference, Level 3 geometry, original traversal and material
  regressions remain part of validation.

Completed local validation:

- Full `npm test -- --test-concurrency=2`: **1,566 passed, 0 failed, 0 skipped**.
- Focused collision, encounter, projectile and runtime checks: **66 passed**;
  final encounter rerun: **22 passed**, including extra original-exit and
  stale-bridge-collider assertions.
- TypeScript checking and production build passed; the existing chunk-size
  advisory remains. Production-layout validation passed for **120 files**.
- **Six production Chromium scenarios passed**: Level 2 reference, Level 3
  combat, local route traversal, Bob lethal hit/retry, Volt lethal hit/retry,
  and preserved tunnel/bridge geometry.
- Bob's lifts remained at progress zero for running, charged, edge and
  sticky-wall bypass attempts. Real electrical tethers then carried Bob
  **2.80 m** and **3.00 m** after each corresponding guard died, and Bob landed
  on the next authored platform. The second lift stayed locked after guard 1.
- Volt failed the cold sprint and emergence/active jump attempts with the
  west guard alive, including a character switch. After Goop's real third acid
  hit, Volt crossed and electrically latched the original cooperative bridge.
- Goop walked to all three firing positions, triggered real retaliation and
  survived normal damage. Solid cover produced zero impacts and search expired.
- Real Bob/Volt projectiles produced one 100-damage impact, death UI and working
  Retry recovery. Acquisition alone did not kill them. Stale lift/bridge
  recovery and the original exit predicate passed.
- No console, asset-loading or WebGL errors. The local route GL error was zero.

Browser checks stage the start of each encounter; they are not an uninterrupted
full playthrough. Current captures are in the linked gallery.

## Performance

The additional exit shutter geometry, collider and instanced indicators have
been removed. Existing contact materials provide feedback. The three
non-shadowed spotlights, 48-shot pool and bounded two-beam/10 Hz occlusion sampler
remain unchanged. Per-character impact damage adds one bounded lookup, without
per-frame allocations, lights, shadow maps, textures or render targets.
Hardware FPS on university lab machines remains unmeasured.

The final local route snapshot reported **549 geometries / 51 textures**,
compared with the previous shutter version's 550 / 51. This is a resource
observation, not a controlled hardware FPS benchmark.

## Changed files

Implementation: `src/hazards/DroneProjectileSystem.ts` and
`src/levels/BlackoutTransitController.ts`. Regression updates are in
`tests/BlackoutDroneEncounter.test.ts`, `tests/BlackoutVoltGuard.test.ts`,
`tests/BlackoutRoomOneRuntime.test.ts`, `tests/BlackoutTransitController.test.ts`,
`tests/BlackoutTransitMaterials.test.ts`, and
`tests/smoke/EmergingSewerDrones.spec.ts`. Documentation and current screenshots
are linked from [the encounter gallery](evidence/mandatory-drone-encounter/README.md).

## Local testing

1. Run `npm run dev`, select Level 3 Blackout and enter Room 2.
2. Leave the first guard alive. Try charging from its unpowered lift or sticky
   wall: Bob cannot reach the upper landing. Hit Goop's guard with acid and
   observe retaliation. Destroy it with three reactions, then have Volt power
   the first lift so Bob can cross. The second lift must remain locked.
3. Repeat at the second lift. Killing its guard makes the electrical interaction
   available; it does not raise the lift automatically.
4. Hold Bob on the original switch while the west guard lives. The bridge must
   stay unavailable. Run/jump toward the crossing during emergence: Volt cannot
   cross. A real drone projectile kills Volt immediately.
5. Walk Goop across the basin to the west firing position and destroy that guard.
   Bob's held switch may now extend the bridge. Cross with Volt and power the
   original door-edge lock; verify Bob can leave his switch afterward.
6. Check that the original exit hallway is open and contains no added barrier.
   Retry after a Bob/Volt projectile death: the existing room reset restores all
   three bodies, health, living guards and corresponding machinery restrictions.
