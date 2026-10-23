# Level 2 — Room 1 Basic Plan

## Room Identity

**Objective:** Help Bob reach Room 2.

Level 2 begins by introducing the idea that **Goop can safely enter areas that Bob cannot and can modify the environment to create a path for Bob**.

The main mechanic taught in this room is:

> **Goop crosses the radioactive hazard and uses his acid shot to drop platforms that Bob can use to cross.**

---

## 1. Transition from Level 1

Level 2 begins directly after the ending of **Level 1 — Room 5**.

After Goop burns through the blocked vent entrance, the player enters the vent using either Bob or Goop.

Once the player reaches the end of the vent:

- Gameplay temporarily fades out.
- A message appears:

**Entering Level 2...**

- There is a short pause/loading transition.
- Level 2 — Room 1 loads.
- Both **Bob and Goop** are transferred into the new level.
- The game remembers which slime the player was controlling when they entered the vent.
- That same slime remains the player's active slime when Level 2 begins.

---

## 2. Level 2 Entrance

Bob and Goop enter Room 1 through a broken ventilation opening in the **ceiling**.

Both slimes fall from the vent onto the safe starting side of the room.

Once they land, the new objective appears:

> **Objective: Help Bob reach the other room!**

A checkpoint is established at the entrance so that failures reset the room to this starting state.

---

## 3. Basic Room Layout

Room 1 is divided into three main sections:

### Starting Side

This is where Bob and Goop initially land.

It contains:

- The ceiling vent from Level 1.
- The Level 2 starting checkpoint.
- Enough safe floor for the player to understand the room before attempting the puzzle.

### Radioactive Acid Floor

A large section in the middle of the room is covered by a glowing radioactive acid hazard.

This hazard completely prevents Bob from simply walking to the other side.

**Bob:**

- Cannot safely touch the radioactive acid.
- Touching it kills Bob.
- Bob's death immediately resets the room.
- Both slimes return to the entrance checkpoint.
- All puzzle objects return to their original positions.

**Goop:**

- Is immune to the radioactive acid.
- Can freely move through it without taking damage.
- Can therefore reach places Bob cannot.

The hazard should be visually obvious through:

- Bright radioactive green liquid.
- Bubbling or particle effects.
- Hazard warning signs.
- Green environmental lighting around the pit.

---

## 4. The Three Suspended Platforms

Above the radioactive area are **three large metal platforms**.

At the beginning of the room, all three platforms are suspended from the ceiling.

Each platform is held up by its own **rope**.

```text
CEILING

      Rope             Rope             Rope
       |                |                |
       |                |                |
   [Platform 1]     [Platform 2]     [Platform 3]


BOB       ☢ ☢ ☢ ☢ RADIOACTIVE ACID ☢ ☢ ☢ ☢       ROOM 2
```

The platforms are positioned so that, if they fall into the correct places, they create stepping stones across the radioactive floor.

---

## 5. Goop's Acid-Shot Puzzle

Goop must cross the radioactive floor and move into positions where he can clearly see the ropes holding the platforms.

The important interaction is:

> **Goop must shoot the ROPE holding each platform — not the platform itself.**

The ropes are marked as **soluble/corrodible objects** so the player understands that Goop's acid can destroy them.

When Goop shoots a rope with acid:

1. The acid projectile hits the rope.
2. The rope begins visibly dissolving.
3. A short corrosion effect plays.
4. The rope snaps.
5. The platform falls.
6. The platform crashes into the radioactive floor.
7. The platform remains solid and becomes a safe surface for Bob.

This happens independently for all three platforms.

---

## 6. Platform Sequence

### Platform 1

Goop shoots the first rope.

The rope dissolves and:

**Platform 1 falls into the radioactive floor.**

It creates Bob's first safe landing point.

### Platform 2

Goop moves farther through the radioactive area and gets an angle on the second rope.

Goop shoots it.

**Platform 2 falls into the centre of the radioactive floor.**

This creates Bob's second stepping stone.

### Platform 3

Goop reaches the far side of the room.

From here he shoots the final rope.

**Platform 3 falls near the Room 2 side.**

The full crossing route is now complete.

```text
AFTER GOOP COMPLETES THE PUZZLE

BOB SIDE                                           ROOM 2
   │                                                  │
   ▼                                                  ▼

──────────    [Platform 1]   [Platform 2]   [Platform 3]    ──────────
              ☢           ☢  ☢           ☢  ☢           ☢
              ☢ ☢ ☢ ☢ ☢ RADIOACTIVE ACID ☢ ☢ ☢ ☢ ☢
```

---

## 7. Bob's Crossing

Once all three platforms have fallen, the player switches back to Bob.

Bob must use his normal movement and jumping mechanics to travel across the three platforms.

The intended sequence is:

**Starting ledge → Platform 1 → Platform 2 → Platform 3 → Room 2 ledge**

The gaps should be large enough that Bob still has to actively jump between them, rather than simply walking across.

This keeps Bob's traversal mechanics relevant while Goop is responsible for creating the route.

---

## 8. Room 2 Door

The far side of Room 1 contains an already-open doorway leading into **Level 2 — Room 2**.

Goop is allowed to enter Room 2 before Bob.

However:

- Entering as Goop does **not** complete the objective.
- Entering as Goop does **not** activate the next checkpoint.
- The player can continue switching between Goop and Bob normally.

The room specifically checks for **Bob**.

---

## 9. Room Completion

Once Bob crosses the radioactive area and enters the Room 2 doorway:

> **Objective Complete**

The Level 2 — Room 2 checkpoint activates.

Both slimes are now considered to have progressed past Room 1.

The game can then update the objective for the next room.

---

## 10. Failure and Reset

If Bob touches the radioactive floor:

1. Bob dies.
2. The death effect plays.
3. The room immediately resets.
4. Bob and Goop return to the Level 2 entrance checkpoint.
5. All three platforms return to their suspended positions.
6. All three ropes are restored.
7. The player can attempt the puzzle again.

Goop touching the radioactive floor never causes a reset.

---

## Core Gameplay Flow

```text
Enter Level 2
      ↓
Bob + Goop fall from ceiling vent
      ↓
Objective: Help Bob reach Room 2
      ↓
Player discovers Bob cannot cross radioactive acid
      ↓
Switch to Goop
      ↓
Goop walks safely through radioactive acid
      ↓
Goop shoots Rope 1
      ↓
Platform 1 falls
      ↓
Goop shoots Rope 2
      ↓
Platform 2 falls
      ↓
Goop shoots Rope 3
      ↓
Platform 3 falls
      ↓
Switch back to Bob
      ↓
Bob jumps across the three fallen platforms
      ↓
Bob enters Room 2
      ↓
Objective Complete
      ↓
Room 2 checkpoint activates
```

## Main Design Principle

This room establishes the Level 2 relationship between the two slimes:

> **Goop can reach places Bob cannot and changes the environment so Bob can progress.**

Goop solves the environmental problem by destroying the three supporting ropes, while Bob remains the slime that must physically complete the traversal and reach the next room.