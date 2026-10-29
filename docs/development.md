# Development and delivery

Use the Node version in `.nvmrc`, npm from `package.json`, and `npm ci`.
The root [README](../README.md) covers setup; [CONTRIBUTING](../CONTRIBUTING.md)
covers review and commit conventions.

## Checks

```sh
npm run type-check
npm test
npm run check:generated-assets
npm run build
npm run validate:production
npx playwright install chromium
npm run test:smoke
```

`build` includes TypeScript checking. Generated-asset checks compare checked-in
banks, geometry and provenance against their sources. Keep the curated unit
suite within its 500 expanded-case cap and replace overlapping coverage when
adding regressions.

Smoke tests serve the build at `/group-folder/` with one software-rendering
worker. `npm run test:integration` runs longer graphics, HUD, audio and fallback
journeys. `npm run test:browser` rebuilds and runs `tests/browser/`; target the
relevant specs when investigating a narrower change. Keep browser reports,
traces, screenshots and logs in ignored output directories.

PR CI runs generated assets, units and two smoke shards; the required
`Production smoke` aggregate needs both shards. Production integration adds
nightly/manual Chromium journeys and Firefox startup. Submission CI builds its
exact revision and tests the extracted ZIP before publishing an artifact.
These workflows do not deploy the game or establish hardware performance.

## Packaging and static hosting

```sh
npm run archive
SPECIMEN_SMOKE_ARCHIVE=artifacts/specimen-production.zip npm run test:smoke
```

The archive contains the contents of `dist/`, with `index.html` at its root.
Upload those contents to the host's group directory, retaining `assets/`,
`brand/` and `build-manifest.json`. Do not add an enclosing `dist/` directory.
A ZIP upload publishes the game only if the host extracts it. Relative paths
support hosting under a subdirectory; verify the confirmed public URL.

To serve an extracted archive locally, use
`scripts/build/start-production-server.sh` or the matching PowerShell script.
They extract to a temporary directory and serve `/group-folder/`.

Check the deployed title, settings, every level, transitions, retry/restart,
ending/credits, browser console and asset requests. Repeat on assessment
hardware for frame pacing and memory stability. Automation and software WebGL
are separate from a complete human playthrough and hardware acceptance.

## Authoring and diagnostics

| Folder | Purpose |
| --- | --- |
| `scripts/assets/` | Reproduce bundled geometry, textures, LODs and lighting inputs. |
| `scripts/audio/` | Import sound packs and prepare music. |
| `scripts/blender/` | Export/register room authoring data and build Blender studios. |
| `scripts/build/` | Validate, archive and serve production files. |
| `scripts/cinematics/` | Export the optional opening movie. |
| `scripts/diagnostics/` | Capture views and profile loading, rendering and gameplay. |
| `scripts/lib/` | Shared offline helpers. |

`node scripts/diagnostics/benchmark-level-one-loading.mjs` accepts CLI options such as `--url` and `--passes`.
`node scripts/diagnostics/benchmark-level-two-performance.mjs` uses `SPECIMEN_CDP_URL` to connect to a hardware
Chrome debug endpoint. Compare matched builds, settings, viewport and hardware
without concurrent GPU workloads.
`scripts/diagnostics/performance-budgets.proposed.json` contains planning targets,
not approved requirements. Performance qualification consumes explicit evidence
and budgets; do not treat a proposed file as hardware acceptance.

## Cinematic capture

Open `?trailer=opening` or `?trailer=goop` for separate capture scenes. After
preparation, Play starts playback, Space pauses, R replays and H toggles the
controls/timeline. Switching tabs pauses playback.

Normal builds use the live 3D opening and omit the optional MP4 backup. To
include it, run `npm run build -- --mode opening-backup`; `?opening=mp4` opts
into movie playback. Re-export with `node scripts/cinematics/export-opening-movie.mjs --force`
using Playwright Chromium and FFmpeg with libx264 (`FFMPEG_PATH` can override its
location). Keep `src/assets/cinematics/opening.mp4` and `opening.json` together.
The movie is a silent visual backup; its export metadata records dimensions,
timing and hash. Test default live playback and the explicit backup separately.
