# ADR 0001 — Single-player scope

Status: Accepted
Date: 2026-08-18

## Context

Specimen is defined as a single-player 3D puzzle-platformer. The approved
contribution standards preserve that scope and the project is intentionally
short and authored.

## Decision

Specimen is a browser/local single-player game. It is not a networked or
multiplayer game and is not built around accounts, a persistence service, or a
gameplay backend.

## Consequences

Gameplay work prioritises the assessed graphics and puzzle-platformer
experience. The production build can remain a static browser deliverable rather
than requiring gameplay service infrastructure.
