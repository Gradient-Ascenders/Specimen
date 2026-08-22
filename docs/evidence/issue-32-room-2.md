# Issue #32 Room 2 art-pass evidence

Room 2 now uses the approved Room 1 **Clean Biotech Stylized Realism**
language while retaining the frozen traversal and collision layout. This pass
is limited to Room 2; Rooms 3–5 remain unchanged.

## Rendered iterations

The first rendered pass established the large asymmetric ceramic panel skin,
graphite substrate, upper service canopy, observation recess, manufactured
sticky installation, transition collars, signage, and mechanical platform
family. Review exposed stacked dark platform undersides, so the second pass
replaced their solid under-bodies with perimeter load rails, cross-braces,
actuator rods, and central sockets.

- Iteration 1: [entry](issue-32-room-2-iteration-1-entry.png),
  [upper route](issue-32-room-2-iteration-1-upper.png),
  [sticky installation](issue-32-room-2-iteration-1-sticky.png),
  [observation bay](issue-32-room-2-iteration-1-observation.png), and
  [canopy](issue-32-room-2-iteration-1-canopy.png).
- Iteration 2: [entry](issue-32-room-2-iteration-2-entry.png) and
  [upper route/platform undersides](issue-32-room-2-iteration-2-upper.png).

## Before / after

Before views:

- [entry](issue-32-room-2-before-entry.png)
- [lower traversal](issue-32-room-2-before-lower-traversal.png)
- [platform sequence](issue-32-room-2-before-platform-sequence.png)
- [sticky wall](issue-32-room-2-before-sticky-wall.png)
- [upper volume](issue-32-room-2-before-upper-volume.png)
- [exit side](issue-32-room-2-before-exit.png)

Final/second-pass views:

- [entry](issue-32-room-2-iteration-2-entry.png)
- [platform sequence](issue-32-room-2-after-platform-sequence.png)
- [sticky wall](issue-32-room-2-iteration-1-sticky.png) (unchanged by the
  second-pass platform-only refinement)
- [upper volume](issue-32-room-2-iteration-2-upper.png)
- [observation framing](issue-32-room-2-iteration-1-observation.png)
- [production-build entry](issue-32-room-2-production-entry.png)
- [collision-overlay alignment](issue-32-room-2-after-collision-overlay.png)

## Renderer diagnostics

Values are draw calls / triangles / GPU geometries / textures / programs /
scene objects / lights. Both samples use the standard Room 2 safe-floor spawn
and opening camera heading. The viewport changed from 1600 × 900 to 1280 × 720;
that does not change scene draw-call or triangle counts.

| State | Diagnostics |
| --- | --- |
| Before | 26 / 2,772 / 97 / 9 / 12 / 875 / 18 |
| After | 51 / 7,156 / 152 / 9 / 12 / 1,018 / 18 |

The pass adds 25 visible calls and 4,384 visible triangles at the entry pose.
The additional cost is concentrated in chamfered wall modules and platform
support silhouettes. Texture and shader-program counts do not increase, and
the light count remains unchanged. The full scene has 68 instanced meshes in
the after sample. Shared Containment textures now occupy 917,504 authored
source bytes because two 64-pixel-high signage rows were added without
resampling the four approved Room 1 rows.

## Collision and gameplay verification

- Frozen development collision fingerprint: passed for all 130 colliders.
- Production collision exception: still only the explicit Room 1 soluble
  development barrier.
- Overlay evidence shows the visual tread aligned to the authoritative
  platform top, while supports remain outside `collisionMeshes`.
- Real keyboard controls were used from the Room 2 checkpoint through the
  lower platform sequence; the final pass was manually landed on Platform A.
- Debug Room 2 checkpoint recovery and production restart back to Room 1 were
  exercised.
- A complete final Room 2 route and final sticky attachment were not completed
  before the requested stop; this remains a manual verification gap.

## Validation

Verified on 22 August 2026:

```text
npm run type-check  passed
npm test            passed; 123/123 tests
npm run build       passed; 73 modules transformed
git diff --check    passed
```

The production preview loaded `index.html`, JavaScript, and CSS with HTTP 200
responses. It reported no current console errors, warnings, shader failures,
or missing assets. The existing Vite single-chunk size advisory remains. The
production output is 874.01 kB minified / 221.07 kB gzip for JavaScript,
10.91 kB / 3.47 kB gzip for CSS, and 0.82 kB / 0.48 kB gzip for HTML.

## Room 1 regression

[Room 1 spawn/pod](issue-32-room-1-regression-spawn.png) was re-captured from
the production build and retains the approved composition and materials. The
shared signage atlas grew vertically so every original Room 1 row remains the
same 512 × 64 pixels; Room 1 material values and geometry were not changed. A
new post-change Room 1 sticky-wall capture was not completed before the
requested stop; the approved sticky material itself is unchanged.

## Remaining visual weaknesses

- The upper canopy is intentionally sparse, but the steepest ground-camera
  view lets Bob and the HUD obscure part of it.
- Fine actuator hardware is clearest at close and medium distances; from the
  far side of the chamber it consolidates into a dark mechanical silhouette.
- The observation cavity is deliberately unlit pending issue #33, so its depth
  is subtler than it will be after the lighting pass.
