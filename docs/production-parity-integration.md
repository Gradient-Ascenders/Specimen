# Production parity integration — 16 October 2026

This updates `fix/production-gameplay-parity` from the LAMP-working implementation
(`662efad`, `852ac20`) to main `11456d2b131b6832d1b15f7e58cf279ce4b7abdd`
(PRs #202 and #203). The user confirmed that the earlier production ZIP was
successfully deployed and manually tested on the university LAMP server.
The integrated ZIP requires its own final host qualification; that earlier
confirmation is not a claim that the new package has been deployed.

## Integration decisions

The merge had three content conflicts:

- `CultivationLevelRuntime`: retain unconditional production-authored gameplay,
  pass main's baked asset source to the scene, and require that source in both
  the TypeScript options and runtime constructor guard regardless of debug mode.
- `LevelTwoPreviewScene`: retain its released five-room role while extending
  main's `CultivationAssetOwner`, which supplies baked inputs before material
  field initializers run. Remove the obsolete development-only root metadata.
- `BlackoutMaintenanceMapData`: reuse main's shared `readGzipResponse`, which
  finishes the HTTP body before native decompression and preserves cancellation.

An automatic merge in `main.ts` still left the new Cultivation bake loader behind
`debugAvailable`. It is now unconditional, alongside the always-loaded level
runtime; only the developer UI import remains conditional. Missing/corrupt baked
assets fail preparation rather than silently substituting foundation gameplay.

Main's stage-specific optional audio preload, optional Goop/Volt detail banks,
graphics/resource policies, prewarm behavior, lighting budgets and gameplay are
retained. The default is main's Minimum hardware profile with Normal graphics;
Standard and the extra Performance cap remain available. The original authored
content/debug separation and production shortcut gates are retained.

## Exact-byte provenance on Windows

The three earlier provenance failures were caused by Git converting committed
LF Python sources to CRLF during Windows checkout. The current generator bytes,
with only CRLF changed back to LF, match the exact committed blobs and approved
validation reports. `.gitattributes` now pins the Bob/Volt Python sources to LF.
The new generated acid-noise TypeScript file also has an LF policy because its
reproducibility check compares the entire generated text byte-for-byte.

The provenance correction changes no approved models, generator algorithms,
validation digests or binary resource bytes. Hash assertions remain strict. Blackout maps,
Cultivation bake, Goop/Volt detail banks and acid noise all reproduce exactly.

## Automatic submission handoff

`.github/workflows/submission-build.yml` does the required packaging work: a
push to `main` checks out the event revision, installs locked versions, runs
unit tests, builds and byte-validates the production archive, smoke-tests the
extracted ZIP under `/group-folder/`, uploads the actual ZIP without another
ZIP wrapper and writes its download URL/hash to the summary.
The production integration workflow runs the production-parity regressions
after the merge to `main`; `npm run test:smoke` remains the fast extracted
archive release gate.

The latest existing Linux run for the integrated main baseline succeeded:
[Submission build 38833558657](https://github.com/Gradient-Ascenders/Specimen/actions/runs/38833558657).
Unit, archive, nested smoke, artifact upload and summary steps all passed.
It published non-expired artifact `specimen-11456d2b131b.zip` (ID 12017534533).
At the time of this integration, the baseline's six combined browser journeys
took 8m38s. The current workflow now separates the fast release smoke from
those longer production-integration journeys; the earlier successful run
remains baseline evidence.

## Integrated local validation

- Full Node suite: 923/923 passed with two workers. After adding the required-assets
  regression, the four Cultivation runtime tests also passed. The previous
  generator-hash failures are resolved without changing their assertions.
- Type checking, production build/archive, production validation (82 files) and
  the complete generated-assets reproducibility command passed.
- Three no-query production-parity journeys passed against the extracted ZIP at
  http://127.0.0.1:4173/group-folder/ in pinned Chromium 149 with SwiftShader:
  Minimum hardware/Normal (0.75 scale), Standard/Normal (1.0 effective DPR), and
  Standard/Performance with explicit 0.75 pixel-ratio cap. Each covers all three
  levels, switching, movement/jump inputs, F1, restart, production debug-key
  rejection, five authored Level 2 room captures and final-lever Volt handoff.
- Level 2 has 754 colliders, 503 mapped meshes, 16 mapped textures and all 137
  baked repairs in each mode; the real authored-assets binary is requested.
  Level 3 has 150 colliders, 230 mapped meshes and nine mapped textures.
  Every ordinary-production journey records zero failed requests, HTTP/console
  errors, uncaught exceptions or WebGL errors; no debug modules are requested.
- Screenshots were visually inspected. JSON, screenshots and traces are generated
  under test-results/smoke/. Logs and an aggregate content summary are under
  artifacts/parity-integration-* (ignored, not source-controlled).

Integrated archive: artifacts/specimen-production.zip, 12,851,989 bytes, 82 files.
SHA-256: f78843a8c8e168ce47a62e987940990f4ae85cfb1d9c634b941adf7088bcbc09.
The archive's entries and decompressed bytes match dist/ exactly. index.html,
assets/ and brand/ are directly at its root, with relative Vite URLs preserved.

Browser progression is staged through existing controller/recovery contracts;
this is not an unassisted human puzzle playthrough. Software rendering proves
correctness, not assessment-GPU frame-rate budgets. The integrated package has
not been deployed to the university host during this task. New PR CI will run
on publication; no claim is made that it has already passed.

The complete extracted-archive Chromium/SwiftShader smoke suite passed all nine
tests in 21.8 minutes, within the existing 25-minute PR smoke-step budget. This
includes optional-detail fault recovery, both F1 journeys, staged audio loading,
all three no-query profile journeys, and the preserved plain/debug smoke tests.
No workflow change was necessary.
