# Level 2 Room 2 material pass

This extends the [Room 1 palette](level-two-room-one-material-pass.md) through the
next authored chamber and both Room 2-to-3 connections. The live entry point remains
`LevelTwoPreviewScene`, reached through the existing Level 2 debug route. Room 3's
interior and the separate production foundation scene are unchanged.

## Reuse and visual hierarchy

Room 1 and Room 2 now borrow the same `CultivationLabMaterials` owner, named
`labArt` in the composition root. There is no second material library, asset download or dependency. The adhesive
walls also reuse Level 1's exact turquoise membrane material factory and its two
64² organic normal/roughness maps.

The nine shared materials are:

- Off-white laboratory wall panels.
- Grey laboratory floor panels.
- Cooler ceiling panels with service recesses.
- Dark structural metal.
- Brushed duct/shutter metal with horizontal seams.
- Yellow platform finish using the floor maps.
- Brown soluble-support finish using the metal maps.
- Neutral emissive fixture finish.
- Level 1 turquoise adhesive membrane, shared across all six sticky-wall panels.

The reference remains Level 1's ceramic/graphite/service-metal hierarchy and
Room 1's restrained seam wear. Room 2 varies the context: metal cladding around
Bob's elevated vent bay, a dark button-rest ledge and mounts, and a taller room
with neutral fill at 14 m. White architecture stays dominant; no extra rust or
brown surface treatment was needed to establish the machinery area.

## Changed surfaces and connections

Room 2's entry floor, walls, doorway partitions, ceiling, suspended blocks,
soluble braces, ceiling mounts and button-rest ledge receive existing shared
finishes. The three existing wall pieces immediately above/beside Bob's vent
receive the duct finish, leaving its aperture and adhesive approach intact.

The Room 1-to-2 passage keeps its established treatment. Goop's Room 2-to-3
passage now shares the same floor/wall/ceiling panels, metal shutters and frame
clearance fix. Its two instanced fixture/trim batches follow the Room 1 rhythm.
Bob's entire duct shell and existing ribs use the shared metal finishes; its
existing cyan luminaires and three received lights are reused with no extra
fixtures or lights added inside the duct.

Room 2's added wall fixtures/trim are restricted to the east wall, leaving the
west adhesive route and its lasers/button clear. Ceiling fixtures and two
non-shadow-casting neutral point lights retain the laboratory presentation.
All additions are presentation-only and use the existing art-owner disposal path.

## Gameplay identity and UVs

The six adhesive wall panels now match Level 1's turquoise wet membrane; their
normal/roughness density follows its large-wall 6.08 × 6.55 m repeat. The duct's
separate adhesive entry patch, radioactive floors, lasers,
button pad, door-status indicators and remaining interaction cues retain their original
materials/controllers. Button colours still change red-to-green while held;
the Goop shutter still locks/unlocks through its existing controller. There is
no authored glass or separate pressure plate to dress in this room.

Wall tiles remain 4 × 3 m; floor, ceiling and metal repeats remain 2 × 2 m.
The updated 26.3 m metal duct floor therefore spans 13.15 texture repeats along its top
face. Shared texture objects keep repeat=(1,1); physical scale lives in per-face
box UVs. Moving blocks/braces use local UVs. The thin non-soluble tethers retain
their original plain finish because their unit-height meshes stretch as blocks
fall; this avoids stretching panel seams or adding UV updates to gameplay.

Collider vertices, transforms, registrations, surface tags, checkpoints and
triggers are unchanged. The existing 15 mm door-frame correction applies only
to non-colliding frame presentation. Materials/geometries are restored before
room/door teardown; shared textures and materials have one disposal owner.

## Reuse and performance

| Metric | After Room 1 | After Room 2 |
| --- | ---: | ---: |
| Shared palette materials | 8 | 9 |
| Shared palette textures | 15 | 17 |
| Dressed existing meshes | 45 | 141 |
| Raw texture data | 10.5 MiB | 10.53 MiB |
| Estimated texture data with mipmaps | 14 MiB | 14.04 MiB |
| Added instanced draw submissions, maximum | 4 | 8 |
| Added neutral point lights | 2 | 4 |

The fifteen RGBA textures remain 512² for wall/floor/ceiling map sets and 256²
for metal/duct map sets. The adhesive maps add 32 KiB before mipmaps and no texture requests.
Texturing increases fragment sampling on 96 additional existing meshes; there
is small geometry-copy overhead for UV ownership. No FPS or low-end GPU benchmark
is claimed. No per-frame texture generation or extra transparency is introduced.

## Verification and review

- All 332 Node tests pass, including the new Room 2 regression for collider and
  special-material preservation, cross-room material sharing, duct UV scale,
  hold-button/door state and restoration on disposal.
- Type-check and production build pass. Vite retains the >500 kB bundle warning.
- Headless installed Microsoft Edge, 1280 × 720: checked entry/long walls, upper
  blocks/ceiling, button ledge, elevated vent approach, Bob's duct and Goop's
  passage from the game camera. Debug tools/teleports were used to reach poses.
- All three block supports were completed; blocks reached `landed`, and reset
  returned all three to `suspended`.
- Production preview smoke check uses the real UI to enter Authored Room 2.
- No logged page errors, console errors or HTTP responses >=400 during checks.
- Screenshots and verification scripts: ignored `artifacts/level-two-room-two-art/`.

Human review should focus on normal traversal along the west adhesive/laser wall,
the vent approach while jumping from the third block, the transition between the
neutral chamber and cyan duct light, and low-end hardware performance. Room 1's
material parameters and texture pixels are unchanged.

To inspect locally: open `?debug=1`, start the trial, F2 → Enter Level 2, enter the
level, then F2 → Authored Room 2. No commit, push or PR was made for this pass.

## Main synchronization — 2026-09-07

Fetched `origin/main` at `f192083` (PR #117) and rebased the local Room 1 art
checkpoint onto it. The current branch contains all commits from that fetched main;
Room 2 art remains uncommitted. The pre-sync branch reference and stash were
retained as backups.

Room 2 now has four lasers, including the new moving gates and revised rotation,
the enlarged/repositioned ledge and blocks, and authored high wall detailing.
The shared palette covers the new seam/course strips, upper trim and fluorescent
strips. Upstream removals of soluble marker bands and slime rings are retained.
The updated Room 3 puzzles, dynamic collider registration, passage clearances and
all other main changes are also preserved; none are replaced by the older layout.
