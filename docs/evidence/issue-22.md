# Issue #22 verification

Issue #22 adds the DOM/CSS loading, title, gameplay HUD, pause, settings,
restart, and credits flow around the current lifecycle-owned containment level.

## Latest-main integration

- Merged `origin/main` at `eac22fd`, which includes the completed Issue #23
  lifecycle plus current death/retry, deferred recovery, slime burst, movement,
  jump buffering, sticky-wall, landing rebound, camera, containment, diagnostics,
  tests, and documentation.
- Resolved textual conflicts in `src/main.ts`, `src/core/Input.ts`, and
  `docs/runtime-input.md` semantically. `main.ts` remains a small application
  bootstrap; current main's `GreyboxLevelRuntime` remains the containment owner;
  and the input boundary retains both menu suspension and the orphan-repeat /
  jump-cancellation behavior.
- The older puzzle/laser/elevator harness was not restored to the active runtime.

## Lifecycle and restart integration

- Loading constructs the runtime but leaves it stopped under Loading and Title.
- Start and Resume call `GreyboxLevelRuntime.start()`; Pause calls `stop()`.
- Restart from Pause calls `GreyboxLevelRuntime.restartLevel(): void` exactly
  once, then calls `start()` and returns directly to gameplay. No subsystem
  reset sequence exists in the UI or application bootstrap.
- The current death/retry sequence remains level-owned. Its intentional input
  suspension and pointer-lock release do not trigger the pause flow, and the UI
  does not override its input state when resuming after focus loss.
- `GreyboxLevelRuntime.setDebugInteractionEnabled()` suppresses the level-owned
  panel behind menus without exposing its DOM to `GameFlowUI`. Hidden tools are
  `hidden`, `inert`, and `aria-hidden`; production availability remains
  development-only by default or deliberate through `?debug=1`.

## UI and settings

- Full-screen loading, title, pause, settings, credits, and restart states are
  mutually exclusive; the minimal HUD appears only during gameplay.
- Focus targets use native buttons, ranges, checkbox, headings, labels, and
  status regions. Escape pauses/resumes or returns from a submenu.
- `GameSettings` retains sensitivity, vertical inversion, camera distance, and
  master volume for the application session. Camera settings apply immediately
  through public `CameraRig` APIs and survive restart. Master volume is stored
  honestly but no audio system consumes it yet.
- Credits import canonical `CREDITS.md` and render it through `textContent`.

## Automated verification

- `npm run type-check`: passed.
- `npm test`: 75 passed, 0 failed. The suite includes current-main death,
  movement, lifecycle, input, and rendering tests plus Issue #22 flow,
  subscription, settings, camera-distance, menu-suspension, and lifecycle
  coordination coverage.
- `npm run build`: passed with Vite 8.2.1; 34 modules transformed. Output was a
  668.65 kB JavaScript asset (167.51 kB gzip) and a 9.03 kB stylesheet (3.01 kB
  gzip). The existing warning for a JavaScript chunk over 500 kB remains.
- `git diff --check`: passed.
- Repository-wide conflict-marker search: passed.

## Production and browser evidence

- Served the final `dist/` with Vite preview at `http://127.0.0.1:4174/`.
- HTTP verification returned 200 for the 846-byte root document, 200 for the
  generated 668,659-byte JavaScript asset, and 200 for the generated 9,034-byte
  CSS asset.
- Normal production diagnostics remain unavailable unless `?debug=1` is
  supplied by the bootstrap.
- Interactive browser verification was blocked before navigation because the
  in-app browser rejected its own `browser-service.mjs` dependency as outside a
  configured trusted code path. No screenshots or manual interaction claims are
  made here.

## Outstanding manual verification

Use a working browser session after code review to verify title/start,
pause/resume, pointer lock and focus loss, settings persistence, full and
repeated Restart, death/retry coexistence, keyboard navigation, target viewport
layouts, state screenshots, and console/network output.

## Resource and dependency impact

The UI adds no package dependency, third-party asset, per-frame DOM allocation,
or Three.js resource. One abort controller owns UI/global listeners and
`GameFlowUI.dispose()` removes them and its settings subscription. The level
runtime still owns and disposes the current scene, player, death flow,
diagnostics, subscriptions, and collision resources; the application owns the
single renderer, input instance, camera rig, and loop.
