# Level 3 maintenance-drone runtime

Issue #146 implements gameplay authority for the mountable Room 1 maintenance
drone. The detailed room design remains the source for the teaching sequence,
while #145 owns final Room 1 geometry, drone art, lighting and presentation.

## Ownership

The runtime deliberately keeps four responsibilities separate:

- `MaintenanceDroneController` owns mount eligibility, startup, powered flight,
  parking, dismount, falling and recovery.
- `MaintenanceDroneFlightBody` owns deterministic collision-aware translation.
- Blackout owns input routing, slime switching, checkpoints and lifecycle.
- the existing `VoltElectricalSystem` remains the only authority for Volt aim,
  beam targeting and persistent electrical connections.

Volt never becomes a second vehicle-specific slime identity. The existing Volt
`KinematicBody` is synchronized to the authored rider anchor while mounted,
so the camera and electrical systems continue reading the same body.

## State model

The controller uses:

```text
damaged-idle
  -> starting
  -> mounted
       | switch away -> parked-hover -> switch back -> mounted
       | M dismount  -> unpowered-falling -> grounded-idle

usable state
  -> shorted/recovering
  -> authored recovery pose

any state
  -> disposed
```

`parked-hover` still means Volt is attached and powering the drone. It is an
exactly stationary powered state, not a dismount.

`unpowered-falling` begins only after Volt physically dismounts.

## Authored interface

#145 can replace the development fixture by supplying:

```ts
interface MaintenanceDroneAuthoring {
  root: THREE.Object3D;
  collider: THREE.Mesh;
  mountAnchor: THREE.Object3D;
  riderAnchor: THREE.Object3D;
  dismountAnchor: THREE.Object3D;
  recoveryAnchor: THREE.Object3D;
}
```

The recovery anchor is fixed in room space rather than parented under the
moving drone.

The gameplay clearance radius is derived from the real authored collider bounds.
No hidden "no drone" trigger is used for the maintenance vent. If the collider
is wider than the opening, the same movement sweep that blocks walls blocks the
vent.

## Input

Only active Volt can mount.

| Input | Mounted result |
| --- | --- |
| WASD | camera-relative horizontal flight |
| Space | ascend |
| Shift | descend |
| mouse | camera |
| M | dismount |
| RMB | existing Volt aim |
| LMB | existing Volt electrical beam |

Space is not forwarded to Volt's ordinary jump while mounted.

RMB aim zeros powered-flight velocity before the electrical system updates.
Camera look therefore remains available without causing the drone to rotate or
translate.

## First startup

The first successful mount enters a fixed-step 1.5 s startup by default and
raises the drone 0.75 m. These are configurable starting values within the
design's 1-2 s / 0.5-1 m guidance.

The controller exposes stable `startupProgress` and emits:

- `startupStarted`;
- `startupCompleted`;
- `firstMountTutorialRequested`.

The tutorial request is committed once when first startup finishes. Checkpoints
captured afterward persist both startup/tutorial completion so Retry cannot spam
the teaching prompt.

Later remounts enter `mounted` immediately.

## Powered flight

Flight is upright kinematic translation rather than aircraft physics.

Default prototype tuning:

| Setting | Value |
| --- | ---: |
| horizontal speed | 5.5 m/s |
| vertical speed | 4.0 m/s |
| horizontal acceleration | 14 m/s² |
| vertical acceleration | 12 m/s² |
| braking | 18 m/s² |
| fall gravity | 18 m/s² |
| terminal fall speed | 16 m/s |

Horizontal diagonals are normalized. Velocity is accelerated toward a bounded
target and independently braked when input disappears.

Gameplay hover contains no sinusoidal bob. Zero input can reach exactly zero
velocity. Any visual hover wobble belongs to #145 and must not move gameplay
state.

## Parking across slime switching

When switching away from mounted Volt, Blackout parks the controller before
changing active identity:

1. velocity becomes exactly zero;
2. movement intent is discarded;
3. Volt stays attached to the rider anchor;
4. drone pose remains exact;
5. `lightEnabled` remains true;
6. an established Volt tether is not disconnected.

Bob and Goop can then move independently while the parked light/Volt glow remain
where placed.

When switching back to Volt, control resumes at zero velocity. Blackout's
existing input reset ensures held movement from the old control period cannot be
replayed.

## Mounted Volt and electrical ability

Every drone movement step synchronizes the existing Volt body before
`VoltElectricalSystem.update()`.

This means mounted Volt naturally keeps:

- the existing first-person aim camera;
- the existing beam ray;
- the same connection range;
- the same target registry;
- the same persistent tether semantics.

The drone has no electrical-target knowledge of its own.

## Dismount and falling support

M is allowed in mid-air when the authored rider/dismount position has safe slime
clearance.

A successful dismount:

1. places the real Volt body at the authored top anchor;
2. clears mounted ownership;
3. removes powered hover;
4. enters `unpowered-falling`;
5. applies deterministic downward gravity.

Volt's movement mask includes the dedicated
`MaintenanceDroneSupport` collision layer. Bob and Goop keep the default
`Movement` mask and therefore cannot stand on or be carried by the drone.

While Volt remains physically supported by the falling collider, the drone's
fixed-step displacement is applied through the existing carrier-displacement
contract. Once Volt jumps or walks off, support ends naturally.

This intentionally permits a bad mid-air dismount above acid: both drone and
Volt may fall. The normal Room 1 failure/recovery rules handle that outcome.

## Physical vent exclusion

The drone flight body calculates conservative clearance from the authored
collider and sphere-sweeps that clearance against normal level movement
geometry.

The vent is therefore excluded physically:

- ordinary Volt sphere fits;
- maintenance drone clearance does not;
- there is no gameplay-only vent trigger.

If final #145 art requires a less conservative fit, the backend contract can be
extended to a small fixed compound derived from the same collider rather than a
new rigid-body engine.

## Failure and recovery

Room hazard/progression code may call:

```ts
requestMaintenanceDroneRecovery(
  'acid' | 'shorted' | 'out-of-bounds' | 'inaccessible'
)
```

Acid/shorting enters `shorted` first, then `recovering`. Other unusable
states can enter recovery immediately.

Recovery:

- detaches powered mount ownership;
- clears velocity and transient interaction state;
- restores the authored recovery position;
- preserves whether the player already completed first startup/tutorial;
- returns a usable damaged/grounded idle state.

The backend never pathfinds to a safe location. #145 authors the deterministic
recovery anchor.

## Checkpoints

The maintenance drone is a Level 3 checkpoint participant.

Stable snapshot data contains only:

- drone position;
- stable state;
- startup completion;
- tutorial completion;
- whether Volt was mounted.

Velocity, input, contacts, timers, VFX and live electrical tethers are never
serialized.

Transient states such as startup, falling, shorting or recovery normalize to the
authored recovery position when captured.

Checkpoint restore occurs before body movement through the existing Blackout
participant order. After the checkpoint manager validates/restores the slime
group, Blackout calls `reconcileAfterBodyRecovery()`. If the snapshot says Volt
was mounted, the existing Volt body is attached to the restored rider anchor and
the controller selects `mounted` or `parked-hover` according to the restored
active slime.

Full restart uses the initial checkpoint participant snapshot, returning the
development drone to `damaged-idle` with first-start/tutorial state cleared.

## Lifecycle and cleanup

Death immediately cancels drone input; checkpoint recovery owns the stable
restoration.

Pause/stop zeros flight velocity so held input cannot continue after focus or
menu suspension.

Merge takeover immediately detaches and returns the Room 1 drone to its authored
recovery position. Room progression should normally make this unnecessary, but
it prevents a stale vehicle/body ownership leak.

Disposal unregisters the drone support collider before #145/development
presentation geometry is destroyed. Repeated cleanup is idempotent.

## Development fixture

Until #145 lands, `MaintenanceDroneDevelopmentFixture` provides only:

- one basic authored collider/proxy;
- mount anchor;
- rider/dismount anchor;
- fixed recovery anchor.

It intentionally does not own final light cones, sparks, audio, tutorial UI,
acid, door progression or vent hazards.

## Room 1 integration boundaries

#146 deliberately does not decide:

- what is acid;
- when the powered door opens;
- when Bob/Goop have crossed;
- electrical vent lethality;
- Room 1 completion.

The downstream Room 1 runtime can read the drone model/events and request
recovery, while the existing electrical/device systems implement the receiver
and persistent door-power loop.
