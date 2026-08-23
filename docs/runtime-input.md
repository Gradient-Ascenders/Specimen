# Runtime and input foundation

Issue #10 establishes the deterministic browser runtime used by later movement,
collision, camera, and puzzle systems.

## Runtime order

Each browser animation frame follows this order:

1. Receive the animation timestamp from `WebGLRenderer.setAnimationLoop`.
2. Measure the real frame delta.
3. Clamp that delta to `100 ms` so a long browser stall cannot advance the game
   by an unbounded amount.
4. Add the clamped time to the fixed-step accumulator.
5. Run zero or more gameplay updates at a fixed `1 / 60 s` step, with a hard
   maximum of six simulation steps in one rendered frame.
6. If a custom configuration still leaves one or more whole simulation steps
   behind after the hard cap, drop those whole steps and retain only the
   interpolation remainder. This prevents a simulation backlog from carrying a
   spiral-of-death into later frames.
7. Render exactly once for the browser frame. Rendering is therefore independent
   from the number of fixed gameplay updates.

The loop exposes an interpolation alpha (`accumulator / fixedStep`) for later
visual interpolation, but the grey-box harness does not need interpolation yet.

### Constants

| Constant | Value | Reason |
| --- | ---: | --- |
| Fixed gameplay step | `1 / 60 s` | Stable movement and physics integration |
| Maximum accepted frame delta | `0.1 s` | A tab switch/debug stall cannot teleport simulation state |
| Maximum simulation steps per frame | `6` | Bounds catch-up work before rendering continues |

Window blur and document visibility loss pause the runtime and clear its timing
accumulator. Resume starts from a fresh animation timestamp instead of trying to
simulate wall-clock time that passed while the player was not active.

## Input action map

Gameplay consumers query `InputAction` names and do not inspect raw browser key
codes.

| Action | Default binding |
| --- | --- |
| `moveForward` | `W` |
| `moveBackward` | `S` |
| `moveLeft` | `A` |
| `moveRight` | `D` |
| `jump` | `Space` |
| `switchSlime` | `Tab` |
| `aimAbility` | Right Mouse Button |
| `fireAbility` | Left Mouse Button while aiming |
| `debugReset` | `R` |
| `debugTestRecovery` | `F` |

Mouse ability actions are accepted only while the gameplay canvas owns pointer
lock. Right-click context-menu suppression is attached only to that canvas and
is removed when `Input` is disposed. Pointer movement is collected separately
while the gameplay canvas owns pointer lock. The
third-person camera consumes the accumulated relative movement before
`endFixedUpdate()` clears it; browser events remain isolated inside `Input`.

Consumers use:

- `isDown(action)` for held state;
- `wasPressed(action)` for the first fixed update after an action is pressed;
- `wasReleased(action)` for the first fixed update after an action is released.

`endFixedUpdate()` clears only transient pressed/released state and pointer
movement; held actions remain active.

### Focus loss and pointer lock

- Clicking the gameplay canvas requests pointer lock.
- While locked, relative mouse displacement updates camera yaw and pitch; it is
  not scaled by frame time.
- On ordinary ground, WASD is resolved from the camera's horizontal basis.
- Pointer displacement is consumed by the fixed update when one runs, and by a
  render-only frame otherwise. This keeps look responsive above 60 Hz without
  scaling mouse sensitivity by either render or simulation delta time.
- Escape/browser pointer-lock release is observed through
  `document.pointerLockElement`. Issue #22's `GameFlowUI` converts a lock loss
  during active gameplay into the single paused state.
- Window blur or document visibility loss clears all active/held/transient input
  state. This prevents a key released outside the page from remaining stuck.
- Focus loss does **not** synthesize release actions, so losing focus cannot
  accidentally trigger release-driven gameplay such as a charged jump.
- `Input.setEnabled(false)` is the application-menu suspension boundary. It
  clears held and transient state, ignores mapped activation and pointer motion,
  and refuses pointer-lock requests until re-enabled. A key held across that
  boundary cannot reactivate gameplay until key-up followed by a fresh keydown,
  so Resume cannot replay stale input. The held key's boundary-crossing keyup is
  also prevented from activating the menu control that received focus during
  Pause; keys pressed deliberately after the menu opens remain native UI input.
  Native menu controls remain free to consume Space and other keyboard input.
- A repeated keydown with no corresponding active initial keydown is ignored.
  This covers the browser-repeat orphan left when blur or visibility loss clears
  an active key before the physical key is released. The next fresh non-repeat
  keydown still activates normally and no release action is synthesized.
- The boundary reports that action state was cleared until the next fixed
  update, allowing short-lived retained intent such as the landing jump buffer
  to be cancelled explicitly.

Issue #22 coordinates this boundary through the current level lifecycle. The
runtime is loaded but stopped under Loading and Title. Start/Resume call
`GreyboxLevelRuntime.start()`; Pause calls `stop()`; player Restart calls the
single `restartLevel()` operation and then `start()`. Menus may always disable
input, but only the runtime start hook re-enables it. This distinction preserves
the death sequence's intentional input suspension and prevents UI state from
overriding level-owned recovery behavior.

## Typed event contracts

`EventBus<Events>` provides typed `on`, `off`, `emit`, and `clear` operations for
**discrete cross-system transitions**. No concrete game event is emitted by this
issue because the current grey-box harness has no justified cross-system event
boundary yet.

Continuous state such as movement input should be queried directly rather than
broadcast every fixed update. Later systems can define an event map for events
such as impacts, surface changes, checkpoints, or level completion when those
boundaries actually exist.

## Manual verification for issue #10

1. Run the grey-box harness and verify `R` and `F` still operate the probe through
   named actions rather than raw key handling in `GreyboxTestPanel`.
2. Hold `W`, remove focus from the game, return, and confirm the runtime panel
   reports `held actions: none`.
3. Click the gameplay canvas and confirm pointer lock reports `locked`; press
   Escape and confirm it returns to `unlocked`.
4. Create a long frame (for example by pausing on a DevTools breakpoint), resume,
   and capture the runtime diagnostics showing a large raw delta but a clamped
   delta no greater than `100 ms`, with no more than six fixed steps.
5. Exercise low/normal/high refresh rendering conditions. Rendering frequency may
   change, while the fixed gameplay step remains `16.67 ms`.
6. Run the production build and confirm there are no new console errors or asset
   404s.
