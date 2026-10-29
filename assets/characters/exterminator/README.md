# EX-04 Exterminator family

Original project models for the finale: an armoured four-turbine carrier and
three dedicated flying drone templates. The separate Specimen character and
the lair source file are untouched.

`exterminator-family.blend` is the editable source, in **Exterminator Foundry**.
`generate-drones.py` reproduces its manufactured surfaces, rigid pivots and
material batches using Blender 5.2 or newer:

```sh
blender --background --python assets/characters/exterminator/generate-drones.py
```

The generator owns only that scene and writes the `.blend`, `.glb`, and a
geometry report beside it. Preview lights, camera, and template layout positions
are excluded from the game export. Everything is original geometry and surface
work; there are no downloaded models, fonts, or textures.

## Game contract

The GLB exports four roots, with game X/Y-up/Z coordinates and forward **-Z**:

| Root | Use |
| --- | --- |
| `EX_Boss` | Heavy carrier, at the existing uniform game scale of 3 |
| `SW_Guardian` | Broad armour and raised circular emitter |
| `SW_Pursuer` | Narrower body and dorsal pursuit fin |
| `SW_Advanced` | Pale reinforced armour and guarded turbines |

Small models fit the original 1.8 by 1 by 1.7 m envelope before the requested
**1.15** size multiplier. Advanced units retain their additional **1.8** multiplier.
The squad's real hit geometry grows by the same 15 percent, while existing
role-specific aim padding stays independent. Flying movement uses matching
larger avoidance spheres. Drone health, wave sizes, fire rates, attack durations,
and progression are unchanged.

`ExterminatorBossRig` consumes existing attack stages: cannons aim, spin and recoil;
the four iris sectors retract into the housing; cooling louvres open under load;
and turbine gimbals brace during manoeuvres. Active RAM levels the gimbals so its
wing height still permits the existing fully charged jump. Phase two removes one
rear armour plate and bends another, exposing hot conduits. Retry restores all
articulated parts and the original intact appearance.

Core and projectile proxy objects keep their identity and original positions.
The prepared rigid meshes replace the RAM contact hull before gameplay. Minion
banking, recoil and interpolation move visual children; they never move the
squad's authoritative collider roots. Mechanical debris uses a fixed visual pool.

`ExterminatorModelAsset` owns shared immutable geometry, materials and two original
512 px metric micro-surface maps. Models are loaded during Blackout's presentation
preparation, before material warmup. Every wing clones transforms while sharing
the same resources, including across retries. The level's reflection environment
is borrowed and never disposed by the drone asset. The original procedural boss
remains available for synchronous headless encounter fixtures.

## Verification

```sh
npm run build
npx playwright test tests/browser/rendering/ExterminatorModels.spec.ts
```

The model checks exercise actual exported geometry and pivots, real RAM contacts
and jump clearance, unchanged target proxies, resource sharing/disposal and retry.
Opaque triangle checks include same-batch geometry through firing, shielding,
phase-two damage, and reset, at 0.1 mm and 2 mm world-space tolerances. These
tolerances are geometric checks, not a claim about every GPU or camera.

The production-browser review captures Medium/High gameplay, boss detail, both
small-drone roles and advanced reinforcements in the actual lair. It writes local
evidence to `artifacts/evidence/exterminator-models/`. Software-WebGL captures
establish visual integration, not hardware performance.
