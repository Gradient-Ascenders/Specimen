# Issue #26 — Sprint 1 Containment gate

This report is the release record for Issue #26. It separates reproducible build/deploy evidence from manual Chrome playthrough evidence so the gate is not marked complete on development-server behaviour alone.

## Release target

- Source branch: `chore/containment-sprint1-gate`
- Base revision: `fc9c9a8e602a247f0dd3741ce39c8087eac721c2`
- Public gate host: GitHub Pages, produced by `.github/workflows/deploy-containment-gate.yml`
- Assessment delivery remains the separately documented Moodle/LAMP archive process; the Pages URL is a public Sprint gate validation target, not a replacement for the final submission route.

## Automated gate

The deployment workflow uses the pinned Node/npm toolchain and runs, in order:

1. `npm ci`
2. `npm test`
3. `npm run archive` (which includes the production Vite build and archive validation)
4. GitHub Pages publication from `dist/`

A failed test, build, archive validation, Pages configuration step, or deployment blocks publication.

## Published-URL verification

Record these values from the successful workflow deployment before signing the manual gate:

- Published URL: **pending deployment run**
- Deployed revision: **pending deployment run**
- Archive SHA-256: **record from the validated local/archive run if required for assessment handoff**
- Chrome version: **pending manual verification**
- Verification date/time: **pending manual verification**
- Clean playthrough duration: **pending manual verification**
- Failure-heavy playthrough duration: **pending manual verification**
- Video evidence: **pending manual verification**

### Clean playthrough

From a fresh load at the published URL:

- [ ] Title screen renders and `Start trial` enters gameplay.
- [ ] Movement, camera look, sticky traversal, charged jump and slime shader response behave as expected.
- [ ] Room objectives advance in order through the complete Containment route.
- [ ] Bob/Goop switching and the authored pressure-plate/dissolve interactions remain readable.
- [ ] Checkpoint recovery returns to the correct forward checkpoint.
- [ ] The disposal/end sequence reaches the level-complete state.
- [ ] No blocker or severe softlock occurs.

### Failure-heavy playthrough

Exercise deliberate falls/deaths, repeated checkpoint recovery, pause/resume, body switching around puzzle interactions, and restart from the pause menu.

- [ ] Death/retry recovers without page refresh.
- [ ] Restart restores the initial trial state without page refresh.
- [ ] Re-entering rooms after recovery does not duplicate puzzle state or break progression.
- [ ] The level remains completable after the failure sequence.

## Restart and resource stability

Use the production URL with `?debug=1`, press `F2`, and record a warm baseline after the first complete render. Perform at least 10 restart/play cycles and compare the same diagnostics after each cycle.

The existing runtime diagnostics expose lifecycle/restart count, collider/surface counts, draw calls, triangles, GPU geometries/textures, active slime/controller state, checkpoint state, deaths/retries, and puzzle state. The runtime restart path resets level state in place; the renderer/animation loop are application-owned and are not recreated by `restartLevel()`.

For each sampled cycle verify:

- [ ] exactly one game canvas is present in the DOM;
- [ ] lifecycle restart count increments once per requested restart;
- [ ] collider/surface and registered slime counts return to the same baseline;
- [ ] GPU geometry/texture counts settle to the warm baseline rather than growing each cycle;
- [ ] draw-call/triangle counts settle to the same gameplay baseline;
- [ ] HUD/puzzle presentation is not duplicated;
- [ ] no duplicate input response, animation-speed increase, or other symptom of accumulated listeners/animation loops appears.

If Chrome DevTools exposes a stable GPU-memory figure on the test machine, record it as supporting evidence. Renderer object counts are the repository-owned comparison metric because browser GPU-memory reporting is implementation-dependent.

## Console and asset check

With DevTools Network `Preserve log` enabled and cache disabled:

- [ ] reload the published URL;
- [ ] confirm the document, JavaScript, CSS and content assets return 2xx;
- [ ] confirm no request targets `localhost`, `src/`, `node_modules/`, or an absolute filesystem path;
- [ ] confirm no unexplained Console errors or uncaught exceptions;
- [ ] confirm no asset 404s or filename-case failures.

Repeat the same check against an extracted `artifacts/specimen-production.zip` served from a nested path as described in `docs/production-deployment.md`.

## Sprint gate defects

Record discovered blockers as follow-up issues rather than expanding #26 silently.

| Defect | Severity | Follow-up | Gate impact |
| --- | --- | --- | --- |
| None recorded yet | — | — | Manual verification pending |

## Deferred polish / known limitations

- Level 1 final art remains out of scope for this gate.
- Level 2 switching and Etch remain out of scope.
- Master volume is stored by the UI but audio playback is not yet connected, as already disclosed in the current game-flow UI.
- The public GitHub Pages target exists to make the Sprint gate independently reachable. The confirmed assessment archive/submission process remains governed by `docs/production-deployment.md` and `docs/beta-requirements.md`.

## Credits / third-party resources

This issue introduces no gameplay asset, library, font, model, shader source, or other third-party runtime resource. The deployment workflow uses first-party GitHub Actions only; no credits-ledger entry is required for runtime content.

## Gate sign-off

Do not mark Issue #26 complete until the published deployment succeeds and the unchecked manual verification/evidence items above are filled with real observations. The PR may be opened before that point so a teammate can review the release machinery and report structure.
