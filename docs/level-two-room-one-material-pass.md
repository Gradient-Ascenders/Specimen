# Level 2 Room 1 material pass

Follow-up: [Room 2](level-two-room-two-material-pass.md) extends this same palette
through the next chamber and both outgoing routes. The figures below record the
original Room 1 checkpoint.

## Scope and live entry point

`LevelTwoPreviewScene` owns the authored Level 2 rooms, instantiated by
`CultivationLevelRuntime` through `CultivationLevelDebug` when debugging is enabled.
The production foundation scene is a separate implementation. This pass deliberately
preserves that arrangement. Open with `?debug=1`, start the trial, use F2 → Enter
Level 2, enter the level, then F2 → Authored Room 1.

The pass covers Room 1 and its Room 1-to-2 laboratory passage. Rooms 2 and 3,
their connecting passage and Bob's elevated duct are outside this room's art scope.

## Reference and direction

Inspected ContainmentTeachingScene, the Containment art resources/procedural textures,
RoomOneArt, RoomTwoArt, modular components, the active Cultivation composition,
Room 1 authoring, both passage types, shutter presentation and RenderLayer.
Level 1 combines warm off-white ceramic skins, cooler secondary panels, dark graphite
seams and backing, brushed service metal, neutral fluorescent fixtures, muted cyan
status details and transparent low-opacity glass. Its art uses deterministic runtime
DataTextures and instanced architectural details.

Level 2 retains that family with slightly greyer ceramic, seam dirt, faint short
scratches, corner fasteners, roughness variation, subtle metal-joint discoloration
and ceiling service recesses. Wear remains secondary to the clean panel structure.
The renderer retains NeutralToneMapping, exposure 1 and sRGB output. Two local
neutral point lights counter the existing green fill; the original hazard lights stay.

## Shared library inventory

Owner: `src/render/environment/cultivation/CultivationLabMaterials.ts`.
All textures are original deterministic RGBA DataTextures generated once per owner.
Each finish below has three maps: `albedo`, `relief` (bump), and `roughness`.
Their names are `cultivation-lab-<finish>-<map>`.

| Finish | Texture resolution, each map | Material | Uses |
| --- | --- | --- | --- |
| wall | 512 × 512 | off-white ceramic, roughness 0.76 | Room walls, passage walls and partitions |
| floor | 512 × 512 | grey laboratory composite, roughness 0.84 | Start/far floors and passage floor |
| ceiling | 512 × 512 | cooler panels with recessed service slots | All existing ceiling pieces, passage ceiling |
| metal | 256 × 256 | cool structural steel, metalness 0.72 | Mounts, vent frame, shutter frame, instanced trim |
| duct | 256 × 256 | brushed metal with horizontal joints, metalness 0.70 | Vent-frame metal and both shutter panels |

Three further materials share these resources or need no texture:

- `cultivation-lab-platform`: floor maps with the existing yellow platform colour and emissive cue.
- `cultivation-lab-soluble-rope`: metal maps with the existing brown support colour, nonmetallic response and high roughness.
- `cultivation-lab-neutral-fixture`: Level 1's neutral fixture colour/emissive recipe; no maps.

No Level 1 texture instances are borrowed or mutated. The existing procedural
approach and fixture recipe are reused; the Level 1 art library remains untouched.
Existing Room 1 acid, green marker bands, exit header and door status materials
remain in use. Room 1 has no authored glass or pressure plates; no glass geometry
or unrelated caution decals were introduced.

## Mapping and application

45 existing meshes receive the shared finishes. Box UVs are projected per face from
metres, on a cloned geometry. Static shell pieces align to the authored grid: wall
panels are 4 × 3 m, floor/ceiling/metal tiles 2 × 2 m. Moving platforms, ropes and
doors retain local mappings so their textures do not slide during movement.
Rope repeats are 0.5 m. Positions, normals, indices, collider registrations,
transforms and gameplay metadata are unchanged for colliders. The two passage
frames have a 15 mm presentation-only reveal into the doorway to separate their
inner faces from the wall faces. Jamb tops meet the lowered header without
overlapping front faces.

The adjoining passage uses exactly the same material objects and scale as the room,
with neutral ceiling/wall strips, graphite skirting and selective vertical service
trim. These are instanced presentation-only boxes. The ceiling fixture placement
explicitly excludes the entrance vent's 4 × 4 m opening. Door indicators stay under
the original door controller and retain their lock-state colours.

## Ownership and cost

- 8 materials, 15 shared textures; no texture HTTP requests or downloaded assets.
- 10.5 MiB raw texture data, approximately 14 MiB including a full mip chain.
- Four additional instanced draw submissions at most (two per dressed space),
  plus two non-shadow-casting point lights. No per-frame texture generation.
- Existing mesh draw submissions are retained; texture and bump sampling increases
  fragment work. No claim of unchanged FPS or a hardware benchmark is made.
- Box geometry clones add small CPU/GPU geometry overhead while originals are
  retained for clean ownership restoration.
- On teardown the art owner restores borrowed meshes, disposes its geometry clones,
  instance buffers, materials and textures once, and removes lights/detail groups.
  The existing room/door owners then dispose their original resources normally.

## Verification

- Node 24.19.0 and npm 11.17.0. The shell's npm shim points to a missing roaming
  installation; the installed npm CLI was invoked directly without changing tools.
- Full existing test suite: 320/320 passed.
- After the final art refinements, 26 targeted material, preview and runtime tests
  passed, including two new regressions for immutable collision/metadata, physical
  UV scale, restoration/disposal and unobstructed vent presentation.
- `npm run type-check` and `npm run build` passed. Vite reports a >500 kB chunk
  warning; the main application remains a large existing bundle.
- Headless installed Microsoft Edge at 1280 × 720: entered Level 2 through the UI,
  inspected Room 1 from the normal camera, looked up at platforms/ceiling, inspected
  exit shutter and passage, and exercised support completion/reset.
- A production preview browser check also enters the authored Room 1 debug route.
- Browser listeners monitor page errors, console errors and HTTP responses >=400.
  Screenshots and local verification scripts are under ignored
  `artifacts/level-two-art/`.

Recommended human art review: the long wall repetition at maximum camera distance,
the green/neutral lighting balance on the hazard boundary, the entrance vent from
above, and the rope/platform appearance during ordinary acid aiming. GPU timing on
the intended low-end hardware has not been benchmarked. No commit, push or PR.
