# Game flow UI

Issue #22 wraps the grey-box runtime in one DOM/CSS application flow without
replacing the existing harness. `GameFlowUI` owns the UI elements, global UI
listeners, focus changes, state subscriptions, and explicit transitions:

```text
loading -> title -> playing <-> paused -> restarting
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
- The mouse orbits the camera while the canvas owns pointer lock.
- **Escape** pauses gameplay. Escape from settings or credits returns to the
  parent menu; Escape from pause resumes where browser activation permits.
- **R** and **F** remain development-harness controls, not player flow actions.

Entering any full-screen menu disables `Input`, clears held, pressed, released,
and pointer-delta state, then releases pointer lock. Resume enables an already
cleared input boundary before requesting pointer lock from the user action. A
browser-driven pointer-lock loss while playing also enters pause. Window blur
clears input and pauses the flow; a later `Loop` focus event may resume frame
scheduling, but fixed gameplay remains gated unless the flow state is
`playing`.

## Session settings

`GameSettings` owns one in-memory model for the application session. It is not
recreated by menu transitions or a future level restart. Changes apply
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

`GameFlowUI` knows only the injected `GameFlowActions.restartLevel()` contract.
It serializes invocation so repeated activation cannot overlap, shows an
indeterminate restarting surface, and returns to pause for an explicit Resume.
It does not teleport the player or reset puzzles, hazards, elevators, camera,
or visuals.

Issue #23 remains open with no available lifecycle implementation at the time
of Issue #22 integration. `main.ts` therefore sets `restartAvailable: false`;
the player control is disabled with neutral build-availability text and never
enters `restarting`. When #23 lands, replace the no-op injected action with its
authoritative lifecycle operation and set that capability to true. The debug
panel's probe-reset action remains a development harness and is not the player
Restart implementation.

`main.ts` subscribes to flow state solely to coordinate the development panel.
Outside `playing`, the panel is `hidden`, `inert`, and `aria-hidden`; in
`playing`, it remains fully usable. Shutdown explicitly unsubscribes before UI
disposal. If an asynchronous lifecycle restart later settles after disposal,
the UI skips all post-await status, model, focus, and action updates.

## Loading, credits, and ownership

The loading screen is indeterminate because the runtime has no asset progress
metric. A two-frame boot handoff guarantees it can paint before title. Credits
are imported from the repository-root `CREDITS.md` with Vite's raw-resource
support and inserted with `textContent`, so the in-game view cannot drift to a
manually maintained resource list and does not inject Markdown as HTML.

`GameFlowUI.dispose()` aborts its scoped DOM/global listeners, unsubscribes from
settings, disables input, releases pointer lock, and removes its root. UI
transitions allocate no Three.js resources and create no per-frame DOM work.
