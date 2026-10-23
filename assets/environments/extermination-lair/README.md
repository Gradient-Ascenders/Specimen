# Extermination Lair

Original industrial finale architecture: armoured fortress walls, recessed reactor
banks, cooling machinery and a short service gantry, a command citadel above the
escape, and a suspended deployment cradle. Dark metal and restrained red reactor
lighting contrast with the neutral light on the walking deck.

`extermination-lair.blend` is the editable source. The owned scene is
**Extermination Lair**; the original character assets are independent. The GLB
contains geometry and base finishes. The game supplies the original metric PBR
maps described in `src/assets/blackout/extermination-maps.md`. Blender's preview
lights and camera are excluded from the GLB.

## Rebuild

With Blender 5.2 or later:

```sh
blender --background assets/environments/extermination-lair/extermination-lair.blend \
  --python assets/environments/extermination-lair/generate-lair.py
npm run generate:extermination-maps
```

The generator replaces only its architectural scene and owned orphan data. It
writes the `.blend`, `.glb` and geometry contract in `extermination-lair.validation.json`.
All geometry and textures are original project work; there are no external texture
or model dependencies.

## Integration contract

The source uses metric game coordinates, X/Y-up/Z, with the arena centre at zero.
Blender authoring converts these to Z-up; glTF export converts them back. The game
adds `FINAL_ARENA.centreZ` once to the static root. Seven roots are exported:

| Root | Runtime owner |
| --- | --- |
| `Lair_Static` | Fixed room architecture |
| `Lair_EntryDoor` | Existing entry-door collider and animation |
| `Lair_ExitDoor` | Existing escape-door collider and animation |
| `Lair_Hatch` | Existing encounter deployment progress; lift, then slide |
| `Lair_Cover_Bastion` | Shared destructible cover template |
| `Lair_Cover_Capacitor` | Shared destructible cover template |
| `Lair_Cover_HeatSink` | Shared destructible cover template |

The playable annulus retains its 62 m inner radius, 99.5 m outer radius, 0.4 m
floor and 96 m ceiling. Its original deck/wall collision meshes remain authoritative.
New soffit seals close the staging-room gap; a stepped entrance keeps the inner
flight clearance high. The escape frame closes the former side bypass. Moving
door art has manufactured clearance inside the door pockets.

`ExterminationLairLayout.ts` defines all ten cover solids and their art dimensions:
six outer stations (8.5 by 5.2 by 4 m) and four staggered inner barriers (10.5 by
5.6 by 4.4 m). The outer stations sit at 89 m to preserve the middle running
lane as well as the inner route. Cover blocks shots using
the real collision world; RAM removes the matching collider and visual assembly,
and retry restores both without loading/cloning another set.

The floor's coated plates, replacement plates and grates partition its annulus,
with narrow recessed joints. Thresholds, corridor floors and structural footings
own disjoint floor areas. Structural underside caps buried in the footing are
removed. Glass galleries, wall labels and baked panel grids from the earlier
vault treatment are not part of the lair.

Both doorway signs are shallow raised lettering seated on framed, bolted panels.
The entrance plaque mounts on the solid side pier; the escape plaque mounts on
the lintel. Their inset panels and frame rails own disjoint surface areas, and
the lettering's actual rear bounds touch the panel face. The sign assemblies
remain named children of the static root for geometric contact checks.

Preparation awaits the GLB and texture bundle before the level's light compilation
and shader warmup. Geometries, shared template resources and authored lamp materials
have one arena owner. The reflection environment is borrowed from the level and
is never disposed by the arena.

## Verification

```sh
node --test tests/ExterminationLair.test.ts tests/ExterminationMaterials.test.ts
node --test tests/FinalBoss.test.ts tests/FinalBossMechanics.test.ts tests/FinalBossPhaseTwo.test.ts
node scripts/generate-extermination-maps.ts --check
node scripts/audit-extermination-surfaces.ts /tmp/lair-exact.json
SURFACE_TOLERANCE=.01 node scripts/audit-extermination-surfaces.ts /tmp/lair-clearance.json
```

The surface audit includes the adjoining staging room, both doors, ten covers and
the deployment hatch in initial, deployment, combat, escape and reset states.
It tests submitted opaque triangles, including triangles within a material batch.
Transparent effects and the separately owned boss/character meshes are outside
that environment-only scan; the browser review includes the actual encounter.

`tests/browser/ExterminationRoomArt.spec.ts` captures the production game at Medium
and High, including the entrance, machinery, ceiling, warnings and repeated retries.
Screenshots are written to `artifacts/evidence/extermination-room/`. Software-WebGL
captures establish rendering/integration evidence, not hardware frame-rate claims.
