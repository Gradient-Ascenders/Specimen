# Issue #23 verification

## Implementation

- Added a guarded lifecycle state machine and a concrete owner for the current
  Level 1 grey-box runtime.
- Moved level construction, update/render delegation, restart ordering, listener
  ownership, and permanent disposal out of `main.ts`.
- Added one authoritative `GreyboxLevelRuntime.restartLevel(): void` path. It
  reuses the existing Issue #19 puzzle/checkpoint reset APIs and restores player,
  hazard, elevator, camera, visual, and input transients in a deterministic order.
- Kept the renderer, canvas, input object, and single animation loop
  application-owned. Restart is in-place and does not recreate any of them.
- Extended the existing grey-box panel with lifecycle, restart, timing, renderer,
  GPU resource, player, checkpoint, puzzle, laser, elevator, and camera data.
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
- `src/puzzle/ElevatorTestRig.ts`
- `tests/LevelLifecycle.test.ts`
- `tests/CameraRig.test.ts`
- `docs/level-lifecycle.md`
- `docs/evidence/issue-23.md`

No dependency or third-party resource was added, so `CREDITS.md`, `package.json`,
and the lockfile are unchanged.

## Automated verification

- Direct TypeScript check with the bundled Node runtime: passed with no errors.
- Direct Node test runner: passed all 39 tests, including six lifecycle tests and
  the new camera-reset coverage.
- The lifecycle tests cover transition order, duplicate load/start protection,
  reentrant restart protection, ten repeated restarts, repeated load/unload
  cleanup, idempotent disposal, rejected post-disposal operations, and restart
  failure state.

- `npm run type-check`, `npm test`, and `npm run build` could not start because
  the user-level npm launcher points at a missing
  `AppData/Roaming/npm/node_modules/npm/bin/npm-cli.js` (`MODULE_NOT_FOUND`). No
  npm-script pass is claimed.
- The equivalent repository tools were invoked directly with the bundled Node
  24.19.0 runtime:
  - `node node_modules/typescript/bin/tsc --noEmit`: passed;
  - `node --test tests/*.test.ts`: 39 passed, 0 failed;
  - `node node_modules/typescript/bin/tsc`, followed by
    `node node_modules/vite/bin/vite.js build`: passed.
- Vite 8.2.1 transformed 42 modules and produced `dist/index.html`, CSS, and a
  687.02 kB JavaScript bundle (171.67 kB gzip). Vite retained the repository's
  existing warning that the JavaScript chunk exceeds 500 kB.
- `git diff --check`: passed with no whitespace errors.

## Browser and production evidence

- Served the production `dist/` over HTTP with Vite preview at
  `http://127.0.0.1:4173/`.
- HTTP verification returned 200 for the root document and 200 for the generated
  687,027-byte JavaScript asset.
- Interactive browser verification was blocked before navigation because the
  available in-app browser rejected its own `browser-service.mjs` dependency as
  outside a configured trusted code path. The implementation therefore has no
  claimed manual movement/puzzle/elevator interaction, console inspection, or
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
