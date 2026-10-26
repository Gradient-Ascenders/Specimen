# Continuous integration

## Pull requests

`.github/workflows/pr-validation.yml` runs for pull requests targeting `main`.
A unit-test job and two production-smoke shards install the lockfile dependencies
and run:

| Check | Commands |
| --- | --- |
| Unit tests | `npm ci`, `npm test` |
| Production smoke | `npm ci`, `npm run build`, `npm run validate:production`, Chromium setup, `npm run test:smoke` |

The build already performs TypeScript checking. Browser failures retain traces,
screenshots, and reports as short-lived CI artifacts. Do not commit those files
under `docs/`.

Each smoke shard uses one software-rendering worker. The `Production smoke`
aggregate check passes only when both shards succeed.

Repository rules should require both checks, an up-to-date branch, one approval,
and resolved review threads. Verify the live ruleset before relying on this
document because repository settings can change independently of source.

## Production integration

`.github/workflows/production-integration.yml` runs the longer Chromium journeys
and a Firefox production-startup check nightly and on manual dispatch. It covers
graphics-profile parity across all levels, clean
gameplay mode, real browser audio, optional character-detail failures, and basic
cross-browser startup. It never runs for pull requests and is diagnostic
coverage rather than a required merge check.

## Submission builds

`.github/workflows/submission-build.yml` runs on `main` and by manual dispatch.
It builds the event revision, creates the archive once, extracts and smoke-tests
that exact archive at a nested path, and publishes a revision-labelled ZIP with
its SHA-256. Optional extended checks run the longer browser suite. The workflow
does not authenticate to or deploy onto the assessment host.

## Local verification

Install Chromium once with `npx playwright install chromium`, then run:

```bash
nvm use
npm ci
npm test
npm run build
npm run validate:production
npm run test:smoke
```

Run the longer software-rendered integration journeys when changing their
coverage or investigating renderer, level, audio, or lifecycle behavior:

```bash
npm run test:integration
```

To test the exact archive:

```bash
npm run archive
SPECIMEN_SMOKE_ARCHIVE=artifacts/specimen-production.zip npm run test:smoke
```

Use `npm run test:browser` for the separate full browser suite when the affected
area requires it. Automation checks boot, menus, later-level loading, restart,
network/console errors, and renderer invariants; it does not prove visual
quality, real-GPU performance, accessibility, or complete puzzle traversal.
