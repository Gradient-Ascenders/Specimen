# Technical decisions

## SETUP-6 — Organize source code by responsibility

- **Status:** Accepted
- **Date:** 18 August 2026

Keep `src/main.ts` limited to application bootstrap. Organize implementation by
responsibility:

- `core/` owns application lifecycle, the game loop, input, events, and assets.
- `render/` owns Three.js rendering, cameras, lighting, and post-processing.
- `physics/` owns deterministic movement and collision concerns.
- `entities/` owns game entities and their visual representations.
- `systems/` owns cross-entity gameplay coordination.
- `puzzle/` owns reusable puzzle components.
- `levels/` owns level contracts and authored level composition.
- `shaders/` owns handwritten shader sources.
- `ui/`, `audio/`, and `debug/` own their respective presentation services.
- `assets/` groups source-controlled models, textures, audio, and images by type.

This separation keeps predictable kinematic collision independent from deforming
visual meshes and gives later Sprint work stable ownership boundaries. Empty
directories retain `.gitkeep` files only until their first implementation lands.
