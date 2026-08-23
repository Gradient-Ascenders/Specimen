# Game flow UI

Issue #22 wraps the lifecycle-owned containment runtime in one DOM/CSS
application flow. `GameFlowUI` owns UI elements, global UI listeners, focus
changes, state subscriptions, and explicit presentation transitions:

```text
loading -> title -> playing <-> paused -> restarting -> playing
              \       \          \
               +------ settings ---+
               +------ credits -----+
```

Settings and credits remember whether they were opened from the title or pause
menu and return to that one surface. Full-screen states are mutually exclusive.
The HUD is a separate `playing` surface and does not intercept canvas input.

## Controls and pointer lock

- **WASD** moves relative to the camera.
- **Space** charges and releases a jump.
- **Tab** switches between Bob and Goop.
- As Goop, hold **Right Mouse Button** to aim and press **Left Mouse Button**
  to fire an acid projectile.
- The mouse orbits the camera while the canvas owns pointer lock.
- **Escape** pauses gameplay. Escape from settings or credits returns to the
  parent menu; Escape from pause resumes where browser activation permits.
- **R** and **F** remain development diagnostics, not player menu actions.

Entering a full-screen menu calls `GreyboxLevelRuntime.stop()`, disables `Input`,
clears held/pressed/released and pointer-delta state, hides level diagnostics,
and releases pointer lock. Start and Resume call
`GreyboxLevelRuntime.start()` before requesting pointer lock from their user
activation. A browser-driven pointer-lock loss while live gameplay input is
enabled enters pause; the intentional lock release used by the death sequence
does not. Window blur also pauses a running trial.

If a mapped gameplay key was already held when a menu opened, its matching
keyup is consumed before the browser can use it to activate the newly focused
menu button. A fresh Space press made after the menu is open remains ordinary
native button input.

The flow never enables gameplay input directly. Re-enabling belongs to the
runtime start hook, which can intentionally keep input disabled while the
current death/retry sequence is active. This keeps the application UI state and
runtime lifecycle aligned without competing simulation state machines.

## Session settings

`GameSettings` owns one in-memory model for the application session. It is not
recreated by menu transitions or level restart. Changes apply
immediately:

- Mouse sensitivity scales both existing `CameraRig` look axes from their
  authored defaults.
- Invert vertical look updates `CameraRig.setLookSettings()`.
- Camera distance updates `CameraRig.setFollowDistanceMetres()` across a
  conservative 3.5–7.0 m range. Existing obstruction contraction and outward
  recovery remain authoritative.
- Master volume is retained as a legitimate future audio-system input. No audio
  system currently consumes it, and the UI states that boundary.

No unrelated graphics-quality setting is exposed.

## Restart ownership

`GameFlowUI` knows only the injected lifecycle actions. Pause calls `stop()`,
Start/Resume call `start()`, and Restart calls the authoritative
`GreyboxLevelRuntime.restartLevel(): void` exactly once before calling `start()`
to resume the stopped runtime. The UI never teleports the player or resets the
scene, death state, camera, input, or visuals itself.

Restart is synchronous and single-entry. A successful paused restart returns
directly to gameplay and requests pointer lock from the Restart button's user
activation. A failure returns to the paused boundary with status text. The
existing death/retry sequence remains level-owned and independent: death may
suspend input and release pointer lock without opening the pause menu. While
death owns disabled input, Escape, focus loss, and pointer-lock events cannot
enter Pause. Retry therefore completes deferred recovery into the still-playing
lifecycle instead of producing a paused UI over a re-enabled runtime. Death
Retry remains separate from the full-level Restart control.

The debug panel remains owned by `GreyboxLevelRuntime`.
`setDebugInteractionEnabled(false)` only suppresses its presentation behind
menus: the panel becomes hidden, inert, and `aria-hidden` while preserving the
player's F2 visibility preference for gameplay. Normal production builds still
omit diagnostics; `?debug=1` deliberately makes them available.

## Loading, credits, and ownership

The loading screen is indeterminate because the runtime has no asset progress
metric. The level is loaded but remains stopped, and a two-frame boot handoff
guarantees loading can paint before title. Simulation and gameplay input do not
start until Start. Credits
are imported from the repository-root `CREDITS.md` with Vite's raw-resource
support and inserted with `textContent`, so the in-game view cannot drift to a
manually maintained resource list and does not inject Markdown as HTML.

`GameFlowUI.dispose()` aborts its scoped DOM/global listeners, unsubscribes from
settings, stops active gameplay, disables input/debug interaction, releases
pointer lock, and removes its root. The application then disposes the
level-owned runtime before the session-owned input and renderer. UI transitions
allocate no Three.js resources and create no per-frame DOM work.
