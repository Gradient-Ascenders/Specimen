# Cultivation and Blackout shadows (#172)

Both levels retain one shared `RenderLayer` shadow request for their loaded
lifetime. Cultivation requests PCF shadows in ordinary and dark rooms; it no
longer switches renderer policy or Bob's casting every frame. Blackout retains
its authored maintenance-bay request through powered/unpowered states. Power
changes affect the owned source's intensity and update flags, never renderer
ownership. The newest live level request still wins during handoff.

## Sources and budgets

Cultivation Room 5 retains all nine moving searchlights at 512² and the captive
Volt point source at 512² per cube face: ten maps, fifteen configured depth
passes, 3,932,160 depth texels. Searchlight position, scan direction, cone,
range, colour, intensity, bias and near plane remain authored. Disabled networks
skip map updates without unregistering their lights; re-enabling updates their
maps immediately. The Volt source, glass exclusion and captive-body exclusion
remain intact. No extra source or resolution increase is added to Room 5.

Ordinary traversal uses two fixed ceiling keys per room. The existing low
480-intensity point pools remain unchanged: they illuminate upward-facing
details but cannot cast downward shadows onto the upper route. Each new key is
attached to an existing ceiling fixture location, intensity 120, colour
`#f3f2e9`, decay 2, range 40 m, half-angle 1.2 and penumbra .18. They have 512²
maps, near .2, bias -.0001, normal bias .015 and radius 1.5.

Coordinates below are room-local. These are bounded fixture keys, with no
character-following source or whole-level map.

| Zone | Source positions | Targets | Configured passes |
| --- | --- | --- | ---: |
| Cultivation Room 1 | `(-10.08,19.55,13)`, `(10.08,19.55,37)` | `(0,0,10)`, `(0,0,38)` | 2 |
| Cultivation Room 2 | `(-10.64,23.55,13)`, `(10.64,23.55,37)` | `(-17,17,27)`, `(0,0,34)` | 2 |
| Cultivation Room 3 | `(-13.44,29.55,21)`, `(13.44,29.55,53)` | `(-4,23,25.5)`, `(0,23,53)` | 2 |
| Cultivation lift | Existing `(0,5,10)` pool | `(0,0,2)` | 1 |
| Cultivation Room 5 | Existing patrol/pod owners | Existing scan/pod state | 15 |
| Lift + Room 5 | Both retained rigs | Existing owners | 16 |
| Blackout maintenance drone | Existing downward source | Existing downward gaze | 1 when lit |
| Blackout hallway | Existing four bulbs at x=6, y=3.7, z=56.5/61.5/66.5/71.5 | Floor beneath each bulb | 4 |

The lift pool becomes a broad spot with its existing colour/intensity/range,
512² map and the ordinary-key bias settings. Normal room visibility remains
the existing camera/body scope; adjacent rigs can coexist. Seven ordinary maps
total 1,835,008 depth texels; all seventeen Cultivation maps total 5,767,168.
The rare Room 3/lift/dark-room overlap can configure eighteen passes. This
inventory is a limit on configured sources, not a frame-time guarantee.

Blackout's maintenance spotlight retains its 512² map, .05 near plane, 32 m
range and angle `atan(2/7)`. Its startup ramp, beam clipping, power and shorting
read model remain authoritative. The four existing flickering hallway point
sources become downward spots with the same positions, colour, decay, range and
flicker mapping. Their 256² maps use .15 near, -.0001 bias, .015 normal bias and
radius 1.5; four spots avoid twenty-four cube-face passes. Together with the
drone they configure five maps/passes and 524,288 depth texels. No extra bay
fill, emergency-light shadow or character-attached point shadow is introduced.

## Geometry and character ownership

Visible opaque lit solids receive/cast, including existing batches and repaired
surface skins. Hidden collider materials, transparent glass, beam/effect basic
materials, radioactive surfaces, acid/liquid materials and captive Volt are
excluded. Room 5's existing low-poly platform hulls cast; ceramic/detail batches
marked `shadowProxyReceiver` receive without duplicating their shadow geometry.
No batching cells, membership, collider geometry or finite-light hooks change.

Bob keeps his #170 depth/distance materials and shared morph, fade and secondary
motion uniforms. Goop, unlocked Volt and the merged specimen keep their existing
presentations and roles. Dissolve custom depth/distance materials and their
authoritative masks are never replaced. Blackout's powered door and receiver
are assigned roles when their existing controller attaches their presentation.
The maintenance shell/hatch cast; beams, dust, sparks and bulb lenses do not.

## Preparation and lifecycle

Cultivation prepares receiver and caster variants in ordinary rooms as well as
dark rooms. The compile key distinguishes receiver features; temporary comparison
depth textures remain isolated from live maps. Initial, lift/dark handoff and
isolated dark-room layouts are prepared separately at startup because their
spotlight counts differ. The bounded point-padding policy still reserves the
seventeen slots for searchlights without inflating ordinary fixture layouts.
Live light state is refreshed after isolated preparation and visibility changes.

Restart/retry retain maps and reconcile existing presentation authority. Blackout
reconciles maintenance light/beam power immediately after body recovery, restart
and merge recovery, using a zero-time presentation update. Unload and failed
asynchronous preparation release the level request, restore the surviving owner
and dispose owned resources. Disposal clears map/map-pass references; repeated
teardown cannot release the same target again. Obsolete preparation failures
cannot unload a newer resource generation.

Detection, LOS, beam collision, damage, movement, puzzle progression and all
authoritative timers remain unchanged. See the [production evidence and recorded
limitations](evidence/issue-172/review.md) for hardware measurements and visual
review. See [integrated preparation and profiling](shadow-validation.md) and
the [#173 integration evidence](evidence/issue-173/review.md) for the current
preparation, reload-resource and hardware checks. Full native traversal and
visual acceptance remain separate from those measurements.
