# Blackout lighting and shadows

Level 3 keeps its dark blackout baseline: near-black unpowered chambers,
restrained amber hallway pools, a separate Volt duct, green acid spill,
warm restored light banks and a white research landing. Volt and restored
fixtures provide the useful illumination. Acid surface emission and both live
and baked green spill remain subdued. Bob, Goop
and Volt still derive their reflection strength from actual nearby fixtures.
Structural edge materials on platforms, the duct and gantry respond to light;
deep machinery recesses keep their inexpensive black materials.

## Offline data

The lighting approach follows Containment/Cultivation: bounded diffuse
transport and local, box-projected reflections are baked from the actual
adopted runtime geometry. `generate-blackout-radiance.ts` composes the real
neighbouring rooms and machinery, excluding independently moving gates,
platforms, dissolving targets, shaft copies and the arena. Static opaque
black surfaces remain BVH blockers. Built-in font geometry and all models
retain their existing sources; no extra modelling assets are required.

`bake-radiance.py` adapts the existing Cultivation baker. A 1.5 GiB process
limit bounds its Windows background process. It creates no Blender objects
and never opens or changes the user's interactive scene. Forty-eight fixed
rays per probe estimate one diffuse bounce, using visibility-weighted L1
spherical harmonics. Invalid probes inside walls/hardware contribute neither
energy nor interpolation weight. Reflections include the same static lighting
and diffuse transport. This is a bounded approximation, not full dynamic GI.

The runtime bank contains 1,458 probes, 169 suppressed probes and twenty
64 by 32 RGBE captures across ten separate volumes. Its deterministic gzip
payload is **126,694 bytes**. The irradiance texture uses 188,160 bytes;
the filtered reflection atlas is 1,344 by 320 half-float RGBA pixels. Both are
prepared during loading. There are no live reflection captures, per-frame
texture uploads, full-screen lighting passes or new surface maps.

Each distribution bank owns an independent powered/emergency pair. The
switch platform has a separate volume for bank D. Duct and hallway volumes
avoid interpolation through the dividing wall. Runtime charge/arrival state
controls the car and laboratory volumes; the car's powered bake represents
the average of its existing passing lamps. Actual flashes remain live.
Diffuse probe lighting runs per vertex, including actual moving, instanced
and deformed poses. Pixel normals still shape direct lights, shadows, local
reflections and the very faint animated acid bounce. Matte architecture does
not acquire an unnecessary specular environment lookup.

```sh
node scripts/generate-blackout-radiance.ts
blender --background --factory-startup --threads 2 --python-exit-code 1 \
  --python assets/environments/blackout-lighting/bake-radiance.py
node scripts/generate-blackout-radiance.ts --check
```

The check validates source GLB hashes, actual static geometry, fixtures,
layout, baker hash and packed input provenance without launching Blender.
It is included in `check:generated-assets`.

## Runtime budgets and ownership

The four original point-light banks become soft downward spotlights. Banks A
and C own 512-pixel depth maps; B and D supply unshadowed direct illumination.
Medium uses bounded PCF. High enables contact-hardening filtering on the two
banks, reusing the same depth maps. Fixed shadow maps cache static geometry,
invalidate on moving/burning machinery, and update for nearby characters.
Camera culling defers unseen updates. Three restrained atmospheric shafts
reuse the hallway/bank maps without allocating companion depth targets.

`BlackoutLightLayout` follows Cultivation's render-only selection. Every draw
retains four ordinary point slots, two shadowed spot slots and three ordinary
spot slots. Tiny zero-radiance lights fill unused slots. Real fixtures keep
their power, intensity, colour, parentage, range and interaction state.
Selection samples the active body and camera view, with hysteresis and a
screen-space fallback for cinematic shots. Masks restore synchronously after
draws and compilation submissions. The shared renderer retains ownership of
quality and shadow type; no point-light cube shadows are added.

New materials retain deformation/dissolve hooks, custom shadow passes and
finite-light guards. Prewarming uses the same bounded light signature as live
draws. Graphics changes, pause, checkpoints, restart, skip and unload preserve
the existing gameplay owners. The lighting owner restores material bindings,
releases its textures and padded maps, and discards cancelled late loads.
The boss retains its focused directional shadow and gets a small fill increase.

## Focused verification

```sh
node tests/BlackoutLightingPass.test.ts
node --test tests/BlackoutTransitController.test.ts tests/BlackoutElevator.test.ts \
  tests/MaintenanceDroneLighting.test.ts tests/ExterminationLighting.test.ts
node --test-name-pattern='Blackout|unallocated drone beam|custom shadow copies|retained-camera|preparation restores' \
  tests/ShadowPreparation.test.ts
node scripts/generate-blackout-radiance.ts --check
npm run build
```

Five new tests cover finite two-state data, independent circuits, unchanged
colliders/fixtures, pause and cinematic ownership, quality/map limits,
cancellation/disposal and stable light counts with a remote active body.
The nine relevant preparation tests and the existing lift, transit, drone
lighting and arena-lighting files pass. The complete preparation file also
has three pre-existing failures in the opening's file-URL asset fixtures and
an instance-upload expectation. They reproduce against the unchanged helper
from commit `8b8c04e`; they were not altered in this lighting pass.

Native Chrome captures use Intel Iris Xe / D3D11, Medium at 1,600 by 900.
Matched views cover the unpowered bay, Volt's local pool, hallway, duct,
unpowered/powered distribution hall, switch platform and lift landing.
Observed median GPU time decreased in those views; representative results
were 7.25 to 5.89 ms in the unpowered bay and 10.13 to 7.19 ms in the powered
hall. CPU results vary and are not a demonstrated CPU speedup. An initial
comparison loaded in 9.14 seconds before and 8.54 seconds with bounded lights;
later shader-cached entries were around 2.1 to 2.5 seconds. These are local
samples, not a qualification of the Ubuntu i3 laboratory computer or sustained
gameplay FPS.

The native checks exercise Low/Medium/High transitions, lift repair, ascent,
arrival, boss entry, restart and unload. No late shader programs or WebGL
errors were observed. Unload returned to one retained geometry and two
renderer-owned textures. Accelerated cinematic checks use reduced UI motion
to avoid interrupting HUD animations during synthetic fast-forwarding.
Ignored evidence and comparison logs live in
`artifacts/evidence/blackout-lighting/`. Human review of the final darkness
and restored-power contrast remains the next acceptance step.
