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

`type-check` checks the game plus all TypeScript tests, helpers, offline scripts
and Playwright configs through `tsconfig.tooling.json`. Shared JavaScript CI and
diagnostic utilities opt into checking with `@ts-check`. `build` checks game types. Generated-asset checks compare checked-in
banks, geometry and provenance against their sources. Keep the curated unit
suite focused and replace overlapping coverage when adding regressions.

Tests are grouped by purpose. Unit tests live under `tests/unit/<domain>/`;
Playwright projects select the matching `tests/browser/<suite>/` directories.
`tests/helpers/` and `tests/fixtures/` hold shared setup and active test inputs.

| Suite | Command after building | Execution policy |
| --- | --- | --- |
| PR startup and menus | `npm run test:smoke -- --grep-invert @extended` | Three cases across two one-worker shards when browser inputs change. |
| Extended smoke | `npm run test:smoke -- --grep @extended` | Five default/profile/multi-level journeys, nightly/manual in two shards. |
| All production and menus | `npm run test:smoke` | Submission gate and local full smoke. |
| Scheduled integration | `npm run test:integration -- --grep @nightly` | Nightly/manual Chromium regression coverage. |
| All gameplay integration | `npm run test:integration` | On demand, including the scheduled cases. |
| Rendering | `npx playwright test --project=rendering` | On demand: shader, resource, art and quality regressions. |
| Cinematics | `npx playwright test --project=cinematics` | On demand: live timelines, opening and ending handoffs. |
| Media | `npx playwright test --project=media` | On demand: decoder, mix and real-time music lifecycle checks. |

`npm run test:browser` builds once and runs all ordinary browser projects.
`npx playwright test --list` shows their complete discovery. Optional MP4 tests
are tagged `@opening-backup` and require their separate build/config below.
Every browser spec belongs to an explicit project; there is no hidden directory
that only runs through a file whitelist.

Production tests serve the real artifact at `/group-folder/`. Isolated UI tests
load the real menu/settings classes through a temporary Vite server without
constructing a WebGL scene. Common entry observers live in
`tests/helpers/GameRuntime.ts`; only instrumented regression tests use them.
The main production journeys retain unmodified shipped code. Music assertions
read the production catalog through `MusicFixtures.ts`, rather than numbered
filename fragments.

PR CI selects work from changed paths. Documentation-only changes skip game
jobs; tooling/unit-only changes skip browsers. Game changes run units/types,
relevant generated-asset checks and the three-case browser gate (Minimum-graphics startup/restart plus isolated menus).
Unknown paths
retain game checks. The required `Production smoke` aggregate rejects failed
selection or browser shards. Setup reads the pinned versions from the repo and
caches browser binaries by Playwright version. The longer `@extended` journeys
run nightly instead of blocking every PR. Production integration retains its
tagged nightly journeys and Firefox startup. Submission CI tests the extracted ZIP; its optional extended checks
run the scheduled integration group. The manual **Browser regressions** workflow
runs any extended project, or all ordinary projects, across four one-worker
shards. Browser reports, captures and logs remain ignored and are retained as CI
artifacts on failure. These checks do not establish full playthrough or hardware
performance acceptance.

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

Reusable loading, performance, shader/light and shadow tools share
`--url`, `--output`, `--channel`, `--executable`, `--cdp`, `--headed`,
`--software` and `--help`. CLI values override `SPECIMEN_DIAGNOSTIC_URL`,
`SPECIMEN_DIAGNOSTIC_OUTPUT` and `SPECIMEN_BROWSER_*`/`SPECIMEN_CDP_URL`, then
per-tool defaults. Outputs default to ignored `artifacts/`. Legacy per-tool
settings still work. Hardware-only benchmarks retain their hardware requirements;
`--software` cannot configure a connected external browser. CPU audits and
asset validators keep their own inputs.

`node scripts/diagnostics/benchmark-level-one-loading.mjs` also accepts `--passes`.
`node scripts/diagnostics/benchmark-level-two-performance.mjs` uses `--cdp` or
`SPECIMEN_CDP_URL` to connect to a hardware Chrome debug endpoint. Compare matched builds, settings, viewport and hardware
without concurrent GPU workloads.
`node scripts/diagnostics/benchmark-first-loading.mjs` captures initial loading.
`profile-performance.mjs` is the single general profiler (including the former
lab options); it requires a clean matching build for provenance.
`node scripts/assets/generate-delivery-assets.mjs` reproduces lossless GLB banks.
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
timing and hash. Verify the explicit backup separately:

```sh
npm run build -- --mode opening-backup
npx playwright test --config playwright.backup.config.ts
```

The manual Browser regressions workflow's `opening-backup` choice builds and
runs that artifact. Its ordinary `all` choice covers the live-opening build.
