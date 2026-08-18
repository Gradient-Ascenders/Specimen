# Contributing to Specimen

This guide defines the shared development workflow for the Specimen repository,
the project workspace for the single-player 3D puzzle-platformer.

Use **Specimen** when referring to the project, repository, or game. Issue-specific
acceptance criteria and repository `AGENTS.md` instructions take precedence where
they are more specific.

## Prepare the repository

Clone the repository and create work from the current `main` branch:

```bash
git clone https://github.com/Gradient-Ascenders/Specimen.git
cd Specimen
git switch main
git pull --ff-only
```

The repository does not yet define a Node.js version, package manifest, lockfile,
or production build command. When those files are introduced, use the pinned
runtime and package manager recorded by the repository. Prefer reproducible
installs, keep the manifest and lockfile synchronized, and do not replace the
package manager or lockfile without an approved project decision.

## Work from an issue

1. Read the complete GitHub issue, comments, dependencies, and acceptance criteria.
2. Create a short-lived branch from the current `main` branch.
3. Keep the change inside the issue boundary and coordinate cross-role decisions.
4. Run the relevant automated and manual verification.
5. Open a small pull request that links the issue and records verification evidence.

Use descriptive branch names such as `feat/slime-switching` or
`fix/etch-collision`. Do not work directly on `main` or merge your own pull
request.

## Follow the shared standards

- Preserve the approved single-player scope. Do not introduce multiplayer,
  networking, matchmaking, server-hosting, account, or online-service
  dependencies without an approved scope change.
- Use TypeScript, Three.js, Vite, DOM/CSS, handwritten GLSL, and Blender/GLB assets
  consistently with the established project architecture.
- Keep predictable kinematic gameplay collision separate from the deforming
  visual slime mesh.
- Keep changes focused. Record defects and deferred work in follow-up issues
  instead of silently expanding the current issue.
- Load local configuration from ignored `.env` files. Commit only safe
  placeholders in `.env.example` files, and never commit credentials or tokens.
- Record third-party code, assets, and resources in the project credits ledger.
- Add proportionate automated tests for meaningful behaviour changes once the
  relevant test infrastructure exists.

Before committing, run every relevant check exposed by the repository. The
expected verification set, once corresponding scripts are available, is:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

Do not report a command as passing unless it was actually run. If a required
check is unavailable, record that limitation in the pull request.

## Create coherent commits

Review both unstaged and staged changes, stage files selectively, and confirm
that no secrets or unrelated changes are included. Commit subjects must use one
of the approved prefixes:

```text
[feat] add slime switching controls
[fix] prevent duplicate collision resolution
[test] cover charged bounce timing
[docs] document repository contribution guidelines
[refactor] isolate slime movement state
[chore] configure project quality checks
```

Keep subjects concise, imperative, and specific to the change. Split unrelated
work into separate commits.

## Prepare the pull request

Link the issue using `Closes #<number>` or `Refs #<number>`. Explain the problem
and approach, list the commands actually run, distinguish outstanding manual
checks, and record accessibility, documentation, performance, resource-disposal,
asset, and scope impacts.

Visual changes should include screenshots or a short recording. Confirm that the
affected player journey works and that no unexplained console errors or asset
404s were introduced.

Every pull request requires approval from at least one teammate who is not its
author. Resolve review discussions and re-request review after material changes.
Do not mark the issue complete until the change is merged and all required
verification is complete.

## Follow the review rotation

Each issue names an owner and a reviewer. The owner coordinates delivery and is
accountable for satisfying the completion requirements. The reviewer validates
the scope, implementation, acceptance criteria, and evidence.

Rotate reviews through the other three collaborators. Skip the issue owner and
anyone unavailable or directly conflicted, then record the substitution on the
pull request. For Sprint 0, Tyron is the M1 owner for systems and movement, and
Kevin is the M2 reviewer for graphics and shaders.

## Protect the main branch

All changes reach `main` through pull requests. The intended repository rules
require a pull request, at least one non-author approval, resolved conversations,
and all configured status checks before merge.

No required protection is currently recorded as unavailable under the repository's
GitHub plan. If GitHub cannot enforce a control, the team agreement still applies.
Document the limitation in the setup issue and revisit the repository settings if
the plan or repository visibility changes.
