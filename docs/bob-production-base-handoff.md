# Bob production-base handoff

Completed 2026-09-12 with Blender **5.2.1 LTS**. The production asset is accepted; this handoff changed no source geometry, topology, UVs, facial placement, materials, or export settings.

**The approved design must NOT be reshaped in later technical phases without visual review.** Preserve the body, crest, face layout and shallow eye recesses. Technical work must follow this asset.

## Deliverables

- [Source Blender asset](../assets/character-spike/bob-production-base.blend), scene `Bob-Production-Base`, collection `Bob-Production`.
- [Exported GLB](../assets/character-spike/bob-production-base.glb).
- [Export and validation script](../assets/character-spike/export-bob-production-base.py).
- [Final validation JSON](../assets/character-spike/bob-production-base.validation.json).
- [Preserved approved blockout](../assets/character-spike/bob-v2-facial-cleanup.blend).
- [Viewport evidence](evidence/bob-production-base/).

Source SHA-256, unchanged throughout this handoff:
`d5114706ef63011202cf7af9ed03ef31c08f0d770b7aa6e9d3dd66425616dade`

Final GLB SHA-256:
`3766746f131ca09f81d5a6a6e9d3bd28c287697f48f92fade2b1fcd721e1d1a0`

## Mesh and UV foundation

The body and crest form one closed, connected mesh. The preceding topology phase used voxel consolidation, quad remeshing, local surface projection/refinement around sockets and crest, and local root blending. The body has 2,782 quads and 328 transition triangles; there is no separate internal crest surface. The neutral lower face remains closed, with no permanent mouth opening.

`Bob` is the common parent of `Bob-Body`, `Bob-Eye-Left`, `Bob-Eye-Right`, `Bob-Catchlight-Left` and `Bob-Catchlight-Right`. Eyes and catchlights are lightweight, deliberately open surface patches; their boundary edges are intentional. Eyes follow the face curvature inside shallow sockets. Catchlights are simple geometry. The three existing materials are neutral diagnostic body, dark eyes and white catchlights.

Each mesh has one UV layer. The body has four substantial islands: main body, underside, and two crest sections. Seams follow the rear/underside and crest division; the face remains continuous. Facial patches have simple disc UVs. The packed checker is a Blender diagnostic only; the GLB contains **zero textures**. Keep topology and UV indices stable when later authoring shape keys.

| Geometry | Blender vertices | Blender faces | Export triangles |
|---|---:|---:|---:|
| Body + crest | 2,948 | 3,110 | 5,892 |
| Eyes, combined | 386 | 384 | 672 |
| Catchlights, combined | 98 | 96 | 144 |
| **Total** | **3,432** | **3,590** | **6,708** |

Facial surfaces total **816 triangles**. The GLB has **5 meshes**, **6 nodes**, **3 materials**, and **3,635 exported vertices after UV splitting**; file size is **160,500 bytes**. Its 6,708 triangles are slightly above the initial 6,000-triangle starting target to retain the accepted crest and facial surfaces. There are **no morph targets or animations in the production collection or GLB**. The source file retains an older comparison scene and a hidden authoring guide; those are excluded from export.

## Final verification

Both commands were run successfully from the repository root. Neither saves the source Blender file. Successful runs print `BOB_EXPORT_VALIDATION` and `BOB_ROUNDTRIP_VALIDATION` respectively.

```bash
blender --background assets/character-spike/bob-production-base.blend --python assets/character-spike/export-bob-production-base.py
blender --background --factory-startup --python assets/character-spike/export-bob-production-base.py -- --roundtrip
```

The source opened successfully. Two repeated exports were byte-identical and matched the existing final GLB hash. The validation JSON matches that GLB. Mesh checks passed: connected components, manifold closed body, positive volume, no duplicate vertices/faces, no detected non-adjacent triangle intersections, valid UV range and no degenerate UV triangles. The intersection test excludes triangles sharing vertices; it is not a mathematical proof against every possible intersection.

The fresh-process GLB import preserved all five mesh identities, triangle counts, UVs, scale/orientation and bounds. Maximum measured vertex-position drift was **0**; minimum corresponding normal dot product was **0.999999672**. No unexpected exported objects, textures, morph targets or animations appeared.

The final GLB was also reimported through Blender MCP into a separate inspection scene and compared visually with the production source. Front, side and 3/4 silhouettes, eye placement/recess, crest-root continuity, smooth shading and UV checker behaviour showed **no visible export regression**. Inspection used existing diagnostic shading/checker data on the imported copy only; the source was not saved or altered.

| Inspection | Production source | Final GLB import |
|---|---|---|
| Front | [View](evidence/bob-production-base/final-front.png) | [View](evidence/bob-production-base/glb-front.png) |
| Side | [View](evidence/bob-production-base/final-side.png) | [View](evidence/bob-production-base/glb-side.png) |
| 3/4 | [View](evidence/bob-production-base/final-three-quarter.png) | [View](evidence/bob-production-base/glb-three-quarter.png) |
| Eye recess | [View](evidence/bob-production-base/final-eye-close.png) | [View](evidence/bob-production-base/glb-eye-close.png) |
| Crest root | [View](evidence/bob-production-base/root-final.png) | [View](evidence/bob-production-base/glb-root-close.png) |
| Highlight diagnostic | [View](evidence/bob-production-base/highlight-three-quarter.png) | [View](evidence/bob-production-base/glb-highlight-three-quarter.png) |
| Checker front | [View](evidence/bob-production-base/checker-front.png) | [View](evidence/bob-production-base/glb-checker-front.png) |
| Checker 3/4 | [View](evidence/bob-production-base/checker-three-quarter.png) | [View](evidence/bob-production-base/glb-checker-three-quarter.png) |

Approved-blockout comparisons, the front overlay, and wireframes remain in the evidence directory. The stale `checker-front.png`, `checker-three-quarter.png` and `highlight-three-quarter.png` contents were removed by replacing those exact paths with their newer final `/tmp` captures. No outdated backup copies remain in that directory.

## Ownership assumptions and deferred work

The next runtime phase should load the GLB as one Bob-owned hierarchy, with five geometries and three materials shared where appropriate. The owner must dispose each unique owned resource once; replacing diagnostic materials must account for those shared references. Reference scenes, the hidden authoring guide and checker resources are authoring-only and must not enter runtime loading. No runtime ownership or loading implementation has been added.

Transforms retain unit scale. Blender uses Z up and face direction -Y; the exported GLB uses Y up and face direction +Z. Body bounds are approximately X [-1.24635, 1.13857], Blender Y [-0.96662, 0.73023], Z [0.15392, 2.06084]. The root is at the existing origin, not the lowest body contact point. Future visual placement must accommodate authoritative gameplay without reshaping the asset or changing the collider for art.

Deformation quality under squash/stretch/cling and expression changes remains untested because no production shape keys were authored. Feature attachment under deformation, final gel/eye shading, textures, procedural motion, runtime lighting/glass/shadows, prewarming, disposal tests and browser/GPU performance are deferred. Diagnostic highlights can expose the finite mesh resolution at extreme close-up; this handoff establishes no final material or hardware-performance sign-off.

The bounded production-base handoff is complete. No morph, animation, runtime or Goop phase has begun. Nothing was committed or pushed. Branch: `polish/level-1`; HEAD: `996bf373f462d29608c7fc5b5262f12a04257b43`.

## Working-tree inventory

This handoff created this document and eight `glb-*.png` inspection captures, replaced the three stale captures named above, and regenerated the GLB/validation JSON with unchanged results. The source `.blend` and export script were unchanged. All listed files remain untracked; there are no tracked-file modifications. Other earlier artifacts are included below only as a Git inventory and were not inspected or changed during this handoff.

<!-- Final untracked inventory follows. -->

```text
assets/character-spike/bob-diagnostic.glb
assets/character-spike/bob-neutral-sculpt.blend
assets/character-spike/bob-production-base.blend
assets/character-spike/bob-production-base.glb
assets/character-spike/bob-production-base.validation.json
assets/character-spike/bob-v2-depth-blockout.blend
assets/character-spike/bob-v2-eye-test.blend
assets/character-spike/bob-v2-facial-cleanup.blend
assets/character-spike/bob-v2-facial-test.blend
assets/character-spike/bob-v2-front-blockout.blend
assets/character-spike/export-bob-production-base.py
assets/character-spike/goop-diagnostic.glb
docs/bob-production-base-handoff.md
docs/evidence/bob-production-base/approved-front.png
docs/evidence/bob-production-base/approved-side.png
docs/evidence/bob-production-base/approved-three-quarter.png
docs/evidence/bob-production-base/checker-front.png
docs/evidence/bob-production-base/checker-three-quarter.png
docs/evidence/bob-production-base/face-comparison-approved.png
docs/evidence/bob-production-base/face-comparison-new.png
docs/evidence/bob-production-base/final-eye-close.png
docs/evidence/bob-production-base/final-front.png
docs/evidence/bob-production-base/final-side.png
docs/evidence/bob-production-base/final-three-quarter.png
docs/evidence/bob-production-base/front-overlay.png
docs/evidence/bob-production-base/glb-checker-front.png
docs/evidence/bob-production-base/glb-checker-three-quarter.png
docs/evidence/bob-production-base/glb-eye-close.png
docs/evidence/bob-production-base/glb-front.png
docs/evidence/bob-production-base/glb-highlight-three-quarter.png
docs/evidence/bob-production-base/glb-root-close.png
docs/evidence/bob-production-base/glb-side.png
docs/evidence/bob-production-base/glb-three-quarter.png
docs/evidence/bob-production-base/highlight-root.png
docs/evidence/bob-production-base/highlight-three-quarter.png
docs/evidence/bob-production-base/root-final.png
docs/evidence/bob-production-base/wire-front.png
docs/evidence/bob-production-base/wire-three-quarter.png
docs/evidence/issue-42-character-spike/blender-bob-cling.png
docs/evidence/issue-42-character-spike/blender-bob-squash.png
docs/evidence/issue-42-character-spike/blender-bob-stretch.png
docs/evidence/issue-42-character-spike/blender-goop-aim-rejected-fold.png
docs/evidence/issue-42-character-spike/blender-goop-aim.png
docs/evidence/issue-42-character-spike/blender-goop-neutral.png
docs/evidence/issue-42-character-spike/blender-goop-ooze.png
docs/evidence/issue-42-character-spike/blender-goop-recoil.png
docs/evidence/issue-42-character-spike/blender-pair-grey-eyes-hidden.png
docs/evidence/issue-42-character-spike/blender-pair-pbr-art-gate-fail.png
```
