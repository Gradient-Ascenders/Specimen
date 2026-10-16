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
heights and offsets along the deck normal by its half-thickness. An explicit
longitudinal direction and horizontal width axis prevent roll, keeping both top
corners at each endpoint level with their anchor. The anchor, exit deck and hallway meet at
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

## Verification

Unit checks cover locked switching/recovery/restart, Cultivation availability,
real-body traversal and continuous collision support, all four bridge endpoint
top corners, crate/frame separation, acid identity/animation/disposal, and the
existing acid hazard identity rules.

Run the focused transit checks with:

```text
node --test tests/BlackoutTransitController.test.ts tests/BlackoutTransitTraversal.test.ts tests/BlackoutTransitMaterials.test.ts tests/BlackoutTransitPolish.test.ts
npm run type-check
npm run build
```

`tests/browser/GameplayPolish.spec.ts` checks the ordinary game URL across
Standard/Normal, Standard/Performance at 0.75 resolution scale, and Minimum/Normal.
It covers fresh-start visibility, locked Tab, checkpoint recovery, restart,
release/handoff, Level 2 availability and console/HTTP errors. Existing controller
contracts stage release and level handoffs; this is not a full unassisted puzzle
playthrough or a controlled FPS benchmark. Level 3 inspection uses the existing
gameplay lighting.
