# Rendering and assets

## Renderer boundary

`RenderLayer` owns the renderer, canvas, root scene, camera rig, resize policy,
colour-space configuration, and application frame render. Level scenes own
their lights, environment effects, materials, meshes, and render resources.
Gameplay collision always uses authored primitives and registries; deforming
visual meshes, colours, names, and shader output are never gameplay authority.

The renderer uses a relative Vite base so built assets work at a domain root or
nested static-host path. Runtime asset references must remain Vite-managed or
relative and must match Linux filename casing.

## Materials, lighting, and shadows

Shared presentation helpers may reuse geometry, materials, and procedural
textures, but ownership must be explicit. The creator disposes a resource once;
borrowers must not dispose it. A level unload must return renderer geometry and
texture counts to their stable warm values.

Shadow maps are reserved for lights and geometry that materially improve
navigation, hazard readability, or character grounding. Static room shadows
should be prepared and cached where supported. Dynamic character and device
casters remain bounded. New lights require a documented role and an evaluation
of map size, render passes, and first-entry cost.

Later-level presentation can be prepared asynchronously before handoff. A
preparation task must be cancellable, must not attach its temporary scene to the
live game, and must dispose temporary render targets, shadow maps, geometries,
and materials on completion or cancellation. Runtime rendering must remain
correct when preparation is skipped or fails.

## Gel rendering quality

Settings → Character gel controls a session-owned `RenderLayer.gelRendering`
policy independently of canvas resolution. It applies to Bob, Goop and Volt,
including captive forms, hidden roster members and characters loaded after a
level transition. The [bounded graphics profiles](../graphics-profiles.md) select
`minimum` by default and `reduced-transmission` for Standard through this same
policy. They also apply an absolute canvas pixel budget, shadow-map cap and
decorative-effect density. Standalone material policies still default to physical
until a session configures them; the application defaults to Minimum hardware.

| Setting / policy value | Material path | Transmission target |
|---|---|---|
| Minimum hardware / `minimum` | Non-transmissive physical gel with authored tint, roughness, clearcoat, Fresnel specular, reflection map and emission | No character-triggered capture, resolve or mipmaps |
| Balanced / `reduced-transmission` | Authored physical transmission | Half width and height (25% of capture pixels), using Three's `transmissionResolutionScale = 0.5` |
| High / `physical` | Authored physical transmission | Full resolution when the additional Performance cap is off |

Main's optional Performance preset is retained as **Additional performance cap**.
Off (`normal`) is the default for this extra cap; the overall application still
starts in the Minimum hardware profile. On (`performance`) caps density at 1×
before render scaling, preserves an explicitly selected 0.75× density, and caps
transmission scale at 0.5. `GelRendering` combines this with gel quality using the
smaller scale, so neither setting can overwrite the other. Turning the cap off
restores the saved density choice and preserves explicitly selected Balanced gel.
The profile's absolute pixel budget always applies. Selecting Minimum/Standard
resets graphics overrides, including this additional cap. F1 is independent.

Minimum gel loses background refraction and volume attenuation; its tint is
more solid. It keeps the authored silhouettes, cyan/green/gold colors, glossy
eyes, elastic motion, shadows, camera/aim fades and Volt's mapped glow and
level-owned navigation light. It adds no artificial emission to Bob or Goop.
Balanced softens transmitted detail and edges. It still submits the opaque
environment twice and retains multisampling, resolve and mipmap costs. It
reduces fragment work in the capture, not scene submission or the main pass.
Minimum is the selected strategy for minimum hardware because it eliminates
that duplicated scene work even when a gel covers few pixels. A non-transmissive
`MeshPhysicalMaterial` retains these existing surface features without shader
patches or a renderer fork; choosing `MeshStandardMaterial` would also remove
the authored clearcoat/specular controls.

The policy captures each body's authored transmission once (Bob/Goop 0.28,
Volt 0.55) and restores it when leaving minimum mode. Opacity and reset never
restore transmission themselves. Body transparency stays enabled across modes
so existing prepared camera-fade variants and shadow masks remain applicable.
Disposed bodies unregister; shader-preparation copies borrow the selected
material settings without registering. Three owns any cached transmission
targets: switching to minimum stops their use, but does not free a previously
allocated target. Renderer disposal releases them. No per-frame material
traversal or additional render target is introduced.

Changing gel quality can compile a new surface variant. It explicitly invalidates
the debug recorder's fixed-configuration Level 1 shader-growth check and records
the reason in its status and exports. It does not disable WebGL shader error
reporting. The guard remains active for journeys that keep their startup quality.

### Reproduce the comparison

Use Node 24 and the package-manager version in `package.json`, then run:

```sh
npm ci
npm run type-check
npm test
npm run build
npx playwright test tests/browser/GelRendering.spec.ts
SPECIMEN_GEL_RENDERING_MODE=minimum npx playwright test tests/browser/VoltPresentation.spec.ts
npm run validate:production
```

The gel comparison intercepts the production bundle only to expose the existing
render layer to the test. It freezes a real Level 1 view and compares physical,
half-resolution and minimum gel at exactly the same camera, actors, viewport
and drawing buffer, then repeats modes to check bounded resources. It writes
screenshots and raw `comparison.json` to `artifacts/evidence/issue-188/`.
It asserts nonblank frames, zero GL errors, zero transmission-environment draws
in minimum mode, half-sized balanced targets, and stable warm texture/program
counts. WebGL timer queries, when available, record six independent full
frames and one sequential, non-nested pass breakdown: transmission environment,
screen environment, character, shadows and resolve/mipmap. Sum segments with
the same scope for that pass frame; do not sum full-frame samples. Instrumented
pass timings include boundary overhead and are attribution controls, not FPS.

Set `GEL_CAPTURE_WIDTH`, `GEL_CAPTURE_HEIGHT` and `GEL_CAPTURE_DPR` for a matched
viewport/buffer comparison. `SPECIMEN_BROWSER_CDP_URL` connects the tests to a
caller-owned physical browser. The lifecycle journey accepts the same three
mode names through `SPECIMEN_GEL_RENDERING_MODE` and exercises rescue, dark-room
lighting, aiming, switching, death/retry, merge/split, restart, failed loads and
unload. The minimum journey records first-death shader-program growth separately
and requires stable subsequent retry cycles; shader warmup remains part of #191.
Its mode-specific artifacts go under the same issue directory. This
journey explicitly enables the existing debug/authored Level 2 route; it does
not resolve the production-content parity work in #197.

Software rendering validates correctness only. Issue #188 still requires
matched interactive production captures on the confirmed assessment GPU,
including the worst rooms, and numeric budgets from #187/#198 before hardware
performance acceptance. Historical UHD 620 pass timings are motivation, not
new measurements. Neither reduced target area nor removed draws alone proves
a target-device frame-time budget. Attach raw captures and visual evidence to
the review; obtain independent visual/implementation review before closure.

## Character and content assets

Production Bob is loaded from `assets/characters/bob/bob-authored.glb`; its
kinematic sphere remains the gameplay body. Runtime deformation may change
scale, morph targets, facing, eyes, and materials, but must preserve the
collider/visual separation and restore neutral state on reset.

Keep only production assets and the source/generator inputs required to
reproduce them. Candidate renders, approval screenshots, rejected models, and
capture output belong in external review artifacts. A generated production
asset should have a deterministic validation contract when source provenance or
mesh structure is important.

## Verification

For rendering changes, verify the ordinary journey and affected level under a
production build. Check narrow and wide viewports, restart/unload cycles,
console and network output, WebGL errors, shader-program counts, and stable warm
geometry/texture counts. CPU/SwiftShader browser checks are correctness smoke
tests, not hardware performance measurements.
