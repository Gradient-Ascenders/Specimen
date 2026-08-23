# Issue #33 room-transition prewarm evidence

Measured on 23 August 2026 with Three.js `0.185.1` in the automated Chrome
environment. This host uses virtualised/software WebGL, so absolute frame and
loading times are not representative of lab GPU performance. Program growth
and first-versus-repeat render-call comparisons are still deterministic.

## Before

A fresh page was stepped through Rooms 1–5, then restarted and revisited without
reloading. The transition profiler times the `WebGLRenderer.render()` call and
samples `renderer.info.programs.length` immediately around it.

| Room | Active signature (point / spot / directional / hemisphere) | First render | Programs | Repeat render | Repeat programs |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | `8 / 1 / 0 / 1` | 741.1 ms | `0 -> 13` | 3.0 ms | `30 -> 30` |
| 2 | `5 / 0 / 0 / 1` | 223.0 ms | `13 -> 18` | 1.8 ms | `30 -> 30` |
| 3 | `6 / 0 / 0 / 1` | 228.3 ms | `18 -> 25` | 1.9 ms | `30 -> 30` |
| 4 | `5 / 0 / 0 / 1` | 7.8 ms | `25 -> 26` | 2.1 ms | `30 -> 30` |
| 5 | `5 / 2 / 0 / 1` | 198.8 ms | `26 -> 30` | 1.5 ms | `30 -> 30` |

The three unique first-entry signatures after Room 1 each coincided with new
programs and the repeat visits did not. Room 4 reused Room 2's light counts; its
single additional program was a secondary first-seen material combination.
This confirms shader compilation/linking as the lighting regression rather than
an extra gameplay timer or recurring update cost.

Separate direct effect checks showed Bob impact growing the cache `36 -> 37`
and Goop vapour `37 -> 38`. Each also uploaded one small points geometry on
first use. Repeated shaft fixtures share the rig's unit-box geometry; they did
not introduce a unique fixture geometry allocation.

## Initial full-scene prewarm

The loading phase used `compileAsync()` for the four unique signatures and a
one-pixel hidden draw at all five room entries. It completed with all required
variants present (`0 -> 92` programs in this full-scene development run).

| Room | First render | Programs | Repeat render | Repeat programs |
| --- | ---: | ---: | ---: | ---: |
| 1 | 125.2 ms | `92 -> 92` | 3.6 ms | `92 -> 92` |
| 2 | 11.5 ms | `92 -> 92` | 4.1 ms | `92 -> 92` |
| 3 | 3.0 ms | `92 -> 92` | 4.4 ms | `92 -> 92` |
| 4 | 3.9 ms | `92 -> 92` | 8.7 ms | `92 -> 92` |
| 5 | 4.2 ms | `92 -> 92` | 2.8 ms | `92 -> 92` |

Room 1's measured render is the first full-canvas render and remains behind the
loading screen. Player-visible Rooms 2–5 have no program growth and their first
render is in the same range as repeat visits on this host. The virtualised run's
prewarm took 11.78 seconds; representative hardware timing remains a manual
lab check rather than a claim from this environment. There is no per-frame
prewarm work after boot.

After prewarming, Bob impact and Goop opening both kept programs at `92`; each
still uploaded its single small points geometry (`+1`) on first activation.
Those fixed buffers are reused thereafter and caused no program stall. Twenty-
five presentation/finalise/reset cycles plus a level restart retained `92`
programs, `458 / 11` GPU geometries/textures after the two intentional points
uploads, `1611 / 25` scene objects/lights, zero particles and Room 1's normal
authoritative lighting.

## Optimized room-owned prewarm

A follow-up pass used Three.js's third `targetScene` argument to compile only
the renderables owned by the current room plus shared slime/transient objects,
while still deriving lights and environment from the authoritative full scene.
Room 1's duplicate one-pixel draw was also removed because the boot flow already
renders Room 1 behind the loading screen.

On a fresh software-WebGL context, explicit prewarm fell from 11.78 seconds to
3.60 seconds and cached programs before the first Room 1 frame fell from 92 to
70. Room 1's hidden first frame added one required program and performed its
geometry upload in 1.54 seconds, producing an approximate measured preparation
total of 5.14 seconds rather than 11.91 seconds. This is a 57% reduction on the
same non-representative class of host.

| Room | First render | Programs | Repeat render | Repeat programs |
| --- | ---: | ---: | ---: | ---: |
| 1 (hidden boot frame) | 1542.2 ms | `70 -> 71` | 4.8 ms | `71 -> 71` |
| 2 | 2.8 ms | `71 -> 71` | 2.8 ms | `71 -> 71` |
| 3 | 4.4 ms | `71 -> 71` | 6.7 ms | `71 -> 71` |
| 4 | 11.7 ms | `71 -> 71` | 3.2 ms | `71 -> 71` |
| 5 | 4.4 ms | `71 -> 71` | 2.6 ms | `71 -> 71` |

Exact material/object-feature deduplication reduced the five compile subsets
from 1,399 temporary representatives to 38, 26, 50, 63 and 71 respectively
(248 total). Their combined actual shader compile time was 196 ms; the remaining
loading cost was GPU first-use geometry/material work. Rooms 2–5 retained zero
boundary program growth. After both transient effects were exercised, the
program count remained 71 and GPU geometry count increased only by their two
intentional fixed point buffers.

Bob impact and Goop opening both retained 71 programs. Each still performs its
intentional one-time `+1` points-geometry upload, after which the fixed buffer is
reused.
