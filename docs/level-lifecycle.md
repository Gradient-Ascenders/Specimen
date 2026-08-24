# Level lifecycle

`GreyboxLevelRuntime` is the explicit owner of the current Level 1 containment
teaching grey-box. It is intentionally concrete: the project does not yet need a
factory, registry, or transition framework for hypothetical later levels.

## Ownership and public operations

The application bootstrap owns the browser-session resources:

- `RenderLayer`, including the renderer, canvas, scene, and camera rig
- `Input` and its application-level DOM listeners
- the single `Loop` and renderer animation callback

The application constructs one `GreyboxLevelRuntime` and delegates fixed updates
and rendering to it. The runtime exposes `load()`, `start()`, `stop()`,
`restartLevel()`, `unload()`, and `dispose()`. Its `LevelLifecycle` guard uses the
states `unloaded`, `stopped`, `running`, `restarting`, and `disposed`. Duplicate
loads, starts, stops, and disposal are harmless; invalid transitions throw, and a
reentrant restart is ignored instead of creating another reset operation.

Updates are eligible only while the runtime is `running`. Rendering can continue
while stopped so the application-owned renderer remains responsive. Disposed or
unloaded runtimes have no level resources to update.

## Level-owned resources

Loading constructs the current `ContainmentTeachingScene`, collision world,
surface registry, movement event bus and subscriptions, kinematic player body,
visual-facing state, death sequence, death screen, and optional debug panel. The
containment scene owns its slime-burst presentation. The runtime retains those
references as a single resource set.

Unloading removes the level key listener, death screen, and debug DOM element;
unsubscribes the movement callbacks; clears the event bus and collision/surface
registries; detaches the camera target; and disposes the containment scene. The
scene removes its root and explicitly disposes its owned geometries and
materials, including the slime burst. The runtime then drops its resource-set
reference. It does not dispose the application-owned renderer, canvas, input
object, loop, or camera rig.

The application disposes its resources after disposing the level during final
shutdown. Restarts never construct a renderer, register another application
loop, or create another set of level listeners.

## Authoritative restart

`GreyboxLevelRuntime.restartLevel(): void` is the only player-facing restart
operation. Future UI, including Issue #22, should invoke this method and must not
coordinate subsystem resets itself.

The current level uses an in-place deterministic reset. This avoids recreating
static authored geometry and GPU resources during an ordinary restart while the
lifecycle guard prevents overlapping restart work. In order, the runtime:

1. stops updates and clears held/transient input;
2. teleports the kinematic body to the authored spawn, which clears its movement
   and contact transients;
3. resets the probe and slime-burst presentation, death sequence, death screen,
   and any deferred death recovery;
4. resets blob facing, camera transients, jump input (including cancellation and
   buffer state), and wall intent;
5. clears level diagnostic counters, restores the debug panel's hidden/inert
   state, and resumes updates and input if the level was running.

Death/retry does not introduce a second restart owner. The `DeathSequence`
temporarily suspends gameplay input, presents the burst and death screen, and
defers recovery until Retry. Its recovery callback restores the requested spawn
through the runtime and rearms the sequence; the debug reset control and all
other full-level restarts still call `GreyboxLevelRuntime.restartLevel()`.

Current `main` deliberately removed the older puzzle, laser, and elevator test
rigs from the containment teaching scene, so they are not active restart
participants. If Issue #19 puzzle/checkpoint systems return to the production
level, their existing reset APIs must be coordinated inside `restartLevel()`;
external callers must not create another restart path.

Permanent unload is a different operation and performs complete teardown and GPU
disposal. A later `load()` builds one fresh level resource set and registers one
fresh set of subscriptions.

## Runtime diagnostics

The existing grey-box test panel is also the lifecycle diagnostic overlay. It
reports:

- active level, lifecycle state, and completed restart count;
- fixed-step duration, render frame time/FPS, and steps per frame;
- renderer draw calls, triangles, scene-object count, GPU geometry/texture
  counts, and compiled shader-program count;
- player position, velocity, ground/attachment, surface, jump buffer, and contact
  state;
- death state, accepted death/retry counts, and slime-burst radius;
- camera, viewport, collision/surface registration, teaching-surface status, and
  wall-jump regression status.

No browser heap value is reported because there is no portable browser API that
is appropriate for this overlay. The memory indicators are labelled as renderer
GPU geometry and texture counts.

In development the panel is available but hidden by default. Press `F2` to
toggle it. A hidden panel has `hidden`, `inert`, and `aria-hidden` set so it cannot
capture player input. Production builds omit it by default; a deliberate
`?debug=1` query enables the same hidden-by-default tools for production-build
diagnosis and verification.

## Multi-level application ownership

Issue #93 adds `GameSessionCoordinator` above the concrete level runtimes. The
coordinator owns the current runtime, forwards lifecycle/render/HUD operations,
and performs the Containment-to-Cultivation replacement from an explicit
progression snapshot. Concrete level resources remain level-owned; see
`docs/cultivation-level-foundation.md` for transition and recovery details.

## Current limits

Each concrete runtime still owns only its own level. The application coordinator
currently supports the single authored Containment-to-Cultivation handoff; it is
not a general route graph or asynchronous asset manager. Cultivation Rooms 4–5
remain unplanned, and there is no transition beyond the Level 2 foundation.
