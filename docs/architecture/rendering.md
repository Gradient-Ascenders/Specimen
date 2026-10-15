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

### Cultivation generated assets

The authored Level 2 factory loads `src/assets/cultivation/authored-assets.bin`
before constructing its scene. Vite manages the URL, including nested deployment
paths. Native asynchronous gzip decompression prepares lossless CPU buffers;
version, alignment, ranges, geometry bounds and repair targets are validated.
There is no runtime fallback to texture generation or triangle repair.

`CultivationAssetSource` is an explicit construction dependency. The runtime
borrows decoded CPU inputs; each existing art owner receives its own textures
and mutable geometry arrays and retains responsibility for disposing them.
Sampler settings can change independently between owners. Texture pixels are
borrowed immutable views of the decoded bundle. Restart reuses the scene's
resources, and unloading releases the same resources as the authored path.

The bake includes the lab, weather, membrane, platform, equipment, glass and
warning textures; shared ceramic/acid inputs; equipment and deck geometry;
Room 3 collider batches; Room 3/5 platform batches; Room 5 spatial batches and
shadow hulls; the continuous adhesive skin; and final overlap repairs. Scene
objects, gameplay colliders and controllers retain their authored identities.
Repair skins attach in local space to their existing moving or soluble owner;
collider vertices, dimensions and transforms remain independent of those skins.
The original texture algorithms and overlap repair orchestration live under
`scripts/lib/`; authoring recipes remain alongside the art they describe.
Small presentation details and authoritative collider primitives still use
their existing constructors.

After changing authoring inputs or recipes, regenerate and validate:

```bash
npm run generate:cultivation-assets
npm run check:generated-assets
```

PR validation regenerates both asset bundles and compares every compressed
byte. Generation omits timestamps and random object identifiers and normalizes
the gzip platform marker. Use the pinned Node/npm toolchain for reproduction.
Do not edit the binary by hand.

For a matched comparison with the audited revision, check it out separately and
make the locked dependencies available to that checkout. Run
`scripts/profile-cultivation-construction.ts --baseline-root <checkout>` and
the same script without that argument, sequentially, with `node --expose-gc`.
The scripts emit separate asset preparation, construction, sampled repair and
sampled GC measurements plus raw CPU profiles under `artifacts/perf-192/`.
Nested sample attribution must not be added to construction time.
`scripts/compare-cultivation-bake.ts <checkout>` compares mesh, collider,
normal, UV, texture, metadata and motion-state parity. The capture and comparison
scripts provide matched per-room PNGs, including drops, doors, lift motion,
rescue and reset. The manually dispatched **Cultivation bake diagnostics**
workflow runs these checks and retains their raw artifacts for review.

Local/CI CPU and SwiftShader diagnostics do not establish minimum-device loading
or frame-time budgets. The production content-path decision, target GPU/browser
qualification and independent implementation/visual approval remain the
separate requirements of the performance parent issue and review workflow.

### Production checks

For rendering changes, verify the ordinary journey and affected level under a
production build. Check narrow and wide viewports, restart/unload cycles,
console and network output, WebGL errors, shader-program counts, and stable warm
geometry/texture counts. CPU/SwiftShader browser checks are correctness smoke
tests, not hardware performance measurements.
