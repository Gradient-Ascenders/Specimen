# Puzzles, hazards, and combat

## Shared component rules

Puzzle components expose explicit update, reset, and disposal behavior. Triggers
and sensors use stable body IDs; pressure plates and wall buttons publish state;
doors and moving platforms own their motion and obstruction handling. Composite
assemblies coordinate their own supports, collision changes, and final poses.

Register resettable components once with `PuzzleRegistry`. Registration order is
part of the contract when one component depends on another—for example, restore
a soluble target before the supported assembly. Checkpoints capture only state
that a plain reset cannot reproduce.

## Deterministic update order

A room update should follow the dependency graph:

1. reconcile body sensors and player actions;
2. resolve projectiles and explicit targets;
3. update puzzle/device state;
4. move doors, platforms, retained covers, and other authored geometry;
5. synchronize collision and surface metadata;
6. evaluate hazards, failure, checkpoints, and progression;
7. publish presentation state.

Do not allow presentation callbacks or event-listener order to decide gameplay.
Large fixed-step deltas must advance bounded state machines across stages without
executing old work after a reset or failure changes ownership.

## Hazards and combat

Lasers, radiation, drones, projectiles, out-of-bounds checks, and the Sentinel
operate through explicit registries and typed target/contact contracts. Each
hazard latches a single accepted failure until recovery. Inactive slime bodies
remain valid hazard targets. Telegraph, active, and recovery stages must agree
with collision authority; an inactive beam cannot remain lethal.

Projectile pools are bounded and resettable. Targets decide whether an impact
is accepted, blocked, requires charge, or changes state. Visual hit effects do
not infer damage. Boss attacks own only their attack lifecycle; the boss
controller owns encounter progression; the Blackout phase controller owns the
level-wide transition to and from the encounter.

## Reset and testing

Reset clears sensor occupants, in-flight projectiles, target burns, timers,
hazard latches, moving geometry, device connections, and presentation
transients before bodies are recovered. Test normal completion, failure during
each moving/intermediate state, simultaneous contacts, obstruction, rapid
switching, and repeated restart. Room-specific tests should assert state and
collision, while production playtests cover readability and timing.
