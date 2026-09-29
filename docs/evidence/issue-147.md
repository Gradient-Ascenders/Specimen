# Issue #147 — Room 1 runtime validation evidence

This document records automated and manual validation for the remaining Room 1
powered-door, hazard, checkpoint, drone, and completion runtime work.

## Section 52 source status

Issue #147 requires the exact 20 softlock scenarios from section 52 of
`docs/planning/Level 3/Rooms/Room 1 Detailed.md`. That detailed-plan file is
not present on `main` or on this PR branch, so its exact 20-item wording cannot
be verified from the tracked repository source.

This PR therefore **does not claim that the section 52 acceptance item is
complete** and no longer closes #147 automatically. The exact source list must
be restored or linked and then cross-checked item-for-item before #147 is
closed.

The review of PR #166 explicitly identified several section-52 cases that were
missing from the earlier substitute matrix. Those review-confirmed cases are now
covered as follows:

| Review-confirmed section-52 case | Coverage |
|---|---|
| Drone lost under inaccessible geometry | `MaintenanceDrone.test.ts` — acid/short/inaccessible/out-of-bounds recovery returns the authored usable drone |
| Dismount Volt high in the air | `MaintenanceDrone.test.ts` — mid-air dismount, falling support, and landing |
| Bob or Goop attempts to mount the drone | `MaintenanceDrone.test.ts` — only Volt can mount |
| Bob or Goop attempts to ride/be transported by the drone | `MaintenanceDrone.test.ts` — ordinary slime collision masks do not inherit drone motion |
| Switch away while the drone is moving | `MaintenanceDrone.test.ts` — moving drone parks at the exact pose and clears velocity |
| Leave the drone parked while another slime is active | `MaintenanceDrone.test.ts` — parked hover remains fixed and lit across inactive updates |
| Resume Volt after parking | `MaintenanceDrone.test.ts` — control resumes from zero velocity |
| Different Bob/Goop/Volt arrival orders | `BlackoutMaintenanceBay.test.ts` — all six permutations gate completion until the third route condition |

## Recovery policy

The accepted Room 1 policy is:

- CP1 is the Room 1 entry state.
- CP2 activates exactly once after the first Volt maintenance-drone tutorial has
  actually been shown.
- CP2 restores all three slimes together at safe authored Room 1 anchors.
- CP2 restores the maintenance drone at its fixed recovery anchor in a grounded,
  startup-complete, tutorial-complete state. Live in-flight/mounted pose is not
  serialized into CP2.
- A live Volt electrical tether, acid projectile, aim state, moving door state,
  and in-progress vent traversal never survive death/retry.
- Room 1 completion activates CP3 once and opens into a real, collision-valid
  Room 2 arrival staging corridor. Later failure recovers the whole group at
  authored CP3 anchors inside that staging volume.
- Room 1 remains physically reachable from that staging corridor, so its door,
  hazards, hallway lighting, and drone presentation continue updating after the
  handoff.
- Full level restart returns to CP1 and resets the tutorial and Room 1 completion
  state.

## Current Room 1 regression matrix

This table is **additional coverage**, not a replacement for the missing exact
section-52 checklist.

| Scenario | Expected invariant | Coverage |
|---|---|---|
| Goop enters the acid route | Goop survives | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| Bob enters acid | Existing death path is requested | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| Volt enters acid | Existing death path is requested | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| Volt enters the electrical duct | Volt survives | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| Goop enters the electrical duct | Existing death path is requested | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| Main door loses power with a slime in its closing path | Door holds/reopens instead of crushing | `BlackoutMaintenanceBay.test.ts` door obstruction |
| Bob and Goop reach the hallway without Volt's route | Room does not complete | `BlackoutMaintenanceBay.test.ts` completion gating |
| Volt reaches the hallway without traversing the duct | Room does not complete | `BlackoutMaintenanceBay.test.ts` completion gating |
| Volt touches the bay-side vent mouth then uses the main door | Touching the entrance does not count | `BlackoutMaintenanceBay.test.ts` bypass regression |
| Volt approaches the duct outlet from the hallway side | Reverse outlet entry does not count | `BlackoutMaintenanceBay.test.ts` directional traversal |
| Volt starts a forward traversal then backs out | Active traversal is cancelled | `BlackoutMaintenanceBay.test.ts` backing-out regression |
| Volt walks the duct fully backwards | Reverse traversal does not complete the route | `BlackoutMaintenanceBay.test.ts` reverse traversal |
| Reset occurs while Volt is mid-duct | In-progress traversal evidence is cleared | `BlackoutMaintenanceBay.test.ts` reset-mid-route |
| Volt performs a fresh forward traversal after cancellation/reset | Valid bay-to-outlet traversal can still succeed | `BlackoutMaintenanceBay.test.ts` successful forward traversal |
| Maintenance drone attempts to enter Volt's duct | Physical collider excludes the drone | `BlackoutMaintenanceBay.test.ts` vent clearance |
| Electrical aim is attempted through bay structure | Receiver LOS rejects the blocked connection | `BlackoutMaintenanceBay.test.ts` connection-clear contract |
| Volt tries to carry the tether through the main exit | Range/route contract breaks the connection | `MaintenanceBayCircuit.test.ts` tether break |
| Death/retry occurs during Room 1 | Bob, Goop, Volt, drone and transients recover together | `BlackoutRoomOneRuntime.test.ts` shared retry |
| Death/retry occurs after the Volt tutorial | CP2 restores canonical grounded drone state and does not replay the tutorial | `BlackoutRoomOneRuntime.test.ts` CP2 recovery |
| All three route conditions are met | Room 2 staging initialises once and CP3 becomes authoritative | `BlackoutRoomOneRuntime.test.ts` one-shot handoff |
| Door is partly open when handoff occurs | Door continues closing after power loss instead of freezing | `BlackoutRoomOneRuntime.test.ts` post-handoff authority regression |
| Player returns from Room 2 staging into Room 1 acid | Room 1 hazard remains lethal and Retry returns to CP3 | `BlackoutRoomOneRuntime.test.ts` post-handoff return regression |
| Old hallway end is crossed after handoff | Collision path continues into Room 2 staging | `BlackoutMaintenanceBay.test.ts` staging traversal |
| Player reaches temporary end of Room 2 staging | Staging remains safely sealed until #165 extends it | `BlackoutMaintenanceBay.test.ts` staging boundary |

Additional automated coverage verifies Bob's collision-valid stepping route,
Goop's non-jump acid-exit ramp, the fully enclosed duct, full kinematic Volt
walk-through, checkpoint participant-state override semantics, and repeated drone
reset/disposal cleanup.

## Lifecycle acceptance

Automated coverage verifies:

- CP2 activation is one-shot.
- CP2 participant state is canonical and does not mutate live mounted gameplay.
- Retry after CP2 clears live ability/electrical state through the existing
  runtime reset order.
- Room 1 completion is committed through one guarded runtime method.
- CP3 is activated during the handoff rather than merely changing objective text.
- CP3 anchors are physically inside a traversable Room 2 arrival staging volume.
- Reachable Room 1 hazards, door mechanics, lights, and drone presentation remain
  authoritative after CP3.
- Re-entering Room 1 after CP3 can still fail through normal hazards, and Retry
  returns to the CP3 Room 2 staging snapshot.
- Full restart returns to CP1 and resets tutorial/completion state.

## Production / real-play sign-off

Before closing #147:

- [ ] restore/link the exact detailed-plan section 52 list and cross-check all 20
      cases item-for-item;
- [ ] full automated test suite passes on the final review-fix head;
- [ ] TypeScript/production build passes on the final review-fix head;
- [ ] production build is served over HTTP and Room 1 is played from CP1 through
      the Volt tutorial, Bob/Goop routes, powered door, directional Volt duct,
      and Room 2 staging handoff;
- [ ] the exact section-52 cases that require real play are recorded;
- [ ] no console errors, duplicate completion event, stale tether, active
      projectile, frozen moving-door state, stranded drone, or retained listener
      is observed after retry/restart/unload.
