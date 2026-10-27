# Blackout maintenance bay

First stage of the Level 3 environment pass: a flooded utility workshop with
recessed paired pump intakes, fitted enclosure panels, structural joints, inset
stepping decks, a flush drone service dock and an armoured sliding exit shutter.
The existing acid, entry chute, floor-level electrical vent, corridor, receiver,
maintenance drone and all traversal mechanisms remain with their runtime owners.

The connecting hallway and Volt duct now share the same authored kit. The
hallway has sealed panel recesses, caged practical lights, a screened trolley
bay, a loose overhead cover, a drooping surveillance camera, worn floor plates
and a dim destination sign. The separate duct has folded joints, shallow dents,
cold indicators, an enclosed fan recess and a matching outlet onto Room 2.

## Reuse and authoring

- `generate-maintenance.py` authors the editable assemblies in metres. Game
  `(x,y,z)` maps to Blender `(x,-z,y)`.
- `maintenance-bay.blend` is the editable studio. Only `B3_R1_` objects in
  `Blackout / Maintenance Bay` regenerate; other scenes remain intact.
- `maintenance-bay.glb` contains geometry, finish/region contracts and vertex
  wear. Studio lights, cameras, textures and animation tracks are excluded.
- The three fixed basin plinths reuse Containment Room 2's inset-deck perimeter
  and amber corner recipe, fitted to their original 5 x 7 m tops. Their solid
  foundations reach into the existing basin bed; these are fixed stepping
  blocks rather than hovering platforms.
- All three surveillance cameras use the exact geometry from
  `opening-laboratory/opening-laboratory.glb`, already reused in Levels 1 and 2.
  The generator imports the source only for authoring and retains its four
  camera finish groups. The opening room is excluded from the export.

Native Blender MCP review and deterministic background regeneration are separate
steps. The regenerated source was reopened in the native GUI. Re-exporting that
editable source is reviewed again after deterministic regeneration. GLB and
editable Blender container hashes are not geometry identity checks.

```bash
/home/kevin/bin/blender --background --factory-startup --python-exit-code 1 \
  --python assets/environments/blackout-maintenance/generate-maintenance.py
npm run generate:blackout-maintenance-art
node scripts/generate-blackout-maintenance-art.ts --check
npm run build
```

## Runtime and loading

`BlackoutMaintenanceArt` borrows the existing maintenance kit's roughness and
normal maps for lit surfaces. Neutral base tints and vertex wear replace the old dark albedo on
the new shell. Architecture and landing tops have no passive/emissive fill:
navigation depends on Volt and the maintenance searchlight. Dark structural
backings use a black unlit shader, avoiding full light/shadow evaluation on those pixels. Decks,
panels, pump rims and the shutter armour retain lit surface response.
Existing power state smoothly changes the small practical apertures; standby
indicators are faint and do not illuminate the route. No live light, shadow map
or new texture image is added.

The geometry-only bundle is approximately **325 KB compressed**, with **72 finish/region
batches and 17,717 triangles**. It loads independently of the earlier levels'
banks, uses native asynchronous gzip decoding and finishes before mandatory
shader/first-use preparation. The runtime never loads Blender or the authoring
GLBs. The existing 27 maintenance texture maps remain the only borrowed family.

The four existing corridor spotlights supply irregular pools of amber light;
one fitting is almost dead. A natural forward crossing drops the light behind
the player and emits one quiet positional knock. Volt's first turn emits a
separate rattle. Both cues reuse existing recordings and reset with the level;
teleports, pause and ordinary backtracking cannot repeatedly trigger them.
The recessed fan uses the existing bounded machinery-audio mixer at low volume.

`BlackoutConnectorCamera` supplies three reusable framing contexts for Volt's
inlet, turn and inclined duct. The existing camera obstruction solver retains
the real roof and wall ownership; its shorter, lower boom stays in the passage
and releases smoothly at the catwalk. Normal player yaw remains available.

The old static batches are retired before replacement coverage is adopted, then
the retained corridor/chute sources are batched again. Collider objects,
geometries, transforms and metadata are unchanged. Landing tops remain at
0.15, 0.45 and 0.15 m. Floor caution strips and dock sockets partition their
floor coverage; they do not overlay another coplanar deck.

The shutter's render skin has deliberate clearance inside the existing corridor
bore and follows the real door panel. Obstruction handling, travel and reset
remain authoritative. The door controller detaches its borrowed art before
recursive disposal; the bay releases its buffers exactly once. Cancellation
aborts loading and disposes any late result without adopting it.

## Focused verification

```bash
node --test --test-isolation=none tests/BlackoutMaintenanceArt.test.ts \
  tests/BlackoutMaintenanceBay.test.ts
node tests/BlackoutConnector.test.ts
node scripts/audit-blackout-maintenance-art.ts /tmp/blackout-maintenance-exact.json
SURFACE_TOLERANCE=.01 node scripts/audit-blackout-maintenance-art.ts /tmp/blackout-maintenance-clearance.json
```

The current exact-plane audit at 0.1 mm and the clearance audit at 2 mm found
no overlaps involving new art, including within batches. The checked states
include the real door closed, halfway open, open and reset, plus the turning
fan. Two existing receiver/detail overlaps remain outside the authored pass.
These tolerances do not guarantee depth behaviour for every GPU/view.

Focused tests cover collision identity, landing coverage, sealed wall joints,
door/fan poses, camera containment, cue gating, unchanged traversal, borrowed
textures, cancellation and single-owner disposal. Connector production captures
use Medium at 1920 x 1080 on native Intel Iris Xe: no new shader programs or
WebGL errors appeared in the five staged views. Restart prepared both rooms;
unload returned to one renderer geometry and two textures. Evidence is under
`artifacts/evidence/blackout-connector/`.

The following measurements predate the connector pass. Earlier native production captures, before the final
removal of passive fill, use Medium at 1920 x 1080 on
the development Intel Iris Xe GPU. Cached request-to-Enter samples were 3.08 s
with the initial retained surface treatment and 3.13 s with the old bay. The
final backing-shader version took 2.92 s. These samples show no material loading
regression, not a cold-cache or lab-PC guarantee. An earlier cold new-art trial
took 32.99 s; the final version's driver-cold time was not measured.
Restart retained readiness; repeated unload returned to one
renderer geometry and two textures without WebGL errors.

Frozen wide-view GPU samples for the final shader measured 6.94 ms unpowered
and 6.21 ms with the searchlight, against 6.15 and 6.28 ms for the old bay.
The new art adds 15–20 total submissions across the render passes in those
views. The dark-backing shader reduced an earlier 8.77/10.25 ms candidate to
that range. Close dock samples varied from 9.1 to 14.9 ms across probes;
these short, uncontrolled hardware samples do not establish an overall FPS
improvement or lab-device performance guarantee.

Native studio views, paired production captures, timer-query reports and the
editable-source re-export live under ignored
`artifacts/evidence/blackout-maintenance/`. Captures stage cameras/drone positions
and stop simulation; their render timings are not gameplay FPS or a full-route
playthrough.
