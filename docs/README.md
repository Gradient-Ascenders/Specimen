# Project documentation

This directory contains durable guidance for the current game. Source code,
tests, issue discussions, pull requests, and CI artifacts remain the authority
for implementation details and historical evidence.

## Architecture

- [Runtime and lifecycle](architecture/runtime.md) — application ownership,
  fixed-step updates, input, transitions, restart, and disposal.
- [Rendering and assets](architecture/rendering.md) — renderer ownership,
  lighting, shadows, preparation, and asset boundaries.
- [Goop model integration](architecture/goop-model-integration.md) — implementation
  specification for the authored Goop model and shared gel presentation.
- [Volt model integration](architecture/volt-model-integration.md) — implementation
  specification for Volt's authored model, morphs, rescue and electrical lifecycle.
- [Architecture decisions](decisions/README.md) — concise accepted decisions.

## Gameplay

- [Movement and camera](gameplay/movement-and-camera.md) — kinematic movement,
  jumping, adhesion, and camera rules.
- [Slimes and abilities](gameplay/slimes-and-abilities.md) — roster ownership,
  switching, Goop, Volt, and the merged Specimen.
- [Puzzles, hazards, and combat](gameplay/puzzles-hazards-and-combat.md) — shared
  component contracts, fixed-step ordering, resets, and damage authority.

## Levels

- [Containment](levels/containment.md)
- [Cultivation](levels/cultivation.md)
- [Blackout](levels/blackout.md)

## Operations

- [Continuous integration](operations/continuous-integration.md)
- [Build and deployment](operations/deployment.md)
- [Playtesting](operations/playtesting.md)
- [Bob's trailer opening](operations/trailer-opening.md) — replayable in-engine
  opening, recording controls, and capture-only startup.
- [Goop's trailer introduction](operations/trailer-goop.md) — Goop intercepts a
  drone attack on Bob and destroys the attacker with an acid shot.

Generated screenshots, videos, browser logs, benchmark output, and one-off
review notes do not belong in this directory. Attach review evidence to the
relevant issue or pull request, keep CI evidence in workflow artifacts, and use
an ignored `artifacts/` subdirectory for local output.
