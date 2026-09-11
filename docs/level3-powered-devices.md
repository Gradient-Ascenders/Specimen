# Level 3 powered electrical devices

Issue #123 adds the reusable device layer used by Blackout electricity puzzles.
Volt's tether remains owned by `VoltElectricalSystem`; devices consume the
existing `ElectricalConnectionTarget` contract rather than introducing a
second connection API.

## Shared state

Every targetable device owns one `PoweredDeviceCore`. Its stable read model
separates:

- `available`: whether the authored target can currently accept electricity;
- `connected`: a direct live Volt tether only;
- `powered`: effective operation after direct input, upstream supply, latch
  state and availability are combined;
- `latched`: authored persistent power state for latch-mode devices;
- `blocked`: electricity is present but a mechanical/interlock condition is
  preventing motion;
- `supplyCount`: number of active upstream sources.

Repeated identical connection, supply, availability and blocked writes are
no-ops. Presentation may read these values and events, but it does not mutate
power authority.

### Power modes

`sustained` devices remain powered only while a valid direct or upstream
electrical input exists.

`latched` devices set their latch after receiving valid power. Losing the
input does not clear that latch; authored reset or checkpoint restoration does.
Making a device unavailable gates operation without silently erasing a latch.

## Circuit graph

`ElectricalDeviceCollection` owns the complete level-local supply graph.

Generators and terminals are the reusable supply nodes. Links are authored by
stable device ID, fan-out is explicit, multiple sources may feed one recipient,
and removing one source cannot depower a recipient that still has another.
Unknown endpoints, non-supplying sources, self-links and cycles are rejected.

Power is recomputed in deterministic topological order. Existing source IDs are
diffed rather than cleared/re-added, so an unchanged graph cannot emit false
off/on transitions every fixed step.

The collection is also the single Blackout checkpoint participant for the whole
graph. All device-local snapshots are restored first; derived upstream supply is
then recomputed once. This avoids participant-registration order affecting the
final powered state.

## Concrete devices

| Device | Runtime behaviour |
| --- | --- |
| Powered light | Stable power model drives emissive intensity and an optional non-shadow point light. |
| Powered door | Wraps `VerticalBlastDoor`; powered/interlock state requests opening and all persistent slime bodies protect closing. |
| Powered platform | Wraps `MovingPlatform`; one-way or shuttle routes pause exactly in place when sustained power is lost. |
| Powered lift | Uses the same powered carrier implementation with a validated vertical route. |
| Rotating bridge | Rotates toward an authored pose while powered; conservative full-arc occupancy blocks movement and riders are never rotated/carried. |
| Laser junction | Gates only explicit authored laser references. It supports powered activation or powered suppression. |
| Generator | Targetable supply node with explicit downstream fan-out. |
| Terminal | Targetable reusable relay node with explicit downstream links. |

Target hit meshes remain separate from movement colliders.

## Motion and transport

`MovingPlatform` now exposes plain capture/restore state, a non-mutating next
displacement preview and an exact hold operation. Restore commits current and
previous transforms together and clears displacement, preventing a one-frame
carrier jump after checkpoint recovery.

Powered platforms and lifts preflight motion before committing it. Supported
slimes are sphere-swept through the proposed carrier displacement while the
carrier itself is ignored; ceilings and other world geometry can therefore stop
the machine before it crushes a rider. Non-riders inside the platform's swept
box also block motion.

Once preflight succeeds, every supported persistent body receives the carrier
displacement through `KinematicBody.applyCarrierDisplacement()`, regardless
of which slime is currently controlled. This is passive transport only and
does not grant inactive bodies player locomotion.

`VerticalBlastDoor` snapshots exact panel progress plus requested state.
Transient obstruction IDs/states are not serialized; they are derived again
from current bodies after restore.

Rotating bridges use a conservative box covering the complete horizontal
rotation radius. If any slime sphere overlaps that volume, rotation pauses and
the device reports `blocked`. Bridges intentionally do not transport riders.

Mechanical permission is independent from electrical power, allowing later
room authoring to model soluble braces or other interlocks as
`powered: true, blocked: true`.

## Laser circuits

`LaserHazard` now keeps authored/timeline enabled state separate from an
external circuit gate:

`effectiveEnabled = authoredEnabled && circuitGateEnabled`

Pattern timelines continue advancing while their circuit is suppressed. Both
beam visibility and lethal contact use the effective state, so a later timeline
step cannot accidentally re-enable a suppressed circuit.

A `LaserJunctionDevice` controls only the laser references supplied to that
junction. Neighbouring circuits are unaffected.

## Blackout fixed-step order

Blackout composes the systems in this order:

1. active slime locomotion against the previous device poses;
2. Volt input/search/acquisition;
3. deterministic power propagation;
4. powered mechanical motion and passive rider transport;
5. input-free Volt tether revalidation against moved sockets;
6. power propagation again if the tether changed;
7. laser/hazard evaluation;
8. normal failure/out-of-bounds checks.

`VoltElectricalSystem.revalidateConnection()` consumes no input and advances
no electrical search state. A moving device can therefore carry its socket past
the tether limit and break the connection before hazards run, without invoking
Volt's input update twice. Mechanical motion already committed in that step;
loss of sustained power brakes it on the next motion update.

## Checkpoint and restart order

Live Volt tethers are never serialized.

On Retry/recovery:

1. Volt disconnects before puzzle reset;
2. `PuzzleRegistry` resets the powered-device rig and authored laser state;
3. checkpoint participants restore device-local pose, route direction,
   availability and intentional latch state;
4. the device collection recomputes upstream supply once;
5. restored geometry is used by Blackout spawn-safety validation;
6. the three bodies recover.

A checkpoint therefore restores the exact captured moving-device pose while a
sustained device stays unpowered unless a non-tether authored source/latch
actually supports it. Full restart restores entry defaults.

On unload, Volt disconnects first. Device targets are then unregistered before
their concrete meshes/colliders are destroyed; colliders, surfaces, circuit
links, checkpoint registrations, lights, laser resources and owned geometry are
released deterministically.

## Development rig

The Blackout foundation currently composes a clearly development-only fixture
containing all eight real device types:

- a terminal feeding a powered door;
- a generator feeding a light, moving platform and lift;
- a latched rotating bridge;
- a laser junction suppressing one patterned circuit while a neighbouring
  circuit remains independent.

Room 1-3 authoring should replace this fixture with authored layouts while
reusing these device/network contracts.
