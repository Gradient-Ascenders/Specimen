# Opening movie

Ordinary Start plays the live 3D opening in **both development and production**.
The complete editable scene, laboratory, fracture animation and timeline remain
in `src/cinematics/`. `?opening=live` also explicitly selects this default.

The committed `src/assets/cinematics/opening.mp4` and its native HTML video
player remain an **opt-in backup** in development: open `?opening=mp4` and press
Start. Submission builds omit this video to reduce the ZIP size; an old
`?opening=mp4` link uses the live opening instead. To include the backup in a
production build, run `npm run build -- --mode opening-backup`. Vite then emits
the movie with a relative, hashed URL for subdirectory hosting. Ordinary Start
does not request the file. The backup does not render the live cinematic or
upload video frames into WebGL. The main menu remains live 3D in both modes.

## Loading and handoff

### Default live opening

The cinematic prepares its own scenes and real first view behind the initial
blackout. During visible playback, Level 1 starts just three low-priority
downloads (Bob and Goop models plus Goop's detail bank, about 1 MB combined).
GLB bytes remain encoded: no model parsing, world/geometry/texture construction,
shader compilation, GPU uploads, or gameplay rendering runs alongside the film.

The 51 KB detail bank is the only allowlisted CPU task: validate/prepare its plain
index data in a browser idle callback with at least 4 ms remaining. Files larger
than 64 KiB are excluded. No timeout forces it into a busy frame; unsupported
browsers keep bytes only. This work does not create geometry or change quality.
Demand uses independent index copies for each character. Skip, final preparation
and disposal cancel queued idle work; failed speculation falls back to normal
loading rather than interrupting the cutscene.

At the final fully painted blackout (or Skip), build Level 1 and perform its full
model and GPU preparation. Reuse downloaded bytes without a duplicate transfer.
The final `Preparing Level 1…` wait may therefore be longer; smooth visible
playback takes precedence over competing heavy preparation.

### Opt-in MP4 backup

The existing menu fades to black before its room resources are released. After
native video playback begins, this experimental path downloads assets at high
priority, builds the world, parses the models and performs the full shader,
geometry, shadow and transmission warm-up. Shader link/reflection caches are
resolved one program at a time; cold resource uploads use batches of at most
eight renderable objects, followed by the original combined transmission pass.
Warm-up yields for 33ms between cheap steps and 80ms after costly ones during
playback rather than submitting the whole queue at once. The video uses its own
media clock, not the game's main-thread frame delta.

Readiness does not end the movie early. When the movie ends (or Skip/Escape is
pressed), gameplay starts only once the full preparation and GPU fence finish.
If necessary, the final blackout says `Preparing Level 1…`. Skip releases the
video-period pacing delay; it never waits for the video file to download. Media
failure offers Retry or Skip; a gameplay loading failure offers Retry. Hidden
tabs pause the movie, and disposal releases the decoder and pending callbacks.

This backup removes real-time cinematic rendering and overlaps preparation, but
does not make individual model parses/driver calls preemptible. Target-hardware
playback and readiness still need playtesting; software-rendered CI is not a
hardware FPS guarantee.

## Re-export after visual/timing changes

Requirements: the project's npm dependencies, Playwright Chromium, and FFmpeg
with the `libx264` encoder. FFmpeg is an authoring tool, **not** a runtime/npm
dependency. Set `FFMPEG_PATH` if it is not on PATH.

```sh
npm run export:opening-movie -- --force
```

The exporter runs an isolated headless browser, renders each exact authored
timestamp, streams PNG frames into FFmpeg, then replaces the final asset only
after successful encoding. Hot reload is disabled for the capture server. A slow
exporting machine therefore takes longer to export, but does not record its lag
into the movie. Preview images go into ignored `artifacts/opening-movie-preview/`.

Output is 1920×1080, 30fps, H.264/yuv420p, CRF 20, two-second keyframes and
`+faststart` (metadata before media data for progressive playback). It is silent,
matching the current live intro; no new soundtrack or effects are synthesized.
The first 0.8s menu fade remains live; the exported source range is 0.8–54s, with
the final black frame included. `opening.json` records timing, size and SHA-256.
Commit the MP4 and JSON together when changing the source sequence.

The production smoke server sends `video/mp4` and supports single HTTP byte
ranges for seeking/progressive playback. A real deployment should serve MP4
with its normal static-file/range support; there is no external video service.

## Verification

```sh
npm test
npm run build -- --mode opening-backup
npm run validate:production
npx playwright test tests/smoke/OpeningMovie.spec.ts tests/smoke/OpeningGame.spec.ts --config playwright.smoke.config.ts
```

The movie tests cover real decoding and dimensions, a complete unaccelerated
playback with full background Level 1 preparation, delayed assets/final blackout,
corrupt-video retry, Skip, and restart. Default live coverage verifies that no
backup video downloads or Level 1 GPU jobs run during the visible tour, as well
as complete readiness after Skip/final fade. Inspect native frame/drop counts as
diagnostics, not as assessment-PC performance sign-off.

Earlier MP4-backup check, 2026-10-17: isolated Linux Chromium/SwiftShader at
640×360 prepared Level 1 at 37.11s of the 53.23s movie, including all nine
lighting configurations and 23 first-use resource owners. The native counters recorded 1,597 frames,
129 dropped, and zero default-framebuffer clears during playback. An initial
large-batch implementation recorded 202 dropped frames in the same harness
but finished loading earlier (22.82s). These are illustrative single runs, not a
controlled hardware benchmark: pacing trades some loading headroom for smaller
stalls, and the software renderer still dropped frames. Do not describe this as
zero-lag or assessment-PC performance approval.
