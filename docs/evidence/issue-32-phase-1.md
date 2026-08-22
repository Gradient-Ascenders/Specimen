# Issue #32 Phase 1 verification evidence

Phase 1 establishes the shared Containment art infrastructure and applies it
only to Room 1 through the first sticky/vent transition. This record separates
fixed-camera visual comparison from live gameplay and production-build checks.

Verified on 22 August 2026 with Node.js 24.19.0, npm 11.18.0, and headless
Chrome 152.0.0.0 on Linux at 1280 × 720, DPR 1.

## Automated checks

```text
npm ci              passed; 25 packages, 0 vulnerabilities
npm run type-check  passed
npm test            passed; 120/120 tests
npm run build       passed; 71 modules transformed
git diff --check    passed
```

The production output is 835.61 kB minified / 209.60 kB gzip for the single
JavaScript chunk, 10.91 kB / 3.47 kB gzip for CSS, and 0.82 kB / 0.48 kB gzip
for HTML. Relative `base: './'` remains configured. Compared with the issue #31
record, the JavaScript chunk increased by 37.02 kB minified / 10.03 kB gzip;
there are no downloaded image/model assets. Vite's existing advisory for the
single chunk over 500 kB remains.

Focused coverage establishes:

- the frozen 130-collider development fixture matches exactly;
- production contains 129 colliders and differs only by the explicitly named
  Room 1 development soluble barrier;
- every visual-only Room 1 art object is absent from `collisionMeshes`;
- sticky collider names and tags remain in the full fingerprint;
- texture bytes and configuration are deterministic;
- materials/geometries are shared and no `nonStick` or `bouncy` presentation
  has been invented;
- five egg states and two containment-box states reset deterministically;
- the movable containment-box art root does not affect collision;
- shared and room-owned resource disposal is idempotent and recreate counts
  remain stable;
- the optional overlay is hidden by default, visual-only, follows parent
  collider transforms, and disposes cleanly;
- production contains no legacy always-visible collider outlines.

## Fixed-camera before/after comparison

Each capture used the same gameplay camera target, yaw, pitch, and distance in
the pre-pass and final pass. Collision overlay/debug art was off. Renderer
geometry counts are lazy-upload/warm-up dependent, so the useful comparison is
within the matching camera bookmark rather than treating any single geometry
number as a permanent global total.

| View | Before calls / triangles / geometries / textures / programs / objects / lights | After calls / triangles / geometries / textures / programs / objects / lights |
| --- | --- | --- |
| Spawn | 100 / 3,628 / 97 / 1 / 7 / 744 / 18 | 86 / 10,284 / 53 / 8 / 10 / 678 / 18 |
| Specimen pod | 172 / 6,264 / 153 / 1 / 9 / 744 / 18 | 140 / 16,396 / 83 / 10 / 12 / 678 / 18 |
| Locked door | 168 / 5,732 / 168 / 1 / 9 / 744 / 18 | 113 / 5,382 / 92 / 10 / 12 / 678 / 18 |
| Sticky approach | 107 / 2,928 / 168 / 1 / 9 / 744 / 18 | 69 / 9,412 / 92 / 10 / 12 / 678 / 18 |
| Vent entrance | 177 / 5,780 / 181 / 1 / 9 / 744 / 18 | 112 / 14,810 / 98 / 10 / 12 / 678 / 18 |
| Sticky vent tile | 41 / 2,304 / 182 / 1 / 9 / 744 / 18 | 51 / 12,240 / 98 / 10 / 12 / 678 / 18 |

The pass deliberately trades more triangles for bevel-free primitive framing,
cell cues, shell detail, and shallow duct modules. Removing one line object per
collider and instancing repeated modules reduces draw calls in five of six
bookmarks and reduces the scene object count from 744 to 678. The art library
owns 9 textures, 17 materials, and 5 shared geometries; its source pixel buffers
total 262,144 bytes. No lights were added: all views remain at 18.

Software-rendered absolute frame timing was not treated as representative.
Performance acceptance still requires a Chrome/Ubuntu pass on representative
physical lab hardware.

## Visual iteration and inspection

The fixed views were captured, opened, and visually inspected after each
material/composition pass. Iteration corrected an upside-down signage-atlas
mapping, reduced oversized ceramic normal response, adjusted sticky texture
scale, strengthened containment framing, and split a wall seam that visually
crossed the open vent. The final inspection found:

- the framed pod and pale cyan glass form the spawn focal point;
- the door reads as an inset locked laboratory assembly rather than a red box;
- the sticky wall reads by raised cell/ring structure and wet response as well
  as lime colour;
- the vent has a distinct dark service-metal collar without reducing camera
  clearance;
- signs are concise and legible at their intended gameplay distances;
- large ceramic fields remain quiet and the room is not neon-heavy;
- the debug overlay clearly aligns with the art while remaining absent in
  production.

The live development game was then played with keyboard input from spawn to the
Room 1 sticky wall and onto the sticky vent tile. Bob reached the authored tile
at approximately `[-4.62, 5.69, 6.55]`; the camera retained clearance. Pressing
`R` completed an authoritative restart and restored Bob to approximately
`[-0.21, 0.46, -2.60]` without reloading.

## Captures

| View | Before | After |
| --- | --- | --- |
| Spawn | [before](issue-32-phase-1-before-spawn.png) | [after](issue-32-phase-1-after-spawn.png) |
| Specimen pod | [before](issue-32-phase-1-before-pod.png) | [after](issue-32-phase-1-after-pod.png) |
| Locked door | [before](issue-32-phase-1-before-locked-door.png) | [after](issue-32-phase-1-after-locked-door.png) |
| Sticky wall | [before](issue-32-phase-1-before-sticky-wall.png) | [after](issue-32-phase-1-after-sticky-wall.png) |
| Vent entrance | [before](issue-32-phase-1-before-vent-entrance.png) | [after](issue-32-phase-1-after-vent-entrance.png) |
| Sticky vent tile | [before](issue-32-phase-1-before-sticky-vent-tile.png) | [after](issue-32-phase-1-after-sticky-vent-tile.png) |

Additional inspected evidence:

- [all five egg states](issue-32-phase-1-after-egg-states.png);
- [intact and shattered box states](issue-32-phase-1-after-box-states.png);
- [successful live sticky climb](issue-32-phase-1-gameplay-sticky-climb.png);
- [debug collision overlay](issue-32-phase-1-after-collision-overlay.png).

## Production browser, console, and network

The final `dist/` was served with `npm run preview -- --host 127.0.0.1` and
opened at 1280 × 720, DPR 1. Starting the game loaded the Room 1 production art;
the development test panel and collision-overlay controls were absent.

Chrome reported zero console messages, zero failed requests, and these HTTP
responses:

```text
GET /                              200
GET /assets/index-nscqYxbd.js     200
GET /assets/index-C4EX9ji3.css    200
```

During development screenshot readback, software WebGL emitted GPU-stall
warnings associated with `ReadPixels`; these did not occur in the clean
production-start check and are not an application asset or shader failure.
Two transient module-reload exceptions also appeared while constructor files
were only partially edited; a clean development reload after the completed
changes had no application error. No asset request failed at any stage.

## Authorship, ownership, and scope

All Phase 1 geometry, procedural texture data, bitmap signage, and material
authoring are project-authored. No Blender/GLB or third-party art asset was
introduced, so no new third-party credit is required.

Room 1 groups borrow the level-owned resource library and own only their unique
hero geometry. Repeated create/dispose/recreate tests retained the same 9
textures, 17 materials, and 5 shared geometries, with idempotent disposal.

Rooms 2–5 have not received this art language. Dynamic lighting, shadows,
alarms, flicker, sparks, smoke, particles, release animation/VFX, bloom, and
post-processing remain explicitly reserved for issue #33.
