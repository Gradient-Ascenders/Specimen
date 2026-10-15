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
level transition. A future minimum-hardware preset (#190) should select
`minimum` through this same policy. Hardware detection and a canvas pixel
budget are separate work; the default remains the authored physical look.

| Setting / policy value | Material path | Transmission target |
|---|---|---|
| Minimum hardware / `minimum` | Non-transmissive physical gel with authored tint, roughness, clearcoat, Fresnel specular, reflection map and emission | No character-triggered capture, resolve or mipmaps |
| Balanced / `reduced-transmission` | Authored physical transmission | Half width and height (25% of capture pixels), using Three's `transmissionResolutionScale = 0.5` |
| High / `physical` | Authored physical transmission | Full resolution, original renderer defaults |

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

### Distant character detail

`generate:character-lods` bakes attribute-aware meshoptimizer index banks from
the approved Goop/Volt GLBs without modifying those sources. The generator
includes normals, UVs and every authored position morph in its error metric
(maximum relative error 0.004). The distant Goop/Volt totals are 8,428/9,552
triangles versus 33,716/38,208 at full detail. Bob stays unchanged.

Preparation loads each bank through a Vite-managed URL, validates it against the
source vertex counts, and appends the indices to one per-instance index buffer.
`CharacterDetail` changes only the geometry's draw range: no extra geometry,
vertex/morph texture, material, shader variant or first-transition upload is
needed. Visible, depth, distance and transmission passes use the same range;
Volt's generated headroom morph remains shared. Existing asset owners dispose
the single geometry and its index bank. Full source topology remains the asset
validation contract; rendered topology is available through `detailDiagnostics`.

Runtimes update detail after the camera, including the captive/reveal instances.
Full detail switches to distant below 10% projected view height and returns
above 12.5%; zoom is respected. Collider, locomotion, animation and ability
state are independent of that selection. Injected test loaders can supply a
detail-bank loader explicitly; they do not implicitly fetch production assets.

### Acid flow lookup

`generate:acid-noise` bakes the existing three-octave FBM (float32 lattice hash,
cubic value noise, rotated octaves and authored weights) into a 256×256
single-channel byte table. Each of the three animated flow fields takes one
lookup instead of three value-noise evaluations. Four counter-moving domain
warp evaluations remain analytic: the shader does four rather than thirteen
value-noise evaluations, plus three lookups. Bubbles, derivative normals and
the twelve live ripple slots remain animated.

The table repeats over 16 noise cells, with an outer two-cell blend to match
opposite edges and their first derivatives. It samples 16 texels per base noise
cell. The flow pattern is now resampled, quantized and periodic, so this is a
quality-preserving visual change, not pixel-identical parity with the unbounded
arithmetic field. Replacing each lattice hash with a lookup was rejected after
software-renderer measurements; baking complete FBM fields needs fewer fetches.

Immutable CPU bytes are decoded once. Each acid material owns/disposes its own
linear, repeating, non-colour, mipmap-free texture; foundation/normal maps remain
borrowed. Regenerate with `npm run generate:acid-noise`. Both new generators
participate in `check:generated-assets`.

`scripts/capture-extra-optimisations.mjs` captures matched acid times/ripples and
full/distant moving-character views. `--root <checkout> --output <directory>`
selects another revision. It records draw counts, warmed programs, resource
cleanup and isolated render/readback wall times under `artifacts/`. These are
software-renderer diagnostics, not target-GPU performance evidence.
`--acid-only --reference-root <checkout>` additionally alternates the current
and reference shaders within the same browser/context to reduce run-to-run noise.

### Electrical presentation clock

Blackout electrical acquisition, power, device motion, tether revalidation and
hazards remain fixed-step mechanics. Beam/branch/spark buffers, outlines and DOM
feedback reconcile once per rendered frame, after the latest simulation state.
Explicit lifecycle resets may still reconcile immediately. Hidden outlines skip
target/bounds work until aiming resumes; unchanged overlay state does not write
the DOM again. Render-only pointer releases still hide the aiming feedback.

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

PR validation regenerates the asset bundles and compares their bytes.
Generation omits timestamps and random object identifiers and normalizes
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
