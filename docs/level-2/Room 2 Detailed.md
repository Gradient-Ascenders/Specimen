# Level 2 — Room 2 Detailed Design and Layout Plan

## 1. Room Purpose

**Level:** Level 2  
**Room:** Room 2  
**Primary objective:** Get **Bob** and **Goop** into Room 3 through their separate exits.

Room 2 should build directly on the cooperation established in Room 1.

Room 1 teaches:

> **Goop changes the environment so Bob can progress.**

Room 2 expands this into a two-way dependency:

> **Bob must first help Goop progress, then Goop must help Bob progress.**

The intended relationship is:

```text
BOB
 │
 │ climbs to and holds the door button
 ▼
GOOP
 │
 │ crosses radioactive floor
 │ destroys 3 wooden braces
 ▼
BOB
 │
 │ uses the 3 released blocks
 ▼
ROOM 3
```

The room should feel noticeably more vertical than Room 1 and should require the player to make deliberate use of:

- Bob's sticky-wall traversal.
- Bob's ability to remain attached to a surface.
- Laser avoidance.
- Goop's radioactive immunity.
- Goop's acid projectile.
- Slime switching.
- Environmental manipulation.
- Two different exits into the following room.

---

# 2. Core Room Concept

Room 2 is a large industrial cultivation/laboratory chamber.

The main floor is mostly unusable for Bob because it contains a large radioactive pool.

The far wall contains:

1. A large vertically moving blast door in the **centre**.
2. An open ventilation shaft in the **upper-right corner**.

These exits serve different slimes:

- **Goop → centre blast door.**
- **Bob → upper-right vent.**

The left wall contains Bob's sticky-wall route.

Bob must climb this wall, navigate laser obstacles, and eventually reach a large wall-mounted button.

Bob must physically remain stuck to the button.

While Bob remains on it:

> **The centre blast door remains open.**

The player then switches to Goop.

Goop crosses the radioactive floor, shoots **three wooden support braces**, and releases three suspended blocks.

Those three blocks settle into predetermined heights and create an ascending parkour route toward Bob's upper-right ventilation exit.

Goop then goes through the blast door into Room 3.

The player switches back to Bob.

Bob leaves the button, causing the blast door to close behind Goop.

Bob then uses the newly positioned blocks to reach his vent.

---

# 3. Recommended Room Dimensions

Exact dimensions should ultimately be tuned against the repository's existing player scale and Bob's current jump distances.

For the initial greybox, use approximately:

- **Width:** 24 world units.
- **Depth:** 20 world units.
- **Height:** 12 world units.

Coordinate convention for this plan:

```text
X = left/right
Y = vertical
Z = entrance → far wall
```

Therefore:

```text
LEFT WALL                         RIGHT WALL
X = -12                            X = +12

ENTRANCE                           FAR WALL
Z = 0                              Z = 20

FLOOR                              CEILING
Y = 0                              Y = 12
```

If the existing levels use a different world scale, preserve the game's established scale and use the proportions in this plan rather than these numbers literally.

---

# 4. Top-Down Layout

The general room footprint should look approximately like this:

```text
                         FAR WALL / NORTH
                              Z = 20

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                             GOOP DOOR               BOB VENT │
│                           ┌───────────┐                 ↑     │
│                           │           │              upper    │
│                           │   DOOR    │              right    │
│                           │           │                       │
│                           └───────────┘                       │
│                                                              │
│                BLOCK 2               BLOCK 3                  │
│                                                              │
│                                                              │
│ LEFT WALL       ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢                  │
│ STICKY          ☢                                  ☢          │
│ ROUTE           ☢      RADIOACTIVE FLOOR           ☢          │
│                 ☢                                  ☢          │
│                 ☢              GOOP ROUTE          ☢          │
│       BLOCK 1   ☢                                  ☢          │
│                 ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢                  │
│                                                              │
│                                                              │
│                 SAFE STARTING AREA                           │
│                     BOB + GOOP                               │
│                          ↑                                   │
│                      ROOM 1 DOOR                             │
└──────────────────────────────────────────────────────────────┘

                         ENTRANCE / SOUTH
                               Z = 0
```

---

# 5. Side / Elevation Layout

The room's vertical structure is extremely important.

From the entrance looking toward the far wall:

```text
Y = 12  ─────────────────────── CEILING ─────────────────────────

              Brace 1        Brace 2         Brace 3
                 X              X               X
                 │              │               │
                rope           rope            rope
                 │              │               │
               [B1]           [B2]            [B3]
             STARTING SUSPENDED POSITIONS


Y = 9                                                    ┌───────┐
                                                         │ VENT  │
                                                         │  BOB  │
                                                         └───▲───┘
                                                             │

Y = 7                                     [BLOCK 3 FINAL] ────┘
                                           ▲
                                           │ jump

Y = 6      [BUTTON]            [BLOCK 2 FINAL]
              ●                     ▲
              ▲                     │
              │                     │ jump

Y = 5          \          [BLOCK 1 FINAL]
                \                ▲
                 \               │
                  \              │

Y = 3      STICKY WALL
             ROUTE
          ← LASERS →

Y = 0  ───────────────── FLOOR / RADIOACTIVE AREA ──────────────

                                           ┌────────────┐
                                           │ GOOP DOOR  │
                                           └────────────┘
```

The three released blocks should create an **ascending diagonal route** from Bob's button area toward the upper-right vent.

They should not simply fall onto the floor.

---

# 6. Critical Difference From Room 1's Falling Platforms

Room 1 has Goop destroy ropes so platforms fall into the radioactive floor.

Room 2 should visually and mechanically differ.

In Room 2:

> **Goop destroys the wooden brace that holds a block in its raised storage position.**

The block itself remains attached to a strong rope.

When the brace is destroyed:

1. The retaining support fails.
2. The block drops.
3. The rope unspools or becomes taut.
4. The rope stops the block at a predetermined height.
5. The block remains hanging in that position.
6. Bob can use the upper surface for parkour.

Concept:

```text
BEFORE

                 CEILING
────────────────────┬────────────────
              [WOOD BRACE]
                    ↑
             GOOP SHOOTS THIS

                    │
                    │
                  rope
                    │
               ┌─────────┐
               │  BLOCK  │
               └─────────┘
                    high


AFTER

                 CEILING
────────────────────┬────────────────
                 destroyed
                   brace
                    x
                    │
                    │
                    │
                    │ rope extended
                    │
               ┌─────────┐
               │  BLOCK  │ ← final parkour position
               └─────────┘
```

This is important because the blocks need to remain elevated so Bob can climb toward the high vent.

---

# 7. Entrance Area

## 7.1 Room 1 Connection

Room 2 begins immediately after Bob completes Room 1.

The Room 1 exit doorway leads into the southern side of Room 2.

Both Bob and Goop should begin on the same safe entrance platform.

Recommended entrance position:

```text
X = 0
Y = approximately 1
Z = 1.5–2
```

Provide enough space for:

- Both slime bodies.
- Camera rotation.
- Slime switching.
- Observation of the room.

---

# 8. Initial Camera Read

The room should communicate its structure before the player moves far.

From the entrance, the player should be able to identify:

- Radioactive floor.
- Closed centre door.
- Upper-right vent.
- At least part of the sticky left wall.
- Suspended blocks above the room.

The button does not necessarily need to be immediately obvious.

The player should first understand:

> "There are two exits, but neither slime can simply walk to them."

---

# 9. Safe Entrance Platform

Recommended safe area:

```text
X = -10 to +10
Z = 0 to approximately 4
Y = floor level
```

This creates a roughly 4-unit-deep safe staging area before the radioactive pool begins.

Do not begin the radioactive hazard immediately underneath the Room 1 doorway.

---

# 10. Radioactive Floor Layout

The radioactive area occupies most of the central floor.

Recommended approximate extent:

```text
X = -9.5 to +9.5
Z = 4 to 18
```

The far wall may have a narrow safe strip immediately in front of Goop's door.

The radioactive area should therefore visually dominate the room.

---

# 11. Bob Must Not Be Able to Bypass the Hazard

Check carefully during greyboxing that Bob cannot:

- Jump from entrance directly to the far side.
- Charge-jump over the whole pool.
- Use the right wall to bypass the puzzle.
- Stick to environmental decoration not intended to be sticky.
- Climb underneath ceiling geometry directly to the vent.
- Jump directly from the button to the vent.
- Reach Block 2 or Block 3 before Goop releases them.

Only specifically tagged sticky geometry should support Bob's adhesion.

---

# 12. Goop's Main Floor Route

Goop's route should be relatively simple horizontally.

The floor puzzle is not meant to challenge Goop's movement.

His challenge is:

- Recognising where to go.
- Locating the three braces.
- Aiming his acid projectile.
- Reaching the open blast door before Bob leaves the button.

Suggested route:

```text
START
  │
  ▼
ENTER ACID
  │
  ├──── shoot Brace 1
  │
  ▼
MOVE TOWARD CENTRE
  │
  ├──── shoot Brace 2
  │
  ▼
MOVE TOWARD FAR SIDE
  │
  ├──── shoot Brace 3
  │
  ▼
ENTER OPEN BLAST DOOR
```

---

# 13. Sticky Left Wall

The **entire left wall should not be sticky**.

Instead, create deliberately placed marked sticky panels.

This gives the player a route rather than allowing unrestricted climbing.

The left wall approximately occupies:

```text
X = -12
Z = 2 to 16
Y = 0 to 9
```

The climb should begin near the entrance.

---

# 14. Sticky Tile Route Layout

A possible tile progression:

### Sticky Section A — Introduction

Position:

```text
Z ≈ 3.5–6
Y ≈ 1–3.5
```

Purpose:

- Easy attachment from the starting platform.
- Lets Bob transition from floor to wall.

---

### Sticky Section B — First Laser Area

Position:

```text
Z ≈ 6–8
Y ≈ 3–4.5
```

Bob must move around the first laser.

---

### Sticky Section C — Vertical Movement

Position:

```text
Z ≈ 8–10
Y ≈ 4–6
```

Requires climbing upward.

---

### Sticky Section D — Laser Timing

Position:

```text
Z ≈ 10–12
Y ≈ 5–7
```

Contains the main moving laser obstacle.

---

### Sticky Section E — Button Approach

Position:

```text
Z ≈ 12–14
Y ≈ 6–7
```

Leads directly to the wall button.

---

# 15. Left Wall Sketch

Viewed directly from inside the room:

```text
               Y ↑

9  │
8  │
7  │                          [ BUTTON ]
   │                              ●
6  │                      ███████████
   │                 █████
5  │                █          ─────── Laser 3
   │           █████
4  │          █       ↕ moving laser
   │     █████
3  │    █      ───────── Laser 1
   │ ███
2  │ █
1  │ █
0  └────────────────────────────────────────────→ Z
      START                           FAR WALL
```

The route should visibly zig-zag rather than being one continuous strip.

---

# 16. Laser Design

Use approximately **three laser challenges**.

The lasers should make the route interesting without turning Room 2 into a precision gauntlet.

---

## Laser 1 — Basic Static Beam

Purpose:

> Remind the player that lasers are dangerous.

Place it across an obvious direct route.

Bob can simply climb around it.

Recommended position:

```text
Y ≈ 3
Z ≈ 6.5
```

---

## Laser 2 — Slow Sweeping Beam

The second laser should move slowly across part of the sticky-wall route.

Example:

```text
       ↕
────────────
   LASER
────────────
       ↕
```

Bob can wait safely on one sticky tile and move when the beam passes.

Use a predictable rhythm.

---

## Laser 3 — Pulsing Beam Near Button

Place one final laser before the button.

Behaviour:

```text
ON  → approximately 1.2 seconds
OFF → approximately 1.0 second
```

The player waits and crosses during the safe period.

Avoid requiring extremely tight timing.

---

# 17. Laser Failure Behaviour

If Bob touches a lethal laser:

1. Trigger death.
2. Play slime death effect.
3. Reset Room 2.
4. Restore both slimes.
5. Close the door.
6. Restore all braces.
7. Return all blocks to suspended positions.

---

# 18. Wall Button Placement

The wall button should be approximately:

```text
Left wall:
X ≈ -11.8

Distance into room:
Z ≈ 13

Height:
Y ≈ 6–6.5
```

It should be clearly reachable from the final sticky panel.

---

# 19. Wall Button Appearance

The button needs to be much larger than a normal human-sized push button because Bob must physically occupy it.

Suggested visual size:

- approximately 1.5–2 Bob widths.
- circular or rectangular industrial pressure pad.
- inset slightly into wall.

Visual states:

### Inactive

- Dim.
- Red/orange indicator.
- Door closed.

### Bob attached

- Pad depresses slightly.
- Indicator turns green.
- Mechanical activation sound.
- Door begins opening.

---

# 20. Button Detection

The button should stay active only while Bob is physically occupying its trigger.

Conceptually:

```text
Bob touching + attached
        ↓
BUTTON ACTIVE
        ↓
DOOR OPEN
```

When Bob leaves:

```text
Bob no longer occupying trigger
        ↓
BUTTON INACTIVE
        ↓
DOOR CLOSE
```

Goop should not be able to activate this wall button if the puzzle is specifically intended to use Bob's wall adhesion.

---

# 21. Bob's Parking Position

When properly attached to the button, Bob should be stable.

Do not require constant input.

The player should be able to:

1. Reach button.
2. Attach Bob.
3. Release movement controls.
4. Switch to Goop.
5. Have Bob remain attached.

Bob should not slowly slide away or fall because he is inactive.

---

# 22. Blast Door Placement

The centre blast door should sit in the far wall.

Recommended approximate position:

```text
X = 0
Z = 19.8
Y = 0
```

Recommended opening dimensions:

- Width: approximately 3–4 units.
- Height: approximately 4–5 units.

---

# 23. Blast Door Design

The door should resemble a heavy facility security shutter.

It moves **vertically**.

This makes button state visually obvious from across the room.

---

# 24. Blast Door Animation

### Closed

Door occupies the entire opening.

```text
┌─────────────┐
│█████████████│
│█████████████│
│█████████████│
│█████████████│
└─────────────┘
```

### Opening

Panel moves upward into the wall.

```text
      ↑
┌─────────────┐
│█████████████│
├─────────────┤
│             │
│             │
│             │
└─────────────┘
```

### Open

```text
┌─────────────┐
│█████████████│
├─────────────┤
│             │
│    OPEN     │
│             │
└─────────────┘
```

---

# 25. Door Timing

Suggested initial timing:

- Opening: approximately **0.8–1.2 seconds**.
- Closing: approximately **0.8 seconds**.

The door should feel heavy but responsive.

Do not make Goop wait several seconds after Bob presses the button.

---

# 26. Door Safety

Do not allow the closing door to create an unnecessary softlock.

If Goop is directly underneath it when Bob leaves the button:

Preferred behaviour:

- Detect obstruction.
- Temporarily hold/reopen the door.

OR:

- Prevent Bob from switching away from the button interaction until Goop is clearly through.

The first option is preferable because it feels like a physical safety system.

Do not allow Goop to become permanently trapped inside the door collider.

---

# 27. The Three Suspended Block Assemblies

There are exactly three required environmental targets:

1. **Wooden Brace 1**
2. **Wooden Brace 2**
3. **Wooden Brace 3**

Each controls one suspended block.

```text
BRACE 1 → BLOCK 1
BRACE 2 → BLOCK 2
BRACE 3 → BLOCK 3
```

---

# 28. Assembly Structure

Each should conceptually contain:

```text
SuspendedBlockAssembly
│
├── CeilingAnchor
├── WoodenBrace          ← Goop shoots this
├── BraceHitTarget
├── Rope
├── RopeSpool / limiter
├── SuspendedBlock
├── StartTransform
├── LandingTransform
└── Effects
```

---

# 29. Important Target Rule

Goop must shoot:

> **THE WOODEN BRACE**

Not:

- the rope;
- the metal block;
- the ceiling;
- the spool.

This differs intentionally from Room 1.

---

# 30. Why the Wooden Braces Exist

The brace functions as a temporary structural lock.

Before destruction:

```text
WOODEN BRACE
      ↓
holds suspension mechanism in raised position
      ↓
BLOCK STAYS HIGH
```

After destruction:

```text
GOOP ACID
      ↓
WOODEN BRACE DISSOLVES
      ↓
LOCK RELEASES
      ↓
BLOCK DROPS
      ↓
ROPE BECOMES TAUT
      ↓
BLOCK STOPS AT AUTHORED HEIGHT
```

---

# 31. Wooden Brace Appearance

The braces should be immediately distinguishable from the surrounding metal.

Recommended:

- Wooden planks or reinforced wooden support blocks.
- Yellow warning paint nearby.
- Existing corrosion marks.
- Slightly lighter material than the ceiling.
- Green soluble-material marker if that visual language already exists.

The facility may have used temporary wooden braces during emergency maintenance.

That gives them a believable environmental reason to exist.

---

# 32. Brace Hitboxes

Do not require pixel-perfect aiming.

Each visible brace should have a slightly enlarged invisible acid collision target around it.

For example:

```text
VISIBLE:

      [====]


FUNCTIONAL HIT REGION:

    ┌──────────┐
    │  [====]  │
    └──────────┘
```

The first two braces should be particularly forgiving.

---

# 33. Brace 1 Position

Brace 1 should be the easiest target.

Approximate location:

```text
X ≈ -5
Z ≈ 9
Y ≈ 10.5
```

Goop should be able to see it shortly after entering the radioactive area.

---

# 34. Block 1 Suspended Position

Before activation:

```text
X ≈ -5
Z ≈ 9
Y ≈ 9
```

Keep it visibly above Bob's usable height.

Bob cannot use it yet.

---

# 35. Block 1 Final Position

After Brace 1 breaks:

```text
X ≈ -5.5
Z ≈ 12.5
Y ≈ 5
```

The exact Z offset may be achieved through a slightly angled suspension or authored animation.

Alternatively, keep X/Z fixed and position the button route accordingly.

The essential result is:

> Block 1 becomes Bob's first reachable platform after leaving the button.

---

# 36. Brace 2 Position

Approximate:

```text
X ≈ 0
Z ≈ 12.5
Y ≈ 10.5
```

Goop needs to move farther into the radioactive section to get a comfortable shot.

---

# 37. Block 2 Final Position

Recommended:

```text
X ≈ -0.5
Z ≈ 14.5
Y ≈ 6
```

Block 2 is higher and farther right than Block 1.

---

# 38. Brace 3 Position

Approximate:

```text
X ≈ +5
Z ≈ 15
Y ≈ 10.5
```

This target is closest to the far side.

By the time Goop shoots Brace 3, the player should be close to Goop's blast-door exit.

---

# 39. Block 3 Final Position

Recommended:

```text
X ≈ +4.5
Z ≈ 16.5
Y ≈ 7–7.5
```

This is the highest of the three blocks.

It should place Bob close enough to make the final jump toward the vent.

---

# 40. Three-Block Route

After all three braces are destroyed:

```text
BUTTON
   ●

    \
     \
      \      ┌─────────┐
       ───→  │ BLOCK 1 │
             └─────────┘
                    \
                     \
                      ───→ ┌─────────┐
                           │ BLOCK 2 │
                           └─────────┘
                                  \
                                   \
                                    ───→ ┌─────────┐
                                         │ BLOCK 3 │
                                         └─────────┘
                                                \
                                                 \
                                                  ───→ VENT
```

The route should move:

> **left → centre → right → upward**

This visually carries Bob across the room toward the upper-right exit.

---

# 41. Block Sizes

Recommended greybox size per block:

- Width: 2.5–3 units.
- Depth: 2.5–3 units.
- Thickness: approximately 0.5 units.

They should provide enough landing space to feel fair.

Avoid tiny precision platforms.

---

# 42. Block Surface

The top should be:

- Stable.
- Non-hazardous.
- Clearly readable as a traversal surface.
- Large enough for Bob to stop and prepare the next jump.

Do not automatically make the block sticky unless that is necessary for the intended movement.

Using ordinary solid platforms makes Goop's environmental contribution easier to understand.

---

# 43. Block Falling Animation

The blocks should use an authored movement rather than uncontrolled rigid-body physics.

State flow:

```text
SUSPENDED
   ↓
BRACE_DISSOLVING
   ↓
RELEASED
   ↓
DROPPING
   ↓
ROPE_TAUT
   ↓
SETTLING
   ↓
READY
```

---

# 44. Dropping Behaviour

When the brace breaks:

1. Small mechanical release.
2. Block begins falling.
3. Rope visibly extends/unspools.
4. Block accelerates briefly.
5. Rope becomes fully extended.
6. Block stops at its authored position.
7. Block swings slightly.
8. Swing quickly damps.
9. Platform becomes stable.

Do not leave the platform swinging indefinitely.

---

# 45. Visual Feedback When Rope Becomes Taut

Use:

- Strong rope jerk.
- Metal clank.
- Slight platform tilt.
- Small dust particles from ceiling mechanism.
- Brief rope vibration.

This sells the idea that the rope stopped the block.

---

# 46. Brace Dissolve Feedback

Each brace should have:

### Acid impact

- Splash.
- Hiss.
- Green particles.

### Dissolve

- Visible material corrosion.
- Dissolve shader if suitable.
- Small wooden fragments.

### Failure

- Crack/snapping sound.
- Brace disappears or breaks apart.
- Suspension mechanism releases.

---

# 47. Order of the Three Braces

The player does not necessarily need to shoot them in numerical order.

Ideally:

> Any order is valid.

The intended natural path makes the likely sequence:

```text
1 → 2 → 3
```

But if the player manages:

```text
2 → 1 → 3
```

the puzzle should still work.

Do not artificially require a sequence unless technically necessary.

---

# 48. Goop's Sightlines

From the radioactive area, none of the braces should be hidden behind large geometry.

Aiming should feel intentional, not frustrating.

Use environmental framing:

- Pipes leading visually toward them.
- Warning lights.
- Hanging cables.
- Ceiling supports.

Do not place decorative clutter directly around the targets.

---

# 49. Goop's Final Approach to Door

After Brace 3, Goop reaches the far side.

The centre blast door should now be directly visible.

Because Bob is still holding the button:

> Door remains fully raised.

Goop proceeds through.

---

# 50. Goop's Room 3 Trigger

Place Goop's transition trigger sufficiently inside Room 3.

Do not activate progression merely because Goop touches the doorway threshold.

Once Goop clearly crosses:

```text
GoopRoom2Exited = true
```

Goop is now considered safely inside Room 3.

---

# 51. Switching Back to Bob

After Goop reaches Room 3:

- Player can switch back to Bob.
- Camera returns to Bob.
- Bob remains attached to the button until player moves.

The player should not need to manually return Goop.

---

# 52. Door Closing Moment

When Bob finally moves off the button:

1. Button releases.
2. Indicator changes back.
3. Warning tone plays.
4. Door begins lowering.
5. Door slams closed.

Because Goop is already in Room 3, this is safe.

This can create a satisfying visual confirmation:

> The player has committed Goop to the lower Room 3 path.

---

# 53. Bob's Departure From the Button

The first jump after leaving the button should not immediately punish the player.

Give Bob:

- One nearby sticky patch.
- Or a small ledge beneath/adjacent to the button.

From there Bob can line up the jump toward Block 1.

---

# 54. Suggested Button-to-Block-1 Transition

Example:

```text
LEFT WALL

   [BUTTON]
      ●
      │
  sticky patch
      █
      █
      │
      └──────── jump ────────→ [BLOCK 1]
```

This keeps the transition understandable.

---

# 55. Bob's Block 1 → Block 2 Jump

This should require a normal deliberate jump.

Do not require maximum charge.

The player already solved the cooperation puzzle; the traversal should be satisfying rather than excessively punishing.

---

# 56. Block 2 → Block 3

Make this slightly more challenging.

Possible requirement:

- Charge jump.
- Small mid-air adjustment.
- Jump from edge.

Still keep it within comfortable established movement limits.

---

# 57. Block 3 → Vent

The final movement should feel like the payoff.

Possible route:

```text
BLOCK 3
   ↓
small sticky patch on far wall
   ↓
short wall climb
   ↓
VENT
```

I recommend including this small final sticky section rather than letting Bob jump directly into the vent.

It reinforces Bob's identity.

---

# 58. Far-Wall Sticky Patch

Place a marked sticky area below and slightly left of the ventilation opening.

Example:

```text
              ┌───────────────┐
              │     VENT      │
              └───────▲───────┘
                      │
                   █████
                   █████   ← sticky patch
                      ▲
                      │
                  [BLOCK 3]
```

Bob:

1. Jumps from Block 3.
2. Sticks to wall.
3. Climbs a short distance.
4. Enters vent.

---

# 59. Vent Position

Recommended:

```text
Far wall:
Z ≈ 19.8

Right side:
X ≈ +7 to +8

Height:
Y ≈ 8–9
```

Approximate opening:

- Width: 2–2.5 units.
- Height: 2–2.5 units.

Make it large enough for Bob's collider to enter comfortably.

---

# 60. Vent Interior

The vent should continue far enough that entering it feels intentional.

Do not immediately teleport Bob at the exact wall surface.

Provide:

- Short duct.
- Turn or slope if desired.
- Room 3 loading/transition trigger deeper inside.

This prevents accidental activation while Bob is merely climbing around the opening.

---

# 61. Bob Can Enter Room 3 Before Goop

Do **not** artificially block Bob's vent based on Goop's state.

If the player gets Bob there first:

> Let Bob enter.

That is legitimate player freedom.

Room 3 itself requires Goop, so this does not invalidate the cooperation design.

Likewise, Goop may enter his Room 3 section before Bob.

---

# 62. Room 3 Entry Positions

Room 3 should preserve the physical separation established by Room 2.

### Goop

Enters:

> **Lower Room 3 entrance.**

### Bob

Enters:

> **Upper Room 3 vent / elevated section.**

This makes the Room 2 solution visibly affect the layout of the next room.

---

# 63. Full Layout — Top Down

```text
                               FAR WALL
                               ROOM 3

                        GOOP DOOR
                            ↓
              ┌──────────────┬──────────────┐
              │              │          VENT│ ← Bob
              │              │              │
              │              │      B3      │
              │              │              │
              │         B2   │              │
              │              │              │
LEFT WALL     │    B1        │              │
STICKY        │              │              │
ROUTE         │ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢   │
              │ ☢                        ☢   │
    BUTTON ●  │ ☢        GOOP ROUTE      ☢   │
              │ ☢                        ☢   │
              │ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢   │
              │                              │
              │         SAFE START           │
              │        BOB + GOOP            │
              └──────────────┬───────────────┘
                             ↑
                         ROOM 1 DOOR
```

---

# 64. Full Layout — Player Progression

```text
START
  │
  ├──────────────────────────┐
  │                          │
  ▼                          │
BOB                          │
  │                          │
  ▼                          │
LEFT STICKY WALL             │
  │                          │
  ├─ Laser 1                 │
  ├─ Laser 2                 │
  ├─ Laser 3                 │
  │                          │
  ▼                          │
BUTTON                       │
  │                          │
  │ OPENS DOOR               │
  ▼                          │
SWITCH TO GOOP               │
  │                          │
  ▼                          │
RADIOACTIVE FLOOR            │
  │                          │
  ├─ Shoot Brace 1 → B1 drops
  │
  ├─ Shoot Brace 2 → B2 drops
  │
  ├─ Shoot Brace 3 → B3 drops
  │
  ▼
GOOP ENTERS ROOM 3
  │
  ▼
SWITCH TO BOB
  │
  ▼
LEAVE BUTTON
  │
  └─ Door closes
  │
  ▼
BLOCK 1
  │
  ▼
BLOCK 2
  │
  ▼
BLOCK 3
  │
  ▼
FAR-WALL STICKY PATCH
  │
  ▼
VENT
  │
  ▼
BOB ENTERS ROOM 3
```

---

# 65. Checkpoint Behaviour

Room 2's checkpoint should activate when both slimes have properly entered from Room 1.

Save:

- Bob spawn.
- Goop spawn.
- Active slime.
- Door initial state.
- Button state.
- Brace states.
- Block states.

---

# 66. Reset State

On Bob death:

### Bob

Return to Room 2 start.

### Goop

Return to Room 2 start.

### Door

Closed.

### Button

Inactive.

### Brace 1

Restored.

### Brace 2

Restored.

### Brace 3

Restored.

### Block 1

Returned to raised suspended position.

### Block 2

Returned to raised suspended position.

### Block 3

Returned to raised suspended position.

### Lasers

Restart from authored initial timing/state.

---

# 67. Suspended Block Reset

Each assembly needs a reset operation equivalent to:

```text
state = SUSPENDED

woodenBrace:
    visible = true
    soluble = true
    hitTargetEnabled = true
    dissolveAmount = 0

block:
    position = suspendedPosition
    rotation = suspendedRotation
    traversalCollision = configuredForSuspendedState

rope:
    length = initialLength
    visible = true

effects:
    cleared
```

---

# 68. Important Softlock Rules

The room must prevent:

### Goop trapped by blast door

Use door obstruction handling.

### Block drops incorrectly

Use authored final transforms rather than uncontrolled physics.

### Bob cannot reach next platform

Validate every jump using actual production movement values.

### Brace destroyed but block does not become usable

State transition must be atomic and resettable.

### Goop enters Room 3 and Bob dies

If Bob dies before the Room 3 checkpoint has formally taken over, resetting Room 2 should return **both slimes** to Room 2.

This prevents Goop remaining stranded in Room 3 while Bob respawns behind the closed door.

---

# 69. Completion Ownership

Room 2 should only be considered fully complete once the transition requirements for Room 3 are satisfied.

Because the two slimes use different entrances, track them independently:

```text
bobEnteredRoom3
goopEnteredRoom3
```

When both are true:

```text
Room2Complete = true
```

Room 3 can still allow one slime to begin exploring before the second arrives.

---

# 70. Environmental Appearance

Room 2 should continue Level 2's contaminated cultivation aesthetic.

Possible elements:

- Green emergency lighting.
- Rusted industrial framing.
- Overgrown vines.
- Broken cultivation tanks.
- Radioactive warning markings.
- Ceiling maintenance rails.
- Suspended cargo blocks.
- Pipes feeding the radioactive pool.
- Damaged ventilation machinery.
- Flickering lights.
- Water/condensation.
- Acid corrosion around older wooden braces.

---

# 71. Visual Hierarchy

The player's eye should naturally read the room in roughly this order:

1. Radioactive pool.
2. Closed centre door.
3. Upper-right vent.
4. Sticky left wall.
5. Button.
6. Hanging blocks.
7. Wooden braces.

Avoid excessive visual clutter that obscures these gameplay elements.

---

# 72. Lighting

Use the radioactive liquid as a major low-level green light source.

Contrast it with:

- Warm emergency lights around door.
- Cooler vent lighting.
- Small indicator lights around button.

The upper vent should be visually noticeable even from the start.

A subtle brighter light coming from inside it can signal:

> **This is somewhere Bob needs to reach.**

---

# 73. Audio Landscape

Room ambience:

- Radioactive bubbling.
- Facility hum.
- Distant machinery.
- Vent airflow.
- Occasional electrical crackle.

Bob section:

- Laser hum.
- Sticky movement sounds.
- Button mechanical click.

Door:

- Alarm beep.
- Heavy motor.
- Metal sliding.
- Impact when closing.

Goop section:

- Acid projectile.
- Chemical sizzling.
- Wood cracking.

Blocks:

- Release clunk.
- Rope spool.
- Falling whoosh.
- Rope tension impact.
- Metal swing.

---

# 74. Suggested Construction Order

## Phase 1 — Greybox Room Shell

Build:

- Floor.
- Walls.
- Ceiling.
- Entrance.
- Far blast-door opening.
- Upper vent opening.

Confirm overall scale.

---

## Phase 2 — Radioactive Floor

Create hazard area.

Confirm:

- Bob dies.
- Goop survives.
- Bob cannot bypass it.

---

## Phase 3 — Bob's Left-Wall Route

Create only primitive sticky panels.

Test full route from entrance to button.

Do not add lasers yet.

---

## Phase 4 — Button and Door

Implement:

```text
Bob attached → door opens
Bob detached → door closes
```

Verify inactive Bob remains attached while controlling Goop.

---

## Phase 5 — Goop Route

Test:

- Switch to Goop.
- Cross hazard.
- Enter door.

Confirm the room already demonstrates Bob helping Goop.

---

## Phase 6 — Place Final Bob Platforms First

Before building suspension machinery, put temporary cubes at the desired final positions for:

- Block 1.
- Block 2.
- Block 3.

Test:

```text
Button → B1 → B2 → B3 → sticky patch → vent
```

Do not proceed until this route feels good.

---

## Phase 7 — Create Suspended Versions

Move the blocks to their initial ceiling positions.

Store both:

```text
suspendedTransform
finalTransform
```

---

## Phase 8 — Build Suspension Assemblies

For each block add:

- Ceiling mount.
- Rope.
- Spool.
- Wooden brace.
- Brace hit target.

---

## Phase 9 — Goop Acid Interaction

Implement exactly three targets.

Verify:

```text
Shoot Brace 1 → only Block 1 releases
Shoot Brace 2 → only Block 2 releases
Shoot Brace 3 → only Block 3 releases
```

Also verify:

```text
Shoot rope → no release
Shoot block → no release
Shoot metal mount → no release
```

---

## Phase 10 — Add Block Drop Animation

Implement authored descent and rope-tension settling.

---

## Phase 11 — Add Lasers

Only once both cooperation routes work.

Add:

- Laser 1.
- Laser 2.
- Laser 3.

Tune difficulty.

---

## Phase 12 — Reset Testing

Test all possible partial states:

- No braces destroyed.
- Only Brace 1 destroyed.
- Only Brace 2 destroyed.
- Brace 1 + 2.
- Brace 1 + 3.
- All three destroyed.
- Goop through door.
- Bob still on button.
- Bob halfway across blocks.

Kill Bob from each state.

Everything must return correctly.

---

## Phase 13 — Art Pass

Replace greyboxes and add:

- Materials.
- Wooden braces.
- Mechanical ropes.
- Industrial blocks.
- Laser emitters.
- Button art.
- Blast-door art.
- Environmental props.

---

## Phase 14 — Effects and Audio

Finally add:

- Acid dissolve effects.
- Laser effects.
- Door effects.
- Rope tension.
- Block impact/swing.
- Radioactive shader.
- Sound.

---

# 75. Final Intended Room Experience

The finished sequence should feel like this:

```text
Bob and Goop enter Room 2
        ↓
Player notices radioactive floor
        ↓
Player sees closed door and high vent
        ↓
Bob starts climbing sticky left wall
        ↓
Bob navigates laser hazards
        ↓
Bob reaches wall button
        ↓
Bob sticks onto it
        ↓
Heavy blast door rises
        ↓
Player switches to Goop
        ↓
Goop crosses radioactive floor
        ↓
Goop aims upward
        ↓
Shoot WOODEN BRACE 1
        ↓
Block 1 drops and hangs lower
        ↓
Shoot WOODEN BRACE 2
        ↓
Block 2 drops
        ↓
Shoot WOODEN BRACE 3
        ↓
Block 3 drops
        ↓
Goop reaches open door
        ↓
Goop enters lower section of Room 3
        ↓
Player switches back to Bob
        ↓
Bob leaves button
        ↓
Blast door SLAMS shut
        ↓
Bob jumps to Block 1
        ↓
Bob jumps to Block 2
        ↓
Bob jumps to Block 3
        ↓
Bob sticks to far-wall sticky patch
        ↓
Bob climbs into upper-right vent
        ↓
Bob enters upper section of Room 3
```

---

# 76. Final Room Layout Summary

## Near / South Side

- Room 1 entrance.
- Safe spawn area.
- Beginning of Bob's sticky-wall route.

## Left / West Wall

- Marked sticky panels.
- Three laser challenges.
- Bob's hold-to-open wall button.

## Centre Floor

- Large radioactive pool.
- Goop's traversal space.

## Ceiling / Upper Centre

Three separate suspension assemblies:

### Assembly 1
**Wooden Brace 1 → Rope → Block 1**

### Assembly 2
**Wooden Brace 2 → Rope → Block 2**

### Assembly 3
**Wooden Brace 3 → Rope → Block 3**

Goop must shoot the **wooden brace** of all three.

## Far / North Wall Centre

- Vertically opening blast door.
- Only open while Bob occupies the button.
- Goop's entrance to Room 3.

## Far / North Wall Upper Right

- Sticky approach patch.
- Open ventilation shaft.
- Bob's entrance to Room 3.

---

# 77. Core Design Rule

The entire room should reinforce:

> **Bob and Goop are solving different parts of the same problem.**

Bob's abilities create the opportunity for Goop:

> **Climb → survive lasers → hold button → open Goop's door.**

Goop's abilities create the opportunity for Bob:

> **Cross radioactive floor → shoot 3 wooden braces → release 3 hanging blocks → build Bob's route.**

The successful solution therefore cannot be reduced to one slime doing all the work:

> **Bob opens Goop's exit. Goop builds Bob's exit.**