# Maintenance drone

Original Blender utility craft for Volt in Blackout's maintenance bay. A compact
yellow chassis carries a rubber gel saddle, four guarded lift fans, replaceable
batteries, landing shoes, status contacts and a downward searchlight housing.

`maintenance-drone.blend` is the editable source. The `Blackout / Maintenance
Drone` scene includes studio lights, a floor and a review camera; those objects
are excluded from `maintenance-drone.glb`. Geometry uses metres and exports Y-up,
with -Z forward. No textures, lights, cameras or animation clips enter the GLB.

The runtime payload is `src/assets/blackout/maintenance-drone.bin`: approximately
96 KB gzipped. The craft has 6,920 rendered triangles and 12 mesh batches. Four
independently animated rotors share a single mesh buffer and material. Fixed
guards, saddle and service fittings are batched by finish. Runtime finishes borrow
the existing maintenance material kit's wear maps; no new textures or lights are
allocated for the model.

`MaintenanceDronePresentation.prepare()` resolves the asset during level loading,
before the existing shader preparation and GPU warmup. The presentation keeps
the existing light, beam occlusion, dust, fault sparks and mount tutorial. Its
status contacts use the existing startup/power/fault states.

Gameplay continues to use `MaintenanceDroneDevelopmentFixture` and the vehicle
controller: the 1.65 × .5 × 1.65 collider, +.72 m rider anchor and all flight,
recovery and boarding rules retain their positions and behavior. The saddle top
is +.27 m, matching Volt's .45 m body radius. Shoes stop at -.25 m. The optical
window does not cast shadows, and the bezel leaves clearance for the spotlight
at (0, -.13, 0).

Regenerate from the repository root with Blender 5.2:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python assets/vehicles/maintenance-drone/generate-maintenance-drone.py
node scripts/assets/generate-blackout-maintenance-art.ts
```

The generator exposes separate hull, fan, cradle, light and export stages for
native Blender MCP iteration. Re-running export preserves the editable parts.
`node scripts/assets/generate-blackout-maintenance-art.ts --check` checks both Blackout
geometry bundles and is included in the generated asset CI check.
