# Cultivation Level 2 foundation

Issue #93 introduces the application transition from Containment to a dedicated
Cultivation runtime. The foundation owns runtime lifecycle, dual-body recovery,
split progression, and radioactive hazards. Room-specific mechanics are added
from their supplied source designs without changing those contracts.

## Transition ownership

`GameSessionCoordinator` owns exactly one concrete runtime. When Containment
emits `nextLevelId: 'level-2'`, it captures only this progression snapshot:

```text
unlockedSlimeIds: bob, goop
activeSlimeId: bob | goop
```

The coordinator stops and disposes Level 1 before constructing Level 2. Bodies,
collision registrations, puzzle components, and the `SlimeManager` do not cross
the boundary. Level 2 creates one new manager and exactly one new Bob and Goop
body, unlocks Goop from the snapshot, and restores the prior active identity.

The UI displays `Entering Level 2…` while the old runtime is removed and the new
runtime loads. Once loading succeeds, the player confirms **Enter Level 2**;
that user gesture starts the stopped runtime and safely reacquires pointer lock.
A construction/load failure leaves the session stopped on a diagnostic error
surface. A scheduled transition checks disposal state before running, so an old
application instance cannot load a level after shutdown.

## Dual checkpoint schema and recovery

`CultivationCheckpointDefinition` stores:

- checkpoint and puzzle-group IDs;
- separate Bob and Goop spawn anchors;
- the active room/progression boundary;
- Bob/Goop Room 3 entry completion;
- the active slime captured when the checkpoint becomes authoritative;
- an optional camera reset anchor and shared clearance radius.

Both spawn anchors are checked against the active `CollisionWorld` when the
checkpoint is registered, activated, and recovered. Room and puzzle state such
as doors, platforms, timers, dissolve progress, drones, or exit flags does not
belong in the checkpoint; each owning component implements `reset()` and is
registered once with `PuzzleRegistry`.

Failure and Retry use this order:

1. latch one failure and reject further actions;
2. cancel room/hazard transient operations and clear trigger occupants;
3. reset the authoritative puzzle group in registration order;
4. recover Bob, then Goop;
5. restore active ownership through `SlimeManager`;
6. restore the saved room boundary and clear camera/input transients;
7. resume only after `DeathSequence` completes Retry presentation.

A full Level 2 restart resets every puzzle group before recovering the initial
pair state. It does not reconstruct immutable scene geometry.

## Split room progression

Every boundary uses `Trigger` plus `BoxTriggerSensor` and evaluates the stable
occupant IDs `bob` and `goop` every fixed update. Camera ownership and active
selection never determine entry.

- Goop may cross the shared Room 2 entry early, setting a read-only flag while
  Room 1 remains authoritative.
- Bob crossing that boundary completes Room 1 and activates the Room 2 pair
  checkpoint.
- Bob and Goop have separate Room 3 entry volumes and may occupy them in either
  order.
- Partial occupancy keeps Room 2 and its puzzle group authoritative. Leaving an
  exit clears that slime's entry flag until it returns. Both sensors reconcile
  before the fixed update evaluates the combined occupancy snapshot.
- If either slime fails before both exits are occupied, Retry restores both
  Room 2 spawns and clears both partial flags.
- Once both occupy their authored exits together, Room 3 becomes authoritative.
  Its temporary harness checkpoint deliberately restores Bob to an upper
  platform and Goop to a separate lower spawn.

## Radiation policy

Radioactivity is registered explicitly through `RadioactiveHazardDefinition`.
Presentation meshes carry `authoringRole: 'radioactive-hazard'` and
`hazardType: 'radioactive'`, but their colour/material/name is never queried for
gameplay.

`SlimeDefinition.hazardResponses.radiation` is the identity authority: Bob is
`lethal`, Goop is `immune`. `RadioactiveHazardSystem` receives both bodies every
fixed update, so switching cannot hide an inactive Bob or grant immunity. One
continuous or simultaneous overlap produces at most one accepted failure until
recovery resets the latch. Puzzle geometry is never supplied as a target.

Future Room 3 drones may be supplied as `kind: 'drone', response: 'signal'`.
The system emits a typed contact event; the drone component owns its disabled
state and reset behavior.

## Harness authoring and future rooms

All temporary positions and IDs live in `CultivationFoundationManifest`:

- checkpoint and safe spawn anchors;
- room/puzzle-group IDs;
- trigger roles, centres, and sizes;
- radioactive volume IDs, centres, and sizes;
- the out-of-bounds plane;
- six structural assembly definitions, including support IDs/roles, puzzle
  groups, authored transforms, timings, collider sizes, and final surface tags.
- Room 2's Bob-only sticky wall button, Goop-route vertical blast door,
  obstruction volume, asymmetric timings, and puzzle-group ownership.

The runtime now creates three Room 1 drop-to-acid platforms and three Room 2
retained-rope catch blocks from those definitions. Each soluble support target
and its assembly are registered as real resettable room components in
target-before-assembly order. See `docs/cultivation-structural-assemblies.md`
for their metadata, state machines, collision order, reset contract, and tuning.
Room 2's cooperative gate is documented in
`docs/cultivation-room-2-button-door.md`.

Final Room 1–3 work may refine the remaining harness values and presentation
without changing runtime or checkpoint interfaces. Rooms 4–5 add checkpoint
definitions, trigger authoring, room objectives, and puzzle groups through the
same contracts.

## Manual verification

For a fast Level 2 handoff test in a development build, press **0** while
playing Level 1. The same shortcut is available as **Enter Level 2** in the F2
panel. This development-only control emits the same one-shot Level 1 completion
event as the normal Room 5 ending, including the current active-slime
progression snapshot.

1. Complete Containment with Bob active, then repeat with Goop active. Confirm
   the loading surface appears and the same identity is active after entering
   Level 2.
2. Confirm exactly two HUD entries and two persistent bodies; switch repeatedly
   and while airborne.
3. Send Goop through the Room 2 trigger before Bob and inspect F2: the early flag
   changes while Room 1 remains authoritative.
4. Occupy Bob's and Goop's Room 3 exits in both orders. Move the first slime out
   before the second arrives and confirm Room 2 remains authoritative; return it
   to its exit and confirm Room 3 activates. Before simultaneous occupancy,
   trigger death and confirm both return to Room 2 with partial flags cleared.
5. Move Goop through the green radiation volume safely. Leave inactive Bob in
   it, switch to Goop, and confirm one pair death/recovery request.
6. Move either inactive body below the harness and confirm pair recovery.
7. At Room 3, confirm Retry restores Bob to the upper and Goop to the lower
   spawn while preserving the checkpoint's active identity.
8. Restart and repeat unload/load cycles while comparing F2 body, collider, and
   scene-object counts. Check the console for stale callbacks and asset 404s.
9. In Room 2, attach Bob to the left-wall button and switch to Goop. Confirm Bob
   keeps the button held while inactive and the centre blast door opens. Detach
   Bob and confirm the door closes.
10. While the blast door closes, place Bob and then Goop in its opening. Confirm
    either body blocks and reopens it; after clearing the opening, confirm it
    closes fully. Trigger Retry during opening, open, closing, blocked, and
    reopening states and confirm the panel returns to its exact closed pose.
