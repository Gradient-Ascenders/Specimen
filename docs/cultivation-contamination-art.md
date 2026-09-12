# Cultivation Rooms 1–3: issue #97

Rooms 1–3 now share weathered laboratory panels, damp floors and sealed wall
cultivation cassettes with failed glass, tank cartridges, drainage pipes and
organic growth. Existing traversal surfaces and cover retain their strong
silhouettes. The implementation is presentation only.

Source: [issue #97](https://github.com/Gradient-Ascenders/Specimen/issues/97) and
the supplied `Room 1 Detailed.md`, `Room 2 Detailed.md`, `Room 3 Detailed.md` in
the worktree root. Those reference files are not modified by this change.

## Files and ownership

- `src/render/environment/cultivation/CultivationContaminationArt.ts` — new
  shared material/dressing owner; original procedural maps, geometry batching,
  glass and room lighting adjustments. No update callback or gameplay writes.
- `src/levels/LevelTwoPreviewScene.ts` — applies the owner to Rooms 1–3 before
  static collider batching, attaches their dressing and disposes the owner.
- `src/levels/CultivationLevelScene.ts` and `CultivationLevelRuntime.ts` — use
  the existing resolved room to apply a dimmer, neutral foundation in Rooms 1–3.
  The original Room 4–5 foundation and dark-room transition remain available.
- `tests/CultivationContaminationArt.test.ts` — one lifecycle regression checks
  repeated resets, stable collision metadata, scope isolation, exactly-once
  resource disposal and preservation of borrowed maps until their owner disposes.
- `CREDITS.md` — original asset provenance. No additional third-party assets.
- This document and `docs/evidence/issue-97/` — visual evidence and limitations.

The base lab library remains unchanged, including the materials borrowed by
Rooms 4–5. Level 1 rendering, physics, gameplay controllers, #92 aim/highlight,
lasers, drones and the acid implementation are unchanged.

## Materials and geometry

Ten new shared materials use eight 256 × 256 RGBA weather maps and one
512 × 512 RGBA glass atlas (3 MiB before mipmaps). Relief maps are borrowed
from the lab owner. Albedo is sRGB; roughness is linear. Maps use repeat wrap,
linear mipmap filtering and anisotropy 4, matching the existing library.

Weathered walls retain four-by-three-metre panel UVs. Floor, ceiling and steel
use two-metre tiles. Rust stays strongest around joints. The small wall shader
hook places sparse leak sources at panel-height joints in world space. Uneven
channels taper downwards; patches of residue and low damp staining leave broad
areas intact. It varies colour and roughness, never collider vertices or surface
tags. A screenshot iteration removed regular comb-like streaks and reduced the
frequency of upper-wall wear.

Wet floors remain opaque, with subdued albedo variation and roughness patches.
There is no second transparent puddle layer, refraction pass or new render target.
Sticky tiles keep their existing glossy relief, ropes/braces retain their warm
soluble appearance, and safe platforms retain their separate pale top treatment.
Ordinary service steel and matte, irregular leaf silhouettes do not use those
interactive treatments.

Nine shallow cultivation cassettes follow the authoritative side walls. Their
frames remain within 16 cm of the wall face, with lightweight leaves reaching
19 cm. Stepped surrounds, gaskets, fasteners and sill drainage frame the glass.
Cartridges have bands and level marks; their shallow relief retains round
shading normals. Curved stems carry sparse, folded leaves of varying lengths. They do not create freestanding
obstacles, landings or cover. Room 2's adhesive west wall is left clear. All
opaque detail is merged by material per room: at most nine added submissions
per room including glass, before frustum culling. The nine panes are individually
sortable; there are no unique materials per cassette. Geometry/texture creation
occurs only during construction.

Glass uses four actual chipped silhouettes matched to four cells of one atlas.
Fine angular fracture branches originate at broken edges. Edge grime, droplets
and condensation share the same map and draw pass. It is `DoubleSide`, `forceSinglePass: true`,
`transparent: true`, `depthTest: true`, `depthWrite: false`, opacity 0.76 multiplied
by map alpha (mostly much lower). Default render order retains distance sorting.
Panes do not intersect each other in the authored rooms. Opaque frames, roots
and tanks are depth-tested, so glass cannot paint over foreground slimes.

## Room lighting and radioactive liquid

| Room | Lighting decision |
| --- | --- |
| 1 | Neutral fills 285; desaturated acid fills 7; neutral exit source 10. Pale platforms, dark steel mounts and warm soluble ropes remain distinct. |
| 2 | Main fill 285; high vent fill 235 with a soft cool tint. Far pool light reused at the lower door with a muted warm tint, intensity 85/range 22 m; remaining acid fill 7. Three upper bars and two lower jamb bars distinguish the destinations by shape as well as colour. |
| 3 | Cool-neutral fills 245, desaturated acid fills 10, restrained warm security source 65. Cover stays solid and upper platform tops and drone eyes retain their existing treatment. |

Rooms 1–3 also use neutral foundation colours with hemisphere intensity 0.62
and directional intensity 0.82 (previously 0.9/1.35). This removes the overall
green cast and approaches the darker paused reference without changing the
pause overlay, slime colours or renderer exposure. Rooms 4–5 restore their
original foundation values.

No real lights or shadow casters are added. Emissive cassette indicators do not
create extra lights. Existing room visibility scoping and finite-light shader
optimization remain active. Rooms 1–3 retain the renderer's disabled realtime
shadows; Room 5 shadow configuration is untouched. Tone mapping remains Neutral,
exposure 1, sRGB output, with no room exposure changes.

The existing acid already provides counter-flowing domain-warped noise, film,
bubbles, animated normal response and a bounded twelve-event ripple pool. It
was retained after inspection. Its existing flow speed 0.26, flow scale 0.17,
bubble scale 5.2, bubble strength 0.64 and emission strength 0.025 are unchanged.
The new opaque warning strips mark the safe floor edges in Rooms 1–2; Room 3
retains its existing safe-boundary strip. The presentation reads existing body
state; no radiation, immunity, failure, drone or progression authority changed.

## Local viewing

From this worktree run `npm run dev -- --host 0.0.0.0 --port 5174`, then open
`http://localhost:5174/?debug=1`. Start trial, press F2, select Enter Level 2,
then enter the level. Use F2 and Authored Room 1/2/3 to visit the rooms; hide the
panel and use the ordinary mouse camera. Look up at the suspended route, inspect
the side-wall cassettes and switch with Tab. In Room 2 compare the cool high vent
and warm low door. In Room 3 inspect both Bob's upper entrance and Goop's cover.

Production was built with `npm run build` and served at
`http://localhost:5175/specimen/?debug=1`, with `dist/` as the `/specimen/` root.

## Screenshots and verification

| View | Before | After |
| --- | --- | --- |
| Room 1 | [Before](evidence/issue-97/room-1-before.png) | [After](evidence/issue-97/room-1-after.png) |
| Room 2 | [Before](evidence/issue-97/room-2-before.png) | [After](evidence/issue-97/room-2-after.png) |
| Room 3 vent entrance | [Before](evidence/issue-97/room-3-before.png) | [After](evidence/issue-97/room-3-after.png) |

Additional production views: [Room 3 upper](evidence/issue-97/room-3-upper.png),
[Room 3 lower/cover](evidence/issue-97/room-3-lower.png),
[Goop in acid](evidence/issue-97/acid-goop.png),
[glass front](evidence/issue-97/glass-front.png),
[glass back](evidence/issue-97/glass-back.png),
[window detail](evidence/issue-97/window-detail.png), and
[window from gameplay](evidence/issue-97/window-gameplay.png).
The room, window and glass views were refreshed after the second polish pass;
the dedicated acid image records the first pass.

The room images use the normal collision-aware gameplay camera. The window
detail uses a temporary eye-level inspection camera; the adjacent gameplay
image shows its actual scale and the Goop/liquid separation. Debug checkpoints
and a debug placement on the existing Room 3 entrance platform were used to reach
representative views. The glass images use a temporary inspection scene with the
actual production pane/material, two overlapping panes, both slime materials
and an opaque bar between panes. Both sides remain readable and foreground depth
is respected. The inspection scene and its temporary bar geometry were cleared.
No harness or runtime exposure is shipped; browser response instrumentation
provided inspection access only.

Checks run:

- Baseline `npm test`: 89 test files passed before edits, on the identical main
  source revision. The full suite was not repeatedly rerun after the scoped edit.
- `npm run type-check` and final `npm run build`: passed.
- Existing acid material/contact, lab/chamber materials, render-scope and
  presentation-preparation tests: six files passed after initial integration.
- New ownership regression plus finite-light/render-scope checks: three files
  passed after the runoff shader refinement. Later texture/primitive refinements
  were built and inspected in production.
- Built browser: Rooms 1–3, upper/lower Room 3 views, glass front/back/overlap,
  keyboard movement/jump/switch, Goop acid occupancy, aim/fire inputs, Bob hazard
  death and Retry, level restart, unload/reload. The final runtime was running
  in Room 1 with the death screen hidden and zero active acid ripples.
- Second polish pass: existing ownership, Cultivation scene and Room 5 lighting
  tests passed (10 tests across three files). No new tests were added for the
  reversible visual refinements. The final `npm run build` includes TypeScript.
- Final production check: Rooms 1–3, Room 3 upper/lower routes, window detail,
  glass front/back with overlapping panes and opaque geometry, and restart.
  Before/after restart counts were identical: 2,061 scene objects, 62 lights
  (including hidden/padding lights), 323 unique materials, three art groups,
  415 resident geometries, 34 textures, 73 programs and zero active acid ripples.
  These are warmed traversal counts; resources are loaded lazily as rooms are
  visited. No additional lights, materials or objects appeared on restart.
- Foundation values read back as 0.62/0.82 in Room 1; switching the presentation
  method to its later-room setting restored 0.9/1.35. Room 4–5 gameplay was not
  replayed in the second pass.
- Production console: zero errors; only the known missing
  `KHR_parallel_shader_compile` warning. Production asset requests returned 200;
  no 404s. `git diff --check` passed.
- No lint command or lint configuration is provided by this repository.

Limitations: this was Chromium with ANGLE SwiftShader, not representative lab GPU
hardware. DPR caps 1 and 2 were exercised on a DPR-1 browser, so they produced the
same effective resolution. No weakest-hardware FPS claim, exhaustive route
completion, every projectile/laser combination, or full lighting-zone playthrough
is implied. Those remain playtest/review work. No PR was opened or merged.
