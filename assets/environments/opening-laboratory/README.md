# Opening containment wing

Original Specimen scenery and surveillance camera, authored and inspected in
Blender 5.2.1 through the native Windows MCP session. No downloaded assets.

The live intro now uses recessed chamber bays, inset floor guides, an asymmetric
overhead service spine, bevelled fixtures and experiment-specific lock/intake
hardware. The reusable camera has a tapered housing, sunshade, cooling fins,
yoke, machined lens barrel and optic. Existing pan/tilt joints and recording
lights animate it; four cameras share the same geometry and materials.

`generate-opening.py` is the reproducible source. `opening-laboratory.blend`
keeps individual parts editable and contains preview lighting. The GLB exports
only `OI_Architecture` (eight finish batches) and `OI_Camera` (four batches).
It contains no images, actual lights, animation tracks or rendering cameras.
Preview lighting does not enter the game.

```sh
/home/kevin/bin/blender --background --factory-startup --python assets/environments/opening-laboratory/generate-opening.py
```

Blender coordinates convert to game Y-up during glTF export. The corridor is
local to the doorway X offset of 4.3 metres, with floor Y=0 and Z=6.2..80.2.
The camera prefab faces local +Z and attaches to the existing tilt joint.
Mesh suffixes select finishes borrowed from `RoomOneShell`; the wing allocates
no additional surface textures. The approximately 1.4 MB GLB contains about
21,000 set triangles and a roughly 2,000-triangle camera, reused four times. The intro
keeps its four existing light slots and single 512px shadow map.

Gameplay Rooms 1–3 use this same `OI_Camera` prefab on their existing tracking
joints. `ContainmentSurveillanceModel` keeps its four geometry batches and
borrows the Room 1 finishes; it discards the unused corridor geometry before
gameplay GPU uploads. Five fixtures share those buffers and one small recording
LED. The doorway mount is raised above the shutter's complete tilt envelope.

`OpeningLaboratory.prepare()` loads the shared Room 1 surfaces and this set
behind the initial blackout, before shader compilation and uploads. Retry
reuses prepared geometry. Unload aborts pending loads and disposes owned
geometry, leaving borrowed finishes with Room 1's owner. The synchronous
storyboard proxy is hidden before playback.

The five introductions, plaque framing, 54-second timeline, crack/audio cues,
reduced-motion mode, Skip and gameplay handoff remain with the existing code.
The pod reveal receives a warmer key against a cool rim, plus a restrained
internal light lift on the crack beats. This pass updates the default live
intro; the opt-in MP4 backup still contains its previous scenery.

`tests/OpeningLaboratory.test.ts` exercises the actual GLB in plaque occlusion,
framing, preparation and shared-camera checks. Rendered inspection frames are
stored under ignored `artifacts/evidence/opening-blender/`. Software WebGL
captures are visual/integration evidence, not hardware performance measurements.
