# Production archive and static-host verification

This procedure packages and tests the static Vite production output used for
assessment. The host serves the finished HTML, JavaScript, CSS, models,
textures, and audio; it does not run Node.js, npm, Vite, or source files.

The team's actual Moodle deployment link opens authenticated **Tiny File
Manager**, labelled **File Manager for sgroup3888**, according to the deployment
UI evidence supplied by the team on 1 October 2026. This supersedes the older
assumption of an ordinary Moodle archive assignment. Tiny File Manager is the
deployment interface; uploading a ZIP alone does not publish its contents.
The public URL and its mapping to this directory still need live verification.

## Build and archive

Use the pinned Node.js and npm versions, install the lockfile, and create the
archive:

```bash
nvm use
npm ci
npm run archive
```

`npm run archive` runs the production build, validates the layout and local
HTML/CSS references, and creates
`artifacts/specimen-production.zip`. The script uses only Node.js and the
standard `zip` and `unzip` commands; it adds no project dependency. Archive
entries are sorted and timestamp metadata is normalized so the same production
output produces the same archive.

Inspect the upload before publishing:

```bash
unzip -Z1 artifacts/specimen-production.zip
unzip -t artifacts/specimen-production.zip
```

`index.html` must be at the archive root. Hashed JavaScript and CSS files must
be beneath `assets/`. The listing must not contain an enclosing `dist/`
directory, `src/`, `node_modules/`, repository documentation, local launcher
scripts, or development configuration. Generated archives are ignored and must
not be committed.

The **Submission build** workflow produces a directly downloadable
`specimen-<12-character-commit>.zip` after verification. Its summary records
the full revision and the ZIP's SHA-256. Download that file from the run and
verify its checksum. There is no outer Actions artifact ZIP to extract in the
new workflow. Older `specimen-production` artifacts have an outer wrapper;
extract that wrapper to obtain the inner game ZIP before using it.

See [`continuous-integration.md`](continuous-integration.md) for manual builds
and optional extended verification. Keep the downloaded package and checksum
locally as a record of the version you upload.

## Pre-publish archive test

The repository launchers extract the production archive into a temporary
`site/group-folder/`, serve its parent over HTTP, and remove the temporary files
when stopped:

```bash
bash scripts/start-production-server.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-production-server.ps1
```

Both open `http://127.0.0.1:4173/group-folder/` by default. They require an
existing `artifacts/specimen-production.zip`, so run `npm run archive` first.
Pass another port as the Bash script's first argument or as PowerShell's
`-Port` argument. Set `SPECIMEN_NO_BROWSER=1` to suppress automatic browser
opening.

For a downloaded CI package, the Bash launcher's second argument selects it:

```bash
bash scripts/start-production-server.sh 4173 /path/to/downloaded-game.zip
```

For automated deployment smoke checks:

```bash
SPECIMEN_SMOKE_ARCHIVE=artifacts/specimen-production.zip npm run test:smoke
```

This verifies the extracted package at a nested HTTP path. It checks ordinary
production boot/menus/restart and uses existing debug shortcuts for later-level
loading. It does not complete the puzzles or replace the full playthrough.

To perform the same extraction and serving process manually:

```bash
smoke_root="$(mktemp -d)"
mkdir -p "$smoke_root/site/group-folder"
unzip -q artifacts/specimen-production.zip -d "$smoke_root/site/group-folder"
cd "$smoke_root/site"
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/group-folder/` in Chrome. This serves the exact ZIP
contents from a representative nested path. Do not use `file://`, `npm run dev`,
or `vite preview` for this check.

Run both a clean title-to-completion playthrough and a failure-heavy
playthrough. In the failure-heavy run, exercise deliberate deaths and retries,
pause/resume, checkpoint recovery, and a pause-menu restart without reloading
the page. Repeat restart/play cycles while watching the debug diagnostics by
loading with `?debug=1` and toggling them with `F2`.

Verify that:

- the title, settings, credits, gameplay HUD, pause, restart, death/retry, and
  level-complete states behave correctly;
- keyboard and mouse controls work through all three levels and transitions;
- a failure-heavy run remains completable and does not softlock;
- exactly one canvas, game-flow root, death screen, and optional debug panel
  remain after repeated restarts;
- lifecycle restart count increases once per restart while collider, surface,
  slime, scene-object, renderer geometry, and texture counts return to stable
  warm values;
- `index.html` and every JavaScript, CSS, model, texture, and audio request use
  the nested `/group-folder/` path and return 2xx responses;
- no request unexpectedly starts from the server root or targets the source
  tree, `src/`, `node_modules/`, an absolute filesystem path, or another local
  port;
- Chrome reports no asset 404, failed request, uncaught exception, or
  unexplained console error.

Record what was actually observed. Automation may cover menus, restart,
diagnostics, DOM/resource counts, and network/console checks, but it is not a
substitute for the required human clean and failure-heavy playthroughs.

The repository's Vite `base: './'` setting is required for this nested-path
behaviour and must remain relative.

## Publish

1. Open the team's Moodle deployment link and sign in to Tiny File Manager.
2. Upload the **contents** of the verified build into the group directory,
   preserving directory structure. Do not upload the repository or an enclosing
   `dist/` directory.
3. If Tiny File Manager supports archive extraction, you may upload the game ZIP
   and explicitly extract it there. Verify extraction before relying on it.
   Otherwise extract locally and upload the built files/directories directly.
4. Inspect the deployed root. It must contain `index.html`, `assets/`, and any
   other emitted files such as `brand/`. A ZIP sitting in the directory is not
   sufficient. Remove the uploaded ZIP afterwards if it is no longer needed.
5. Open the confirmed public game URL and perform the published-host checks
   below. Do not infer a URL from `sgroup3888` or claim publication merely from
   a successful upload.

The final layout should resemble:

```text
sgroup3888/
├── index.html
├── assets/
└── brand/
```

Tiny File Manager supplies browser-based file access, not shell access. Do not
use SSH, SCP, rsync over SSH, Git clone, or npm on the department server. The
server serves static production files only. Retain `base: './'`, exact Linux
filename casing, and relative/Vite-managed runtime asset URLs.

The published URL, directory-to-URL mapping, archive-extraction behaviour,
current-year archive naming convention, and additional submission fields are
not confirmed by the supplied UI evidence. Follow later Moodle instructions;
see [`beta-requirements.md`](beta-requirements.md) for the evidence record.

## Verify the published host

After uploading/extracting through Tiny File Manager, open the exact published
URL in Chrome and perform a fresh full playthrough of all three levels. Check
transitions, restart, shaders, models, textures, audio, menus, credits, lab-hardware
performance, and memory across repeated level transitions. Record the URL,
source revision and working-tree state, archive
SHA-256, verification time, Chrome version, and screenshot in `docs/evidence/`.

In Chrome DevTools, enable Preserve log, reload with the Network panel open,
and confirm:

- the document, module, stylesheet, and all content assets return 2xx responses
  beneath the expected group path;
- no request incorrectly resolves from `/`, targets `localhost`, or uses an
  absolute filesystem path;
- filename casing exactly matches the archive (the host is Linux and is
  case-sensitive);
- external runtime resources, if introduced later, use HTTPS and do not cause
  mixed-content failures;
- the Console has no unexplained errors and the page has no uncaught exception
  or module-load failure.

## Retry or recover a bad publication

Do not patch files directly on the host. Reproduce the failure with the
archived artifact, correct the source or packaging defect, rerun
`npm run archive`, inspect and smoke-test the replacement ZIP, and then repeat
the Tiny File Manager upload/extraction process. Verify the replacement URL with a
cache-disabled reload and record the new revision and archive hash.

No server-side rollback facility has been verified. Keep the last verified ZIP
locally; if replacement is supported, restore its complete contents through
Tiny File Manager and verify the live URL again. If you cannot replace or remove
a bad upload, ask the named administrator or mentor for help. Do not claim
rollback succeeded until the live URL is checked again.
