# Cultivation Room 3 security drones

Issue #96 is implemented against the authored Level 2 Room 3 greybox. Static
cover, radiation, lasers, soluble ropes, and exit geometry remain owned by
`LevelTwoRoomThreeGreybox`; deterministic drone gameplay is composed by
`CultivationLevelRuntime` when the authored preview is available.

## Authority and update order

- `SecurityDrone` owns scanning, LOS, warning, firing, loss grace, and cooldown.
- `DroneProjectileSystem` owns a fixed pool of 48 swept-sphere shots.
- `SlimeDamageSystem` owns independent Bob and Goop health and regeneration.
- `CeilingSecurityDrone` and `GroundSecurityDrone` own puzzle lifecycles.
- `RoomThreeDroneEncounter` owns exactly three ceiling and four ground drones.
- `CultivationRoomThreeController` alone decides encounter completion.
- Three.js meshes and read models expose state but never advance gameplay time.

Encounter activation follows physical occupancy rather than the shared
objective room. During split progression, Room 3 starts simulating as soon as
either persistent body enters while Room 2 keeps simulating for the body left
behind. Only bodies physically resolved to Room 3 participate in drone
detection and projectile collision. Goop's physical room likewise scopes acid
targets, and drone death requests are accepted only for struck bodies still in
Room 3. Active-slime selection is used only to validate deliberate Bob rear
pushes, so switching never hides or protects an eligible inactive body.

## State machines and tuning

Base drone:

```text
SCANNING -> WARNING -> FIRING -> TARGET_LOST -> COOLDOWN -> SCANNING
```

Initial tuning uses a 35-degree scan half-angle at 30 degrees/second, a
15-degree detection half-angle, 18 m range, 0.4 s warning, 0.3 s firing
interval, 0.3 s loss grace, and 2.2 s cooldown. LOS is a bounded
`CollisionWorld` query against the explicit `LineOfSight` layer. Authored Room
3 cover and other solids block LOS and projectiles.

Shots travel at 14 m/s with a 0.1 m radius, 20 m range, 1.5 s lifetime,
20 damage, and a 48-slot cap. World collision wins equal-distance ties. Each
shot produces at most one impact and returns to the pool. A minimal pooled red
sphere proxy makes travel readable; final tracers, flashes, impacts, and audio
remain presentation work outside this issue.

Bob and Goop each have 100 health. A standard 20-damage hit kills on the fifth
hit. Regeneration begins 2.75 s after the latest hit at 20 health/second. Death
is latched by health state and routed into the existing pair death/retry flow.

Ceiling lifecycle:

```text
ACTIVE -> SUPPORT_DISSOLVING -> RELEASED -> FALLING -> DISABLED
       -> REPLACEMENT_WARNING -> REINSTALLING -> ACTIVE
```

Only the explicitly associated soluble rope releases a ceiling drone. Fall is
an authored 0.65 s transform. The existing Room 3 radiation floor supplies the
contact query; it never mutates drone state. Disabled duration is 10 s,
including a 2 s warning, followed by a 1.75 s installation. Replacement cables
are explicit non-soluble colliders only while present and remain as the new
support after installation.

Ground lifecycle:

```text
ACTIVE -> BEING_PUSHED -> TIPPING -> PERMANENTLY_DISABLED
```

The exact drone collider must be Bob's authoritative contact, Bob must be the
controlled slime, his centre must overlap the authored local rear region, and
movement intent must have a dot product of at least 0.5 with the authored
forward vector. Progress accumulates at 1.25/second and decays at 2/second.
Threshold starts a 0.75 s authored tip; radiation contact at the fallen pose
permanently disables that drone until recovery or restart.

## Authoring and completion

`CultivationRoomThreeAuthoring.ts` centralises Room 3-local drone IDs, poses,
forward vectors, scan phases, target policies, muzzle/detection anchors, rope
associations, radiation impact poses, hatch/cable anchors, rear regions, and
fall poses. The encounter root is parented to the translated Room 3 root, while
all projectile, target, and radiation queries use world-space authoritative
positions.

Gameplay roles come from explicit metadata such as `soluble`, `solubleId`,
`authoringRole`, and `droneId`; material, colour, visibility, and name parsing
are never authority. Drone bodies, mounts, and replacement cables are
non-soluble world impacts.

Completion requires all four ground drones permanently disabled while Bob and
Goop simultaneously occupy their identity-specific halves of the authored
exit. Temporary ceiling disables never contribute.

## Reset and teardown

Preview recovery cancels acid shots and burns, resets lasers/radiation, restores
the three support targets, then resets the encounter and completion controller
before recovering either persistent body. The encounter restores health, scan
phases, projectiles, drone transforms, timers, hatches/cables, and push state.

Disposal removes support subscriptions and owned colliders, clears pooled shots
and target references, and disposes only locally created drone/projectile proxy
resources. Repeated construction and disposal retain stable collision and
surface registration counts.

## Diagnostics and verification

The F2 panel reports each drone state/target/timer, projectile count, both
health states, ground push progress, identity exits, completion, and the last
dying slime. The Room 1–3 debug controls use the normal authored preview reset
and recovery path.

Node coverage includes cone/range/LOS behavior, continuous collision and pool
bounds, damage/regeneration, inactive targeting, rope association, replacement,
rear-push validation, exact seven-drone construction, completion gating,
resource cleanup, acid-resistant impacts, and existing Level 2 regressions.
