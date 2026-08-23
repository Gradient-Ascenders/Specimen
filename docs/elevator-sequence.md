# Elevator carrier and scripted ascent sequence

Issue #66 extends the existing `MovingPlatform` component into the deterministic
Room 4 cargo-elevator runtime. Final cargo-elevator/shaft presentation belongs
to #67 and final Level 1 placement belongs to #21.

## Runtime ownership

`MovingPlatform` owns:

- authored start/end route;
- travel duration;
- current fixed-step progress;
- root transform;
- fixed-step displacement;
- the development collision surface.

`ElevatorSequence` owns:

- `waitingForRider`, `warning`, `ascending`, `arrivalPause`, and `exitReady`;
- start-delay and arrival-delay timers;
- automatic start when a stable rider reaches the roof;
- read-only route/timing/checkpoint-group parameters;
- deterministic reset of platform pose and sequence timers.

`KinematicBody` owns the rider response. Neither the elevator nor renderer
parents the player or writes player velocity.

## Fixed-step carrier order

The body is updated before the elevator each fixed step:

```text
player locomotion / jump / collision
             ↓
is player still grounded on elevator roof?
             ↓
advance elevator platform
             ↓
platform.displacement
             ↓
KinematicBody.applyCarrierDisplacement(...)
```

This order means a jump performed during the player update immediately removes
carrier support, so that same fixed step does not also translate the airborne
player.

`applyCarrierDisplacement` changes authoritative position only. It intentionally
does **not** add elevator speed to player velocity. It sphere-sweeps the carrier
motion against all ordinary movement geometry while ignoring the carrier mesh
itself, because that mesh has already moved to its new fixed-step transform.

`previousPosition` is left untouched. Render interpolation and `CameraRig`
therefore see the carrier displacement as part of the same authoritative player
step rather than a teleport.

## Moving-platform collision contract

`MovingPlatform.collisionMesh` is registered once with `CollisionWorld` and
`SurfaceRegistry`. `CollisionWorld` already refreshes mesh world transforms on
queries, so the moving child mesh remains valid authored kinematic geometry.

`KinematicBody` now exposes the current stable `supportCollider` and
`supportColliderName`. Carrier displacement is applied only when the body is
grounded and that support is exactly the elevator roof collider.

## Authored Room 4 sequence

The development values are intentionally readable/tunable:

| Parameter | Harness value |
| --- | ---: |
| Platform start | `(13, 0.6, -5)` m |
| Platform end | `(13, 8.6, -5)` m |
| Roof size | `4.8 × 0.5 × 4.8` m |
| Warning/start delay | `0.85 s` |
| Ascent duration | `4.00 s` |
| Arrival delay | `0.65 s` |
| Checkpoint group | `room4-elevator-test` |

Sequence:

```text
waitingForRider
      ↓ player supported on roof
warning
      ↓ 0.85 s
ascending
      ↓ 4.00 s
arrivalPause
      ↓ 0.65 s
exitReady
```

Once warning begins it does not cancel merely because the player jumps; this
matches the authored automatic Room 4 set piece.

## Checkpoint and connected-hazard reset

The development rig registers, in authored order, both:

1. `ElevatorSequence`
2. a deterministic #65 `LaserHazardSystem`

under the same Room 4 checkpoint puzzle group.

Recovery therefore uses the existing contract:

```text
failure
  ↓
death flow retains the Room 4 recovery action
  ↓ Retry
CheckpointManager.recover(player)
  ↓
reset active Room 4 puzzle group
  ├─ elevator pose/state/timers
  └─ connected laser pose/state/timers
  ↓
KinematicBody.recoverAt(checkpoint)
  ↓
restore live presentation and gameplay input
```

There is no second game-wide restart route; #23 remains lifecycle owner.

## Camera contract

The Level 1 lift uses a high-angle contextual camera because the normal close
third-person follow camera makes a vertically moving platform difficult to
read. The contextual view follows the lift's large-scale movement while
allowing the player to move within the frame, improving visibility and reducing
unnecessary camera motion.

Room 4 owns a trigger-backed `CameraProfileZone` covering the playable shaft.
While the active slime occupies it during the useful ascent, `CameraRig` blends
over 0.65 seconds toward a 10.5 m boom at 65° downward pitch. Over roughly the
final 22% of actual elevator travel, Room 4 smoothsteps that stable context
toward a compact 5.0 m, 15° arrival profile with a lower anchor offset and
tighter dead zone. It holds the arrival profile at the upper stop, then
releases it after `exitReady` when the active slime advances across the upper
platform toward the doorway. The camera begins its normal Room 5 blend before
the player crosses the room boundary and remains perspective rather than
top-down.

The moving platform exposes its current and fixed-step previous route poses as
a read-only camera anchor. That anchor drives the camera's large-scale vertical
progression. The active slime drives only loose framing: movement within a
1.5 m horizontal and 1.25 m vertical screen-plane dead zone does not move the
framing pivot, while larger displacement is damped at 7 s⁻¹.

The profile authors pitch but does not author yaw. Existing mouse yaw and the
`planarBack` movement basis remain shared, so WASD stays aligned with the view.
Manual pitch input is held while the profile is active and the prior pitch is
restored on exit. The normal swept-sphere camera-obstruction query remains in
use throughout. Normal shaft solids, the visible presentation-only upper frame,
and a wider invisible upper camera cap are all visible to that query; only
normal solids are visible to movement queries.

Reaching the upper stop activates the Room 5 entry checkpoint immediately but
does not transfer active-room simulation ownership. Recovery at that checkpoint
spawns inside Room 5's entry trigger, but the trigger now also respects the
`exitReady` ownership gate. Room 4 continues updating through the authored
arrival pause; only `exitReady` transfers ownership to Room 5. This keeps
upper-stop recovery safe without freezing the exit lock in its closed state.

Checkpoint recovery resets Room 4's elevator and camera zone before restoring
the player. The recovered position is resolved immediately: a Room 4 recovery
reactivates the lift profile, while Room 5 recovery, level restart, unload, or a
switch to a slime outside the shaft cannot retain it.

Kevin's #67 renderer may read:

```text
ElevatorSequence.root
ElevatorSequence.state
ElevatorSequence.ascentProgress
ElevatorSequence.displacement
ElevatorSequence.routeStart
ElevatorSequence.routeEnd
ElevatorSequence.startDelaySeconds
ElevatorSequence.travelDurationSeconds
ElevatorSequence.arrivalDelaySeconds
ElevatorSequence.checkpointGroupId
```

Visual code must not move the authoritative platform or player.

## Development harness

Use **Enter elevator test** to recover the real player onto the elevator roof.
The roof checkpoint is far from the ordinary collision course so the elevator
can be inspected independently.

Expected behaviour:

1. camera snaps/follows to the verified roof checkpoint;
2. the platform is stationary during the warning delay;
3. it automatically ascends;
4. Tack remains free to walk and charge-jump on the roof;
5. standing Tack receives platform displacement with no added vertical launch
   velocity;
6. jumping Tack immediately stops receiving carrier displacement;
7. the platform stops at the top, waits for the arrival delay, then reports
   `exitReady`.

Use **Recover elevator checkpoint** during warning/ascent/arrival to verify that
platform pose, sequence timers, the connected hazard and player state all return
to the authored Room 4 checkpoint state.

Use **Run elevator carrier checks** for an automated fixed-step regression. It
verifies:

- the sequence reaches `exitReady`;
- the rider remains supported throughout authored ascent;
- relative rider/roof height stays within 6 mm;
- elevator motion does not become player vertical velocity;
- checkpoint recovery restores platform pose, sequence timers, hazard timers
  and player position;
- replaying the same fixed-step count after reset produces identical final
  platform/player/hazard state.

## Manual evidence for #66

Before PR review, capture a browser clip that shows:

1. Enter elevator test.
2. Warning pause and automatic start.
3. Standing ride with stable camera.
4. WASD movement while ascending.
5. One jump/bounce while ascending, showing no unintended elevator launch.
6. Arrival and `exitReady`.
7. Recovery during ascent returning quickly to the roof checkpoint.
8. Expanded diagnostics for sequence state/progress, carrier support,
   displacement, timing values, checkpoint group and connected hazard phase.
9. `Run elevator carrier checks` reporting PASS.
