# Acid liquid presentation

## Coverage and architecture

Level 1 has one live acid floor: `room-3-acid-floor` in RoomThreeGreybox.
Its collider is 34 x 0.4 x 28 metres at (0, 4.8, 63). The existing separate
visual surface is 32.7 x 0.05 x 26.7 metres at (0, 5.025, 63).
Neither geometry nor placement changes. No other Level 1 acid floors were
found in source or the live collision inventory.

AcidSurfaceMaterial already extended MeshStandardMaterial with procedural
noise, film, bubbles, normals and restrained emission. The shared shader now
has more visible layered ambient flow, rolling normal detail and local ripple
normal/colour distortion. Its dark green and yellow-green palette is retained.
There is no vertex displacement, avoiding new clipping at platforms and walls.
Level 2 shares the material and the same contact sampler, connected to both
persistent slime bodies on all three authored basins.

## Interactions

AcidLiquidInteractions reads the persistent Bob and Goop bodies without
writing gameplay state. Contact creates an entry pulse; movement samples a
small wake every 0.14 seconds; takeoff adds a small pulse; impact speed makes
landing stronger. Samples use world X/Z positions and the surface height.
Teleports suppress contact pulses. Reset clears samples and contact history.

A preallocated ring of 12 events stores X/Z, birth time and strength, with a
parallel surface-height array. Events expire after 3.2 seconds and new events
overwrite the oldest slots. There are two fixed body-history slots. No new
materials, textures, meshes, render targets or per-frame sample objects are
created. Fragment cost increases by a bounded 12-event loop, with inactive,
expired, out-of-height and distant events skipped. GPU frame-time impact has
not been benchmarked across hardware.

Uniforms: uTime, uRipples, uRippleSurfaceY, uDeepColour, uMidColour,
uFilmColour, uBubbleColour, uFlowSpeed, uFlowScale, uBubbleScale,
uBubbleStrength and uEmissionStrength.

## Gameplay constraint

The existing Room 3 failure volume recovers the active slime before it
physically reaches the liquid. That behaviour remains intact. Failure emits
a ripple projected beneath the falling slime, and acid presentation continues
during the death animation. Normal active gameplay therefore does not permit
swimming or sustained movement in the acid. Actual contact, movement and
landing responses were exercised with the real inactive Goop body in a local
browser diagnostic; no production hazard rules were bypassed or changed.

## Verification

- 336 automated tests pass, including contact strength, bounded pool reuse,
  expiration, teleport suppression, reset and existing collision checks.
- Type-check and production build pass. Existing Vite chunk-size warning remains.
- Browser checks exercised ambient motion, nearby non-contact, actual Goop
  contact/wakes/jump/landing, rapid samples, active Bob failure and room reset.
- No browser console errors, shader errors or failed resource requests observed.
- Shader program count remained 85 in the diagnostic scene; the effect adds
  no draw calls or geometry. Automated checks confirm event-slot identities
  remain stable during repeated updates; no long-duration heap profile was run.

Manually inspect Room 3 from its entry platform, watch the untouched basin
for several seconds, then fall toward it and restart. Check ripple visibility
and flow intensity at the usual camera distance and on the target GPU.


## Level 2 integration

All authored Level 2 rooms and connecting passages were searched. The three
acid surfaces are `cultivation-room-1-radioactive-floor` (35.6 x 34 metres),
`cultivation-room-2-radioactive-floor` (37.6 x 37 metres), and
`cultivation-room-3-radioactive-floor` (47.6 x 66 metres). Passages and the
Bob air duct contain no additional acid floors.

Each basin caches its own world-space contact bounds after room translations
are applied. All three write into the one shared material's 12-event pool.
The runtime passes a persistent array of the actual Bob and Goop bodies after
physics, before acid hazard detection. Death presentation continues the acid
clock without advancing gameplay. Existing restart, checkpoint recovery and
debug room transitions reset the samplers through the scene reset contract.

There is no Level 2-specific palette or flow override. World-space procedural
coordinates preserve flow speed, detail density and ripple radius across the
three differently sized floors. The existing material replacement and Room 3
render batching remain intact. No shader copy, asset, geometry, subdivision,
material or draw call was added by this integration. CPU work is three bounded
two-body contact checks per simulation step, using cached bounds and preallocated
state. No long-duration heap or cross-device GPU benchmark was performed.

Goop remains immune and can leave wakes; Bob remains vulnerable and creates a
brief contact disturbance before death. Cover geometry, drone logic, hazard
rules, collision transforms, checkpoints and progression are unchanged.
The full suite passes 337 tests; type-check and production build pass with the
existing chunk-size warning. The additional integration regression covers all
three translated basins, simultaneous bodies, movement, reset, exact collider
identity/transforms/tags and Bob-lethal/Goop-immune hazard behaviour.
