# ADR 0003 — Organize source code by responsibility

Status: Accepted
Date: 2026-08-18

## Context

The initial project structure needs stable ownership boundaries while gameplay,
rendering, assets, and puzzle work are developed in parallel.

## Decision

Keep `src/main.ts` limited to application bootstrap. Organize code by
responsibility: `core/`, `render/`, `physics/`, `entities/`, `systems/`,
`puzzle/`, `levels/`, `shaders/`, `ui/`, `audio/`, `debug/`, and typed asset
folders under `assets/`.

## Consequences

The structure keeps predictable kinematic collision independent from deforming
visual meshes and provides ownership boundaries for later Sprint work. Empty
directories retain `.gitkeep` files only until their first implementation lands.
