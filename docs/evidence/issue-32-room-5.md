# Issue #32 — Room 5 art pass evidence

Room 5 now presents the primary containment chamber as the level's hero
machine and the observation room as its secondary control space. All additions
are presentation-only and wrap the frozen gameplay geometry.

## Before and after

| View | Before | After |
| --- | --- | --- |
| Room entry | [before](issue-32-room-5-before-entry.png) | [after](issue-32-room-5-after-entry.png) |
| Chamber | [before](issue-32-room-5-before-chamber-wide.png) | [hero wide](issue-32-room-5-chamber-hero-wide.png) |

## Final Room 5 set

- [chamber close-up](issue-32-room-5-chamber-close.png)
- [corrected specimen sign](issue-32-room-5-specimen-sign-fixed.png)
- [lower containment machinery](issue-32-room-5-chamber-lower-machinery.png)
- [upper service connection](issue-32-room-5-upper-service.png)
- [upper traversal](issue-32-room-5-upper-traversal.png)
- [sticky and laser route](issue-32-room-5-sticky-laser-route.png)
- [east sticky ascent](issue-32-room-5-east-sticky-ascent.png)
- [observation approach](issue-32-room-5-observation-approach.png)
- [observation console and lever](issue-32-room-5-observation-console-lever.png)
- [intact soluble composite](issue-32-room-5-soluble-composite-intact.png)
- [partial gameplay dissolve](issue-32-room-5-soluble-composite-partial.png)
- [completion/lever state](issue-32-room-5-completion-console.png)
- [collision overlay](issue-32-room-5-collision-overlay.png)
- [production-build gameplay view](issue-32-room-5-production-overall.png)

The four independently addressable, visual-only panel previews are
[front](issue-32-room-5-panel-preview-front.png),
[rear](issue-32-room-5-panel-preview-rear.png),
[left](issue-32-room-5-panel-preview-left.png), and
[right](issue-32-room-5-panel-preview-right.png). Production and reset state is
closed for every pivot; no panel animation was added.

## Rendered reviews

The first pass identified a dark, cage-like chamber silhouette. The second
pass replaced the dominant dark posts with larger pale ceramic housings,
strengthened the upper and lower rings, retained one legible overhead service
route, and removed the temptation to add more micro-hardware. A restrained
floor inlay, not additional solids, now reinforces the focal area.

The chamber is materially stronger than the preceding rooms, but the frozen
upper traversal platform can interrupt the observation-room sightline from
some ordinary camera angles. The art leaves the validated opening and route
untouched. Lighting also remains deliberately flat because Room 5 dynamic
lighting, alarms, particles, and release VFX belong to issue #33.

## Gameplay and state checks

- The entry-to-lower-platform and lower-platform-to-chamber-roof moves were
  played with normal keyboard/mouse control. The player landed on the frozen
  `room-5-containment-glass` roof.
- Chamber, sticky, laser, upper-route, observation, lever, soluble-door, and
  exit states were inspected with the gameplay camera. Debug placement was
  used for some distant review views; it did not alter production state.
- The authoritative lever was attached to and drove the existing ending from
  `traversal` through `leverPull` to `released`; completion emitted once.
- Death/Retry recovered Room 5, and pause-menu `Restart trial` returned to the
  Room 1 spawn/objective in the production build.
- The dissolve regression exercised interruption, partial dissolve, complete
  dissolve/collision synchronization, and five repeated reset cycles. Direct
  inspection at 50% confirmed the existing visible, depth, and distance
  dissolve passes remained attached. Restart restored progress zero, collision,
  and the intact composite source material.
- Runtime restart restored all panel pivots to zero rotation, the lever to its
  closed angle, the contained specimen to its initial position, and the ending
  to `traversal`.

## Collision and ownership

The Room 5 collider count remains 35. The frozen fixture hash remains
`c48e84b8880a05a68064a5353a24e6efdd17bb8eecffcb11a02b7f9033bfe668`.
The overlay proof shows the chamber, moving platforms, lever, and soluble door
still align with their authoritative geometry. The new art objects are tagged
visual-only and create no collision or gameplay state.

Static moving-platform dressings are children of the authoritative platform
roots. Shared art geometry and materials come from `ContainmentArtResources`;
repeated structural hardware uses instanced groups. The independently
addressable panel pivots stay as ordinary groups. Disposal detaches moving
decorations before platform disposal so shared resources are not incorrectly
released.

## Performance snapshot

The comparable pre-pass Room 5 entry measured 75 draw calls, 8,252 triangles,
1,288 scene objects, 18 lights, 121 unique materials, 155 instanced meshes,
247 uploaded geometries, 10 textures, and 16 programs. The first comparable
post-pass entry measured 138 draw calls, 15,816 triangles, 1,552 scene objects,
18 lights, 123 unique materials, 218 instanced meshes, 307 uploaded geometries,
10 textures, and 16 programs. A broader hero review after lazy dissolve upload
measured 163 draw calls and 19,334 triangles; camera-dependent broad reveal
peaked at 214 draw calls and 24,686 triangles.

No light, texture sampler, or continuously updated static-art system was added.
The shared procedural atlas grew from 512×960 to 512×1280 while preserving the
existing rows pixel-for-pixel; estimated shared texture memory is 2,768,896
bytes. Restart/recreation diagnostics stayed stable.

## Earlier-room regression set

- [Room 1 spawn/pod](issue-32-room-5-regression-room-1-spawn.png)
- [Room 2 traversal](issue-32-room-5-regression-room-2-traversal.png)
- [Room 3 acid/test rig](issue-32-room-5-regression-room-3-acid-rig.png)
- [Room 4 elevator](issue-32-room-5-regression-room-4-elevator.png)

No shared-resource visual regression was observed. Rooms 1–4 were not
redesigned.

## Validation

- `npm run type-check` — passed.
- `npm test` — 126/126 passed.
- `npm run build` — passed with the existing Vite large-chunk warning; 76
  modules transformed, JavaScript 932.68 kB (236.18 kB gzip).
- `git diff --check` — passed.
- Production `dist/` served through `vite preview` — Room 5 loaded with no
  console errors, warnings, failed requests, or shader/material failures.
