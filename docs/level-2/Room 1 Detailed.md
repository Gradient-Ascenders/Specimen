# Level 2 — Room 1 Detailed Design and Build Plan

## 1. Room Purpose

**Level:** Level 2  
**Room:** Room 1  
**Primary objective:** **Help Bob reach Room 2.**

This room is the first proper cooperative puzzle between **Bob** and **Goop**.

The room should immediately establish the main Level 2 design rule:

> **Goop can safely reach areas that Bob cannot, and Goop can modify the environment so Bob can progress.**

The player must learn three things:

1. **Bob dies when touching the radioactive acid.**
2. **Goop can safely move through the radioactive acid.**
3. **Goop can shoot acid at marked soluble objects to change the level.**

The puzzle uses **three suspended metal platforms** above the radioactive area.

Each platform hangs from the ceiling using **one clearly visible soluble rope/cable**.

Goop must shoot each rope with acid.

When a rope dissolves:

- The rope snaps.
- Its platform falls.
- The platform lands at a predetermined position in the radioactive area.
- The fallen platform becomes a safe stepping stone for Bob.

Once all three platforms have fallen, Bob can jump across them and enter Room 2.

---

# 2. Transition from Level 1

## 2.1 Level 1 Exit

At the end of Level 1 — Room 5:

- The player has already freed Goop.
- A vent leading out of Level 1 is blocked by a soluble barrier.
- The player switches to Goop.
- Goop uses acid to destroy the obstruction.
- The vent becomes accessible.
- Either Bob or Goop can enter the vent.

The game must remember which slime the player was controlling when the Level 1 exit was triggered.

---

## 2.2 Level Transition

Once the active slime reaches the end of the vent:

1. Disable normal player input.
2. Fade the screen toward black.
3. Display:

> **Entering Level 2...**

4. Hold the message briefly.
5. Unload Level 1.
6. Load Level 2 — Room 1.
7. Restore Bob and Goop into the new level.
8. Preserve the player's previously selected slime.
9. Fade gameplay back in.

The transition should feel like one continuous journey through the facility rather than selecting another level from a menu.

---

# 3. Room Introduction

## 3.1 Ceiling Vent Entrance

Bob and Goop enter Level 2 through a ventilation opening in the **ceiling near the left side of Room 1**.

The vent should visibly connect to the architecture above the room.

Recommended structure:

```text
                  LEVEL 1 VENT
                       │
                       │
                ┌──────┴──────┐
                │ Broken Vent │
                │   Opening   │
                └──────┬──────┘
                       ↓
                     FALL
                       ↓

         ┌─────────────────────────────
         │
         │     LEVEL 2 START AREA
         │
         │       Bob + Goop
─────────┴─────────────────────────────
```

Both slimes fall from the opening onto a safe floor below.

The fall should be short enough that the player does not think they are in danger.

---

## 3.2 Starting Checkpoint

A checkpoint is activated immediately after both slimes enter the room.

This becomes the reset position for Room 1.

The checkpoint needs to store:

- Bob's starting position.
- Goop's starting position.
- The active slime.
- Camera state.
- Platform 1 suspended state.
- Platform 2 suspended state.
- Platform 3 suspended state.
- Rope 1 intact state.
- Rope 2 intact state.
- Rope 3 intact state.

If Bob dies, the entire room returns to this state.

---

# 4. Overall Room Layout

The room should be visually understandable almost immediately after entering.

The player should be able to look across the room and see:

- The radioactive acid.
- The three suspended platforms.
- Their ropes.
- The far side.
- The Room 2 doorway.

Basic layout:

```text
LEFT / START                                            RIGHT / ROOM 2

                    CEILING
────────────────────────────────────────────────────────────────────

          Rope 1            Rope 2            Rope 3
             │                 │                 │
             │                 │                 │
        ┌─────────┐       ┌─────────┐       ┌─────────┐
        │Platform │       │Platform │       │Platform │
        │    1    │       │    2    │       │    3    │
        └─────────┘       └─────────┘       └─────────┘


  START                                                     ROOM 2
┌──────────┐                                             ┌──────────┐
│ Bob      │                                             │  OPEN    │
│ Goop     │                                             │   DOOR   │
│          │                                             │          │
└──────────┴─────────────────────────────────────────────┴──────────┘
           ☢ ☢ ☢ ☢ ☢ RADIOACTIVE ACID ☢ ☢ ☢ ☢ ☢
           ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢
```

The radioactive floor should occupy most of the centre of the room.

Bob should clearly be unable to:

- Jump across the entire hazard.
- Climb around it.
- Use a wall or ceiling route to bypass it.

The puzzle solution must clearly require Goop.

---

# 5. Room Construction

## 5.1 Main Room Shell

Build the room from several clear structural pieces rather than one giant mesh.

Recommended major sections:

- Left starting floor.
- Left wall.
- Right floor.
- Right wall.
- Back wall.
- Ceiling.
- Radioactive pit/floor.
- Ceiling maintenance beams.
- Vent entrance.
- Room 2 doorway.
- Three suspended-platform assemblies.

This makes the room easier to modify and allows individual objects to have separate materials, collision behaviour and puzzle states.

---

# 6. Starting Side

The starting platform should provide enough space for:

- Bob.
- Goop.
- Camera movement.
- Switching between slimes.
- Reading the room.
- Jump preparation once the puzzle is solved.

The player should not immediately fall into the acid after spawning.

The radioactive hazard should begin several metres away from the spawn location.

The starting ledge should contain environmental details such as:

- Broken laboratory equipment.
- Warning markings.
- Pipes.
- Cables.
- Damaged wall panels.
- Vegetation or contamination associated with Level 2.
- A radioactive warning sign near the edge.

The edge facing the radioactive area should have a clear visual boundary.

---

# 7. Radioactive Acid Hazard

## 7.1 Purpose

The radioactive area exists specifically to separate Bob from the far side.

The rule is simple:

> **Bob cannot touch it. Goop can.**

---

## 7.2 Hazard Construction

The radioactive area should be implemented as two separate concepts:

### Visual Surface

A visible radioactive liquid surface.

Possible visual features:

- Bright green colour.
- Animated surface distortion.
- Scrolling noise.
- Small bubbles.
- Occasional particles.
- Green point or area lighting.
- Vapour rising above the liquid.

### Hazard Trigger

A separate invisible trigger volume covering the dangerous area.

This should determine whether a slime has entered the hazard.

Do not make the visual shader responsible for gameplay detection.

---

## 7.3 Bob Interaction

When Bob enters the radioactive trigger:

1. Trigger Bob's death state.
2. Disable player movement.
3. Play Bob's death/explosion effect.
4. Briefly show the death feedback.
5. Restore the Room 1 checkpoint.
6. Reset all three suspended-platform assemblies.
7. Restore both slimes.

Bob should never remain alive inside the radioactive area.

---

## 7.4 Goop Interaction

When Goop enters the radioactive trigger:

- Nothing harmful happens.
- Goop can move normally.
- Goop may stand inside the radioactive area indefinitely.

A small visual interaction could reinforce this:

- Acid ripples around Goop.
- Small particles appear around his body.
- Goop remains unaffected.

---

# 8. The Three Suspended Platform Assemblies

This is the most important construction detail in the room.

There are exactly **three suspended platform assemblies**:

- Suspended Platform Assembly 1.
- Suspended Platform Assembly 2.
- Suspended Platform Assembly 3.

Each assembly should contain:

1. A ceiling mounting point.
2. A soluble rope/cable.
3. A suspended metal platform.
4. A rope hit target.
5. A fall destination.
6. A landing state.
7. Visual/audio feedback.

---

# 9. Important Rope Design Rule

The player must understand:

> **GOOP SHOOTS THE ROPE.**

The platform itself should **not** be the puzzle target.

Do not make shooting the metal platform cause it to fall.

The intended interaction is:

```text
        CEILING
──────────┬──────────
          │
      [CEILING
        MOUNT]
          │
          │
       SOLUBLE
        ROPE       ← GOOP SHOOTS THIS
          │
          │
      ┌─────────┐
      │ PLATFORM│
      └─────────┘
```

The ropes therefore need to be visually obvious.

---

# 10. Building a Suspended Platform Assembly

Each of the three assemblies can use the same reusable structure.

Example logical hierarchy:

```text
SuspendedPlatformAssembly
│
├── CeilingMount
│
├── RopeVisual
│
├── RopeHitTarget
│
├── Platform
│
└── Effects
```

Each instance receives different authored positions.

For example:

```text
Platform 1:
- suspendedPosition
- landingPosition
- ropePosition

Platform 2:
- suspendedPosition
- landingPosition
- ropePosition

Platform 3:
- suspendedPosition
- landingPosition
- ropePosition
```

---

# 11. Ceiling Mount

Each platform should visibly connect to the ceiling.

The ceiling mount can be constructed from:

- A small industrial bracket.
- Metal plate.
- Bolts.
- Hook.
- Warning marking.
- Rope attachment point.

The mount itself is **not soluble**.

Goop should not need to shoot the mount.

Its main purpose is making the suspension believable and visually directing attention toward the rope.

---

# 12. Rope Construction

## 12.1 Visual Rope

Each platform uses **one main rope/cable**.

Using one obvious rope is preferable to several functional ropes because the player immediately knows what must be destroyed.

The rope can visually resemble:

- Industrial fibre rope.
- Degraded containment cable.
- Organic laboratory tether.
- Corrodible polymer cable.

It should contrast against the background.

For example:

- Rope: warm orange/brown.
- Soluble marking: yellow-green.
- Environment: dark industrial green/grey.

---

## 12.2 Rope Thickness

Do not make the functional rope extremely thin.

A visually realistic tiny rope would be frustrating to hit.

The visual rope can remain relatively thin, but the **acid hit target should be more forgiving than the visible geometry**.

Example:

```text
Visible rope:

       │

Invisible hit area:

     ┌─────┐
     │  │  │
     │  │  │
     │  │  │
     └─────┘
```

The invisible target surrounds the rope.

This lets the player aim reasonably close to the rope without requiring pixel-perfect accuracy.

---

# 13. Rope Hit Target

Every rope should have its own interaction target.

Suggested state:

```text
RopeTarget
type = SOLUBLE
state = INTACT
acidHitsRequired = 1
```

For this introductory puzzle, **one successful acid shot should probably be enough**.

The room is teaching the mechanic rather than testing precision.

Later Level 2 puzzles can require sustained corrosion or several shots.

---

## 13.1 Acid Projectile Interaction

When Goop fires an acid projectile:

1. Projectile travels toward the player's aim point.
2. Projectile checks collision against valid acid targets.
3. If it hits a rope target:
   - Stop the projectile.
   - Trigger acid splash.
   - Mark the rope as dissolving.
   - Prevent repeated activation.
4. Begin rope dissolution sequence.

---

# 14. Rope Dissolution Sequence

The rope should not simply disappear instantly.

Give the player a short cause-and-effect sequence.

Recommended sequence:

### Stage 1 — Impact

Goop's acid hits the rope.

Effects:

- Small green splash.
- Hissing sound.
- Acid particles.
- Rope briefly flashes or glows.

### Stage 2 — Corrosion

For roughly a short fraction of a second:

- Dissolve shader moves through the rope.
- Rope darkens.
- Green corrosive edge appears.
- Small particles fall.

### Stage 3 — Snap

The rope breaks.

Effects:

- Audible snap.
- Small rope fragments or particles.
- Platform shakes.

### Stage 4 — Platform Release

The platform begins falling immediately afterward.

---

# 15. Do Not Require Dynamic Physics

The platform does not need unrestricted rigid-body physics.

Use an **authored fall**.

This gives complete control over where each platform lands.

Once its rope breaks:

```text
state:
SUSPENDED
    ↓
RELEASED
    ↓
FALLING
    ↓
LANDED
```

During `FALLING`:

- Interpolate platform position downward.
- Add slight rotation.
- Increase falling speed.
- Move toward its predetermined landing transform.

Once it reaches the destination:

- Snap precisely to the landing transform.
- Change state to `LANDED`.
- Enable Bob-safe collision.
- Play impact effects.

This avoids unpredictable platform positions and ensures the puzzle always remains solvable.

---

# 16. Platform Landing Effects

When a platform hits its destination:

- Heavy metallic impact sound.
- Camera shake.
- Acid splash.
- Green particles.
- Steam.
- Brief platform bounce or vibration.
- Platform settles.

The radioactive liquid may visually react around it.

The platform then remains stationary.

---

# 17. Fallen Platform Collision

Before dropping:

- The suspended platform can have collision if needed.
- Bob should not be able to reach it.

After landing:

- Platform becomes a standard solid traversal surface.
- Bob can stand on it.
- Bob can jump from it.
- Goop can also stand on it.

The platform itself must **not** remain hazardous simply because it sits inside radioactive liquid.

Its top surface is safe.

---

# 18. Platform 1 — First Rope

## Location

Platform 1 hangs closest to Bob's starting side.

Its eventual landing position forms Bob's **first stepping stone**.

### Suspended State

```text
           Rope 1
              │
              │
         [Platform 1]


BOB
████████       ☢ ☢ ☢ ☢ ☢
```

---

## Goop Interaction

Goop enters the radioactive area.

Rope 1 should be relatively easy to aim at.

This is the first acid-shooting target in the puzzle.

The player shoots:

> **Rope 1**

Rope 1 dissolves.

Platform 1 drops.

---

## Landing Position

Platform 1 lands close enough to Bob's starting ledge that Bob can make the first jump comfortably.

```text
BOB

████████       [ P1 ]      ☢ ☢ ☢
```

This first jump should not be difficult.

---

# 19. Platform 2 — Second Rope

Platform 2 hangs near the centre of the radioactive area.

Its rope should require Goop to travel farther into the hazard.

This reinforces that Goop can safely occupy the radioactive area.

---

## Goop Interaction

The player moves Goop deeper into the room.

Goop finds a clear firing angle.

Goop shoots:

> **Rope 2**

Rope 2 dissolves.

Platform 2 falls.

---

## Landing Position

Platform 2 forms the middle stepping stone.

```text
BOB SIDE

█████     [ P1 ]     [ P2 ]        ☢ ☢ ☢
```

The jump from Platform 1 to Platform 2 should require a normal deliberate Bob jump.

---

# 20. Platform 3 — Final Rope

Platform 3 hangs closest to the Room 2 side.

Goop should need to reach approximately the far half of the radioactive area before getting the clearest shot.

This makes the three targets create natural progression:

```text
Rope 1
   ↓

START → Rope 2 → Rope 3 → ROOM 2
```

---

## Goop Interaction

Goop reaches the far side.

The player aims upward and shoots:

> **Rope 3**

Rope 3 dissolves.

Platform 3 falls into position.

---

## Landing Position

Platform 3 creates Bob's final stepping stone before Room 2.

```text
START                                           ROOM 2

████     [ P1 ]     [ P2 ]     [ P3 ]            ████
         ☢ ☢ ☢     ☢ ☢ ☢     ☢ ☢ ☢
```

Bob can now complete the crossing.

---

# 21. Platform Spacing

The platforms should not accidentally form a continuous bridge.

Bob should still need to **jump**.

Desired feel:

```text
START
████████

         GAP

              █████
               P1

                       GAP

                            █████
                             P2

                                     GAP

                                          █████
                                           P3

                                                   GAP

                                                        ROOM 2
                                                        ███████
```

Platform spacing should test Bob's normal traversal without turning the first Level 2 puzzle into a difficult platforming challenge.

The puzzle itself is the focus.

---

# 22. Visual Identification of Shootable Ropes

Because this introduces Goop's ranged corrosion ability, the ropes need strong visual language.

Possible indicators:

- Yellow-green coating around part of the rope.
- Soluble-material symbol.
- Slightly glowing segments.
- Existing corrosion marks.
- Small drips.
- Different material from surrounding metal.
- Warning signage above the platform mechanism.

Nearby metal should **not** use the same visual language.

The player should be able to infer:

> Green/yellow corrodible material = Goop can destroy it.

---

# 23. Optional First-Time Tutorial Prompt

When the player controls Goop and enters the radioactive area for the first time:

> **Goop is immune to radioactive acid.**

Then, once the player approaches the first suspended platform:

> **Shoot acid at soluble objects.**

The rope could receive a temporary outline.

For example:

```text
        [CEILING]
            │
           ╔│╗
           ║│║   ← temporary highlight
           ╚│╝
            │
        [PLATFORM]
```

Once Rope 1 is successfully destroyed, do not highlight Rope 2 and Rope 3 as aggressively.

The player should apply what they learned.

---

# 24. Recommended Difficulty Progression

## Rope 1

**Teaching target**

- Large clear line of sight.
- Close.
- No obstruction.
- Forgiving hitbox.

## Rope 2

**Confirmation target**

- Slightly farther away.
- Requires Goop to move deeper into the hazard.
- Still clearly visible.

## Rope 3

**Independent application**

- Located near the far side.
- Requires the player to intentionally travel across the hazard.
- No tutorial highlight needed.

This creates:

> Learn → repeat → demonstrate understanding.

---

# 25. Goop's Route

Goop should not need complex platforming.

His route through the radioactive area should be straightforward.

The challenge is recognising Goop's immunity and using his acid ability.

Possible route:

```text
                 Rope 1
                    ↓
START ──────────────────────────────
          \
           \
            GOOP
              \
               → Rope 2
                     \
                      \
                       → Rope 3
                              \
                               → FAR SIDE
```

Environmental objects can prevent the room from looking empty:

- Broken pipes.
- Partially submerged equipment.
- Support pillars.
- Crates.
- Machinery.

However, these should not obscure the main ropes.

---

# 26. Bob's Route

After the puzzle is solved:

```text
START
  │
  │ jump
  ▼
Platform 1
  │
  │ jump
  ▼
Platform 2
  │
  │ jump
  ▼
Platform 3
  │
  │ jump
  ▼
ROOM 2
```

Bob should be the slime that completes the room objective.

---

# 27. Room 2 Entrance

The Room 2 entrance should be visible from the start.

This gives the player a clear destination.

Recommended visual treatment:

- Large industrial doorway.
- Door already open.
- Strong contrasting light beyond it.
- Sign:

> **ROOM 2**

The opening should be large enough that entering it is effortless once the crossing is complete.

---

# 28. Goop Entering Room 2

Goop can reach Room 2 before Bob.

This is intentional.

If Goop crosses the radioactive floor and walks through the doorway:

- Do not complete the objective.
- Do not move the checkpoint.
- Do not lock the player inside Room 2.
- Allow Goop to return.
- Allow the player to switch to Bob.

The room objective remains:

> **Help Bob reach the other room!**

---

# 29. Bob Completion Trigger

Place a trigger volume slightly inside the Room 2 doorway.

The trigger should specifically check:

```text
if enteringSlime === Bob
```

Only Bob completes the room.

When Bob enters:

1. Mark Room 1 as completed.
2. Display:

> **Objective Complete**

3. Activate Room 2's checkpoint.
4. Update Bob's checkpoint.
5. Update Goop's checkpoint.
6. Set the next objective.
7. Allow normal Level 2 progression.

---

# 30. Room Reset Behaviour

Bob touching the radioactive floor resets the entire Room 1 puzzle.

Every reset must restore:

### Slimes

- Bob → starting checkpoint.
- Goop → starting checkpoint.
- Active slime → appropriate reset selection.

### Platform 1

- Return to suspended position.
- Rope 1 restored.
- Hit target re-enabled.

### Platform 2

- Return to suspended position.
- Rope 2 restored.
- Hit target re-enabled.

### Platform 3

- Return to suspended position.
- Rope 3 restored.
- Hit target re-enabled.

### Effects

Clear:

- Acid particles.
- Rope dissolve effects.
- Falling animations.
- Impact particles.
- Temporary camera shake.
- Tutorial outlines if appropriate.

---

# 31. Platform Assembly Reset Contract

Each suspended platform object should expose something equivalent to:

```text
reset()
```

The reset function should:

```text
state = SUSPENDED

rope visible = true
rope soluble target enabled = true

platform position = authored suspended position
platform rotation = authored suspended rotation

platform landing collision state = reset

dissolve progress = 0

temporary particles cleared
```

This makes the puzzle compatible with the existing room/checkpoint reset system.

---

# 32. Suggested State Machine for Each Assembly

```text
SUSPENDED
    │
    │ acid hits rope
    ▼
DISSOLVING
    │
    │ corrosion completes
    ▼
RELEASED
    │
    ▼
FALLING
    │
    │ reaches landing transform
    ▼
LANDED
```

Reset always returns:

```text
ANY STATE
    ↓
SUSPENDED
```

---

# 33. Camera Considerations

The player should be able to see the suspended platforms without fighting the camera.

From the starting ledge, frame:

- At least two ropes.
- Radioactive hazard.
- Far doorway.

While controlling Goop inside the hazard, looking upward should comfortably show the rope targets.

Do not place the ropes so high that the player has to point the camera almost vertically upward.

The room should support natural third-person aiming.

---

# 34. Audio

Each interaction should have clear sound feedback.

### Radioactive Area

- Bubbling.
- Low electrical/radiation hum.
- Occasional toxic hiss.

### Goop Acid Shot

- Projectile launch sound.
- Acid impact.
- Chemical hiss.

### Rope

- Corrosion.
- Fibre/cable stress.
- Snap.

### Platform

- Falling air movement.
- Heavy metal impact.
- Acid splash.

### Completion

- Objective-complete sound.
- Checkpoint activation.

---

# 35. Environmental Storytelling

Room 1 should begin establishing Level 2's more contaminated visual identity.

Compared with Level 1's cleaner containment areas, Level 2 should appear:

- Older.
- Damaged.
- Overgrown.
- Humid.
- Chemically contaminated.

Possible details:

- Vines hanging from ceiling beams.
- Rust.
- Failed laboratory tanks.
- Biological growth.
- Broken fluorescent lights.
- Green emergency lighting.
- Radioactive warning signs.
- Damaged maintenance structures.

The three suspended platforms could originally have been maintenance cargo platforms left hanging when the facility failed.

This makes them feel like part of the world rather than puzzle objects placed artificially.

---

# 36. Building Order

A practical construction order for the room is:

## Phase 1 — Greybox Shell

Build:

1. Starting ledge.
2. Radioactive area.
3. Far ledge.
4. Room 2 doorway.
5. Ceiling.
6. Vent entrance.

Do not add decoration yet.

Verify:

- Bob cannot jump across.
- Goop can cross.
- Camera fits comfortably.

---

## Phase 2 — Platform Landing Geometry

Before building the hanging versions, place three temporary cubes where the final stepping platforms will land.

Test Bob's route:

```text
START → P1 → P2 → P3 → ROOM 2
```

Adjust:

- Platform size.
- Gap size.
- Platform height.
- Bob's jump distance.

Only continue once crossing feels good.

---

## Phase 3 — Suspended Positions

Move each platform upward to its initial hanging position.

Store both transforms:

```text
platform1Start
platform1Landing

platform2Start
platform2Landing

platform3Start
platform3Landing
```

These transforms become authoritative puzzle data.

---

## Phase 4 — Ceiling Mounts

Build a ceiling bracket above each suspended platform.

Make each bracket visually line up with the platform below.

---

## Phase 5 — Ropes

Connect each platform to its ceiling mount using one clear rope.

Create:

- Rope 1.
- Rope 2.
- Rope 3.

Each rope receives:

- Visual mesh.
- Soluble tag.
- Forgiving projectile hit target.
- Dissolve state.

---

## Phase 6 — Acid Interaction

Connect Goop's projectile system to the three rope targets.

Verify:

> Shooting platform = nothing.

> Shooting ceiling = nothing.

> Shooting normal wall = nothing.

> Shooting Rope 1 = Platform 1 falls.

> Shooting Rope 2 = Platform 2 falls.

> Shooting Rope 3 = Platform 3 falls.

This distinction is extremely important.

---

## Phase 7 — Falling Animation

Implement the authored fall for each platform.

Verify each one reaches exactly its intended landing transform every time.

---

## Phase 8 — Reset

Drop all three platforms.

Kill Bob.

Verify:

- All platforms return overhead.
- All ropes reappear.
- Goop returns.
- Bob returns.
- All three targets work again.

Repeat this several times.

---

## Phase 9 — Visual Polish

Only after gameplay works:

- Replace greyboxes with industrial platform meshes.
- Add ropes/cables.
- Add warning symbols.
- Add radioactive shader.
- Add particles.
- Add sound.
- Add environmental props.
- Add lighting.

---

# 37. Final Room Layout

```text
                            CEILING

             MOUNT 1          MOUNT 2          MOUNT 3
                │                │                │
                │                │                │
             ROPE 1           ROPE 2           ROPE 3
           SHOOT HERE       SHOOT HERE       SHOOT HERE
                │                │                │
           ┌────────┐       ┌────────┐       ┌────────┐
           │   P1   │       │   P2   │       │   P3   │
           └────────┘       └────────┘       └────────┘


VENT
  ↓
┌─────────────┐                                         ┌─────────────┐
│             │                                         │             │
│ BOB + GOOP  │                                         │   ROOM 2    │
│ CHECKPOINT  │                                         │   DOOR      │
│             │                                         │             │
└─────────────┴─────────────────────────────────────────┴─────────────┘
              ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢
              ☢      RADIOACTIVE ACID FLOOR         ☢
              ☢        GOOP CAN CROSS               ☢
              ☢         BOB CANNOT                  ☢
```

After Goop destroys all three ropes:

```text
┌─────────────┐                                         ┌─────────────┐
│             │                                         │             │
│     BOB     │                                         │   ROOM 2    │
│             │                                         │             │
└─────────────┘                                         └─────────────┘

        jump             jump             jump             jump
          →                →                →                →

           ┌───────┐       ┌───────┐       ┌───────┐
           │  P1   │       │  P2   │       │  P3   │
           └───────┘       └───────┘       └───────┘

       ☢ ☢ ☢ ☢ ☢ ☢ RADIOACTIVE ACID ☢ ☢ ☢ ☢ ☢ ☢
```

---

# 38. Complete Player Experience

The intended Room 1 sequence is:

```text
Finish Level 1
      ↓
Goop burns open the vent
      ↓
Player enters vent
      ↓
"Entering Level 2..."
      ↓
Bob and Goop fall from ceiling vent
      ↓
Checkpoint activates
      ↓
Objective:
"Help Bob reach the other room!"
      ↓
Player sees radioactive floor
      ↓
Bob attempts to cross / player recognises danger
      ↓
Player switches to Goop
      ↓
Goop enters radioactive area safely
      ↓
Player sees suspended Platform 1
      ↓
Goop shoots ROPE 1
      ↓
Rope dissolves
      ↓
Platform 1 falls
      ↓
Goop travels deeper into hazard
      ↓
Goop shoots ROPE 2
      ↓
Platform 2 falls
      ↓
Goop reaches far side
      ↓
Goop shoots ROPE 3
      ↓
Platform 3 falls
      ↓
Full route created
      ↓
Player switches to Bob
      ↓
Bob jumps:
Start → P1 → P2 → P3 → far ledge
      ↓
Bob enters Room 2
      ↓
Objective Complete
      ↓
Room 2 checkpoint activates
```

---

# 39. Core Design Rule

The success of this room depends on the player understanding one simple cause-and-effect chain:

> **Goop survives the radioactive area → Goop shoots the three ropes → the three platforms fall → Bob uses those platforms to cross.**

The three ropes should therefore be some of the clearest interactive objects in the room.

The player should never reasonably wonder:

- Whether they should shoot the platform.
- Whether they should destroy the ceiling bracket.
- Whether Bob is supposed to jump the whole gap.
- Whether Goop entering Room 2 completes the objective.

The visual language, level geometry and interaction system should all reinforce the same solution.

---

# 40. Room 1 Design Summary

**New Level 2 mechanic introduced:** Goop's environmental manipulation.

**Hazard:** Radioactive acid.

**Bob's limitation:** Dies on contact with radioactive acid.

**Goop's advantage:** Can safely travel through the radioactive area.

**Goop's active ability:** Shoots acid.

**Puzzle objects:** Three suspended metal platforms.

**Actual acid targets:** The **three individual soluble ropes** holding those platforms.

**Required shots:**

1. Shoot **Rope 1** → Platform 1 falls.
2. Shoot **Rope 2** → Platform 2 falls.
3. Shoot **Rope 3** → Platform 3 falls.

**Bob's final challenge:** Jump across all three fallen platforms.

**Completion condition:** Bob enters Room 2.

**Failure condition:** Bob touches the radioactive acid.

**Reset:** Both slimes return to the checkpoint and all three ropes/platforms return to their original suspended state.

The room should finish with the player understanding the fundamental relationship that the rest of Level 2 can build upon:

> **Goop does not simply follow Bob. Goop changes the environment so Bob can reach places that would otherwise be impossible.**