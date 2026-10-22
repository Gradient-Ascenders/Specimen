# Fix 4: facility platform boosters

The original Cultivation Room 5 engine, nozzle, rings, orange outer exhaust,
bright inner core, shader animation and spill-light parameters now live in
`src/render/environment/PlatformBoosters.ts`. Its original Room 5 selection stays
in `CultivationPlatformBoosters.ts`.

## Room inventory

| Level | Room | New engines | Retained engines | Selection / exclusions |
| --- | --- | ---: | ---: | --- |
| Containment | 1 | 0 | 0 | Floors, specimen pedestal and vent structures; no matching floating traversal slabs. |
| Containment | 2 | 5 | 0 | Platforms B/C/D and upper steps A/B. Exclude low platform A (full exhaust reaches the floor), the wall-mounted catch ledge and the structural exit balcony. |
| Containment | 3 | 5 | 0 | Wall-exit ledge and platforms C/D/E/F. Exclude the entry platform and platforms A/B, which already have basin-supported actuator columns. |
| Containment | 4 | 0 | 0 | Cargo lift, receiving/exit deck and duct; preserve the lift's own machinery and lighting. |
| Containment | 5 | 8 | 0 | Central rest, three upper A platforms, final approach, final bounce and both moving platforms. Exclude low platform C (insufficient full-flame clearance above the floor) and the structural containment/observation/vent surfaces. |
| Cultivation | 1 | 0 | 0 | Three rope-suspended drop platforms deliberately land on the floor. Engines would conflict with their rope/drop presentation and intersect the floor after landing. |
| Cultivation | 2 | 0 | 0 | Three tethered drop blocks retain their existing brace/rope mechanics and presentation. Button ledge and vents are wall-mounted structures. |
| Cultivation | 3 | 9 | 0 | Launch island, cross-beam, offset island, west runup, west return island, cross-room A/B, last island and drop launch. Exclude the entrance service deck, first/west/final wall exits with centre support columns, sticky-wall landings, cover and ground routes. |
| Cultivation | 4 | 0 | 0 | Existing lift/boarding structures have their own underdeck motor, corner lighting and shaft presentation. |
| Cultivation | 5 | 0 | 21 | Preserve all original route jumps, safe-station decks and quiet release walkway. No duplicate engines. Shaft landing, sewer/duct floors, reunion deck and rescue bridge remain structural. |
| Blackout | All | 0 | 0 | No facility booster integration or source changes. |

Total: **27 additions**, plus **21 unchanged Room 5 placements**.

## Implementation and ownership

- Three instanced hardware meshes and one instanced exhaust mesh per attachment
  group share four geometries and four materials per level owner. Matrices are
  authored once; flame motion changes only the shared time uniform.
- Containment uses three static room batches and two moving batches. Moving
  batches are direct children of Fix 3's complete interpolated dressing. Their
  short mounting collars belong to `RoomFiveArt` and borrow existing resources.
  No second transform interpolation or dynamic instance-buffer upload occurs.
- Cultivation retains its existing encounter lifecycle owner. Its two original
  lights and single hover registration now serve both Rooms 3 and 5. Visual
  batches retain their room visibility; the shared pool is excluded from other
  rooms' lighting profiles. The existing global hover-voice limit remains one.
- Each owner selects the nearest two engines with the original 14 m selection
  range, 6 m light radius, colour, intensity, fade and non-shadowed lights.
  Selection uses a linear scan and reusable vectors, with no per-frame objects.
- Disposal releases each instanced buffer, shared geometry, material, light and
  audio registration once. Borrowed surface textures and mounting geometry stay
  with their existing owners. No new assets, textures or dependencies.
- Authoritative platform transforms, collision meshes/metadata, movement,
  carrying, difficulty, checkpoints and level transitions are unchanged.

## Validation

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

## Performance evidence

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

## Manual inspection

1. Run `npm run dev`, start Containment, then use development shortcuts **2**,
   **3** and **5**. Inspect the eligible slabs from above, beside and below.
   The low first slab in Room 2 and low platform C in Room 5 intentionally have
   no engine. Supported platforms should retain their columns.
2. Ride both Room 5 platforms through complete reversals. The mounting collar,
   engine and flame origin should remain fixed to the deck. The flame itself
   should flicker downward. Walk/jump on and off; compare normal and throttled
   browser performance, then pause/resume, recover and restart.
3. Enter Cultivation through normal progression (or the existing development
   level-completion shortcut), then inspect Room 3's isolated upper islands.
   The three column-supported wall exits intentionally have no booster.
4. Inspect Cultivation Room 5's original route and safe-station engines; their
   silhouette, core, flicker and warm spill should match the existing design.
   Move between nearby engines: hover sound should follow without stacking.
5. Revisit the cargo lifts and Rooms 1/2. Their structures and lighting should
   remain unchanged. Retry checkpoints and transition to Blackout; no facility
   thrusters should appear in Blackout.

Run `npx playwright test tests/smoke/PlatformBoosters.spec.ts --config
playwright.smoke.config.ts` after `npm run build` to repeat the browser check.

## Changed files

- `src/render/environment/PlatformBoosters.ts` — shared hardware, shader, batching, light/audio pool and disposal.
- `src/render/environment/containment/ContainmentPlatformBoosters.ts` — explicit Containment placements and moving attachment parents.
- `src/render/environment/cultivation/CultivationBoosterPlatforms.ts` — audited Cultivation Room 3 placements.
- `src/render/environment/cultivation/CultivationPlatformBoosters.ts` — preserved original Room 5 selection using the shared component.
- `src/render/environment/containment/RoomFiveArt.ts` — borrowed moving-deck mounting collars.
- `src/levels/ContainmentLevelScene.ts` — Containment resource ownership, reset and recovery.
- `src/levels/GreyboxLevelRuntime.ts` — render-pose update beside the existing platform interpolation.
- `src/levels/CultivationLevelRuntime.ts` — Room 3 integration, shared scope and visibility/update scheduling.
- `src/hazards/RoomFiveDroneEncounter.ts` — retain the existing lifecycle owner with a shared presentation scope.
- `tests/PlatformBoosters.test.ts` — placement, clearance, motion, duplicates and resource regression tests.
- `tests/ContainmentLightLayout.test.ts` — exact prewarmed point-light signatures.
- `tests/smoke/PlatformBoosters.spec.ts` — production visual, paired rendering-cost, live motion/reset and level-transition checks.
- `docs/polish-batch-2-platform-boosters.md` — this inventory, validation record and manual testing guide.
