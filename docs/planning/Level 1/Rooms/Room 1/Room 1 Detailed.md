# Slimebound — Room 1 + Ventilation Duct

## 1. High-Level Purpose

Room 1 is the **opening playable space of Slimebound**.

It has four responsibilities:

1. Introduce the game's laboratory setting.
2. Introduce Tack, the blue slime, through a short opening cutscene.
3. Teach basic player movement and wall adhesion.
4. Establish the visual rule that:
   - clean white surfaces are normal;
   - yellow-green contaminated surfaces are sticky and climbable.

The ventilation duct then acts as a **transition space** between Room 1 and Room 2.

The complete opening flow should be:

```text
OPENING CUTSCENE
      ↓
Tack hatches
      ↓
Glass containment box breaks
      ↓
Player gains control
      ↓
Explore Room 1
      ↓
Discover locked door
      ↓
Notice high ventilation opening
      ↓
Notice contaminated sticky wall
      ↓
Climb sticky surface
      ↓
Enter ventilation duct
      ↓
Move through facility ductwork
      ↓
Reach vertical drop
      ↓
Fall into Room 2
      ↓
Large automatic bounce
```

Room 1 should feel calm and controlled.

Room 2 introduces more movement.

Room 3 introduces danger.

Therefore Room 1 should contain:

- no lasers;
- no death traps;
- no difficult jumps;
- no moving platforms;
- no complex puzzles;
- no multiple routes.

The player should focus almost entirely on:

> **Where am I, what am I, and how do I get out?**

---

# 2. Core Room Identity

Room 1 should feel like a **small biological specimen containment chamber**.

The player should immediately understand that Tack was not simply living in this room.

Tack was being **stored and observed as a laboratory specimen**.

The space should therefore feel deliberately constructed to contain something.

Visual keywords:

- sterile;
- clinical;
- controlled;
- artificial;
- quiet;
- empty;
- slightly unsettling;
- abandoned, but not yet heavily damaged.

The key contrast should be:

```text
FACILITY INTENTION
Clean
Sterile
Controlled
White

        VS

FACILITY FAILURE
Corrosion
Chemical contamination
Broken containment
Yellow-green residue
```

That contrast will become more pronounced throughout the game.

---

# 3. Reference Direction

Use the following as general visual and spatial references.

These are **inspiration references**, not designs to directly copy.

## Portal / Portal 2 — Clean Test Chambers

Useful for:

- white modular walls;
- readable puzzle architecture;
- strong negative space;
- observation windows;
- simple geometric rooms;
- visual clarity;
- environments that communicate gameplay through material differences.

Reference search ideas:

```text
Portal clean test chamber
Portal 2 observation chamber
Portal 2 clean white laboratory room
```

The important principle is:

> Gameplay surfaces should remain readable even when the environment becomes detailed.

---

## Half-Life / Black Mesa — Research Facility

Useful for:

- biological research atmosphere;
- ventilation infrastructure;
- laboratory signage;
- containment equipment;
- observation areas;
- industrial transitions behind clean laboratory surfaces.

Reference ideas:

```text
Black Mesa laboratory containment chamber
Half Life research lab interior
Black Mesa ventilation duct
```

Use this primarily for environmental storytelling rather than colour palette.

Room 1 should remain brighter and cleaner.

---

## SCP / Containment Facility Visual Language

Useful conceptually for:

- specimen containment;
- sterile rooms;
- reinforced observation environments;
- numbered laboratory spaces.

Do not turn the game into a horror environment.

The reference is simply:

> This thing was being contained intentionally.

---

# 4. Recommended Scale

Assume:

```text
1 world unit ≈ 1 metre
```

If the project uses another scale, preserve relative proportions.

Recommended interior dimensions:

```text
Width:   14 m
Depth:   12 m
Height:   8 m
```

Approximate coordinate bounds:

```text
X: -7 → +7
Y:  0 → +8
Z: -6 → +6
```

This should make Room 1 significantly smaller than Room 2.

That difference helps Room 2 feel impressive when the player falls into it.

---

# 5. Coordinate Convention

Use:

```text
+Y = Up

+Z = direction toward the door / sticky wall

+X = horizontal room direction
```

Conceptually:

```text
                    +Z
                     ↑

              DOOR + VENT WALL

                     │
                     │
       -X ←──────────┼──────────→ +X
                     │
                     │

             CONTAINMENT PEDESTAL

                     │

                 REAR WALL
                    -Z
```

---

# 6. Overall Room Layout

The room should remain extremely readable.

Recommended arrangement:

```text
TOP-DOWN VIEW

                     +Z
                      ↑

┌──────────────────────────────────────────────┐
│                                              │
│       STICKY WALL SECTION          VENT      │
│       ████████████████             ▣         │
│       █              █                       │
│       █              █             ┌─────┐   │
│       █              █             │DOOR │   │
│       █              █             │     │   │
│                                    └─────┘   │
│                                              │
│                                              │
│                                              │
│                    ┌─────────┐               │
│                    │ GLASS   │               │
│                    │ BOX     │               │
│                    │ + EGG   │               │
│                    └─────────┘               │
│                     PEDESTAL                 │
│                                              │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

The pedestal should sit close to the centre.

The door and vent should be on the **same perimeter wall**.

The sticky contamination should also occupy part of that same wall.

This creates the core visual puzzle:

```text
LOCKED DOOR
+
HIGH OPEN VENT
+
CLIMBABLE CONTAMINATED WALL
=
ESCAPE ROUTE
```

---

# 7. Important Architectural Rule

The sticky surface is **not a freestanding wall**.

Just like the clarified Room 2 design, the sticky tiles must be integrated into the room's normal perimeter wall.

The wall should appear structurally continuous.

Example:

```text
ROOM 1 PERIMETER WALL

┌────────────────────────────────────────────────────┐
│ WHITE │ WHITE │ WHITE │ WHITE │ WHITE │ WHITE     │
│                                                    │
│          YELLOW-GREEN CONTAMINATION       VENT    │
│         ┌──────────────────────┐           ▣       │
│         │                      │                   │
│         │     STICKY AREA      │          ┌────┐   │
│         │                      │          │DOOR│   │
│         │                      │          │    │   │
│         └──────────────────────┘          └────┘   │
│                                                    │
│ WHITE │ WHITE │ WHITE │ WHITE │ WHITE │ WHITE     │
└────────────────────────────────────────────────────┘
```

Most of the wall:

```text
NORMAL
```

Only the contaminated section:

```text
STICKY
```

---

# 8. Room Construction Zones

Divide Room 1 into four conceptual zones:

```text
ZONE 1
Containment / Spawn

ZONE 2
Exploration / Door

ZONE 3
Sticky Surface Discovery

ZONE 4
Vent Entrance
```

Unlike Room 2, these zones are not separated by platforms.

They are separated by **player understanding**.

---

# 9. Zone 1 — Containment Pedestal

The room's visual centrepiece should be a raised specimen pedestal.

Recommended position:

```text
X = 0
Z = -0.5
```

Recommended dimensions:

```text
Pedestal base:

Width:  2.5 m
Depth:  2.5 m
Height: 1.0–1.2 m
```

The pedestal should be large enough to feel like laboratory equipment rather than furniture.

---

# 10. Pedestal Design

The pedestal can be approximately:

```text
      GLASS CONTAINER
       ┌───────────┐
       │           │
       │    EGG    │
       │           │
       └───────────┘
       ╔═══════════╗
       ║ PEDESTAL  ║
       ║           ║
       ╚═══════════╝
────────── FLOOR ──────────
```

Style:

- white coated exterior;
- dark metallic base;
- narrow panel seams;
- small indicator lights;
- optional specimen number.

Possible marking:

```text
SPECIMEN 01
```

or:

```text
T-01
```

Avoid heavy text exposition.

---

# 11. Glass Containment Box

The container should look intentionally designed to contain the egg.

Recommended dimensions:

```text
Width:  1.8 m
Depth:  1.8 m
Height: 1.8–2.0 m
```

It should sit centred on the pedestal.

Material:

- transparent;
- slightly reflective;
- subtle green-blue glass tint;
- visible edges.

Avoid making the glass perfectly invisible.

The player needs to understand:

> Tack is trapped behind glass.

---

# 12. Glass Frame

Consider adding thin metallic corners or a base frame.

For example:

```text
      ┌─────────────┐
      │             │
      │    GLASS    │
      │             │
      └─────────────┘
       ═════════════
        metal base
```

This gives the glass visual structure.

---

# 13. The Egg

The egg should sit near the centre of the glass enclosure.

Approximate size:

```text
Height: 0.9–1.2 m
Width:  0.7–0.9 m
```

The egg should look biologically unusual rather than like a normal bird egg.

Possible traits:

- translucent shell;
- subtle blue-green internal glow;
- faint veins;
- gel-like interior;
- minor movement before hatching.

Avoid making it grotesque.

The slime should remain charming/readable.

---

# 14. Opening Camera Setup

The opening should be an **in-engine camera sequence**.

Aim for approximately:

```text
6–10 seconds
```

The cutscene should be short.

The player should reach gameplay quickly.

The project plan already commits to short, skippable in-engine camera sequences rather than pre-rendered video.

---

# 15. Opening Cutscene — Detailed Sequence

## Shot 1 — Establishing Room

Duration:

```text
1.5–2 seconds
```

Start with a wide shot.

Show:

- empty white laboratory;
- pedestal in centre;
- glass enclosure;
- egg.

Suggested camera position:

```text
high rear corner
```

Example:

```text
CAMERA
   \
    \
     \       GLASS
      \     ┌──────┐
            │ EGG  │
            └──────┘
             PED.
```

Do not show the vent too prominently yet.

The player's attention should be on Tack.

---

# 16. Shot 2 — Move Toward Containment

Duration:

```text
1–1.5 seconds
```

Camera slowly pushes toward the glass enclosure.

Subtle environmental audio:

- fluorescent hum;
- ventilation;
- faint electrical buzz.

No dialogue.

---

# 17. Shot 3 — Egg Begins Cracking

Duration:

```text
1 second
```

Show:

- small shell movement;
- visible fracture line;
- internal blue glow;
- soft cracking sound.

Use perhaps 2–3 major crack lines.

Do not make the animation excessively complex.

---

# 18. Shot 4 — Tack Emerges

Duration:

```text
1–1.5 seconds
```

The egg breaks enough for Tack to squeeze/slip out.

Tack should immediately demonstrate:

- wobble;
- softness;
- curiosity.

The player should see the slime's shader clearly.

This is an important first impression.

---

# 19. Shot 5 — Tack Looks Around

Duration:

```text
0.75–1 second
```

Tack turns slightly.

Possible sequence:

```text
look left
look right
look at glass
```

No need for facial animation unless already planned.

Movement alone can communicate curiosity.

---

# 20. Shot 6 — Tack Tests the Glass

Tack moves into the side of the enclosure.

The container shifts slightly.

Pause.

Tack backs up or compresses.

Push again.

The container moves farther.

---

# 21. Shot 7 — Container Falls

The glass enclosure slides from the pedestal edge.

Important:

The player should understand the slime caused it.

Sequence:

```text
Tack pushes
      ↓
glass box shifts
      ↓
centre of mass passes pedestal edge
      ↓
box tips
      ↓
falls
```

---

# 22. Shot 8 — Glass Break

The container hits the floor.

Use:

- glass impact sound;
- breaking visual;
- small shards/debris;
- short particle burst.

For performance and implementation simplicity, do not simulate dozens of physics shards.

Use authored break pieces.

For example:

```text
IntactGlassContainer
        ↓ hide/remove

BrokenGlassGroup
        ↓ show
```

The broken group can contain:

```text
5–10 larger shard meshes
+
small particle effect
```

No dynamic rigid-body simulation is required.

---

# 23. Shot 9 — Gameplay Handoff

Tack lands outside the broken container.

Camera settles into the standard third-person follow position.

Control is enabled.

The transition should be smooth.

Do not hard-cut if avoidable.

---

# 24. Skip Behaviour

The cutscene should be skippable.

On skip:

- hide intact egg state;
- show broken glass state;
- place Tack at gameplay spawn;
- reset camera to follow mode;
- enable controls.

Skipping must never leave the room in an incorrect state.

---

# 25. Gameplay Spawn Position

After the cutscene:

```text
Position:
close to pedestal
```

Suggested:

```text
X = 0
Y = slime radius above floor
Z = 0.5
```

The player should have a clear view of:

- broken glass;
- surrounding room;
- door wall.

---

# 26. Broken Glass

Broken glass should remain visible after the cutscene.

This provides environmental continuity.

However:

**Do not make glass shards hazardous.**

Tack should be able to move through/around them safely.

Either:

- disable collision on small shards;
- or use very simple non-obstructive collision.

Do not let the player get stuck.

---

# 27. Zone 2 — Initial Exploration

Once control begins, allow the player a few seconds of free exploration.

The room should be small enough that the intended exit wall is easy to find.

There should only be one obvious conventional exit:

```text
THE DOOR
```

This causes a natural thought process:

> “I should probably go through that door.”

---

# 28. Basic Movement Teaching

Room 1 is also where the player becomes accustomed to:

- WASD movement;
- mouse camera;
- character turning;
- basic collision.

Do not combine this immediately with difficult vertical movement.

The floor around the pedestal should be open.

Minimum clear radius:

```text
3–4 metres
```

around the spawn.

---

# 29. Door Position

Place the door on the same wall that contains the vent.

Suggested:

```text
X = +3.5
Z = +6
```

Wall:

```text
+Z perimeter wall
```

Approximate door size:

```text
Width:  2.4–2.8 m
Height: 3.0 m
```

The door should look like a normal laboratory/security door.

---

# 30. Door Appearance

Suggested features:

- reinforced white/grey panels;
- dark seam down centre;
- small control panel;
- red status light;
- metal frame.

Possible status:

```text
LOCKED
```

but avoid requiring text.

A red light is enough.

---

# 31. Door Interaction

Tack cannot open doors.

The player can approach it.

Possible feedback:

- door remains closed;
- small denied beep;
- red indicator flashes;
- no interaction prompt needed.

The player should quickly understand:

> The obvious route does not work.

Do not spend more than a few seconds on this.

---

# 32. Avoid Fake Complexity

Do not include:

- keycard slot puzzle;
- terminal puzzle;
- button;
- movable crate;
- hidden key;
- switch.

The door exists specifically to force the player to look elsewhere.

---

# 33. Zone 3 — Sticky Wall Discovery

The sticky section should be on the **same wall as the door**.

This is crucial.

When the player approaches the door and looks around, they should naturally notice the unusual wall nearby.

The puzzle becomes visually contained in one area:

```text
LOCKED DOOR
        +
STRANGE WALL
        +
HIGH VENT
```

---

# 34. Sticky Wall Placement

Recommended arrangement:

```text
FRONT WALL / +Z WALL

┌───────────────────────────────────────────────┐
│                              VENT             │
│                               ▣               │
│                                               │
│       STICKY AREA                             │
│      ┌─────────────┐                 ┌─────┐  │
│      │             │                 │DOOR │  │
│      │             │                 │     │  │
│      │             │                 │     │  │
│      │             │                 └─────┘  │
│      │             │                          │
│      └─────────────┘                          │
│                                               │
└───────────────────────────────────────────────┘
```

The vent should be reachable from the top of the sticky route.

---

# 35. Sticky Wall Size

Recommended contaminated region:

```text
Width:
4–5 m

Height:
5–6 m
```

Beginning near the floor:

```text
Y ≈ 0
```

or very close to it.

This differs from Room 2.

In Room 1, the player is learning adhesion for the first time.

Therefore the sticky region should begin low enough that the player can simply walk into it.

---

# 36. Room 1 vs Room 2 Sticky Design

Important distinction:

### Room 1

```text
walk into sticky wall
      ↓
attach
      ↓
climb
```

### Room 2

```text
charged bounce
      ↓
catch elevated sticky patch
      ↓
attach
      ↓
climb
```

Room 1 teaches the mechanic.

Room 2 combines it with bounce.

---

# 37. Sticky Surface Environmental Explanation

Again, avoid making it look like an artificial climbing wall.

Possible explanation:

A damaged chemical pipe runs above this part of the wall.

The pipe has leaked corrosive or adhesive biological material downward.

Visual concept:

```text
            DAMAGED PIPE
        ════════════╤════
                    │
                   drip
                    │
                    ▼

             ▓▓▓▓▓▓▓▓▓
            ▓         ▓
           ▓  STICKY   ▓
          ▓   STAIN     ▓
         ▓              ▓
```

This makes the yellow-green wall treatment feel environmentally plausible.

---

# 38. Sticky Tile Appearance

The underlying wall should still visibly be the normal white laboratory tile.

The sticky version should be:

```text
NORMAL WHITE TILE
+
yellow-green staining
+
wet residue
+
corrosion
+
dark seams
```

Do not completely replace the wall material with slime.

The player should understand:

> These are contaminated laboratory tiles.

---

# 39. Surface Behaviour Rule

Only contaminated tiles are climbable.

```text
WHITE TILE
=
NORMAL
=
cannot stick
```

```text
YELLOW-GREEN TILE
=
STICKY
=
can stick
```

This becomes one of the game's fundamental visual languages.

---

# 40. First Adhesion Interaction

When Tack touches the sticky wall:

Provide immediate feedback.

### Visual

Tack slightly squashes against the surface.

### Orientation

The slime aligns appropriately to the wall.

### Audio

Use a:

```text
wet stick / suction
```

sound.

### Movement

The player can now move along the wall.

---

# 41. Camera During First Wall Transition

This is extremely important.

Do not snap the camera violently.

When Tack attaches:

- smoothly reorient;
- keep the vent visible if possible;
- allow the player to understand which direction is now "up" relative to the surface.

The project plan specifically identifies comfortable surface reorientation as a major movement risk.

Use approximately:

```text
0.2–0.3 seconds
```

for orientation interpolation as a starting point.

---

# 42. Sticky Route Shape

The easiest version is a broad upward route.

For example:

```text
             VENT
              ▣
             ▲
             │
        █████████
        █       █
        █       █
        █       █
        █       █
        █       █
        █       █
        █       █
────────█████████──────── FLOOR
```

However, a slightly more interesting shape is preferable:

```text
                VENT
                  ▣
                  ▲
             ██████
             █
             █
        ██████
        █
        █
        █
────────█──────────────── FLOOR
```

This forces a small amount of sideways climbing without becoming difficult.

---

# 43. Recommended Sticky Path

Use a mostly vertical strip with one slight horizontal offset.

Example:

```text
HEIGHT

8m              [VENT]
                   ▣
                 ████
                 ████
            █████████
            ████
            ████
            ████
0m ─────────████────────────────
```

This teaches:

- climb upward;
- move sideways while attached;
- continue upward.

Do not require ceiling traversal yet.

---

# 44. Vent Position

Place the vent high on the same wall.

Suggested:

```text
X = -2.5
Y = 6.5
Z = +5.9
```

Exact position depends on room dimensions.

The important relationship:

```text
sticky path
     ↓
terminates beside/below
     ↓
vent entrance
```

---

# 45. Vent Opening Dimensions

Recommended:

```text
Width:  1.8–2.2 m
Height: 1.2–1.5 m
Depth:  1–1.5 m initially
```

It should look:

- large enough for Tack;
- obviously too small for a human;
- clearly navigable.

---

# 46. Vent Grate

The vent should already be open.

Do not require Tack to break the vent cover.

Possible presentation:

- grate missing;
- grate hanging loose;
- grate lying on floor;
- screws broken.

This communicates facility decay.

---

# 47. Vent Framing

Use:

- dark metal border;
- screws;
- inner duct shadow;
- subtle airflow particle/dust.

The dark opening contrasts strongly against the white wall.

This makes it an obvious goal.

---

# 48. Player Entry Into Vent

When Tack reaches the vent:

The player should simply move into it.

Do not trigger a cutscene.

Maintain control.

The camera should transition naturally to the confined space.

---

# 49. Vent Duct — Design Purpose

The vent has three purposes.

### Purpose 1 — Spatial Separation

It communicates that Room 2 is somewhere else in the facility.

### Purpose 2 — Pacing

It provides a short quiet transition between learning adhesion and learning bounce.

### Purpose 3 — Anticipation

The player knows they are heading somewhere but cannot immediately see what is coming.

The vent should therefore last long enough to feel like travel, but not long enough to become boring.

Target traversal time:

```text
10–20 seconds
```

---

# 50. Vent Scale

Recommended internal dimensions:

```text
Width:  2.0 m
Height: 1.6 m
```

Tack should have comfortable movement space.

Avoid making the duct so tight that camera collision becomes frustrating.

---

# 51. Vent Camera Consideration

Because the normal third-person camera may not fit inside a narrow duct, handle this deliberately.

Possible approach:

When inside the duct:

```text
camera distance automatically decreases
```

For example:

```text
Normal camera:
4–5 m behind player

Vent camera:
2–2.5 m behind player
```

Transition smoothly.

Do not abruptly switch to first-person unless that is part of the overall camera design.

---

# 52. Vent Route

The vent should not be perfectly straight.

Use several simple changes in direction.

Suggested route:

```text
ROOM 1
  │
  ▼
VENT ENTRY
  │
  │ straight
  ▼
90° TURN
  │
  │ short straight
  ▼
SLIGHT DOWNWARD SECTION
  │
  ▼
90° TURN
  │
  │ longer straight
  ▼
FINAL DROP SHAFT
  │
  ▼
ROOM 2
```

---

# 53. Recommended Vent Geometry

Example:

```text
TOP-DOWN

ROOM 1
  │
  ▼
┌───────────────┐
│               │
│               └─────────────┐
│                             │
│                             │
└───────────────────────┐     │
                        │     │
                        │     │
                        ▼     │
                     DROP     │
                              │
                           ROOM 2
```

Do not make it a maze.

There should be exactly one route.

---

# 54. Vent Segment Dimensions

Suggested:

### Segment A

```text
Length: 5 m
```

Straight away from Room 1.

### Segment B

```text
Length: 4 m
```

After first 90° turn.

### Segment C

```text
Length: 6–8 m
```

Main travel section.

### Final Segment

```text
Length: 3–4 m
```

leading to drop.

Total effective route:

```text
18–22 m
```

This makes Room 2 feel meaningfully displaced from Room 1.

---

# 55. Vertical Changes

Include one shallow slope or stepped-down duct section.

Example:

```text
──────────────
              \
               \
                ─────────────
```

Do not introduce a complicated slide mechanic.

The slope simply makes the duct feel architectural.

---

# 56. Vent Interior Materials

Use:

- dark galvanized metal;
- aluminium;
- steel panels;
- rivets;
- seams;
- subtle roughness.

Suggested palette:

```text
Dark metal:
#444A4D

Medium metal:
#687176

Edge highlight:
#899397
```

The vent should visually contrast strongly with the bright white chamber.

---

# 57. Vent Lighting

The vent should be darker than Room 1 but not difficult to navigate.

Possible lighting:

- light spilling in from Room 1 entrance;
- small maintenance lights;
- light leaking through seams;
- final light from Room 2.

Avoid full darkness.

Level 3 is where darkness becomes a core mechanic.

---

# 58. Maintenance Lights

Small lights can be placed periodically.

For example:

```text
[light]────4m────[light]────5m────[light]
```

Use cool white.

Some can flicker slightly for atmosphere.

Do not make flickering strong enough to cause visual discomfort.

---

# 59. Vent Environmental Detail

Possible details:

- cable bundles;
- maintenance labels;
- bolts;
- vent seams;
- small dust particles;
- condensation;
- occasional leaking pipe;
- loose panel.

Keep collision simple.

Decorative elements should not block the player.

---

# 60. Audio in Vent

The soundscape should change noticeably.

Room 1:

```text
open fluorescent room hum
```

Vent:

```text
metal resonance
airflow
distant machinery
Tack movement sounds
```

Foot/slime movement should sound slightly more metallic.

This helps sell the transition.

---

# 61. Optional Environmental Story Beat

The player can pass a small side grate.

Through it, they might briefly see:

- another corridor;
- abandoned lab equipment;
- distant flashing light;
- broken containment chamber.

This should be decorative only.

Do not create an accessible branch.

Example:

```text
VENT
─────────────────────────────
          │
          │ small grate
          ▼
     [facility glimpse]
```

This helps make the game world feel larger than the playable rooms.

---

# 62. Vent Navigation Language

Because there is only one route:

Do not use arrows everywhere.

Instead:

- block unused branches;
- use light;
- use duct shape;
- use airflow/dust direction.

If a false branch exists aesthetically, clearly seal it.

Example:

```text
PLAYER ROUTE ──────────────►

FALSE ROUTE
    │
    └── metal grate / collapsed duct
```

---

# 63. Final Vent Section

The final stretch should become slightly brighter.

The player should begin hearing a larger room ambience.

This creates anticipation.

Possible cues:

- brighter white light from below;
- larger reverb;
- machinery sound;
- open-air sound replacing tight duct resonance.

---

# 64. Final Drop

The duct should end in a floor opening.

The player should be able to see that there is a drop.

But ideally they should **not see all of Room 2 before falling**.

Frame the opening so the player sees:

```text
light
+
part of lower chamber
+
significant vertical distance
```

Then they move forward.

---

# 65. Final Drop Geometry

Suggested:

```text
VENT FLOOR
──────────────────────┐
                      │
                      │
                      │
                      │
                      ▼
                  ROOM 2
```

The drop should be unavoidable once Tack passes the final lip.

---

# 66. Relationship With Room 2 Bounce

The final vent opening should align with Room 2's landing area.

Room 2's automatic bounce tutorial depends on the fall being substantial.

Target total fall:

```text
10–14 m
```

depending on physics tuning.

Do not place geometry between the vent and landing floor.

---

# 67. Transition Ownership

Room 1 and Room 2 can technically be separate level geometry sections.

However, visually the vent should make them feel continuous.

Possible implementation:

```text
Room1Root
├── ContainmentChamber
└── VentDuct

Room2Root
└── BounceChamber
```

or:

```text
Level1Root
├── Room1
├── Vent1to2
└── Room2
```

The second structure may make more sense if all these rooms belong to Level 1.

---

# 68. Checkpoint Logic

Room 1 start checkpoint:

```text
after opening cutscene
```

If Tack somehow leaves the world in Room 1:

```text
respawn near broken containment pedestal
```

Once the player falls into Room 2:

```text
activate Room 2 checkpoint
```

Do not respawn the player inside the duct unless necessary.

---

# 69. Falling From Sticky Wall

If Tack detaches while climbing in Room 1:

They simply fall to the Room 1 floor.

No death.

This is a tutorial.

Expected retry:

```text
< 5 seconds
```

---

# 70. No Bounce Requirement in Room 1

Even if Tack technically has the bounce ability from the start, Room 1 should not require it.

The intended escape should work using:

```text
walk
+
adhesion
+
climb
```

This ensures the player learns mechanics in the correct order.

---

# 71. Prevent Sequence Breaking

Because Tack may technically be capable of bouncing before Room 2, ensure the vent cannot easily be reached by simply jumping from the floor.

Possible approaches:

- vent sufficiently high;
- vent recessed slightly;
- normal wall around it non-sticky;
- jump height below vent height.

The intended solution should clearly remain:

```text
sticky wall
```

---

# 72. Lighting — Room 1

The room should be among the brightest environments in the game.

Use:

### Ambient / Hemisphere

Soft cool illumination.

### Ceiling Lights

Several rectangular fluorescent panels.

### Pedestal Highlight

Subtle focused light around specimen enclosure.

### Door Indicator

Red.

### Vent

Slightly darker interior.

### Sticky Area

Lighting should make the yellow-green colour clearly visible.

---

# 73. Suggested Ceiling Design

The ceiling should contain:

- fluorescent panel lights;
- ventilation pipes;
- structural seams;
- conduit;
- damaged pipe above sticky region.

Avoid excessive clutter.

The ceiling matters because the player will look upward toward the vent.

---

# 74. Suggested Floor Design

Use white/grey laboratory tiles.

Possible tile size:

```text
1–2 m
```

Include:

- drainage grate near pedestal;
- specimen zone outline;
- subtle floor markings;
- scuffs where containment box falls.

After cutscene, broken glass can visually interrupt the clean floor.

---

# 75. Observation Window

Optional but strongly recommended.

Place an observation window on a wall opposite or perpendicular to the door wall.

Example:

```text
┌──────────────────────────────────┐
│                                  │
│      OBSERVATION WINDOW          │
│   ┌──────────────────────────┐   │
│   │                          │   │
│   │     DARK EMPTY ROOM      │   │
│   │                          │   │
│   └──────────────────────────┘   │
│                                  │
└──────────────────────────────────┘
```

Behind it:

- empty chair;
- dead monitors;
- lab desk;
- no people.

This reinforces that Tack was being observed.

---

# 76. Observation Window Position

Suggested:

```text
centre height:
Y ≈ 3–4 m
```

Large enough for visual impact:

```text
Width: 5–7 m
Height: 2–2.5 m
```

---

# 77. Environmental Storytelling

Room 1 should tell a simple story without text:

```text
Tack was contained here.
      ↓
Facility was designed to observe Tack.
      ↓
Something has gone wrong.
      ↓
Nobody is present.
      ↓
Containment infrastructure is deteriorating.
      ↓
Tack escapes using the facility's decay.
```

That last part is important.

The contaminated sticky wall is not merely gameplay material.

It represents **the facility failing in a way that helps the specimen escape**.

---

# 78. Suggested Signage

Keep signage sparse.

Possible labels:

```text
CONTAINMENT 01
```

```text
BIOLOGICAL TESTING
```

```text
SPECIMEN T-01
```

```text
AUTHORIZED PERSONNEL
```

Do not provide exposition paragraphs.

---

# 79. Colour Palette

Suggested:

```text
PRIMARY WALL
#E1E5E6
off-white

SECONDARY WALL
#BBC2C5
cool grey

METAL
#424A4E

DARK RECESSES
#20272A

STICKY
#9EAD38

STICKY DARK
#59651F

SLIME
blue / blue-green

LOCKED DOOR
red indicator

VENT INTERIOR
dark metallic grey
```

Exact colours can be tuned.

---

# 80. Audio — Room 1

Base ambience:

- ventilation hum;
- fluorescent electrical noise;
- distant facility machinery;
- subtle room tone.

Keep music minimal at first.

The opening should feel isolated.

---

# 81. Important Sound Events

Use distinct sound cues for:

### Egg

```text
soft crack
wet shell break
```

### Tack Emerging

```text
soft gel / wet movement
```

### Glass Fall

```text
glass sliding
impact
shatter
```

### Door

```text
denied electronic beep
```

### Sticky Wall

```text
wet suction
```

### Vent Entry

```text
metal movement ambience
```

---

# 82. Greybox Version

Before adding any art, Room 1 should work using simple primitives.

Use:

```text
Room shell:
BoxGeometry / planes

Pedestal:
BoxGeometry

Glass:
transparent box

Egg:
Sphere / stretched sphere

Door:
box

Sticky region:
wall section with yellow-green material

Vent:
rectangular tunnel
```

The first goal is functional gameplay.

---

# 83. Greybox Development Colours

During development:

```text
WHITE
normal environment

BLUE
player/spawn debug

YELLOW-GREEN
sticky

RED
locked/inaccessible

BLACK/DARK GREY
vent

GREEN
transition/exit debug
```

---

# 84. Recommended Build Order — Room 1

Build in this exact order.

## Phase 1 — Room Shell

1. Create floor.
2. Create four perimeter walls.
3. Create ceiling.
4. Confirm basic collision.

---

## Phase 2 — Gameplay Route

5. Add closed door.
6. Add vent opening.
7. Add sticky wall region.
8. Tag only sticky region as `STICKY`.
9. Verify Tack can climb it.
10. Verify Tack cannot climb clean walls.
11. Verify Tack can enter vent.

At this point:

**Room 1 should already be completable.**

---

## Phase 3 — Vent

12. Create first straight duct section.
13. Add first corner.
14. Add middle section.
15. Add downward variation.
16. Add final corridor.
17. Add vertical drop.
18. Connect drop to Room 2 landing area.
19. Test complete traversal.

---

## Phase 4 — Containment Set Piece

20. Add pedestal.
21. Add glass enclosure.
22. Add egg.
23. Add gameplay spawn.
24. Add broken glass state.

---

## Phase 5 — Opening Cutscene

25. Create establishing camera.
26. Add camera push.
27. Animate egg crack.
28. Animate Tack emergence.
29. Animate glass push.
30. Animate glass fall.
31. Swap to broken-glass state.
32. Transition to gameplay camera.
33. Implement skip behaviour.
34. Test skipping repeatedly.

---

## Phase 6 — Art

35. Add final wall materials.
36. Add laboratory tile pattern.
37. Add sticky contamination.
38. Add damaged pipe.
39. Add observation window.
40. Add signage.
41. Add ceiling details.
42. Add floor details.
43. Add vent materials.

---

## Phase 7 — Lighting and Audio

44. Add clinical lighting.
45. Add pedestal emphasis.
46. Add door indicator.
47. Add room ambience.
48. Add cutscene sounds.
49. Add sticky sound.
50. Add vent ambience.

---

# 85. Complete Side View

```text
ROOM 1 SIDE ELEVATION

Y = 8m
┌───────────────────────────────────────────────────────┐
│                                        VENT           │
│                                         ▣             │
│                                      █████            │
│                                 ███████████            │
│                                 █ STICKY ██            │
│                                 █ WALL   ██    DOOR    │
│                                 █        ██   ┌────┐   │
│                                 █        ██   │    │   │
│                                 █        ██   │    │   │
│                                 █        ██   │    │   │
│                                 █        ██   └────┘   │
│                                                       │
│                     GLASS BOX                         │
│                    ┌─────────┐                        │
│                    │   EGG   │                        │
│                    └─────────┘                        │
│                    ╔═════════╗                        │
│                    ║PEDESTAL ║                        │
│────────────────────╚═════════╝────────────────────────│
└───────────────────────────────────────────────────────┘
Y = 0m
```

---

# 86. Complete Top-Down View

```text
                         +Z
                          ↑

┌──────────────────────────────────────────────────────┐
│                                                      │
│ STICKY WALL                           VENT            │
│ ███████████                             ▣             │
│ █         █                                           │
│ █         █                                ┌─────┐    │
│ █         █                                │DOOR │    │
│ █         █                                │     │    │
│                                           └─────┘    │
│                                                      │
│                                                      │
│                                                      │
│                      ┌──────────┐                    │
│                      │  GLASS   │                    │
│                      │   EGG    │                    │
│                      └──────────┘                    │
│                       PEDESTAL                       │
│                                                      │
│                                                      │
│         OPTIONAL                                     │
│      OBSERVATION                                     │
│         WINDOW                                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

# 87. Vent Duct Diagram

```text
ROOM 1

   VENT ENTRY
       │
       ▼
╔══════════════╗
║              ║
║  SEGMENT A   ║
║              ╚══════════╗
║                         ║
╚════════╗    SEGMENT B   ║
         ║                 ║
         ╚═════════════════╝
                  │
                  ▼
           SLIGHT DESCENT
                  │
                  ▼
        ╔══════════════════╗
        ║    SEGMENT C     ║
        ╚══════════╗       ║
                   ║       ║
                   ║       ║
                   ▼       ║
               FINAL       ║
               DROP        ║
                   │
                   │
                   ▼
                ROOM 2
```

---

# 88. Full Opening Gameplay Flow

```text
WIDE SHOT OF LAB
       ↓
CAMERA APPROACHES EGG
       ↓
EGG CRACKS
       ↓
TACK HATCHES
       ↓
TACK LOOKS AROUND
       ↓
TACK PUSHES GLASS
       ↓
GLASS FALLS
       ↓
GLASS BREAKS
       ↓
PLAYER CONTROL
       ↓
EXPLORE ROOM
       ↓
TRY LOCKED DOOR
       ↓
NOTICE VENT
       ↓
NOTICE STICKY WALL
       ↓
TOUCH STICKY WALL
       ↓
ATTACH
       ↓
CLIMB
       ↓
ENTER VENT
       ↓
CAMERA MOVES CLOSER
       ↓
TRAVEL THROUGH DUCT
       ↓
TURN
       ↓
DESCEND
       ↓
TURN
       ↓
SEE LIGHT AHEAD
       ↓
REACH DROP
       ↓
FALL
       ↓
ROOM 2
       ↓
BIG BOUNCE
```

---

# 89. Expected Player Understanding

By the time the player leaves the ventilation duct, they should understand:

### Movement

> I can move freely and control the camera.

### Character

> I am a small elastic slime specimen.

### Environment

> I am escaping some kind of abandoned research facility.

### Doors

> Conventional human exits are not necessarily usable.

### Surfaces

> Clean white walls are normal.

### Sticky Material

> Yellow-green contaminated walls can be climbed.

### Navigation

> The environment itself shows me alternate routes.

They should **not yet be expected to understand the big charged bounce mechanic**.

That comes immediately after the vent drop in Room 2.

---

# 90. Expected Completion Time

Opening cutscene:

```text
6–10 seconds
```

First-time Room 1 traversal:

```text
1–3 minutes
```

Vent:

```text
10–20 seconds
```

Experienced Room 1 traversal:

```text
30–45 seconds
```

The whole opening should feel quick.

Do not make the player spend five minutes figuring out the first room.

---

# 91. What Room 1 Must NOT Include

Do not include:

- lasers;
- death hazards;
- difficult platforming;
- bounce-required jumps;
- moving platforms;
- enemies;
- pressure plates;
- Etch;
- Volt;
- dissolve mechanics;
- terminals;
- multiple puzzle solutions;
- hidden maze routes;
- long dialogue;
- text logs;
- complicated exposition.

The room's purpose is:

> **Introduce Tack and teach adhesion.**

---

# 92. Critical Relationship With Room 2

Room 1 should end with the player thinking:

> “I now understand that I can climb sticky surfaces.”

The duct then removes the player from that space.

Room 2 begins with:

> “Wait — I can bounce too?”

This separation is important.

Do not begin explicitly teaching bounce inside Room 1.

The automatic fall from the vent into Room 2 should be the first dramatic demonstration of Tack's elasticity.

---

# 93. Final Acceptance Criteria — Room 1

Room 1 is complete only when:

- [ ] The room reads immediately as a sterile biological containment chamber.
- [ ] Tack begins inside an egg within a glass containment box.
- [ ] The glass box sits on a central pedestal.
- [ ] The opening cutscene shows Tack hatching.
- [ ] Tack causes the containment box to fall.
- [ ] The glass breaks.
- [ ] Gameplay begins with Tack outside the broken container.
- [ ] The opening cutscene is short.
- [ ] The cutscene can be skipped safely.
- [ ] Broken glass remains visible afterward.
- [ ] Broken glass cannot softlock or injure the player.
- [ ] The room contains one obvious conventional door.
- [ ] The conventional door cannot be opened.
- [ ] The room contains a high open ventilation shaft.
- [ ] The vent and door are on the same wall.
- [ ] A visibly contaminated sticky section exists on that wall.
- [ ] The sticky section is part of the existing perimeter wall.
- [ ] It is not a freestanding climbing wall.
- [ ] Clean white walls are non-climbable.
- [ ] Yellow-green contaminated tiles are climbable.
- [ ] The sticky section begins low enough for Tack to discover by walking into it.
- [ ] Tack can climb from floor level to the vent.
- [ ] The camera transitions smoothly when Tack attaches.
- [ ] Falling from the wall does not kill the player.
- [ ] The player can immediately retry.
- [ ] Bounce is not required to solve Room 1.
- [ ] Tack can enter the vent directly from the climbing route.
- [ ] The player cannot trivially jump directly into the vent from the floor.

---

# 94. Final Acceptance Criteria — Vent Duct

The ventilation transition is complete only when:

- [ ] The duct physically connects Room 1 to the Room 2 transition.
- [ ] It feels long enough to imply travel through the facility.
- [ ] It is not a maze.
- [ ] There is exactly one valid route.
- [ ] The route contains at least one turn.
- [ ] The route contains some vertical change.
- [ ] Camera distance adapts comfortably to the confined space.
- [ ] Vent geometry does not cause camera clipping.
- [ ] Vent details do not obstruct Tack.
- [ ] Lighting is darker than Room 1 but remains readable.
- [ ] Vent ambience sounds more enclosed and metallic.
- [ ] The final section subtly foreshadows a larger chamber.
- [ ] The player reaches a clear floor opening.
- [ ] Falling through the opening transitions naturally into Room 2.
- [ ] The fall is large enough to trigger Room 2's introductory bounce.
- [ ] The player cannot become stuck between Room 1 and Room 2.

---

# 95. Final Design Principle

When making any Room 1 design decision, ask:

> **Does this help the player understand that Tack is an escaped specimen and that contaminated surfaces are climbable?**

When making any vent design decision, ask:

> **Does this make the journey into the next part of the facility feel believable without slowing the game down?**

The intended progression is:

```text
ROOM 1
“I'm trapped.”

        ↓

DOOR
“I can't leave normally.”

        ↓

STICKY WALL
“I can climb this.”

        ↓

VENT
“I found another route.”

        ↓

DUCT
“I'm moving deeper through the facility.”

        ↓

DROP
“Uh oh.”

        ↓

ROOM 2
“WAIT — I CAN BOUNCE?”
```

That final transition should be the payoff.