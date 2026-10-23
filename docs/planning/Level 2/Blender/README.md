# Level 2 editable room snapshots

## Redesigned versions

Open `Room2-Redesign.blend` and `Room3-Redesign.blend` for the revised layouts. The original `Room2.blend` and `Room3.blend` remain unchanged. `Room2-Preview.png` and `Room3-Preview.png` are inspection cutaways, not final in-game lighting.

Room 2 has a direct jump from the final released hanging block to the vent (no intermediate vent platform), four wall-route lasers, and flush laboratory panelling with upper light strips. Room 3 has an entirely rebuilt elevated route across three hanging-drone encounters, three wall lasers, and a single final drop behind the ground drones. Individual machinery barricades are restored, with at least 14 metres between the last barricade and the ground-drone line.

The current game authoring lives in `LevelTwoRoomTwoGreybox.ts`, `LevelTwoRoomThreeGreybox.ts`, and `CultivationRoomThreeAuthoring.ts`. Room 2 block dimensions are applied from `LevelTwoBlenderLayout.ts` before collision registration. Dynamic block endpoints and reset behaviour remain owned by the existing runtime. Blender snapshots are refreshed from the evaluated game geometry to keep lasers, cable mounts and drone models aligned.

To refresh, run `node scripts/export-level-two-blender.ts '../Levels/Level 2/Blender/Current'` from `Specimen`, then run Blender with `--background --python scripts/redesign-level-two.py -- <Blender-folder>`. Do not overwrite manual edits: save a separate copy first. Further manual Blender edits still need an export/adaptation pass, especially for moving objects, lasers, and drones.

Validation includes controller-simulated platform jumps, the direct Room 2 vent attachment, minimum cover standoff, and detection/firing from each hanging drone toward Bob's exposed approach. This does not replace playtesting the full timed encounter.

Open `Room2.blend` or `Room3.blend` in Blender. These are snapshots of the current TypeScript room constructors, before any parkour redesign.

- Dimensions are metres. Blender X = game X, Blender Y = negative game Z, Blender Z = game Y. Each room uses its own local origin; level placement offsets are excluded.
- Meshes are individually editable, with basic material colours and point lights. Lighting is approximate; game shaders, textures and gameplay animations are not converted.
- Ceilings are in a separate collection hidden in the viewport. Toggle that collection in the Outliner to restore them. Runtime-hidden geometry is retained in its own hidden collection.
- Lasers, doors and suspended blocks are captured in their initial poses. Movement endpoints, timing, triggers and collision logic remain in TypeScript.
- Original Room 3 snapshots contain drone reference boxes. The current redesign also includes the runtime drone artwork in its starting pose.
- Every object has a `source_name` custom property containing its full original identifier (Blender may shorten long display names). Preserve this property when editing. `source_metadata_json` retains authored gameplay annotations.

Saving a Blender file does not update the game automatically. Edits must be mapped back to the TypeScript authoring, including associated hazards and moving-object endpoints.

The adjacent `.scene.json` files are intermediate export data. To regenerate from the current branch, run `node scripts/export-level-two-blender.ts` from `Specimen`, then run Blender with `--background --python scripts/build-room-blend.py -- <RoomN.scene.json> <RoomN.blend>`. Regeneration overwrites the chosen output; use a different output path if you have made Blender edits.
