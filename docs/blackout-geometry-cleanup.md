# Level 3 geometry cleanup

This pass continues `codex/final-polish-batch-3`. Earlier drone refinements and
rod removals are preserved. See [the final review](level-3-polish-review.md) for
the combined PR scope and validation, and [committed visual evidence](evidence/level-3-polish/README.md).

## Causes and corrections

- **Catwalk end:** the service catwalk and start anchor submitted coplanar top
  and underside triangles over the same area (4.9 square metres on the top).
  Subtract duplicate render coverage before static batching. Keep the catwalk's
  authored collision box.
- **Bridge:** its sloping top originally started at the centre of the flat
  anchor, descending underneath that slab before reaching its edge. Align the
  existing approach slab with the bridge heading and begin the slope at its
  forward edge. The slab centre and top height, far endpoint, switch interaction,
  extension/retraction timing, and lock mechanic remain unchanged. The approach
  footprint rotates to match the bridge. Use the existing precise movement
  corner policy on the bridge so a sphere can cross this exact butt join.
- **Tunnel elbows:** wall thickness was centred on the passage boundaries,
  leaving 15 cm steps. Put the thickness outside the intended clear bore.
  Recess the thin inlet ribs to the wall face and move the first frame behind
  the entrance wall face. Keep the route, floor heights and ceiling clearance.
- **Rising duct ends:** surplus length and rotated end caps projected into the
  adjoining elbow and Room 2 doorway. Trim render triangles at the connector
  planes, including the cross-room doorway join. Retain the authored box bounds
  for collision queries. Remove duplicate coplanar render coverage after trimming.
- **Floor strip:** sink the four hazard markings until their tops meet y=0,
  retaining their stripe detail. Flatten the two under-apron risers that actually
  extended 5 cm above the starting deck. Their bases stay unchanged. Both apron
  paths can now be walked across without jumping.

The surface repair preserves interpolated UVs/normals and original collider
bounds. Replacement buffers are owned and disposed by the existing room
lifecycle. These are construction-time operations before existing static
batching; they introduce no per-frame work, lights, shadow maps, or materials.
Cut boundaries can add static triangles. Hardware FPS was not benchmarked.

## Files in this cleanup

- `src/levels/BlackoutMaintenanceBay.ts`
- `src/levels/BlackoutTransitRoom.ts`
- `src/levels/BlackoutTransitController.ts` (bridge corner policy only; prior drone edits retained)
- `src/render/geometry/CoplanarSurfaceGeometry.ts`
- `tests/BlackoutGeometryCleanup.test.ts`
- `tests/BlackoutMaintenanceMaterials.test.ts`
- `tests/BlackoutTransitRoom.test.ts`
- `tests/fixtures/blackout-maintenance-authored-surfaces.json`
- `tests/fixtures/blackout-transit-authored-surfaces.json`
- `tests/smoke/BlackoutGeometryCleanup.spec.ts`
- This document.

Fixtures retain strict authored-surface fingerprints. Only intentional moved
geometry and repaired render topology are updated; the material test supports
non-indexed replacement geometry without weakening its fingerprint assertions.

## Validation and evidence

Completed on 22 October 2026:

- `npm test`: **1,493 passed, 0 failed**, including checkpoint/reset coverage.
  The first sandboxed run could not create the production-validator symlink;
  the unrestricted rerun passed in full without changing that test.
- `node --test tests/BlackoutGeometryCleanup.test.ts`: **3 passed**.
- `npm run type-check`: passed.
- `npm run build`: passed; existing large-chunk advisory remains.
- `npm run validate:production`: **77 files validated**.
- Production Chromium geometry smoke: **1 passed**, no console, asset-loading,
  or WebGL errors. The unrestricted full-suite log is
  `test-results/geometry-full-unrestricted.log`; the final browser log is
  `test-results/geometry-browser-evidence.log`.
- `git diff --check`: passed.

The focused regression exercises actual submitted triangles, including combined
Room 1/Room 2 doorway geometry, flush bridge corners, retained collision bounds,
buffer disposal, finite UVs, walking over both apron lips, and walking from the
approach across the bridge to the exit without jumping.

The production browser test runs under `/group-folder/`. It walks Volt through
the inlet, both turns, rising shaft, outlet and catwalk; Bob physically holds the
wall switch, then Volt crosses the deployed bridge onto the exit deck. The test
uses staged room/body positions and removes drone threats for geometry inspection;
it is not an uninterrupted three-slime puzzle playthrough. Existing automated
tests also cover switch/lock behavior, checkpoint recovery and room resets.

Screenshots and traversal/error details are generated under the ignored directory
`artifacts/evidence/geometry-cleanup/`:

- `catwalk-end-clean.png`
- `bridge-catwalk-flush-join.png`
- `bridge-join-looking-back.png`
- `bridge-full-alignment.png` (wide overview is dark under normal Blackout lighting)
- `tunnel-entrance.png`
- `tunnel-corner.png`
- `tunnel-turn-look-back.png`
- `tunnel-second-turn-look-back.png`
- `tunnel-rising-section.png`
- `tunnel-outlet.png`
- `room-1-flush-floor-strip.png`
- `room-1-flush-apron-lip.png`
- `browser-results.json`

Views use the existing Volt navigation light and unchanged exposure. The survey
camera is staged for reproducibility. Close views support the surface inspection;
the distant room remains intentionally dark. Test-only session instrumentation
is applied to the browser response, never to production source or built files.

## Local testing

1. Run `npm run dev`, enter Level 3, and walk over the starting platform's
   transverse apron edge and yellow floor markings without jumping.
2. Use Volt's tunnel. Inspect the entrance ribs, turn left, turn right into the
   rising shaft, then look back. Continue through the Room 2 doorway and check
   the wall and ceiling joints from both sides.
3. At the end of Room 2's catwalk, inspect the anchor while moving the camera.
   Have Bob hold the wall button, cross with Volt and lock the bridge, then
   regroup. Cross the join in both directions and check the approach/deck edges.
4. Retry the room/checkpoint and repeat the button/bridge sequence.

Reproduce automated checks with `npm test`, `npm run type-check`, `npm run build`,
`npm run validate:production`, and
`npx playwright test tests/smoke/BlackoutGeometryCleanup.spec.ts --config playwright.smoke.config.ts`.

## Follow-up: lower wall-junction gap

The initial cleanup left a triangular opening where the rising shaft's side
walls meet the turn chamber at z=63. Rotating the boxes tilts their end faces:
the lower corner ends about 16.5 cm beyond that connector plane. Clipping the
overhang alone cannot create the missing lower portion. The old overlap audit
correctly rejected duplicate surfaces but did not test missing coverage.

Extend the existing side-wall render skins along their slope before clipping
them to the same connector planes. The padding is derived from wall height and
duct angle, plus 2 mm to put the temporary end caps wholly outside the cut.
Both sides now cover the complete vertical join, including the floor corner.
Keep their original local collision bounds through scaling, clipping and static
surface repair. Metric UV generation still runs afterward, preserving texture
scale and anchoring. No patch mesh, material, draw call or light is added.
Catwalk, bridge, other tunnel pieces and floor fixes are unchanged. The adjacent
turn wall's render fingerprint changes because the existing coplanar cleanup
recalculates its boundary against the corrected side skin; its transform and
collider remain unchanged.

Files touched in this follow-up:

- `src/levels/BlackoutMaintenanceBay.ts`
- `src/render/geometry/CoplanarSurfaceGeometry.ts`
- `tests/BlackoutGeometryCleanup.test.ts`
- `tests/fixtures/blackout-maintenance-authored-surfaces.json` (three render fingerprints only)
- `tests/smoke/BlackoutGeometryCleanup.spec.ts` (three junction survey views)
- This document.

The new regression fails before the correction on the uncovered corner. It
casts rays through the actual submitted opaque triangles, checking both walls
from near floor level upward, and verifies identical authored collision bounds.
The existing duplicate-surface and full tunnel/bridge traversal checks remain.
The follow-up's focused run passed **49 tests**; type-check, build and
production-layout validation (**77 files**) passed. The 1,493-test full run
above predates this small follow-up.

Matching before/after survey images are saved under the ignored directory
`artifacts/evidence/tunnel-wall-gap/`, with front, low and reverse views. They
use identical camera positions, normal exposure and Volt's existing light.
The after views were visually inspected: the triangular opening is closed and
the lower wall meets the floor continuously. Production Chromium smoke passed
(**1 test**) with grounded tunnel and deployed-bridge traversal and no console,
asset-loading or WebGL errors. Duplicate-surface audits remain clear in the
tunnel and combined-room doorway; collider bounds remain identical.
