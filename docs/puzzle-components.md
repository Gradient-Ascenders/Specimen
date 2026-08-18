# Puzzle components

Issue #18 supplies small, authored components for level builders. They are
intentionally narrow: components expose gameplay state and a Three.js root, but
they do not require a specific collision engine or a general-purpose graph.

## Trigger

`Trigger` stores the unique IDs of bodies inside a sensor volume. Physics code
provides a complete occupancy snapshot with `setOccupants(ids)` each fixed step.
It emits typed `entered`, `exited`, and `occupancyChanged` events only when the
set changes; duplicate IDs cannot cause duplicate activation.

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
- Subscribe to plate/door/platform state transitions for discrete puzzle logic.
  Read platform pose and displacement directly every fixed step for carrier
  movement.
- Call `dispose()` when unloading a level. It removes roots, disposes owned GPU
  resources, clears listeners, and leaves no active occupancy behind.
- Call `reset()` to return a plate, door, or platform to its authored initial
  state. Issue #19 will register those reset methods by puzzle group.

## Grey-box rig

The existing grey-box contains a component rig behind the main collision cases.
Use **Toggle plate test** to place a simulated slime on the yellow plate. The
green state opens the hinge door and moves the platform toward its endpoint;
toggling again closes/returns them. This verifies component composition without
claiming player-riding support before issue #11.

Use **Run sensor checks** to verify that duplicate body IDs count once, multiple
occupants hold the plate until the final exit, and rapid enter/exit snapshots
return the plate to its inactive state.
