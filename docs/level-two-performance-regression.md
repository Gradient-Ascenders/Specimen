# Level 2 performance regression

Measured in Microsoft Edge headless on actual ANGLE Intel UHD Graphics 620 / Direct3D11, 1280 x 720. Each area uses the same debug checkpoint and forward camera, sampling 90 settled animation frames. FPS is refresh-capped near 60. Values are representative snapshots, not minimum frame-rate guarantees.

## Before / after

Cells are before -> after. GPU geometry/texture counts are cumulative renderer residency on the first traversal, not total CPU-owned assets. Material/texture-instance counts describe visible scene subtrees (including invisible-material collider instances). Lines and points were zero throughout.

| Area | FPS | Median ms | p95 ms | Calls | Triangles | GPU geometries | GPU textures | Visible meshes | Visible materials | Visible texture instances | Lights |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Level 1 Room 1 | 59.9 -> 59.9 | 16.7 -> 16.7 | 16.8 -> 16.8 | 196 -> 196 | 27044 -> 27044 | 366 -> 366 | 10 -> 10 | 896 -> 896 | 72 -> 72 | 8 -> 8 | 7 -> 7 |
| Level 1 Room 3 | 59.9 -> 59.9 | 16.7 -> 16.7 | 16.8 -> 16.8 | 103 -> 103 | 14700 -> 14700 | 366 -> 366 | 10 -> 10 | 894 -> 894 | 70 -> 70 | 8 -> 8 | 7 -> 7 |
| Level 2 Room 1 | 20.0 -> 59.9 | 50.1 -> 16.7 | 66.7 -> 16.9 | 170 -> 18 | 87474 -> 2162 | 184 -> 21 | 23 -> 16 | 1457 -> 86 | 218 -> 57 | 21 -> 18 | 45 -> 7 |
| Level 2 Room 2 | 20.0 -> 59.9 | 50.0 -> 16.7 | 66.8 -> 16.9 | 517 -> 44 | 115212 -> 1620 | 736 -> 90 | 23 -> 19 | 1457 -> 179 | 218 -> 67 | 21 -> 20 | 45 -> 10 |
| Level 2 Room 3 | 10.0 -> 59.9 | 100.0 -> 16.7 | 116.7 -> 33.3 | 678 -> 72 | 141796 -> 92744 | 1203 -> 280 | 23 -> 23 | 1457 -> 348 | 218 -> 108 | 21 -> 21 | 45 -> 19 |
| Level 2 Room 4 | 12.0 -> 59.9 | 83.3 -> 16.7 | 83.4 -> 16.8 | 268 -> 63 | 21071 -> 6086 | 1312 -> 332 | 23 -> 23 | 1457 -> 305 | 218 -> 100 | 21 -> 21 | 45 -> 10 |

## Root cause and isolated measurements

The regression starts immediately upon Level 2 entry. Level 1's
ContainmentLightingRig activates lights by room. Level 2 previously left all
five authored rooms and passages visible, including the lower sector. Three.js
frustum culling is not occlusion culling, and light collection includes visible
finite-range lights even when they contribute nothing to the current room.

Room 1 carried 45 lights rather than Level 1's seven. A controlled experiment
hid distant roots without altering materials, acid or simulation: draw calls
fell 170 -> 44, lights 45 -> 9, and median frame time 50.1 -> 16.7 ms.
The final production scope is tighter than that experiment at the Room 1 spawn.

Stage 1 alone restored Rooms 1, 2 and 4 to 16.7 ms. Room 3 improved 100 -> 33.3 ms,
retaining 19 lights for its entrance/passage overlap. CPU render time was only
about 2.2 ms, indicating remaining GPU work rather than a CPU update bottleneck.

Stage 2 skips RE_Direct only when Three.js's own directLight.visible test says
attenuation/cone contribution is zero. This retains the light, its range, its
colour and shadow behaviour. Shared lab materials call their original compile
hook first, preserving the acid shader. No global Three.js chunk is mutated.
Room 3 then reached 16.7 ms with the same lights and geometry. The shader test
checks all three guarded direct-light calls and retained acid/shadow code.
GPU limitation is inferred from frame/CPU timings and these isolated changes;
no GPU timestamp query was used.

## Render scope and unchanged gameplay

LevelTwoPreviewScene scopes parent render roots by camera/body position and
authored room/passage boundaries. Twelve-metre overlaps keep both ends of each
passage visible during approach. The closed lift arrival shutter excludes the
lower sector until arrival/entry. Detached Room 3 drone presentation follows its
room root.

Collider mesh visibility, identity, transforms and registration are unchanged.
All physics, puzzle, checkpoint, drone, door, hazard and inactive-body updates
retain their original ownership. The regression test compares collision sweeps
while a parent room is hidden and verifies that an inactive slime still drives
its occupied room's lasers. No camera or quality settings were changed.

## Material, texture, geometry and update audit

- The lab library already shares procedural maps. Generation and geometry clones
  happen during construction; no per-panel CanvasTexture/TextureLoader or
  per-frame material/texture recreation was found.
- No materials, textures or geometry were added by the performance fixes. Visible
  material counts fall because distant roots are excluded, not because CPU-owned
  art assets were deleted. The shader helper uses a WeakSet and existing hooks.
- Equipment variety, platform geometry, shaft detail and texture resolutions
  remain intact. No indiscriminate quality reduction or new batching was needed.
- All ten lower-sector shadow-capable lights use 512 x 512 maps. Shadow rendering
  was already disabled in Rooms 1-4, but the lights remained in the lighting list.
  Hidden roots now remove that cost. Active Room 5 shadows are unchanged.
- Rooms 1-3 share one acid material, a 12-event interaction pool and two body slots
  per basin. Hidden acid surfaces no longer submit fragment work. Their bounded
  contact sampling and one shared clock update remain; the effect was not removed.
- Fixed-update medians were approximately 1-2 ms. No gameplay updates were skipped
  for speculative CPU gains. Room 3 already gates encounters by both bodies;
  Room 4 returns early before descent; Room 5 encounter updates use progression.
- No duplicate callback/listener registration or accumulating leak was found.
  Existing unload disposes encounters, projectiles, art, maps and subscriptions.
  The old first-traversal GPU-memory growth was newly submitted distant assets.

## Lifecycle measurements

After the first optimised traversal, residency stabilised at 332 geometries,
23 textures and 38 shader programs. Two more complete room traversals and two
restarts kept exactly those counts and remained near 60 FPS. The Level 1 to
Level 2 transition releases the previous level's renderer resources.

Raw measurements, room contributions, object counts, CPU medians and every light's
type/range/shadow configuration are in artifacts/level-two-performance:
before.json, visibility.json, finite-light.json and after.json.

The lifecycle profiler finished all samples before its optional screenshot stage
used an incorrect diagnostic method. The image test was separated and corrected
to use Loop.pause/resume. This was a script error, not a game error.

## Remaining scope

Room 5 texturing has not started. This work removes its distant cost from Rooms
1-4 while preserving its incoming implementation. Its active dark-sector view
needs its own performance baseline before adding artwork. First-use uploads and
shader compilation can still cause transition hitches; repeat visits stabilised.
The measurements do not guarantee 60 FPS at every camera angle or during every
encounter. Final automated, build and browser checks are recorded with the task
result, including the frozen lighting comparison and elevator run.


## Final verification

All 390 automated tests pass, including the full existing Level 1/Level 2
regressions and the new hidden-parent collision/split-body and shader-hook tests.
Type-check and production build pass. No shader, page, console or HTTP resource
errors were observed in the final browser validation.

The frozen 1280 x 720 canvas comparison of branched versus unbranched lighting
changed only one of 921,600 pixels, each by one channel value (mean absolute
channel difference 0.000000362 on the 0-255 scale). This validates the zero-light
branch without reducing the image's lighting quality.

Browser gameplay checks observed acid contact, movement wakes and a stronger
landing response, then the real 60-second elevator sequence, all 12 cable burns,
falling wrecks, arrival vent opening, both slimes surviving and the existing
completed-elevator checkpoint after restart. Cable burns were invoked through
the existing dissolve action for repeatable review; manual mouse aiming remains
a useful local check. No commit, push, PR or Room 5 texturing was performed.


## Close-up acid follow-up

The spawn-view matrix did not cover a low Goop camera dominated by acid. A
separate Room 3 check measured 33.3 ms there after stages 1-2. Temporarily hiding
passage presentation brought its median to 16.7 ms; independently bypassing only
the procedural acid shader also brought it to 16.7 ms. The two costs compounded.
Neither diagnostic bypass was retained.

The shared acid shader previously evaluated nine candidate bubble cells per
pixel. Its maximum radius plus ring support is 0.7494 metres. Centres remain
at least 0.16 cells from an edge, so at the authored 5.2-metre cell scale no
neighbouring cell can contribute. The shader now skips those impossible cells,
unselected cells, zero-life bubbles and pixels outside the maximum bubble radius.
Smaller future bubble spacing retains the original neighbour search. Noise,
flow, colours, bubble positions/lifetimes, normal detail and ripples are unchanged.

Three frozen acid-dominant frames, seven animation seconds apart, were compared
against the original shader: zero changed pixels in all three 1280 x 720 images.
The revised close-up median was 16.7 ms (p95 33.4 ms), with the same 31 calls and
75,960 triangles. The low Room 1 view and moving lift also measured 16.7 ms.
This is a shared implementation optimisation and therefore benefits Level 1
acid as well; it adds no textures, materials, geometry or per-frame CPU allocation.
See acid-ab.txt, spot-check-bubbles.txt and bubble-pixel-comparison.json under
the performance artifacts. Final full-buffer wake results are recorded separately.


## Final moving-Goop stress result and readiness

The final Room 3 low-camera movement sample had all 12 ripple slots active:
median 16.7 ms (59.9 FPS), p95 33.4 ms, 31 calls and 75,960 triangles. No console
or resource errors occurred. Occasional 33ms frames remain; this is not a claim
of locked 60 FPS in every scene. The extra low viewpoint uploaded six previously
unseen geometries (338 total); four temporary comparison shader programs were
created deliberately for the frozen unbranched-lighting check. The preceding
repeat-traversal lifecycle comparison remains 332 / 23 / 38 throughout.

The sustained Rooms 1-4 regression is resolved on the measured hardware/paths.
It is reasonable to resume the next Room 5 task with an active-room baseline
before adding art, rather than assuming the unprofiled lower sector already
fits the same budget. This task stops at performance work.
