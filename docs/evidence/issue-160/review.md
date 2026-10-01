# Bob whole-game contract and measurement review — #160

Status: implementation and current-workspace verification complete. This is
technical evidence, not a new visual-approval gate and not a weakest-machine
readiness claim.

## Production ownership audit

All three production runtimes mount `BobCharacterPresentation`; no production
runtime constructs the removed `GreyboxCollisionScene`, `SlimeVisual`,
`SlimeMaterial`, `SlimeLightSampler`, or their handwritten legacy GLSL. The
shared death burst, shared cyan palette, Cultivation vent-reflection weight,
and Level 3's Goop/Volt/merged-specimen visuals remain in place.

The shared Bob asset profile was identical in every level: 3,264 body
triangles, 504 eye triangles, three character draw submissions, three
geometries, two runtime materials, seven body morph targets, and eleven morph
targets per eye.

## Built-game measurements

Captured 25 September 2026 in Playwright Chromium at 960 × 600 from the Vite
production build. These are whole-scene snapshots after each level became
ready, not Bob-only renderer counters. The source data is
[measurements.json](measurements.json).

| Level | Draw calls | Triangles | Programs | Geometries | Textures | Frame p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Containment | 382 | 56,494 | 99 | 366 | 15 | 616.6 / 800.0 ms |
| Cultivation | 36 | 16,814 | 115 | 489 | 48 | 316.6 / 583.3 ms |
| Blackout | 15 | 6,424 | 7 | 10 | 8 | 1,433.3 / 11,249.6 ms |

Frame distributions contain 12 consecutive rendered frames per level. The
workspace used software WebGL, so these frame times characterize only this
verification environment. They are not representative-hardware evidence and
must not be used to claim weakest-machine readiness. In particular, the
Blackout sample includes an 11.25-second software-renderer outlier.

## Lifecycle result

One uninterrupted built-game session transitioned from Level 1 to Level 2 to
Level 3. The previous Bob owner was unprepared and detached after both level
transitions. A Blackout restart reused the same prepared presentation and kept
the exact asset profile stable. Final unload left Bob unprepared and detached,
disposed the level-owned reflection environment, and left the runtime in
`unloaded`. Failed requests and unexplained console/page errors were both zero.

A fresh built-game session then performed three death/retry cycles and three
explicit restarts. After every operation, renderer-owned resources remained at
99 programs, 366 geometries, and 15 textures, while Bob remained at the exact
approved asset profile. A double unload was idempotent: Bob was unprepared and
detached and the runtime remained `unloaded`.

Focused tests additionally verify idempotent disposal of every Bob-owned
geometry/material, reset of morph/expression/death/frame state, and rollback of
level-owned resources. The dedicated Cultivation and Blackout browser checks
reached and passed their movement, switching, death/retry, lighting, and
merge/split assertions, but their original runs exhausted their wall-clock
budgets while attempting a second cold construction under software WebGL. The
tests now carry explicit wider budgets; the single-pass capture above supplies
the completed cross-level lifecycle evidence without treating the slow renderer
as gameplay telemetry.

## Reproduce

```bash
npm run build
node scripts/capture-bob-whole-game.mjs
```

The capture fails if the expected instrumented bundles are not observed, any
level lacks the approved asset profile, a previous owner survives a transition,
retry/restart cycles grow renderer resources or mutate Bob's asset profile,
unload leaves owned resources live, or the browser records a failed request or
unexplained error.
