# specimen

**specimen** is a single-player 3D puzzle-platformer set in an abandoned biological research facility. The player positions and switches between three slime bodies whose incompatible abilities must be combined to escape.

- **Tack** sticks, climbs, and performs powerful charged bounces.
- **Etch** dissolves specifically marked geometry.
- **Volt** emits light and powers electrical machinery.

Inactive slimes remain in the level, so they can hold pressure plates, complete circuits, or illuminate spaces while another slime is controlled.

## Technology

The game is built with TypeScript, Three.js, Vite, DOM/CSS UI, handwritten GLSL shaders, and Blender/GLB assets.

The project is intentionally short and authored, with predictable kinematic gameplay collision kept separate from the deforming visual slime mesh.
