# Issue #32 Phase 1.5 redesign evidence

Phase 1.5 corrects the Room 1 visual direction from primitive-heavy sci-fi
dressing toward **Clean Biotech Stylized Realism** while retaining the Phase 1
collision, resource, state, overlay, and capture infrastructure. Rooms 2–5
remain outside this pass.

Verified on 22 August 2026 with Node.js 24.19.0, npm 11.18.0, and headless
Chrome 152.0.0.0 on Linux at 1280 × 720, DPR 1.

## Validation

```text
npm run type-check  passed
npm test            passed; 120/120 tests
npm run build       passed; 72 modules transformed
git diff --check    passed
```

The focused art and collision run also passed 9/9 tests:

```text
node --test tests/ContainmentArt.test.ts tests/ContainmentColliderSnapshot.test.ts
```

The frozen fixture still matches all 130 development colliders. Production
still contains 129 and differs only by the explicitly named Room 1 development
soluble barrier. No collider name, transform, local dimensions, tag, movement
face mode, interaction role, texture role, soluble state, or parent path was
changed by the redesign. Visual-only art remains absent from
`collisionMeshes`.

The production output is 862.59 kB minified / 218.74 kB gzip for JavaScript,
10.91 kB / 3.47 kB gzip for CSS, and 0.82 kB / 0.49 kB gzip for HTML. Relative
`base: './'` remains configured. JavaScript increased by 26.98 kB minified /
9.14 kB gzip from Phase 1, principally from the project-authored vector-stroke
glyph data and imported Three.js rounded-box implementation. Vite's existing
single-chunk advisory remains.

## Three-stage fixed-camera comparison

The original grey-box and Phase 1 columns are retained unchanged. Phase 1.5
uses the same fixed camera bookmarks where available. Its pod-wide view moves
to a three-quarter composition to assess construction and glass seating, so
that row is visual evidence rather than a strict counter benchmark.

| View | Original grey-box | Phase 1 | Phase 1.5 |
| --- | --- | --- | --- |
| Spawn | [original](issue-32-phase-1-before-spawn.png) | [Phase 1](issue-32-phase-1-after-spawn.png) | [Phase 1.5](issue-32-phase-1.5-final-spawn.png) |
| Specimen pod | [original](issue-32-phase-1-before-pod.png) | [Phase 1](issue-32-phase-1-after-pod.png) | [wide](issue-32-phase-1.5-final-pod-wide.png) · [close](issue-32-phase-1.5-final-pod-close.png) |
| Locked door | [original](issue-32-phase-1-before-locked-door.png) | [Phase 1](issue-32-phase-1-after-locked-door.png) | [Phase 1.5](issue-32-phase-1.5-final-door.png) |
| Sticky wall | [original](issue-32-phase-1-before-sticky-wall.png) | [Phase 1](issue-32-phase-1-after-sticky-wall.png) | [approach](issue-32-phase-1.5-final-sticky-approach.png) · [traversal](issue-32-phase-1.5-final-sticky-traversal.png) |
| Vent entrance | [original](issue-32-phase-1-before-vent-entrance.png) | [Phase 1](issue-32-phase-1-after-vent-entrance.png) | [Phase 1.5](issue-32-phase-1.5-final-vent-approach.png) |
| Sticky vent tile | [original](issue-32-phase-1-before-sticky-vent-tile.png) | [Phase 1](issue-32-phase-1-after-sticky-vent-tile.png) | [Phase 1.5](issue-32-phase-1.5-final-vent-tile.png) |

Additional final evidence:

- [live spawn-to-vent gameplay](issue-32-phase-1.5-final-gameplay-route.png);
- [sticky material in grayscale](issue-32-phase-1.5-final-sticky-grayscale.png);
- [debug collision overlay alignment](issue-32-phase-1.5-final-collision-overlay.png);
- [production-build spawn](issue-32-phase-1.5-production-spawn.png).

## Renderer diagnostics

Values are calls / triangles / GPU geometries / textures / programs / scene
objects / lights. Geometry counts are lazy-upload and camera dependent, so
matching bookmarks are more useful than treating one value as a global total.

| View | Original grey-box | Phase 1 | Phase 1.5 |
| --- | --- | --- | --- |
| Spawn | 100 / 3,628 / 97 / 1 / 7 / 744 / 18 | 86 / 10,284 / 53 / 8 / 10 / 678 / 18 | 82 / 15,042 / 68 / 8 / 7 / 739 / 18 |
| Specimen pod | 172 / 6,264 / 153 / 1 / 9 / 744 / 18 | 140 / 16,396 / 83 / 10 / 12 / 678 / 18 | 121 / 17,490 / 104 / 10 / 11 / 739 / 18 |
| Locked door | 168 / 5,732 / 168 / 1 / 9 / 744 / 18 | 113 / 5,382 / 92 / 10 / 12 / 678 / 18 | 82 / 4,610 / 117 / 10 / 11 / 739 / 18 |
| Sticky approach | 107 / 2,928 / 168 / 1 / 9 / 744 / 18 | 69 / 9,412 / 92 / 10 / 12 / 678 / 18 | 57 / 10,228 / 117 / 10 / 11 / 739 / 18 |
| Vent entrance | 177 / 5,780 / 181 / 1 / 9 / 744 / 18 | 112 / 14,810 / 98 / 10 / 12 / 678 / 18 | 100 / 13,892 / 126 / 10 / 11 / 739 / 18 |
| Sticky vent tile | 41 / 2,304 / 182 / 1 / 9 / 744 / 18 | 51 / 12,240 / 98 / 10 / 12 / 678 / 18 | 95 / 17,646 / 132 / 10 / 11 / 739 / 18 |

Phase 1.5 spends triangles on manufactured chamfers, large organic silhouettes,
and the hero machine, while removing the repeated physical suction-ring grid.
At four comparable exterior bookmarks it reduces Phase 1 draw calls; the tight
vent view rises because its camera sees the surrounding panel skin and deeper
duct construction. Scene objects rise from 678 to 739 but remain below the
original outlined grey-box's 744. No light was added: all views remain at 18.

The active Room 1 slice reports eight instanced meshes. The resource library
owns nine textures, twenty shared materials, and sixty-two shared/cached
geometries after the slice has requested its physical bevel sizes. The larger
geometry count is intentional: bevel dimensions are baked so non-uniform scale
does not distort edge radii. Exact repeated panel sizes are instanced; unique
hero housings reuse cache entries where dimensions match. The nine procedural
source buffers total 655,360 bytes.

Software-rendered absolute frame timing was not treated as representative.
Performance acceptance still requires a Chrome/Ubuntu pass on representative
physical lab hardware.

## Deliberate visual iterations

### First rendered redesign

[Iteration 1 spawn](issue-32-phase-1.5-iteration-1-spawn.png),
[pod](issue-32-phase-1.5-iteration-1-pod.png),
[door](issue-32-phase-1.5-iteration-1-door.png),
[sticky](issue-32-phase-1.5-iteration-1-sticky.png), and
[vent](issue-32-phase-1.5-iteration-1-vent.png) were captured and inspected.
The panel layering was a clear structural improvement, but the pod remained
too tall and top-heavy, its black pedestal punched through the shell, the door
inset was oversized, signage strokes were too thin, and the sticky membrane
read as a curtain rather than a seated biological material.

The next pass covered the pedestal collider, lowered and tightened the machine,
strengthened its base and glass seating, reduced the door recess, increased
graphic weight, and replaced repeated relief with sparse large organic forms.

### Second rendered redesign

[Iteration 2 spawn](issue-32-phase-1.5-iteration-2-spawn.png),
[pod](issue-32-phase-1.5-iteration-2-pod.png),
[door](issue-32-phase-1.5-iteration-2-door.png),
[sticky](issue-32-phase-1.5-iteration-2-sticky.png), and
[vent](issue-32-phase-1.5-iteration-2-vent.png) were captured and inspected.
The machine and door were credible at gameplay scale, but organic UVs still
revealed world-unit repetition, the backing crushed toward black, and the pod
needed a stronger functional connection rather than another decorative bar.

The final pass normalized the organic planar UVs, lightened the substrate,
tightened the upper machine, connected a side pressure line and couplings, and
corrected sign-plane orientation. A third focused review of
[pod](issue-32-phase-1.5-iteration-3-pod.png),
[door](issue-32-phase-1.5-iteration-3-door.png), and
[sticky](issue-32-phase-1.5-iteration-3-sticky.png) caught the final mirrored
sign orientation before the final captures were made.

## Final visual assessment

- Walls now read as large manufactured panel modules over recessed machinery,
  rather than collider boxes with black bars placed on top.
- Chamfers and depth carry material quality; procedural ceramic response is not
  visible as an obvious pattern at gameplay distance.
- Cyan is limited to pale non-emissive glass, a small number of instruments,
  and semantic graphics. Ceiling fixtures read neutral white.
- The pod reads as an instrumented containment machine with base, glass seats,
  service housing, supports, feed connection, pressure line, and control block,
  rather than a transparent cage.
- The false-lead door has a cavity, jamb, gasket, slab, track, actuator, and
  state device that imply how it could open.
- Sticky material reads through irregular silhouette, recess, clamps, relief,
  tendrils, and wet response. Its grayscale capture remains distinct.
- Large quiet fields retain negative space; exposed substrate is concentrated
  around functional focal points.

The result remains intentionally procedural rather than a bespoke sculpted or
GLB environment. At extreme close range the pod's upper coupler is still a
simple lathed/prismatic assembly, and the fixed low spawn camera emphasizes
the base more than the full machine. Changing the latter would require a camera
or spawn-composition decision beyond this collision-preserving pass. The vent
interior is sparse by design because additional depth would compete with Bob
and the camera in the validated tight volume.

Within those constraints, the final inspected screenshots no longer read as a
grid of thin bars, stacked rectangles, or suction-ring obstacle props. The
language is mature enough to propose for Rooms 2–5, subject to the requested
manual approval of this quality gate.

## Gameplay, overlay, production, and console

The development game was played with keyboard input from spawn to the Room 1
sticky wall, up its authored surface, and onto
`duct-segment-a-sticky-vent-tile`. Bob reached approximately
`[-4.58, 5.69, 7.69]`; camera clearance remained usable. Pressing `R` executed
one authoritative restart and returned Bob to approximately
`[-0.21, 0.46, -2.60]` without reloading.

The debug overlay was enabled only in the development runtime and visually
inspected on the Room 1/vent-route colliders. Cyan and magenta outlines followed
the unchanged collider transforms and remained separate from the polished art.
The production build created no debug panel or overlay controls.

The final `dist/` was served with:

```text
npm run preview -- --host 127.0.0.1
```

It was opened at 1280 × 720, DPR 1. The canvas was 1280 × 720, Room 1 started,
and `R` retained the `Climb through the vent` objective after authoritative
recovery. The production page emitted zero console errors and zero warnings;
all requested assets succeeded:

```text
GET /                              200
GET /assets/index-ZD8xlmMG.js     200
GET /assets/index-C4EX9ji3.css    200
```

The browser session also retained four `ReadPixels` GPU-stall warnings from
earlier development screenshot readbacks at port 5173. They are software-WebGL
capture warnings, not production application errors; a production-only console
query returned zero messages. The Vite development server also logged two
transient pre-transform misses while source files were being atomically
replaced during editing. Clean development reloads, the final production
session, and every asset request after the completed edits were successful.

## Authorship and scope

All Phase 1.5 geometry, deterministic texture data, and vector-stroke signage
are project-authored. No Blender/GLB, font, downloaded texture, model, or other
third-party art asset was added. `CREDITS.md` records this explicitly rather
than inventing a third-party credit.

Rooms 2–5 received no art implementation. Dynamic lighting, shadows, alarms,
flicker, sparks, smoke, particles, release animation/VFX, bloom, and
post-processing remain reserved for issue #33.
