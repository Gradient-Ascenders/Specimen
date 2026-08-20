# specimen

**specimen** is a single-player 3D puzzle-platformer set in an abandoned biological research facility. The player positions and switches between three slime bodies whose incompatible abilities must be combined to escape.

- **Bob** sticks, climbs, and performs powerful charged bounces.
- **Goop** dissolves specifically marked geometry.
- **Volt** emits light and powers electrical machinery.

Inactive slimes remain in the level, so they can hold pressure plates, complete circuits, or illuminate spaces while another slime is controlled.

## Technology

The game is built with TypeScript, Three.js, Vite, DOM/CSS UI, handwritten GLSL shaders, and Blender/GLB assets.

The project is intentionally short and authored, with predictable kinematic gameplay collision kept separate from the deforming visual slime mesh.

## Development

The supported toolchain is Node.js 24.x (24.14.1 is pinned in `.nvmrc`) and npm
11.x (11.18.0 is recorded in `package.json`). After selecting the pinned Node.js
version, install the locked dependencies:

```bash
nvm use
npm ci
```

Start the Vite development server:

```bash
npm run dev
```

Create the production build in `dist/` or preview that output locally:

```bash
npm run build
npm run preview
```

Vite is configured with a relative base, so the contents of `dist/` can be served
from a domain root, a nested route, or an extracted archive directory without
rewriting asset URLs.

Create and validate the assessment-ready ZIP archive with:

```bash
npm run archive
```

The generated `artifacts/specimen-production.zip` contains the contents of
`dist/` at its root and is intentionally ignored by Git. See
[`docs/production-deployment.md`](docs/production-deployment.md) for archive
inspection, external nested-path testing, publication, verification, and retry
steps.

Assessment planning must distinguish the supplied CGV brief from current-year
Moodle and mentor instructions. See
[`docs/beta-requirements.md`](docs/beta-requirements.md) for confirmed
Beta/trailer/deployment requirements, unresolved questions, owners, and the
Issue #6 acceptance assessment. Moodle dates and current-year instructions take
precedence over tentative planning information.

## Continuous integration

The `PR validation` workflow checks pull requests targeting `main` before merge,
and the `CI` workflow checks pushes to `main` after merge. Both select the Node.js
version from `.nvmrc`, install the locked dependencies with `npm ci`, and run the
same `npm run build` command used for local delivery.

`PR validation / production-build` is the check intended to be required before
merging into `main` when repository rules permit it.
