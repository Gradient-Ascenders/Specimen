# Contributing to Specimen

Use the Node version in `.nvmrc`, the npm version in `package.json` and `npm ci`.
Keep the lockfile synchronized. Start a focused branch from current `main` and
link its issue or agreed task in the pull request.

## Implementation

- Preserve the single-player scope and current TypeScript/Three.js/Vite stack.
- Keep kinematic collision and authoritative game state separate from visual
  meshes, audio and UI. See [runtime ownership](docs/architecture/runtime.md).
- Keep source grouped by responsibility. Use descriptive lowercase kebab-case
  media names; retain established TypeScript module naming.
- Put source art and recordings in `assets/`, bundled banks in `src/assets/`,
  and directly served runtime media in `public/`. See [asset sources](assets/README.md).
- Preserve source inputs, compact provenance and licences. Update [CREDITS](CREDITS.md)
  when introducing third-party resources.
- Store local captures, reports and benchmarks under ignored `artifacts/`.
  Attach review evidence to issues/PRs or retain it in CI artifacts.
- Keep local configuration in ignored `.env` files and safe examples only.
- Add proportionate coverage for meaningful behavior changes. Keep the curated
  unit suite within its 500 expanded-case cap by replacing overlapping coverage.

## Validation and delivery

```sh
npm run type-check
npm test
npm run build
```

Run generated-asset checks when changing source assets or generators, and
relevant browser checks for loading, rendering, audio and lifecycle changes.
[Development](docs/development.md) covers browser setup, packaging and hosting.
Record commands actually run and any remaining manual checks. Browser automation
and software rendering do not establish full playthrough or hardware acceptance.

Review the diff, stage intended paths selectively and preserve unrelated work.
Use concise imperative commit subjects with an established prefix: `[feat]`,
`[fix]`, `[test]`, `[docs]`, `[refactor]` or `[chore]`.

Changes reach `main` through a pull request. Link the task, describe the resulting
behavior, record validation and obtain a non-author teammate's review. Resolve
discussions and required checks before merge; repository rules may add further
requirements. Do not merge your own pull request.
