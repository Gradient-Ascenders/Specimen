# Level 2 Room 5 material pass

## Scope and source revision

Fetched `origin` on 2026-09-08. `origin/main` and the existing resolved merge's
`MERGE_HEAD` both identify `aa9b3cfcc1789a9083bdf20813b926323f83f864`.
The latest Room 5 implementation is present. Work remains on
`codex/level-two-room-one-art`, with the previous merge intentionally uncommitted.
No reset, discard, commit, push, or PR was performed.

## Requested art report

1. **Current Room 5:** confirmed against the fetched main revision above.
2. **Areas found:** lift arrival/shared vent, horizontal fork, Bob's vertical
   adhesive shaft and exit lip, Goop's contaminated duct and free drop, seven
   covered chamber stations and six jumping sections, upper release walkway,
   suspended Volt pod, vaulted sewer/channel/banks, both barred culverts and
   recessed tunnels, damaged-drone area, three security controls, concealed sewer
   exit, maintenance cross-passage/turn/ramp, reunion floor, rescue shortcut,
   conductive terminal and final exit.
3. **Reused finishes:** shared lab wall, floor, duct, structural-metal, adhesive,
   warning accent and dynamic-acid resources. Flying scouts borrow the same
   metal bump/roughness maps used by earlier encounters.
4. **New resources:** ten shared material variants, zero new textures or lights.
   Variants cover lab panels, duct, structure, safe deck, utility teal, damp
   drainage, culvert lining, worn iron, adhesive and the conductive terminal.
5. **Lift transition:** existing Room 4 treatment leads into the same brushed,
   panelled service duct. Geometry/opening dimensions are unchanged.
6. **Vent/fork:** metre-scaled seams and brushed metal; restrained teal floor
   guides. Adhesive wall and lip retain the Level 1-derived adhesive maps and
   a recognisable cyan finish. Vent contamination uses the shared liquid.
7. **Bob side:** off-white modular walls, dark baffles and suspension machinery,
   pale safe decks and teal service framing. Existing jump silhouettes, cover
   boundaries and suspension geometry are preserved.
8. **Goop side:** damp panelled drainage structure, darker banks and lower vault,
   teal pipes, worn iron grates and textured recessed culvert linings.
9. **Acid:** all 13 Room 5 rendered surfaces share `labArt.acid`: eight vent
   patches, chamber bed/front, main sewer channel and two culvert water surfaces.
   The existing bounded interaction sampler supplies movement/landing effects.
   No new acid shader, displacement or hazard changes.
10. **Drones:** retained the authored flying-scout geometry and sensor language.
    Static machinery is merged by material to reduce repeated shadow draws.
    Animated eyes remain separate. The damaged scout retains its independently
    breakable pieces, reaction/aim highlighting and existing wear.
11. **Volt/final:** teal containment base/cap, existing glass and moving cables,
    pale reunion decks and a restrained gold-toned conductive terminal with
    yellow boundary accents. Original moving pod light and release choreography
    remain authoritative.
12. **Damp treatment:** selectively lower roughness on drainage surfaces, existing
    roughness/bump detail, and inexpensive world-scale lower-wall runoff shading.
    Culverts and worn grates remain rough. Other surfaces are not made glossy.
13. **Readability:** sticky cyan, pale safe decks, dark acid, teal service hardware,
    original coloured network indicators and limited yellow hazard accents.
    No new geometry narrows an opening or jump exit.
14. **Reuse/lifecycle:** Room 5 consumes `CultivationLabMaterials` through
    `CultivationMaintenanceArt`, following the existing elevator art ownership
    pattern. All maps are borrowed. Static work happens once at construction;
    there is no Room 5 art update loop. Disposal restores original bindings and
    releases owned batches/variants. Static collider meshes remain registered
    and individually visible to physics, with hidden render materials.
15. **Draw calls:** 341 original static rendered meshes become 37 spatial/material
    batches, plus three instanced service-marking batches. Flying scout detail
    is merged separately. Exact measured results follow below.
16. **Regression:** the first art iteration was profiled and its excessive draw
    overhead corrected before completion. Final measurements distinguish the
    existing expensive entrance/upper views from art-induced changes.
17. **Gameplay/collision:** authored Room 5 layout/controller/sewer/parkour source
    remains unchanged. Added tests compare every collider's vertices, transform,
    metadata and visibility, plus LOS sweeps, hazard bounds and reset/checkpoint
    transforms. Existing Room 5 gameplay tests now instantiate the dressed room.
18. **Checks:** 391 automated tests pass, type-check passes, production build
    passes. Browser details and profiling evidence are recorded below.
19. **User inspection:** check the fork and cyan shaft lip, first covered landing,
    dark sewer/drop and culvert mouths, switch-handle contrast, upper Volt view,
    moving pod, concealed sewer exit and reunion terminal on your display.
20. **Remaining concerns:** Room 5's nine moving searchlight shadows and Volt's
    point-light shadow remain more expensive than Rooms 1-4. Cold shader/upload
    stalls and upper-chamber views merit future profiling after visual approval.
    No claim of universally locked 60 FPS is made.

## Verification method and limits

The browser run uses the real runtime, camera, hazards, burn coordinator,
checkpoint system and roster. Debug positioning moves between authored areas;
scripted burn actions operate the drone and switches. This is an assisted
browser sequence, not a manual mouse-aim or uninterrupted keyboard playthrough.
The Node gameplay suite exercises actual kinematic vent climbing, Goop duct/drop
and ramp traversal, charged jumps, cover LOS, network exposure, acid contacts,
progression and reset behavior against the dressed room.

The scout non-overlap test uses precise rendered-vertex bounds. Merging meshes
makes a rotated cached local bounding box more conservative; that would falsely
report overlap despite identical rendered geometry. The precise check preserves
its requirement that flying models never overlap.

A prior browser attempt confirmed full room restart clears rescue. Death/retry
is checked separately because it is supposed to retain the rescue checkpoint.

## Evidence

Generated and ignored evidence is under `artifacts/room-five-art/`:
`before.json`, intermediate `after.json`/`batched.json`, `final.json`,
`journey.log`, gameplay-camera PNGs, `tests.log`, and reusable profiling/journey
scripts. No production code depends on those diagnostics.

## Final performance measurements

Edge/ANGLE, Intel UHD 620, 1280 x 720, 90 requestAnimationFrame intervals per
sample. These are frame intervals, including CPU and GPU scheduling, not isolated
GPU timer queries. No tests/builds ran concurrently with the final profile.

| View | Before ms | After ms | Before calls | After calls | Before triangles | After triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Room 5 arrival | 33.3 | 33.3 | 1362 | 430 | 52345 | 100921 |
| bob-route | 33.3 | 33.3 | 1397 | 403 | 50009 | 99257 |
| sewer | 33.4 | 33.2 | 1338 | 415 | 51997 | 102601 |
| controls | 33.3 | 16.8 | 1302 | 361 | 51042 | 92570 |
| volt | 33.4 | 33.3 | 1595 | 439 | 72307 | 120575 |

Draw counts include shadow rendering. Triangle counts rise because a material
batch has a broader shadow-frustum bound than its formerly separate pieces;
merging itself does not add triangles. The submission reduction is beneficial
on this hardware. Service markings add only a small primitive budget.

The final run measured about 30 FPS in the entrance, Bob-route, sewer and upper
views, and about 60 FPS at controls. An earlier identical-route sample reached
60 FPS on Bob's route and in the sewer as well. Repeat/restart samples vary
between 16.7 and 33.3 ms. This is not a locked-60-FPS room; the final heavy-view
medians match the original Room 5 baseline, with substantially fewer draw calls.
Cold entry still exhibits frame-time spikes (final entry p95 116.6 ms).

After visiting the Room 5 views, renderer memory was 737 geometries and 41
textures with 63 shader programs. All three counts stayed exactly stable across
two repeated Room 5 entries and two restarts. Before art, the corresponding
traversal reached 849 geometries and 36 textures. The five additional uploaded
textures are existing shared library maps now used in Room 5, not new image
resources. New views of other rooms subsequently upload their own existing
resources; those increases are distinct from repeated Room 5 growth.

Room 5 has 142 visible shadow-casting meshes after batching. It retains 19
visible lights in interior samples, including the nine searchlights and Volt's
point light that cast shadows. Entrance overlap includes two existing Room 4
lights, bringing that sample to 21. No light, shadow resolution or shadow
enablement policy was added or changed.

Final Rooms 1-4 checks measured 16.7 ms each, with 18 / 44 / 72 / 63 draw calls
respectively. No major new sustained regression was observed. Remaining Room 5
cost is explicitly retained as a limitation, not hidden by lowering resolution,
disabling searchlight shadows or changing detection.

## Completed browser checks

The assisted runtime sequence reached the controls checkpoint after three burn
actions on the damaged drone, toggled red/blue/green independently, released
Volt, recovered from a deliberate acid death with the rescued checkpoint intact,
selected Volt, powered the terminal and completed the three-body exit.
The shared acid pool emitted contact and movement disturbances. The separate
full-restart check restored the split checkpoint and locked Volt, as authored.

Both the successful journey and final profiling run reported no browser console
errors, page errors or HTTP resource failures. Gameplay-camera screenshots were
reviewed for vents, adhesive, sewer, controls, chamber, return passage and final
terminal. The deliberate dark-room palette remains dark; a human review of
contrast and route readability on the target display is still valuable.
