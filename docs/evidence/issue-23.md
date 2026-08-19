# Issue #23 verification

## Implementation

- Added a guarded lifecycle state machine and a concrete owner for the current
  Level 1 containment teaching runtime.
- Moved level construction, update/render delegation, restart ordering, listener
  ownership, and permanent disposal out of `main.ts`.
- Added one authoritative `GreyboxLevelRuntime.restartLevel(): void` path. It
  restores current player, containment-scene, death/retry, camera, visual, and
  input transients in a deterministic order.
- Kept the renderer, canvas, input object, and single animation loop
  application-owned. Restart is in-place and does not recreate any of them.
- Extended the current containment debug panel with lifecycle, restart, timing,
  renderer, GPU resource, player, movement, teaching-surface, and camera data.
  The panel is hidden by default, toggled with `F2`, absent from production by
  default, and deliberately available for production diagnosis with `?debug=1`.

## Files changed

- `src/levels/LevelLifecycle.ts`
- `src/levels/GreyboxLevelRuntime.ts`
- `src/main.ts`
- `src/core/Input.ts`
- `src/render/BlobFacing.ts`
- `src/render/CameraRig.ts`
- `src/levels/GreyboxCollisionScene.ts`
- `src/levels/ContainmentTeachingScene.ts`
- `src/puzzle/ElevatorTestRig.ts`
- `tests/Input.test.ts`
- `tests/LevelLifecycle.test.ts`
- `tests/CameraRig.test.ts`
- `docs/level-lifecycle.md`
- `docs/evidence/issue-23.md`

No dependency or third-party resource was added, so `CREDITS.md`, `package.json`,
and the lockfile are unchanged.

## Latest-main integration

- Merged `origin/main` at `64d3047` into `feat/level-lifecycle` with normal Git
  merge history.
- Resolved semantic conflicts in `src/core/Input.ts`,
  `src/levels/ContainmentTeachingScene.ts`,
  `src/levels/GreyboxCollisionScene.ts`, `src/main.ts`, and
  `tests/Input.test.ts`. The bootstrap remains small and application-owned while
  the current level composition stays lifecycle-owned.
- Preserved main's newer death/retry sequence and screen, slime burst, deferred
  spawn recovery, jump buffering and cancellation, charged jump, sticky-detach,
  landing rebound, vent traversal, containment layout, movement tuning, debug
  panel, documentation, and tests. The older puzzle/laser/elevator harness was
  not resurrected.
- Integrated death/retry into the level resource set without adding another
  full-level restart API: death suspends gameplay, Retry performs the deferred
  recovery, and panel/debug reset continues to call
  `GreyboxLevelRuntime.restartLevel()`.

## Automated verification

- Direct TypeScript check with the bundled Node runtime: passed with no errors.
- Direct Node test runner: passed all 63 tests, including newer main's
  death/retry, deferred recovery, slime burst, movement, and jump-buffer tests;
  six lifecycle tests; four input boundary tests; and camera-reset coverage.
- The lifecycle tests cover transition order, duplicate load/start protection,
  reentrant restart protection, ten repeated restarts, repeated load/unload
  cleanup, idempotent disposal, rejected post-disposal operations, and restart
  failure state.
- The input regressions cover restart (`KeyR`) and movement (`KeyW`) keys:
  lifecycle state clearing cannot allow an orphan repeat to reactivate either
  action, while keyup followed by a fresh non-repeat keydown still works.

- The repository npm scripts all completed successfully:
  - `npm run type-check`: passed;
  - `npm test`: 63 passed, 0 failed;
  - `npm run build`: passed.
- The same TypeScript, test, and Vite tools were also invoked directly earlier
  during conflict resolution and passed. The previously observed user-level npm
  launcher problem did not reproduce in this final verification.
- Vite 8.2.1 transformed 30 modules and produced `dist/index.html`, a 5.31 kB
  CSS asset (2.04 kB gzip), and a 651.99 kB JavaScript bundle (163.30 kB gzip).
  Vite retained the repository's
  existing warning that the JavaScript chunk exceeds 500 kB.
- `git diff --check`: passed with no whitespace errors.

## Browser and production evidence

- Served the production `dist/` over HTTP with Vite preview at
  `http://127.0.0.1:4173/`.
- Post-merge HTTP verification returned 200 for the root document, 200 for the
  generated 651,992-byte JavaScript asset, and 200 for the generated 5,313-byte
  CSS asset.
- Interactive browser verification remained blocked before navigation because
  the available in-app browser rejected its own `browser-service.mjs` dependency
  as outside a configured trusted code path. The implementation therefore has no
  claimed manual movement/containment interaction, console inspection, or
  renderer before/after observation from this environment.
- The automated lifecycle test does execute ten consecutive running restarts and
  proves that they produce exactly ten reset hooks, ten stop hooks, eleven total
  start hooks, and only one load hook. Repeated load/start/unload coverage proves
  one cleanup hook per cycle. This is lifecycle orchestration evidence, not a
  substitute for real WebGL/GPU measurements.

## Limitations

- The implementation deliberately supports the current Level 1 grey-box only;
  multiple production levels and a general scene framework remain out of scope.
- In-place restart keeps static level GPU resources alive. Permanent `unload()`
  is the boundary that detaches the level and disposes its owned GPU resources.
- Real-browser ten-cycle gameplay manipulation, console/404 inspection, and GPU
  geometry/texture count comparison remain deferred because of the browser-tool
  trust-path failure above.
