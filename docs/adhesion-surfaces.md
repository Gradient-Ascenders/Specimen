# Authored adhesion surfaces and Bob traversal

Issue #15 retains authored sticky traversal for the supported Sprint 1 route.
`CollisionWorld` remains a geometry-query service; `SurfaceRegistry` supplies
the gameplay meaning of every registered collision mesh.

## Surface metadata

Set `mesh.userData.surfaceTag` before registering the mesh with both the
collision world and surface registry.

| Tag | Adhesion | Traction | Bounce |
| --- | --- | ---: | ---: |
| `default` | no | 1.00 | none |
| `sticky` | yes, on supported faces | 1.00 | none |
| `nonStick` | explicitly no | 0.22 | none |
| `bouncy` | no | 1.00 | fixed 8.2 m/s outgoing normal speed |

Optional overrides are `tractionMultiplier` in `[0, 1]` and a non-negative
`bounceSpeedMetresPerSecond`. Unknown tags and invalid values throw during
registry setup. Material colour, mesh name, proximity, and ordinary collision
registration never imply adhesion.

## Selected wall-camera and input rule

The movement body and camera deliberately own different orientation state:

- On attachment, the body immediately sets `gameplayUp` to the outward wall
  normal. Gravity and the support probe act along its inverse.
- The camera treats `gameplayUp` as its target up, exponentially damps a private
  `smoothedUp`, and parallel-transports the existing orbit heading through the
  change. It does not snap, recenter, or write orientation back to movement.
- Accumulated mouse yaw and pitch are preserved through attachment, supported
  edge transitions, detachment, landing, and reset. Mouse look remains direct.
- While attached, WASD is resolved from the displayed camera heading and
  projected onto the authoritative support plane. Pitch is excluded. Therefore
  A/D always follows screen-left/screen-right, while W/S follows screen
  forward/back on the wall; keys are not assigned fixed world-up axes.
- The resolved world direction is fixed for each step. A step that begins
  attached also retains its original wall plane, so wall-jump detachment cannot
  reinterpret input halfway through that step. Ordinary slope jumps use the
  current airborne world-up plane after release.
- Bob's visual orientation is separate. Ground facing follows actual horizontal
  velocity; attached deformation follows world-space motion/support state and
  is converted with the interpolated presentation orientation at render time.

On detachment the body immediately restores world-up for gameplay, while the
camera smoothly returns its private up toward world-up without resetting orbit
intent. Landing does not recenter the camera.

## Supported adhesion and edge transitions

Attachment requires an explicitly registered `sticky` surface and a
near-vertical contact normal accepted by `maximumAttachmentWorldUpDot`.
Ordinary floors, ceilings, default walls, and `nonStick` walls cannot attach.

When an attached support probe passes a convex edge, the controller performs a
short, allocation-free edge query. If it finds an adjacent adhesive supported
face in the direction of travel, it rotates tangent velocity from the old
support frame into the new one and keeps contact:

- a supported near-vertical adjacent face remains attached;
- a sticky walkable top becomes ordinary grounded movement on that same sticky
  geometry, with world-up restored;
- an absent, non-adhesive, ceiling-like, or unsupported adjacent face detaches.

This proves the constrained authored-wall fallback without creating a second
controller. A designer controls the route simply by tagging only the intended
collision meshes/faces as sticky and leaving surrounding geometry `default` or
`nonStick`.

## Level 1 authoring guidance

For the Sprint 1 Level 1 route:

- Prefer planar, approximately vertical sticky walls and broad, walkable top
  ledges. The current grey-box proves a vertical box wall and its 90-degree top
  transition.
- Tag every collision mesh that should participate in a continuous adhesive
  route as `sticky`; explicitly register it with `SurfaceRegistry`. Keep nearby
  scenery, blockers, and decorative collision `default` or `nonStick`.
- Give convex wall-to-wall or wall-to-top transitions enough width for the
  0.45 m body radius and avoid tiny bevels or sliver faces between support
  surfaces.
- Use clean shared boundaries or modest convex corners. Test each change of
  support normal from both travel directions; do not assume arbitrary meshes
  form a continuous route because they visually touch.
- Provide visible landing space after deliberate wall jumps and at any authored
  end of adhesion. Keep required landings away from narrow gaps and unrelated
  camera obstructions.
- Avoid ceilings, inverted traversal, curved surfaces, rapidly alternating
  normals, acute/concave seams, one-sided decorative meshes, and arbitrary
  scene geometry for the required route. Those geometry classes are not part of
  the validated Sprint 1 envelope.
- If later comfort testing rejects a geometry class, remove `sticky` from that
  class and retain the route on the proven planar authored walls/tops. No code
  change is required for this fallback.

## Detachment and wall jump

A charged wall jump captures the current wall normal before detachment and uses
that one direction for both the physical impulse and visual launch event. The
existing charge curve and jump strength are unchanged. The 0.12-second
attachment cooldown prevents immediate reattachment after a deliberate jump.
Losing authored support without a valid adjacent sticky face returns to
world-up falling and ordinary ground probing.

## Known limitations

- Ceiling adhesion and inverted traversal are intentionally rejected.
- Curved/free-form surface crawling and arbitrary scene geometry are not
  supported or claimed.
- The grey-box proves a convex wall-to-top transition. Adjacent sticky wall
  normals are accepted by the same edge rule, but a Level 1 wall-to-wall corner
  still needs route-specific runtime verification. Acute, concave, very small,
  or rapidly changing faces require separate validation.
- The camera follows support orientation smoothly, so roll is expected during
  wall traversal. It is bounded by the authored support normals rather than an
  unrestricted free-crawl system.

The engineering decision and captured verification are recorded in
[Issue #15 evidence](evidence/issue-15.md).
