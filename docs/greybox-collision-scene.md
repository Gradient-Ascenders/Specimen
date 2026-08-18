# Grey-box collision test scene

The Sprint 0 grey-box is a compact, disposable test harness for developing the
kinematic controller and reusable puzzle objects. It is not the Containment
level and contains no production movement or collision response.

## Test cases

Each authored mesh has a stable `name`, a `userData.collisionCase` value, and
metre-based dimensions in `userData.sizeMetres`.

| Colour | Case | Measurement and purpose |
| --- | --- | --- |
| Grey | Floor | 8 m × 10 m baseline for ground contact |
| Blue | Default wall | 3 m high vertical contact that must not permit adhesion |
| Teal | Sticky wall | 3 m high vertical contact eligible for adhesion |
| Orange | Ledge | 1 m high step and corner-resolution case |
| Yellow | Slope | 15° incline for grounding and slide tests |
| Pink | Gap | 2 m separation between two floor sections |
| Green | Platform | 1.5 m-high isolated platform contact |
| Purple | Bounce pad | 0.2 m-high bouncy platform surface |

The ground grid uses one-metre cells. A one-metre white scale bar stands beside
the cyan spawn marker. The temporary player probe is a sphere with a 0.45 m
radius, matching the planned simple gameplay collider.

## Surface metadata

Every collision mesh exposes two independent semantic fields:

- `userData.collisionCase` describes the shape's test category, such as `wall`
  or `platform`.
- `userData.surfaceTag` describes its gameplay behaviour: `default`, `sticky`,
  or `bouncy` in this scene.

This allows the normal and sticky walls to remain the same `wall` collision
case while only the latter is accepted by future adhesion logic. The bounce pad
remains a `platform` collision case while carrying the `bouncy` tag. Future
authoring may use the same field for the planned `soluble` and `conductive`
tags; collision code must use the explicit tag rather than material colour or
mesh name.

## Spawn and recovery

The cyan ring marks the known safe spawn at `(-4, 0.46, 5)`. Press `R` or use
**Reset probe** to place the probe there. Press `F` or use **Test recovery** to
move the probe into the red recovery volume below the gap; the harness returns
it to the spawn marker after a short visible delay.

This simulated fall exists only to verify the authored spawn/recovery contract.
The later checkpoint and movement systems will call the same reset behaviour
after detecting a real fall.

## Reusable authoring conventions

- Use metres as world units; keep the default slime collision probe below one
  metre in diameter.
- Give collision meshes stable, descriptive names and store semantic tags in
  `userData` rather than inferring behaviour from material colour.
- Keep the collision-case and surface-behaviour tags separate: a wall can be
  `default` or `sticky`, and a platform can be `default` or `bouncy`.
- Keep visual outlines separate from collision meshes. Registration code should
  only consume objects carrying `userData.collisionCase`.
- Mark known-safe spawn positions explicitly and keep recovery volumes below
  traversable gaps.
- Use colour only as test-scene assistance; production gameplay surfaces will
  also need shape, texture, or icon cues.
