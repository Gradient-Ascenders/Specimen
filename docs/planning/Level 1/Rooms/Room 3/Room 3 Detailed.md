# Slimebound — Room 3: Hazard Traversal Chamber

## 1. High-Level Purpose

Room 3 is the **first true challenge room of Level 1**.

Rooms 1 and 2 were primarily tutorial spaces.

Room 1 taught:

> **Sticky surfaces can be climbed.**

Room 2 taught:

> **Tack can charge and perform large bounces.**

Room 2 also introduced:

> **Bounce → catch sticky wall → climb.**

Room 3 now asks:

> **Can the player use those mechanics accurately while avoiding lethal hazards?**

The mechanical progression is therefore:

```text
ROOM 1
Learn adhesion
      ↓
ROOM 2
Learn charged bounce
      ↓
ROOM 2 END
Combine bounce + adhesion
      ↓
ROOM 3
Use both under pressure
      +
avoid lasers
```

Room 3 should feel like the moment where the game says:

> “You know how Tack moves. Now prove it.”

---

# 2. Room Identity

Room 3 should be a **large vertical laboratory testing chamber**.

It should still belong visually to Level 1's clean containment wing, but compared with Rooms 1 and 2 it should feel:

- larger;
- more intimidating;
- more industrial;
- less safe;
- more security-focused;
- more vertical;
- more mechanically complex.

Room 1 felt like a specimen chamber.

Room 2 felt like a mobility test chamber.

Room 3 should feel like:

> **A high-security traversal / specimen testing chamber that was never intended to be crossed freely.**

The room remains relatively empty so that the gameplay geometry is readable.

Do not fill it with excessive machinery.

The important visual elements are:

1. the large room volume;
2. platforms;
3. sticky wall sections;
4. lasers;
5. the final ceiling vent.

---

# 3. Primary Gameplay Goals

By completing Room 3, the player should demonstrate that they can:

- charge a jump intentionally;
- estimate jump distance;
- control horizontal momentum;
- land on elevated platforms;
- identify sticky surfaces quickly;
- jump toward a sticky surface;
- attach to it while airborne;
- climb while maintaining spatial orientation;
- avoid lethal laser beams;
- recover mentally after failure;
- repeat a sequence with increasing consistency;
- move through a genuinely three-dimensional space.

The brief specifically rewards gameplay that meaningfully uses all three dimensions rather than functioning as a 2D platformer inside a 3D renderer. Room 3 should therefore involve significant changes in **X, Y, and Z**, not merely a straight upward stack of platforms.

---

# 4. Difficulty Philosophy

Room 3 is harder than the previous rooms.

However:

> **Hard does not mean unclear.**

The player should usually understand:

- where they need to go;
- what killed them;
- what movement they failed;
- how they could improve.

Avoid difficulty caused by:

- hidden lasers;
- unclear platform edges;
- camera fighting;
- ambiguous sticky surfaces;
- unpredictable moving geometry;
- tiny landing surfaces;
- excessively long repetition.

The intended difficulty comes from:

> **executing known mechanics accurately.**

---

# 5. Failure Model

Laser contact should cause an immediate failure.

Mechanically:

```text
Laser contact
      ↓
Immediate fail state
      ↓
short visual/audio feedback
      ↓
fade / dissolve / zap
      ↓
respawn
      ↓
Room 3 start checkpoint
```

Do not build:

- health;
- damage values;
- armour;
- invulnerability frames;
- multiple-hit systems.

A laser is binary:

```text
NOT TOUCHING
=
SAFE
```

```text
TOUCHING
=
FAIL
```

This keeps the mechanic extremely understandable.

---

# 6. Target Restart Time

Failure should feel punishing, but restarting should be fast.

Target:

```text
Laser hit
→ player can move again

approximately 1–2 seconds
```

Do not use:

- long death animation;
- loading screen;
- cutscene;
- dialogue;
- lengthy fade.

The punishment is:

> **You lost your progress through the room.**

It should not also waste the player's time.

---

# 7. Reference Direction

Use the following as inspiration references.

Do not directly copy any specific level.

---

## Portal / Portal 2 — Test Chamber Readability

Useful for:

- huge clean puzzle chambers;
- suspended platforms;
- strong negative space;
- observation architecture;
- clear separation between gameplay geometry and decoration;
- hazard readability.

Reference concepts:

```text
Portal 2 vertical test chamber
Portal 2 laser puzzle room
Portal clean test chamber platforms
```

The important principle:

> The room can be visually impressive while still making the intended path obvious.

---

## Mirror's Edge — Traversal Language

Useful for:

- visually guiding the player;
- making traversal surfaces readable;
- framing the next destination;
- combining architecture and movement.

Reference concepts:

```text
Mirror's Edge vertical traversal
Mirror's Edge environmental navigation
Mirror's Edge platforming level design
```

Slimebound should use its own visual language:

```text
yellow-green
=
sticky
```

rather than copying Mirror's Edge's colours.

---

## Half-Life / Black Mesa — Industrial Research Space

Useful for:

- security equipment;
- laboratory infrastructure;
- maintenance platforms;
- wall-mounted emitters;
- ventilation systems.

Reference concepts:

```text
Black Mesa test chamber
Black Mesa laser laboratory
Half Life research facility industrial chamber
```

Again, Room 3 should remain brighter and cleaner than a typical Half-Life environment.

---

# 8. Recommended Room Scale

Assume:

```text
1 Three.js unit ≈ 1 metre
```

Recommended internal dimensions:

```text
Width:  34 m
Depth:  28 m
Height: 24 m
```

Approximate bounds:

```text
X: -17 → +17
Y:   0 → +24
Z: -14 → +14
```

Room 3 should be noticeably larger than Room 2.

Suggested comparison:

```text
ROOM 1
14 × 12 × 8

ROOM 2
30 × 22 × 18

ROOM 3
34 × 28 × 24
```

This gives Level 1 a sense of increasing scale.

---

# 9. Coordinate Convention

Use:

```text
+Y = Up

+Z = direction deeper into the chamber

+X = left/right across the chamber
```

Conceptual top view:

```text
                        +Z
                         ↑

                   FINAL VENT
                         │
                         │
        -X ←─────────────┼─────────────→ +X
                         │
                         │
                         │
                     ENTRANCE
                        -Z
```

---

# 10. Entry From Room 2

Unlike Room 2's dramatic vent entrance, Room 3 begins through a normal **already-open laboratory doorway**.

The Room 2 upper walkway should connect naturally to this doorway.

Sequence:

```text
ROOM 2
Upper walkway
      ↓
Open door
      ↓
Short threshold
      ↓
ROOM 3
```

No loading interruption should be visible to the player if possible.

---

# 11. First View of Room 3

The doorway should frame the chamber dramatically.

When the player enters, they should see:

- a huge open chamber;
- platforms rising through the space;
- at least one yellow-green sticky wall section;
- red lasers;
- a distant vent high near the ceiling;
- perhaps an observation/control room above.

The visual statement should be:

> “I need to climb through all of that.”

---

# 12. Entrance Framing

Recommended:

```text
PLAYER
  ↓

┌──────────── OPEN DOOR ──────────────┐
│                                     │
│       platform      platform        │
│            \         /              │
│             \       /               │
│                LASER                │
│                                     │
│                       sticky wall   │
│                         █████       │
│                         █████       │
│                                     │
│                              VENT   │
│                                ▣    │
└─────────────────────────────────────┘
```

The player should get a partial preview of the challenge before committing.

---

# 13. Room 3 Checkpoint

The checkpoint should activate as soon as Tack crosses through the Room 3 entrance.

Suggested checkpoint position:

```text
X = 0
Y = slime spawn height
Z = -12
```

On every laser failure:

Return to this position.

Reset:

- velocity;
- jump charge;
- adhesion;
- camera orientation;
- any temporary animation states.

Do not reset Rooms 1 or 2.

---

# 14. Safe Starting Platform

The entrance should lead onto a large safe floor/platform.

Recommended:

```text
Width:  8–10 m
Depth:  7–8 m
```

This gives the player space to:

- inspect the room;
- rotate the camera;
- identify lasers;
- understand the route.

There should be **no laser immediately at the spawn position**.

Do not kill the player before they have visually processed the new mechanic.

---

# 15. Room 3 Zone Structure

Divide Room 3 into six major gameplay zones.

```text
ZONE 1
Hazard introduction

ZONE 2
Laser + jump

ZONE 3
Bounce into sticky wall

ZONE 4
Wall traversal with lasers

ZONE 5
Precision platform ascent

ZONE 6
Final climb to ceiling vent
```

Difficulty should increase gradually.

---

# 16. High-Level Side Layout

```text
Y = 24m
┌─────────────────────────────────────────────────────┐
│                                      FINAL VENT ▣   │
│                                          ▲          │
│                                    ZONE 6           │
│                                  sticky climb       │
│                                      ███            │
│                                      ███            │
│                         ┌────────────┴───┐          │
│                         │ FINAL PLATFORM │          │
│                         └────────────────┘          │
│                                  ▲                  │
│                             ZONE 5                  │
│                           platforming               │
│                      ┌─────────┐                    │
│                      │         │      ┌────────┐    │
│                 ─────┴─────────┴──────┴────────     │
│                     LASERS                          │
│                                                    │
│              ███████                               │
│              █STICKY█ ← ZONE 4                     │
│              █ WALL █                               │
│              ███████                               │
│                  ▲                                  │
│                  │ bounce                           │
│            ┌─────┴──────┐                          │
│            │ PLATFORM B │ ← ZONE 3                 │
│            └────────────┘                           │
│                  ▲                                  │
│                 laser                               │
│                  ▲                                  │
│            ┌────────────┐                           │
│            │ PLATFORM A │ ← ZONE 2                 │
│            └────────────┘                           │
│                  ▲                                  │
│             FIRST LASER                             │
│                  ▲                                  │
│                                                    │
│           ZONE 1 / SAFE ENTRANCE                   │
│────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────┘
Y = 0m
```

---

# 17. High-Level Top-Down Layout

Do not make the path entirely straight.

The player should move laterally across the chamber.

```text
                           +Z
                            ↑

┌────────────────────────────────────────────────────┐
│                                      FINAL VENT    │
│                                          ▣         │
│                                         ███        │
│                                  sticky ███        │
│                                                    │
│                     ┌──────────────┐               │
│                     │ FINAL PLAT.  │               │
│                     └──────────────┘               │
│                              ▲                     │
│                           jump                     │
│                              │                     │
│         ┌────────────┐       │                     │
│         │ PLATFORM D │───────┘                     │
│         └────────────┘                             │
│                ▲                                   │
│               laser                                │
│                ▲                                   │
│                      ███████                       │
│                      █STICKY█                      │
│                      █ WALL █                      │
│                      ███████                       │
│                         ▲                          │
│                         │                          │
│                ┌────────┴──────┐                   │
│                │  PLATFORM C   │                   │
│                └───────────────┘                   │
│                         ▲                          │
│                         │ gap                      │
│       ┌─────────────────┴───┐                      │
│       │    PLATFORM B       │                      │
│       └─────────────────────┘                      │
│                    ▲                               │
│                 LASER                              │
│                    ▲                               │
│              ┌──────────┐                          │
│              │PLATFORM A│                          │
│              └──────────┘                          │
│                    ▲                               │
│              FIRST LASER                           │
│                    ▲                               │
│              SAFE ENTRANCE                        │
└────────────────────────────────────────────────────┘
```

---

# 18. Laser Visual Language

Lasers must be impossible to confuse with decoration.

Use:

```text
bright red beam
+
emissive glow
+
wall-mounted emitter
+
wall-mounted receiver
```

Concept:

```text
[EMITTER] ========================= [RECEIVER]
                  RED
                 LASER
```

Laser colour direction:

```text
core:
very bright red / near-white red

outer glow:
deep red
```

Do not rely solely on bloom.

The actual beam geometry must remain visible even if post-processing is disabled.

---

# 19. Laser Emitters

Every beam should clearly originate from equipment.

Recommended emitter design:

```text
┌───────────┐
│  ● RED    │==== LASER
└───────────┘
```

Possible appearance:

- dark metal housing;
- circular red emitter lens;
- warning stripes;
- small status indicator.

Do not make lasers appear magically in mid-air.

---

# 20. Laser Beam Geometry

For greybox:

Use:

```text
thin cylinder
or
narrow box
```

with emissive red material.

Collision should use a **simple invisible trigger volume** slightly wider than the visible beam.

Example:

```text
VISIBLE LASER
5 cm width

COLLISION TRIGGER
10–15 cm width
```

This avoids cases where Tack visually touches a beam but does not trigger it.

Do not make the collider dramatically larger than the visual.

Fairness matters.

---

# 21. Laser Activation

For Room 3:

**Keep lasers permanently active.**

Do not introduce:

- timers;
- switches;
- pulsing lasers;
- laser deactivation;
- moving emitters.

The player has enough to learn already.

Later rooms can complicate the hazard.

Room 3 teaches:

> Red beam = never touch.

---

# 22. Laser Contact Feedback

On contact:

### Immediate Visual

Brief bright red/white flash on Tack.

Possible shader state:

```text
uStateColour → bright red/white
```

for approximately:

```text
100–200 ms
```

---

### Audio

Short:

```text
ZAP
```

or electrical discharge.

---

### Character

Possible brief:

- compression;
- dissolve;
- pop;
- electrical flicker.

Keep animation under:

```text
0.5 seconds
```

---

### Camera

Do not violently shake.

Use perhaps:

```text
100 ms
```

small impulse.

Then immediately transition to respawn.

---

# 23. Zone 1 — Laser Introduction

## Purpose

Teach:

> Lasers are lethal.

The first laser should be incredibly easy to understand and avoid.

Do not introduce it during a difficult jump.

---

# 24. First Laser Layout

After leaving the safe entrance area, the player approaches a short gap or walkway.

Place one horizontal laser across the obvious direct path.

Example:

```text
SIDE VIEW

          laser
     =================

PLAYER  ●

──────────────────────────── floor
```

But leave obvious space to jump over it.

Recommended laser height:

```text
0.7–1.0 m
```

above the walking surface.

This encourages:

```text
small/medium bounce
```

rather than requiring maximum charge.

---

# 25. First Laser Teaching

The player's thought process should be:

```text
“That is obviously dangerous.”
        ↓
“I probably jump over it.”
        ↓
Charge
        ↓
Jump
        ↓
Safe landing
```

If they intentionally touch it:

They immediately learn:

```text
laser = reset
```

---

# 26. First Laser Safety

Do not combine the first laser with:

- tiny landing platform;
- sticky wall;
- large gap;
- camera rotation.

Teach one thing:

> avoid red beam.

---

# 27. Platform A

After the first laser:

Create a medium elevated platform.

Suggested:

```text
Position:
X = -5
Y = 2.5
Z = -5
```

Dimensions:

```text
6 m × 5 m
```

Reachable with a normal charged jump.

---

# 28. Zone 2 — Laser + Gap Jump

Now increase difficulty.

The player must cross from Platform A to Platform B.

Between them:

- open air;
- one laser crossing the ideal jump trajectory.

The player must choose an appropriate jump arc.

---

# 29. Platform B

Suggested:

```text
Position:
X = +2
Y = 4.5
Z = 0
```

Dimensions:

```text
5.5 m × 5.5 m
```

Horizontal separation from Platform A:

```text
5–7 m
```

---

# 30. Laser Placement Between A and B

Do not put the beam directly through the centre of every possible trajectory.

Instead, create a readable obstacle.

For example:

```text
SIDE VIEW

                  PLATFORM B
                ┌─────────────┐
                │             │
                └─────────────┘
                       ▲
                     /
                   /
          =======     ← LASER
               /
             /
     ┌─────────────┐
     │ PLATFORM A  │
     └─────────────┘
```

The player should understand they need to either:

- jump higher than the beam;
- or adjust the approach.

Prefer **jump higher** for this first combination.

---

# 31. Beam Height

Suggested relative to jump arc:

```text
laser:
approximately 2–2.5 m above the gap's lower reference
```

A weak jump hits it.

A deliberate charged jump clears it.

This reinforces charge strength.

---

# 32. Failure Consequence

If the player misses Platform B but avoids the laser:

They can either:

### Option A — Fall Reset

Falling below the room returns them to spawn.

or:

### Option B — Lower Recovery Floor

They land on the room's lower floor and can return.

For Room 3, I recommend:

> **Falling into the main lower hazard void also resets the room.**

This establishes harsher punishment.

However, use the same reset system as lasers rather than adding another death mechanic.

---

# 33. Hazard Floor Boundary

If the room has a visible floor far below:

It does not necessarily need to physically kill Tack.

Instead define:

```text
FAIL_Y_THRESHOLD
```

For example:

```text
Y < -2
```

or a trigger volume near the bottom.

On entry:

```text
reset Room 3
```

This keeps implementation straightforward.

---

# 34. Zone 3 — Bounce Toward Sticky Wall

Platform B should now face an existing perimeter wall.

Like Room 2:

**The sticky surface is NOT freestanding.**

It is a contaminated section of the room's normal wall.

---

# 35. Sticky Wall Architecture

Create the wall normally:

```text
WHITE LAB WALL
████████████████████████████████
████████████████████████████████
██████████┌───────────┐█████████
██████████│ STICKY    │█████████
██████████│ PATCH     │█████████
██████████│           │█████████
██████████└───────────┘█████████
████████████████████████████████
```

Only the contaminated region is tagged:

```text
STICKY
```

---

# 36. Room 3 Sticky Patch Difficulty

Unlike Room 2, the sticky area can be narrower.

Recommended:

```text
Width:
3–4 m

Height:
5–6 m
```

This requires more accurate targeting.

Do not make it tiny.

The player should fail because they mistimed or misdirected the jump, not because the catch surface is unfair.

---

# 37. Sticky Patch Position

Suggested:

```text
wall at X = +17
```

or another perimeter wall.

Bottom edge:

```text
Y ≈ 5 m
```

Top:

```text
Y ≈ 11 m
```

Platform B:

```text
4–6 m away
```

from the wall.

---

# 38. Bounce-to-Wall Challenge

Expected action:

```text
Platform B
      ↓
aim at sticky wall
      ↓
charge
      ↓
launch
      ↓
cross open space
      ↓
attach to sticky patch
```

This is mechanically familiar from Room 2.

The new challenge is what comes next.

---

# 39. Zone 4 — Laser Wall Traversal

Now introduce lasers while the player is attached to the wall.

This is a major escalation.

The player must climb around laser beams mounted across parts of the sticky route.

---

# 40. Important Laser Rule on Walls

Do not place lasers so close together that the player needs frame-perfect movement.

Give clear safe regions.

Example:

```text
FRONT VIEW OF WALL

┌──────────────────────────────────────┐
│ WHITE WALL                           │
│                                      │
│         █████████                    │
│         █ STICK █                    │
│         █      █                     │
│ ========█======█========== LASER 2   │
│         █      █                     │
│         █      █                     │
│         ████████                     │
│                ===== LASER 1         │
│                                      │
└──────────────────────────────────────┘
```

However, avoid literally running a laser through an unavoidable sticky route.

There must be a safe movement path around it.

---

# 41. Better Wall Layout

Use an irregular contaminated shape.

Example:

```text
                HIGH LEDGE
                     ▲

              █████████
              █████████
                   ███
                   ███
  LASER 2  =================
                   ███
             █████████
             █████
             █████      ========= LASER 1
             █████
                ▲
                │
           entry catch
```

The player must:

1. climb;
2. move sideways;
3. continue upward.

This tests wall traversal more deeply than Room 1.

---

# 42. Laser 1 — Wall Route

Place the first wall laser horizontally or vertically near the lower section.

The player should be able to move around its endpoint by traversing sideways.

Example:

```text
EMITTER =================== RECEIVER
               ^
               |
     sticky route goes around
```

Do not require jumping away from the wall yet.

---

# 43. Laser 2 — Upper Wall Route

The second beam can force the player to change direction.

Possible path:

```text
UP
 ↑
 ███████
 █
 █   ========= LASER
 █
 █████
     █
     █
```

The player climbs:

```text
up
→ sideways
→ up
```

---

# 44. Camera on Laser Wall

This section depends heavily on camera readability.

Requirements:

- laser beam remains visible while attached;
- camera does not clip through wall;
- player can look above them;
- player can see safe contaminated tiles;
- orientation transitions remain smooth.

Do not place gameplay-critical laser beams directly behind the camera.

---

# 45. Wall Exit Ledge

At the top of the contaminated path:

Create a structural ledge.

Recommended:

```text
Y ≈ 12–13 m
```

Dimensions:

```text
6 m × 4 m
```

The player climbs onto it.

This provides:

- a moment of safety;
- a camera reset;
- a visual preview of the next challenge.

---

# 46. Mid-Room Rest Point

Although death still returns the player to the start, provide a short **physical rest platform** halfway through.

This does NOT activate a checkpoint.

Purpose:

- allow camera readjustment;
- allow player to inspect remaining route;
- reduce constant mechanical intensity.

Think:

```text
safe platform
=
mental pause
```

not:

```text
checkpoint
```

---

# 47. Zone 5 — Precision Platform Ascent

After leaving the wall, the player enters the most demanding platforming sequence.

This should use:

- 3–4 platforms;
- varying heights;
- lateral movement;
- 1–2 lasers.

Do not make it excessively long.

---

# 48. Platform C

Suggested:

```text
X = +7
Y = 13
Z = +5
```

Dimensions:

```text
5 × 5 m
```

This can be the wall-exit platform.

---

# 49. Platform D

Suggested:

```text
X = 0
Y = 15.5
Z = +8
```

Dimensions:

```text
4.5 × 4.5 m
```

Jump:

```text
medium charged bounce
```

---

# 50. Platform E

Suggested:

```text
X = -6
Y = 18
Z = +9
```

Dimensions:

```text
4 × 4 m
```

This is a smaller target.

Still large enough to remain fair.

---

# 51. Platform F / Final Platform

Suggested:

```text
X = -1
Y = 20
Z = +11
```

Dimensions:

```text
5 × 4 m
```

This prepares the final vent climb.

---

# 52. Laser Between C and D

Place a horizontal laser below the ideal apex.

The player must charge enough to clear it.

This reinforces a previously learned solution.

---

# 53. Laser Between D and E

Change the problem slightly.

Instead of:

```text
jump over
```

make the player:

```text
jump beside / around
```

For example, position a vertical beam between two ceiling/floor emitter units.

```text
        VERTICAL LASER
             ||
             ||
             ||
      jump → || → adjust
             ||
             ||
```

The player needs horizontal steering.

---

# 54. Avoid Excessive Mid-Air Steering

If Tack has strong air control:

Be careful.

Do not design every laser around last-second steering.

The route should mostly reward:

- choosing direction before launch;
- choosing charge amount;
- making small corrections.

This keeps movement readable.

---

# 55. Platform Edge Visuals

Every important platform should have clear edges.

Use:

- dark metal sides;
- slightly lighter platform tops;
- thin safety stripe;
- edge lights if necessary.

Do not make platform edges blend into the background wall.

---

# 56. Platform Architecture

Avoid platforms that look like arbitrary floating cubes.

Make them appear to be:

- maintenance platforms;
- test platforms;
- structural shelves;
- suspended equipment decks;
- observation access.

Add:

- supports;
- rails where they do not obstruct gameplay;
- wall brackets;
- suspended metal frames.

Gameplay collision can remain simple boxes.

---

# 57. Zone 6 — Final Vent Ascent

The final objective is an **open ceiling ventilation shaft**.

This visually echoes Room 1.

That repetition is useful:

Room 1:

> vent = escape route.

Room 3:

> vent = reward after mastering the room.

---

# 58. Final Vent Position

Recommended:

```text
X ≈ 0
Y ≈ 22.5
Z ≈ +13
```

Near one upper wall/ceiling junction.

Avoid placing it literally in the centre of a flat ceiling if that makes entry awkward.

Better:

```text
high wall
+
ceiling junction
```

---

# 59. Final Sticky Strip

The final vent should be reached via one last sticky section.

This sticky section should again be:

> part of the existing wall.

Not:

- floating;
- detached;
- separate climbing object.

---

# 60. Final Sticky Strip Dimensions

Suggested:

```text
Width:
2.5–3.5 m

Height:
4–5 m
```

Narrower than previous tutorial surfaces.

The player already understands the mechanic.

---

# 61. Final Challenge Sequence

From Platform F:

```text
Platform F
      ↓
charge bounce
      ↓
cross final gap
      ↓
catch sticky wall
      ↓
climb
      ↓
avoid final laser
      ↓
reach vent
      ↓
enter duct
```

This combines nearly everything Room 3 has tested.

---

# 62. Final Laser

Place one laser near the top.

Do NOT put it immediately beside the vent opening in a way that causes cheap deaths after the player has effectively completed the room.

Better:

```text
sticky wall
     ↓
navigate around beam
     ↓
short safe climb
     ↓
vent
```

Give the player a small safe stretch after overcoming the last hazard.

---

# 63. Vent Entrance

Recommended opening:

```text
Width:
2 m

Height:
1.3–1.5 m
```

Make it clearly open.

No vent-breaking puzzle.

---

# 64. Vent Visual Reward

The vent can have:

- green maintenance light;
- brighter illumination;
- airflow particles;
- visible duct interior.

After a room dominated by red lasers, a subtle green/white exit cue will feel rewarding.

---

# 65. Complete Intended Route

```text
ROOM 2 EXIT
      ↓
OPEN DOOR
      ↓
ROOM 3 CHECKPOINT
      ↓
SAFE START AREA
      ↓
FIRST LASER
      ↓
JUMP OVER LASER
      ↓
PLATFORM A
      ↓
CHARGED GAP JUMP
      ↓
CLEAR LASER
      ↓
PLATFORM B
      ↓
CHARGED BOUNCE
      ↓
CATCH STICKY WALL
      ↓
CLIMB
      ↓
NAVIGATE AROUND WALL LASER 1
      ↓
CLIMB SIDEWAYS
      ↓
NAVIGATE WALL LASER 2
      ↓
HIGH LEDGE
      ↓
PLATFORM C
      ↓
JUMP + LASER
      ↓
PLATFORM D
      ↓
LATERAL JUMP AROUND LASER
      ↓
PLATFORM E
      ↓
PLATFORM F
      ↓
FINAL BOUNCE
      ↓
CATCH FINAL STICKY WALL
      ↓
AVOID FINAL LASER
      ↓
CLIMB
      ↓
CEILING VENT
```

---

# 66. Simplified Difficulty Graph

```text
DIFFICULTY

HIGH │                                      ●
     │                                ●   ●
     │                         ●   ●
     │                  ●   ●
     │            ●   ●
     │       ●
LOW  │  ●
     └──────────────────────────────────────────
        intro laser
             gap
                  wall
                       wall lasers
                              platforms
                                      final
```

The room should increase steadily.

---

# 67. Intended Emotional Progression

### Enter Room

> “That is much bigger.”

### See Lasers

> “Those look dangerous.”

### First Laser

> “Okay, avoid red.”

### First Death

> “Right. Instant reset.”

### Gap Laser

> “Now I need to actually control my jump.”

### Sticky Wall

> “I know this.”

### Wall Lasers

> “Oh, now I have to climb carefully.”

### Upper Platforms

> “I need to put everything together.”

### Final Vent

> “I made it.”

---

# 68. Suggested Environmental Story

Room 3 can imply that the facility used this space to evaluate specimen mobility and containment.

Possible elements:

- test chamber number;
- observation windows;
- inactive tracking cameras;
- security laser infrastructure;
- movement measurement markings;
- suspended test platforms;
- abandoned operator booth.

The environment might communicate:

> The researchers were testing whether specimens could escape complex containment environments.

Ironically:

Tack is now using that infrastructure to actually escape.

---

# 69. Observation Room

Place a larger observation room high on one wall.

Suggested dimensions:

```text
Width:
8–10 m

Height:
3 m
```

Behind glass:

- dead monitors;
- overturned chair;
- inactive control panels;
- empty workspace.

No humans.

---

# 70. Security Cameras

Optional visual props:

Small wall-mounted cameras can follow fixed directions.

Do not implement AI tracking.

They are decorative.

This adds to the feeling that the chamber was designed to observe test subjects.

---

# 71. Room Numbering

Possible environmental markings:

```text
MOBILITY TEST CHAMBER 03
```

or simply:

```text
TEST 03
```

Large wall numbering can also help establish scale.

---

# 72. Floor

The bottom of the room can be visible far below the player.

Use:

- white/grey panels;
- maintenance grates;
- drainage;
- large test markings.

Do not encourage players to explore it if falling resets them.

Possible lower boundary:

```text
red warning stripe
```

to imply dangerous test equipment.

---

# 73. Wall Materials

Continue Level 1 palette.

Normal wall:

```text
off-white laboratory tiles
```

Metal:

```text
dark cool grey
```

Sticky:

```text
yellow-green contamination
```

Laser:

```text
strong red
```

This gives Room 3 a very readable colour hierarchy.

---

# 74. Colour Hierarchy

The player should quickly interpret:

```text
WHITE / GREY
=
environment
```

```text
YELLOW-GREEN
=
movement opportunity
```

```text
RED
=
danger
```

```text
GREEN / BRIGHT WHITE
=
exit / progress
```

This is strong visual design because colour carries gameplay meaning.

---

# 75. Suggested Palette

Approximate direction:

```text
WALL
#DDE2E3

SECONDARY PANEL
#AFB8BC

METAL
#3E474C

DARK METAL
#242B2F

STICKY
#9EAE36

STICKY DARK
#56621E

LASER
bright red

LASER HOUSING
#33383B

EXIT INDICATOR
soft green
```

---

# 76. Lighting

Room 3 remains part of the clinical Level 1 look.

Do not suddenly make it dark.

Use:

### Ceiling Illumination

Strong white laboratory lighting.

### Platform Lighting

Enough light to see edges.

### Laser Glow

Red illumination should subtly affect nearby surfaces.

### Observation Room

Slightly darker.

### Exit

Subtle green/white emphasis.

---

# 77. Lighting Contrast

Compared with Room 2:

Room 3 can have slightly more contrast.

For example:

```text
Room 2:
very evenly illuminated

Room 3:
bright primary route
+
slightly darker recesses
+
strong red hazard accents
```

But never obscure gameplay.

---

# 78. Laser Lighting

Do not add an expensive dynamic light for every laser.

Instead:

Use:

- emissive material;
- bloom if available;
- perhaps one or two strategically placed red lights.

The brief warns that browser performance and shadows need to be handled deliberately, so avoid dozens of unnecessary dynamic light sources.

---

# 79. Laser Audio

Lasers should emit a subtle continuous electrical sound.

Something like:

```text
high-frequency hum
```

The volume can increase slightly as Tack approaches.

Do not make every laser extremely loud.

---

# 80. Laser Death Audio

On contact:

```text
electrical ZAP
+
short slime impact/pop
```

Distinct enough that failure feels responsive.

---

# 81. Ambient Audio

Room 3 should sound larger than Room 2.

Use:

- ventilation;
- distant machinery;
- electrical hum;
- occasional mechanical creak;
- larger room resonance.

Subtle reverb can help if technically feasible.

---

# 82. Music

If Level 1 has background music:

Room 3 can introduce slightly more tension.

Do not completely change soundtrack style.

Possible approach:

```text
Room 1:
very minimal

Room 2:
slight rhythm

Room 3:
additional pulse / tension layer
```

This communicates escalation.

---

# 83. Camera Requirements

Room 3 is the room most likely to expose camera problems.

Test:

- jumping upward;
- jumping laterally;
- falling;
- wall attachment;
- moving sideways on walls;
- approaching ceiling;
- landing near platform edges.

The camera must remain readable throughout.

---

# 84. Camera During Big Jumps

The camera should:

- smoothly follow vertical movement;
- retain the target platform in view;
- avoid excessive spring lag;
- not overshoot dramatically after landing.

A beautiful camera is useless if the player cannot judge where they will land.

---

# 85. Camera During Wall Traversal

The camera should clearly show:

- Tack;
- nearby laser;
- sticky route;
- next safe area.

If necessary, slightly widen camera distance while attached to large walls.

Do not automatically rotate so aggressively that lasers move unexpectedly across the screen.

---

# 86. Camera Collision

Room 3 contains:

- walls;
- platforms;
- beams;
- upper architecture.

Therefore test camera collision carefully.

Common failure:

```text
Tack attaches to wall
      ↓
camera moves inside geometry
      ↓
player cannot see laser
      ↓
instant death
```

That would feel unfair.

---

# 87. Laser Collision Implementation

Each laser should have:

```text
LaserVisual
+
LaserTrigger
```

Example hierarchy:

```text
LaserHazard
├── emitterMesh
├── receiverMesh
├── beamMesh
└── triggerVolume
```

`triggerVolume` handles gameplay.

`beamMesh` handles appearance.

---

# 88. Hazard Interface

Conceptually:

```text
onPlayerEnterLaser():
    failCurrentRoom()
```

Do not place laser-specific respawn logic inside every beam.

Centralise it.

For example:

```text
Hazard
      ↓
CheckpointSystem
      ↓
restore Room 3
```

This makes later hazards easier to add.

---

# 89. Reset Requirements

When Room 3 resets:

- Tack returns to room entrance;
- velocity = zero;
- charged jump = zero;
- attached = false;
- surface normal returns to default;
- camera returns behind Tack;
- lasers remain active;
- room geometry remains unchanged.

Reset should be deterministic.

---

# 90. Death Visual Without Health System

If you want the word "death" in player-facing design:

That's fine.

But technically keep it simple.

For example:

```text
enum PlayerState {
  Active,
  Failing,
  Respawning
}
```

No:

```text
health = 100
```

needed.

---

# 91. Falling Fail State

If Tack falls below valid gameplay space:

Use exactly the same failure pipeline as a laser.

```text
fall
 ↓
fail
 ↓
respawn
```

Consistency helps both implementation and player understanding.

---

# 92. Greybox Priority

Do **not** art this room immediately.

First greybox:

- room shell;
- platforms;
- sticky sections;
- lasers;
- checkpoint;
- vent.

Test with primitive colours.

---

# 93. Greybox Colours

Recommended debug scheme:

```text
WHITE / GREY
normal environment

YELLOW-GREEN
sticky

RED
laser

BLUE
spawn

GREEN
exit

ORANGE
temporary intended landing targets
```

Remove orange debug guides from production.

---

# 94. Greybox Laser

Initially:

```text
red BoxGeometry
```

is completely acceptable.

Do not spend time building animated laser effects before the gameplay works.

---

# 95. Recommended Construction Order

Build Room 3 in this exact order.

---

## Phase 1 — Shell

1. Create floor/lower boundary.
2. Create four perimeter walls.
3. Create ceiling.
4. Set dimensions.
5. Verify collision.

---

## Phase 2 — Spawn and Exit

6. Add Room 2 entrance door.
7. Add Room 3 spawn/checkpoint.
8. Add final ceiling vent.
9. Make vent visually identifiable.

This immediately establishes:

```text
START
and
GOAL
```

---

## Phase 3 — Main Platforms

10. Create Platform A.
11. Create Platform B.
12. Create sticky wall location.
13. Create high wall ledge.
14. Create Platform C.
15. Create Platform D.
16. Create Platform E.
17. Create Platform F.

No lasers yet.

---

## Phase 4 — Pure Traversal Test

18. Play through entire room without hazards.
19. Tune jump distances.
20. Tune platform heights.
21. Tune sticky catch areas.
22. Test camera.
23. Verify route uses X, Y, and Z.

Do not add hazards until basic traversal feels good.

---

## Phase 5 — First Laser

24. Add laser emitter.
25. Add visual beam.
26. Add trigger.
27. Connect to fail/reset.
28. Test immediate respawn.

---

## Phase 6 — Gap Laser

29. Add Platform A → B laser.
30. Tune beam height.
31. Ensure a deliberate charged jump clears it.
32. Ensure weak jumps fail predictably.

---

## Phase 7 — Sticky Wall Lasers

33. Add contaminated wall shape.
34. Add Laser 1.
35. Create safe route around it.
36. Add Laser 2.
37. Create second safe route.
38. Test wall camera extensively.

---

## Phase 8 — Upper Platform Lasers

39. Add laser between C/D.
40. Add lateral laser between D/E.
41. Test jumps.
42. Remove any unfair placement.

---

## Phase 9 — Final Section

43. Add final sticky wall.
44. Add final laser.
45. Connect to ceiling vent.
46. Test complete room.

---

## Phase 10 — Repetition Test

47. Intentionally die at every hazard.
48. Verify respawn.
49. Verify no state corruption.
50. Verify camera reset.
51. Complete room three times consecutively.

Only after this:

Add art.

---

# 96. Art Pass

After greybox approval:

52. Replace walls with modular lab panels.
53. Add structural supports.
54. Add platform brackets.
55. Add laser emitter models.
56. Add corrosion material.
57. Add observation room.
58. Add ceiling infrastructure.
59. Add signage.
60. Add floor detail.
61. Add lights.
62. Add particles.
63. Add audio.

---

# 97. Laser Visual Polish

Once functional:

Add subtle:

- beam glow;
- emitter pulse;
- particles near emitter;
- red reflection on nearby surfaces.

Do not use expensive volumetrics if unnecessary.

---

# 98. Sticky Wall Polish

Sticky surfaces should show:

- tile pattern underneath;
- yellow-green contamination;
- wet gloss;
- dark seams;
- subtle dripping;
- damaged pipe or chemical source.

Reuse the established Room 1 and Room 2 language.

---

# 99. Platform Polish

Platforms should feel integrated into the facility.

Possible structure:

```text
PLATFORM TOP
══════════════
   ╲      ╱
    ╲    ╱
     ╲  ╱
      WALL
```

or suspended:

```text
CEILING
   │
   │ supports
   │
════════════
 PLATFORM
```

Avoid unsupported floating blocks in the final art pass.

---

# 100. Environmental Foreshadowing

Near the Room 3 exit, you can begin subtly showing more facility degradation.

For example:

- flickering light;
- damaged ceiling panel;
- broken pipe;
- increased corrosion.

This hints that Tack is moving away from the clean containment zone.

Do not completely change the environment yet.

---

# 101. Optional Ceiling Window

One visually strong feature could be a large high observation window.

From the upper platforms, the player finally reaches roughly the same height as it.

This helps communicate vertical progress.

At the beginning:

```text
window far above player
```

Near the end:

```text
player approximately level with window
```

This is useful spatial storytelling.

---

# 102. Route Readability From Spawn

From the Room 3 entrance, the player should ideally identify:

### Immediate

First laser.

### Mid-distance

Platform A/B.

### High

Sticky contamination.

### Very high

Final vent.

They do not need to understand the whole route.

But they should understand:

> Go upward.

---

# 103. Route Readability From Each Platform

From every major safe platform:

The next intended destination should be visible.

Avoid requiring the player to:

- jump blindly around corners;
- guess;
- rotate 180° with no visual cue.

Use lighting and architecture to guide them.

---

# 104. Laser Readability Rule

Every laser that can kill the player during a jump must be visible **before the player commits to the jump**.

This is non-negotiable.

Bad:

```text
jump
 ↓
camera clears wall
 ↓
surprise laser
 ↓
death
```

Good:

```text
see laser
 ↓
plan
 ↓
jump
 ↓
execution determines outcome
```

---

# 105. Sticky Readability Rule

Every required sticky surface should be identifiable before the player needs it.

Do not hide sticky material until Tack is already airborne.

The player should plan:

> “I am jumping there.”

---

# 106. Landing Readability Rule

Platforms should be large enough that the player can judge their top surface.

Avoid paper-thin targets.

Recommended minimum tutorial-to-intermediate platform:

```text
4 × 4 m
```

Late Room 3 can shrink slightly.

Do not go below approximately:

```text
3 × 3 m
```

unless playtesting proves it feels excellent.

---

# 107. Punishment Length

Because death returns to the start:

Keep the room itself reasonably short.

Experienced completion target:

```text
1.5–2 minutes
```

First-time completion:

```text
4–8 minutes
```

depending on deaths.

Do not build a 10-minute gauntlet with full reset.

That becomes frustrating rather than challenging.

---

# 108. Maximum Repetition Rule

The first 20–30 seconds of Room 3 should become easy for the player quickly.

After several deaths, they should be able to move through the early section almost automatically.

This makes full-room reset less irritating.

---

# 109. Possible Later Checkpoint

If playtesting shows full reset is too frustrating:

The first concession should be:

> Add ONE midpoint checkpoint after the sticky wall section.

Do not immediately weaken the lasers.

However, the initial design should use:

```text
one checkpoint
=
Room 3 start
```

because that is the harsher punishment you want.

---

# 110. What Room 3 Should NOT Introduce

Do not add:

- moving platforms;
- pressure plates;
- switches;
- dissolve;
- other slimes;
- Etch;
- Volt;
- timed doors;
- enemies;
- moving laser grids;
- complicated puzzle logic;
- bounce pads;
- health;
- collectibles required for progression.

Room 3 already introduces:

> **LETHAL HAZARDS.**

That is enough.

---

# 111. Mechanical Scope

Room 3 should only use:

```text
MOVE
+
CAMERA
+
CHARGE BOUNCE
+
STICK
+
CLIMB
+
LASER AVOIDANCE
```

The depth comes from combining them well.

Not from adding more systems.

---

# 112. Overall Room Side Diagram

```text
Y = 24m

┌──────────────────────────────────────────────────────┐
│                                         VENT ▣       │
│                                          ▲           │
│                                      ██████          │
│                                      █STICK          │
│                                      █WALL           │
│                             LASER ===█               │
│                                      █               │
│                                      ▲               │
│                             ┌────────┴───────┐       │
│                             │  PLATFORM F    │       │
│                             └────────────────┘       │
│                                      ▲               │
│                 ┌──────────┐         │               │
│                 │ PLATFORM E│────────┘               │
│                 └──────────┘                         │
│                      ▲                               │
│                 LASER│                               │
│                      ▲                               │
│           ┌──────────────┐                           │
│           │ PLATFORM D   │                           │
│           └──────────────┘                           │
│                      ▲                               │
│                      │                               │
│           ┌──────────┴────┐                          │
│           │ HIGH LEDGE    │                          │
│           └───────────────┘                          │
│                  ▲                                   │
│             █████████                                │
│             █ STICK █                                │
│       ======█=======█===== LASER                      │
│             █       █                                │
│             █████████                                │
│                  ▲                                   │
│                bounce                                │
│                  │                                   │
│         ┌────────┴─────┐                             │
│         │ PLATFORM B   │                             │
│         └──────────────┘                             │
│                 ▲                                    │
│              LASER                                   │
│                 ▲                                    │
│         ┌──────────────┐                             │
│         │ PLATFORM A   │                             │
│         └──────────────┘                             │
│                 ▲                                    │
│          FIRST LASER                                 │
│                 ▲                                    │
│        SAFE START / CHECKPOINT                       │
│──────────────────────────────────────────────────────│
└──────────────────────────────────────────────────────┘

Y = 0m
```

---

# 113. Overall Room Top-Down Diagram

```text
                              +Z
                               ↑

┌─────────────────────────────────────────────────────┐
│                                         VENT ▣      │
│                                            █        │
│                                        STICKY       │
│                                          WALL       │
│                                                     │
│                             ┌──────────────┐        │
│                             │ PLATFORM F   │        │
│                             └──────────────┘        │
│                                      ▲              │
│                                      │              │
│           ┌─────────────┐            │              │
│           │ PLATFORM E  │────────────┘              │
│           └─────────────┘                           │
│                   ▲                                 │
│                   │                                 │
│                   │ LASER                           │
│                   │                                 │
│             ┌──────────────┐                        │
│             │ PLATFORM D   │                        │
│             └──────────────┘                        │
│                          ▲                          │
│                          │                          │
│                         ██████                      │
│                         █STICK                      │
│                         █WALL                       │
│                         ██████                      │
│                          ▲                          │
│                          │ bounce                   │
│                          │                          │
│              ┌───────────┴────┐                     │
│              │  PLATFORM B    │                     │
│              └────────────────┘                     │
│                       ▲                             │
│                    LASER                            │
│                       ▲                             │
│         ┌─────────────┴───┐                         │
│         │   PLATFORM A    │                         │
│         └─────────────────┘                         │
│                    ▲                                │
│               FIRST LASER                           │
│                    ▲                                │
│                 ENTRANCE                            │
└─────────────────────────────────────────────────────┘
```

---

# 114. Player Skill Progression

Room 3 should test skills in this exact order:

```text
1. Recognise laser
       ↓
2. Jump over laser
       ↓
3. Charge enough to clear laser
       ↓
4. Aim bounce toward wall
       ↓
5. Catch sticky wall
       ↓
6. Navigate wall around laser
       ↓
7. Perform precise platform jumps
       ↓
8. Navigate laser while airborne
       ↓
9. Bounce into final wall
       ↓
10. Climb around final hazard
       ↓
11. Reach vent
```

Every challenge builds on something already established.

---

# 115. Room 3 Completion Condition

The room is complete when Tack enters the final ventilation shaft.

Trigger:

```text
Room3ExitTrigger
```

On enter:

- disable Room 3 fail boundary as appropriate;
- update checkpoint;
- begin next transition.

No button is required.

---

# 116. Acceptance Criteria — Core Layout

Room 3 is structurally complete when:

- [ ] Room 3 is significantly larger than Rooms 1 and 2.
- [ ] Player enters through an open door from Room 2.
- [ ] Room 3 has its own checkpoint at the entrance.
- [ ] The main objective is an elevated vent near the ceiling.
- [ ] The vent is visible or strongly implied from early in the room.
- [ ] The room contains a clear upward traversal route.
- [ ] Traversal uses meaningful horizontal, vertical, and depth movement.
- [ ] Platforms are integrated into laboratory architecture.
- [ ] Required sticky surfaces are embedded into normal perimeter walls.
- [ ] Sticky surfaces are not freestanding climbing walls.

---

# 117. Acceptance Criteria — Lasers

- [ ] Room 3 introduces lasers for the first time.
- [ ] Lasers are visually bright red.
- [ ] Every beam has visible emitter hardware.
- [ ] Laser contact immediately fails the current attempt.
- [ ] There is no health system.
- [ ] Failure respawns Tack at the Room 3 entrance.
- [ ] Respawn takes approximately 1–2 seconds.
- [ ] Laser collision closely matches visible beam geometry.
- [ ] No required laser is hidden before the player commits to movement.
- [ ] The first laser is simple and isolated.
- [ ] Later lasers combine with jumping.
- [ ] At least one laser interacts with wall traversal.
- [ ] Laser placement is deterministic.
- [ ] Lasers do not randomly activate/deactivate.

---

# 118. Acceptance Criteria — Movement

- [ ] First challenge can be solved with a straightforward bounce.
- [ ] Player later performs a charged gap jump.
- [ ] Player performs at least one bounce-to-wall catch.
- [ ] Player performs lateral movement while attached to a wall.
- [ ] Player climbs around at least one laser.
- [ ] Upper section requires controlled platform jumps.
- [ ] Final section combines bounce, adhesion, and hazard avoidance.
- [ ] No required jump depends on pixel-perfect precision.
- [ ] Every required landing surface is readable before jumping.
- [ ] Camera supports all intended movement comfortably.

---

# 119. Acceptance Criteria — Failure

- [ ] Laser failure resets only Room 3.
- [ ] Falling out of valid traversal space uses the same fail/reset system.
- [ ] Reset clears velocity.
- [ ] Reset clears jump charge.
- [ ] Reset clears wall attachment.
- [ ] Reset restores camera orientation.
- [ ] Lasers remain in their normal active state.
- [ ] Player cannot respawn inside a laser.
- [ ] Player cannot enter a failure loop.
- [ ] No page refresh is required.

---

# 120. Acceptance Criteria — Visual Language

- [ ] White/grey means ordinary laboratory architecture.
- [ ] Yellow-green corrosion means sticky/climbable.
- [ ] Bright red means lethal laser hazard.
- [ ] Exit uses a clearly different progress cue such as green/white light.
- [ ] Sticky visual language exactly matches Rooms 1 and 2.
- [ ] Lasers cannot be mistaken for decorative lighting.
- [ ] Platforms stand out enough to judge jump targets.
- [ ] Environment remains relatively uncluttered.
- [ ] Room still visually belongs to Level 1's clinical laboratory setting.

---

# 121. Acceptance Criteria — Difficulty

- [ ] Room 3 is noticeably harder than Room 2.
- [ ] First laser teaches hazard behaviour safely.
- [ ] Difficulty rises gradually.
- [ ] New challenges combine previously taught mechanics.
- [ ] Death feels caused by player error rather than surprise.
- [ ] Early challenges become quick to repeat after learning them.
- [ ] An experienced player can complete the room in roughly 1.5–2 minutes.
- [ ] Full-room reset does not create excessive repetition.
- [ ] External playtesting does not reveal major frustration points.

---

# 122. Recommended Playtest Questions

When testing Room 3, do not immediately ask testers what they think.

Watch them first.

Record:

### At Entrance

Do they understand they need to go upward?

### First Laser

Do they recognise it as dangerous?

### After First Death

Do they understand why they died?

### Platform A → B

Do they understand how to clear the laser?

### Sticky Wall

Do they recognise the intended catch surface?

### Wall Lasers

Can they see the safe route?

### Upper Platforms

Can they judge the landing surfaces?

### Final Section

Do they know the vent is the goal?

---

# 123. Warning Signs During Playtesting

If testers repeatedly say:

> “Where do I go?”

Improve route framing.

If they say:

> “I didn't see that laser.”

Fix hazard visibility.

If they say:

> “I hit it even though I wasn't touching it.”

Fix collision volume.

If they say:

> “The camera killed me.”

Fix camera behaviour before adjusting level difficulty.

If they say:

> “I know what to do, but doing the first minute again is annoying.”

Consider one midpoint checkpoint.

If they say:

> “I didn't know that wall was sticky.”

Fix surface visual language.

---

# 124. Final Design Rule

For every obstacle in Room 3, ask:

> **“Does this test something the player already understands, or does it secretly introduce another mechanic?”**

If it introduces a new mechanic:

Remove it.

The only genuinely new rule in Room 3 should be:

> **RED LASER = IMMEDIATE FAILURE.**

Everything else should be an increasingly demanding application of:

> **Bounce + Stick + Climb.**

---

# 125. Final Room Progression Summary

```text
ROOM 1
“I can climb.”

        ↓

ROOM 2
“I can bounce.”

        ↓

ROOM 2 END
“I can bounce into a climb.”

        ↓

ROOM 3 ENTRY
“Those lasers look dangerous.”

        ↓

FIRST FAILURE
“Touching red resets me.”

        ↓

MID ROOM
“I need to control my movement now.”

        ↓

WALL SECTION
“I have to climb AND avoid hazards.”

        ↓

UPPER PLATFORMS
“I need to put everything together.”

        ↓

FINAL STICKY WALL
“One last precise combination.”

        ↓

CEILING VENT
“I've mastered Tack's basic movement.”
```

# Final Room Identity

**Room 3 is a large vertical laboratory hazard chamber that serves as Tack's first real movement exam: the player must combine charged bouncing and wall adhesion while navigating lethal red laser beams, with failure resetting the entire room.**

It should feel like the point where the game transitions from:

> **“Here is what you can do.”**

to:

> **“Show me that you can do it.”**