# Production archive and static-host verification

This procedure packages and tests the static Vite production output used for
assessment. The host serves the finished HTML, JavaScript, CSS, models,
textures, and audio; it does not run Node.js, npm, Vite, or source files.

## Build and archive

Use the pinned Node.js and npm versions, install the lockfile, and create the
archive:

```bash
nvm use
npm ci
npm run archive
```

`npm run archive` runs the production build, validates the files referenced by
the built `index.html`, and creates
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
directory, `src/`, `node_modules/`, or development configuration. Generated
archives are ignored and must not be committed.

## Pre-publish smoke test

Extract the artifact outside the repository, place it beneath a representative
group subdirectory, and serve the parent over HTTP:

```bash
smoke_root="$(mktemp -d)"
mkdir -p "$smoke_root/site/group-folder"
unzip -q artifacts/specimen-production.zip -d "$smoke_root/site/group-folder"
cd "$smoke_root/site"
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/group-folder/` in Chrome. Do not use `file://` and
do not use the Vite development or preview server for this check. Verify that:

- the Issue #8 test scene and diagnostics render;
- `index.html` and every JavaScript, CSS, model, texture, and audio request use
  the nested `/group-folder/` path and return 2xx responses;
- no request targets localhost on another port, the source tree, `src/`, or
  `node_modules/`;
- Chrome reports no asset 404, failed request, uncaught exception, or
  unexplained console error.

The repository's Vite `base: './'` setting is required for this nested-path
behaviour and must remain relative.

## Publish

The supplied CGV project brief confirms that Final deployment is to the
department LAMP server through a Moodle archive upload, not through SSH/SCP.
Upload the production build, not the source tree. For this Vite project, the ZIP
must contain the contents of `dist/`, with `index.html` at the archive root and
no enclosing `dist/` or archive-name directory.

The current-year Moodle activity/link, deadline, archive naming convention,
group path, administrative owner, and any requirement to submit a hosted URL at
Beta remain unresolved. Do not guess them, bypass authentication, or treat the
repository artifact name as a confirmed submission filename. See
[`beta-requirements.md`](beta-requirements.md) for the authoritative questions,
owners, and evidence status. Moodle dates and current-year instructions take
precedence.

## Verify the published host

After publication through the confirmed Moodle/LAMP process, open the exact
published URL in Chrome and perform a fresh check rather than relying on the
local result. Record the URL, source revision and working-tree state, archive
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
the publish process confirmed by Issue #6. Verify the replacement URL with a
cache-disabled reload and record the new revision and archive hash.

Issue #6 has not confirmed a server-side rollback facility. If its eventual
publish process cannot replace or remove a bad upload, stop distributing the
bad URL and ask the named administrator or mentor to restore or remove it; do
not claim rollback succeeded until the live URL is checked again.
