# The Specimen

Animated model of the combined Bob, Goop and Volt form. The simple silhouette
follows the user's shape revisions; the desaturated teal and pale aqua palette
follows the supplied Specimen logo. Built and visually iterated through Blender
MCP in the native Windows Blender GUI, then reconciled into the saved generator.

The continuous sculpt has a rounded dome, soft rolled base, uneven rounded
lobes and small folds around the eyes. Coated translucent gel surrounds broad
green fluid plumes and fine gold currents that sit beneath the skin. The eyes
support blinking, curiosity and focus. Breathing, flow and delayed settling
motion are authored as morph targets; charging pulses the current's emission.

## Files

- `specimen.blend`: editable sculpt, materials, three animation clips and studio.
- `specimen.glb`: animated character only; no floor, lights or camera.
- `specimen_model.py`: focused geometry, material and studio functions shared
  with the interactive MCP edits.
- `generate-specimen.py`: regeneration, closed-surface checks and GLB export.
- `verify-specimen.py`: compare every imported GLB triangle with the source.
- `specimen.validation.json`: measured topology, bounds and artifact hashes.
- `specimen.roundtrip.json`: clean GLB import results and material checks.
- `evidence/`: four studio renders and `living-gel-motion.mp4` showing all clips.

The export contains 35,100 triangles across five meshes under the character
root `The Specimen`.
Its meshes are `Specimen-Body`,
`Specimen-Eye-Left`, `Specimen-Eye-Right`, `Specimen-Acid-Core`,
and `Specimen-Electric-Veins`. The rounded body is one connected closed mesh.
The internal-flow and electric-vein meshes contain separate closed
pieces. All five meshes carry bounded deformation morphs.

Blender uses +Z up and +Y forward. The GLB uses +Y up and -Z forward, with
the resting sole at Y=-0.45 m. Green flow colours are stored as vertex colours;
no external textures are required. The GLB carries transmission, clearcoat,
IOR and emissive-strength material extensions. Animated emission uses
`KHR_animation_pointer`; renderers need that extension to play the glow pulse.
Standard morph animation plays independently. Transparency, lighting, bloom
and Blender's subsurface shading depend on the renderer. The studio compositor
stays in the `.blend`.

This is an asset delivery with authored animation and no armature. Game state,
input, collider changes, and runtime clip selection are outside this delivery.

## Motion

The Blender timeline previews three named NLA clips at 24 fps:

| Clip | Blender frames | Length | Motion |
| --- | --- | --- | --- |
| Idle | 1-121 | 5 s | Breathing, two blinks, curious eyes, slow internal flow |
| Settle | 141-189 | 2 s | Compression, rebound and delayed head wobble |
| Charge | 211-283 | 3 s | Focus, compression, pulsed glow and release recoil |

Press Space in Blender to preview the sequence. Timeline markers identify the
clip starts. The exported GLB contains three separate zero-based clips with
the same names and lengths. The idle endpoints match for looping.

Morph controls are `Breathe`, `Squash`, `Stretch`, `WobbleLeft`, `WobbleRight`,
`Blink`, `Curious`, `Focus`, `Flow`, and `Charge`, on the relevant meshes.
The resting contact plane stays fixed during every body deformation.

## Regenerate

From the repository root:

```bash
/home/kevin/bin/blender --background --factory-startup \
  --python assets/characters/specimen/generate-specimen.py
```

Append `-- --render` to also regenerate the four studio views. Add `--preview`
to render and encode the ten-second motion preview using Blender's bundled
video encoder. Existing rendered frames can be encoded with `-- --encode-only`.
Run this entry
point in a separate process; interactive MCP edits call the focused functions
in `specimen_model.py` instead. The generator checks closed surfaces,
consistent winding, non-degenerate triangles, positive signed volume, body
connectivity, individual morph targets, sampled combined poses and the resting
contact plane. Its small GLB postprocess rebases clip timestamps without using
Blender 5.2's broken sliding path for material animation tracks.
It also writes explicit resting emission factors that pointer export otherwise
leaves implicit. Intermediate preview frames are ignored by Git; the encoded
MP4 and frame manifest are delivered as evidence.

## Verify

```bash
/home/kevin/bin/blender --background assets/characters/specimen/specimen.blend \
  --python assets/characters/specimen/verify-specimen.py
```

Verification imports the GLB into a clean background scene and matches every
triangle to the saved source, allowing at most 0.000002 m position error.
It also matches every imported morph target, checks all three clip durations
and material pulse channels, confirms the teal vertex palette and submerged
current geometry, and checks the exclusion of studio objects, skins and images.
The `.blend` container's binary identity is tracked separately from geometry
and GLB identity because saving can change its bytes.
