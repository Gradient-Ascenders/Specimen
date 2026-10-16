# Production gameplay parity — 16 October 2026

Baseline: `origin/main` at `e53d27d` (merged PRs #200 and #201).
Branch: `fix/production-gameplay-parity`.

## Root cause and implementation

The ordinary production route did not import `CultivationLevelDebug`, which
contained the five-room authored scene, encounters, progression helpers and
in-game presentation as well as the test panel. `CultivationLevelRuntime` then
substituted its foundation composition whenever `debugAvailable` was false.
Existing later-level smoke coverage opened `?debug=1`, hiding this difference.

`CultivationLevelGameplay` now owns those gameplay dependencies and is imported
by the lazy-loaded Level 2 runtime in every build. The authored scene is always
constructed and entered through the existing recovery contract. Debug support
contains only the test panel. Preparation, lighting budgets, collision/surface
registration, dissolve targets, recovery ordering, characters and encounters
retain their existing implementation.

The complete source audit found no further authored-content gate in Levels 1
or 3: Level 1 always builds its production art; the main Level 3 factory always
requests the authored maintenance/transit route and texture bundle. Development
reference markers, collision overlays, test panels and flight recording remain
explicitly gated. Incomplete standalone harnesses were not enabled.

The audit also found ungated direct skip/rescue keys in Levels 1/2 and room
teleport keys in Level 3. These now require debug availability. The deliberate
`?debug=1` smoke journey still works. F1 remains available during ordinary play.
Normal remains the default graphics preset; Performance and explicit 0.75×
resolution retain their existing rendering and preparation behavior.

Browser acceptance intermittently reported an aborted Blackout texture stream
after successful decoding. The loader now finishes the compressed HTTP body
before native decompression. This retains the same prebaked bytes and async
decoder, with one temporary 1.18 MB compressed buffer. No textures or warmups
were removed.

## Packaging

The existing build/archive workflow is retained. Windows now uses native .NET
ZIP operations because Unix `unzip` is unavailable on this machine. Creation
uses canonical staging paths, actual forward-slash entry names and fixed ZIP
timestamps. The archive is extracted and every file compared byte-for-byte
with `dist/` before publication to `artifacts/`. The Unix workflow remains.
The local static smoke server sends content lengths and can extract the archive
on Windows. No new dependencies or third-party resources were added.

Final archive: `artifacts/specimen-production.zip`, 6,766,429 bytes, 79 files.
SHA-256: `7861ffcac249ab07ee57a9c394adb429216b7950d9ae6f6bc62585ab6eedbd7b`.
Its raw central-directory entries were checked for portable separators and
correct root placement. It contains the runtime chunks, Bob/Goop/Volt GLBs,
Blackout maps, fonts, audio, styles and brand assets. Cultivation's procedural
texture/material resources are emitted with its authored JavaScript.
Vite's `base: './'` is unchanged.

## Verification and evidence

The actual extracted ZIP is served at
`http://127.0.0.1:4173/group-folder/`, with no query parameters for the two new
acceptance journeys. Edge 155, hardware rendering, 640 × 360 viewport, DPR 1.
The observer only exposes the shipped composition root; it changes no flags or
gameplay implementations. Existing controller contracts stage room entry and
completion. This is not a full unassisted puzzle/combat playthrough.

All four final production browser smoke tests pass, including the preserved
plain startup and explicit-debug journeys. Both Normal and Performance 0.75×
no-query journeys verify:

- Authored objects, populated texture maps and prepared Bob/Goop assets.
- All five Level 2 rooms, three encounter systems, 754 registered colliders,
  503 textured meshes and 16 distinct mapped albedo textures.
- Level 3's authored maintenance bay, transit room and boss staging, with
  150 colliders, 230 textured meshes and nine mapped textures.
- Level 1 production art, 132 colliders and 20 mapped meshes. Other authored
  procedural shader textures are not counted by this conservative map probe.
- Character switching, movement/jump inputs, F1 on/off, restart in every level,
  final-lever release/Volt registration and the normal Level 3 handoff.
- Acid/dissolve systems and Level 3 electrical-system construction.
- No developer panels or recorder requests; skip/teleport keys ignored.
- No HTTP failures, aborted requests, escaped deployment paths, console errors,
  uncaught exceptions or WebGL errors.

Per-room production screenshots and JSON are in
`test-results/smoke/ProductionParity-*/`. Browser logs are in
`artifacts/production-parity-browser-final.log`; packaging logs and provenance
comparisons are under `artifacts/production-parity-*`.

Measured Level 2 startup (separate sequential runs, no concurrent unit suite):

| Mode | Construction | Retained startup preparation | Transition to entry UI |
| --- | ---: | ---: | ---: |
| Normal | 5.83 s | 49.38 s | 56.37 s |
| Performance, 0.75× | 9.86 s | 4.68 s | 15.65 s |

These are descriptive runs with different driver/cache histories, not a
controlled preset benchmark or a dev-versus-production performance comparison.
Ordinary production now pays the authored work previously available only on the
debug route. Allow loading to finish before the demonstration.

`npm run build`, `npm run validate:production` (79 files), `npm run archive`
and type checking pass. The native archive/production-validation rerun passes
all six tests. The full Node suite ran 873 tests: its initial result was 869
passes and four failures. The introduced ZIP adapter failure was fixed and its
six-test rerun passes. The remaining three failures are existing generator
provenance checks in `BobGateOneAsset`, `BobMorphAsset`, and `VoltModelAsset`:
Windows CRLF source bytes differ from the recorded LF hashes. Normalizing those
unchanged generators to LF matches the exact `origin/main` blobs; model geometry
and runtime GLB checks pass. These unrelated generator files/hashes were not
changed. The initial full suite is not claimed green.

The gameplay suite covers hazards, laser timelines, electrical targets, room
controllers, transitions, checkpoints, recovery, collision, character geometry,
lighting budgets and preparation ownership. Browser staging validates release
composition and rendering; it does not replace a human full playthrough or
qualification on the university's final host/GPU. No development screenshot
comparison or university-server deployment was performed.

## Deployment

1. Upload the generated ZIP to the university's assigned group directory.
2. Extract its contents so `index.html`, `assets/` and `brand/` sit directly in
   that directory, with no extra `dist/` or `site/` wrapper.
3. Open the assigned public URL normally, without `?debug=1`. Allow preparation
   to finish, and check the browser console/network on the actual host.

No Node server, server flags, URL changes or application backend are needed.
Only local commits are intended; no push or pull request is part of this task.

