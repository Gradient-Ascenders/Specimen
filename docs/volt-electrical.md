# Volt electrical gameplay authority

Issue #122 adds Volt's electrical aim, continuous search beam, persistent tether,
and reset-safe connection lifecycle on top of the Blackout foundation.

## Input and state

Volt reuses the shared ability bindings:

- RMB / `aimAbility`: hold to enter the shared near-first-person aim pose.
- LMB / `fireAbility`: hold while aiming to search continuously.
- A valid target under the crosshair is acquired automatically.
- Releasing RMB or LMB after acquisition does not disconnect.
- While Volt is active, a fresh LMB press disconnects the current tether even
  without RMB.
- The acquisition press can never also disconnect. After a forced break, held
  LMB cannot reconnect until it has been released and pressed again.

Bob and Goop cannot operate the electrical system. Switching away from Volt
cancels transient aim/search state but preserves an established tether.

## Target contract

`ElectricalTargetRegistry` owns explicit compatibility. Targets provide a
stable authored ID, display name, dedicated hit geometry, a world-space socket
query, availability, and an idempotent connection-state notification.

Compatibility is never inferred from mesh name, material, colour, or soluble
metadata. Registration identity is stronger than the authored string ID, so a
removed target and a later replacement with the same ID cannot inherit a stale
connection.

Target hit geometry uses `CollisionLayer.ElectricalTarget`. Physical world
geometry continues to use `CollisionLayer.LineOfSight`.

## Acquisition and line of sight

`CollisionWorld.raycast()` is an exact zero-radius segment query that reuses
the existing collider transform/broadphase conventions without overwriting
movement sweep diagnostics.

Acquisition has two independent checks:

1. the camera centre ray selects the nearest registered electrical target that
   is not hidden behind LineOfSight world geometry;
2. Volt's body position must have an unobstructed LineOfSight ray to the
   selected target's socket.

This prevents an offset camera from connecting through a nearby wall.

After a connection is established, line of sight is intentionally not tested
again. Camera motion and later obstruction therefore do not break a tether.

## Range defaults

The initial configurable defaults are:

- acquisition: <= 15 m from Volt to socket;
- stable: < 16 m;
- `CONNECTION UNSTABLE`: >= 16 m;
- retained: <= 20 m;
- forced range break: > 20 m.

Moving targets are measured from their live socket transform every fixed step,
including while another slime is active.

## Recovery and lifecycle

A live tether is transient and is never serialized into a checkpoint snapshot.

- checkpoint activation alone preserves a currently live tether;
- accepted death disconnects immediately, before deferred Retry;
- Retry/recovery disconnects before PuzzleRegistry reset;
- full restart disconnects before reset;
- merge takeover and final completion disconnect;
- pause/focus loss cancels aim/search but preserves the tether and freezes its
  maintenance while the runtime is stopped;
- unload disconnects before targets are unregistered and disposes all owned
  electrical presentation/registry resources.

Issue #123 supplies the reusable powered-device layer. Devices implement this
same target contract while keeping direct Volt connection, upstream supply,
effective power and authored latch state separate. Device snapshots contain
local/latch/mechanical state only; restoring them never resurrects the live Volt
tether.

## Presentation boundary

`VoltElectricalSystem` owns gameplay truth and exposes a read model/events.
`VoltElectricalPresentation` is a deliberately small verification adapter: one
reused line buffer, one crosshair, connected-target text, and unstable text.

Issues #131 and #136 may replace or extend those visuals/HUD elements without
moving connection authority out of the gameplay system.

The Blackout foundation now composes the #123 powered-device development rig
instead of the temporary #122 target-only fixtures. The real terminal,
generator, moving devices, light, door, bridge and laser junction all register
through `ElectricalTargetRegistry`. Room authoring replaces that harness while
reusing the same target/device contracts.
