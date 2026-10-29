# Build and deployment

The production output is a static Vite site. The host serves built HTML,
JavaScript, CSS, models, textures, and audio; it does not run Node.js, npm,
Vite, or repository source.

## Build and inspect

```bash
nvm use
npm ci
npm run archive
unzip -Z1 artifacts/specimen-production.zip
unzip -t artifacts/specimen-production.zip
```

On Windows, `npm run archive` uses the built-in .NET ZIP implementation; no
Unix zip/unzip installation is required.

`index.html` must be at the ZIP root and hashed bundles beneath `assets/`.
There must be no enclosing `dist/`, source tree, dependency tree, documentation,
or development configuration. Keep the archive and its SHA-256 outside Git.

Submission builds omit the optional opening MP4 and the README-only brand
lockup. Start still plays the complete live 3D opening; `?opening=mp4` also
uses the live opening when the backup is absent. Music, sound effects, models,
and baked textures retain their quality. The Unix packager uses maximum ZIP
compression and still verifies every extracted file against `dist/`.

Archives preserve build modification times so static hosts can invalidate a
cached `index.html` and `build-manifest.json` after an update. Do not reset all
ZIP entries to a fixed date: a same-sized launch page can then receive an
incorrect `304 Not Modified` and keep requesting assets from a removed build.

For an explicit build containing the video backup, run:

```bash
npm run build -- --mode opening-backup
node scripts/create-production-archive.mjs
```

`npm run archive` rebuilds the smaller submission variant.

## Test the package

Run the repository launcher after creating the archive:

```bash
bash scripts/start-production-server.sh
```

It extracts into a temporary nested `group-folder/` and serves the parent at
`http://127.0.0.1:4173/group-folder/`. A downloaded CI package can be supplied
as the launcher's second argument. The PowerShell launcher provides the same
workflow on Windows.

Do not validate deployment with `file://`, the development server, or only
`vite preview`. Verify that all requests remain under the nested path, use exact
filename casing, and return successfully. Run a clean playthrough and a
failure-heavy playthrough covering pause, Retry, checkpoints, transitions, and
restart.

## Ordinary production acceptance

Open the assigned URL without query parameters. All five authored Cultivation
rooms load by default; `?debug=1` only enables developer tools. The Minimum
hardware profile with the Normal graphics preset is the default. Standard and the extra Performance cap are optional; resolution
scale and the pixel-ratio cap remain explicit settings.

After `npm run archive`, run the archive itself through the nested-path smoke
server (PowerShell):

```powershell
$env:SPECIMEN_SMOKE_ARCHIVE = 'artifacts/specimen-production.zip'
# Optional installed hardware browser; omit to use software Chromium.
$env:SPECIMEN_BROWSER_CHANNEL = 'msedge'
npm run test:smoke
npm run test:integration
```

`ProductionParity` opens the plain URL and observes the composition root without
enabling debug mode. Its three journeys cover Minimum hardware/Normal,
Standard/Normal, and Standard/Performance at an explicit 0.75x pixel-ratio cap.
It verifies the actual baked asset request and applied repairs, authored
objects, populated texture maps,
characters, encounters, preparation, each Level 2 room, restarts, Volt release,
all three levels, and network/console/WebGL errors. Controller contracts stage
completion and room entry: this regression is not an unassisted puzzle
playthrough. `ProductionSmoke` also retains the unmodified plain startup journey
and explicit debug shortcut journey. Screenshots/traces/results are generated
under `test-results/` and the Playwright report.

`npm run test:smoke` also exercises live opening preparation with both Standard
presets, retaining the console and WebGL error checks. These cases run in the
pre-merge smoke gate; post-merge integration retains the deeper three-level
parity journeys.
Network checks ignore only browser cancellation/cache-handoff statuses for
same-deployment streamed music; HTTP errors, failed SFX and other asset failures
remain fatal.

The Firefox integration job explicitly enables software WebGL on GPU-less Linux
runners with `SPECIMEN_FIREFOX_SOFTWARE_WEBGL=1` and `LIBGL_ALWAYS_SOFTWARE=1`,
installs Mesa's software OpenGL drivers, and runs headed Firefox under Xvfb.
The virtual display is needed for Firefox's native GL context on these runners;
enabling the WebGL preference alone is insufficient without a usable driver.
The preference override is opt-in and does not alter the shipped game or normal
local Firefox launches. Keep Playwright's installed browser revision matched to
the locked dependency version when reproducing these checks.

## Publish and verify

The assessment deployment link currently leads to Tiny File Manager. Upload or
extract the verified build contents into the group directory so `index.html`,
`assets/`, and other emitted directories sit at its root. A ZIP present on the
server is not a published game. Do not upload the repository or run package
tools on the static host.

After replacing an older deployment, hard-refresh the page or open
`index.html?build=<revision>` once to bypass any launch page already cached
with an old fixed timestamp. If a model request returns 404, compare its exact
filename with `build-manifest.json`; a retired filename indicates a stale
launch page or an existing tab still running the previous build.

Open the confirmed public URL in Chrome and repeat a full playthrough. With
DevTools preserving Network and Console logs, check nested relative paths,
2xx asset responses, Linux filename casing, no localhost or filesystem URLs,
and no unexplained errors. Record the revision, archive hash, URL, browser, and
result in the release issue or pull request; do not add deployment screenshots
or logs to `docs/`.

If publication is bad, fix source or packaging locally, rebuild and retest a
new archive, replace the complete hosted contents, and verify again with cache
disabled. Keep the last verified package locally. Do not claim a rollback or
deployment succeeded until the public URL has been checked.
