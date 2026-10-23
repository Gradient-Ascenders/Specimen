# Slimebound — Room 2: Bounce Calibration Chamber

## 1. High-Level Design Intent

Room 2 is the **second playable room of Level 1**.

Its sole primary purpose is to teach the player that Tack, the blue slime, is capable of performing **large, deliberate jumps/bounces**.

Room 1 taught the player:

> Certain marked surfaces are sticky, and Tack can climb them.

Room 2 should teach:

> Tack is naturally elastic. It can compress, launch itself with significant force, and use that force both vertically and horizontally.

Room 3 will then ask the player to combine both abilities while dealing with lethal hazards.

The progression should therefore be:

**Room 1: Learn to stick.**  
↓  
**Room 2: Learn to bounce.**  
↓  
**Room 3: Prove you can use both under pressure.**

Room 2 is still technically a tutorial room.

It should therefore be:

- forgiving;
- readable;
- mostly hazard-free;
- visually simple;
- impossible or very difficult to become permanently stuck in;
- designed around immediate retries;
- focused on one mechanic at a time.

There should be **no lasers or lethal security hazards in this room**.

The player should leave Room 2 understanding:

1. Falling can create a large rebound.
2. Tack can intentionally charge and perform a large jump.
3. More charge produces more jump force.
4. Jumping is useful for vertical traversal.
5. Jumping is useful for crossing horizontal gaps.
6. Jumping and wall adhesion can be chained together.
7. A badly aimed jump is recoverable, but precision will matter later.

---

# 2. Narrative Context

The player has just escaped the original containment chamber through a ventilation duct.

Importantly:

**Room 2 is NOT directly beside Room 1.**

The ventilation system has carried the slime through the facility before depositing it into another chamber.

The player should therefore feel as though they have travelled into another part of the laboratory rather than simply entering the next room through a wall.

The transition should be:

```text
ROOM 1
Containment Chamber
      │
      │ climb
      ▼
Upper Vent
      │
      │ narrow ventilation duct
      │
      │ several metres of travel
      ▼
Vertical Vent Drop
      │
      │
      │   FALL
      │
      ▼
ROOM 2
Bounce Calibration Chamber
```

The player crawls through the duct until the floor disappears beneath them.

They fall through a vent opening near the ceiling of Room 2.

This fall becomes the introduction to the bounce mechanic.

---

# 3. First Impression

The player should enter Room 2 **from above**, not from a conventional doorway.

The camera initially looks downward while the slime falls.

The chamber suddenly opens beneath the player.

The player sees:

- a large white laboratory chamber;
- several platforms at different heights;
- an upper walkway;
- a distant open doorway;
- observation windows;
- large amounts of vertical space.

The room should immediately communicate:

> “This area is about going upward.”

The player hits the floor.

Tack should visibly:

1. squash almost flat;
2. pause for a fraction of a second;
3. rapidly stretch vertically;
4. rebound several metres into the air;
5. wobble while reaching the top of the bounce;
6. fall back down;
7. settle.

This should happen naturally as part of the physics.

Do **not** explain the mechanic before this happens.

The player should first **see and feel the bounce**.

---

# 4. Reference Direction

Use the following games and visual concepts as **design references**, not things to copy directly.

## Portal / Portal 2 — Test Chambers

Reference these for:

- modular white laboratory architecture;
- highly readable puzzle geometry;
- large empty chambers;
- platforms clearly separated from decorative geometry;
- observation windows;
- sterile environments where level geometry itself communicates the solution.

The important lesson from Portal is:

> The player should be able to look around the room and understand which geometry matters.

Search/reference terms:

**“Portal 2 clean test chamber”**

**“Portal 2 vertical test chamber”**

**“Portal 2 observation room white panels”**

---

## Portal 2 — Repulsion Gel

This is useful as a behavioural reference for the sensation of a strong bounce.

Do not copy the gel mechanic or visual design.

Reference:

- exaggerated compression;
- sudden upward acceleration;
- satisfying launch height;
- strong visual and audio feedback;
- obvious difference between ordinary movement and bouncing.

Search/reference term:

**“Portal 2 repulsion gel bounce chamber”**

---

## Mirror's Edge — Traversal Readability

Use Mirror's Edge primarily as a reference for **navigation language**.

Important idea:

> Traversable geometry should visually separate itself from irrelevant environment geometry.

Slimebound already has this principle with the yellow-green sticky surfaces.

Avoid filling the room with unnecessary detail that disguises the intended route.

Search/reference terms:

**“Mirror's Edge environmental navigation design”**

**“Mirror's Edge traversal visual language”**

---

## Animation Reference — Squash and Stretch

Tack's bounce should strongly use classical squash-and-stretch principles.

When landing:

```text
NORMAL

      __
    /    \
   |      |
    \____/


IMPACT

   __________
  /          \
  \__________/


LAUNCH

      /\
     /  \
    |    |
    |    |
     \  /
      \/
```

The collider should remain stable.

Only the visual slime mesh needs to deform dramatically.

---

# 5. Room Scale

Assume:

> **1 Three.js world unit ≈ 1 metre**

If the project currently uses a different world scale, preserve the **relative proportions** rather than these exact numbers.

Recommended Room 2 interior dimensions:

- **Width:** 30 m
- **Depth:** 22 m
- **Height:** 18 m

Approximate bounds:

```text
X: -15 → +15
Y:   0 → +18
Z: -11 → +11
```

The floor is:

```text
Y = 0
```

The room should be significantly taller than Room 1.

A player entering should immediately notice the vertical volume.

---

# 6. Coordinate Convention

Use:

```text
+Y = Up

+X = Right when looking into the room from the entry side

+Z = Toward the final exit
```

Conceptually:

```text
                 FINAL EXIT
                    +Z
                     ↑
                     │
                     │
      -X  ←──────────┼──────────→ +X
                     │
                     │
                     │
                   ENTRY
                    -Z
```

---

# 7. Overall Spatial Composition

The chamber should broadly be divided into five gameplay zones.

```text
┌──────────────────────────────────────────────┐
│                                              │
│                    ZONE 5                    │
│              FINAL UPPER WALKWAY             │
│                    EXIT                      │
│                                              │
│                           ┌──────────────┐    │
│                           │              │    │
│                    ZONE 4 │  HIGH LEDGE  │    │
│                           │              │    │
│                           └──────┬───────┘    │
│                                  │            │
│                                  │ Sticky     │
│                                  │ Wall       │
│                                              │
│             ┌────────────┐                   │
│             │   ZONE 3   │                   │
│             │ GAP JUMP   │                   │
│             └────────────┘                   │
│                                              │
│     ┌──────────────┐                         │
│     │    ZONE 2    │                         │
│     │ HEIGHT JUMP  │                         │
│     └──────────────┘                         │
│                                              │
│  ↓ VENT                                      │
│                                              │
│       ZONE 1                                 │
│   LANDING / BOUNCE                           │
│                                              │
└──────────────────────────────────────────────┘
```

The route should not simply be a straight staircase.

Make the player move:

- upward;
- forward;
- sideways;
- across gaps.

The level should use all three dimensions.

---

# 8. Room Architecture

The overall chamber should resemble an old mobility-testing facility.

Historically, the laboratory could have used the room to test containment specimens or experimental organisms.

Environmental details can imply this without text.

Include:

- large white wall panels;
- modular square tiles;
- reinforced steel support columns;
- recessed fluorescent lights;
- observation windows;
- numbered test markings;
- industrial vents;
- cable conduits;
- laboratory signage;
- caution strips near platform edges;
- ceiling ventilation infrastructure.

Do not overfill the environment.

Aim for approximately:

```text
70% clean architectural surfaces
20% functional level geometry
10% environmental decoration
```

The room needs negative space.

---

# 9. Material Language

## Normal Walls

Colour:

- off-white;
- light grey;
- very subtle blue tint.

Material characteristics:

```text
roughness ≈ 0.55–0.7
metalness ≈ 0.0–0.1
```

Use normal maps or panel details if available.

The surface should feel like:

- ceramic laboratory panel;
- coated concrete;
- polymer containment panel.

---

## Floor

Use larger square laboratory tiles.

Suggested pattern:

```text
1 m × 1 m
or
2 m × 2 m
```

Keep the pattern subtle.

The player should be able to visually judge distance using the tile grid.

This is useful because jumping depends on spatial judgement.

---

## Platform Tops

Platform tops should contrast slightly with ordinary architecture.

Possible treatment:

- light grey upper surface;
- dark metal sides;
- thin yellow-black safety marking around edges.

Do not make the platforms completely different colours.

They still belong to the facility.

---

## Sticky Surface

Reuse the exact visual language established in Room 1.

Sticky surfaces should be:

- yellow-green;
- chemically stained;
- slightly glossy;
- corroded;
- visually contaminated.

Example palette direction:

```text
Base:
sickly yellow-green

Dark areas:
olive / dirty green

Highlights:
wet yellow-green
```

The player must instantly think:

> “I climbed that material before.”

Consistency matters.

---

# 10. Lighting

The chamber should remain part of Level 1's **bright clinical visual identity**.

Use approximately:

### Ambient / Hemisphere Light

Low intensity.

Purpose:

Prevent completely black shadows.

---

### Main Ceiling Lights

Several fluorescent fixtures or rectangular emissive panels.

Colour:

```text
cold white
```

Approximate colour temperature:

```text
5000–6000 K appearance
```

---

### Directional / Area Lighting

Use lighting to emphasize the platforms.

The route should remain readable from the floor.

Do not create dramatic darkness yet.

Darkness belongs to later levels.

---

### Exit Light

Place a slightly warmer or greener light around the exit door.

The player should subconsciously recognise it as the destination.

Example:

```text
EXIT
[ green indicator ]
```

Do not make it overwhelmingly bright.

---

# 11. Zone 1 — Vent Drop and Automatic Bounce

## Purpose

Teach:

> Falling causes Tack to rebound strongly.

This is a demonstration rather than a puzzle.

---

## Vent Position

Suggested:

```text
Position:
X = -9
Y = 17
Z = -7
```

Vent dimensions:

```text
Width: 2.0 m
Height: 1.2 m
```

The duct should end abruptly above the chamber.

The player falls roughly:

```text
10–14 metres
```

before hitting the floor.

---

# 12. Landing Area

Create a clear landing area underneath.

Approximate dimensions:

```text
7 m × 7 m
```

Position:

```text
X ≈ -9
Z ≈ -6
```

Do not place obstacles immediately around the player.

The player needs room to:

- bounce;
- land;
- experiment;
- rotate the camera.

The initial automatic rebound should reach approximately:

```text
3–4 metres
```

above the floor.

This is enough to feel dramatic without accidentally launching the player onto the next puzzle.

---

# 13. Landing Feedback

When Tack hits the floor after falling:

### Visual

Strong squash.

Example:

```text
Normal scale:
X 1.0
Y 1.0
Z 1.0

Impact approximation:
X 1.35
Y 0.55
Z 1.35
```

Then stretch:

```text
Launch approximation:
X 0.75
Y 1.45
Z 0.75
```

These should be visual values only.

Do not distort the collision body.

---

### Particle Effect

Small optional impact effect:

- dust;
- condensation;
- tiny debris;
- subtle floor particles.

Keep it restrained because this is a clean laboratory.

---

### Audio

Use a distinctive:

```text
SQUISH → BOING
```

sequence.

The bounce sound should become recognisable enough that the player associates it with gaining momentum.

---

### Camera

On the initial impact:

- apply an extremely small camera shake;
- no more than approximately 100–150 ms;
- immediately recover.

When Tack rebounds upward, allow the follow camera to show the increased vertical movement.

Do not lock the camera.

---

# 14. Zone 1 Player Experiment Area

After landing, the player should have enough open floor to test jumping.

Avoid text like:

> Press SPACE to jump.

unless playtesting proves players genuinely cannot discover it.

Prefer environmental teaching.

A platform should be visible nearby that clearly cannot be reached by simply walking.

The player's thought process should be:

> “I just bounced really high. Maybe I can do that deliberately.”

---

# 15. Zone 2 — First Intentional Height Jump

## Purpose

Teach:

> Charge → release → jump higher.

This should be the easiest intentional jump in the level.

---

## Platform A

Suggested position:

```text
X = -4
Y = 2.2
Z = -3
```

Suggested dimensions:

```text
Width: 5 m
Depth: 4 m
Height: 0.5 m
```

The top should therefore be roughly:

```text
Y = 2.2
```

above the floor.

Normal walking cannot reach it.

A modest jump should.

---

# 16. Teaching Charge

If the jump mechanic is:

```text
Hold Space → Charge
Release Space → Jump
```

then give strong feedback while charging.

### Charge Visual

As Space is held:

Tack slowly compresses.

Example:

```text
0% charge:
normal

50% charge:
slightly squashed

100% charge:
clearly compressed and trembling
```

---

### Charge Audio

Use a subtle rising:

```text
gel tension / elastic stretch
```

sound.

---

### Full Charge Indicator

Do NOT require a HUD meter unless necessary.

Prefer character feedback.

At full charge:

- Tack reaches maximum compression;
- wobble frequency increases;
- a soft sound cue occurs.

The player should be able to understand maximum charge by looking at the slime.

---

# 17. Jump Tuning Targets

These are tuning targets rather than absolute requirements.

Aim approximately for:

### Tap Jump

```text
Vertical reach:
1.5–2 m
```

### Medium Charge

```text
Vertical reach:
2.5–3.5 m
```

### Full Charge

```text
Vertical reach:
4–5 m
```

Horizontal velocity should depend on movement input.

Full charge with forward momentum should cover roughly:

```text
5–7 m
```

under ideal conditions.

The exact physics can change during playtesting.

---

# 18. Platform A Placement Logic

The first platform should only require approximately:

```text
40–50% charge
```

The player should succeed even with imperfect input.

This is not a skill check.

It is a discovery check.

---

# 19. Platform A Safety

If the player misses:

They simply land on the main floor.

No damage.

No death.

No restart.

They can immediately retry.

---

# 20. Zone 3 — Horizontal Gap Jump

## Purpose

Teach:

> Bounce is not only for going upward. Momentum can carry you forward.

From Platform A, the player should clearly see Platform B.

---

# 21. Platform B

Suggested:

```text
Position:
X = +2
Y = 3.0
Z = +1
```

Dimensions:

```text
5 m × 5 m
```

Approximate horizontal gap:

```text
4–5 m
```

The next platform should also be slightly higher.

This forces:

```text
forward movement
+
charge
+
jump
```

---

# 22. Gap Presentation

Place visible floor far below.

Do not use a death pit.

If the player fails:

```text
Player falls
       ↓
returns to Room 2 floor
       ↓
walks back to retry
```

Try to make the recovery route short.

Ideally:

```text
< 10 seconds
```

from failed jump to another attempt.

---

# 23. Jump Arc Readability

When standing on Platform A, the player should see Platform B almost fully.

Do not hide it behind:

- pipes;
- pillars;
- glass;
- machinery.

The problem should be:

> Can I make the jump?

Not:

> Where am I supposed to go?

---

# 24. Zone 3 Visual Composition

Possible side view:

```text
                       PLATFORM B
                    ┌──────────────┐
                    │              │
                    │              │
                    └──────────────┘
                           ↑
                          /
                         /
                        /
             JUMP ARC  /
                      /
                     /
      PLATFORM A    /
    ┌──────────────┐
    │              │
    └──────────────┘


──────────────────────────────────────── FLOOR
```

---

# 25. Zone 4 — Bounce Into Wall Adhesion

This is the final tutorial concept in Room 2.

## Purpose

Teach:

> Mechanics can be chained.

The player already learned sticky walls in Room 1.

Do not reteach climbing.

Instead, create a situation where the player must **jump to reach a sticky wall**.

---

# 26. Sticky Wall Location

Place a sticky wall segment ahead and above Platform B.

Suggested:

```text
Wall:
X ≈ +8
Z ≈ +4
```

Sticky section begins approximately:

```text
Y = 3
```

and extends to:

```text
Y = 9
```

Approximate dimensions:

```text
Width: 5 m
Height: 6 m
```

Normal floor traversal cannot reach it.

The player must launch from Platform B toward the wall.

---

# 27. Intended Interaction

The sequence should be:

```text
Platform B
    │
    │ charge
    ▼
Large jump
    │
    │ forward arc
    ▼
Sticky wall
    │
    │ attach
    ▼
Climb upward
```

This should feel like:

> “Oh — I can jump INTO a climb.”

That is an important mechanical revelation.

It prepares the player directly for Room 3.

---

# 28. Sticky Wall Catch Area

Make the sticky section generous.

Do not require pixel-perfect precision.

If Tack hits anywhere within a broad region:

```text
approximately 4–5 m wide
```

they should attach successfully.

This is still training.

Room 3 can demand precision later.

---

# 29. Zone 5 — Final Launch

At the top of the sticky wall, create a small ledge.

Suggested:

```text
Y ≈ 9 m
```

The player climbs onto it.

From this ledge, they see the final exit balcony.

---

# 30. Exit Balcony

Suggested:

```text
Position:
X = +9
Y = 10
Z = +8
```

Dimensions:

```text
Width: 7 m
Depth: 4 m
```

The player makes one final jump onto this platform.

This should require:

```text
medium-to-high charge
```

but should not be the hardest jump in the room.

The player has already demonstrated understanding.

---

# 31. Final Door

Place the exit door on the upper balcony.

The door should already be open.

This reinforces that the challenge is traversal, not door interaction.

Approximate dimensions:

```text
Width: 2.5 m
Height: 3 m
```

Use:

- green indicator light;
- illuminated frame;
- directional signage.

Possible text:

```text
TEST SECTOR B
```

or

```text
MOBILITY LAB
```

Avoid excessive narrative text.

---

# 32. Foreshadow Room 3

This is an important opportunity.

Through the open doorway, the player should see **a small glimpse of Room 3**.

Do not reveal the entire room.

Show only:

- a larger darker chamber;
- distant platforms;
- perhaps a faint red security light;
- possibly a barely visible laser beam.

This tells the player:

> The safe tutorial is ending.

Do not make the laser interact with the player yet.

---

# 33. Suggested Complete Side Elevation

```text
Y = 18m
┌────────────────────────────────────────────────────────────┐
│      ENTRY VENT                                            │
│         ↓                                                  │
│         ↓                                                  │
│         ↓                                                  │
│         ↓                                                  │
│                                           EXIT DOOR        │
│                                      ┌────────────────┐    │
│                                      │   ZONE 5       │    │
│                                      │ EXIT BALCONY   │    │
│                            ██████████└────────────────┘    │
│                            █ Sticky                        │
│                            █ Wall                          │
│                            █                               │
│                            █                               │
│                 ┌───────────────┐                          │
│                 │  PLATFORM B   │                          │
│                 └───────────────┘                          │
│         ┌───────────────┐                                  │
│         │  PLATFORM A   │                                  │
│         └───────────────┘                                  │
│                                                            │
│    ↓                                                       │
│   slime                                                    │
│    ↓                                                       │
│   SPLAT                                                    │
│─────── LANDING FLOOR ──────────────────────────────────────│
└────────────────────────────────────────────────────────────┘
Y = 0m
```

---

# 34. Suggested Top-Down Layout

```text
                         +Z
                          ↑

┌──────────────────────────────────────────────────────┐
│                                                      │
│                                     ┌─────────────┐  │
│                                     │ EXIT        │  │
│                                     │ BALCONY     │  │
│                                     └─────────────┘  │
│                                           ▲          │
│                                           │          │
│                               STICKY WALL │          │
│                                  █████████│          │
│                                  █████████│          │
│                                      ▲               │
│                                      │ jump          │
│                    ┌──────────────┐  │               │
│                    │ PLATFORM B   │──┘               │
│                    └──────────────┘                  │
│                           ▲                          │
│                           │ GAP JUMP                 │
│                           │                          │
│         ┌──────────────┐  │                          │
│         │ PLATFORM A   │──┘                          │
│         └──────────────┘                             │
│                ▲                                     │
│                │                                     │
│                │ first jump                          │
│                                                      │
│    VENT ↓                                            │
│                                                      │
│ ┌─────────────────┐                                  │
│ │ LANDING /       │                                  │
│ │ EXPERIMENT AREA │                                  │
│ └─────────────────┘                                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

# 35. Player Route

The expected player path should approximately be:

```text
VENT
 ↓
FALL
 ↓
AUTOMATIC BIG BOUNCE
 ↓
EXPERIMENT
 ↓
PLATFORM A
 ↓
GAP JUMP
 ↓
PLATFORM B
 ↓
JUMP TOWARD STICKY WALL
 ↓
ATTACH
 ↓
CLIMB
 ↓
UPPER LEDGE
 ↓
FINAL JUMP
 ↓
EXIT BALCONY
 ↓
ROOM 3
```

---

# 36. Camera Requirements

The camera is extremely important in this room because the player is learning to judge jump trajectories.

## Landing

On falling into the room:

The camera should show enough of the vertical space to make the fall understandable.

Do not point directly downward for the entire fall.

The player should briefly see:

- floor;
- nearby platforms;
- upper architecture.

---

## Normal Jump

During jumps:

The camera should smoothly follow vertical movement.

Avoid excessive lag because this makes landing difficult.

---

## Looking Up

The player should be able to comfortably look upward toward:

- higher platforms;
- sticky wall;
- exit.

Avoid ceilings or camera collision behaviour that prevents upward visibility.

---

## Platform Framing

When standing on one platform, the next intended destination should generally be visible without extreme camera manipulation.

---

# 37. Environmental Guidance

Guide the player's eye without arrows everywhere.

Use:

### Lighting

Slightly brighter light over useful platforms.

### Platform Edge Markings

Thin safety stripes.

### Architecture

Frames and support beams pointing toward the route.

### Sticky Material

Strong yellow-green visual difference.

### Exit Lighting

Green indicator.

The visual hierarchy should roughly be:

```text
1. Player
2. Next traversal target
3. Sticky surfaces
4. Exit
5. Environment decoration
```

---

# 38. Observation Window

Add an observation window to one wall.

Suggested size:

```text
8 m wide
3 m tall
```

Place it roughly:

```text
Y = 7–10 m
```

Behind it:

- empty observation room;
- dead monitors;
- abandoned chairs;
- dark silhouettes of equipment.

Do not populate it with humans.

This reinforces the abandoned laboratory atmosphere.

It also makes the chamber feel intentionally constructed as a testing environment.

---

# 39. Ceiling Detail

The ceiling should include:

- large ventilation ducts;
- fluorescent fixtures;
- structural beams;
- cable trays;
- the entry vent opening.

Avoid making it completely flat.

Since the player frequently looks upward, the ceiling matters visually.

---

# 40. Floor Detail

The floor below the platforms can contain:

- painted test-zone markings;
- numbered squares;
- drain grates;
- maintenance access panels;
- subtle scuff marks.

Possible markings:

```text
TEST ZONE 02
```

or simply:

```text
02
```

This gives the room identity without clutter.

---

# 41. Suggested Colour Palette

Approximate visual palette:

```text
MAIN WALLS
#DADFE1
off-white

SECONDARY PANELS
#AEB6BA
cool grey

METAL SUPPORTS
#424A50
dark industrial grey

STICKY MATERIAL
#9FAE38
yellow-green

STICKY DARK DETAIL
#56621E

WARNING MARKING
#D6A928

EXIT INDICATOR
soft green

SLIME
blue / blue-green
```

Exact values can change.

Maintain the relationship rather than exact hex values.

---

# 42. Audio Environment

Ambient sound:

- fluorescent hum;
- distant ventilation;
- subtle mechanical resonance;
- occasional distant metallic creak.

The chamber should sound slightly larger than Room 1.

Use mild reverb if the current audio architecture supports it cheaply.

---

# 43. Jump Audio

Three distinct stages are useful.

### Charging

```text
stretching / rising elastic tension
```

### Release

```text
quick soft pop
```

### Landing

```text
gel impact
```

Large landings should sound stronger.

The sound itself can help communicate jump strength.

---

# 44. No Explicit Tutorial Pop-Up by Default

Avoid starting with:

```text
HOLD SPACE TO CHARGE JUMP
```

Instead use:

1. automatic bounce;
2. unreachable platform;
3. visual charge feedback.

If external playtesting shows players consistently fail to understand the mechanic, then add a minimal contextual prompt:

```text
Hold SPACE to compress
Release to bounce
```

Display it only after several seconds without successful progress.

---

# 45. Collision Requirements

Every platform should have simple collision geometry.

Do not use the detailed rendered mesh as the collision mesh if it introduces unnecessary complexity.

Recommended:

```text
Rendered platform
+
simple Box collision volume
```

Sticky wall:

```text
normal collision
+
STICKY surface tag
```

Normal walls:

```text
normal collision
+
no sticky tag
```

---

# 46. Surface Registry

Tag only the intended sticky section:

```text
STICKY
```

Everything else should remain:

```text
NORMAL
```

Do not accidentally allow Tack to climb arbitrary white laboratory walls.

The visual rule and collision rule must match.

If it looks normal:

> not climbable.

If it looks yellow-green and corroded:

> climbable.

---

# 47. Respawn Behaviour

There should be almost no reason to die in Room 2.

If the player somehow falls out of valid world geometry:

Respawn at the Room 2 landing area.

Do not send them back through Room 1.

Room 2 should have its own checkpoint activated automatically when the player lands from the vent.

---

# 48. Reset Behaviour

On Room 2 restart:

- slime returns to landing location;
- all platforms remain unchanged;
- camera resets safely;
- velocity resets;
- charge state resets;
- adhesion resets;
- room does not require page refresh.

---

# 49. Performance Requirements

Keep Room 2 relatively inexpensive.

Use repeated geometry and materials.

For example:

```text
one shared platform geometry
one shared platform material
```

where possible.

Use instancing or merged static meshes later if draw calls become excessive.

Avoid:

- dozens of unique materials;
- extremely high-resolution textures;
- expensive transparent surfaces everywhere;
- many shadow-casting lights.

The environment should look good through composition rather than brute-force rendering.

---

# 50. Greybox Implementation

The first implementation should use primitives.

Do not wait for final art.

Recommended greybox primitives:

### Room

```text
BoxGeometry / planes
```

### Platforms

```text
BoxGeometry
```

### Sticky Wall

```text
BoxGeometry
yellow-green material
```

### Vent

```text
simple rectangular tunnel
```

### Observation Window

```text
dark translucent plane
```

### Exit

```text
rectangular doorway
```

A successful greybox is more important than detailed assets.

---

# 51. Greybox Colour Coding

During development only:

```text
White / Grey
Normal geometry

Yellow-Green
Sticky surfaces

Blue
Spawn / player start

Green
Exit

Orange
Jump targets / debug only
```

The orange debugging colour should disappear in production.

---

# 52. Recommended Room Construction Order

Build Room 2 in this exact order.

### Step 1

Create the room shell.

```text
30 × 22 × 18 m
```

### Step 2

Create the entry vent.

### Step 3

Test falling from the vent.

### Step 4

Tune automatic landing bounce.

### Step 5

Create Platform A.

### Step 6

Verify Platform A requires a jump but is easy.

### Step 7

Create Platform B.

### Step 8

Tune the horizontal gap.

### Step 9

Create sticky wall.

### Step 10

Test jumping from Platform B into adhesion.

### Step 11

Create upper ledge.

### Step 12

Create exit balcony.

### Step 13

Create open exit door.

### Step 14

Add recovery routes.

### Step 15

Playtest the entire traversal before adding art.

### Step 16

Add architectural framing.

### Step 17

Add observation window.

### Step 18

Add materials.

### Step 19

Add lighting.

### Step 20

Add audio.

### Step 21

Add environmental detail.

### Step 22

Test again without debug colours.

---

# 53. Gameplay Timing Target

An experienced player should complete Room 2 in approximately:

```text
60–90 seconds
```

A first-time player should take approximately:

```text
2–4 minutes
```

Most of that additional time should come from experimentation.

Not from:

- getting lost;
- waiting;
- repeating long sections.

---

# 54. Difficulty Curve

Difficulty should look approximately like:

```text
Difficulty

HIGH │                             ●
     │                         ●
     │
     │                 ●
     │
     │        ●
LOW  │ ●
     └────────────────────────────────
       Fall   Height   Gap   Wall   Exit
```

The increase is gradual.

There should be no sudden enormous difficulty spike.

---

# 55. What Room 2 Should NOT Contain

Do not include:

- lasers;
- instant-death floors;
- moving platforms unless absolutely necessary;
- enemies;
- switches;
- pressure plates;
- doors requiring interaction;
- dissolve mechanics;
- other slimes;
- complicated branching routes;
- maze sections;
- precision wall-running;
- extreme darkness;
- lengthy cutscenes.

Those concepts dilute the purpose of the room.

Room 2 is about:

> **BOUNCE.**

---

# 56. How Room 2 Prepares the Player for Room 3

Room 3 will increase punishment.

Therefore Room 2 must quietly ensure the player already knows:

```text
bounce upward
bounce forward
judge a landing
catch a wall
transition from bounce → adhesion
look upward while navigating
```

Room 3 should not need to explain these again.

It should simply ask the player to perform them while avoiding lasers.

---

# 57. Final Player Experience

The intended emotional sequence is:

### Vent

> “Where am I going?”

### Fall

> “Oh, that's a long drop.”

### Impact

> “Whoa — I bounced.”

### Platform A

> “I can do that intentionally.”

### Platform B

> “I can launch myself across gaps.”

### Sticky Wall

> “I can bounce directly into a climb.”

### Upper Balcony

> “Okay, I understand how this slime moves.”

### Room 3 Door

> “Now the game wants me to prove it.”

---

# 58. Final Level Flow Diagram

```text
                            ROOM 1
                    CONTAINMENT CHAMBER
                             │
                             │
                       climb sticky wall
                             │
                             ▼
                          VENT
                             │
                             │
                      ventilation duct
                             │
                             ▼
                     ┌───────────────┐
                     │    ROOM 2     │
                     │               │
                     │    FALL       │
                     └───────┬───────┘
                             │
                             ▼
                      AUTOMATIC BOUNCE
                             │
                             ▼
                       EXPERIMENT AREA
                             │
                             ▼
                       HEIGHT JUMP
                             │
                             ▼
                        GAP JUMP
                             │
                             ▼
                    BOUNCE → STICK WALL
                             │
                             ▼
                          CLIMB
                             │
                             ▼
                      FINAL BOUNCE
                             │
                             ▼
                       EXIT BALCONY
                             │
                             ▼
                        OPEN DOOR
                             │
                             ▼
                            ROOM 3
                   PRECISION + LASERS
```

---

# 59. Acceptance Criteria

Room 2 is complete when all of the following are true:

- [ ] Player enters Room 2 by falling from the Room 1 ventilation system.
- [ ] Room 2 clearly feels spatially separate from Room 1.
- [ ] Initial landing automatically demonstrates Tack's large bounce.
- [ ] Player has room to safely experiment with jumping.
- [ ] First platform teaches vertical jumping.
- [ ] Second traversal beat teaches horizontal jumping.
- [ ] Failure during tutorial jumps does not kill the player.
- [ ] Player can quickly retry missed jumps.
- [ ] Final major traversal beat requires jumping toward a sticky wall.
- [ ] Sticky wall uses the same yellow-green visual language as Room 1.
- [ ] Player uses both bouncing and adhesion before leaving the room.
- [ ] The next objective is readable from each major platform.
- [ ] The room uses meaningful verticality and depth.
- [ ] The final exit is an open upper-level doorway.
- [ ] Room 3 can be subtly foreshadowed through the doorway.
- [ ] There are no lasers in Room 2.
- [ ] There are no unnecessary mechanics competing with the bounce tutorial.
- [ ] Collision surfaces match their visual language.
- [ ] Missing a platform does not create a softlock.
- [ ] Restarting does not require refreshing the browser.
- [ ] An experienced player can finish the room in roughly 60–90 seconds.
- [ ] A new player leaves the room understanding both charged jumps and bounce-to-wall traversal.

# Final Design Rule

When making any decision about Room 2, ask:

> **“Does this help the player understand and enjoy Tack's bounce?”**

If yes, keep it.

If it introduces another mechanic, hides the intended route, makes failure unnecessarily frustrating, or distracts from learning the jump:

**remove it from Room 2 and save it for a later room.**