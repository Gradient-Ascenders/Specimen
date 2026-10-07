# Continuous integration

## Pull requests

`.github/workflows/pr-validation.yml` runs for pull requests targeting `main`.
Two independent jobs install the lockfile dependencies and run:

| Check | Commands |
| --- | --- |
| Unit tests | `npm ci`, `npm test` |
| Production smoke | `npm ci`, `npm run build`, `npm run validate:production`, Chromium setup, `npm run test:smoke` |

The build already performs TypeScript checking. Browser failures retain traces,
screenshots, and reports as short-lived CI artifacts. Do not commit those files
under `docs/`.

Repository rules should require both checks, an up-to-date branch, one approval,
and resolved review threads. Verify the live ruleset before relying on this
document because repository settings can change independently of source.

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

To test the exact archive:

```bash
npm run archive
SPECIMEN_SMOKE_ARCHIVE=artifacts/specimen-production.zip npm run test:smoke
```

Use `npm run test:browser` for the full browser suite when the affected area
requires it. Automation checks boot, menus, later-level loading, restart,
network/console errors, and renderer invariants; it does not prove visual
quality, real-GPU performance, accessibility, or complete puzzle traversal.
