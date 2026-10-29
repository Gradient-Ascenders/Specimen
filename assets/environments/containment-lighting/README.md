# Containment indirect light and reflections

`radiance.bin` is a gzip-compressed, versioned bank generated from the five
committed Blender-authored room GLBs and the runtime's fixed fixture parameters.
It contains **2,251 spatial irradiance probes** and five **256×128 RGBE room
captures**. The compressed bank is approximately 307 KiB; unpacked data is
839,064 bytes. No third-party textures or environment maps are used.

The bake runs in an isolated headless Blender process and never reads or saves
the user's editable `.blend` scenes. Blender's BVH ray queries test the actual
static architecture. Ninety-six deterministic sphere directions per probe
integrate one diffuse bounce, projected into cosine-convolved L1 spherical
harmonics. Fixed luminaires and the acid area emitter contribute; moving lift
cars, platforms, doors, characters and cinematic light states are excluded.
Those retain their existing live lighting and shadows. This is precomputed
indirect light, not real-time multi-bounce global illumination.

Four coefficient volumes per room are padded and packed into a single
9×13×196 half-float 3D texture. Trilinear filtering interpolates the probes;
world normals reconstruct directional irradiance. Low quality samples L0 only.
Static scenery and moving characters use the same world-space data, avoiding
unique light-map UVs, room-sized textures and per-object shader variants.

Five offline reflection captures trace the actual architecture with its fixed
lighting and baked diffuse bounce. During loading, Three's PMREM generator
filters each capture once into a temporary target. Those targets are packed
into one CubeUV atlas and immediately released. Box projection corrects
reflections against each room's bounds. Shading blends adjacent probes across
doorways. The two retained textures use 3,624,096 GPU bytes, excluding driver
overhead. Gameplay never captures a cubemap or regenerates a probe.
Matte finishes use the diffuse bake alone; gel, glass, metals and polished
finishes receive local specular reflections. Probe bounds are uniforms, and
world positions reuse the physical shader's existing view-position varying.

These are coarse, static approximations. They do not reflect moving characters
or animate an indirect-light response to alarms. Normal bias, separate room
bounds and restrained indirect intensity limit coarse-grid light leakage.

## Reproduce

From the repository root:

```sh
node scripts/assets/generate-containment-radiance.ts
/home/kevin/bin/blender --background --factory-startup --python assets/environments/containment-lighting/bake-radiance.py
node scripts/assets/generate-containment-radiance.ts --check
```

The export records GLB hashes, fixture state, probe layout and the Python
generator hash in `bake-input.json`. The bank embeds the input hash.
`check:generated-assets` validates these together without launching Blender.
The runtime validates the header, dimensions and payload lengths before GPU
allocation. Both retained textures belong to `ContainmentRadiance` and are
released on level unload; pending loads are aborted.

## Shafts and soft shadows

Seven authored atmospheric shafts reuse their fixtures' cached shadow maps.
They use three soft scattering shells (one on Low), with depth writes disabled,
and follow existing fixture colours and state intensities. There are no new
lights, shadow maps, full-screen passes or particle textures. These bounded
shadow-masked shells approximate scattering; they are not a ray-marched fog
simulation.

High quality opts Containment into raw-depth sampling. Five hero spotlights
(one per room) use eight blocker-search and twelve filter samples for PCSS;
other spotlights use compact four-comparison bilinear PCF. Blocker/receiver depths are
linearised using each selected light's finite far plane and common 0.35m near
plane. Filter radii are capped at ten texels. Low and Medium retain native
comparison-sampler PCF. Other levels retain their own shadow policy. Changing
sampler type releases dormant/padding maps as well as active maps before hidden
preparation, avoiding comparison/raw-depth mismatches on later room entry.
