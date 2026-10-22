# The Specimen

Animated final evolution of Bob, Goop and Volt, following the approved
[lightning-mohawk concept](reference/approved-lightning-mohawk.png). The user's
subsequent refinements shorten the body and replace the oval eyes with pointed,
swept dragon-shaped lenses. Built and visually iterated through Blender MCP in
the native Windows Blender GUI, then regenerated from the same recipe.

The body is a continuous gel sculpt that melts into a shallow puddle, with an
eight-point lightning mohawk. Its long swept crown, solid front root and deep return
notches follow the approved concept. Three large crown points taper into five
smaller dorsal teeth on one uninterrupted fin. Hooked secondary barbs add a
stepped lightning outline, while the front root blends solidly into the head.
Yellow accents fade into the teal gel at the eight main bolt tips and seven
secondary hooks, using the same translucent surface as the surrounding gel.
The dome is about 1.78 m high above
the resting contact plane; the highest crest is about 2.12 m above it. The base
is about 1.88 m wide, with four broad merging liquid lobes, an irregular
ground-hugging edge and a fuller transition into the body. Separate raised foot
pads have been removed. These are asset dimensions, not gameplay collider changes.

The chest and shoulders have gently increased volume, with about 1.15 m width
through the upper body. The 1.88 m footprint and fuller lower lobes retain the
bottom-heavy slime proportions; the low grounded base profile is preserved.

Clear desaturated teal gel surrounds five closed aqua flow ribbons and
filaments, an irregular green fusion core, a brighter inner heart and three
swirling acid strands. Thin branching gold currents sit inside the body and
follow the crest's zigzags. The eyes support blinking, curiosity and focus.
Breathing, internal flow, delayed settling, crest flex and charging are authored
as morphs; charging also pulses the gold emission.

## Files

- `specimen.blend`: editable sculpt, materials, three animation clips and studio.
- `specimen.glb`: animated character only; no floor, lights or camera.
- `specimen_model.py`: focused geometry, material and studio functions shared
  with the interactive MCP edits.
- `generate-specimen.py`: regeneration, closed-surface checks and GLB export.
- `verify-specimen.py`: compare every imported GLB triangle with the source.
- `specimen.validation.json`: measured topology, bounds and artifact hashes.
- `specimen.roundtrip.json`: clean GLB import results and material checks.
- `evidence/`: four full-body studio renders, `base-detail.png`,
  `mohawk-detail.png` and `spike-detail.png` close-ups, and
  `living-gel-motion.mp4` showing all clips.
- `reference/approved-lightning-mohawk.png`: the approved concept before the
  shorter-body and sharper-eye refinements.

The export contains 108,352 triangles across six meshes under `The Specimen`:
`Specimen-Body`, `Specimen-Eye-Left`, `Specimen-Eye-Right`,
`Specimen-Acid-Core`, `Specimen-Aqua-Currents`, and `Specimen-Electric-Veins`.
The body and crest form one connected closed mesh without tunnels. The crest
keeps sharper edges while the body and base use softer smoothing. Electrical
branches follow the new crown and dorsal teeth inside the gel. The internal
meshes contain separate closed volumes. All six meshes carry bounded deformation morphs,
with 47 authored targets across the asset.

Blender uses +Z up and +Y forward. The GLB uses +Y up and -Z forward, with
the resting sole at Y=-0.45 m. Gel and core colours are stored as vertex colours;
no external textures are required. The GLB carries transmission, clearcoat,
IOR and emissive-strength material extensions. Animated emission uses
`KHR_animation_pointer`; renderers need that extension to play the glow pulse.
Standard morph animation plays independently. Blender also uses the core's
vertex colours to vary its emission. The GLB preserves those base colours and
uses green material emission as an approximation; glTF does not multiply
emission by vertex colours. Transparency, lighting, bloom and Blender's
subsurface shading depend on the renderer. The studio compositor stays in the
`.blend`.

This is an asset delivery with authored animation and no armature. Game state,
input, collider changes, and runtime clip selection are outside this delivery.

## Viewing the interior

Press **F12** for the studio render, or open `evidence/three-quarter.png`.
Material Preview is useful for orbiting the shape but does not reliably show
the nested transmissive gel and emitted light. The studio renders and motion
preview show the actual Cycles materials. Frame 266 shows a bright charge pulse.

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
`Blink`, `Curious`, `Focus`, `Flow`, `Charge`, `CrestFlexLeft`, and
`CrestFlexRight`, on the relevant meshes.
The resting contact plane stays fixed during every body deformation. The
deformations and eye seating are authored against the revised body proportions.

## Regenerate

From the repository root:

```bash
/home/kevin/bin/blender --background --factory-startup \
  --python assets/characters/specimen/generate-specimen.py
```

Append `-- --render` to also regenerate the studio views and detail renders. Add `--preview`
to render and encode the ten-second motion preview using Blender's bundled
video encoder. Existing rendered frames can be encoded with `-- --encode-only`.
An interrupted preview can resume with `-- --preview --preview-start=N` when
frames before index `N` were rendered from the same recipe.
Run this entry
point in a separate process; interactive MCP edits call the focused functions
in `specimen_model.py` instead. The generator checks closed surfaces,
consistent winding, non-degenerate triangles, positive signed volume, body
connectivity, individual morph targets, sampled combined poses and the resting
contact plane. It also checks that the core, aqua currents and gold veins stay
inside the gel in all 17 sampled animation poses. Its small GLB postprocess
rebases clip timestamps without using
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
and material pulse channels, confirms the teal vertex palette and containment
of the core, flow and currents,
measures the shortened dome, wide ground contact, thin puddle edge, narrow
mohawk, forward lean
and pointed eye-corner placement, and checks the exclusion of studio objects,
skins and images.
The `.blend` container's binary identity is tracked separately from geometry
and GLB identity because saving can change its bytes.
