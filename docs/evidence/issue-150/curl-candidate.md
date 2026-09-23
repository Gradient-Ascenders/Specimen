# Bob Gate 1 revision 3 — antenna depth

Status: Gate 1 visually approved by the user on 2026-09-23.
This pass changes only the antenna's depth.
The body, front silhouette, eyes, antenna centreline and front taper retain
revision 2's geometry exactly. Production assets, materials, morphs and
colliders remain unchanged.

- [Front orthographic](curl-candidate-v3/front-orthographic.png)
- [Side orthographic](curl-candidate-v3/side-orthographic.png)

The antenna's elliptical sections now approach a round cross-section: depth
radius rises from 72% to 104% of the existing front-plane radius. A smooth blend
from the unchanged root preserves the body junction. The existing diminishing
radii still form the soft tip; only runtime Z coordinates change.

## Verification

A comparison of the previous and current exported GLBs confirms:

- every vertex's front-plane X/Y coordinates are identical;
- both eye meshes are identical;
- body vertices below the antenna root are identical;
- triangle indices and counts are identical;
- only 780 antenna depth coordinates changed, by at most 0.03865 m;
- changed vertices begin at Y=0.21737 m, above the unchanged body/root.

See the [comparison report](curl-candidate-v3/depth-comparison.json).
The candidate still has one connected watertight body, 3,264 body triangles,
504 eye triangles, and no morphs, bones or animations. The updated GLB was
inspected from the side and an oblique angle in native Windows Blender via MCP.
The front and side evidence use the same neutral orthographic framing as v2.
`npm run build` and `git diff --check` passed. No browser check was repeated
for this offline geometry-only revision.

## Reproduce

```bash
blender --background --factory-startup --python assets/characters/bob/generate-bob-curl-candidate.py
blender --background assets/characters/bob/bob-curl-candidate.blend --python assets/characters/bob/render-bob-curl-candidate-evidence.py
```

The [generator](../../../assets/characters/bob/generate-bob-curl-candidate.py)
exports `bob-curl-candidate.blend`, `bob-curl-candidate.glb` and the validation
report. The evidence renderer defaults to the v3 front/side pair. Append
`-- --overlay` for a reference contour overlay, or select another evidence
folder with `--output` after the separator.

Revision 2's [front overlay](curl-candidate-v2/front-overlay.png) and
[browser camera capture](curl-candidate-v2/gameplay-camera.png) remain archived
as evidence of the prior revision. The existing browser preview loads the
current candidate file; those archived PNGs have not been replaced in this pass.

The generated validation report records the pre-review candidate status;
this document records the subsequent approval of its exact GLB hash.
Approval covers the resting geometry. Flexible antenna animation belongs to
the later animation pass. No production adoption, material or morph work
is included in this antenna-depth pass.
