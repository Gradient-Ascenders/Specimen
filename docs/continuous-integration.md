# Continuous integration

## PR validation

`.github/workflows/pr-validation.yml` runs for PRs targeting `main` when opened,
updated (`synchronize`), reopened, or marked ready for review. Draft PRs also
receive checks. The default checkout tests GitHub's proposed merge revision.
There is no duplicate feature-branch push workflow. An update cancels an older
run for the same PR.

Two independent jobs run in parallel:

| Required check | Verification |
| --- | --- |
| Unit tests | `npm ci`, then `npm test` |
| Production smoke | `npm ci`, `npm run build`, `npm run validate:production`, Chromium installation, `npm run test:smoke` |

Both jobs use `.nvmrc`, the package lock, and an npm download cache. Installed
`node_modules` and builds are not cached. `npm run build` includes TypeScript,
so there is no duplicate type-check or build. The repository does not currently
provide lint or formatting scripts. PRs do not publish submission ZIPs.

Failures retain browser traces/screenshots and upload available reports for
seven days. Required checks always run; there are no path filters that could
leave required checks pending or hide an asset/configuration regression.

## Submission build

`.github/workflows/submission-build.yml` runs after a push to `main`. It builds
the event's revision, even if a later merge advances `main` during the run.
Every run remains associated with its own revision; newer merges do not cancel
an in-progress submission build. A manual run must select `main` and can enable
`extended_checks` for the existing full shader/lifecycle suite.

The workflow runs unit tests, builds and packages once with `npm run archive`,
and then smoke-tests files extracted from that exact ZIP under `/group-folder/`.
Extended checks, when requested, also must pass before publication. The result
is a directly downloadable `specimen-<12-character-commit>.zip` with no Actions
ZIP wrapper. Artifacts are retained for 90 days, within repository limits.
The workflow summary records the full commit, archive SHA-256, checks, download
link, and Tiny File Manager instructions.

This workflow needs only read access to repository contents. It does not
authenticate to Moodle, deploy files, or need server credentials.

## Required checks and review

GitHub's active `Protect main` ruleset was inspected on 1 October 2026. It
requires one approval, dismisses stale approvals, and requires resolved review
threads. It currently does not require status checks. An existing user bypass
is part of that ruleset; this change does not alter it.

When these workflows are published and their checks have appeared, update that
ruleset to require **Unit tests** and **Production smoke** from GitHub Actions,
and require the branch to be up to date before merging. Retain the existing
review requirements. Activate both checks during the rollout; requiring new
checks before the workflows are available can block the overhaul PR itself.
The submission workflow's push trigger follows approved merges when the
ruleset is followed, and also covers any permitted direct/bypass update to
`main`. Approval alone does not build or publish a submission.

## Local verification

Install Chromium once with `npx playwright install chromium`, then:

```bash
npm ci
npm test
npm run build
npm run validate:production
npm run test:smoke
```

To check the exact archive without rebuilding twice:

```bash
npm run archive
SPECIMEN_SMOKE_ARCHIVE=artifacts/specimen-production.zip npm run test:smoke
```

The smoke command requires an existing build/ZIP and serves it on
`http://127.0.0.1:4173/group-folder/` using a static Node test server. This is
local test tooling; the department server only serves the resulting files.
The test server returns 404 outside the group directory and does not provide
Vite's development routing fallback.

The first smoke test uses plain production to check boot, credits, Start,
pause/resume, and restart. The second uses existing `?debug=1` shortcuts to load
Cultivation and Blackout through the real transition UI and restart both.
Neither test rewrites built JavaScript or injects runtime probes. Chromium uses
ANGLE with SwiftShader for a consistent CPU renderer on machines without a GPU.
Network, console errors, and invalid WebGL operations are checked throughout
each journey. Repeated identical errors are deduplicated in the failure report.
This does not measure hardware rendering performance. The longer browser suite remains
available with `npm run test:browser`, or `npx playwright test` after a build.

## What still needs a human

Smoke checks do not complete puzzles or establish visual quality, accessibility,
lab-hardware performance, or stable memory over a full playthrough. Before
submission, play all three levels from the extracted ZIP. After uploading via
Tiny File Manager, repeat the full check at the confirmed public URL in Chrome.
See [`production-deployment.md`](production-deployment.md).

## Rendering failures found during rollout

On 1 October 2026, local verification of game revision
`1901416be1114633d465f8ad90f9103ea44ed6ea` with the new CI helpers found:

- The ordinary production boot/credits/start/restart journey passed.
- The debug-assisted journey loaded both later levels and restarted them, but
  reported `Cold shader program regression after Level 1 warm-up` (99 to 101
  programs after Start) and `GL_INVALID_OPERATION` texture/sampler mismatches
  during the later-level transition. The browser check therefore failed.

The tested ZIP had SHA-256
`f4c934084c861240a4878f2920fbcd1e3e6cb1bebfe3dd019e4dbd5bc61094fa`;
its 27 files matched `dist/` byte-for-byte. Workflow syntax, unit tests, layout,
archive integrity, and submission-summary checks passed. These are local
results, not a successful GitHub Actions run or published-host verification.

The failures occurred with unchanged game source. The follow-up rendering fix
warms opaque Containment materials for Bob's linear transmission render target,
as well as the main canvas. Cultivation preparation now gives its cloned
shadow-casting lights initialized comparison depth textures instead of drawing
PCF receivers against missing shadow maps; these temporary resources are
disposed after preparation or cancellation. The original two production smoke
journeys then passed locally with their console/network assertions intact.

Default Chromium also produced long frame stalls; the explicit SwiftShader
configuration reduced the complete local smoke run to about a minute while
retaining the original failures. A passing smoke check covers boot, credits,
level loading and restarts; it does not replace the deployment playthrough.
