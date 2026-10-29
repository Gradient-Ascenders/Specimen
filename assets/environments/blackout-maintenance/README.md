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
node scripts/assets/generate-blackout-maintenance-art.ts
node scripts/assets/generate-blackout-maintenance-art.ts --check
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
