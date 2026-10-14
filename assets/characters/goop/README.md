# Goop

Reference-led static character sculpt made through Blender MCP in the native
Windows Blender GUI, then reconciled into a deterministic generator.

The silhouette has a low scalloped skirt, rounded dome, and slim swept crest
with six tapered spikes extending down the back. The pointed forelock sits
close to the forehead. Two slanted glossy black lenses form the eyes.
The body uses a single continuous, closed surface and an acid-green coated gel
material. Eye rims sit slightly inside the body, with fully buried rear shells.
The spike junctions and cheeks have local smoothing; the spike tips stay sharp.
Reduced coat strength and broader highlights keep the green surface readable.

## Files

- `goop.blend`: editable mesh, studio lights and camera.
- `goop.glb`: character root, body and two eyes, with their physical materials.
- `goop_model.py`: geometry and look-development recipe shared with the MCP edits.
- `generate-goop.py`: regeneration, topology validation, GLB export and rendering.
- `goop.validation.json`: measured topology, bounds and artifact/source hashes.
- `verify-goop.py`: independent source/GLB geometry, material and eye-seating checks.
- `goop.roundtrip.json`: results from the clean GLB import and comparison.
- `evidence/`: front, side, back and three-quarter studio renders.

The loose puddle dressing has been removed. The GLB excludes the studio. It contains 33,716
triangles across three meshes. Each mesh is closed and has one connected
component, with zero non-manifold edges. The body is approximately
1.46 m wide, 1.30 m tall including the crest, and 1.28 m deep.

Blender uses +Z up and +Y forward. The exported GLB uses +Y up and -Z forward,
matching the existing character convention; its resting sole is at Y=-0.45 m.
Object transforms are identity. This is an unrigged static asset; expressions,
animation and game integration are outside this model delivery.

## Regenerate

From the repository root, using the machine's native Blender wrapper:

```bash
/home/kevin/bin/blender --background --factory-startup \
  --python assets/characters/goop/generate-goop.py
```

Append `-- --render` to regenerate the four studio images. This entry point is
for a separate background process, not execution inside an existing user scene.
Interactive MCP calls use the focused functions in `goop_model.py`.

The generator asserts manifoldness, connected components, non-degenerate
triangles and the resting contact plane. GLB geometry and hashes are validated
separately from the `.blend` file's binary identity, which can change on save.

## Verify the export

```bash
/home/kevin/bin/blender --background assets/characters/goop/goop.blend \
  --python assets/characters/goop/verify-goop.py
```

Verification checks outward normals, manifold edges, embedded eye rims and
rear shells, matching exported material values, and every triangle after a
clean GLB import. Exported vertex positions must agree within 0.000002 m.

The polish pass was inspected in the Windows Blender GUI from front, side,
rear three-quarter and underside views, under studio and forest lighting,
and at a reduced viewing size. Studio renders are in `evidence/`. These are
static asset checks, not evidence of in-game lighting or animation acceptance.

Live MCP viewport captures were reviewed in the session. The separate saved
window screenshot was blank and was discarded; it is not included as evidence.
