# Issue #29 verification

Issue #29 adds text-first Bob/Goop roster readability, switch feedback,
pressure-plate persistence feedback, and restrained inactive-body locators to
the existing two-body teaching runtime.

## Automated verification

- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node --test --experimental-strip-types tests/*.test.ts`: passed, 82/82.
- `node node_modules/typescript/bin/tsc` followed by
  `node node_modules/vite/bin/vite.js build`: passed; Vite transformed 45
  modules. The existing bundle-size advisory remains.
- Focused tests cover successful player-switch feedback, recovery/restart
  clearing without synthetic feedback, hidden empty/active-only passive
  status, inactive pressure-plate status, locator identity and occlusion,
  active-body suppression, one reusable occlusion query per update, near/far
  scale clamps, stable sprite count, and texture/material disposal.
- The existing `SlimeManager` and persistent two-body regressions remain the
  runtime authority for unlock, registration, switching, pressure occupancy,
  recovery, and disposal invariants.

## Presentation decisions

- The HUD says `ACTIVE — CONTROLLED`, `INACTIVE — AVAILABLE`, or
  `LOCKED — UNAVAILABLE`; it does not require colour discrimination.
- `Tab — SWITCH` appears only for an unlocked, registered inactive body.
- The active body uses a solid border and square badge; an available inactive
  body uses a dashed border and round badge.
- Volt remains a locked configuration-only identity and is not rendered as a
  playable HUD entry.
- Switch feedback is emitted only at the successful player-triggered switch
  boundary. Roster updates from recovery and restart carry no switch feedback.
- Passive status is hidden when there is no inactive-body interaction. Its
  pressure-plate text is read from the existing trigger occupant set.
- Through-wall markers are lettered Bob/Goop sprites with depth testing off;
  they query only the camera-obstruction layer, fade/scale with distance, and
  are removed with the level presentation.

## Visual evidence (2026-08-21)

- [Bob active, Goop inactive, and inactive pressure-plate status](issue-29-bob-active.png)
- [Successful Bob to Goop switch and Bob through-wall locator](issue-29-successful-switch.png)
- [Restart restored Bob with no stale switch feedback](issue-29-restart-cleared.png)

At 1280 × 720, the roster showed explicit active/inactive labels and the
two switch directions showed `Switched to Goop. Bob is inactive.` and
`Switched to Bob. Goop is inactive.`. The passive message hid while its plate
holder was active and returned when that holder became inactive. At 768 ×
1024, the roster remained legible with two entries and no horizontal overflow.

## Runtime and resource sanity

- Fifteen restart cycles left one slime-roster region and exactly two entries;
  switch feedback was empty after restart.
- The existing F2 diagnostic reported the two-body regression as `PASS`,
  including retained inactive plate occupancy and recovery active-owner state.
- After the first warm-up sample, 10 more restarts held at 13 draw calls, 2,380
  triangles, 23 GPU geometries, and 2 textures. The sampled frame rate remained
  approximately 101 FPS (9.90 ms).
- The locator owns two sprites and allocates its hit/vector query objects once.
  Only the inactive marker runs one `sweepSphere` query per update; repeated
  updates do not add sprites, and disposal releases both marker materials and
  textures.
- A clean reload left one HUD region, two roster entries, no switch feedback,
  and no browser console errors or warnings.
