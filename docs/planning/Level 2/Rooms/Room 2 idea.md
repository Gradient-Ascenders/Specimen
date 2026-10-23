# Level 2 — Room 2 Basic Plan

## Room Identity

**Objective:** Get both Bob and Goop into Room 3 through their separate exits.

Room 2 introduces a stronger form of cooperation between Bob and Goop.

The main cooperation pattern is:

> **Bob must first open Goop's route, then Goop must create Bob's route.**

This reverses the relationship established in Room 1 and makes both slimes depend on each other.

---

## 1. Room Entry

Both Bob and Goop enter Room 2 from the doorway completed at the end of Room 1.

The room is a fairly large chamber with another large radioactive section covering most of the floor.

Unlike Room 1, there is no safe platform directly across the radioactive floor for Bob to reach.

The far wall contains two separate exits:

- A **closed industrial door** in the middle of the wall for Goop.
- An **open ventilation shaft** in the upper-right corner for Bob.

These exits lead into different parts of Room 3.

---

## 2. Basic Room Layout

The room is divided into several important areas:

- Starting area.
- Sticky left wall.
- Radioactive floor.
- Bob's wall button.
- Three suspended-block mechanisms.
- Goop's door.
- Bob's upper vent.

Basic layout:

```text
                        BOB'S OPEN VENT
                              ╔════╗
                              ║    ║
                              ╚════╝
                                 ▲
                                 │
                       Bob eventually climbs here


STICKY LEFT WALL                               FAR WALL
█████████
█       █
█   ●   █ ← BUTTON
█       █
█ LASER █
█ LASER █
█       █
█████████

START       ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢ ☢           CLOSED DOOR
Bob +       ☢     RADIOACTIVE FLOOR    ☢          ███
Goop        ☢       GOOP IS SAFE       ☢          ███
            ☢       BOB IS NOT         ☢          ███
```

---

## 3. Radioactive Floor

The middle of Room 2 is covered by the same radioactive hazard introduced in Room 1.

### Bob

- Cannot safely touch the radioactive floor.
- Dies on contact.
- Death resets both slimes to the current checkpoint.
- Puzzle mechanisms return to their starting state.

### Goop

- Is immune to the radioactive floor.
- Can move freely across it.
- Uses the radioactive area as his main route through the room.

This reinforces the mechanic learned in Room 1 without repeating the same puzzle.

---

## 4. Bob's Sticky-Wall Route

The left wall contains a vertical route made from **sticky tiles**.

Bob must use his climbing and wall-movement mechanics to travel upward.

The route should include:

- Sticky wall sections.
- Gaps between sticky tiles.
- Small parkour movements.
- Lasers positioned along the route.

The lasers make reaching the button slightly more difficult.

Bob must time his movement carefully while climbing.

Goop cannot use this route because he cannot stick to the marked surfaces.

---

## 5. Laser Obstacles

Several lasers are placed along Bob's climbing route.

Their purpose is to make the wall section more interesting than simply climbing straight upward.

Possible laser behaviour:

- Horizontal laser beams.
- Slowly moving or sweeping beams.
- Gaps where Bob can safely wait.
- Alternating timing patterns.

The lasers should challenge Bob without making the wall section excessively difficult.

The main puzzle is still cooperation between the slimes.

---

## 6. Bob's Door Button

Near the upper section of the left wall is a large button.

Bob must physically **stick onto this button**.

The button only remains active while Bob is attached to it.

### When Bob is on the button:

> **Goop's door opens.**

### When Bob leaves the button:

> **Goop's door closes again.**

The player therefore cannot simply activate the button once and leave.

Bob must remain parked on it while the player switches to Goop.

---

## 7. Goop's Door

The middle of the far wall contains a heavy industrial blast door.

The door should open and close **vertically**, similar to a heavy security shutter.

### Door closed

The metal panel completely blocks the entrance.

### Bob activates the button

The door quickly retracts upward into the wall.

```text
CLOSED

┌───────────┐
│███████████│
│███████████│
│███████████│
│███████████│
└───────────┘


OPEN

┌───────────┐
│███████████│ ← door raised into wall
├───────────┤
│           │
│   OPEN    │
│           │
└───────────┘
```

If Bob leaves the button, the door lowers again.

The opening and closing should include:

- Mechanical movement animation.
- Heavy motor sound.
- Warning light if appropriate.
- Impact sound when the door fully closes.

---

## 8. Bob Opens Goop's Route

Once Bob reaches the button:

1. Bob sticks onto it.
2. The door opens.
3. Bob remains parked on the button.
4. The player switches to Goop.
5. Goop begins crossing the radioactive floor.

This establishes the first cooperation step:

> **Bob helps Goop progress.**

---

# 9. The Three Suspended Blocks

Above the radioactive section are **three suspended blocks/platforms**.

These blocks will eventually create Bob's route toward the upper-right vent.

Each block is attached to the ceiling by a rope.

However, Goop does **not** shoot the rope directly in this room.

Instead, each rope is attached to the ceiling through a clearly visible **wooden support brace**.

There are exactly three:

- Wooden Brace 1.
- Wooden Brace 2.
- Wooden Brace 3.

---

## 10. Suspended Block Construction

Each mechanism should visually communicate:

```text
          CEILING
────────────┬────────────

       [WOODEN BRACE]
             ↑
      GOOP SHOOTS THIS

             │
             │ Rope
             │
        ┌─────────┐
        │  BLOCK  │
        └─────────┘
```

The wooden brace is the soluble target.

The rope and metal block themselves are not what Goop needs to destroy.

---

# 11. Goop's Three Targets

While crossing the radioactive floor, Goop must locate and shoot all three wooden braces.

The three braces should be positioned progressively across his route.

---

## Wooden Brace 1

The first brace is relatively close to the starting half of the room.

Goop shoots:

> **Wooden Brace 1**

The brace dissolves.

The rope attachment releases.

**Block 1 falls into its predetermined position.**

---

## Wooden Brace 2

Goop moves farther across the radioactive floor.

He gets a clear firing angle on the second mechanism.

Goop shoots:

> **Wooden Brace 2**

The brace dissolves.

**Block 2 falls into place.**

---

## Wooden Brace 3

The final brace is positioned closer to the far side of the room.

Goop shoots:

> **Wooden Brace 3**

The brace dissolves.

**Block 3 falls into place.**

---

## 12. The Three Blocks Create Bob's Route

Once all three blocks have fallen, they form a parkour route leading upward toward Bob's vent.

For example:

```text
                                      OPEN VENT
                                        ╔════╗
                                        ║    ║
                                        ╚═▲══╝
                                          │

                                 [BLOCK 3]
                                     ▲

                         [BLOCK 2]
                              ▲

                [BLOCK 1]
                     ▲

STICKY WALL
██████████
█        █
█ BUTTON █
██████████
```

The blocks should not form a simple staircase.

Bob should still need to:

- Jump between them.
- Use sticky surfaces where appropriate.
- Navigate vertically.
- Combine his normal movement abilities.

---

# 13. Goop Enters Room 3

After shooting all three wooden braces, Goop continues across the radioactive area.

Bob is still holding the wall button, so the blast door remains open.

Goop enters through the open doorway.

This takes Goop into the **lower entrance of Room 3**.

Goop is now safely past Room 2's door.

---

# 14. Bob Leaves the Button

The player switches back to Bob.

Once Bob leaves the wall button:

- The button deactivates.
- The blast door begins closing.
- The door lowers completely.

This can create a dramatic moment where Bob and Goop are now visibly separated.

Goop is already safely inside Room 3, so the closing door does not cause a problem.

---

# 15. Bob's Final Route

Because Goop destroyed all three braces, Bob now has a new route toward the vent.

Bob moves away from the button and begins climbing.

His route uses:

- Sticky wall sections.
- Block 1.
- Block 2.
- Block 3.
- Jumps between the blocks.
- Potentially another small laser section.

The route ultimately leads Bob toward the upper-right corner.

---

# 16. Bob Enters the Vent

Bob reaches the open ventilation shaft.

Unlike Goop's door, Bob's vent does not need to be unlocked.

The challenge is simply reaching it.

Bob enters the vent and moves into the **upper section of Room 3**.

Room 3 can therefore begin with the two slimes entering through different locations.

---

# 17. Room 3 Transition

The exits connect naturally:

### Goop

```text
Room 2 blast door
        ↓
Room 3 lower entrance
```

### Bob

```text
Room 2 upper vent
        ↓
Room 3 upper vent / balcony
```

The player is allowed to send Bob through the vent as soon as the route exists.

There is no artificial barrier requiring Goop to be checked first.

Room 3 itself will require Goop, so progressing with Bob does not allow the player to bypass the two-slime gameplay.

---

# 18. Failure and Reset

If Bob:

- Touches the radioactive floor.
- Hits a lethal laser.
- Falls into another lethal area.

Then Room 2 resets.

Reset should restore:

- Bob to the checkpoint.
- Goop to the checkpoint.
- Blast door to closed.
- Wall button to inactive.
- Block 1 to suspended position.
- Block 2 to suspended position.
- Block 3 to suspended position.
- Wooden Brace 1.
- Wooden Brace 2.
- Wooden Brace 3.
- All laser states to their normal starting behaviour.

---

# 19. Core Gameplay Flow

```text
Enter Room 2
      ↓
Player sees two different exits
      ↓
Bob climbs the sticky left wall
      ↓
Bob avoids lasers
      ↓
Bob reaches wall button
      ↓
Bob sticks onto button
      ↓
Blast door opens
      ↓
Switch to Goop
      ↓
Goop crosses radioactive floor
      ↓
Goop shoots WOODEN BRACE 1
      ↓
Block 1 falls
      ↓
Goop shoots WOODEN BRACE 2
      ↓
Block 2 falls
      ↓
Goop shoots WOODEN BRACE 3
      ↓
Block 3 falls
      ↓
Goop enters Room 3 through blast door
      ↓
Switch back to Bob
      ↓
Bob leaves button
      ↓
Blast door closes behind Goop
      ↓
Bob uses the three fallen blocks
      ↓
Bob climbs toward upper-right vent
      ↓
Bob enters vent
      ↓
Bob enters upper section of Room 3
```

---

# 20. Cooperation Structure

Room 2 should clearly communicate two dependencies.

## First Dependency

> **Bob helps Goop.**

Bob's sticky-wall traversal allows him to reach and hold the button.

Without Bob:

- The blast door remains closed.
- Goop cannot enter Room 3.

---

## Second Dependency

> **Goop helps Bob.**

Goop crosses the radioactive floor and destroys the three wooden braces.

Without Goop:

- The blocks remain suspended.
- Bob cannot reach the upper-right vent.

---

# 21. Room 2 Design Summary

**Primary cooperation mechanic:**

> Bob opens Goop's path, then Goop builds Bob's path.

**Bob's challenge:**

- Sticky-wall parkour.
- Laser avoidance.
- Reach and remain attached to the wall button.
- Later traverse the three fallen blocks.

**Goop's challenge:**

- Cross the radioactive floor.
- Use acid shooting accurately.
- Destroy exactly three wooden support braces.
- Enter the blast door while Bob keeps it open.

**Goop's three required targets:**

1. **Wooden Brace 1** → releases Block 1.
2. **Wooden Brace 2** → releases Block 2.
3. **Wooden Brace 3** → releases Block 3.

**Goop's exit:** Blast door in the middle of the far wall.

**Bob's exit:** Open vent in the upper-right corner.

**Final result:** Bob and Goop enter Room 3 through different routes.

The main lesson should be:

> **Each slime can reach and manipulate things the other cannot, and successful progression requires using both abilities together.**