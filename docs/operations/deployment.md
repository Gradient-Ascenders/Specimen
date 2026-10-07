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

`index.html` must be at the ZIP root and hashed bundles beneath `assets/`.
There must be no enclosing `dist/`, source tree, dependency tree, documentation,
or development configuration. Keep the archive and its SHA-256 outside Git.

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

## Publish and verify

The assessment deployment link currently leads to Tiny File Manager. Upload or
extract the verified build contents into the group directory so `index.html`,
`assets/`, and other emitted directories sit at its root. A ZIP present on the
server is not a published game. Do not upload the repository or run package
tools on the static host.

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
