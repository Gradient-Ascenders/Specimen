# Bob gel material look-dev — approval gate

2026-09-12. Recommended look: **softened opaque stylised blue/cyan gel**, material `Bob-Gel-A-Opaque`, in [bob-material-lookdev.blend](../assets/character-spike/bob-material-lookdev.blend). This bounded material phase is complete and awaits visual approval. No morph, animation, runtime, gameplay or Goop work was performed.

## Locked production base

The source file was checked before material work and again after saving the separate look-dev file. Its SHA-256 still matches the production handoff:

`d5114706ef63011202cf7af9ed03ef31c08f0d770b7aa6e9d3dd66425616dade`

The original GLB still matches its validation JSON:

`3766746f131ca09f81d5a6a6e9d3bd28c287697f48f92fade2b1fcd721e1d1a0`

The JSON's `approved_source_sha256` identifies the earlier `bob-v2-facial-cleanup.blend`, not the production file. That earlier file was also checked and matches `2dceb638f45ef6bb5bfb9217fa26189d63fef47bc30c2267518a12b3c77f9538`.

Before assigning materials, all five production meshes matched the recorded vertex, polygon and triangle counts and world bounds. The body remains 2,948 vertices / 3,110 polygons / 5,892 triangles; all five meshes total 6,708 triangles. Each has one UV layer and no modifiers or shape keys.

An exact serialized snapshot was taken directly from the opened source before material work. After saving and reopening the look-dev file, all five meshes matched that snapshot: every vertex coordinate, edge and polygon index, UV coordinate, world transform, smooth-shading flag, seam flag, and modifier/shape-key presence. Body, crest, eyes, catchlights, sockets and silhouette were not reshaped. Materials use object-level overrides on the production objects. The snapshot is retained as the `locked_geometry_snapshot` scene property. The original source and export were never saved over or regenerated.

## A–C. Recommended look and body structure

The gel impression comes from the separation between a dark blue central mass and a softer cyan lower body, plus broad wet reflections and restrained internal-looking colour variation. The final refinement reduces the varnished-shell impression through lower coat weight, rougher coat, softer base highlights and quieter eye reflections. It remains a stylised approximation; the side view still has some smooth manufactured-surface character.

One Principled BSDF supplies the body surface. Blender's [Principled BSDF documentation](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html) describes the base and coat layers used here.

| Body setting | Recommended value |
| --- | --- |
| Metallic / transmission / physical subsurface | 0 / 0 / 0 |
| Alpha | 1 |
| Roughness | 0.255 |
| IOR | 1.36 |
| Specular IOR level | 0.48 |
| Coat weight / roughness / IOR | 0.14 / 0.25 / 1.36 |
| Normal, bump or displacement texture | None |

The base colour and emission strength sockets are linked; their unlinked UI defaults do not describe the result. Colours below are **linear RGB**, not sRGB hex values.

| Normalized local height | Base ramp RGB |
| --- | --- |
| 0 | 0.008, 0.39, 0.40 |
| 0.22 | 0.003, 0.21, 0.36 |
| 0.50 | 0.0015, 0.043, 0.18 |
| 0.82 | 0.004, 0.17, 0.34 |
| 1 | 0.015, 0.34, 0.46 |

The height ramp uses eased transitions. One low-frequency 3D noise field, generated-coordinate scale 3.3 and detail 0, softly multiplies the colour. Its eased ramp goes from RGB (0.40, 0.54, 0.74) at noise 0.28 to (1.05, 1.12, 1.10) at 0.70. It changes colour only; it does not roughen the surface.

The broad edge factor is `(1 - abs(dot(N, V)))^1.65`. It mixes toward cyan (0.025, 0.60, 0.64) with maximum weight 0.43. This is a surface-angle approximation, not measured thickness or a screen-space outline. The soft exponent and limited weight prevent a thin painted border, although this remains an approximation of thin gel.

Fake internal luminosity uses the final colour at a low strength: a clamped height ramp from 0.50 at the bottom to 0.015 at normalized height 0.38, plus 0.17 times the edge factor. This provides the painterly lower-body response without seeing through Bob. There is no volume, transparency sorting or physical subsurface dependency.

## D. Eyes and existing mouth test

The eyes are linear RGB (0.002, 0.009, 0.028), roughness 0.285, IOR 1.40, specular IOR level 0.12, and zero coat, metallic and transmission. This reduces the large secondary white reflections while preserving a faint wet response. Catchlights retain their exact geometry and placement: RGB (0.92, 0.96, 1), roughness 0.26, IOR 1.36 and **zero emission**. Both materials respond to coloured lighting.

The existing historical surprised/squash mouth objects received a soft blue-black test material: RGB (0.0015, 0.004, 0.012), roughness 0.40 and IOR 1.33. They remain in the historical review scene with their existing zero-scale neutral state. No new expression or pose was authored, and the mouth was not rendered as an active expression in this phase. Neutral production Bob has no mouth.

## E–F. Inclusions and transmission decision

**Recommendation: three faint shader inclusions; no real internal bubble geometry; no transmission.**

Three local-space sphere-distance masks suggest sparse inclusions near a flank, lower lobe and crest. Each has a soft interior and faint eased meniscus; final mask strength peaks at 0.14. The masks tint toward cyan (0.055, 0.62, 0.68), without bump, displacement or separate transparent surfaces. They stay away from the eye centres and largely disappear at gameplay distance, preserving a clean blue character. They suggest internal detail but do not provide real optical depth or parallax.

The bounded earlier comparison used transmission 0.08 with either shader inclusions or three actual interior spheres. The spheres added effectively no readable detail through the dense body. The shader version was more useful. Transmission itself did not materially improve the gel impression. It was never increased beyond 0.08. Material B and the hidden `Diagnostic-Actual-Internal-Bubbles` collection are retained only as labelled diagnostics in the look-dev file; neither belongs to the recommended direction. No third material candidate was created.

[Earlier paired inclusion diagnostic](evidence/bob-material-lookdev/inclusion-diagnostic-comparison.png). These images precede the final surface refinement and are labelled accordingly.

## G–H. Blender implementation and plausible Three.js translation

The final material was rendered in **Eevee first after the refinement**, with screen-space ray tracing and fast GI disabled. All final neutral views and coloured-light tests use that configuration. The final Cycles comparison uses the identical material, camera, lights, exposure and AgX view transform. Cycles adds indirect colour/contact response; the target's material cues survive without it. The Cycles-only indirect cyan bounce is not a requirement for runtime.

| Visual effect | Blender implementation | Plausible Three.js approximation, not implemented |
| --- | --- | --- |
| Soft wet surface | Principled base + restrained coat | `MeshPhysicalMaterial`: metalness 0, transmission 0, roughness, IOR, modest clearcoat and clearcoat roughness |
| Rich centre / cyan base | Generated-coordinate height ramp | Local-position varying and a small ramp, or a baked colour map using the existing UVs |
| Soft cloudiness | One detail-0 noise field | Baked colour texture or restrained low-frequency shader noise |
| Sparse inclusions | Three local sphere-distance colour masks | Bake into the existing UV layout, or three small uniform-driven distance masks |
| Thin-gel impression | Broad normal/view-angle mix | Small fragment hook using surface normal and view direction; no screen-space silhouette pass |
| Slight lower luminosity | Colour-linked emission with height/angle mask | Restrained emissive map or fragment contribution, without bloom or a dedicated light |
| Wet eyes / white catchlights | Two simple dielectric materials | Separate physical/standard materials on the existing eye and catchlight meshes |
| Broad environmental highlights | Whole-stage area lights and world | Room lighting and an environment map; tune for the game's renderer and tone mapping |

No full volumetrics, physical subsurface, path-traced refraction, displacement, compositor glow or Blender-only shading trick is required by the recommended look. Blender node graphs and AgX settings are authoring details, not a literal runtime export contract. Parameters will require visual matching under the existing Three.js renderer; Blender's coat IOR and specular-level controls do not promise a numerically identical Three.js result. Three.js supports the relevant [physical material controls](https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial) and [WebGL material shader hooks](https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile). No runtime integration or performance claim is made here.

## Lighting inspection

The neutral rig uses large disk area lights: key at (-3,-4,5), 650 W, diameter 2.8; fill at (4,-2,3), 210 W, diameter 3; rim at (1,3,4), 700 W, diameter 3. All illuminate Bob and the neutral floor. World strength is 0.30, exposure 0, AgX with Medium High Contrast. There is no character light linking or light attached to Bob.

The four saved `Light-*` scenes share the production collection and the exact same material. They alter the whole environment's lights/world. Clinical light preserves blue; acid light shifts the surface toward teal while retaining darker blue depth. The alarm test uses red/orange key and rim plus dim cool room fill. A preliminary all-orange/red setup substantially suppressed blue, so the final test explicitly includes shared room spill rather than pretending colour is independent of incident light. The dark reveal uses reduced room light with a blue rim; catchlights remain visible but dim. These are Level-1-like lighting approximations, not captures from the actual level.

## I. Remaining visual gaps

- The concept has much richer painted interior layers, luminous translucent lobes and varied bubble depth. The restrained procedural treatment is cleaner and less painterly.
- The shader inclusions can read as faint surface markings in close-up. They have no parallax; this is accepted for the bounded recommendation, not represented as real bubbles.
- The side view retains some manufactured smoothness. Finite lower-edge faceting and small shading creases under the crest bulb are visible under inspection. Geometry and normals were preserved; these observations are reported rather than repaired.
- Eevee has grainier contact/rim shadows and less indirect colour than Cycles. These renderer differences do not invalidate the shared material structure, but actual Three.js matching remains untested.
- The gameplay-distance image is an orthographic scale/readability proxy, not a gameplay-camera or browser check. Coloured environments naturally change Bob's hue and catchlight colour.

## J. Evidence and review

| Required inspection | Final evidence |
| --- | --- |
| Neutral front | [PNG](evidence/bob-material-lookdev/neutral-front.png) |
| Neutral 3/4 | [PNG](evidence/bob-material-lookdev/neutral-three-quarter.png) |
| Neutral side | [PNG](evidence/bob-material-lookdev/neutral-side.png) |
| Face close-up | [PNG](evidence/bob-material-lookdev/close-face.png) |
| Body/crest highlight | [PNG](evidence/bob-material-lookdev/close-highlight.png) |
| Lower/thin region | [PNG](evidence/bob-material-lookdev/close-thin-edge.png) |
| Gameplay-distance proxy | [PNG](evidence/bob-material-lookdev/gameplay-distance.png) |
| Clinical | [PNG](evidence/bob-material-lookdev/clinical.png) |
| Acid green | [PNG](evidence/bob-material-lookdev/acid-green.png) |
| Orange/red alarm | [PNG](evidence/bob-material-lookdev/alarm.png) |
| Dark containment/reveal | [PNG](evidence/bob-material-lookdev/containment-reveal.png) |
| Flat grey production mesh | [PNG](evidence/bob-material-lookdev/flat-grey-production.png) |
| Concept beside final | [Comparison](evidence/bob-material-lookdev/concept-vs-lookdev.png) |
| Cycles vs Eevee | [Comparison](evidence/bob-material-lookdev/cycles-vs-eevee.png) |

[Neutral contact sheet](evidence/bob-material-lookdev/neutral-inspection-sheet.png) · [Lighting sheet](evidence/bob-material-lookdev/lighting-sheet.png) · [Scale and grey sheet](evidence/bob-material-lookdev/scale-and-grey.png).

Renders were produced through Blender MCP and inspected visually, including live viewport captures. Contact sheets only resize and arrange the render files with labels; there is no retouching or generative alteration. The supplied concept is copied as review evidence, not introduced as a runtime resource. No external model, texture or HDRI was added. Historical iterations are isolated in `iterations/`; the [evidence manifest](evidence/bob-material-lookdev/evidence-manifest.json) records image hashes.

## Files, local review, verification and Git

- Created `assets/character-spike/bob-material-lookdev.blend`: separate saved look-dev asset, recommended material, stage, cameras, lighting scenes and hidden diagnostics.
- Created `assets/character-spike/bob-material-lookdev.validation.json`: preservation checks and final asset identity.
- Created this handoff and `docs/evidence/bob-material-lookdev/`: renders, supplied reference, labelled comparisons and image manifest.

Open from the repository root with `blender assets/character-spike/bob-material-lookdev.blend`. The saved scene is `Bob-Gel-Lookdev` with Eevee and the recommended material. Use Numpad 0 for the camera view and F12 to render. The `View-*` cameras retain the close-up/side/gameplay-proxy framings. Select one of the four `Light-*` scenes to inspect the corresponding environment. Avoid editing the original production source.

Verification performed: source/blockout/GLB hashes, report count/bounds comparison, exact before/after production geometry comparison, saved look-dev reopening, Blender MCP visual iteration, final Eevee inspection and Cycles comparison, four lighting tests, and evidence review. Build/browser/gameplay/performance tests were not run because this phase changes no runtime files. No browser check is required for this Blender-only change.

Branch: `polish/level-1`. Commit requested by the user with subject `[asset] establish Bob gel material lookdev`. No push or remote message was made. No commit attribution line applies. **Stop here for material approval.**
