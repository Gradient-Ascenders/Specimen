# Room 2 — Sticky Wall Clarification and Updated Layout

The following sections supersede the previous descriptions of the sticky-wall portion of Room 2.

## Updated Spatial Rule — Sticky Surfaces

**IMPORTANT: Room 2 does NOT contain a separate, freestanding sticky wall.**

The sticky surface used in the final tutorial challenge is a **large rectangular contaminated section embedded directly into one of the room's existing perimeter walls**.

The room wall itself remains one continuous architectural surface.

Most of that wall consists of ordinary white laboratory panels that Tack **cannot** stick to.

Only a clearly marked yellow-green contaminated section of that same wall is climbable.

Conceptually:

```text
EXISTING ROOM WALL

┌───────────────────────────────────────────────┐
│                                               │
│   NORMAL WHITE LABORATORY WALL               │
│                                               │
│                     ┌───────────────┐         │
│                     │ STICKY TILES  │         │
│                     │               │         │
│                     │ YELLOW/GREEN  │         │
│                     │ CONTAMINATED  │         │
│                     │               │         │
│                     └───────────────┘         │
│                                               │
│   NORMAL WHITE LABORATORY WALL               │
│                                               │
└───────────────────────────────────────────────┘
```

The sticky section must therefore look like the laboratory wall has been **chemically contaminated or corroded**, rather than looking like somebody deliberately installed a climbing wall.

---

# Updated Room Layout

The high-level room composition should now be interpreted as follows:

```text
SIDE / ISOMETRIC CONCEPT

┌──────────────────────────────────────────────────────┐
│                                                      │
│                                OPEN EXIT DOOR        │
│                                     ┌───────┐        │
│                         ZONE 5      │       │        │
│                   FINAL WALKWAY ────┤       │        │
│                                     └───────┘        │
│                              ┌───────────────┐       │
│                              │  HIGH LEDGE   │       │
│                              └───────┬───────┘       │
│                                      │               │
│ NORMAL PERIMETER WALL                │               │
│ █████████████████████████████████████│████████████   │
│ ██████████████████████┌──────────────┤████████████   │
│ ██████████████████████│ STICKY TILES │████████████   │
│ ██████████████████████│ YELLOW/GREEN │████████████   │
│ ██████████████████████│              │████████████   │
│ ██████████████████████│              │████████████   │
│ ██████████████████████└──────────────┘████████████   │
│                                  ▲                   │
│                                  │                   │
│                                  │ charged bounce    │
│                                  │                   │
│                     ┌────────────┴─────┐             │
│                     │   PLATFORM B     │             │
│                     │   GAP SECTION    │             │
│                     └──────────────────┘             │
│                              ▲                       │
│                              │                       │
│                    charged gap jump                  │
│                              │                       │
│             ┌────────────────┴───┐                   │
│             │    PLATFORM A      │                   │
│             │  HEIGHT TUTORIAL   │                   │
│             └────────────────────┘                   │
│                       ▲                              │
│                       │                              │
│                    first jump                        │
│                                                      │
│     ↓ ENTRY VENT                                     │
│                                                      │
│       ZONE 1                                         │
│    LANDING AREA                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

# Updated Zone 4 — Bounce Into Wall Adhesion

## Purpose

Zone 4 is the final major teaching beat of Room 2.

It teaches:

> **Tack can perform a charged jump toward a distant wall, attach to a sticky section while airborne, and immediately transition from bouncing into climbing.**

This is the first time the player deliberately combines the two mechanics taught so far.

Room 1 taught:

> Stick and climb.

Earlier parts of Room 2 taught:

> Charge and bounce.

Zone 4 teaches:

> **Bounce → catch wall → stick → climb.**

This interaction directly prepares the player for the more demanding combinations required in Room 3.

---

# Sticky Wall Architecture

The sticky section must be built into **one of Room 2's exterior/perimeter walls**.

Do NOT create:

- a floating sticky slab;
- an isolated climbing panel standing in the middle of the chamber;
- a separate vertical platform;
- a wall perpendicular to the room wall unless required structurally;
- an obviously artificial climbing-wall structure.

Instead, create the normal laboratory wall first.

For example:

```text
NORMAL WALL
────────────────────────────────────────────
│ white │ white │ white │ white │ white │
│       │       │       │       │       │
│ white │ STICKY CONTAMINATION │ white  │
│       │                     │         │
│ white │                     │ white   │
│       │                     │         │
│ white │                     │ white   │
│       │                     │         │
│ white │ white │ white │ white │ white │
────────────────────────────────────────────
```

The contaminated tiles occupy only part of that wall.

The underlying wall remains structurally continuous.

---

# Recommended Sticky Patch Dimensions

Recommended sticky section:

```text
Width: approximately 4–5 m
Height: approximately 5–6 m
```

Suggested vertical placement:

```text
Bottom edge:
Y ≈ 3 m

Top edge:
Y ≈ 8–9 m
```

The bottom of the sticky section should deliberately begin **above normal walking height**.

This is important.

The player should NOT simply walk up to the wall and begin climbing.

They must use the jump mechanic they just learned to reach it.

---

# Relationship Between Platform B and the Wall

Platform B should sit several metres away from the perimeter wall.

Do not attach Platform B directly to the sticky wall.

There must be a deliberate air gap.

Recommended separation:

```text
Platform B edge → sticky wall:

approximately 4–6 m
```

The exact distance depends on Tack's final jump tuning.

The intended arrangement is:

```text
TOP-DOWN / SIDE CONCEPT

                     ROOM WALL
                       │
                       │
              ┌────────┴────────┐
              │   STICKY AREA   │
              │                 │
              │                 │
              └─────────────────┘
                       ▲
                       │
                       │ 4–6 m
                       │
                 JUMP THROUGH
                    OPEN AIR
                       │
                       │
             ┌─────────┴────────┐
             │    PLATFORM B    │
             └──────────────────┘
```

The player stands on Platform B, faces the wall, charges the jump, and launches across the open space.

---

# Intended Player Action

The exact intended sequence is:

```text
1. Reach Platform B.

2. Look toward the perimeter wall.

3. Notice the yellow-green sticky section embedded in it.

4. Realise the sticky section begins too high to reach normally.

5. Face the sticky wall.

6. Hold the jump input to charge Tack.

7. Move toward the wall while releasing the charge.

8. Launch across the gap.

9. Collide with the sticky section while airborne.

10. Tack automatically attaches to the wall.

11. Transition into wall movement.

12. Climb vertically toward the high ledge.

13. Pull/move onto the high ledge.

14. Continue toward the final exit.
```

This should feel like one continuous movement sequence rather than two disconnected mechanics.

---

# Side View of Intended Interaction

```text
                         HIGH LEDGE
                       ┌─────────────┐
                       │             │
                       └──────┬──────┘
                              │
ROOM'S NORMAL WALL            │
██████████████████████████████│██████
██████████████████┌───────────┤██████
██████████████████│ STICKY    │██████
██████████████████│ SECTION   │██████
██████████████████│           │██████
██████████████████│           │██████
██████████████████│           │██████
██████████████████└───────────┘██████
                         ▲
                         │ attach here
                       ↗
                     ↗
                   ↗
                 ↗
        CHARGED BOUNCE

        ┌───────────────┐
        │  PLATFORM B   │
        └───────────────┘
```

The important spatial relationship is:

> **Platform B faces the sticky section across open air.**

The player is effectively trying to **catch the wall with their slime**.

---

# Sticky Wall Catch Zone

Because this is still part of the tutorial, the climbable area should be intentionally generous.

The player should not need to hit the centre of the sticky section exactly.

Recommended usable width:

```text
4–5 m
```

Recommended usable vertical range:

```text
5–6 m
```

A slightly overcharged or undercharged jump should still have a reasonable chance of connecting.

Room 3 can introduce:

- smaller sticky areas;
- dangerous misses;
- laser interference;
- more precise jump angles.

Room 2 should first establish confidence.

---

# What Happens if the Player Misses?

If the player fails to reach the sticky section:

```text
Jump
 ↓
Miss wall
 ↓
Fall to Room 2 floor
 ↓
No death
 ↓
Quick recovery
 ↓
Return to Platform B
 ↓
Try again
```

There should be **no instant death**.

Consider including a quick recovery path so that returning to Platform B does not require repeating the entire room.

For example:

```text
LOWER FLOOR
     │
     ▼
small recovery ramp / easy platforms
     │
     ▼
Platform A
     │
     ▼
Platform B
```

The recovery should remain short.

---

# High Ledge Integration

The high ledge should also be structurally integrated into the same perimeter wall.

It can resemble:

- an observation walkway;
- maintenance balcony;
- laboratory service ledge;
- recessed upper corridor.

Avoid making it appear like another arbitrary floating cube.

Concept:

```text
PERIMETER WALL

█████████████████████████████████████████
█████████████████████████████████████████
██████████████████┌──────────────────────
██████████████████│ HIGH MAINTENANCE LEDGE
██████████████████└──────────────────────
██████████┌─────────────┐████████████████
██████████│ STICKY      │████████████████
██████████│ CONTAMINATED│████████████████
██████████│ TILES       │████████████████
██████████│             │████████████████
██████████└─────────────┘████████████████
█████████████████████████████████████████
```

The sticky contamination effectively provides the player's route from the lower chamber to this upper architectural level.

---

# Environmental Explanation

The sticky section should not look like a game developer simply painted a climbing route onto the wall.

Give it an environmental explanation.

For example:

A chemical pipe or containment line above this part of the chamber may have leaked over time.

The leaked substance has run down the wall, staining and corroding the laboratory tiles.

Visual progression:

```text
              BROKEN / LEAKING PIPE
                    ═══════╗
                           ║
                          drip
                           ↓
                      ▓▓▓▓▓▓▓
                     ▓ STICKY ▓
                    ▓  WALL    ▓
                   ▓           ▓
                  ▓            ▓
```

This can explain why one specific area has become adhesive.

It reinforces the abandoned-facility storytelling while preserving clear gameplay language.

---

# Sticky Surface Visual Design

The sticky section should have:

### Colour

Yellow-green / sickly lime.

### Tile Structure

The underlying laboratory tiles should still be visible.

Do not replace them with an unrelated rock or slime wall.

Instead:

```text
WHITE LAB TILE
+
chemical staining
+
corrosion
+
wet residue
=
STICKY TILE
```

### Surface Features

Consider:

- dark staining around tile seams;
- green chemical streaks;
- patches of corrosion;
- glossy wet areas;
- subtle dripping;
- damaged grout;
- small bubbles or residue.

The player should immediately recognise it as the same surface language introduced in Room 1.

---

# Collision and Gameplay Implementation

Architecturally, the entire wall can use the same basic collision plane or wall collider.

However, the sticky region needs its own identifiable gameplay surface.

For example:

```text
ROOM WALL
├── NormalWallSection
│   └── Surface Type: NORMAL
│
├── StickyWallSection
│   └── Surface Type: STICKY
│
└── NormalWallSection
    └── Surface Type: NORMAL
```

Visually these pieces should appear to form **one continuous wall**.

They are separated internally only so the gameplay system knows which section Tack can attach to.

---

# Critical Gameplay Rule

The visible material and gameplay behaviour must always agree.

```text
WHITE CLEAN TILE
=
NOT CLIMBABLE
```

```text
YELLOW-GREEN CORRODED TILE
=
CLIMBABLE
```

Never allow the player to climb clean tiles immediately beside the sticky patch.

Never make visually contaminated tiles non-climbable.

The player should be able to trust the environment.

---

# Updated Zone 5 Transition

After climbing the embedded sticky section, Tack reaches the high ledge.

From here the room transitions toward the final walkway and exit.

Suggested sequence:

```text
STICKY WALL
     │
     │ climb
     ▼
HIGH LEDGE
     │
     │ short movement section
     ▼
FINAL BOUNCE / SMALL GAP
     │
     ▼
UPPER WALKWAY
     │
     ▼
OPEN EXIT DOOR
     │
     ▼
ROOM 3
```

The final bounce should be easier than the Platform B → sticky-wall jump.

The sticky-wall catch is the conceptual climax of Room 2.

---

# Updated Complete Room Flow

```text
ROOM 1 VENT
      │
      ▼
VENTILATION DUCT
      │
      ▼
ROOM 2 CEILING VENT
      │
      │ fall
      ▼
AUTOMATIC BOUNCE
      │
      ▼
LANDING / EXPERIMENT AREA
      │
      ▼
PLATFORM A
Vertical jump tutorial
      │
      ▼
PLATFORM B
Horizontal gap tutorial
      │
      ▼
Look toward EXISTING perimeter wall
      │
      ▼
See elevated yellow-green sticky patch
      │
      ▼
Charge bounce toward wall
      │
      ▼
Catch sticky tiles while airborne
      │
      ▼
Attach
      │
      ▼
Climb
      │
      ▼
High ledge integrated into wall
      │
      ▼
Final short jump
      │
      ▼
Upper walkway
      │
      ▼
Open door
      │
      ▼
ROOM 3
```

# Updated Build Instruction

When greyboxing this section, build it in this order:

1. Create the **complete normal perimeter wall** first.
2. Choose the portion of that wall that will contain the climbing route.
3. Divide that portion into a separate collision/render section without changing the apparent shape of the wall.
4. Assign that region the `STICKY` surface tag.
5. Give it the temporary yellow-green sticky material.
6. Place Platform B approximately 4–6 metres away from the wall.
7. Position the bottom of the sticky patch above normal jump/walking reach.
8. Tune the Platform B jump so a deliberate charged bounce reaches the patch.
9. Ensure Tack attaches when contacting the patch while airborne.
10. Place the high ledge directly above or slightly beside the sticky section.
11. Verify the player can transition naturally from wall climbing onto the ledge.
12. Only after the traversal works, replace the temporary wall materials with the final laboratory tile and corrosion visuals.

# Updated Acceptance Criteria

The sticky-wall section is correct only if all of the following are true:

- [ ] The sticky surface is part of an existing Room 2 perimeter wall.
- [ ] It does not appear to be a freestanding wall or floating platform.
- [ ] The surrounding wall uses normal white laboratory tiles.
- [ ] Only the yellow-green contaminated section is climbable.
- [ ] The contaminated region visually preserves the underlying laboratory-tile structure.
- [ ] Platform B is separated from the wall by open space.
- [ ] Tack cannot simply walk up to the sticky section.
- [ ] A charged bounce is required to reach it.
- [ ] Tack can attach to the sticky section directly from the jump.
- [ ] The sticky catch area is generous enough for a tutorial.
- [ ] Missing the jump does not kill the player.
- [ ] The high ledge is integrated into the same wall architecture.
- [ ] The player can smoothly transition from bounce → adhesion → climb → ledge.
- [ ] The section visually matches the sticky-surface language established in Room 1.

## Final Rule

The player should perceive this as:

> **“That part of the laboratory wall has become sticky, so I can launch myself onto it.”**

They should **not** perceive it as:

> “The game placed a random climbing wall here for me.”