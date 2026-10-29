# Room 1 containment / observation laboratory

Original Specimen environment art, authored in Blender 5.2.1 through the native
Windows Blender MCP session. No downloaded models, textures or fonts are used
by this asset. Existing pod, sign, door, monitor and biological wall resources
keep their separate provenance and runtime owners.

The new shell is built around a flush, segmented containment island, a flat
rear diagnostics wall, an observation-control recess, an asymmetrical maintenance wall
and a ceiling service crown. It replaces the old rectangular wall dressing.
The GLB uses the game's X/Y-up/Z coordinates after Blender's normal glTF export.
Its `R1_Architecture` node carries version `containment-room-one-v1`.

The west maintenance panels also stop before the complete corner-spine footprint,
with a backed 20 mm reveal. The flush perimeter floor extends 80 mm under the
wall bases and includes the rectangle's exact corners, sealing the rear plinth's
beveled toe without adding a raised strip or changing collision. The focused
shell test checks both the corner faces and floor coverage at this junction.
The separate panel/plinth joint at 1.08–1.10 m is sealed by continuous ceramic
backing, 5 mm behind the panel faces, including their beveled lower edges.
On the escape wall beside the green climb route, 140 mm graphite dividers cover
the panel/plinth joins and match the maintenance-wall framing. Separate sections
retain the door and vent openings and share the existing graphite material batch.

## Files and reproducibility

- `generate-room-one.py`: deterministic source for geometry, procedural finishes,
  Cycles baking, editable `.blend` and material-batched GLB export.
- `room-one-surfaces.blend`: editable room studio with packed bakes and preview
  lighting. Benches and instruments remain individually editable. Preview
  lights/cameras are excluded from the runtime export.
- `room-one-shell.glb`: geometry grouped by finish. `R1_Shell_*` mesh names select
  the runtime materials; images and lights are deliberately exported separately.
- `ceramic-*.png`, `resin-*.png`: original Blender base-colour, tangent-normal and
  ORM bakes. No direct lighting or view-dependent reflections are baked in.
- `pack-maps.py`: lossless PNG decoding/packing, using Python's standard library.
- `room-one-maps.bin`: versioned gzip bank, prepared asynchronously before shader
  compilation. The `.bin` suffix avoids HTTP content-encoding ambiguity.
- `room-one-maps.validation.json`: channel dimensions, hashes and storage budget.

From the repository root:

```sh
/home/kevin/bin/blender --background --factory-startup --python assets/environments/containment-room-one/generate-room-one.py
python3 assets/environments/containment-room-one/pack-maps.py
```

For interactive changes, modify the owned `Room 1 Surface Studio` scene, reconcile
the accepted result into the generator, regenerate, and review the regenerated
file through MCP and the game. Only this scene's prefixed data is regenerated.
Saving a `.blend` may change its container hash; geometry and map hashes are the
reproducibility evidence.

## Runtime and budget

`RoomOneShell` owns the GLB geometry, six shared textures and finish materials.
The room has nine material submissions and fewer than 10,000 triangles; no
additional light, shadow map, transmission pass or post-processing target is
introduced. The baked textures use 24 MiB before mipmaps, approximately 32 MiB
including mipmaps; the compressed bank is approximately 1 MiB. UVs are authored
in metres so changing panel dimensions does not stretch the surface detail.

The same asset is prepared for Level 1 and the default live opening.
The existing pre-rendered opening movie is a separate asset and is not re-exported
by this authoring script. Preparation/retry reuse the same shell; unload aborts
pending loads and releases geometry, materials and textures once.

The complete collision fingerprint, pod motion, spawn, physical floor height,
climbable wall and vent openings stay with the existing gameplay owners.
Control-room scenery is beyond a glass wall and is not an accessible new area.

## Desktop texture compression

`room-one-maps-bc7.bin` contains the same six maps as native BC7 blocks with
complete mip chains. The shared finishes use it when the renderer supports
`EXT_texture_compression_bptc`; other devices retain the RGBA bank. A failed
compressed-bank request also falls back to RGBA. Collision and Blender source
assets are unaffected.

The bank uses about 8 MiB of mip data versus 32 MiB for RGBA, excluding driver
overhead. Its gzip download is about 1.10 MB versus 0.97 MB for the original.
There is no runtime transcoder, WebAssembly module or texture worker.

To regenerate, use KTX-Software 4.4.2 and set `SPECIMEN_KTX_BIN` to its `bin`
directory, then run `node scripts/assets/generate-room-one-compressed-maps.mjs`. The script
encodes KTX2/UASTC and transcodes to BC7 offline, preserving RGB normal maps,
linear data maps, sRGB colour maps and orientation. The JSON manifest records
source/output hashes and tool settings. `--check`, also included in
`check:generated-assets`, verifies provenance without requiring the encoder.
