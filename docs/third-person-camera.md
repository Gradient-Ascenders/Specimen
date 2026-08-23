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
- grounded and attached state, used to diagnose supported wall traversal;
- `gameplayUp`, the movement-owned orientation target.

The camera keeps private smoothed target and up vectors. It never writes a
position, rotation, up vector, or attachment state back to movement. When
sticky traversal changes `gameplayUp`, the rig exponentially damps its private
up and transports the existing orbit heading through that transition. Mouse
yaw/pitch remain accumulated and direct: attachment, detachment, landing, and
supported convex edges do not recenter the view.

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
| Pitch range / initial pitch | -65° to 65° / 18° | Provides equal upward/downward reach while avoiding orbit poles |

Obstruction contraction is immediate, so damping cannot carry the camera
through a wall. Once the path grows or clears, distance returns with exponential
time-based damping and cannot retain a permanent shortened offset. The query
objects, vectors, matrices, and quaternions are owned and reused by the camera
and collision world; the render update creates no temporary Three.js resources.

## Pointer-lock look settings

`Input` remains the only browser-event boundary. While its canvas owns pointer
lock, `GreyboxLevelRuntime` passes accumulated relative motion to
`CameraRig.queueLookInput` before `Input.endFixedUpdate()` clears it.

`CameraRig.setLookSettings()` is the settings-system hook for:

- horizontal sensitivity (`0.0022` radians per pointer pixel by default);
- vertical sensitivity (`0.0020` radians per pointer pixel by default);
- horizontal inversion (off by default);
- vertical/Y inversion (off by default).

`CameraRig.setFollowDistanceMetres()` is the collision-aware camera-distance
hook used by Issue #22. It accepts the supported 3.5–7.0 m player range and
updates the normal open-space target. Moving inward contracts immediately;
moving outward uses the existing delayed, damped recovery and remains limited
by camera-obstruction sweeps.

With vertical inversion off, mouse up looks up and mouse down looks down;
enabling vertical inversion reverses those directions. Horizontal look retains
the orbit-yaw convention independently.

No settings UI is added by Issue #14.

## Contextual camera profiles

`ContextualCameraProfile` is a small authored override for bounded gameplay
sections. It changes distance, target height, visual pitch, transition time and
screen-plane framing dead zone without replacing the normal camera or its
collision sweep. `CameraProfileZone` combines one of these profiles with an
existing trigger volume and a read-only fixed-step anchor. The level runtime
resolves the active zone and passes only that generic context to `CameraRig`;
the rig contains no room or elevator conditions.

The Level 1 Room 4 lift uses a progression-shaped contextual profile because a
close player-follow camera makes a vertically moving platform and its upcoming
hazards difficult to read. The ascent and arrival endpoints are centralized in
`ROOM_4_LIFT_CAMERA_PROFILE` and `ROOM_4_LIFT_ARRIVAL_CAMERA_PROFILE`:

| Value | Main ascent | Arrival |
| --- | ---: | ---: |
| Distance | 10.5 m | 5.0 m |
| Anchor-relative target height | 1.1 m | 0.55 m |
| Downward pitch | 65° | 15° |
| Transition | 0.65 s | 0.65 s |
| Dead-zone half-width / half-height | 1.5 m / 1.25 m | 0.75 m / 0.6 m |
| Framing damping | 7 s⁻¹ | 8 s⁻¹ |

The lift platform supplies interpolated large-scale motion. The active slime
supplies framing intent only after it crosses the screen-oriented dead zone, so
small steps and jumps do not drag the camera while the elevator rises. Entering
the authored shaft zone blends into the profile. Over roughly the final 22% of
authoritative platform travel, Room 4 smoothsteps its stable profile from the
high-angle values to the compact arrival values. Arrival framing remains active
through `arrivalPause`. Once `exitReady` is authoritative and the player walks
forward across the upper platform, Room 4 releases the context before the
doorway; the rig then uses its normal blend-out toward Room 5. This is driven by
elevator state and authored position rather than a timer in camera code.

The profile never changes accumulated yaw. Mouse yaw remains available and the
same `planarBack` continues to define both displayed horizontal orientation and
camera-relative WASD, so profile entry cannot rotate movement underneath the
player. Visual pitch is authored while the profile is active. Mouse pitch is
ignored during that interval and the previous manual pitch is preserved for
the transition back to ordinary gameplay.

Room checkpoint recovery resets the zone and elevator together, then resolves
the recovered active slime against the zone immediately. A recovery onto the
lift therefore restores the high-angle view; a full level restart, an outside
checkpoint, slime switching outside the shaft, and level unload all resolve or
clear the profile through existing camera lifecycle seams.

## Camera, movement, and facing ownership

The normal gameplay path keeps three orientation decisions separate:

- `CameraRig` owns the accumulated pointer yaw and clamped pitch. It never
  reads the slime visual's facing.
- Before each movement step, `GreyboxLevelRuntime` asks the rig to convert
  normalized WASD input into a world direction. Ground movement uses the world-horizontal
  camera right/back basis. Attached movement uses the displayed camera heading
  projected onto the authoritative wall plane. Camera pitch is absent from both
  bases, so it cannot reduce movement speed or invert an axis.
- `BlobFacing` reads the body's resulting horizontal velocity after the
  kinematic step. It turns the upright visual toward that direction, or holds
  the last heading when horizontal speed is negligible.

This makes a stationary mouse orbit camera-only state. Starting movement after
an orbit uses the new camera direction immediately, while changing movement
direction never recentres the camera behind the blob. The movement body retains
the step-start support plane when a step begins attached, including a wall-jump
release step. Ordinary slope jumps use the current airborne world-up plane.

Normal-ground facing turns along the shortest yaw arc at `720°/s`, with a
`0.05 m/s` horizontal speed threshold to suppress near-rest direction noise.
Both values are named in `src/render/BlobFacing.ts`. Simulation updates the
facing target at the fixed step and rendering interpolates the previous/current
yaw along the shortest arc.

## Collision query layer

`CollisionWorld` uses explicit bit masks:

| Layer | Mask | Intended contents |
| --- | ---: | --- |
| `Movement` | `0b01` | Geometry that blocks the kinematic body |
| `CameraObstruction` | `0b10` | Authored opaque geometry that blocks the view |

The default solid registration mask is `0b11`, so the current grey-box floor,
walls, ledges, slope, and platforms block both movement and the camera. Camera
queries explicitly request only `CameraObstruction`. `GreyboxRoomBuilder` may
also author invisible camera-obstruction boxes. The runtime registers those
meshes with `0b10` only, so the same camera sweep sees them while player and
checkpoint-safety movement queries ignore them. Their mesh remains active in
the scene graph for CPU queries while an invisible material suppresses renderer
submission. The slime visual, grid, outlines, markers, recovery volume, puzzle
triggers, and test sensors are not registered and cannot shorten the camera.

The rig sphere-sweeps from its target pivot toward the full desired pose every
rendered frame. This handles walls, corners, and overhead geometry continuously
instead of detecting an overlap after the camera has already crossed a surface.
Contextual profiles only change the preferred focus, pitch and distance; they
use the same query and cannot force their preferred pose through geometry.

## Goop aim presentation

Goop aim is a modifier on this existing rig, not a second camera or targeting
calculation. While #91 reports valid Goop aim, the preferred boom distance
smoothly blends over 0.2 seconds to 84% of the current contextual distance and
the look pivot shifts 0.82 m toward screen-right. This modest shoulder framing
keeps Goop clear of the crosshair without laterally moving the camera. Yaw,
pitch, FOV, and follow-target ownership do not change; the camera's resulting
live centre ray remains the exact ray #91 consumes.

The camera position remains on the existing shortened boom, which passes
through the normal sphere sweep and distance damping. The look offset therefore
cannot move the camera through wall/corner obstruction, and movement keeps the
same camera-relative basis while aiming. Release, slime
switch, pause, death, retry, restart, cutscene input lock, and unload clear the
aim request through existing runtime lifecycle seams. The normal distance is
restored smoothly; there is no FOV snap or aggressive zoom.

Room shells must still author intentional obstruction coverage. Room 2 has a
normal solid ceiling. Room 4 keeps its short visible solid ceiling, while one
wider invisible camera-only cap covers diagonal boom requests around that
ceiling's footprint. Its presentation-only upper elevator frame is also
registered on the camera layer because it is visible and opaque but must not
block Bob. The compact arrival request stays beneath that lower frame; both
query volumes remain environmental safety boundaries.

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

The charged-jump and sticky controllers use the same read-only position,
velocity, and `gameplayUp` contract. The selected wall-camera rule, authored
fallback, limits, and Level 1 guidance are documented in
[Authored adhesion surfaces and Bob traversal](adhesion-surfaces.md).
