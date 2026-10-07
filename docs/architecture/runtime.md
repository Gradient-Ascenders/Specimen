# Runtime and lifecycle

## Ownership

`src/main.ts` owns browser-session resources: `RenderLayer`, `Input`, the
single `Loop`, UI, and `GameSessionCoordinator`. A concrete level runtime owns
only its scene, collision and surface registries, playable bodies, level UI,
hazards, puzzles, checkpoints, and subscriptions.

The coordinator runs the authored progression
`Containment -> Cultivation -> Blackout`. It stops and disposes the current
runtime before constructing the next one. Only a plain `LevelProgressionSnapshot`
crosses that boundary; live Three.js objects, bodies, callbacks, and subsystem
instances never do.

## Frame and input contract

Gameplay advances at a fixed 60 Hz. Each browser frame clamps elapsed time to
100 ms, performs at most six fixed updates, drops any remaining whole-step
backlog, and renders once. Blur or document hiding pauses timing and clears
input so returning to the tab cannot replay stale movement.

Gameplay systems consume named `InputAction` values instead of browser key
codes. Pressed/released state and relative mouse movement are transient for one
fixed update; held state persists until release. Pointer movement belongs to
the gameplay canvas while it owns pointer lock. Menus disable input explicitly,
and level start is the only operation that re-enables it.

The normal controls are WASD movement, Space jump, Tab slime switch, right mouse
aim, left mouse fire while aiming, M maintenance-drone mount/dismount, and Shift
drone descent. F2 toggles diagnostics when debug tools are enabled.

## Lifecycle and reset

Each level implements the `GameLevelRuntime` lifecycle. Load creates one
resource set; start and stop control updates; restart restores authored state;
unload detaches level resources; dispose is terminal. Duplicate safe operations
are harmless, invalid transitions throw, and re-entrant restarts are rejected.

A player restart is coordinated by the active level runtime. It must:

1. suspend updates and clear transient input;
2. reset puzzle, hazard, projectile, and room-owned transient state;
3. recover all persistent bodies at validated checkpoint anchors;
4. restore active identity, camera, HUD, and phase state;
5. resume only after recovery succeeds.

Death uses the same recovery authority after the player chooses Retry. Ordinary
restart does not reconstruct immutable geometry or application-owned rendering
resources. Unload/dispose performs full teardown, unregisters listeners and
colliders, detaches the camera target, and disposes owned GPU resources.

## State boundaries

- `SlimeManager` is the authority for roster availability and active identity.
- Checkpoint snapshots contain serializable state only.
- `PuzzleRegistry` owns deterministic reset order for authored components.
- Presentation and audio read gameplay state/events; they do not decide damage,
  progression, or completion.
- Debug shortcuts must invoke production transitions rather than creating a
  second state-change path.

The runtime diagnostics panel reports lifecycle, fixed-step, renderer, body,
collision, and checkpoint state. It is development-only unless production is
opened deliberately with `?debug=1`.
