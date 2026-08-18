# ADR 0002 — Kinematic collider separate from visual slime

Status: Accepted
Date: 2026-08-18

## Context

Specimen's approved technical direction calls for predictable kinematic
gameplay collision while the slime has a deforming visual mesh.

## Decision

Gameplay collision uses a simple authoritative kinematic body/collider. The
rendered slime is a separate deformable visual representation. Visual or shader
deformation must not modify gameplay collision; authoritative gameplay state
drives the visual representation one-way.

## Consequences

Collision remains predictable while the slime wobbles, squashes, or stretches,
and visual deformation can evolve independently of collision geometry. A
`SlimeVisual`-style component consumes gameplay state rather than becoming
authoritative. This separation keeps ownership and resource cleanup explicit.
