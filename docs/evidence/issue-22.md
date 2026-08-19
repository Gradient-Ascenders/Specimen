# Issue #22 verification

Issue #22 adds the DOM/CSS loading, title, gameplay HUD, pause, settings,
restart-feedback, and credits surfaces around the existing grey-box harness.

## Automated checks

- TypeScript type-check passed through the repository's installed TypeScript
  7.0.2 compiler.
- The complete Node test suite passed: 42 tests, including flow subscriptions
  and restart capability, session settings, camera distance, focus-loss
  repeats, and input suspension.
- The production Vite build passed and emitted the relative-path `dist/`
  document, stylesheet, and JavaScript bundle.
- `git diff --check` passed.

The host's global `npm` launcher points to a missing user-level `npm-cli.js`.
The checks therefore used the Codex bundled Node 24 runtime to invoke the same
installed TypeScript, Node test runner, and Vite entry points directly. This is
an environment launcher limitation, not a project dependency or compile error.

## Dependency status

- Issue #19 is closed. Its deterministic puzzle/checkpoint reset work is
  present on `main`.
- Issue #23 is open, has no comments, and no matching lifecycle PR or remote
  branch is available. Restart acceptance is therefore blocked on its one
  authoritative lifecycle-owned operation.

The player Restart button is disabled through `restartAvailable: false` and
shows neutral build-availability text. It cannot enter the restarting state or
invoke the injected action until #23 supplies the lifecycle capability. The UI
still contains no debug-harness subsystem reset sequence.

## Manual and visual verification

The production preview was started from the generated build. Automated control
of the in-app browser was unavailable because the installed Browser plugin
rejected its own cached service helper as outside its configured trusted path.
Consequently, no screenshots or claims of completed interactive browser checks
are recorded in this change.

The following checks remain for a working browser session and Issue #23
integration:

- Capture Loading, Title, Gameplay HUD, Pause, Settings, and Credits at the
  representative narrow, square, standard, and wide desktop viewports.
- Exercise Start, repeated pause/resume, keyboard focus, pointer-lock loss,
  window blur/return, and every setting through mouse and keyboard.
- Verify clean production console/network output and nested relative-path
  deployment.
- After Issue #23 lands, change player/puzzle/hazard/elevator state and repeat
  the lifecycle restart at least ten times while monitoring listeners and
  renderer diagnostics.

## Resource and credits impact

The UI adds no dependencies, third-party assets, per-frame DOM allocation, or
Three.js resources. Credits render the canonical root `CREDITS.md` as safe text.
All UI/global listeners are owned by one abort controller and removed on
`GameFlowUI.dispose()`.
