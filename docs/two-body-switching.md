# Persistent Bob/Goop two-body switching

Issue #28 introduces direct control switching while both Beta slimes remain
persistent physical bodies. The official names are **Bob**, **Goop**, and
locked future **Volt**.

## Core rule

Switching changes control ownership only:

```text
before                     after
Bob  = active              Bob  = inactive
Goop = inactive     Tab     Goop = active
```

The same two registered body objects exist before and after every switch.

A switch does not:

- spawn or clone a body;
- unregister a body;
- teleport either body;
- reset either body's velocity/position;
- clear pressure-plate occupancy just because control changed.

## Input action and handoff

`InputAction` now includes:

```text
switchSlime → Tab
```

The fixed-step runtime processes the switch before ordinary movement/jump input.
On a successful handoff it calls the existing `Input.resetState()` boundary,
clears jump/wall-jump scratch state, and simulates both bodies with zero player
intent for that handoff step.

This prevents held W/A/S/D, jump charge, buffered jump, or pointer displacement
from being inherited by the newly controlled body. The next deliberate key
press belongs only to the new active body.

Exactly one body receives player intent per fixed step.

## Persistent simulation

Both `KinematicBody` instances advance every fixed step:

```text
active body   -> camera-relative movement + jump intent
inactive body -> zero movement / zero jump intent
```

The inactive body therefore still:

- falls under gravity;
- collides with authored level geometry;
- lands and remains supported;
- retains its authoritative position;
- remains eligible for sensor/pressure-plate occupancy.

Airborne switching does not rewrite the body being left behind.

## Bob and Goop traversal configuration

The #27 roster config now drives two small `KinematicBody` capability flags:

```text
Bob:  adhesion yes, rebound yes
Goop: adhesion no,  rebound no
```

This does not implement Goop's dissolve interaction. It only prevents the
persistent Goop body from silently inheriting Bob's sticky/bouncy traversal.

## Camera handoff

`CameraRig.setFollowTarget()` already invalidates only its presentation
initialization while preserving the player orbit heading/pitch. On a switch the
runtime points the rig at the new active `KinematicBody`.

The camera never teleports or moves the inactive slime.

## Active-body presentation

The current development runtime keeps the existing Bob slime visual and adds:

- a persistent green Goop proxy;
- one gold ring beneath whichever body currently owns control.

Final Cultivation art/UI may replace this presentation without owning switching
or physics state.

## Pressure-plate occupancy

`BoxTriggerSensor` adapts persistent sphere bodies to the existing
physics-agnostic `Trigger` API.

Every fixed update it evaluates both Bob and Goop, regardless of active state,
and reconciles the complete occupant-ID set. This is used by a development
pressure plate in the teaching runtime to prove that switching away from Bob
does not release a plate that Bob is still physically standing on.

## Restart and checkpoint-state contract

`PersistentSlimePair` stores authored two-body recovery state:

```text
Bob position
Goop position
active slime ID
```

`setRecoveryState(...)` / `captureCurrentRecoveryState()` are the checkpoint
integration hooks for Cultivation.

`restoreRecoveryState()`:

1. recovers Bob;
2. recovers Goop;
3. validates the manager roster;
4. restores the saved active identity.

`restoreInitialState()` is used by the existing level lifecycle restart and
returns both bodies to their authored start positions with Bob active.

Switching itself never invokes either recovery method.

## Development integration

The current Level 1 teaching runtime is used only as an inspectable development
proof until the Cultivation level owner places the mechanic.

- Bob uses the existing authored spawn.
- Goop spawns 2 m to Bob's +X.
- Press **Tab** for direct Bob/Goop switching.
- A simple pressure plate near the Room 1 spawn tracks both bodies.
- F2 diagnostics expose both positions, active identity, switch count, plate
  occupants, registration count, and the automated regression result.

Expected invariant diagnostic:

```text
two-body switching regression:
PASS — 101 rapid switches — 1 active controller — inactive plate occupancy retained — airborne state retained — two-body recovery matched
```

## Manual verification

1. Press Tab repeatedly; body count remains 2 and exactly one slime is active.
2. Move Bob, switch to Goop, move Goop, then return to Bob. Bob must remain
   where his own physics left him.
3. Jump Bob and switch while airborne. Bob must continue passive physics rather
   than teleporting to Goop.
4. Put Bob on the development pressure plate, switch to Goop, and verify the
   plate remains pressed with occupant `bob`.
5. Rotate/look before switching and verify the camera cleanly hands off to the
   new body without moving either slime.
6. Restart and verify Bob and Goop both return to their authored positions and
   body registration remains exactly 2.
7. Verify Bob can still use sticky/rebound traversal while Goop cannot.
8. Confirm the existing death, wall-jump, slope, lifecycle, and #27 roster
   regressions remain healthy.

## Deferred scope

Not implemented here:

- remote teleporting of inactive bodies;
- Goop dissolve world interactions;
- Volt gameplay;
- merge/split;
- networking;
- split screen;
- final Cultivation placement/art.


## Death/retry active-owner handoff

Death presentation and retry now use the same active-body ownership contract as
switching.

At failure:

```text
active slime
   ↓
requestPlayerDeath()
   ↓
death burst starts at activeBody.position
```

At Retry:

```text
DeathSequence.completeRetry()
   ↓
retained PersistentSlimePair recovery executes
   ↓
active identity may change
   ↓
CameraRig retargets to slimePair.activeBody
   ↓
gameplay/input resumes
```

This matters for the exact case where Goop is active at death but the retained
recovery state restores Bob as the active controller.

F2 diagnostics expose:

```text
camera follow slime: bob|goop
last death slime: bob|goop
```

### Required review evidence

In addition to the automated **Check two-body switching** regression, manually
capture:

1. switch from Bob to Goop;
2. separate Goop from Bob so the positions are visually distinct;
3. trigger death while Goop is active;
4. verify the burst begins at Goop's position;
5. press Retry;
6. verify the retained recovery restores Bob active;
7. verify `camera follow slime: bob` and the camera is actually framing Bob;
8. move Bob immediately after Retry to prove input and camera ownership agree.

The automated regression also includes the retained
`Bob -> Goop -> restore recovery -> Bob` active-identity path. Camera retargeting
remains a runtime/presentation integration check and is therefore verified in
the browser rather than through a Node-only test dependency.


## Bob vs Goop jump style

The roster now makes jump style explicit:

```text
Bob  → charged
Goop → normal
Volt → normal placeholder while locked
```

`KinematicBody` exposes a `chargedJumpEnabled` configuration flag.

For Bob, the existing behaviour is unchanged:

```text
press Space
  ↓
hold to charge
  ↓
release
  ↓
launch using charge curve
```

For Goop:

```text
press Space
  ↓
launch immediately at minimum jump speed
```

Goop never enters the charge state and holding Space does not increase jump
height. The ordinary jump still uses the existing coyote-time and jump-buffer
contracts, so removing charge does not remove the controller's responsiveness.

Current normal-jump strength intentionally reuses
`minimumJumpSpeedMetresPerSecond`; this keeps the change small and leaves one
existing tuning value as the baseline normal jump strength.

### Manual verification

1. Activate Bob and hold Space: charge must still visibly increase before
   release.
2. Activate Goop and press Space: Goop must jump immediately.
3. Hold Space on Goop: jump height must not increase with hold duration.
4. F2 should report:

```text
Bob / Goop jump mode: charged / normal
```

5. Switching while Space is held must still use the #28 safe input handoff and
   must not cause Goop to inherit Bob's retained charge.
