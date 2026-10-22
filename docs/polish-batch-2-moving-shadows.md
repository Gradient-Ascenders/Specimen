# PR #233: interpolated Room 5 platform shadows

## Confirmed cause

`RoomFiveArt.presentMovingPlatforms()` offsets each complete dressing below its
fixed-step platform root. The tread, graphite underbody, booster mount and
instanced socket housings cast shadows from that presented assembly. The
lighting rig watched the physics root instead, so additional renders between
simulation ticks could move those casters without dirtying either intersecting
Room 5 map. Both platforms reproduced the problem at alpha 0.2, 0.5 and 0.8.

Before the correction, the first sample invalidated the safe-entry and
upper-traversal maps, while the next two samples requested zero updates despite
continued caster movement. Production captures at the existing Low preset
confirmed a 494-pixel mismatch (maximum 9/255 channel difference) against freshly
rendered depth for the first platform. The second platform also missed both map
updates; this particular view quantized its smaller displacement to at most
1/255 at 512-pixel shadow resolution. Neither physics root moved between samples.

## Correction

- Expose the already-owned dressing array as readonly and register those two
  objects in the existing moving-owner tracker in place of the physics roots.
  Each assembly is tracked once, even when simulation and presentation both
  change in a frame.
- Compare their world matrices after presentation. The existing runtime already
  presents at the start of its render path and prepares shadows immediately
  before drawing, so no runtime ordering change is needed.
- Retain old and new centres in reusable per-owner vectors. Invalidate only
  finite light/frustum coverage intersecting either footprint, using the
  existing conservative 4 m platform radius. No temporary changed-owner array,
  records or vector clones are needed on moving frames.
- Include visibility inherited from parents. Hiding clears the old silhouette;
  showing refreshes the new one. Already-hidden movement and identical poses
  need no updates. This checks the bounded ancestor chain, not the descendants.
- Preserve participant-driven updates, dissolve handling, source placement,
  shadow resolutions, batching, thrusters, render targets and reset policy.
  No authoritative transform, collision, movement or carrying code changes.

## Reproduction and inspection

After building:

```text
npx playwright test tests/smoke/RoomFiveInterpolatedShadows.spec.ts tests/smoke/RoomFiveMovingPlatforms.spec.ts --config playwright.smoke.config.ts
```

The isolated image regression deliberately uses no dynamic body participants so
that character-driven updates cannot mask a stale platform map. It compares
each sample against a forced fresh render at the exact same pose and clock,
then repeats the unchanged pose to check cache reuse. It also checks reversals,
reset, checkpoint-pose restoration, parent hide/show and an unrelated Room 2
cache. The ride regression uses the normal runtime participant path at controlled
30/60/144 FPS schedules, including frames without simulation ticks, and checks
the decks, shadows, Bob, attached thrusters, pause, recovery, restart and reload.
Its ride segment disables intended laser damage to isolate carrying through
repeated reversals; it is not a full puzzle playthrough.

The Node regression fails on the previous implementation at alpha 0.5 for each
platform. Its separate coverage test moves only a test presentation object
between distinct light zones, proving both old and new footprints are cleared
without changing unrelated cached maps. Forward/reverse movement, reset,
restoration, parent visibility, hidden movement and repeated poses are covered.

For local play, run `npm run dev`, start Level 1, and use development shortcut
**5**. Observe both platforms and the floor shadows from beside/above the route.
Ride through both reversals, step off, recover the checkpoint, and restart.
Compare a high-refresh display with the 30/60 FPS settings. The controlled
software-browser schedules do not establish a hardware FPS guarantee.

## Validation and measured cost

- Full Node suite: **1,474 passed**, zero failures. Targeted shadow/platform/
  carry/lighting/booster suite: **75 passed**. The focused shadow suite also
  passes after adding hidden-movement coverage.
- Type-check, production build, 77-file production-layout validation and all
  generated-asset checks passed. Only the existing chunk-size warning remains.
- Production image regression: both platforms match fresh maps exactly
  (**zero differing colour channels**) at all three interpolation samples and
  all five transition states. Physics-root displacement from rendering is zero.
- The safe-entry and upper-traversal maps each refresh on a changed presented
  pose. No other source is dirtied by that movement. Repeating the exact pose
  requests **zero** updates, as does the stationary Room 2 check.
- There are still **21 authored shadow sources** and **21 resident authored
  map targets** in these captures. Map texture identities, dimensions, shadow
  flags and auxiliary-target identities are stable throughout the final checks.
  The Low preset remains capped at **512 × 512**; no production quality setting
  changes. No new source, shadow map, shader or gameplay geometry is introduced.
- Both production browser regressions passed (**2 tests**, 12.7 minutes under
  SwiftShader). At 30/60/144 FPS schedules, both routes reversed twice, Bob
  remained supported, authoritative render writes and thruster attachment error
  were zero, and maximum rider slip was 1.44e-14 m. The 144 FPS schedule included
  **605 render frames without a physics tick**; presentation error was at most
  4.45e-16 m and no stale relevant map was observed. Pause, step-off/relanding,
  checkpoint recovery, restart and full runtime reload passed.
- Representative rider/receiver captures from both platforms were inspected.
  No console, asset-loading or WebGL errors were recorded. The software test's
  duration is not a 144 Hz hardware performance qualification.

Matched camera/pose measurements (Low preset, 480 × 270 drawing buffer):

| View | Old between-tick draws / shadow updates | Corrected draws / shadow updates | Repeated unchanged-pose draws / updates |
| --- | ---: | ---: | ---: |
| Platform 1 | 634 / 0 | 865 / 2 | 634 / 0 |
| Platform 2 | 605 / 0 | 836 / 2 | 605 / 0 |

The extra **231 draw submissions** are the two existing depth passes, not added
platform colour draws. Initial frames that already refreshed these maps had the
same 865/836 draw counts before the correction. The trade-off is refreshing
unoccupied-platform shadows between physics ticks instead of reusing stale
depth. Participant-driven maps that were already updating still use the same
passes, and unrelated static maps stay cached.

After initial warm-up, corrected software frame samples ranged from **23.0 to
50.2 ms**, compared with **7.2 to 8.6 ms** when immediately reusing the exact same
pose's maps. These are sparse, GPU-finished SwiftShader measurements, not an
average gameplay frame rate. They time rendering plus `gl.finish()`, excluding
shadow preparation and the rest of the game loop. Timing varied between runs and with other local
validation work; no hardware FPS improvement or regression is established.

The actual old-build baseline is under `test-results/platform-shadows-baseline/`.
Final images, fresh-map references, transition captures and measurements are
under `test-results/platform-shadows-after/`. These ignored outputs can be
recreated with the command above; no generated game assets changed.
