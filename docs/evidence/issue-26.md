# Issue #26 — Containment deployment gate

Issue #26 is not complete. The reproducible pre-publication gate passes, but
the required human playthroughs and Moodle/LAMP publication evidence remain
outstanding. GitHub Pages is not a deployment target or acceptance-evidence
source for this issue.

## Verified now

### Environment and artifact

- Verification date: 21 August 2026, ending at approximately 13:52 SAST.
- Source: `chore/containment-sprint1-gate`, working tree based on
  `16615ac7cfb3c2bcb82e4af5819714260c82b5fe` with the review corrections in
  this change.
- Node.js: `24.19.0`. The exact `.nvmrc` patch version, `24.14.1`, was
  unavailable locally; the tested version satisfies the declared `24.x`
  engine.
- npm: `11.18.0`, matching `packageManager` and the declared `11.x`
  engine.
- Browser: Playwright MCP with Chrome for Testing `152.0.7977.8`, Linux
  x86_64, 1280 × 720 viewport.
- Final archive: `artifacts/specimen-production.zip`, 201,593 bytes.
- SHA-256:
  `b4223c25e29a809dd36d618e6368f7ffd6d2e0ab170e63ed2448142e27701d0d`.

### Build and archive

The following commands passed against the corrected working tree:

1. `npm ci` — installed 25 packages; audit reported 0 vulnerabilities.
2. `npm test` — 106 passed, 0 failed.
3. `npm run type-check` — passed.
4. `npm run build` — passed with Vite 8.2.1.
5. `npm run archive` — rebuilt and validated the production ZIP.
6. `unzip -Z1` and `unzip -t` — six entries, all integrity checks passed.
7. `diff -qr dist <extracted-group-folder>` — no differences.

The final archive contains exactly:

```text
README.md
assets/index-C4EX9ji3.css
assets/index-D4UfvHSV.js
index.html
start-server.ps1
start-server.sh
```

`index.html` and the three local-play helpers are at the archive root. There is
no enclosing `dist/` directory, source tree, `node_modules/`, package manifest,
TypeScript/Vite configuration, or project development script. Archive
generation now requires the helpers, rejects root-relative HTML references and
common source/configuration leakage, and prints the archive SHA-256.

The build retains the required Vite `base: './'`. Vite emitted its existing
non-blocking chunk-size warning: the minified JavaScript chunk is about
791.98 kB, above the default 500 kB warning threshold.

### Exact archive over nested-path HTTP

The final ZIP was extracted outside the repository beneath
`site/group-folder/`. Its parent was served with
`python3 -m http.server 4188 --bind 127.0.0.1`; neither Vite's development
server nor preview server was used.

The helper-inclusive final archive was loaded both through its packaged Bash
launcher and from the representative nested path:

- `http://127.0.0.1:4187/`;
- `http://127.0.0.1:4188/group-folder/?build=b4223c25`.

The only network requests were the nested-path document, hashed JavaScript,
and hashed CSS, all returning HTTP 200. No request used the server root,
`src/`, `node_modules/`, a filesystem path, another port, or an unexpected
host. Both final sessions reported 0 console errors. Headless Chromium emitted
four WebGL driver `ReadPixels` performance warnings per session while
Playwright captured the WebGL page; no application warning was reported. There
were no failed requests or 404 responses.

Normal production omitted the debug panel and entered gameplay with one
canvas, one game-flow root, one death screen, pointer lock on the canvas, and
only the gameplay panel visible.

### Packaged local launchers

`bash -n` passed for `start-server.sh`. The executable bit survived the Vite
copy, archive, and extraction. Running the extracted script with
`SPECIMEN_NO_BROWSER=1 bash ./start-server.sh 4187` started Python's static
server; HTTP requests for `/`, `/README.md`, and `/start-server.ps1` returned
200, and Playwright entered gameplay at the served root.

PowerShell is not installed in this verification environment, so
`start-server.ps1` was inspected but not executed. A Windows PowerShell smoke
test remains outstanding. Both launchers bind only to `127.0.0.1`, accept an
optional port, serve the directory containing `index.html`, and attempt to open
the default browser unless `SPECIMEN_NO_BROWSER=1` is set.

### UI, input, restart, and recovery

Playwright exercised the title screen, Settings, Credits sourced from
`CREDITS.md`, Start trial, gameplay HUD, Pause, Restart trial, game over, and
Retry. Keyboard movement changed Bob's position from
`-0.21, 0.46, -2.60 m` to `-0.21, 0.74, -2.26 m`; a charged Space release
reported a `5.69 m/s` launch at 14% charge; mouse movement changed camera
pitch from 18.0° to 22.9°.

Ten consecutive Pause → Restart trial cycles completed without a page
refresh. Each requested restart incremented the lifecycle counter exactly
once and returned to Room 1 spawn with reset jump/camera state and canvas
pointer lock. Three additional restart cycles followed room/death coverage.
The stale debug-panel room status found during review was fixed: after
teleporting to Room 5 it changed from the Room 5 message to
`Probe is at spawn.` on restart.

Two consecutive debug-triggered deaths reached game over and Retry restored
the Room 1 checkpoint, pointer lock, and gameplay. This verifies the automated
death/retry seam; it is not a failure-heavy full playthrough.

Debug checkpoint controls reached Rooms 2–5 and exposed the expected objective
and checkpoint for each room. Room 5 now displays the corrected current name,
`Free Goop!`.

### Restart and renderer/resource sanity

Every sampled state retained exactly:

- 1 canvas, game-flow root, death screen, debug panel, and HUD;
- 130 registered colliders and 130 registered surfaces;
- 2 persistent slime bodies and 1 active controller;
- 753 Three.js scene objects.

Room 1 began at 102 geometries, 2 textures, and 8 compiled programs. Geometry
and program counts rose when previously unseen gameplay, room, and death
presentation were rendered, as expected for lazy GPU upload/compilation. After
all rooms and the death presentation were warm, repeated death, room visit,
and restart checks remained stable at 206 geometries, 2 textures, and 12
programs. Room 1 settled back to 105 draw calls and 5,270 triangles after
restart. No sampled metric showed sustained post-warm growth.

The browser does not provide reliable application listener/subscription counts
or portable GPU-byte usage. Evidence against duplicate registration is
therefore limited to exact one-per-click lifecycle increments, singleton DOM,
stable scene/renderer counts, stable input response, and the passing lifecycle
tests (including ten restarts and repeated load/unload cleanup). A human should
still watch for animation-speed or duplicate-input symptoms during the
required playthroughs.

## Not yet verified locally

Playwright debug checkpoints are not a substitute for playing the authored
route. The following checks were not claimed:

- clean title-to-level-complete playthrough with keyboard and mouse;
- failure-heavy full playthrough that remains completable;
- intended and obvious wrong-order puzzle solutions;
- severe-softlock review across the full route;
- full level-complete/disposal transition;
- sustained performance on Chrome/Ubuntu lab hardware;
- manual observation for duplicate animation speed or input response;
- Windows execution of the packaged PowerShell launcher;
- playthrough duration, screenshot, or video evidence.

A team member must run both full playthroughs from the extracted archive over
ordinary HTTP and record only their actual observations.

## Blocked pending Moodle

The Moodle deployment submission/link is not yet available. Consequently, all
of the following remain externally blocked:

- uploading the production ZIP through Moodle;
- obtaining the department LAMP group-subdirectory URL;
- opening and completing the game at that published URL in Chrome;
- checking the published host's console, failed network requests, asset 404s,
  filename casing, and nested-path behavior;
- recording the published URL, deployed revision, published-host verification
  time, playthrough durations, screenshots, or video.

No deployment URL is recorded because none exists yet. GitHub Pages and other
hosts must not be substituted for the required Moodle → department-LAMP
process.

## Defects and follow-up

- No automated pre-publication blocker remains.
- The existing approximately 792 kB JavaScript chunk warning should be tracked
  as performance/bundle follow-up; it did not break this static archive gate.
- Older non-player-facing Room 5 comments and historical documentation still
  use the superseded name Etch. They were not swept into this issue.
- Human clean and failure-heavy playthroughs remain required before claiming
  the Containment acceptance criteria.

## Credits

No third-party runtime asset, library, model, texture, audio, shader source, or
adapted code was introduced by this review. The credits ledger does not require
an update.
