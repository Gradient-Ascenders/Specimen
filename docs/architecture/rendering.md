# Rendering and assets

`RenderLayer` owns one renderer, canvas, scene root, camera rig, resize policy
and application render. Level scenes own their lights, meshes, materials and
effects. Gameplay uses authored collision primitives rather than render meshes.

The relative Vite base supports root and nested static hosting. Use Vite-managed
URLs for bundled assets and base-relative URLs for public files; match Linux
filename casing. See the [asset layout](../../assets/README.md).

## Presentation and preparation

`TitleScreenScene` shares the application renderer and loop. The opening and
later cinematics have their own timeline/presentation owners and hand back to
the level's authoritative progression. Capture-only trailer scenes are separate
entry modes described in [development](../development.md).

Before gameplay or cinematic playback, prepare required models, geometry,
materials, shader variants, shadows and render targets. Preparation is paced
and cancellable. Do not substitute a low-resolution or partial warmup for the
actual first-use requirements. Restart should reuse prepared resources;
unload/dispose releases level-owned allocations.

Room workload owners scope visibility, static transforms, batching and resource
registration. Keep culling conservative around doorways, windows, moving
assemblies and shadows. Moving doors/platforms invalidate their relevant caches.
Collision and trigger registration must remain independent of visual culling.

## Characters, surfaces and lighting

Character presentation reads body snapshots: position, velocity, grounded state,
abilities and cinematic poses. Authored models, morphs, gel shaders, reflections,
electrical effects and LOD choices change appearance only. Keep deformation,
shadow and depth variants aligned. Dispose private geometry/materials while
preserving borrowed shared resources.

Environment geometry is authored in Blender and supplemented by generated
surface, geometry and radiance banks. These are prepared offline and loaded by
the runtime. Substantial opaque surfaces must not overlap; moving assemblies
must retain their authored pivots and material bindings. Keep emission,
transparency, lighting and real shadow ownership explicit.

Graphics profiles control visual cost. They must preserve puzzle visibility,
controls, collision, damage and progression. Diagnostic overrides are not
performance acceptance evidence.

## Validation

After changing source art or generators, run `npm run check:generated-assets`
and the relevant browser coverage. Compare matched views, shader preparation,
resource counts after restart/unload, and console/network failures. Benchmark
real assessment hardware separately; software WebGL captures establish behavior
and visual comparisons, not hardware frame rates.
