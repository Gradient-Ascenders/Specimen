# Level 1 and Level 3 gameplay polish

Branch: `fix/level1-level3-gameplay-polish`, based on `origin/main` at `1a52d8c`.

## Level 1 availability

`PersistentSlimePair` unconditionally unlocked Goop during construction. The
runtime also showed his live character whenever the Room 5 reveal was outside
the visible room set. Together these put a second Goop at Bob's initial spawn
and allowed Tab to bypass the rescue.

Containment now opts out of the helper's initial unlock. Both exact body objects
remain registered. The live Goop presentation and inactive locator group are
hidden while Goop is unavailable. Room 5's independent containment/release
presentation remains driven by its existing sequence.

The release ends Level 1. Its completion callback unlocks Goop before the session
captures the progression snapshot for Level 2, and places the live body at the
release presentation's endpoint. Full Level 1 restart locks Goop again;
checkpoint recovery preserves the current unlock state. Cultivation retains the
helper's existing default of both characters available.

## Transit geometry

Measured authored world-space top heights, in metres:

| Surface | Before | After |
| --- | ---: | ---: |
| Bridge start anchor / catwalk | 2.50 | 2.50 |
| Bridge end anchor | 0.80 | 0.40 |
| Exit deck | 0.40 | 0.40 |
| Ramp top at z=150 | approximately 0.65 | 0.40 |
| Dry apron | 0.55 | 0.40 |
| Hallway / next-room floor | 0.40 | 0.40 |

The bridge controller previously replaced the authored endpoint heights with
independent centre heights. It now derives its slab centre from the anchor top
heights and rotated half-thickness. The anchor, exit deck and hallway meet at
z=147 and z=155. The ramp and apron occupy x=7..14, beside the deck rather than
overlapping it. The ramp top runs from y=-0.98 at z=140 to y=0.40 at z=150.

The apron and exit deck opt into the existing precise movement-corner query,
already used by the ramp. This avoids conservative expanded-box corners
blocking a sphere at the otherwise level slope-to-bank joint. No global physics
behaviour changed. Volt can walk from the bridge to the shared exit.

The doorway had overlapping wall/jamb inner faces, intersecting guides, and
duplicate lintel/header/ceiling undersides. The geometry now meets at distinct
boundaries. Crate corner boxes shared wood side and cap planes and intersected
the full-box bands. Thin face-mounted straps, separated uprights and an outer
brace retain the shipping-crate appearance without those duplicate surfaces.
The wooden collider still ends exactly at the shutter's bottom, y=3.10. Volt's
existing bottom-rail contact remains the same object in the same location.

## Acid and performance

The maintenance basin used a plain standard material with pulsing emission;
the transit pit used a static standard material. Both now use the existing
`AcidSurfaceMaterial`, including its baked noise lookup, flow and bubble stages.
There is no new shader or external asset. No other authored Level 3 hazardous
liquid surface was found in the active scene composition.

Each room advances its material through its existing fixed-step update and
disposes its owned material/noise texture through its existing teardown. Transit
continues borrowing the maintenance texture kit without owning it. The acid
remains outside static batching, preserving its custom compile hook. Uniform
updates do not change material versions or program cache keys.

The change adds the established acid fragment work to two existing draw
surfaces and one small baked noise texture per room. It adds no acid draw
surfaces, lights, shadow maps, render targets, per-frame allocations, or dynamic
material recompilation. Crate details remain in static batching. The cost is
primarily additional fragment shading over the visible basin area, so Minimum
and Performance resolution caps remain relevant on Intel UHD 620.

## Evidence and limits

`tests/browser/GameplayPolish.spec.ts` captures the plain production URL in
installed Edge, across Standard/Normal, Standard/Performance at 0.75 resolution
scale, and Minimum/Normal. It observes the production session without enabling
debug query parameters. Existing controller contracts stage release and level
handoffs; this is not a full unassisted puzzle playthrough.

Evidence is generated under `artifacts/gameplay-polish/{before,after}/` with one
folder per profile. It includes fresh Level 1, Room 5 containment, maintenance
acid, transit acid, and front/side/rear doorway views. Volt's existing gameplay
light accompanies the Level 3 inspection positions. JSON snapshots include
graphics settings, draw calls, triangles, shader-program counts and GL errors.

Unit checks cover locked switching/recovery/restart, Cultivation availability,
real-body traversal and continuous collision support, world-space alignment,
crate/frame separation, acid identity/animation/disposal, and the existing acid
hazard identity rules. Browser checks cover fresh-start visibility, locked Tab,
checkpoint recovery, restart, release/handoff, Level 2 availability and console /
HTTP errors.

Edge reported `Intel(R) UHD Graphics 620`, ANGLE / Direct3D11. All three baseline
and all three after journeys passed without console, HTTP or WebGL errors.
The after screenshots were inspected at front, side and rear gameplay angles,
including Minimum and Performance views. They retain the dark room lighting.

The five Standard/Normal views had the following rendering counts; Performance
at 0.75 scale had the same draw counts:

| View | Draw calls before / after | Triangles before / after |
| --- | ---: | ---: |
| Maintenance basin | 568 / 568 | 131996 / 132092 |
| Transit pit | 363 / 363 | 83720 / 83816 |
| Door front | 191 / 189 | 52104 / 52176 |
| Door side | 175 / 175 | 51912 / 52008 |
| Door rear | 531 / 531 | 85772 / 85868 |

Minimum calls were 339/339, 233/233, 147/146, 139/139 and 321/321 respectively.
Prepared program count changed from 74 to 76 and texture count from 60 to 62.
Each added noise texture is 256×256, one byte per texel, without mipmaps. These
counts include the renderer's passes; they are not single-pass mesh counts.
Reliable frame-time qualification requires a controlled gameplay benchmark;
these staged checks do not establish an FPS guarantee or replace a complete
unassisted puzzle playthrough.

[Before / after gallery](../artifacts/gameplay-polish/comparison.html),
[render-count evidence](../artifacts/gameplay-polish/render-comparison.json).

Type-check, the production build and production-layout validation passed. The
existing Vite large-chunk advisory remains. The existing archive generator
produced a validated 12,852,138-byte ZIP with `index.html` at its root:
`artifacts/specimen-production.zip`. SHA-256:
`d6aa58e03258838044f08180b36c0ee34a567318e7e411c7117dc9fb9a91d69a`.

Final verification:

- `node --test --test-concurrency=1 tests/*.test.ts`: **929 passed**, zero
  failures/skips, 183.4 seconds. Run outside the filesystem sandbox because the
  production-validator test creates a temporary symbolic link.
- `npm run type-check`, `npm run build`, `npm run validate:production`: passed.
- `node scripts/create-production-archive.mjs`: passed, including ZIP root and
  file validation. This is the existing generator invoked by `npm run archive`
  after its build step.
- `GameplayPolish.spec.ts`: **3 before + 3 after profile journeys passed** on
  installed Edge / Intel UHD 620. The gallery contains 42 screenshots.
- `ProductionSmoke.spec.ts --grep 'plain production boots'` with
  `SPECIMEN_SMOKE_ARCHIVE=artifacts/specimen-production.zip`: **1 passed**,
  35.4 seconds. This journey uses the extracted ZIP at `/group-folder/`, no
  query parameters, no route interception, and no runtime observer. It covers
  credits, starting, movement input, pause, restart and resume, and checks all
  asset requests remain inside the nested deployment path.

The three changes are separate local commits. Nothing was pushed and no PR was
opened. Generated evidence and the ZIP remain ignored build artifacts.
