# Level 2 — Room 3 Detailed Design and Layout Plan

## 1. Room Purpose

**Level:** Level 2  
**Room:** Room 3  
**Primary objective:** Get both Bob and Goop through the heavily defended room and reach the exit.

Room 3 is the major escalation of Level 2's cooperation mechanics.

The previous rooms establish:

- **Room 1:** Goop changes the environment so Bob can progress.
- **Room 2:** Bob opens Goop's route, then Goop creates Bob's route.

Room 3 introduces:

> **Timed cooperation under pressure.**

The player must regularly switch between Bob and Goop because each slime is responsible for removing threats blocking the other.

The central cooperation rule is:

> **Goop temporarily clears Bob's upper route by dissolving the ropes supporting ceiling drones. Bob eventually reaches the far side and physically disables the four ground drones blocking Goop's exit.**

Neither slime should be able to complete the room alone.

---

# 2. Core Room Identity

Room 3 should feel dramatically larger and more threatening than Rooms 1 and 2.

It introduces the player to **security drones**.

The room is effectively divided into two gameplay layers:

### Upper Layer — Bob

Bob traverses:

- Suspended platforms.
- Sticky walls.
- Beams.
- Small safe structures.
- Laser hazards.
- Ceiling-mounted security drones.

Bob cannot touch the room's main floor because the entire lower floor is radioactive.

### Lower Layer — Goop

Goop traverses:

- The radioactive floor.
- Cover positions.
- Machinery.
- Security-drone sightlines.
- Acid-shooting positions.

Goop is safe from the radioactive floor but vulnerable to drone fire.

---

# 3. Entry From Room 2

Room 3 continues directly from Room 2.

The two slimes enter from completely different locations.

---

## 3.1 Bob's Entrance

Bob enters through the upper ventilation shaft from Room 2.

The vent exits near the **upper-left / upper-start side of Room 3**.

Bob should emerge onto a small safe elevated platform.

This becomes:

> **Bob's Room 3 checkpoint.**

Bob begins significantly above the radioactive floor.

---

## 3.2 Goop's Entrance

Goop enters through the centre blast door from Room 2.

The doorway connects directly to the **lower level** of Room 3.

Goop enters onto the radioactive floor or onto a tiny safe threshold before immediately entering it.

This becomes:

> **Goop's Room 3 checkpoint.**

The important visual is that the player immediately understands:

```text
BOB = ABOVE

GOOP = BELOW
```

---

# 4. Separate Checkpoints

Room 3 should preserve separate logical spawn positions for the two slimes.

### Bob checkpoint

Located on the upper entrance platform near the vent.

### Goop checkpoint

Located at the lower Room 2 doorway.

If the room resets:

- Bob returns to the upper checkpoint.
- Goop returns to the lower checkpoint.

They should **not** be teleported together.

This reinforces that they are solving separate halves of the same room.

---

# 5. Overall Room Dimensions

Room 3 should feel much larger than Room 2.

For an initial greybox, aim approximately for:

- **Width:** 30–34 world units.
- **Depth:** 35–40 world units.
- **Height:** 16–20 world units.

These are conceptual dimensions only.

Use the existing game's movement scale as the authority.

The important proportions are:

- Long enough for several cooperation cycles.
- Tall enough for Bob to have a substantial elevated route.
- Wide enough for Goop to navigate between cover.
- Open enough that the player can often see what the other slime is dealing with.

---

# 6. Overall Room Layout

Conceptually:

```text
                         FAR END / EXIT

             ┌───────────────────────────────┐
             │                               │
             │        FINAL SAFE AREA        │
             │                               │
             │       D1     D2     D3        │
             │          \   |   /            │
             │             D4                │
             │              ↓                │
             │         FINAL EXIT DOOR       │
             │                               │
             │───────────────────────────────│
             │                               │
             │      BOB UPPER PARKOUR        │
             │                               │
             │   hanging drone sections      │
             │   sticky walls                │
             │   lasers                      │
             │   suspended platforms         │
             │                               │
             │                               │
             │ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ │
             │ ☢                         ☢   │
             │ ☢      GOOP LOWER ROUTE  ☢   │
             │ ☢   cover + sightlines   ☢   │
             │ ☢                         ☢   │
             │ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ │
             │                               │
Bob Vent →   │ Upper Start                   │
             │                               │
Goop Door →  │ Lower Start                   │
             └───────────────────────────────┘

                         ROOM 2
```

---

# 7. Entire Main Floor Is Radioactive

Unlike previous rooms, almost the entire main floor should be radioactive.

This is important.

Bob should immediately understand:

> **Falling from the upper route means death.**

Goop should immediately understand:

> **The radioactive floor is my movement space.**

---

## 7.1 Exceptions

There may be a few deliberately safe normal-tile areas:

- Bob's upper structures.
- The final security platform around the four ground drones.
- The final exit threshold.
- Structural ledges where required.

The large lower traversal space remains radioactive.

---

# 8. Radioactive Floor Behaviour

### Bob

If Bob touches the radioactive floor:

- Bob dies.
- Death effect plays.
- Room resets according to the Room 3 checkpoint rules.

### Goop

Goop:

- Is unaffected.
- Can move normally.
- Can remain on the radioactive floor indefinitely.

---

# 9. New Obstacle — Security Drones

Room 3 introduces security drones.

The drones should resemble **fixed automated security turrets**, not roaming enemies.

They do not need navigation or pathfinding.

Their behaviour is intentionally simple and predictable.

---

# 10. Drone Core Behaviour

Each active drone has a default facing direction.

The drone slowly scans left and right through a limited angle.

Example:

```text
                SCAN RANGE

            \       |       /
             \      |      /
              \     |     /
               \    |    /
                [ DRONE ]
                    ↓

              MAIN DIRECTION
```

Recommended scan angle:

- Approximately ±30° to ±45° from its forward direction.

This allows the player to understand:

> **The front is dangerous. The rear is a blind spot.**

---

# 11. Drone State Machine

Keep drone AI deliberately small.

Recommended states:

```text
IDLE / SCANNING
      ↓
TARGET DETECTED
      ↓
ALERTED
      ↓
FIRING
      ↓
TARGET LOST
      ↓
SHORT COOLDOWN
      ↓
SCANNING
```

Roof drones also have:

```text
DISABLED
      ↓
REPLACEMENT TIMER
      ↓
REINSTALLING
      ↓
SCANNING
```

---

# 12. Drone Detection

Each drone has a directional detection cone.

A slime is detected when:

- The slime is within range.
- The slime is inside the scanning cone.
- No wall or valid cover blocks line-of-sight.

The cone should not need to be permanently visible.

Possible visual indicators:

- Small scanning light.
- Thin projected beam.
- Slight cone on the floor.
- Moving red indicator.

The player should still be able to understand where the drone is looking.

---

# 13. Drone Firing

Once a drone identifies a slime:

1. Drone rotates toward the slime.
2. Short warning effect plays.
3. Drone begins firing.

Current target fire rate:

> **One projectile every 0.3 seconds.**

This is intentionally dangerous.

The player should be strongly encouraged to leave line-of-sight rather than absorb damage.

---

# 14. Drone Projectiles

Drone bullets should be visible enough to react to.

Use:

- Bright projectile/tracer.
- Muzzle flash.
- Impact particle.
- Distinct firing sound.

Projectiles should use simple collision.

Do not create expensive ballistic physics.

---

# 15. Slime Damage

A slime can survive approximately:

> **5 drone hits.**

After the fifth damaging hit:

- Slime dies.
- Death effect plays.
- Room resets.

This should be tunable rather than hard-coded throughout the drone system.

Example configuration:

```text
maxDroneHits = 5
```

---

# 16. Damage Recovery

Damage regenerates after the slime has avoided being hit for a short period.

Suggested initial tuning:

- Regeneration delay: approximately 2.5–3 seconds.
- Regeneration then occurs steadily.
- Full recovery takes several seconds.

This allows players to:

> Take damage → reach cover → wait → recover → continue.

---

# 17. Damage Screen Feedback

Avoid cluttering the HUD with a traditional health bar unless later playtesting shows one is needed.

Instead, damage is primarily represented using a **slime-coloured fog/vignette around the edges of the screen**.

---

## 17.1 Example Damage Feedback

### 0 damage

Screen is normal.

### 1 hit

Very faint slime-coloured haze appears around the edges.

### 2 hits

Border becomes more visible.

### 3 hits

Fog thickens and may gently pulse.

### 4 hits

Heavy edge effect and stronger warning feedback.

### 5 hits

Death.

---

## 17.2 Active Slime Colour

The damage vignette should use the active slime's visual identity.

For example:

### Bob

Blue/cyan fog.

### Goop

Yellow-green/acidic fog.

Do not obscure the centre of the screen.

The player still needs good visibility for platforming and aiming.

---

# 18. Goop Cannot Dissolve Drones

This is an important Room 3 rule.

> **Goop's acid projectiles do NOT damage security drones.**

Shooting a drone directly should:

- Produce a harmless acid impact.
- Possibly leave a temporary splash.
- Cause no health reduction.
- Cause no destruction.

This prevents Goop from simply becoming a ranged combat character.

---

# 19. Why Drones Resist Goop

Visually communicate that the drone armour is acid resistant.

Possible material:

- Heavy security metal.
- Ceramic coating.
- Reinforced containment alloy.

The exact fictional explanation is secondary.

The gameplay rule must be clear:

> **Goop dissolves marked soluble environmental materials. Drones themselves are not soluble.**

---

# 20. Two Drone Types in the Room

Room 3 uses the same basic drone logic in two different arrangements.

### Type A — Hanging Roof Drones

These block Bob's upper route.

Goop helps Bob remove them temporarily.

### Type B — Ground Security Drones

Four drones guard the final exit.

Bob helps Goop disable them physically.

---

# 21. Hanging Roof Drones

Use approximately:

> **3 hanging drones**

for the initial layout.

Three gives the room enough cooperation cycles without making the section excessively long.

---

# 22. Hanging Drone Construction

Each hanging drone is suspended upside down from the ceiling.

Structure:

```text
              CEILING
────────────────┬────────────────
                │
                │
          SOLUBLE ROPE
                ↑
         GOOP SHOOTS THIS
                │
                │
            [ DRONE ]
              \ | /
               \|/
            SCAN AREA


         BOB PARKOUR ROUTE
────────────────────────────────
```

The drone body itself is not soluble.

The **rope is soluble**.

---

# 23. Hanging Drone Interaction

Goop must aim at the rope.

If Goop shoots:

### Drone body

Nothing happens.

### Ceiling mount

Nothing happens.

### Rope

The rope dissolves.

The drone falls.

---

# 24. Rope Dissolve Sequence

When Goop hits the rope:

1. Acid projectile strikes rope.
2. Green splash appears.
3. Chemical hiss plays.
4. Rope begins visibly dissolving.
5. Rope weakens.
6. Rope snaps.
7. Drone falls.
8. Drone impacts the floor.
9. Drone becomes disabled.

This should happen quickly enough that switching to Bob immediately afterward is useful.

---

# 25. Falling Roof Drone

The falling drone does not need complex rigid-body simulation.

Use a controlled fall animation.

State:

```text
ACTIVE
   ↓
ROPE_DISSOLVING
   ↓
FALLING
   ↓
DISABLED
```

The drone can:

- Fall downward.
- Tilt slightly.
- Hit the radioactive floor.
- Spark briefly.
- Stop functioning.

---

# 26. Temporary Nature of Roof Drone Removal

Destroying a roof drone does **not** permanently remove it.

Once the drone falls:

> **A 10-second replacement timer begins.**

This is the mechanic that creates timed cooperation.

---

# 27. Replacement Timer

Suggested initial value:

```text
10 seconds
```

This should be exposed as a tuning variable.

Later playtesting may change it to:

- 8 seconds.
- 12 seconds.
- 15 seconds.

Do not bury the value inside animation logic.

---

# 28. Roof Drone Replacement Animation

When replacement begins:

1. Ceiling warning light activates.
2. Small mechanical hatch opens.
3. Replacement drone becomes visible.
4. New rope/cable lowers from mechanism.
5. New drone descends into place.
6. Hatch closes.
7. Drone powers on.
8. Drone resumes scanning.

The full animation should probably take approximately 1.5–2 seconds.

---

# 29. Replacement Telegraph

Bob should not suddenly have a drone appear above him with no warning.

A few seconds before replacement:

- Warning light flashes.
- Mechanical sound begins.
- Optional small beep.

This tells the player:

> **Your safe window is ending.**

---

# 30. Timed Cooperation Loop

The intended interaction is:

```text
BOB reaches blocked section
       ↓
Hanging drone prevents safe movement
       ↓
Switch to GOOP
       ↓
Goop moves to line-of-sight
       ↓
Goop shoots ROPE
       ↓
Drone falls
       ↓
10-second timer starts
       ↓
Switch immediately to BOB
       ↓
Bob crosses dangerous section
       ↓
Drone eventually gets replaced
       ↓
Bob is already past it
```

---

# 31. Goop's Lower Route

Goop's route should be mostly horizontal and tactical.

The challenge is not jumping.

The challenge is:

- Drone sightlines.
- Cover.
- Timing.
- Finding angles on roof-drone ropes.
- Advancing while Bob progresses above.

---

# 32. Cover Layout

Use approximately:

> **6–8 major cover objects**

throughout the lower route.

Examples:

- Broken machinery.
- Cultivation tanks.
- Large crates.
- Industrial consoles.
- Pipe clusters.
- Reinforced pillars.

These should block drone line-of-sight completely.

---

# 33. Cover Height

Cover must actually protect Goop's collider.

Do not rely only on visual geometry.

Test:

```text
Goop behind cover
       ↓
drone raycast
       ↓
cover blocks ray
       ↓
drone loses target
```

---

# 34. Goop Route Concept

Example:

```text
ROOM 2 DOOR
     ↓

    GOOP

      ↓
 [COVER A]

      ↓
 line-of-sight to Rope 1
      ↓
 shoot Rope 1

      ↓
 [COVER B]
      ↓
 [COVER C]

      ↓
 line-of-sight to Rope 2
      ↓
 shoot Rope 2

      ↓
 [COVER D]
      ↓
 [COVER E]

      ↓
 line-of-sight to Rope 3
      ↓
 shoot Rope 3

      ↓
 approach final defended area
```

---

# 35. Bob's Upper Route

Bob's route should feel like an extended parkour challenge built over the radioactive floor.

It should use his existing abilities rather than introducing another new traversal mechanic.

Possible components:

- Normal platforms.
- Sticky wall panels.
- Vertical wall climbs.
- Ceiling/sticky sections.
- Narrow industrial beams.
- Suspended maintenance platforms.
- Jump gaps.
- Lasers.

---

# 36. Important Parkour Implementation Note

> **For the initial implementation, create the parkour layout yourself based on the intended goal and cooperation flow described in this plan. Do not wait for exact final measurements. Build a sensible first-pass route that communicates how Room 3 should work. Uzair will then playtest and tune the parkour layout, distances, platform positions, jump difficulty, laser placement and overall traversal flow afterward.**

The initial implementation should prioritize:

- Clear progression.
- Correct cooperation logic.
- Readable drone sightlines.
- Functional checkpoints.
- Reachable jumps.
- Space for later tuning.

It does **not** need to be the final parkour arrangement on the first implementation pass.

---

# 37. Suggested Bob Parkour Layout

A first-pass route can be divided into four sections.

---

# 38. Bob Section A — Introduction

Bob exits the Room 2 vent onto an elevated safe platform.

This section should be easy.

Purpose:

- Let player orient themselves.
- Show radioactive floor below.
- Show Goop's lower route.
- Introduce the first hanging drone.

Layout:

```text
BOB VENT
   ↓

████████ START PLATFORM
       \
        \
         ███████
               \
                \
                [DRONE 1 BLOCKS ROUTE]
```

---

# 39. Hanging Drone 1

Drone 1 should make it obvious that Bob cannot simply continue safely.

Place it so its scan cone covers the next required platform.

Bob may be able to peek out and retreat.

This teaches:

> **I need Goop to help.**

---

# 40. Goop Rope 1 Position

Goop's first cover route should naturally lead to a position where Rope 1 is visible.

The rope should be:

- Easy to identify.
- Relatively close.
- Forgiving to aim at.

This is the tutorial interaction.

---

# 41. Bob Section B — Sticky Wall + Laser

After Drone 1 is temporarily removed, Bob crosses into the second section.

Suggested layout:

```text
Platform A
    ↓
jump
    ↓
STICKY WALL
████████
█      █
█ LASER█
█      █
████████
    ↓
upper ledge
```

Use one laser obstacle here.

---

# 42. Bob Section C — Suspended Platforms

The third section can be more open.

Suggested:

```text
       [Platform]
            ↓
        jump gap
            ↓
     [Suspended beam]
            ↓
        jump gap
            ↓
       [Platform]
```

Hanging Drone 2 watches this section.

Goop must remove it temporarily.

---

# 43. Goop Rope 2

Rope 2 should require Goop to advance farther through his cover path.

The player therefore cannot disable all three drones from the entrance.

Each cooperation interaction should require both slimes to make progress.

---

# 44. Bob Section D — High Wall / Ceiling Route

After Drone 2:

- Bob reaches a tall sticky wall.
- Climbs upward.
- Crosses a short ceiling/sticky section.
- Encounters another laser.
- Approaches the final upper section.

Hanging Drone 3 blocks the final approach.

---

# 45. Goop Rope 3

Goop must reach the far half of the room.

This should be his most dangerous sightline before the final ground-drone encounter.

He reaches cover with a clear upward firing angle.

Shoots Rope 3.

Drone falls.

Bob has approximately 10 seconds to cross the final exposed parkour section.

---

# 46. Bob's Final Upper Approach

After the third drone is removed, Bob reaches the far side of the room.

The upper route should now begin descending toward the final safe security platform.

Concept:

```text
HIGH ROUTE
     ↓
sticky wall descent
     ↓
small platform
     ↓
jump
     ↓
FINAL SAFE SECURITY PLATFORM
```

---

# 47. Final Safe Security Platform

This area is important because it is one of the few lower surfaces Bob can safely stand on.

It is made from ordinary laboratory flooring rather than radioactive material.

It sits around the exit door.

The four ground drones occupy this area.

---

# 48. Four Ground Drones

There are exactly:

> **4 active ground drones**

guarding the final door.

Use a semicircular defensive arrangement.

---

# 49. Ground Drone Formation

Viewed from Goop's approach:

```text
                     EXIT DOOR
                       █████
                         ↑

               D1                D2
                  \            /
                    \        /
                      \    /

                D3              D4

                     GOOP
                      ↑
               approaches here
```

All four drones are broadly facing toward Goop's side of the room.

---

# 50. Drone Facing

The important detail is that their scan cones face **away from Bob's final approach**.

Bob arrives behind them.

Concept:

```text
                           EXIT

                 \ scan /    \ scan /
                   D1           D2

                 \ scan /    \ scan /
                   D3           D4


                      GOOP
                  FRONT / DANGER


------------------------------------------------

                 BOB ARRIVES HERE
                    BLIND SIDE
```

---

# 51. Ground Drone Acid Immunity

Goop cannot destroy them.

Shooting a ground drone with acid does nothing meaningful.

This should be consistent with all security drones.

---

# 52. Goop's Situation at the Final Area

Goop reaches the final cover position.

From there:

- The exit is visible.
- Four drones block the approach.
- Crossing directly would expose Goop to several firing arcs.
- Goop cannot dissolve the drones.

This creates the reversal:

> **Now Goop needs Bob.**

---

# 53. Bob Reaches Behind the Ground Drones

Bob's upper route should descend specifically onto the rear side of the security platform.

The drones are concentrating on the radioactive approach.

They should not immediately detect Bob behind them.

---

# 54. Drone Blind Spot

Each ground drone has a significant rear blind spot.

Bob can approach from behind.

Concept:

```text
          SCAN CONE
        \     |     /
         \    |    /
          \   |   /
          [ DRONE ]
              ↑
              │
          BLIND SPOT
              │
             BOB
```

---

# 55. Bob Pushes Drones

Bob disables ground drones by physically pushing them from behind.

This should use the existing kinematic collision/movement system rather than introducing a complex interaction key if possible.

Example:

```text
Bob contacts rear of drone
       ↓
continues moving forward
       ↓
push threshold reached
       ↓
drone tips forward
       ↓
drone falls
       ↓
drone disabled
```

---

# 56. Pushing Feedback

When Bob successfully pushes a drone:

- Drone rocks forward.
- Balance fails.
- Metal impact sound plays.
- Drone tips over or falls from the platform.
- Sparks appear.
- Scanning light turns off.

---

# 57. Preferred Ground Drone Defeat

Where possible, position drones near edges so Bob can push them into the radioactive floor.

Example:

```text
BOB → [DRONE] → PLATFORM EDGE

                     ↓

               ☢ RADIOACTIVE ☢
                     ↓

               drone disabled
```

This creates strong visual satisfaction.

---

# 58. Alternative Drone Disable

If a particular drone is not near an edge:

- Bob pushes it over.
- Drone lies on its side.
- Drone becomes inactive.

Do not require Bob to attack it further.

---

# 59. Ground Drones Do Not Respawn

Unlike roof drones:

> **Ground drones are permanently disabled for the current room attempt.**

This is important.

Bob's final contribution should create lasting progress for Goop.

---

# 60. Bob's Four-Drone Challenge

Bob should disable:

- Drone 1.
- Drone 2.
- Drone 3.
- Drone 4.

However, arrange them so this does not become repetitive.

Possible variation:

### Drone 1

Easy rear push.

### Drone 2

Requires waiting for scan direction.

### Drone 3

Near edge; satisfying drop.

### Drone 4

Positioned so Bob must move around some machinery before reaching its blind side.

---

# 61. Optional Chain Reaction

If technically easy, allow one clever interaction:

> Bob can push one drone into another and knock both over.

This should be optional rather than required.

It rewards experimentation without allowing the player to bypass Bob's role.

---

# 62. Ground Drone Alert Behaviour

If Bob accidentally enters a ground drone's scan cone:

- Drone detects Bob.
- Drone begins firing.
- Nearby drones may also become alerted if they already have line-of-sight.

Bob can retreat behind environmental geometry or get back into a blind spot.

---

# 63. Alert Reset

When no slime is visible for a short period:

Suggested:

```text
2–3 seconds
```

The drone:

- Stops firing.
- Rotates back toward its default direction.
- Resumes normal scanning.

Do not implement searching or chasing.

---

# 64. Why No Complex Group Alert AI

The drones should behave like facility security devices.

They do not need:

- Pathfinding.
- Investigating last-known positions.
- Communication networks.
- Pursuit.

Simple state transitions are enough to create the gameplay.

---

# 65. Bob Clears Goop's Path

Once Bob disables the four ground drones:

```text
D1 = disabled
D2 = disabled
D3 = disabled
D4 = disabled
```

The final approach becomes safe.

The player switches to Goop.

Goop leaves his final cover position.

Goop crosses the radioactive floor toward the exit.

---

# 66. Final Door Area

The final door should be positioned at the centre of the far wall.

The safe security platform around it gives Bob space to disable the drones.

Goop can reach it directly from the radioactive floor after the drones are removed.

---

# 67. Room Completion

Room 3 should not complete merely when Bob reaches the final area.

Both characters need to reach the exit region.

Track:

```text
bobAtExit
goopAtExit
```

Once both are true:

```text
Room3Complete = true
```

Then:

- New checkpoint activates.
- Next objective appears.
- Door/transition to Room 4 becomes available.

---

# 68. Suggested Full Parkour and Cooperation Layout

Conceptual side view:

```text
ROOM 2                                                    EXIT

BOB
VENT
 ↓

████ START
    \
     \            DRONE 1
      ████         ↓
          \      [ D ]
           \_______│________________
                   │ soluble rope
                   │

                  STICKY WALL
                  █████████
                  █ LASER █
                  █████████

                           \
                            \
                        SUSPENDED
                         PLATFORM
                              \
                               \
                             DRONE 2
                                ↓
                              [ D ]
                                │

                                  ███████
                                      \
                                       \
                                      HIGH
                                      WALL
                                      ████
                                      █LAS
                                      ████

                                             DRONE 3
                                                ↓
                                              [ D ]
                                                │

                                               FINAL
                                               ROUTE
                                                  \
                                                   \
                                                    ↓

                                          SAFE SECURITY PLATFORM
                                      [D1] [D2] [D3] [D4]

                                                  ↓

                                              EXIT DOOR
```

---

# 69. Lower Goop Layout

Conceptual top-down view:

```text
GOOP START
    ↓

    G

 ┌─────────┐
 │ COVER A │
 └─────────┘
      ↓
      ↓        sightline to Rope 1
      └────────────────────────────→

             ┌──────────┐
             │ COVER B  │
             └──────────┘
                   ↓

                   ┌──────────┐
                   │ COVER C  │
                   └──────────┘
                         ↓
                         ↓ sightline to Rope 2

                                  ┌──────────┐
                                  │ COVER D  │
                                  └──────────┘
                                         ↓

                                  ┌──────────┐
                                  │ COVER E  │
                                  └──────────┘
                                         ↓
                                  sightline to Rope 3

                                         ↓

                                  FINAL COVER

                                         ↓

                               D1   D2   D3   D4

                                      EXIT
```

---

# 70. Full Cooperation Sequence

The expected player experience is:

```text
Bob enters upper vent
Goop enters lower door
        ↓
Both checkpoints activate
        ↓
Player explores Bob's upper route
        ↓
Bob encounters Hanging Drone 1
        ↓
Switch to Goop
        ↓
Goop moves behind Cover A
        ↓
Goop aims upward
        ↓
Shoot Rope 1
        ↓
Drone 1 falls
        ↓
10-second timer begins
        ↓
Switch to Bob
        ↓
Bob quickly crosses Section A
        ↓
Bob navigates sticky wall + laser
        ↓
Bob reaches Hanging Drone 2 section
        ↓
Switch to Goop
        ↓
Goop advances through Cover B/C
        ↓
Shoot Rope 2
        ↓
Switch Bob
        ↓
Bob crosses Section B
        ↓
Bob climbs higher route
        ↓
Bob encounters Hanging Drone 3
        ↓
Switch to Goop
        ↓
Goop advances to Cover D/E
        ↓
Shoot Rope 3
        ↓
Switch Bob
        ↓
Bob crosses final timed section
        ↓
Bob reaches far side
        ↓
Bob descends behind 4 ground drones
        ↓
Bob pushes Drone 1
        ↓
Bob pushes Drone 2
        ↓
Bob pushes Drone 3
        ↓
Bob pushes Drone 4
        ↓
All ground drones disabled
        ↓
Switch to Goop
        ↓
Goop leaves cover
        ↓
Goop safely reaches final platform
        ↓
Both slimes reach exit
        ↓
Room 3 complete
```

---

# 71. Roof Drone Replacement Logic

Each roof drone should independently track:

```text
isActive
isFalling
isDisabled
replacementTimer
isReplacing
```

Sequence:

```text
ACTIVE
  ↓ rope destroyed
FALLING
  ↓
DISABLED
  ↓
WAIT 10 SECONDS
  ↓
REPLACEMENT_WARNING
  ↓
REINSTALLING
  ↓
ACTIVE
```

---

# 72. Roof Drone Reset

If Room 3 resets:

- All original roof drones immediately return.
- Replacement timers are cancelled.
- Replacement animations are cancelled.
- Ropes are restored.
- Drone positions return to authored defaults.

---

# 73. Ground Drone State

Ground drones use:

```text
SCANNING
ALERTED
FIRING
DISABLED
```

Once Bob disables one:

```text
DISABLED
```

remains until room reset.

---

# 74. Room Reset Behaviour

If either slime dies before the room is completed:

### Bob

Returns to upper Room 3 checkpoint.

### Goop

Returns to lower Room 3 checkpoint.

### Roof Drones

All three restored.

### Roof Ropes

All restored.

### Replacement Timers

Cancelled.

### Ground Drones

All four restored upright.

### Cover

Unchanged.

### Lasers

Reset to starting cycle/timing.

### Damage

Both slime damage values reset.

---

# 75. Avoiding Frustrating Full Resets

Because Room 3 is large, playtesting may show that a total reset is too punishing.

If necessary, introduce a **mid-room checkpoint** after Bob and Goop both pass the second cooperation section.

Do not add this immediately unless playtesting shows the room is frustrating.

Initial implementation can use the two entrance checkpoints.

---

# 76. Laser Placement

Use approximately:

> **2–3 laser challenges**

on Bob's route.

Do not overload the room.

The drones are already the new main threat.

Lasers should complement the platforming rather than compete with the cooperation mechanic.

---

# 77. Recommended Laser Roles

### Laser 1

Static or slowly sweeping across a sticky wall.

### Laser 2

Timed beam across a platform jump.

### Laser 3

Optional final laser near the third drone section.

Avoid placing laser timing and drone timing on the exact same jump unless later testing proves it fair.

---

# 78. Camera Considerations for Bob

Bob's upper route has large drops.

The camera must:

- Clearly show the next platform.
- Avoid clipping into ceiling geometry.
- Allow looking downward toward Goop.
- Allow Bob to understand drone firing angles.

Do not place traversal geometry so close to walls that the third-person camera becomes unusable.

---

# 79. Camera Considerations for Goop

Goop frequently aims upward.

Ensure:

- Ceiling drones are within comfortable camera pitch.
- Ropes can be targeted without looking directly vertically upward.
- Cover does not block the camera.
- Nearby machinery does not cause severe camera collision.

---

# 80. Cross-Layer Visibility

One of the room's strongest visual features should be that Bob and Goop can often see each other.

Examples:

Bob looks down:

> sees Goop moving between cover.

Goop looks up:

> sees Bob waiting near the next drone section.

This visually communicates cooperation even though the slimes are physically separated.

---

# 81. Audio Design

## Room Ambience

- Security machinery.
- Electrical hum.
- Radioactive bubbling.
- Large ventilation fans.
- Alarm ambience.

---

## Drone Scanning

- Soft servo movement.
- Low scanning beep.

---

## Drone Detection

- Distinct alert tone.
- Indicator changes.
- Servo snaps toward player.

---

## Drone Fire

- Fast but readable pulse sound.
- Avoid deafening overlapping audio from four drones.

Use sound limiting if several fire simultaneously.

---

## Rope Dissolve

- Acid impact.
- Chemical hiss.
- Rope strain.
- Snap.

---

## Falling Drone

- Falling mechanical sound.
- Heavy impact.
- Sparks.

---

## Drone Replacement

- Warning beep.
- Ceiling hatch motor.
- Cable movement.
- Power-up tone.

---

## Bob Push

- Drone wobble.
- Metal scrape.
- Impact.
- Electrical shutdown.

---

# 82. Environmental Theme

Room 3 should feel like a **security-controlled cultivation chamber / containment checkpoint**.

Possible environmental elements:

- Security warning signs.
- Camera units.
- Reinforced walls.
- Broken cultivation tanks.
- Radioactive runoff.
- Hanging maintenance platforms.
- Ceiling rails.
- Security drone docking stations.
- Industrial pipes.
- Thick support beams.
- Damaged lighting.
- Emergency red lighting.

---

# 83. Visual Language for Soluble Ropes

The roof-drone ropes should clearly communicate that Goop can dissolve them.

Use the same visual language established by previous soluble objects.

For example:

- Organic fibre.
- Marked soluble coating.
- Yellow-green corrosion symbol.
- Slight worn appearance.

Do not make normal non-soluble cables look identical.

---

# 84. Ground Drone Readability

Ground drones need a very clear front and rear.

The player must immediately understand their blind spot.

Possible design:

### Front

- Large red scanning eye.
- Weapon barrel.
- Bright directional light.

### Rear

- Darker casing.
- Exposed mechanical panel.
- No weapon.
- No scanning light.

This makes the push mechanic understandable without text.

---

# 85. Initial Tutorial for Drones

On first encounter, minimal tutorial text may appear:

> **Security drones scan in front of themselves. Stay out of sight.**

When controlling Goop near Rope 1:

> **Goop cannot dissolve drones. Target their supporting rope.**

When Bob reaches the final ground drones:

> **Approach drones from behind to knock them over.**

After these prompts, do not repeatedly explain the mechanic.

---

# 86. Greybox Build Order

## Phase 1 — Room Shell

Build:

- Large chamber.
- Main radioactive floor.
- Bob upper entrance.
- Goop lower entrance.
- Final exit platform.

---

# 87. Phase 2 — Bob's First-Pass Parkour

Create a rough complete route from:

```text
Bob Vent
   ↓
Section A
   ↓
Section B
   ↓
Section C
   ↓
Final Security Platform
```

Use primitive cubes and sticky panels.

Again:

> **Create a sensible first-pass parkour layout yourself to communicate the intended goal. Uzair will tune the route afterward.**

---

# 88. Phase 3 — Goop Cover Route

Place simple cover cubes throughout the radioactive floor.

Ensure Goop can move:

```text
Start → Cover A → Cover B → Cover C → Cover D → Final Cover
```

---

# 89. Phase 4 — Basic Drone Prototype

Build one drone first.

Implement:

- Limited scan rotation.
- Detection cone.
- Line-of-sight.
- Fire state.
- Projectile.
- Target-loss reset.

Do not place seven drones before one works correctly.

---

# 90. Phase 5 — Damage System

Implement:

- 5-hit death threshold.
- Damage recovery.
- Screen-edge vignette.
- Death/reset.

Test with one drone.

---

# 91. Phase 6 — Roof Drone Prototype

Take the functioning drone and:

- Mount upside-down.
- Add rope.
- Mark rope soluble.
- Disable direct acid damage to drone.
- Implement fall.
- Implement 10-second replacement.

Verify the complete cycle repeatedly.

---

# 92. Phase 7 — Build Three Roof Drone Encounters

Place:

- Roof Drone 1.
- Roof Drone 2.
- Roof Drone 3.

Each should correspond to one major Bob parkour section.

---

# 93. Phase 8 — Validate Cooperation Timing

For each roof drone:

1. Control Goop.
2. Shoot rope.
3. Immediately switch Bob.
4. Traverse section.
5. Measure remaining time.

Aim for a reasonable player to have several seconds of spare time.

Do not tune around perfect execution.

---

# 94. Phase 9 — Ground Drone Push Prototype

Create one ground drone.

Test Bob approaching from behind.

Implement:

```text
rear push
   ↓
drone tips
   ↓
disabled
```

Verify direct Goop acid does nothing.

---

# 95. Phase 10 — Place Four Final Drones

Arrange the four drones in a semicircle.

Test:

- Their scan cones.
- Goop approach.
- Bob rear approach.
- Push paths.
- No accidental unavoidable crossfire.

---

# 96. Phase 11 — Add Lasers

Only after the complete cooperation flow works.

Place 2–3 lasers on Bob's route.

---

# 97. Phase 12 — Reset Testing

Test resets while:

- Drone 1 disabled.
- Drone 2 replacement is occurring.
- Bob is halfway across route.
- Goop is under fire.
- Two ground drones are disabled.
- Bob is behind the final drones.
- Goop has reached final cover.

Everything must return correctly.

---

# 98. Phase 13 — Art Pass

Replace greyboxes with:

- Security structures.
- Industrial beams.
- Maintenance platforms.
- Drone models.
- Rope geometry.
- Cover machinery.
- Radioactive materials.
- Facility walls.

---

# 99. Phase 14 — Polish

Add:

- Drone scan effects.
- Muzzle flashes.
- Damage vignette.
- Rope dissolve effects.
- Replacement animation.
- Sparks.
- Sound.
- Lighting.
- Warning signs.
- Camera shake where appropriate.

---

# 100. Performance Considerations

Keep the drones lightweight.

Room 3 should not require expensive AI.

Each drone only needs:

- Small state machine.
- Limited rotation.
- Periodic line-of-sight check.
- Simple projectile logic.

Reuse:

- Geometry.
- Materials.
- Projectile meshes.
- Effects where possible.

Do not allocate new geometry/materials every shot.

---

# 101. Projectile Pooling

Because drones can fire every 0.3 seconds, use a projectile pool if the existing architecture supports it.

Do not continuously allocate/destroy projectile meshes.

Example:

```text
Inactive projectile
       ↓
requested
       ↓
activate
       ↓
move
       ↓
impact / timeout
       ↓
return to pool
```

---

# 102. Drone Fire Rate Tuning

The specified initial fire rate is:

> **0.3 seconds between shots.**

Treat this as a tuning value.

If playtesting makes the four-drone final area overwhelming, change:

- Accuracy.
- Detection delay.
- Projectile speed.
- Fire interval.

Do not immediately increase player health to compensate for unfair drone behaviour.

---

# 103. Recommended Detection Delay

Give a short reaction window after detection.

For example:

```text
detect player
     ↓
0.3–0.5 second warning
     ↓
begin firing
```

The player should understand why they were hit.

---

# 104. Main Failure Conditions

Bob can fail by:

- Falling into radioactive floor.
- Being hit by lasers.
- Taking five drone hits.

Goop can fail by:

- Taking five drone hits.

---

# 105. Room Success Conditions

Room 3 succeeds when:

1. Bob reaches the far security platform.
2. Bob disables all four ground drones.
3. Goop reaches the final exit area.
4. Bob also reaches the exit.
5. Both slime exit flags are true.

---

# 106. Main Cooperation Summary

## Goop Helps Bob

```text
Goop navigates radioactive lower area
         ↓
finds sightline on hanging drone rope
         ↓
shoots rope
         ↓
drone falls
         ↓
Bob gets temporary safe window
```

---

## Bob Helps Goop

```text
Bob completes upper parkour
        ↓
arrives behind ground drones
        ↓
uses blind spots
        ↓
pushes all four drones over
        ↓
Goop's final route becomes safe
```

---

# 107. Final Room Design Statement

Room 3 should communicate:

> **Cooperation is no longer just about changing geometry. The player must now coordinate both slimes under time pressure and use each slime's position and abilities to protect the other.**

Goop cannot fight the drones directly.

Bob cannot survive the floor.

Goop therefore:

> **controls Bob's temporary opportunities.**

Bob eventually:

> **removes Goop's permanent obstacle.**

The full room therefore creates the cooperation loop:

> **Goop clears the way for Bob → Bob advances → Goop clears the next threat → Bob reaches the far side → Bob disables Goop's drones → Goop reaches the exit.**

That reciprocal dependency should be the defining identity of Level 2 — Room 3.