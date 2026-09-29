# Issue #147 — Room 1 runtime completion evidence

This document records the implementation and validation matrix for the remaining
Room 1 powered-door, hazard, checkpoint, and completion runtime work.

The issue references `docs/planning/Level 3/Rooms/Room 1 Detailed.md`, including
a 20-case softlock list in section 52. That planning file is not present on
`main` at the time of this implementation, so the matrix below does not pretend
to reproduce missing section-52 wording. Instead it records twenty concrete
softlock/bypass cases supported by the current issue requirements, merged PR
#161 review findings, and executable Room 1 tests. If the planning document is
restored, its exact case names should be cross-checked against this matrix before
#147 is closed.

## Recovery policy

The accepted Room 1 policy is now:

- CP1 is the Room 1 entry state.
- CP2 activates exactly once after the first Volt maintenance-drone tutorial has
  actually been shown.
- CP2 restores all three slimes together at safe authored Room 1 anchors.
- CP2 restores the maintenance drone at its fixed recovery anchor in a grounded,
  startup-complete, tutorial-complete state. Live in-flight/mounted pose is not
  serialized into CP2.
- A live Volt electrical tether, acid projectile, aim state, moving door state,
  and in-progress vent traversal never survive death/retry.
- Room 1 completion activates CP3 and hands authority to Room 2 staging exactly
  once. Later failure recovers the whole group at the authored hallway anchors.
- Full level restart returns to CP1 and resets the tutorial and Room 1 completion
  state.

## Twenty-case Room 1 softlock / bypass matrix

| # | Scenario | Expected invariant | Coverage |
|---:|---|---|---|
| 1 | Goop enters the acid route | Goop survives | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| 2 | Bob enters acid | Existing death path is requested | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| 3 | Volt enters acid | Existing death path is requested | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| 4 | Volt enters the electrical duct | Volt survives | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| 5 | Goop enters the electrical duct | Existing death path is requested | `BlackoutMaintenanceBay.test.ts` hazard eligibility |
| 6 | Main door loses power with a slime in its closing path | Door holds/reopens instead of crushing | `BlackoutMaintenanceBay.test.ts` door obstruction |
| 7 | Bob and Goop reach the hallway without Volt's route | Room does not complete | `BlackoutMaintenanceBay.test.ts` completion gating |
| 8 | Volt reaches the hallway without traversing the duct | Room does not complete | `BlackoutMaintenanceBay.test.ts` completion gating |
| 9 | Volt touches the bay-side vent mouth then uses the main door | Touching the entrance does not count | `BlackoutMaintenanceBay.test.ts` bypass regression |
| 10 | Volt approaches the duct outlet from the hallway side | Reverse outlet entry does not count | `BlackoutMaintenanceBay.test.ts` directional traversal |
| 11 | Volt starts a forward traversal then backs out | Active traversal is cancelled | `BlackoutMaintenanceBay.test.ts` backing-out regression |
| 12 | Volt walks the duct fully backwards | Reverse traversal does not complete the route | `BlackoutMaintenanceBay.test.ts` reverse traversal |
| 13 | Reset occurs while Volt is mid-duct | In-progress traversal evidence is cleared | `BlackoutMaintenanceBay.test.ts` reset-mid-route |
| 14 | Volt performs a fresh forward traversal after cancellation/reset | Valid bay-to-outlet traversal can still succeed | `BlackoutMaintenanceBay.test.ts` successful forward traversal |
| 15 | Maintenance drone attempts to enter Volt's duct | Physical collider excludes the drone | `BlackoutMaintenanceBay.test.ts` vent clearance |
| 16 | Electrical aim is attempted through bay structure | Receiver LOS rejects the blocked connection | `BlackoutMaintenanceBay.test.ts` connection-clear contract |
| 17 | Volt tries to carry the tether through the main exit | Range/route contract breaks the connection | `MaintenanceBayCircuit.test.ts` tether break |
| 18 | Death/retry occurs during Room 1 | Bob, Goop, Volt, drone and transients recover together | `BlackoutRoomOneRuntime.test.ts` shared retry |
| 19 | Death/retry occurs after the Volt tutorial | CP2 restores canonical grounded drone state and does not replay the tutorial | `BlackoutRoomOneRuntime.test.ts` CP2 recovery |
| 20 | All three route conditions are met, then more fixed updates or a later death occur | Room 2 initializes once; CP3 owns later recovery | `BlackoutRoomOneRuntime.test.ts` one-shot handoff/CP3 recovery |

Additional regression coverage verifies Bob's collision-valid stepping route,
Goop's non-jump acid-exit ramp, the fully enclosed duct, full kinematic Volt
walk-through, and checkpoint participant-state override semantics.

## Lifecycle acceptance

Automated coverage now verifies:

- CP2 activation is one-shot.
- CP2 participant state is canonical and does not mutate live mounted gameplay.
- Retry after CP2 clears live ability/electrical state through the existing
  runtime reset order.
- Room 1 completion is committed through one guarded runtime method.
- CP3 is activated during the handoff rather than merely changing objective text.
- Room 1 hazard/completion authority stops running once Room 2 staging owns the
  runtime.
- Retry after the handoff restores Room 2 staging rather than reopening Room 1.
- Full restart returns to CP1 and resets tutorial/completion state.

## Production / real-play sign-off

Before marking #147 ready for merge:

- [ ] full automated test suite passes in CI;
- [ ] TypeScript/production build passes in CI;
- [ ] production build is served over HTTP and Room 1 is played from CP1 through
      the Volt tutorial, Bob/Goop routes, powered door, directional Volt duct,
      and Room 2 handoff;
- [ ] the high-risk bypass cases above are spot-checked in real play;
- [ ] no console errors, duplicate completion event, stale tether, active
      projectile, moving-door state, or retained listener is observed after
      retry/restart/unload.
