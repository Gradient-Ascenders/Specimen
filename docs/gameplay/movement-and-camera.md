# Movement and camera

## Kinematic authority

`KinematicBody` and `CollisionWorld` provide deterministic gameplay movement.
The player is represented by a sphere swept against authored collision boxes;
render meshes do not participate in collision. Grounding is derived from
contact normals and the configured slope threshold, not from mesh orientation
or presentation state.

The fixed-step order is input intent, camera-relative movement basis, velocity
and jump update, continuous collision/sweep resolution, contact classification,
gameplay events, and finally presentation. Moving platforms apply their carrier
motion before the player's own displacement so riders remain stable.

Movement tuning lives with the relevant controller/definition. Preserve coyote
time, pre-landing jump buffering, post-jump ground detachment, and the stable
landing signal when changing locomotion. Performance or feel claims require a
production build and a representative traversal, not a single development
scene.

## Bob adhesion

Sticky traversal is opt-in surface metadata registered with
`SurfaceRegistry`. Bob may attach only to eligible authored faces. Wall input is
resolved in the selected wall/camera frame, and supported edge transitions must
preserve a safe body position. A wall jump detaches before applying launch
velocity so the old surface cannot immediately recapture the body.

Never infer adhesion from material, colour, mesh name, or proximity alone.
Goop, Volt, and Specimen do not inherit Bob's adhesion unless a feature defines
that explicitly.

## Camera

`CameraRig` owns orbit yaw/pitch, target following, contextual profiles, and
collision shortening. Mouse displacement is not multiplied by frame time.
Movement uses the camera's horizontal basis on the ground; adhesion may select a
surface-aware basis. Camera collision queries the authored collision layer and
must recover smoothly when an obstruction clears.

Level volumes may request contextual profiles for framing, but they cannot take
gameplay ownership or move a body. Slime switches retarget the same camera rig
and clear stale smoothing/aim transients. Aiming may adjust presentation and
targeting while preserving the authoritative body and line-of-sight rules.
