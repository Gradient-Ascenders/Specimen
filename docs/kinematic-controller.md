# Kinematic collision and locomotion controller

This note documents the Sprint 1 collision/body conventions introduced by issue #11.

## Authoritative gameplay body

The slime gameplay body is a sphere collider owned by `KinematicBody`. The visible slime mesh is not the collider and may deform independently later.

Movement state owned by the body:

- current position
- previous position, for render interpolation
- velocity
- grounded state
- ground normal
- gameplay-up vector
- attached state (reserved for sticky-surface work; always false in #11)

Camera and visual systems read these values directly. Continuous position/velocity state is not broadcast through the `EventBus`; typed events are reserved for discrete occurrences such as landing or impact when those become useful.

## Units and initial tuning

The grey-box defines one grid square as one metre. Controller values therefore use SI-style game units:

| Value | Initial value | Unit |
| --- | ---: | --- |
| Collision radius | 0.45 | m |
| Collision skin | 0.01 | m |
| Gravity | 18 | m/s² |
| Maximum locomotion speed | 5.5 | m/s |
| Ground acceleration | 32 | m/s² |
| Air acceleration | 12 | m/s² |
| Ground braking | 36 | m/s² |
| Air drag coefficient | 0.8 | 1/s |
| Ground probe distance | 0.08 | m |
| Walkable-ground limit | 50 | degrees from gameplay-up |
| Collision iterations | 3 | per fixed update |

These are tuning values, not level-layout constants. They can be adjusted from playtesting without changing the collision architecture.

## Fixed-update order

Each deterministic gameplay step performs:

1. Copy current position to previous position.
2. Convert named movement actions into a normalized X/Z movement intent.
3. Accelerate the tangent velocity toward the intended speed, or brake when no ground input is held.
4. Apply air drag when airborne.
5. Apply full gravity while airborne. While grounded on walkable geometry,
   retain only gravity's component into the support normal so gravity maintains
   contact without introducing passive downhill sliding.
6. Sweep the sphere along `velocity * fixedDelta`.
7. Move to the earliest contact and remove the component of velocity/displacement pointing into the hit normal.
8. Repeat collision/slide resolution up to three times for corners and multiple contacts.
9. Probe a short distance along `-gameplayUp` and classify stable ground from the returned normal.

Rendering interpolates the grey-box probe between `previousPosition` and `position`; rendering therefore remains independent from the fixed simulation rate established by issue #10.

## Collision-world convention

`CollisionWorld` is a query registry, not a rigid-body simulation.

For the Sprint 1 test scene:

- only the authored test-case meshes exposed through `GreyboxCollisionScene.collisionMeshes` are registered;
- debug outlines, the scale reference, spawn/recovery markers and the visual probe are not colliders;
- the registered geometry is authored as `BoxGeometry` and may be translated/rotated;
- surface tags (`default`, `sticky`, `bouncy`) are metadata only in #11; sticky adhesion and bounce responses are deliberately deferred;
- hidden collider meshes are ignored by queries;
- collider transforms are refreshed during a query so later authored kinematic geometry can move without changing the query API.

### Sphere sweep

The controller does not move first and then test overlap. It performs a swept query along the intended displacement so it does not routinely pass through thin authored geometry at gameplay speeds.

For each registered box, the query:

1. transforms the sphere-centre segment into the box's local space;
2. expands the local box by the sphere radius (Minkowski-style query);
3. intersects the movement segment against that expanded box;
4. transforms the contact normal back into world space;
5. returns the earliest hit across all registered colliders.

Existing contacts only block motion directed further into the surface. Tangential or separating motion is ignored, allowing the body to slide along a floor or wall without zero-time contact jitter.

Non-uniformly scaled boxes are treated conservatively by expanding with the smallest world scale component. Production collision geometry should still prefer authored dimensions/rotation over non-uniform mesh scaling where practical.

## Ground classification

After movement, the body sphere is swept a short distance down along `-gameplayUp`. A contact is ground when:

```text
hitNormal · gameplayUp >= cos(50°)
```

This keeps the 15° grey-box slope grounded while rejecting near-vertical walls. The exact walkable-angle threshold is a tuning value.

## Manual verification for #11

Run the grey-box development harness and verify the following with `WASD`:

- **Floor:** move, stop, reverse direction, and remain grounded without visible shaking or sinking.
- **Default wall:** drive into it straight and diagonally; the probe must not pass through and diagonal input should slide along it.
- **Sticky wall:** behaves as an ordinary wall in this issue.
- **Ledge:** collide with the side and move around/off its edges predictably.
- **15° slope:** move onto/across it without severe jitter; diagnostics should show a non-world-up ground normal while supported.
- **Gap:** move off an edge and confirm gravity produces a fall rather than an invisible floor contact.
- **Platform:** collide with the top and sides without tunnelling.
- **Bounce pad:** behaves as ordinary solid ground in this issue.
- **Corners:** hold diagonal input into intersecting surfaces and verify that the three-iteration slide solver does not vibrate severely or escape through geometry.

Repeat representative movement at 30 Hz, 60 Hz and a high-refresh render condition. Position and locomotion speed should remain consistent because `KinematicBody` runs only from the fixed gameplay callback.

Useful diagnostics captured by the harness include body position, velocity, grounded/attached state, ground normal, contacts this step, last collider name and registered collider count.

## Deferred scope

Issue #11 intentionally does not add:

- jumping or coyote time;
- sticky-surface adhesion or changing gameplay-up;
- bounce-pad impulses;
- deformable visual slime behaviour;
- a general rigid-body or soft-body simulation.
