# specimen

**specimen** is a single-player 3D puzzle-platformer set in an abandoned biological research facility. The player positions and switches between three slime bodies whose incompatible abilities must be combined to escape.

- **Tack** sticks, climbs, and performs powerful charged bounces.
- **Etch** dissolves specifically marked geometry.
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

## Continuous integration

The `PR validation` workflow checks pull requests targeting `main` before merge,
and the `CI` workflow checks pushes to `main` after merge. Both select the Node.js
version from `.nvmrc`, install the locked dependencies with `npm ci`, and run the
same `npm run build` command used for local delivery.

`PR validation / production-build` is the check intended to be required before
merging into `main` when repository rules permit it.
