# Puzzle components

Issue #18 supplies small, authored components for level builders. They are
intentionally narrow: components expose gameplay state and a Three.js root, but
they do not require a specific collision engine or a general-purpose graph.

## Trigger

`Trigger` stores the unique IDs of bodies inside a sensor volume. Physics code
provides a complete occupancy snapshot with `setOccupants(ids)` each fixed step.
It reuses internal scratch storage, so unchanged snapshots allocate nothing. It
emits typed `entered`, `exited`, and `occupancyChanged` events only when the set
changes; duplicate IDs cannot cause duplicate activation.

```ts
const trigger = new Trigger('containment-door-sensor');
trigger.events.on('entered', ({ occupantId }) => {
  console.log(`${occupantId} entered`);
});
trigger.setOccupants(['tack']);
```

## Pressure plate

`PressurePlate` combines a visible plate with a `Trigger`. It becomes pressed
when its occupancy reaches `requiredOccupants` (one by default) and emits the
typed `changed` event. Its root can be added directly to a level scene.

```ts
const plate = new PressurePlate({
  id: 'cultivation-entry',
  position: new THREE.Vector3(0, 0, 0),
});
plate.events.on('changed', ({ pressed }) => door.setOpen(pressed));
```

## Door

`Door` owns a local hinge pivot, visible frame, and panel. Call `setOpen(true)`
or `setOpen(false)` in response to discrete puzzle state, then call
`update(fixedDeltaSeconds)` during every fixed update. Its `openProgress` is in
the inclusive range `0…1` and its state is `closed`, `opening`, `open`, or
`closing`.

```ts
const door = new Door({
  id: 'cultivation-entry',
  position: new THREE.Vector3(4, 0, 0),
  openDurationSeconds: 0.7,
});
```

## Wall hold button

`WallButton` is a physical, sticky wall control. Unlike a general trigger, it
accepts only the configured occupant ID **and body instance**, and only while
that body is attached to the button's exact registered `surfaceMesh` and its
sphere overlaps the authored local contact box. Proximity, active-player
selection, attachment to a neighbouring collider, and a matching spoofed ID do
not press it.

The button starts disabled. A room owner enables it with `setEnabled(true)` and
supplies the complete occupant collection to `update()` each fixed step. This
means an inactive persistent body can continue holding the button. The
`changed`, `pressed`, and `released` events are stable transitions rather than
per-frame notifications.

## Vertical blast door

`VerticalBlastDoor` is separate from the existing hinged `Door`. It owns one
authoritative box collider and translates it along an authored local axis using
fixed-step progress. Opening and closing durations may differ; partial motion
reverses from its current progress and clamps to exact open/closed endpoints.

Closing checks both an authored obstruction volume and the panel's swept box
against all supplied body spheres. A detected body produces `blocked`, then
`reopening`; the door does not resume closing until the volume is clear. The
collider remains registered throughout motion, and `reset()` restores the exact
closed transform from every transition state.

`WallButtonDoorCoordinator` is the reusable wiring for these two components. It
updates the button before the door, supplies every persistent body as a door
obstacle, and gates the pair by room progression. Register the coordinator,
button, and door in that order so recovery first disables the relationship,
then clears button occupancy, then restores the closed collider.

## Moving platform

`MovingPlatform` travels deterministically along one authored linear route. It
moves from `start` to `end` while active and returns while inactive. Call
`update(fixedDeltaSeconds)` during fixed updates. The movement system should
read `root.position` and `displacement` while supporting a rider; it must not
expect platform pose to arrive through an EventBus.

```ts
const platform = new MovingPlatform({
  id: 'containment-lift',
  start: new THREE.Vector3(0, 0, 0),
  end: new THREE.Vector3(0, 4, 0),
  travelDurationSeconds: 2.5,
});
plate.events.on('changed', ({ pressed }) => platform.setActive(pressed));
```

## Authoring and lifecycle rules

- Use stable component IDs; body IDs supplied to triggers must also be stable.
- Use a component's root for scene placement; do not alter child transforms that
  define its local visual mechanism.
- Call component updates only from the fixed-step loop.
- Subscribe to button/plate/door/platform state transitions for discrete puzzle logic.
  Read platform pose and displacement directly every fixed step for carrier
  movement.
- Call `dispose()` when unloading a level. It removes roots, disposes owned GPU
  resources, clears listeners, and leaves no active occupancy behind.
- Call `reset()` to return a button, plate, door, or platform to its authored initial
  state. Register each mutable component with the level's `PuzzleRegistry` in
  authored restoration order.

## Resets and checkpoints

Issue #19 adds `PuzzleRegistry` and `CheckpointManager`. A level registers each
mutable puzzle component once and assigns it to a puzzle group.
`PuzzleRegistry.resetGroup(groupId)` restores that group's objects in their
registration order. `PuzzleRegistry.reset()` restores all groups in level
registration order. The registry deliberately does not own scene construction,
disposal, or a second whole-game restart path: issue #23's lifecycle will call
this reset work as part of its authoritative restart operation.

`CheckpointManager` receives an initial checkpoint and a level-specific
collision clearance check. It validates a spawn when it is registered, when it
is activated, and immediately before recovery. Unsafe authored spawns throw
instead of placing the player inside geometry. `reset()` selects the initial
checkpoint; `recover(target)` restores the active checkpoint's puzzle group in
authored order, then asks the player/controller to clear movement state and
copy the verified checkpoint position.

```ts
const puzzleRegistry = new PuzzleRegistry();
puzzleRegistry.register('containment-door', door, 'containment-chamber');

const checkpoints = new CheckpointManager(
  {
    id: 'containment-start',
    spawnPosition: new THREE.Vector3(0, 0.45, 0),
    puzzleGroupId: 'containment-chamber',
  },
  (position, radius) => collisionWorld.isClear(position, radius),
  puzzleRegistry,
);
checkpoints.register({
  id: 'vent-entrance',
  spawnPosition: new THREE.Vector3(8, 3.45, 0),
  puzzleGroupId: 'vent-route',
});

// Fall/out-of-bounds detection restores the active route and then respawns.
checkpoints.recover(playerController);
```

For an authored level restart, use this restoration order:

1. Reset registered puzzle components in their authored registration order.
2. Reset checkpoint selection to the initial checkpoint.
3. Recover the player at that verified initial spawn.

The controller supplied to `recover` owns player-specific transient state such
as velocity, adhesion, and input buffers. It must copy the supplied position;
checkpoint data remains immutable authored state. Checkpoint recovery always
performs: reset the active puzzle group → validate the restored active spawn →
recover the player. Checkpoint registration and activation still validate
authored anchors immediately.

## Grey-box rig

The existing grey-box contains a component rig behind the main collision cases.
Use **Toggle plate test** to place a simulated slime on the yellow plate. The
green state opens the hinge door and moves the platform toward its endpoint;
toggling again closes/returns them. This verifies component composition without
claiming player-riding support before issue #11.

Use **Run sensor checks** to verify that duplicate body IDs count once, multiple
occupants hold the plate until the final exit, and rapid enter/exit snapshots
return the plate to its inactive state.

Use **Activate elevated checkpoint** and **Recover at checkpoint** to inspect
verified checkpoint recovery. **Run 10 reset cycles** exercises active and
returning plate/door/platform states, ordinary checkpoint recovery, checkpoint
selection, and player recovery without reloading the browser.
