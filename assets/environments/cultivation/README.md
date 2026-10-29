# Cultivation Blender environment

Editable Level 2 presentation authored and reviewed in native Blender 5.2.1 via
Blender MCP. The design continues Containment's ceramic, alloy, resin and amber
hardware into a degraded cultivation laboratory. Gameplay, lighting and camera
authority remain in the existing TypeScript owners.

| Export/source pair | Design and runtime ownership |
| --- | --- |
| `room-1.blend` / `room-1.glb` | Abandoned irradiation nursery: dirty white/grey enclosure, recessed irrigation rack/mixing bay, folded wall ivy and suspended Level 1 decks/harnesses. `roomOne.root` and the three existing platform owners. |
| `passage-1-2.*` | Decontamination/sample inspection throat, fitted doorway returns. Original doors and inspection equipment remain. |
| `room-2.*` | Load calibration hall, recessed rams and adhesion scale. Original sticky route, button, supports and blocks remain. |
| `passage-2-3.*` | Filtration intake and cartridge bays around the original animated fan. |
| `bob-duct.*` | Pressed service liner outside the original rectangular traversal envelope. |
| `room-3.*` | Security extraction gallery, filter banks, pressure piers and the exit hood. Original cover, drones and released wall assemblies remain. |
| `room-4.*` | Service lift, boarding/arrival skins, shaft cassettes and guide wheels. Static geometry uses `roomFourGeometry`; moving batches use the existing named owners. |
| `room-5.*` | Quarantine crown and pressure bulkhead; fork, climb shaft, drop, interceptor vault and sloped return. Curved return skin follows `room-5-maintenance-reunion-door`. |
| `escape-duct.*` | Splayed cinematic airway, branch and full drop shaft. Follows `cultivation-volt-finale-basement-airduct`; original practical strips, inspection room, floor hinges and movie state remain. |

## Source and export contract

`authoring-layout.json` records the protected enclosure footprints, exact sloped
profiles, retained occluders and existing mechanism frames. It was derived from
the production scene at branch baseline `96db526907482c3fe3ba7f1e30a58a7413bb9074`.
It is an authoring input, not a second gameplay layout.

`generate-cultivation.py` builds individually editable parts in metres. Three.js
`(x, y, z)` maps to Blender `(x, -z, y)`. Named runtime-owner empties carry preview
poses only; export strips those poses and writes owner-local geometry. No light,
camera, collider, image, animation or baked illumination is exported.

Opaque box assemblies use one exposed union boundary. Deformation creases are
split before triangulation. Independent moving/visibility owners use physical
clearances or fitted lap joints. The editable surfaces and export copies agree;
temporary export batches are removed before saving. Reference meshes, when
included locally, are explicitly marked, hidden from renders and excluded from
the selected export. The inactive empty factory Scene contains no starter objects.

Accepted native edits are reproducible: the nursery vault and fitted hangers,
Room 2 calibration equipment, Room 3's 18-degree hood louvres, lift hatch fasteners,
Room 5's 32-degree diaphragm and the escape liner's splayed upper profile are all
encoded in the generator. An exported mesh's `finish` and `runtimeTarget` extras
are required contracts, not gameplay controls.

## Regeneration

From the repository root, with native Windows Blender available through the WSL
wrapper:

```bash
/home/kevin/bin/blender --background --factory-startup --python-exit-code 1 \
  --python assets/environments/cultivation/generate-cultivation.py -- \
  --cultivation-build room-1
```

Repeat for the nine IDs in the table. The base generator needs only checked-in
inputs. Optional `--references` uses the local baseline scene captures under
`artifacts/evidence/cultivation-blender/baseline/`; add `--current-references` to
use the later `references/` capture instead. Those reference inputs affect only
the editable studio, never export geometry. Do not enable the reference option
for `escape-duct`, whose local reference file is not part of that capture set.

`--cultivation-reexport room-1` instead loads the saved editable source and exports
its existing parts without rebuilding or resaving it. Comparing this export with
the generator output checks source/export agreement; it is distinct from full
generator regeneration.

After every exported edit:

```bash
node scripts/blender/register-cultivation-blender.ts
node scripts/assets/generate-cultivation-assets.ts
node scripts/assets/generate-cultivation-assets.ts --check
npm run build
```

The registration step reads the actual GLBs, rejects non-geometry exports and
invalid node names, and aliases identical immutable buffers. The offline bank
generator preserves their exact positions, UVs, topology and bounds. Presentation
normals use normalized signed 16-bit values; linear vertex colours use normalized
8-bit values. Maximum component rounding errors are `0.5/32767` and `0.5/255`.
Index buffers use 16 bits when they fit without the reserved restart index.
Identical arrays share immutable bank storage; each runtime geometry still owns
its editable arrays. Lossless word deltas improve gzip compression and decode
directly into those owned arrays. Runtime loads the compressed asset bank; it
does not import Blender, the generator or the GLBs.

## Ownership, finishes and preparation

`CultivationBlenderArt` replaces superseded render coverage by changing material
bindings. Collider identity, geometry, transforms, tags and visibility remain
intact. Retired collider drawings skip old procedural batching, and invisible
materials exclude them from preparation. New local matrices are frozen; world
matrices inherit their original controllers. Aliased geometries, shared finishes
and maps each have one disposal owner. Disposal restores original bindings.

The level bank includes only the used Containment ceramic diffuse/normal/ORM
family, using the accepted Level 1 BC7 blocks and complete mip chains (6 MiB).
The unused resin family is omitted. Devices without BPTC fetch the original
RGBA family before GPU preparation (18 MiB before mipmaps, 24 MiB with mipmaps).
Sampler settings and source bakes remain the same. The escape airway reuses its existing
unlit finish policy. The later Room 1 art revision explicitly authorizes moving
its two neutral fills and two existing shadow keys to the modelled practicals.
Their final room-local positions are `[-9,17.85,15.5]` and `[9,17.85,35]`, with
one fill/key pair per fixture. All other light placements, light counts,
activation, colours, intensities, shadow settings and role policy are unchanged.

Room 5 uses a conservative render scope across the opaque chamber/sewer wall.
It masks static batches and registered chamber skins/effects only when both the
camera and active player are inside one sector; fork, portal and return-route
views retain both. Each draw restores original visibility in `finally`. Lights,
colliders, mechanism state, inactive bodies and mandatory preparation remain
under their existing owners.

For Level 2, Balanced gel uses a quarter-dimension background-refraction capture
before mandatory GPU preparation. The full physical gel option retains its
requested capture quality; unloading releases the level's budget. This affects
the background seen through gel, independently of scene resolution and shadows.

Room 1 uses dirty white/grey painted panels, vertex-painted wear and the existing
weather/deck maps. Foliage is modelled with folded, thick leaves and closed stems;
it has no animation, transparency or new texture bank. Copper-coloured wall
panels were removed following visual review. The three platforms preserve their
exact collider tops and use the Level 1 inset deck/corner markings plus the
canonical `containment-room-two/generate-room-two.py::build_thruster_harness`
recipe. Only its brackets, braces, latches and empty annular cradle are included;
no engine, nozzle, flame, glow, sound or spill light is added. These parts inherit
the real drop owners. Superseded procedural platform art is no longer built.

Retained environmental text signs have fitted backed metal frames. Room 1's
main directory board was removed after review. Lettering uses plain painted material and retains
the existing standard-material shadow policy. `CultivationSurveillanceArt` reuses
the exact opening/Level 1 Blender camera in all three Cultivation locations, from
the existing offline bank. One shared prefab owns its geometry; original mounts,
gimbals, Bob tracking, room culling and reset remain unchanged.

The four lift guide wheels reuse the repository's
`containment-room-four/room-four-lift.glb` / `R4_Batch_Wheel_Alloy`. Existing platform,
fixture, cover, drone, pod, observation and cinematic assets retain their original
provenance. No external assets or generated imagery were introduced.

Room-scale culling stays in place. Room 5's static exports are split into spatial
finish batches; moving owners remain separate. Repeated lift cassettes share
geometry buffers. Resource changes and actual staged-render counts are recorded
in the local evidence manifests; software-renderer captures do not establish hardware FPS.
