# PR #174 — Room 2 rendering diagnostic

Recorded 2026-10-01T17:08:18.507Z from the production build, using Playwright 1.61.0 and Chromium 151.0.7922.34. The raw samples and renderer counters are in [pr-174-room2-performance.json](pr-174-room2-performance.json).

## Environment and method

This workspace uses WSL2 on an AMD Ryzen 7 3700X (16 logical CPUs), with ANGLE/SwiftShader **software** WebGL, a 640 × 360 viewport, and device pixel ratio 1. These measurements are a diagnostic, not representative-hardware FPS or weakest-computer acceptance evidence.

The browser enters the real authored Level 3 runtime using the Level 1 `-` shortcut, then Room 2's `2` shortcut. Both samples use the same CP3 entry camera. Each collects 12 consecutive requestAnimationFrame deltas after four warm-up frames. All three red searchlights are visible, shadow-casting, and have allocated 1024 × 1024 shadow maps. The second sample programmatically charges all three existing light-bank receivers; it is not a claim of a complete cooperation playthrough.

## Results

| State | Draw calls | Triangles | Geometries / textures / programs | Frame p50 / p95 |
| --- | ---: | ---: | ---: | ---: |
| CP3, light banks off | 464 | 43,944 | 215 / 14 / 23 | 33.4 / 37,348.5 ms |
| CP3, all three light banks latched | 467 | 43,980 | 215 / 14 / 23 | 433.3 / 533.3 ms |

The unpowered sample includes several multi-second software-renderer stalls, with a maximum of 37.35 seconds. Do not omit these outliers or interpret its median as sustained gameplay FPS. The powered sample is also too slow for playable performance in this software-only environment; the capture does not establish the cause or justify hardware-readiness claims.

Two subsequent CP3 recoveries retain exactly **215 geometries, 14 textures, and 23 programs**. Browser console/page errors and failed requests are both zero. Shadow resources remain bounded in this short diagnostic; longer observation and real GPU testing still belong to #165/#138.

## Reproduce

```bash
npm run build
node scripts/profile-blackout-transit.mjs
```

The profiler defaults to the Playwright-managed Chromium. If a compatible cached browser is used, set `SPECIMEN_PROFILE_BROWSER` to its executable; this run used the locally installed `chromium_headless_shell-1234`. `SPECIMEN_PROFILE_FRAMES` can increase the sample count (default 12). It requires the existing development shortcuts and a free port 4178.

Before merge/release, run the same room on the weakest available **hardware-accelerated** player computer, cover the full route and repeated deaths/restarts, and record that result separately. This diagnostic does not mark those manual acceptance criteria complete.
