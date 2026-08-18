# Issue #5 decision and attribution evidence

Reviewed on 18 August 2026 against the accepted repository documentation and
the live Issue #5 scope.

## Decision evidence

- `README.md` defines Specimen as a single-player puzzle-platformer and its
  technical direction separates kinematic collision from the deforming slime.
- `CONTRIBUTING.md` preserves the single-player scope, excludes multiplayer and
  service dependencies, and repeats the collision/visual separation.
- The previously accepted `SETUP-6` source-ownership record is preserved as ADR
  0003 in the decision index.

## Attribution check

Three.js 0.185.1 was checked end to end. `package.json` declares it directly,
the lockfile records its MIT licence and npm source, and `src/main.ts` plus the
grey-box scene import it. Its ledger entry records the resource name, creator
(mrdoob), source, licence, and use as the 3D rendering framework.
