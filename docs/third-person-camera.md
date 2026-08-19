# Collision-aware third-person camera

Issue #14 replaces the fixed grey-box inspection view with a platforming-oriented
third-person camera. The rig follows the authoritative kinematic body, consumes
pointer-lock look intent from the shared input boundary, and keeps its boom out
of registered authored geometry.

## Runtime contract

`CameraRig` receives a read-only `CameraFollowTarget` implemented structurally
by `KinematicBody`:

- current and previous position, used for fixed-step render interpolation;
- velocity, used to distinguish plausible high-speed lag from checkpoint/reset
  teleports;
- grounded and attached state, exposed in diagnostics and reserved for later
  comfort tuning;
- `gameplayUp`, the movement-owned orientation target.

The camera keeps private smoothed target and up vectors. It never writes a
position, rotation, up vector, or attachment state back to movement. When a
future sticky-surface controller changes `gameplayUp`, the rig transports its
existing orbit around the damped up transition. Deciding whether wall traversal
should re-centre, preserve world horizon, or use another comfort rule remains
deliberately deferred.

## Camera tuning

All defaults live in `DEFAULT_CAMERA_RIG_CONFIG` in
`src/render/CameraRig.ts`.

| Value | Default | Behaviour |
| --- | ---: | --- |
| Vertical field of view | 48° | Keeps the slime and nearby route readable |
| Open-space follow distance | 5.2 m | Normal framing-pivot-to-camera distance |
| Preferred minimum distance | 0.2 m | May be overridden by a nearer obstruction to avoid clipping |
| Target height | 0.35 m | Framing pivot above the body centre along gameplay-up |
| Follow damping | 18 s⁻¹ | Small render-only positional lag |
| Maximum follow lag | 0.28 m | Hard platforming-oriented lag bound |
| Orientation damping | 10 s⁻¹ | Smooth private response to movement-owned gameplay-up |
| Recovery damping | 5 s⁻¹ | Slower outward return after obstruction |
| Recovery delay | 0.08 s | Prevents corner-edge clear/blocked flicker from pumping distance |
| Camera query radius | 0.22 m | Swept sphere clearance around the camera |
| Contact buffer | 0.03 m | Additional inward separation from a query contact |
| Teleport snap threshold | 3 m | Checkpoint/reset discontinuities do not leave long follow lag |
| Pitch range / initial pitch | -25° to 65° / 18° | Avoids orbit poles and keeps traversal visible |

Obstruction contraction is immediate, so damping cannot carry the camera
through a wall. Once the path grows or clears, distance returns with exponential
time-based damping and cannot retain a permanent shortened offset. The query
objects, vectors, matrices, and quaternions are owned and reused by the camera
and collision world; the render update creates no temporary Three.js resources.

## Pointer-lock look settings

`Input` remains the only browser-event boundary. While its canvas owns pointer
lock, `main.ts` passes accumulated relative motion to `CameraRig.queueLookInput`
before `Input.endFixedUpdate()` clears it.

`CameraRig.setLookSettings()` is the settings-system hook for:

- horizontal sensitivity (`0.0022` radians per pointer pixel by default);
- vertical sensitivity (`0.0020` radians per pointer pixel by default);
- horizontal inversion (off by default);
- vertical/Y inversion (off by default).

No settings UI is added by Issue #14.

## Collision query layer

`CollisionWorld` uses explicit bit masks:

| Layer | Mask | Intended contents |
| --- | ---: | --- |
| `Movement` | `0b01` | Geometry that blocks the kinematic body |
| `CameraObstruction` | `0b10` | Authored opaque geometry that blocks the view |

The default solid registration mask is `0b11`, so the current grey-box floor,
walls, ledges, slope, and platforms block both movement and the camera. Camera
queries explicitly request only `CameraObstruction`. The slime visual, grid,
outlines, markers, recovery volume, puzzle triggers, and test sensors are not
registered in this collision world and therefore cannot shorten the camera.
Future trigger-only or transient volumes must opt into a non-camera layer.

The rig sphere-sweeps from its target pivot toward the desired pose every
rendered frame. This handles walls, corners, and overhead geometry continuously
instead of detecting an overlap after the camera has already crossed a surface.

## Grey-box verification route

Use the existing authored cases rather than treating the test harness as a
production level:

1. Click the canvas to acquire pointer lock and orbit around the moving probe.
2. Use the default wall and nearby ledge as a narrow passage and inside/outside
   corner case; orbit toward each surface while moving through the gap.
3. Approach and back away from the default and sticky walls while watching the
   camera-distance and obstruction diagnostics.
4. Use the underside of the floor/ledge during the `F` recovery transition as
   the overhead/low-clearance case.
5. Cross the slope, reverse rapidly, walk off the gap, and reset with `R` to
   exercise moving, falling, and teleporting targets.
6. Repeat with a narrow and a wide browser viewport. Vertical framing remains
   stable because resize changes projection aspect only.

Jump impulses and sticky attachment are not implemented by the current movement
controller. Issue #14 does not add either movement behaviour; those camera paths
must be rechecked when their owning movement issues land.
