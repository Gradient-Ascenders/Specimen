# Levels

`GameSessionCoordinator` owns the authored Containment → Cultivation → Blackout
journey. Level selection constructs the selected level with its required
roster. Each runtime owns its scene, room controllers and checkpoints; only
plain progression data crosses level boundaries.

## Containment

`GreyboxLevelRuntime` introduces Bob across five rooms: awakening and adhesion,
route traversal, laboratory hazards, lift/platform movement, and Goop's release
and the cooperative escape. The runtime owns its checkpoint recovery.
Authored room art and collision have separate owners, and the opening leaves
the containment chamber in its gameplay pose.

Check the live opening and Skip, wall attachment, charged jumps, lasers and
Retry, moving-platform riding, Goop release, two-body controls, pause/restart
and the Cultivation handoff.

## Cultivation

`CultivationLevelRuntime`, room controllers and `CultivationCheckpointManager`
own the Bob/Goop route and Volt rescue:

1. Room 1 introduces split-body traversal and radiation: Bob is vulnerable;
   Goop is immune.
2. Room 2 combines soluble supports, Bob's wall control and Goop's safe door route.
3. Room 3 combines security drones, acid and cover interactions.
4. Room 4 handles the elevator descent and its encounter.
5. Room 5 separates Bob's security route from Goop's sewer/network route,
   releases Volt, and gathers all three at the powered exit.

Boundaries that require multiple bodies must not advance on partial occupancy.
Verify both arrival orders, inactive-body hazards, door obstruction, soluble
support reset, elevator reset, security networks, Volt rescue and three-body
exit. Full restart restores the initial Bob/Goop roster.

## Blackout

`BlackoutLevelRuntime` owns the three-slime opening, electrical devices,
maintenance-drone traversal, transit bridge, research cinematic, merged
Specimen, Exterminator encounter and First Sunlight ending.

The maintenance bay introduces Volt's drone and local circuits. Transit combines
Bob's lifts and sticky routes, Goop's sewer-drone combat, Volt's infrastructure
and the cooperative bridge. Room controllers gate regrouping and checkpoint
promotion using real body positions. Volt's connections never survive recovery.

The research finale and boss controller own their deterministic phase changes;
camera, effects, music and audio follow those owners. The defeat timeline hands
off to the ending, credits and menu. Check checkpoint recovery, electrical
range/line of sight, mount/dismount, switching on lifts, bridge cooperation,
cinematic skip, boss retry/phase recovery, defeat and credits/menu cleanup.

A complete human playthrough of all three levels remains the acceptance check
for progression and puzzle readability; shortcut-based browser tests cover
specific transitions and invariants.
