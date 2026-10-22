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
| Containment | 3 | 7 | 0 | Platforms A/B, wall-exit ledge and C/D/E/F. Remove A/B's decorative column/base/collar assemblies; preserve the large entry deck's support. |
| Containment | 4 | 0 | 0 | Cargo lift, receiving/exit deck and duct; preserve the lift's own machinery and lighting. |
| Containment | 5 | 9 | 0 | Low platform C, central rest, three upper A platforms, final approach, final bounce and both moving platforms. Compact platform C's engine for floor clearance. Structural containment/observation/vent surfaces stay unchanged. |
| Cultivation | 1 | 0 | 0 | Three rope-suspended drop platforms deliberately land on the floor. Engines would conflict with their rope/drop presentation and intersect the floor after landing. |
| Cultivation | 2 | 1 | 0 | Button ledge uses standard traversal deck art and an engine. Three tethered drop blocks retain their brace/rope mechanics; vents stay unchanged. |
| Cultivation | 3 | 13 | 0 | Entry, launch island, cross-beam, first wall exit, offset island, west runup, west wall exit, west return island, cross-room A/B, final wall exit, last island and drop launch. Hide only first/west/final traversal-post skins; preserve their collision boxes and all permanent structures. |
| Cultivation | 4 | 0 | 0 | Existing lift/boarding structures have their own underdeck motor, corner lighting and shaft presentation. |
| Cultivation | 5 | 0 | 21 | Preserve all original route jumps, safe-station decks and quiet release walkway. No duplicate engines. Shaft landing, sewer/duct floors, reunion deck and rescue bridge remain structural. |
| Blackout | All | 0 | 0 | No facility booster integration or source changes. |

Current total: **38 additions**, plus **21 unchanged Room 5 placements**:
24 Containment and 35 Cultivation. The screenshot follow-up adds 11 engines.

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
  Instance-buffer growth is 1,536 bytes in Containment and 1,280 in Cultivation.

## Placement follow-up validation

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
   Room 3's A/B slabs float without their old posts; its large entrance deck
   retains its support. Room 5's low platform C has a compact engine.
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

## Follow-up changed files

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
