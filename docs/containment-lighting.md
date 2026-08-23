# Containment lighting and environmental effects

Issue #33 replaces the renderer's old inspection pair with a Level 1-owned
lighting rig. `ContainmentLevelScene` owns one `ContainmentLightingRig` beneath
its scene root and disposes it before the room art/resources it references.

```text
ContainmentLevelScene
├─ Rooms 1–5 gameplay and art
└─ containment-authored-lighting-and-effects
   ├─ cold clinical hemisphere foundation
   ├─ one gated lighting group per room
   ├─ Room 1 impact point pool (12 points)
   └─ Room 5 release-vapour point pool (18 points)
```

Only the active room group is visible. This keeps the normal authored set to
three to seven local lights plus the hemisphere foundation; Room 4 also has the
two existing elevator-roof warning lights. Every real light in this pass has
`castShadow = false`. Issue #42 owns enabling renderer shadow maps, selecting
the final shadow lights and tuning map/depth parameters.

## Authored lights

Three.js point/spot intensities below are authored source values at renderer
exposure `1.0`; point/spot decay remains the physically-correct default `2`.

| Name | Position | Colour | Intensity / range | Source and purpose |
| --- | --- | --- | --- | --- |
| `containment-cold-clinical-foundation` | global | `#cfe4f4` / ground `#19211f` | `0.78` | Low, non-local fill that prevents crushed traversal surfaces. |
| `room-1-fluorescent-a-received-light` | `(-3.8, 7.45, -1.5)` | `#d9efff` | `58 / 13 m` | Existing west fluorescent diffuser. |
| `room-1-fluorescent-b-received-light` | `(3.8, 7.45, -1.5)` | `#d9efff` | `58 / 13 m` | Existing east fluorescent diffuser. |
| `room-1-pedestal-soft-key` | `(0, 6.4, -0.5)` | `#d9efff` | `62 / 10 m` | Soft egg/pedestal key; raised only by hatch presentation states. |
| `room-1-egg-glass-catchlight` | `(0, 2.7, 0.95)` | `#9bd7ff` | `18 / 5.5 m` | Egg rim and containment-glass catchlight. |
| `room-1-to-2-duct-entrance-spill` | `(-4.8, 6.45, 9.2)` | `#b9d9e7` | `9 / 8 m` | Room 1 spill carried into the tight first run. |
| `room-1-to-2-duct-ramp-reflected-light` | `(-4.8, 7.0, 14.5)` | `#86aabd` | `6 / 11 m` | Restrained reflected bridge at the first bend and rising run. |
| `room-1-to-2-duct-reflected-cue` | `(-6.6, 11.8, 25.6)` | `#86aabd` | `24 / 11 m` | Dim exit fixture/reflected cue in the final duct turn. |
| `room-2-drop-zone-light` | `(-8, 16.55, 35)` | `#d9efff` | `280 / 25 m` | Drop, landing and first lower route. |
| `room-2-lower-route-light` | `(0, 16.55, 39)` | `#c9e9f5` | `260 / 25 m` | Lower platform sequence. |
| `room-2-sticky-and-exit-route-light` | `(8, 16.55, 43)` | `#c3e4ee` | `280 / 25 m` | Sticky catch, upper route and Room 3 exit. |
| `room-3-clinical-entry-received-light` | `(-6.5, 30, 54)` | `#d9efff` | `250 / 30 m` | Safe entry read. |
| `room-3-industrial-route-received-light` | `(8, 29, 64)` | `#b2cad5` | `210 / 28 m` | Cooler central route contrast. |
| `room-3-acid-reflected-light` | `(0, 7.2, 64)` | `#87d62e` | `75 / 18 m` | Acid-surface reflected response; laser emitters remain red emissive sources. |
| `room-3-high-exit-vent-cue` | `(9, 32.5, 74.3)` | `#b6e4dd` | `95 / 16 m` | Final sticky strip and exit vent. |
| `room-4-lower-amber-received-light` | `(9, 33, 85.5)` | amber | state-driven / `16 m` | Starting elevator zone. |
| `room-4-middle-escalation-received-light` | `(9, 53, 85.5)` | red-orange | state-driven / `19 m` | Shaft escalation and laser route. |
| `room-4-upper-arrival-received-light` | `(9, 74, 88.5)` | cool/green | state-driven / `17 m` | Top platform and arrival portal. |
| `room-5-safe-entry-received-light` | `(9, 100, 96)` | `#d9efff` | `320 / 32 m` | Safe entry and lower route. |
| `room-5-upper-traversal-received-light` | `(10, 100, 116)` | `#badbe8` | `240 / 28 m` | Moving platforms, east ascent and final transfers. |
| `room-5-observation-lever-key` | `(-10, 103.5, 128)` | `#d7efff` | `78 / 14 m` | Focused observation console/lever key. |
| `room-5-containment-state-light` | `(0, 79.8, 110)` | green/red/orange | state-driven / `14 m` | Containment glass, locks and environmental response. |
| `room-5-goop-reveal-rim-light` | `(0, 82.5, 106)` | `#7eff43` | state-driven / `15 m` | Goop reveal key/rim; off during normal containment. |

Rooms 1–3 and Room 5 reuse the visible fluorescent fixtures authored by issue
#32. Room 3 acid and laser emitters are their own believable environmental
sources. Room 4 adds seven low-cost emissive wall fixtures split across lower,
middle and upper shaft zones while using only three received-light sources.
Room 5 adds one status lens to each panel pivot, so the lock cues follow the
four panels when #38 animates them.

## State mappings

### Elevator

`ContainmentLightingRig.update()` reads `ElevatorSequence.state`,
`stateElapsedSeconds` and `ascentProgress`. It owns no elevator clock.

| Elevator state | Lighting |
| --- | --- |
| `waitingForRider` | Dim amber start, subdued middle, cool upper cue. |
| `warning` | Amber lower warning pulse using authoritative state elapsed time. |
| `ascending` | Lower light recedes, red/orange middle peaks, upper zone grows with ascent progress. |
| `arrivalPause` | Strong green upper arrival/beacon response. |
| `exitReady` | Stable, lower-intensity green exit state. |

### Goop release

Without a cutscene override, the presentation maps the existing Room 5 ending
state and normalized phase progress:

```text
traversal            -> normal
leverPull            -> warning
containmentFailure   -> locks-disengaging (0–25%)
                     -> opening (25–78%)
                     -> reveal (78–100%)
released             -> released
```

The `opening` transition starts one reusable 18-point vapour burst. `released`
is stable: alarm pulsing stops, temporary particles are hidden, locks are green
and the chamber/reveal lights hold fixed values.

## Issue #38 integration API

`ContainmentLevelScene.cutsceneLighting` exposes only:

```ts
setBobHatchLightingState(
  'gameplay' | 'establishing' | 'emergence' | 'impact' | 'complete',
): void;
finalizeBobHatch('completed' | 'skipped'): void;

setGoopReleaseLightingState(
  'normal' | 'warning' | 'locks-disengaging' | 'opening' | 'reveal' | 'released',
): void;
finalizeGoopRelease('completed' | 'skipped'): void;
```

The Bob states tune the existing pedestal key and glass rim. `impact` starts one
reusable 12-point pale glass sparkle burst. Both Bob finalisation modes select
`complete`, which has the same light values as normal gameplay and clears the
burst.

Calling a Goop state opts presentation into cutscene-driven phases, but does
not alter the lever, ending state, panel transforms, unlock state or timing.
Both finalisation modes apply the exact `released` state and clear the release
particles. #38 remains responsible for gameplay final state, panel/character
animation, cameras, control lock, sequencing and skip input.

## Reset, recovery and disposal

- Whole-level restart calls `ContainmentLightingRig.reset()`: Room 1 becomes
  active, Bob returns to gameplay lighting, Room 5 returns to automatic normal
  state, manual cutscene override is cleared and both point pools are hidden.
- Checkpoint retry/recovery calls `reconcileAuthoritativeState(true)` after the
  checkpoint group reset. Elevator/release light values are re-read and all
  transient particles disappear immediately.
- Repeating the same state is idempotent and cannot add another effect object.
- No `setTimeout`, event listener or callback is created by the rig.
- Unload removes panel-mounted status fixtures, disposes the two point
  geometries/materials and every rig-owned material/geometry, then clears the
  lighting root.

## Shadow and performance intent

The pass records selected future shadow intent on pedestal/containment,
elevator and Room 5 containment equipment, plus major floor/platform receivers.
Transparent panes, debris and particles are excluded. Renderer shadow maps and
all light shadows remain disabled for #42.

All room rigs stay resident, but only one local room group is visible. No light
or material is created per frame. Pulses update existing scalar/material state,
and both effects use fixed dynamic position buffers. The diagnostics panel
reports authored active/total/shadow lights, presentation states and live point
count.

### First-entry shader prewarm

Three.js `0.185.1` excludes invisible subtrees while collecting lights, and its
program cache key includes each active light-type count. The room visibility
gating therefore produces four distinct signatures:

```text
Room 1   8 point / 1 spot / 0 directional / 1 hemisphere
Room 2   5 point / 0 spot / 0 directional / 1 hemisphere
Room 3   6 point / 0 spot / 0 directional / 1 hemisphere
Room 4   5 point / 0 spot / 0 directional / 1 hemisphere (reuses Room 2)
Room 5   5 point / 2 spot / 0 directional / 1 hemisphere
```

`GreyboxLevelRuntime.prepareLightingPrograms()` visits these presentations
behind the loading screen. Each call to `WebGLRenderer.compileAsync()` receives
a room-owned renderable subset and the authoritative full scene as Three.js's
`targetScene`, so the subset compiles against the correct active lights and
environment without multiplying every Level 1 material across every signature.
The subsets include the room, shared slime presentation and the corresponding
Bob/Goop transient material. Exact shared material/object-feature signatures
use one lightweight representative, avoiding repeated `InstancedMesh` buffer
clones while retaining every distinct shader variant.

A one-pixel scissored draw from each future room entry then performs bounded
first-use geometry/material uploads without displaying another room. Room 1
does not receive a duplicate priming draw: the normal boot flow already renders
it twice behind the loading screen. The rig restores the room that was
authoritative when prewarming began in a `finally` block.

This intentionally trades a one-time loading cost and cached room-specific
programs for stable room boundaries; it does not add lights, duplicate owned
materials, alter gameplay state or perform recurring work. Temporary subset
objects share existing resources, are detached immediately after compilation,
and are never added to the gameplay scene. The development diagnostics record
subset size, compile/prime duration, program growth, signatures and first/repeat
transition render durations. See `docs/evidence/issue-33-transition-prewarm.md`
for the measured comparison.
Browsers without `KHR_parallel_shader_compile` use Three.js's synchronous
`compile()` fallback during the same hidden loading boundary.
