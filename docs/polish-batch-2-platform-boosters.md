# Fix 4: facility platform boosters and placement follow-up

The original Cultivation Room 5 engine, nozzle, rings, orange outer exhaust,
bright inner core, shader animation and spill-light parameters now live in
`src/render/environment/PlatformBoosters.ts`. Its original Room 5 selection stays
in `CultivationPlatformBoosters.ts`.

## Room inventory

| Level | Room | New engines | Retained engines | Selection / exclusions |
| --- | --- | ---: | ---: | --- |
| Containment | 1 | 0 | 0 | Floors, specimen pedestal and vent structures; no matching floating traversal slabs. |
| Containment | 2 | 8 | 0 | Platforms A/B/C/D, sticky-wall ledge, upper steps A/B and exit balcony. Compact platform A's engine for floor clearance. |
| Containment | 3 | 8 | 0 | Entry platform, A/B, wall-exit ledge and C/D/E/F. Remove entry/A/B's decorative column/base/collar assemblies. |
| Containment | 4 | 0 | 0 | Cargo lift, receiving/exit deck and duct; preserve the lift's own machinery and lighting. |
| Containment | 5 | 9 | 0 | Low platform C, central rest, three upper A platforms, final approach, final bounce and both moving platforms. Compact platform C's engine for floor clearance. Structural containment/observation/vent surfaces stay unchanged. |
| Cultivation | 1 | 0 | 0 | Three rope-suspended drop platforms deliberately land on the floor. Engines would conflict with their rope/drop presentation and intersect the floor after landing. |
| Cultivation | 2 | 1 | 0 | Button ledge uses standard traversal deck art and an engine. Three tethered drop blocks retain their brace/rope mechanics; vents stay unchanged. |
| Cultivation | 3 | 13 | 0 | Entry, launch island, cross-beam, first wall exit, offset island, west runup, west wall exit, west return island, cross-room A/B, final wall exit, last island and drop launch. Hide only first/west/final traversal-post skins; preserve their collision boxes and all permanent structures. |
| Cultivation | 4 | 0 | 0 | Existing lift/boarding structures have their own underdeck motor, corner lighting and shaft presentation. |
| Cultivation | 5 | 0 | 21 | Preserve all original route jumps, safe-station decks and quiet release walkway. No duplicate engines. Shaft landing, sewer/duct floors, reunion deck and rescue bridge remain structural. |
| Blackout | All | 0 | 0 | No facility booster integration or source changes. |

Current total: **39 additions**, plus **21 unchanged Room 5 placements**:
25 Containment and 35 Cultivation. The first screenshot follow-up added 11
engines; the starting-platform follow-up adds one more.

## Implementation and ownership

- Three instanced hardware meshes and one instanced exhaust mesh per attachment
  group share four geometries and four materials per level owner. Matrices are
  authored once; flame motion changes only the shared time uniform.
- Containment uses three static room batches and two moving batches. Moving
  batches are direct children of Fix 3's complete interpolated dressing. Their
  short mounting collars belong to `RoomFiveArt` and borrow existing resources.
  No second transform interpolation or dynamic instance-buffer upload occurs.
- Cultivation retains its existing encounter lifecycle owner. Its two original
  lights and single hover registration now serve Rooms 2, 3 and 5. Visual
  batches retain their room visibility; the shared pool is excluded from other
  rooms' lighting profiles. The existing global hover-voice limit remains one.
- Each owner selects the nearest two engines with the original 14 m selection
  range, 6 m light radius, colour, intensity, fade and non-shadowed lights.
  Selection uses a linear scan and reusable vectors, with no per-frame objects.
- Disposal releases each instanced buffer, shared geometry, material, light and
  audio registration once. Borrowed surface textures and mounting geometry stay
  with their existing owners. No new textures or dependencies.
- Authoritative platform transforms, collision meshes/metadata, movement,
  carrying, difficulty, checkpoints and level transitions are unchanged.

## Original rollout validation

- Full Node suite: **1,459 passed**. The first sandboxed pass could not create a
  production-validator symlink; the normal-permission rerun passed completely.
- Updated the exact Containment prewarm expectations to include the two new
  non-shadowed point slots. No limits or checks were weakened.
- Type-check, production build and 77-file nested production-layout validation
  passed. The build retains its existing large-chunk warning.
- New regression tests cover the explicit placement counts, full engine/exhaust
  collider clearance, sampled moving routes, 450 moving-platform steps with
  fractional render poses, duplicate attachment prevention, shared resource
  disposal, hidden-room lighting and original Room 5 instance transforms.
- Existing audio tests retain nearest-source positioning, visibility/disposal
  behaviour and the single hover-voice cap. Existing collision fingerprints and
  platform route/carry/reset tests pass.
- Production Chromium/SwiftShader inspection captures stationary and both moving
  platforms in Containment and representative Cultivation Rooms 3/5. It exercises
  real room recovery/preparation, then the supported rescue-film handoff into
  Blackout and confirms zero remaining facility booster batches. No console,
  asset-loading or WebGL errors were observed.
- A second browser check runs 390 real fixed updates with Bob riding, samples
  fractional render poses across both moving assemblies, and verifies zero
  attachment error, zero render writes to authoritative positions, continued
  support, animated exhaust and a clean checkpoint reset.

## Original rollout performance evidence

The reproducible browser check is `tests/smoke/PlatformBoosters.spec.ts`.
Baseline observations are generated as `test-results/boosters-before.json`;
the final paired measurements are in `test-results/boosters-after.json`.
Screenshots are in Playwright's output directory. Measurements use the minimum profile, a 640 x 360 CSS viewport and a
320 x 180 measured render buffer. They are software-renderer samples, not lab-GPU
FPS qualification. Camera-dependent room preparation can change residency, so
whole-level memory counters and cross-run frame times are not reliable comparisons.
The final check therefore warms and samples effects-disabled/enabled variants in
one browser task with the same camera and scene scope. Original Room 5 effects
stay enabled in both variants. Six GPU-finished draws follow two warm draws.

Representative matching views:

| View | Draws, new effects disabled | Draws, new effects enabled |
| --- | ---: | ---: |
| Containment Room 2 platform B | 155 | 159 |
| Containment Room 3 platform C | 366 | 370 |
| Containment Room 5 upper platform A | 403 | 416 |
| Containment Room 5 moving platform 1 | 299 | 312 |
| Containment Room 5 moving platform 2 | 312 | 330 |
| Cultivation Room 3 launch island | 678 | 682 |
| Cultivation Room 5 original jump | 440 | 440 |

Software frame samples remain noisy: Room 3 platform C averaged 4.82/4.85 ms,
Cultivation's launch island 9.37/13.33 ms, and even the unchanged Room 5 view
6.77/9.02 ms (disabled/enabled). One moving-platform sample decreased from
94.93 to 27.57 ms. These samples do not establish a steady FPS change; lab
hardware frame performance still needs manual qualification. Draw-call,
buffer-storage and light/audio limits are deterministic regression checks.

Containment adds four shared geometry buffers, two non-shadowed point sources,
one bounded hover registration and zero textures. Cultivation adds no booster
light or hover registrations. Its Room 3 batch costs at most four submissions
for all nine islands; Room 5 retains four submissions for all 21 engines.

Calculated booster vertex/index and instance-buffer storage changes from
**286,124 bytes** for the original 21 baked engines to **23,020 bytes** for all
30 Cultivation engines. Containment's 18 engines use approximately **19,948
bytes** of these buffers. These estimates exclude driver/program overhead and
the already-owned platform geometry/textures; they are not total VRAM usage.

## Placement follow-up implementation

- Containment's first Room 2 engine uses uniform scale 0.6 and a -0.35 m
  mounting offset; its existing socket moves down to meet the compact housing.
  Low Room 5 platform C uses scale 0.9 and offset -0.08 m. These are instance
  transforms on the same shared geometry/shader, with floor clearance tested.
- The button ledge's explicit platform finish now wins over the broad room
  finish override. Its existing standard-deck recipe is generated through the
  production scene instead of a separate palette workaround.
- Cultivation's baked presentation was regenerated so the standard button deck
  appears and the three traversal posts leave no stale visible surface proxies.
  Their authored collision positions/vertices/indices remain unchanged, as
  required. Containment's A/B posts were presentation-only and are removed.
- No Level 3 source, moving-platform logic, button mechanics, platform poses,
  collision metadata, checkpoint or traversal-route data changed.
- Containment retains five batches; Cultivation adds one Room 2 batch (four
  submissions maximum). Extra engines in existing batches add instances only.
  Four shared geometries/materials, two non-shadowed lights per owner, the
  bounded audio source and uniform-only flame animation remain intact.
  Including the starting-platform follow-up, instance-buffer growth is 1,792
  bytes in Containment and 1,280 in Cultivation.

## Previous placement follow-up validation

- Full Node suite: **1,460 passed**. This includes platform clearance, unchanged
  collision fingerprints, button interaction, route/carry/reset tests, hidden
  support collision arrays/poses and original Room 5 engine transforms.
- Targeted platform/preview/moving-presentation suite: **40 passed**.
- Type-check, production build and production-layout validation passed (77
  files). The existing large-chunk warning remains. Generated Cultivation assets
  reproduce exactly: 7,691,310 bytes, with 151 presentation repairs. The binary
  grows by 29,214 bytes for the corrected standard button deck and post cleanup.
- Production Chromium/SwiftShader checks cover all 11 added placements, both
  moving platforms and an unchanged original Cultivation Room 5 engine.
  Console, asset-loading and WebGL error checks pass. The real Level 3 handoff
  leaves zero facility-booster batches.
- Bob remains supported through the 390-fixed-step moving-platform browser
  ride; attachment error and render writes to authoritative positions are both
  zero. Exhaust animation and checkpoint reset pass.
- Paired disabled/enabled effects samples show four engine submissions for
  Cultivation Room 2's button deck and each inspected Room 3 view, with zero
  additional submissions in original Room 5. Containment remains within its
  existing 22-submission ceiling (including visible neighbouring/moving batches).
  No extra dynamic/shadow lights, audio registrations, textures or per-frame
  canvas/geometry work were introduced. Software frame timings are noisy and
  do not establish hardware FPS; inspect normal play on the target machine.

## Manual inspection (current placement)

1. Run `npm run dev`, start Containment, then use development shortcuts **2**,
   **3** and **5**. Inspect the eligible slabs from above, beside and below.
   Room 2's first slab, sticky-wall ledge and exit balcony now have engines.
   Room 3's entry platform and A/B slabs float without their old posts.
   Room 5's low platform C has a compact engine.
2. Ride both Room 5 platforms through complete reversals. The mounting collar,
   engine and flame origin should remain fixed to the deck. The flame itself
   should flicker downward. Walk/jump on and off; compare normal and throttled
   browser performance, then pause/resume, recover and restart.
3. Enter Cultivation through normal progression (or the existing development
   level-completion shortcut), then inspect Room 2's button ledge. Its deck
   should match the traversal slabs, with an engine below and the button still
   working normally. In Room 3 inspect Bob's entry and first/west/final wall
   exit decks: all have engines and the three tall visible posts are gone.
4. Inspect Cultivation Room 5's original route and safe-station engines; their
   silhouette, core, flicker and warm spill should match the existing design.
   Move between nearby engines: hover sound should follow without stacking.
5. Revisit the cargo lifts and Room 1. Their structures and lighting should
   remain unchanged. Retry checkpoints and transition to Blackout; no facility
   thrusters should appear in Blackout.

Run `npx playwright test tests/smoke/PlatformBoosters.spec.ts --config
playwright.smoke.config.ts` after `npm run build` to repeat the browser check.

## Previous placement follow-up changed files

- `src/render/environment/PlatformBoosters.ts` — optional compact instance transforms.
- `src/render/environment/containment/ContainmentPlatformBoosters.ts` — six additional Containment placements.
- `src/render/environment/containment/RoomTwoArt.ts` — connect the compact lowest engine's mounting socket.
- `src/render/environment/containment/RoomThreeArt.ts` — remove A/B's standing presentation supports.
- `src/render/environment/cultivation/CultivationBoosterPlatforms.ts` — five additional placements and explicit traversal-post IDs.
- `src/render/environment/cultivation/CultivationLabMaterials.ts` — standard button deck styling and hidden traversal-post skins.
- `src/levels/CultivationLevelRuntime.ts` — button engine integration and Room 2 shared-effect updates.
- `scripts/generate-cultivation-assets.ts` — remove the obsolete duplicate button-deck recipe.
- `src/assets/cultivation/authored-assets.bin` — regenerated presentation bundle.
- `tests/PlatformBoosters.test.ts` — placement, clearance, preserved collision/pose, resource and movement checks.
- `tests/smoke/PlatformBoosters.spec.ts` — expanded production room captures and rendering-budget evidence.
- `tests/smoke/ProductionParity.spec.ts` — exact regenerated repair count.
- `docs/polish-batch-2-platform-boosters.md` — current inventory, evidence and manual steps.

## Room 3 starting-platform follow-up

The entry platform now uses the existing suspended dressing, which removes its
decorative column, base socket and upper collar as one assembly. A standard,
full-size thruster attaches to the unchanged walking-surface centre through the
existing Room 3 batch. Its underside socket matches the neighbouring slabs.
The authored platform remains at [0, 10.65, 51.29795], with the same 8 x 0.5 x 5 m
collision box, gameplay metadata and Room 2 walking seam.

Containment now has 25 engines in the same five batches. This adds four instance
matrices (256 bytes), with no new draw batch, geometry, material, texture, light,
shadow caster or audio source. Cultivation, Level 3 and other structures stay
unchanged.

The updated regression checks verify one entry engine, no column/base/collar
remnants (including static batch sources), full engine/exhaust clearance,
unchanged collision snapshots and the gap-free grounded room transition.
The focused production browser check captures two underside views and runs 60
real fixed steps with Bob standing on the entry deck, checking unchanged deck
position, continued support, five batches and no console/asset/WebGL errors.
Validation passed: 23 targeted Node tests, type-check, production build,
77-file production-layout validation and the focused Chromium/SwiftShader
browser check. Both captured underside views were visually inspected.

Files changed for this adjustment:

- `src/render/environment/containment/RoomThreeArt.ts`
- `src/render/environment/containment/ContainmentPlatformBoosters.ts`
- `tests/ContainmentArt.test.ts`
- `tests/PlatformBoosters.test.ts`
- `tests/smoke/PlatformBoosters.spec.ts`
- `docs/polish-batch-2-platform-boosters.md`

## Room 3 entry spill-light follow-up

The engine's flame and hot rings use unlit materials; the wall illumination
came from its pooled, unshadowed omnidirectional point light. The default 6 m
cutoff extended through the deck and across the entry-wall panels. Platform
geometry cannot shield a non-shadowed point light.

`BoosterPlatform.spillRangeMetres` now lets enclosed placements bound their spill
without changing the shared light budget or other engines. Only the Containment
Room 3 entry opts into 1.4 m. Its light remains at the original nozzle-relative
position, with the same colour, intensity, flicker, fade and decay. This cutoff
ends below the walking-surface plane and before the closest entry-wall face,
while retaining warm illumination on the underside. The flame, housing,
platform, collision and gameplay are unchanged.

The range follows the slot's currently assigned engine through fade-out and
reassignment; open platforms retain the original 6 m cutoff. No new lights,
shadows, shaders, materials, draw batches, textures or audio sources are added.
The per-frame path still uses the existing bounded pool without allocations.

Regression coverage includes the entry's geometric light bounds, its powered
underside, the neighbouring platform's default range, and restoration of a
reused light slot's original range. The focused browser check compares the old
6 m spill, the localized spill and the entry lamp switched off at the same wall
patch; it also captures two underside views and a neighbouring engine.

Changed files: `PlatformBoosters.ts`, `ContainmentPlatformBoosters.ts`,
`tests/PlatformBoosters.test.ts`, `tests/smoke/PlatformBoosters.spec.ts`, and this
guide. To inspect locally, run `npm run dev`, enter Containment Room 3 with the
development **3** shortcut, compare the entry wall/door above the deck with its
underside, then inspect platform A's existing warm glow and cross the room seam.

Validation passed: 12 targeted Node tests, type-check, production build,
77-file production-layout validation and the focused Chromium/SwiftShader check.
The wall patch's mean red channel was 77.08 with the old range and 44.4 with the
localized range, exactly matching the entry lamp switched off (44.4). Two
underside views and the neighbouring engine were visually inspected. Bob stayed
supported, platform position stayed unchanged, five batches/two non-shadowed
lights remained, and no console, asset-loading or WebGL errors were observed.

## Remaining doorway leakage: source isolation and permanent correction

The earlier 1.4 m validation was incomplete: it sampled the Room 3-facing wall
and attributed the opposite-side glow to the wrong engine. The user's new view
looks from Room 2 toward the doorway. Before changing production code, browser
captures disabled each pooled contribution independently with the same camera,
exposure and game state. Disabling the entry engine left the orange patch;
disabling **Room 2's exit-balcony engine** removed it.

At the doorway observer [.6, 11.36001, 49.8], the original pool assigned:

| Source | World light position | Range |
| --- | --- | --- |
| Room 3 entry | [0, 9.43, 51.29795] | 1.4 m |
| Room 2 exit balcony | [0, 9.43, 46.79795] | 6 m |

The pool was behaving as authored. The exit balcony's unshadowed point light
crossed its deck and lit the Room 2 wall/doorpost. Changing only the entry
engine's range could not eliminate that contribution. Flame/hot-ring materials
are unlit and do not illuminate surrounding objects.

Only the exit balcony now opts into `surfaceGlowY`: it is excluded from point
light selection while its engine, flame, hot rings and positional audio remain.
A down-facing, depth-tested radial glow sits .015 m below its rendered deck-seat
underside, following the same attachment transform. It reuses the animated
exhaust material and one lazy, shared, texture-free disk geometry. The shader
cannot move its flat Y=0 vertices through the receiver, and it is invisible from
above. The Room 3 entry retains its previous 1.4 m light; every other engine
retains its previous light settings. No platform/collision/interpolation,
checkpoint, transition or Level 3 data changed.

Trade-off: the exit balcony's warmth is a cosmetic surface glow rather than
general illumination of actors/floors. It costs one extra instanced submission
(24 triangles), one shared disk buffer and one instance matrix, with no new
material, texture, shader, shadow map, light or audio source. The same two-light
selection scan remains allocation-free. Other attachment batches stay at four
engine submissions; the Containment browser ceiling changes from 22 to 23 to
account explicitly for the one local overlay.

`tests/PlatformBoosters.test.ts` now exercises the actual offending balcony at
three observer locations, verifies it never receives a powered point-light
slot, checks glow material reuse/downward orientation and resource disposal,
and retains collision, route and neighbouring-light checks.

The production browser regression reconstructs the screenshot-side view and
also inspects the doorway from Room 3. It replays the actual two-source state
from `2c7c96b`, switches off each source individually, then captures the permanent
fix and the fixed scene with pooled contributions disabled. Its comparison mask
covers the visible wall panels and doorway posts across each view, rather than
a small sampled patch. All paired captures lock camera, exposure and clock.
Underside and neighbouring-engine captures check retained visual quality.

Files changed: `src/render/environment/PlatformBoosters.ts`,
`src/render/environment/containment/ContainmentPlatformBoosters.ts`,
`tests/PlatformBoosters.test.ts`, `tests/smoke/PlatformBoosters.spec.ts`, and this
guide. Run `npm run dev`, enter Containment with **3**, walk across the entry
seam into Room 2, and face back toward the doorway/black wall band and both
posts. Inspect both deck undersides and nearby platform A afterward.

Final validation: **27 targeted Node tests passed**, including the actual
offender-selection regression, collision snapshot and grounded room seam.
Type-check, production build and 77-file production-layout validation passed.
The existing entry/neighbor browser check and full-wall isolation checks passed;
the final test also includes a closer reconstruction of the screenshot view.
There were no console, asset-loading or WebGL errors. The engine undersides,
deck-attached glow and unchanged neighbouring engine were visually inspected.

| Final view | Wall/post pixels compared | Pixels changed by old exit light (>2/255) | Pixels changed by remaining pooled lights after fix |
| --- | ---: | ---: | ---: |
| Room 2 doorway | 115,693 | 30,795 | 0 |
| Screenshot-side close-up | 71,981 | 13,346 | 0 |
| Room 3 doorway | 124,615 | 310 | 0 |

The final maximum channel difference with pooled lights disabled was exactly
zero in all three wall masks. Cameras are reconstructed from the screenshot,
not recovered original transforms; each before/after pair uses exactly the same
transform, exposure and clock. A separate pre-correction production capture was
saved before modifying the lighting implementation. Evidence is under
`test-results/entry-leak-before/` (actual baseline), `entry-leak-diagnosis/`
(individual sources), and `entry-leak-closeup/` (paired replay, final appearance,
undersides, neighbour, source positions and full-wall metrics).

The live renderer measured exactly **one extra glow draw**, with **1,352 bytes**
of additional vertex/index/instance buffers (driver overhead excluded). Two
non-shadowed light slots remain; all 25 Containment engines and five attachment
batches remain. No hardware FPS qualification is inferred from SwiftShader.
