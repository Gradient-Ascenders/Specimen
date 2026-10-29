# Runtime and lifecycle

`src/main.ts` owns the browser session: `RenderLayer`, `Input`, the application
`Loop`, `AudioManager`, menus and `GameSessionCoordinator`. A level runtime owns
its scene, collision and surface registries, bodies, puzzles, hazards,
checkpoints, gameplay UI, audio subscriptions and transient effects.

The coordinator advances Containment → Cultivation → Blackout. It stops and
disposes the current runtime before constructing the next. Only a serializable
`LevelProgressionSnapshot` crosses that boundary; scene objects and callbacks
stay with their owner.

## Updates and input

Simulation runs at a fixed 60 Hz. A frame clamps elapsed time to 100 ms,
performs at most six fixed updates, drops remaining whole-step backlog, and
renders once. Blur or document hiding clears input and pauses timing.

Gameplay consumes named `InputAction` values. Held state persists until release;
pressed/released state and mouse deltas last one fixed update. Menus disable
input explicitly. Level start re-enables it. Presentation and audio consume
state or events and never advance gameplay.

## Restart and disposal

Each level implements `GameLevelRuntime`: load, start, stop, restart, unload and
dispose. Duplicate safe operations are harmless; invalid transitions and
reentrant restarts are rejected.

Restart suspends updates, clears input and transient work, resets owned puzzle
and hazard state, validates checkpoint anchors, recovers every persistent body,
restores identity/camera/UI, and resumes only after recovery succeeds. Death's
Retry uses the same authority. Ordinary restart reuses immutable geometry.
Unload/dispose unregisters listeners and colliders, detaches camera targets,
stops audio and releases owned CPU/GPU resources.

`SlimeManager` owns availability and active identity. `PuzzleRegistry` owns
reset order. Physics and checkpoints operate on stable body IDs, including
inactive bodies. Debug shortcuts invoke production transitions.

## Project boundaries

The game is single-player and statically hosted. Keep source grouped by
responsibility. `KinematicBody` and authored collision primitives remain
independent of deforming visual meshes. New presentation work must preserve
that separation and dispose only resources it owns.

See [gameplay](../gameplay.md), [rendering](rendering.md) and
[audio](gameplay-audio.md) for their contracts.
