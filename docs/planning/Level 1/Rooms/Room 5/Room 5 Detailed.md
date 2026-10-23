# Room 5 — Level 1 Finale

## Very Detailed Build Plan

---

# 1. Room Overview

## Room identity

**Room 5 is the final mastery test for Bob and the introduction of Goop.**

The player exits the Room 4 elevator sequence, climbs across sticky tiles into another maintenance vent, and enters the largest and most visually dense chamber in Level 1.

The player immediately sees:

- Goop contained inside a reinforced metal specimen box;
- the observation/control room overlooking the chamber;
- the release lever inside the observation room;
- the high opening above the observation-room glass;
- multiple possible-looking traversal structures throughout the room.

The room's objective is simple:

> **Use everything learned as Bob to reach the observation room and release Goop.**

After Goop is freed, Room 5 changes function.

It temporarily becomes a small tutorial space where the player learns:

1. there are now multiple controllable slimes;
2. they can swap between Bob and Goop;
3. Goop can corrode marked soluble materials;
4. either slime can then enter the newly opened exit vent;
5. doing so ends Level 1 and transitions both slimes into Level 2.

The finished sequence should feel like:

> **Room 4 escape → sticky climb → vent → huge final chamber → assess route → climb → traverse → master Bob → infiltrate observation room → pull lever using adhesion → free Goop → learn swapping → corrode exit → escape together → Level 2**

---

# 2. What Room 5 Must Accomplish

Room 5 has five major jobs.

## Job 1 — Provide the final Bob challenge

The player should use the mechanics learned throughout Level 1:

- normal movement;
- jumping;
- bouncing;
- sticking to marked surfaces;
- jumping between sticky surfaces;
- vertical traversal;
- platform-to-wall transfers;
- avoiding laser hazards;
- reading environmental routes.

Room 5 should **combine existing Bob mechanics** rather than introduce another major Bob ability.

---

## Job 2 — Give Level 1 a clear final objective

The player should not simply reach another exit door.

They should deliberately rescue another specimen.

This gives Level 1 a clear ending:

> Bob escapes his own containment and then chooses to free Goop.

---

## Job 3 — Introduce Goop visually before mechanically

The player should spend much of Room 5 seeing Goop's containment structure before being able to open it.

The containment structure should therefore become:

- the visual centre of the room;
- a navigation landmark;
- part of the platforming route;
- the object the player is ultimately trying to open.

---

## Job 4 — Introduce slime swapping without overwhelming the player

Once Goop is released:

- traversal difficulty stops;
- hazards stop being important;
- the player receives a clear swapping prompt;
- the player only needs to complete one simple Goop interaction.

Do not immediately introduce a large two-slime puzzle.

That belongs in Level 2.

---

## Job 5 — Create a direct physical transition into Level 2

The player uses Goop to open a vent.

Either slime can enter it.

A short cutscene then shows both Bob and Goop moving through the ventilation system and falling into the first area of Level 2.

The transition should feel like part of the world rather than:

> level complete → black screen → unrelated next level.

---

# 3. Overall Room Flow

```text
ROOM 4 ELEVATOR
      │
      ▼
STICKY SHAFT TILES
      │
      ▼
OPEN MAINTENANCE VENT
      │
      ▼
SHORT AIR DUCT
      │
      ▼
ROOM 5 FLOOR-LEVEL VENT EXIT
      │
      ▼
SAFE INTRO / ROOM REVEAL
      │
      ▼
SEE GOOP CONTAINMENT
      │
      ▼
SEE OBSERVATION ROOM
      │
      ▼
LOWER MACHINERY TRAVERSAL
      │
      ▼
CENTRAL CONTAINMENT PEDESTAL
      │
      ▼
CLIMB ON / AROUND METAL BOX
      │
      ▼
UPPER PLATFORM NETWORK
      │
      ▼
STICKY-TILE WALL TRANSFERS
      │
      ▼
TIMED LASER SECTION
      │
      ▼
FINAL HIGH PLATFORM
      │
      ▼
BOUNCE THROUGH OPENING ABOVE GLASS
      │
      ▼
OBSERVATION ROOM
      │
      ▼
STICK TO RELEASE LEVER
      │
      ▼
LEVER PULLS DOWN
      │
      ▼
GOOP RELEASE CUTSCENE
      │
      ▼
CONTROL RETURNS
      │
      ▼
SLIME SWAPPING TUTORIAL
      │
      ▼
SWITCH TO GOOP
      │
      ▼
CORRODE EXIT-VENT BARRICADE
      │
      ▼
ENTER VENT WITH EITHER SLIME
      │
      ▼
LEVEL 1 END CUTSCENE
      │
      ▼
BOB + GOOP FALL THROUGH DUCT
      │
      ▼
LEVEL 2
```

---

# 4. Recommended Room Scale

Room 5 should feel substantially larger than the earlier individual rooms.

However, it should also feel **denser and more claustrophobic**.

The solution is:

> Make the chamber physically large while filling it with structural machinery and obstacles.

Do not make the actual playable movement corridors extremely narrow.

That will create camera problems.

---

## Suggested starting dimensions

Assuming roughly:

```text
1 world unit ≈ 1 metre
```

start around:

```text
Width:   35–45 units
Depth:   30–40 units
Height:  22–30 units
```

Suggested initial greybox:

```text
40 × 34 × 26 units
```

These values are not final.

Playtest scale before art.

---

# 5. Coordinate Convention

Use the same coordinate convention as the rest of the level.

Recommended:

```text
Y = vertical
X = left/right across main chamber
Z = depth through chamber
```

Example conceptual layout:

```text
Room entry:
Z = -15

Central containment:
Z = 0

Observation room:
Z = +14

Floor:
Y = 0

Upper route:
Y = 10–18

Observation-room opening:
Y ≈ 16–20
```

The exact values depend on Bob's jump and adhesion tuning.

---

# 6. High-Level Spatial Layout

A useful basic layout is:

```text
TOP VIEW


┌──────────────────────────────────────────────────┐
│                                                  │
│          OBSERVATION / CONTROL ROOM              │
│      ┌──────────────────────────────┐             │
│      │                              │             │
│      │            LEVER             │             │
│      │                              │             │
│      └──────────── GLASS ───────────┘             │
│                  ▲                               │
│                  │                               │
│         OPENING ABOVE GLASS                      │
│                                                  │
│     UPPER ROUTE       LASERS       STICKY ROUTE │
│                                                  │
│                 ┌──────────────┐                 │
│                 │    GOOP      │                 │
│                 │ CONTAINMENT  │                 │
│                 └──────────────┘                 │
│                    ███████                       │
│                    PEDESTAL                      │
│                                                  │
│   MACHINERY      LOWER ROUTE        PIPES        │
│                                                  │
│                                                  │
│ VENT ENTRY ●                                      │
└──────────────────────────────────────────────────┘
```

The exact route should curve around the room rather than simply moving in a straight line.

---

# 7. Visual Hierarchy

When the player first enters Room 5, three things should dominate their attention.

## Priority 1 — Goop containment

This should be:

- central;
- elevated;
- large;
- visually unusual;
- brightly marked.

---

## Priority 2 — Observation room

The observation-room window should be visible above or behind the containment structure.

The lever should preferably be visible through the glass.

---

## Priority 3 — Opening above the observation window

The opening should be visible enough that a player can eventually infer:

> That is probably how I get inside.

It does not need to be immediately obvious how to reach it.

---

# 8. Transition From Room 4

Once the Room 4 elevator reaches the top, the player should not immediately walk through a normal door.

The transition should continue to use Bob's sticky movement.

---

# 9. Sticky-Tile Escape From Elevator

When the elevator stops, the nearest shaft wall contains a short path of sticky tiles.

Example:

```text
ELEVATOR                  SHAFT WALL

┌────────────┐            │
│            │            │     ███
│     ●      │   jump →   │     ███
│            │            │
└────────────┘            │
                          │             ███
                          │             ███
                          │
                          │      ███
                          │      ███
                          │
                          │        ┌──────────┐
                          │        │   VENT   │
```

The path should be short.

Room 4 has already been intense.

This transition is not another major challenge.

---

# 10. Sticky-Tile Transition Purpose

This small section accomplishes three things:

1. reminds the player that Bob can stick;
2. physically separates Room 4 from Room 5;
3. gives the player a quiet transition before the final chamber.

---

# 11. Vent Entrance

At the end of the sticky route is an open maintenance vent.

The vent should clearly look safe to enter.

No grate needs to be opened.

The player climbs directly inside.

---

# 12. Pre-Room-5 Air Duct

The air duct should be short.

Recommended duration:

```text
5–10 seconds
```

It exists mainly to:

- hide Room 5 loading/building if needed;
- separate visual spaces;
- reset pacing;
- create anticipation.

---

# 13. Air-Duct Shape

Avoid a perfectly straight pipe.

Use one or two turns.

Example:

```text
ELEVATOR
   │
   ▼
══════════════╗
              ║
              ╚══════╗
                     ║
                     ║
                 ROOM 5
```

This prevents the player from seeing Room 5 from the elevator shaft.

---

# 14. Room 5 Vent Exit

The air duct exits through a hole in a side wall near floor level.

The player should not drop from a huge height.

Recommended exit:

```text
0.5–1.5 units above floor
```

Bob can simply crawl or drop onto the floor.

---

# 15. Entry Safe Zone

Immediately outside the vent should be a safe floor area.

Do not place:

- lasers;
- difficult jumps;
- moving machinery;

directly in front of the player.

Give them time to look around.

Recommended safe radius:

```text
4–6 units
```

around the vent exit.

---

# 16. Initial Camera Reveal

Room 5 benefits from a small camera composition moment.

Do not use a long cutscene.

Possible approach:

When Bob exits the vent:

1. camera subtly pulls back;
2. central containment enters frame;
3. observation room becomes visible behind it;
4. camera returns fully to normal control.

Duration:

```text
1–2 seconds
```

Optional.

If normal camera framing already reveals the room well, do not force a camera animation.

---

# 17. Initial Objective Communication

The player needs to understand:

> I need to get to the control room.

This can be communicated through environment rather than lengthy text.

Possible cues:

- containment box has warning lights;
- cables from containment connect toward observation room;
- observation room contains visible lever;
- glass faces directly toward containment;
- optional objective HUD:

```text
Release the contained specimen
```

Keep objective text short.

---

# 18. Room Density

The room should feel cluttered with research-facility equipment.

Use:

- industrial pipes;
- large tanks;
- metal support frames;
- control cabinets;
- hanging cables;
- ventilation ducts;
- broken catwalks;
- containment hardware;
- platform supports;
- laser mounts;
- maintenance ladders as scenery;
- scientific instruments.

However:

> Not every object should have collision.

Use visual clutter with simple collision.

---

# 19. Recommended Traversal Zones

Divide Room 5 into six gameplay zones.

```text
ZONE 1 — Entry / Objective Reveal

ZONE 2 — Lower Machinery Route

ZONE 3 — Central Containment Pedestal

ZONE 4 — Upper Platform Network

ZONE 5 — Sticky-Wall + Laser Final Challenge

ZONE 6 — Observation Room
```

After Goop is released, the room effectively gains:

```text
ZONE 7 — Goop Tutorial / Exit
```

---

# 20. Zone 1 — Entry / Objective Reveal

## Purpose

Let the player understand the space.

No serious challenge.

---

## Player should see

- Goop containment;
- observation room;
- upper opening;
- nearby route start;
- some higher platforms they cannot directly reach.

---

## Optional clue

Use a large cable bundle running:

```text
containment
→ wall
→ observation room
```

This visually links the lever room to the containment mechanism.

---

# 21. Zone 1 Route Start

The beginning of the traversal route should be obvious.

Possible starting structures:

- low maintenance platform;
- tilted machinery casing;
- crate stack;
- broken pipe;
- small sticky panel.

Avoid giving the player five equally plausible paths immediately.

---

# 22. Zone 2 — Lower Machinery Route

Zone 2 begins the actual traversal.

Difficulty:

```text
moderate
```

The player should be comfortable here.

---

# 23. Zone 2 Goals

Teach the player how Room 5's environment works.

Use:

- large machinery as platforms;
- broken walkways;
- small bounce gaps;
- one or two laser barriers;
- short sticky-wall sections.

---

# 24. Suggested Zone 2 Sequence

```text
ENTRY FLOOR
    │
    ▼
LOW CRATE / MACHINE
    │
    ▼
SMALL GAP
    │
    ▼
BOUNCE TO PIPE PLATFORM
    │
    ▼
STICKY PANEL
    │
    ▼
SIDE PLATFORM
    │
    ▼
LASER BARRIER
    │
    ▼
CENTRAL PEDESTAL
```

---

# 25. Zone 2 Laser Philosophy

Room 4 was already the laser-dodging set-piece.

Room 5 should use lasers differently.

Prefer lasers as:

> **routing obstacles**

rather than constant sweeping attacks.

Example:

```text
DIRECT ROUTE

════════════════════════════
        LASER BARRIER


PLAYER ●

```

The player sees that the direct route is blocked.

They must climb around it.

---

# 26. Static Laser Barriers

A static active laser can block:

- a walkway;
- a doorway;
- a low route.

The player goes:

- over it;
- around it;
- between timed gaps.

This creates traversal variety without recreating Room 4.

---

# 27. Timed Laser Windows

Some laser barriers can pulse.

States:

```text
WARNING
ACTIVE
OFF
ACTIVE
OFF
```

The player waits for an off window and moves.

Keep timing predictable.

---

# 28. Laser Readability

Every laser should have:

- emitter;
- visible beam;
- clear warning;
- consistent red/electrical visual language.

Reuse the Room 4 laser system.

Do not build a separate Room 5 hazard architecture.

---

# 29. Room 5 Laser Failure

If Bob touches a laser:

- short impact feedback;
- respawn at latest checkpoint;
- restore relevant traversal state.

Do not reset all the way to Room 4.

---

# 30. Room 5 Checkpoints

Because Room 5 is larger and harder, use multiple checkpoints.

Recommended:

## Checkpoint A

Room entrance.

---

## Checkpoint B

Near central containment pedestal.

---

## Checkpoint C

Before final sticky-wall challenge.

This keeps retries reasonable.

---

# 31. Checkpoint Reset Scope

Each checkpoint should reset only the relevant challenge group if possible.

Example:

```text
Checkpoint C reset
→ player
→ final lasers
→ moving obstacles
```

It should not replay:

- Goop release;
- previous sections;
- Room 4.

---

# 32. Zone 3 — Central Containment Pedestal

The central containment pedestal should be one of the most important structures in the room.

Recommended pedestal dimensions:

```text
Width:   8–12 units
Depth:   8–12 units
Height:  4–6 units
```

Example:

```text
          ┌──────────────┐
          │ CONTAINMENT  │
          │     BOX      │
          └──────────────┘
             ███████
             ███████
             ███████
             ███████
             PEDESTAL
```

---

# 33. Containment Pedestal Purpose

The pedestal serves:

- story;
- navigation;
- traversal;
- visual hierarchy.

The player should physically use it.

---

# 34. Reaching the Pedestal

The player should not simply jump from floor to pedestal.

Use one short sequence.

Example:

```text
MACHINE
   │
   ▼
STICKY COLUMN
   │
   ▼
SIDE LEDGE
   │
   ▼
PEDESTAL
```

---

# 35. Goop Containment Box

The metal box should sit on top of the pedestal.

Recommended starting size:

```text
Width:   5–7 units
Depth:   5–7 units
Height:  5–7 units
```

Tall enough to feel significant.

---

# 36. Container Shape

Use a strong silhouette.

Possible:

```text
       ┌────────────┐
      /              \
     /   HAZARD ☣    \
    │                │
    │                │
    │      GOOP      │
    │                │
    │                │
     \              /
      └────────────┘
```

Or a heavy rectangular industrial enclosure.

Simple is fine for greybox.

---

# 37. Container Visual Language

Use:

- yellow/black hazard markings;
- corrosion warning symbol;
- specimen number;
- reinforced seams;
- locking clamps;
- small status lights.

Possible signage:

```text
CORROSIVE BIOLOGICAL SPECIMEN
```

or:

```text
CAUTION
CORROSIVE MATERIAL
```

---

# 38. Showing Goop Before Release

There are two options.

## Option A — Fully opaque container

Player cannot see Goop.

Mystery is stronger.

---

## Option B — Small reinforced viewing slit

Player sees:

- green glow;
- slime movement;
- corrosive fluid.

This more clearly communicates there is a living specimen inside.

I recommend:

> **small viewing slit or narrow glass section**

rather than a fully visible glass container.

---

# 39. Container as Traversal Geometry

The container should be safe to stand on.

Bob can:

1. reach pedestal;
2. climb container side or nearby sticky panel;
3. reach container top;
4. bounce from container toward upper structures.

This makes the objective physically part of the route.

---

# 40. Container Collision

Use simple collision.

Visual:

```text
detailed metal container
```

Collision:

```text
1–3 simple boxes
```

Do not use every panel/bolt as collision geometry.

---

# 41. Containment Box Should Not Open Early

Before the lever is pulled:

```text
containerLocked = true
```

Bob cannot:

- break it;
- bounce it open;
- stick-pull panels off.

The release lever is the only solution.

---

# 42. Zone 4 — Upper Platform Network

After using the containment structure, Bob reaches the upper half of the room.

This section should feel more vertical.

Structures can include:

- maintenance catwalks;
- suspended platforms;
- large pipes;
- wall supports;
- broken observation equipment;
- narrow machinery roofs.

---

# 43. Zone 4 Route

Example:

```text
CONTAINER TOP
      │
      ▼
HIGH PIPE
      │
      ▼
BROKEN CATWALK
      │
      ▼
SMALL STICKY WALL
      │
      ▼
SUSPENDED PLATFORM
      │
      ▼
CHECKPOINT C
      │
      ▼
FINAL WALL SECTION
```

---

# 44. Upper Route Readability

Use environmental cues to direct the player.

Good cues:

- sticky tiles;
- brighter lights;
- yellow platform edges;
- cables;
- broken catwalk direction;
- visible observation opening.

Avoid giant floating arrows unless testing proves necessary.

---

# 45. Looking Back at Goop

During the upper traversal, the player should occasionally see the containment box below.

This reinforces:

> I am climbing all of this to reach the controls for that specimen.

---

# 46. Zone 5 — Final Sticky-Wall Challenge

This is the hardest Bob-specific challenge in Level 1.

The player should already have reached Checkpoint C.

---

# 47. Final Challenge Design Principle

It should test:

- adhesion;
- surface-to-surface transfers;
- bounce timing;
- positioning;
- hazard timing.

It should **not** require pixel-perfect jumps.

---

# 48. Sticky Tile Layout

Do not make entire walls sticky.

Use isolated sticky tiles.

Example:

```text
WALL LEFT                         WALL RIGHT

│      ███                         ███      │
│      ███                                  │
│                                           │
│                     ●                     │
│                                           │
│                         ███               │
│                         ███               │
│                                           │
│   ███                                     │
│   ███                                     │
│                                           │
```

---

# 49. Sticky Tile Size

Tiles should be large enough to land on reliably.

Starting size:

```text
2.5–4 units wide
2.5–4 units tall
```

Tune against Bob's collider and jump distance.

---

# 50. Sticky Tile Spacing

The first transfer should be forgiving.

Then gradually increase difficulty.

Example:

```text
Transfer 1:
easy

Transfer 2:
moderate

Transfer 3:
moderate + laser timing

Transfer 4:
hardest final transfer
```

---

# 51. First Sticky Transfer

No laser.

Purpose:

Let player read the layout.

---

# 52. Second Sticky Transfer

Add larger gap or height difference.

Still no hazard.

---

# 53. Third Sticky Transfer

Introduce one timed laser crossing the jump path.

Example:

```text
WALL A                              WALL B

 ███                                 ███
  ●
       ═════════ LASER ═════════

             jump →
```

Laser periodically turns off.

---

# 54. Third Transfer Timing

Example cycle:

```text
warning:  0.5 sec
active:   2.0 sec
off:      1.5 sec
```

Player waits for opening.

The exact values require testing.

---

# 55. Final Sticky Transfer

The final transfer can combine:

- vertical difference;
- longer jump;
- one predictable moving/pulsing hazard.

Do not use multiple unpredictable lasers.

---

# 56. Wall Camera Testing

This section must be heavily tested because Bob's orientation and camera may change on sticky surfaces.

Test:

- left wall;
- right wall;
- high wall;
- transferring across room;
- camera facing observation room;
- laser visibility while attached.

If the player cannot see the next sticky tile before jumping, redesign geometry.

Do not rely on memorisation.

---

# 57. Anti-Cheese Surface Tagging

Only intended surfaces should be sticky.

Do not accidentally tag:

- every pillar;
- ceiling;
- observation-room exterior;
- decorative pipes;

as sticky.

Otherwise the player may bypass the route.

---

# 58. Final High Platform

Completing the sticky sequence places Bob on the highest major platform.

This should provide a clear line of sight to:

```text
opening above observation glass
```

---

# 59. Final Platform Placement

The platform should be:

- high enough;
- far enough;

that Bob must use a deliberate strong bounce.

However, the opening should be generous.

---

# 60. Observation Opening

Recommended opening size:

```text
Width:   3–5 units
Height:  2.5–4 units
```

Do not make it a tiny vent-hole accuracy test.

The challenge was reaching the launch platform.

The final jump is the payoff.

---

# 61. Final Bounce

The player should:

1. position on high platform;
2. charge/prepare bounce;
3. launch;
4. pass through opening;
5. land safely in observation room.

---

# 62. Observation-Room Landing

Place a generous floor immediately inside.

Do not make the player fall back out.

Possible collision lip behind opening if needed.

---

# 63. Zone 6 — Observation Room

Once inside, gameplay intensity drops sharply.

The observation room is safe.

No:

- lasers;
- difficult jumps;
- moving platforms.

This is the payoff zone.

---

# 64. Observation-Room Dimensions

Approximate:

```text
8–12 units wide
5–8 units deep
4–6 units high
```

Large enough for:

- glass;
- lever;
- equipment;
- camera;
- Bob movement.

---

# 65. Observation-Room Glass

The glass should overlook:

- containment box;
- pedestal;
- major parts of the chamber.

The player should immediately recognise:

> I am finally inside the room I saw from below.

---

# 66. Observation-Room Props

Possible:

- control panels;
- inactive monitors;
- specimen diagrams;
- emergency switches;
- warning signs;
- chairs;
- broken equipment.

These are mostly decorative.

---

# 67. Release Lever Placement

Place lever close to the observation glass.

The player should see Goop's container while interacting with it.

This creates a clear cause-and-effect shot.

---

# 68. Lever Design

The lever should be large.

Not a tiny realistic switch.

Example:

```text
       HANDLE
          ●
          │
          │
          │
      ┌───────┐
      │ BASE  │
      └───────┘
```

Large enough for Bob to visibly stick to.

---

# 69. Lever Interaction Philosophy

Do not use:

```text
Press E
```

as the primary interaction.

The player physically uses Bob's ability.

Sequence:

1. Bob jumps onto handle;
2. sticky contact detected;
3. Bob attaches;
4. Bob's weight / scripted interaction begins pulling lever down;
5. lever rotates;
6. release triggers at bottom.

---

# 70. Lever Physics

Do not build real torque physics.

Use authored lever movement.

Conceptually:

```text
if (
    bob.isAttached &&
    leverHandle.contains(bob)
) {
    lever.pullProgress += dt;
}
```

Then:

```text
lever.rotation = lerp(
    UP_ANGLE,
    DOWN_ANGLE,
    pullProgress
);
```

---

# 71. Lever Pull Duration

Suggested:

```text
1–2 seconds
```

It should visibly feel heavy.

Too fast:

```text
feels like normal switch
```

Too slow:

```text
becomes tedious
```

---

# 72. Lever Lock

Once fully down:

```text
leverState = LOCKED_DOWN
```

It should not spring back.

---

# 73. Lever Feedback

While pulling:

- metallic strain sound;
- lever base movement;
- warning light begins activating;
- optional vibration.

At completion:

```text
CLUNK
```

Then immediately begin cutscene.

---

# 74. Goop Release Trigger

Release occurs only once.

Conceptually:

```text
if (
    lever.progress >= 1 &&
    !goopReleased
) {
    goopReleased = true;
    startReleaseCutscene();
}
```

---

# 75. Cutscene Start

When cutscene begins:

- disable player input;
- preserve Bob position safely;
- release camera from normal follow;
- disable Room 5 failure hazards if necessary;
- begin authored camera sequence.

The project plan already calls for short, in-engine, skippable camera sequences, so this can use the same cutscene infrastructure rather than creating a separate cinematic system.

---

# 76. Goop Release Cutscene Duration

Target:

```text
5–8 seconds
```

Absolute maximum:

```text
~10 seconds
```

Keep it short.

---

# 77. Goop Release Cutscene — Shot 1

Camera starts near Bob/lever.

Show:

- lever locked down;
- glass;
- containment below.

Duration:

```text
~1 sec
```

---

# 78. Cutscene — Shot 2

Camera moves toward containment box.

Warning lights activate.

Possible sequence:

```text
BEEP
BEEP
BEEP
```

Containment indicators change state.

---

# 79. Cutscene — Shot 3

Mechanical locks disengage.

Example:

```text
CLUNK
CLUNK
CLUNK
```

Containment panels begin moving.

---

# 80. Containment Opening Animation

Keep mechanical animation simple.

Possible container structure:

```text
ContainmentRoot
├── Base
├── PanelFront
├── PanelBack
├── PanelLeft
├── PanelRight
└── Goop
```

Animate panels away from centre.

---

# 81. Containment Animation Option

Example:

```text
PanelLeft  → slides left
PanelRight → slides right
TopPanel   → lifts
FrontPanel → lowers
```

Only use as many panels as needed for a convincing reveal.

---

# 82. Goop Reveal

Once open:

- Goop becomes clearly visible;
- use its distinct yellow-green corrosive identity;
- use different visual motion from Bob;
- optional drip particles;
- small corrosive effect on nearby metal.

This is the player's first proper look at Goop.

---

# 83. Goop Jump

Goop then jumps/drops from containment pedestal to the main room floor.

This movement can be scripted.

Do not require full AI pathfinding.

Example:

```text
Goop
  │
  ▼
scripted hop
  │
  ▼
landing point
```

---

# 84. Goop Landing Position

Choose a landing location that supports the immediate tutorial.

Recommended:

- near the central pedestal;
- visible from Bob's current camera;
- with a simple route toward the exit vent.

Do not land Goop inside a complicated obstacle field.

---

# 85. Cutscene Ending

Camera returns to normal player view.

Before control resumes:

- Bob remains in observation room;
- Goop is visible below;
- both slime entities now exist in the controllable roster.

Then:

```text
inputEnabled = true
```

---

# 86. Slime Swapping Prompt

Immediately after control returns, show a large temporary tutorial prompt.

Example:

```text
SLIME SWAPPING

Press [Swap Key] to switch slime
```

The displayed input should be pulled from the actual input/action mapping rather than hard-coded if possible.

---

# 87. Tutorial Prompt Behaviour

The prompt should:

- appear prominently;
- remain until the player successfully swaps;
- disappear after first successful swap;
- optionally remain as a smaller HUD reminder afterward.

---

# 88. First Swap

The player presses the swap action.

Control transfers from Bob to Goop.

---

# 89. Camera Handoff

Switching should use the existing slime-manager camera handoff rather than an instant disorienting cut if that system is available.

Ideal:

```text
Bob
  │
  │  camera interpolation
  ▼
Goop
```

Duration:

```text
~0.3–0.5 seconds
```

---

# 90. Inactive Bob

After switching:

- Bob remains where he was;
- Bob does not vanish;
- Bob remains visible;
- Bob does not continue moving independently.

This immediately teaches the player:

> Switching means controlling another physical slime, not transforming Bob.

---

# 91. Goop Control Introduction

The player should now be able to move Goop.

For Room 5, Goop only needs:

- basic movement;
- basic jumping/bounce if applicable;
- corrosive interaction.

Do not require sophisticated Goop traversal yet.

---

# 92. Preventing Goop From Being Trapped

Because Bob is inside the observation room and Goop lands below, verify that this state is intentional.

The player should not need to physically reunite them before leaving.

Entering the exit vent with either slime will trigger the level transition for both.

This avoids requiring Goop to complete Bob's final traversal route.

---

# 93. Goop Tutorial Objective

After first swap, show a new short objective:

```text
Find a way out
```

or:

```text
Use Goop to open the vent
```

Prefer environmental guidance if the blocked vent is clearly visible.

---

# 94. Exit Vent Location

Place the Level 1 exit vent somewhere reachable from the main lower floor.

Do not place it back at the observation-room height.

Goop should be able to reach it easily.

---

# 95. Exit Vent Visual

Example:

```text
┌──────────────────────┐
│                      │
│      EXIT VENT       │
│                      │
│  ██████████████████  │
│  CORRODIBLE BARRIER  │
│  ██████████████████  │
│                      │
└──────────────────────┘
```

---

# 96. Corrodible Barrier Material

The user concept describes a wooden tile/panel.

That works mechanically if the game clearly establishes it as a material Goop can destroy.

However, because Goop is corrosive rather than literally fire-based, the visual effect should preferably read as:

> **chemical dissolution/corrosion**

rather than burning flames.

Possible material:

- treated wooden panel;
- weak composite board;
- marked soluble barrier;
- damaged fibre panel.

---

# 97. Marking Soluble Surfaces

Use a consistent visual language for Goop-soluble objects.

Possible cues:

- hazard stripe border;
- specific surface colour;
- corrosion icon;
- visible material grain;
- weak/damaged appearance.

This becomes important throughout Level 2.

---

# 98. Exit Barrier Tutorial Simplicity

The barrier should be extremely easy to reach.

No new platforming challenge.

The tutorial sequence should be:

```text
SWITCH TO GOOP
      │
      ▼
SEE BLOCKED VENT
      │
      ▼
MOVE TO PANEL
      │
      ▼
CONTACT / ACTIVATE CORROSION
      │
      ▼
PANEL DISSOLVES
      │
      ▼
VENT OPEN
```

---

# 99. Goop Corrosion Interaction

Use whichever interaction model the final Goop design uses.

Recommended simple version:

```text
Goop touches marked soluble surface
        ↓
dissolve begins automatically
```

This keeps the first tutorial understandable.

---

# 100. Corrosion Progress

Suggested duration:

```text
1.5–3 seconds
```

Fast enough to feel powerful.

Slow enough for player to see the effect.

---

# 101. Corrosion Visual

Possible sequence:

```text
contact
   ↓
surface edge glows
   ↓
noise/dissolve threshold spreads
   ↓
particles/drips
   ↓
panel disappears
```

The project plan already proposes a game-state-driven dissolve shader for soluble surfaces, making this an ideal first practical demonstration of that effect.

---

# 102. Corrosion Collision

Do not remove collision before the visible barrier has mostly dissolved.

Otherwise Goop may appear to walk through intact material.

Suggested:

```text
0–70% dissolve:
collision active

70–100%:
disable collision

100%:
hide/remove surface
```

Tune visually.

---

# 103. Corrosion Reset

Before Goop has been released, normal Room 5 checkpoints may reset puzzle states.

After Goop release, this barrier should not unexpectedly return unless the entire level restarts.

---

# 104. Vent Opens

Once barrier is dissolved:

- vent opening becomes physically accessible;
- small audio cue;
- optional objective update:

```text
Escape through the vent
```

---

# 105. Who Can Enter the Vent?

Either:

- Bob;
- Goop;

can trigger the end.

This is important because Bob may still be inside the observation room.

Do not force the player to manually move both slimes into the vent.

---

# 106. Level Exit Trigger

Place the completion trigger slightly inside the vent.

Example:

```text
VENT OPENING
    │
    │
    ▼
[ trigger volume ]
```

This prevents accidental activation just by standing near it.

---

# 107. Level-End Trigger Conditions

Recommended:

```text
goopReleased == true
exitBarrierDestroyed == true
activeSlime enters ExitTrigger
```

Then:

```text
startLevel1EndCutscene()
```

---

# 108. Level 1 End Cutscene

This cutscene should communicate that **both slimes are leaving together**, regardless of which one entered the vent.

---

# 109. End Cutscene Duration

Target:

```text
5–8 seconds
```

Keep transition quick.

---

# 110. End Cutscene — Shot 1

Active slime crawls into vent.

Camera follows briefly.

---

# 111. End Cutscene — Shot 2

Other slime appears/follows.

This does not need complex AI.

The second slime can be repositioned for the cutscene after control is removed.

---

# 112. End Cutscene — Vent Travel

Show both slimes moving deeper through the duct.

Possible simple structure:

```text
Bob  ● →
Goop ● →

══════════════════════════
        AIR DUCT
══════════════════════════
```

Camera can be positioned ahead or behind them.

---

# 113. End Cutscene — Duct Failure

The vent either:

- slopes downward sharply;
- has a broken section;
- collapses beneath them.

The slimes begin falling.

---

# 114. Fall Into Level 2

Possible visual:

```text
         BROKEN DUCT
            ╲
             ╲
              ● Bob
               ● Goop
                  │
                  │
                  ▼
             DARKNESS
```

This creates a natural transition.

---

# 115. Level Loading During Transition

If needed, use the fall/darkness to hide level loading.

Possible:

1. both fall;
2. camera follows;
3. screen darkens;
4. Level 1 disposes;
5. Level 2 builds;
6. fade back in;
7. both land.

---

# 116. Level 2 Start

The first Level 2 room should contain both Bob and Goop.

The exact Level 2 layout is separate from this plan.

Room 5 only needs to guarantee:

```text
Bob unlocked
Goop unlocked
Goop tutorial completed
current roster contains both
```

---

# 117. Persistent Progress State

When Goop is freed, set an authoritative game progression flag.

Conceptually:

```text
unlockedSlimes = [
    BOB,
    GOOP
]
```

Do not make Goop's availability dependent on whether the Room 5 entity still exists after unloading the level.

---

# 118. Recommended Room Controller Structure

Room 5 has enough state that it should have one clear coordinator.

Possible:

```text
Room5Controller
```

Responsibilities:

- traversal checkpoints;
- Goop containment state;
- lever release;
- release cutscene;
- Goop activation;
- swap tutorial;
- exit barrier;
- Level 1 completion.

---

# 119. Suggested Room 5 States

```text
TRAVERSAL
    │
    ▼
OBSERVATION_ROOM
    │
    ▼
LEVER_PULL
    │
    ▼
GOOP_RELEASE_CUTSCENE
    │
    ▼
SWAP_TUTORIAL
    │
    ▼
GOOP_TUTORIAL
    │
    ▼
EXIT_READY
    │
    ▼
LEVEL_END_CUTSCENE
    │
    ▼
COMPLETE
```

---

# 120. State — `TRAVERSAL`

Active while Bob is navigating the main chamber.

Allows:

- checkpoints;
- lasers;
- Bob traversal.

Goop unavailable.

---

# 121. State — `OBSERVATION_ROOM`

Begins when Bob enters the observation room.

Main objective becomes lever.

---

# 122. State — `LEVER_PULL`

Begins once Bob sticks to handle.

Can prevent accidental repeated interaction.

---

# 123. State — `GOOP_RELEASE_CUTSCENE`

Input disabled.

Containment animation runs.

---

# 124. State — `SWAP_TUTORIAL`

Input restored.

Both slimes controllable.

Large swap tutorial shown.

---

# 125. State — `GOOP_TUTORIAL`

Triggered after first successful switch to Goop.

Player needs to corrode exit barrier.

---

# 126. State — `EXIT_READY`

Barrier destroyed.

Either slime may enter vent.

---

# 127. State — `LEVEL_END_CUTSCENE`

Input disabled.

Transition sequence runs.

---

# 128. State — `COMPLETE`

Level 1 unload begins.

---

# 129. Suggested Internal Flags

Conceptually:

```ts
roomState

goopReleased
swapTutorialCompleted
exitBarrierDestroyed
levelComplete

currentCheckpoint
releaseCutscenePlayed
endCutscenePlayed
```

Avoid duplicating state across unrelated objects.

---

# 130. Failure Before Goop Release

If Bob fails traversal:

- respawn at latest checkpoint;
- reset current hazard group;
- Goop remains contained;
- lever remains untouched.

---

# 131. Failure After Goop Release

Ideally, the post-release section should be so safe that failure is unlikely.

If a slime falls out of bounds:

- respawn that slime at a safe post-release point;
- do not replay release cutscene;
- Goop remains unlocked;
- exit barrier preserves appropriate state.

---

# 132. Do Not Replay Cutscenes on Reset

Once the release cutscene has successfully completed:

```text
releaseCutscenePlayed = true
```

Normal checkpoint resets must not replay it.

Same for Level 1 transition once completion begins.

---

# 133. Checkpoint A — Room Entry

Location:

just outside Room 5 entry vent.

Used if player fails early lower traversal.

---

# 134. Checkpoint B — Central Pedestal

Location:

safe platform around pedestal or immediately after reaching it.

---

# 135. Checkpoint C — Final Challenge

Location:

upper platform just before the hardest sticky-wall sequence.

This is the most important checkpoint.

---

# 136. Checkpoint D — Post Release

Optional safe post-release state.

Once Goop is free, respawns can use:

- Bob safe point in observation area;
- Goop safe point on lower floor.

---

# 137. Camera During Main Chamber

Normal third-person camera should remain active.

Room 5's geometry must be designed around camera usability.

---

# 138. Camera Clearance

Because the room is intentionally visually dense:

> Decorative density must not mean camera collision density.

Leave invisible camera corridors around major traversal areas.

---

# 139. Avoid Narrow Tunnels Outside Vents

Do not place Bob between:

```text
wall
Bob
large machinery
```

with only 1–2 units of clearance during active platforming.

The camera will struggle.

---

# 140. Dense Visuals, Open Gameplay

Use this principle:

```text
PLAYER PATH
   = relatively clear

BACKGROUND / SIDES
   = visually cluttered
```

This creates a cramped feeling without harming controls.

---

# 141. Observation-Room Camera

Inside the observation room:

- slightly closer camera may be fine;
- avoid camera clipping through glass;
- make lever and containment visible simultaneously where possible.

---

# 142. Cutscene Camera Hierarchy

Use authored camera targets.

Possible:

```text
ReleaseCutscene
├── lever shot
├── containment shot
├── Goop reveal
└── Goop landing
```

Do not attach camera directly to moving container panels.

---

# 143. Lighting — Main Chamber

Room 5 should visually feel more dangerous and industrial than earlier rooms.

Suggested palette:

- cold industrial whites;
- dark metal;
- red hazard lighting;
- yellow warning accents;
- green/yellow Goop glow.

---

# 144. Central Containment Lighting

Make Goop's pedestal visually prominent.

Use:

- overhead spotlight;
- floor warning lights;
- emissive containment indicators.

It should draw attention from the room entrance.

---

# 145. Observation-Room Lighting

The observation room can use:

- cooler white light;
- illuminated control panels;
- bright lever status light.

This helps separate it visually from the main chamber.

---

# 146. Goop Release Lighting

During cutscene:

```text
containment lights:
RED
 ↓
FLASH
 ↓
AMBER
 ↓
GREEN / RELEASED
```

This provides visual cause-and-effect.

---

# 147. After Goop Release

Consider subtly changing room lighting.

For example:

- red containment lights stop;
- green corrosive glow appears;
- exit vent lighting activates.

This signals progression.

---

# 148. Laser Lighting

Reuse Room 4 visual language.

Do not add one real point light per laser.

Use emissive beams plus a limited number of actual lights.

The project brief explicitly warns about performance costs from excessive lights, shadows, draw calls and per-frame allocations on browser/lab hardware.

---

# 149. Audio — Room 5 Ambient

Base loop:

- ventilation;
- distant machinery;
- electrical hum;
- containment equipment.

Room 5 should sound busier than earlier chambers.

---

# 150. Audio — Containment

Near Goop's box:

- low bubbling;
- occasional metal creak;
- subtle acidic hiss;
- warning beep.

These sounds help communicate something dangerous inside.

---

# 151. Audio — Laser

Reuse:

- charge cue;
- active hum;
- hit zap.

Consistency helps readability.

---

# 152. Audio — Lever

Layer:

```text
sticky contact
metal strain
lever movement
heavy CLUNK
```

---

# 153. Audio — Release Cutscene

Possible:

```text
alarm tone
locking bolts
hydraulics
metal panels opening
acid hiss
Goop landing
```

---

# 154. Audio — Swap Tutorial

First successful swap could play a distinct short audio cue.

This helps teach that control changed.

---

# 155. Audio — Corrosion

Goop interaction:

- fizz;
- wet chemical hiss;
- cracking material;
- dissolve completion sound.

---

# 156. Audio — Level End

During vent transition:

- duct movement;
- metal creak;
- sudden break;
- falling wind;
- impact or Level 2 landing sound.

---

# 157. Particles

Optional Room 5 particles:

- dust;
- sparks;
- containment vapor;
- Goop drips;
- corrosion particles;
- laser impact sparks.

Purely visual.

No particle physics needed.

---

# 158. Goop Visual Introduction

Goop must be visually distinct from Bob immediately.

Recommended:

- yellow-green coloration;
- more viscous motion;
- slower wobble;
- dripping edges;
- corrosive particles;
- less elastic silhouette.

---

# 159. Goop Should Not Look Like Bob Recoloured

Even if they share the same underlying slime mesh/shader architecture, adjust:

- wobble frequency;
- squash;
- emissive values;
- surface noise;
- particle behaviour.

The project's slime-visual design already anticipates distinct visual identities driven through shared shader infrastructure.

---

# 160. Post-Release HUD

Once Goop is unlocked, HUD should show both slimes.

Example:

```text
[1] Bob
[2] Goop
```

or whatever final input scheme is used.

If cycling is supported:

```text
[Swap Key] Switch Slime
```

---

# 161. Active Slime Indicator

Clearly indicate which slime is controlled.

Possible:

```text
BOB — ACTIVE
GOOP
```

then:

```text
BOB
GOOP — ACTIVE
```

---

# 162. First-Swap Tutorial Completion

When player successfully swaps:

```text
swapTutorialCompleted = true
```

Large tutorial disappears.

Do not show it every subsequent swap.

---

# 163. Corrosion Tutorial Prompt

If needed after switching to Goop:

```text
Goop can dissolve marked surfaces
```

Keep it brief.

Ideally the blocked vent and material language make this obvious enough.

---

# 164. Exit Vent Positioning

Place blocked exit vent within easy visual range of Goop's landing position.

The player should not spend five minutes searching after the cutscene.

---

# 165. Optional Environmental Guidance

Use:

- illuminated exit sign;
- damaged panel;
- light behind vent;
- airflow particles;
- visible corrosion marking.

Avoid giant floating arrows unless necessary.

---

# 166. Collision Geometry Strategy

Use simple collision throughout.

Recommended:

```text
room shell:
large boxes

platforms:
box colliders

pipes used for traversal:
simple cylinders/boxes if needed

decorative pipes:
no collision

container:
few boxes

pedestal:
boxes

observation room:
boxes

sticky tiles:
simple boxes

laser hazards:
trigger volumes
```

---

# 167. Static Geometry

Merge or batch noninteractive environment geometry where practical.

Examples:

- decorative wall panels;
- structural beams;
- repeated trim.

Do not merge objects that need independent gameplay state.

---

# 168. Materials

Reuse shared materials where possible.

Avoid creating unique materials for every pipe/platform.

Room 5 is dense enough that unnecessary material proliferation can inflate draw calls.

---

# 169. Sticky Tile Material

Sticky tiles must remain unmistakable.

Use exactly the established sticky-surface visual language from earlier rooms.

Do not invent a new colour/style only for Room 5.

---

# 170. Soluble Material Language

The exit barrier introduces Goop's material language.

This becomes the template for Level 2.

Choose it carefully.

The player should later be able to identify soluble geometry without text.

---

# 171. Room Reset Architecture

All interactive Room 5 components should expose reset behaviour where relevant:

- lasers;
- moving platforms;
- lever before release;
- containment before release;
- temporary effects.

This aligns with the project's existing puzzle-reset approach.

---

# 172. Pre-Release Reset

Before Goop is free:

```text
reset current checkpoint group
```

Lever and containment should only reset if failure occurs before release completes.

---

# 173. Post-Release Persistence

After Goop is free:

```text
goopReleased = true
```

Normal failure must not:

- put Goop back in box;
- reset lever upward;
- replay cinematic.

---

# 174. Softlock Prevention

Test these situations:

- Bob reaches observation room but misses lever;
- Bob falls inside observation room;
- Goop spawns somewhere inaccessible;
- Bob remains in observation room while Goop is active;
- player swaps repeatedly;
- exit barrier dissolves while Bob is active elsewhere;
- player swaps during corrosion;
- player enters vent immediately after barrier disappears.

Every state needs a valid continuation.

---

# 175. Bob in Observation Room After Release

This is acceptable.

Bob does not have to immediately leave the observation room.

Because either slime can trigger Level 1 completion, the player can:

```text
switch to Goop
→ dissolve exit
→ enter vent
```

without retrieving Bob.

The cutscene then reunites both.

---

# 176. Optional Observation-Room Escape

If desired, the lever activation can unlock a simple door/drop route from observation room into the main chamber.

This would let Bob physically reunite with Goop.

However:

> This is optional.

Do not add it if it creates extra complexity.

The simpler version is completely acceptable.

---

# 177. Level Completion Authority

Do not unload Level 1 immediately on vent contact.

First:

```text
lock input
mark completion
run cutscene
```

Then unload.

This prevents duplicate triggers.

---

# 178. Trigger Lock

Once Level 1 ending begins:

```text
isTransitioning = true
```

Any additional trigger events should be ignored.

---

# 179. Cutscene Skipping

If your game supports cutscene skipping:

- skipping release cutscene must still correctly unlock Goop;
- skipping end cutscene must still correctly load Level 2.

Never tie gameplay state exclusively to animation completion callbacks that can be bypassed.

---

# 180. Building Room 5 — Recommended Implementation Order

Build in strict stages.

Do not start with art.

---

# Phase A — Room Shell

## Step 1

Build:

- floor;
- walls;
- ceiling;
- observation-room volume;
- entry vent;
- exit vent.

---

## Step 2

Place central pedestal.

---

## Step 3

Place placeholder Goop container.

---

## Step 4

Stand at entry and verify visual composition.

You should see:

- container;
- observation room;
- approximate final opening.

Do not continue until the room reads clearly.

---

# Phase B — Room 4 Connection

## Step 5

Build sticky-tile route from elevator to vent.

---

## Step 6

Build short air duct.

---

## Step 7

Test complete transition:

```text
Room 4
→ sticky wall
→ vent
→ Room 5
```

---

# Phase C — Main Greybox Route

## Step 8

Greybox Zone 2.

No lasers initially.

---

## Step 9

Greybox central pedestal traversal.

---

## Step 10

Make container top part of route.

---

## Step 11

Build upper platforms.

---

## Step 12

Build final sticky-wall sequence.

---

## Step 13

Build final bounce into observation room.

---

# Phase D — Checkpoints

## Step 14

Add Room 5 entry checkpoint.

---

## Step 15

Add central checkpoint.

---

## Step 16

Add final-challenge checkpoint.

---

## Step 17

Test intentional falls from every major section.

Respawn must always be correct.

---

# Phase E — Lasers

## Step 18

Reuse Room 4 laser hazard.

---

## Step 19

Add one simple barrier in lower room.

---

## Step 20

Add one timed barrier.

---

## Step 21

Add final wall-jump laser.

---

## Step 22

Test all lasers independently.

Do not add more until these feel fair.

---

# Phase F — Lever

## Step 23

Create lever hierarchy.

Example:

```text
LeverRoot
├── Base
└── LeverPivot
    └── Handle
```

---

## Step 24

Make Bob detect sticky contact with handle.

---

## Step 25

Animate lever downward.

---

## Step 26

Lock lever when complete.

---

## Step 27

Trigger placeholder release event.

At this stage it can simply print:

```text
GOOP RELEASED
```

---

# Phase G — Goop Containment

## Step 28

Build container hierarchy.

---

## Step 29

Create simple authored opening animation.

---

## Step 30

Place placeholder Goop mesh/entity inside.

---

## Step 31

Create scripted Goop jump to landing point.

---

# Phase H — Release Cutscene

## Step 32

Build lever shot.

---

## Step 33

Build containment shot.

---

## Step 34

Build Goop reveal.

---

## Step 35

Build Goop landing.

---

## Step 36

Restore gameplay camera.

---

## Step 37

Verify cutscene skip if supported.

---

# Phase I — Slime Unlock

## Step 38

Add Goop to slime roster only after release event.

---

## Step 39

Show swap prompt.

---

## Step 40

Test switch:

```text
Bob → Goop
Goop → Bob
```

repeatedly.

---

## Step 41

Verify inactive slime holds position.

---

# Phase J — Goop Exit Tutorial

## Step 42

Add blocked exit vent.

---

## Step 43

Create soluble barrier.

---

## Step 44

Connect Goop corrosion interaction.

---

## Step 45

Add dissolve effect.

---

## Step 46

Disable barrier collision at correct dissolve threshold.

---

## Step 47

Expose exit trigger.

---

# Phase K — Level Transition

## Step 48

Allow either slime to activate exit.

---

## Step 49

Disable input.

---

## Step 50

Move both slimes into transition cutscene positions.

---

## Step 51

Animate vent travel/fall.

---

## Step 52

Unload Level 1.

---

## Step 53

Load Level 2.

---

# Phase L — Art Pass

Only now replace greybox with:

- room architecture;
- containment art;
- pipes;
- machinery;
- catwalks;
- sticky tiles;
- observation equipment;
- vent assets;
- signs.

---

# Phase M — Lighting

Add:

- chamber lighting;
- containment focus;
- hazard lights;
- observation-room lights;
- Goop release changes.

---

# Phase N — Audio

Add:

- ambient room;
- containment hum;
- lasers;
- lever;
- locks;
- Goop reveal;
- corrosion;
- vent transition.

---

# Phase O — Effects

Add:

- sparks;
- containment vapor;
- Goop drips;
- dissolve particles;
- laser polish.

---

# Phase P — Tuning

Tune:

- jumps;
- sticky tile spacing;
- laser timings;
- checkpoint positions;
- lever duration;
- cutscene length;
- corrosion speed.

---

# 181. Greybox Acceptance Gate

Before any serious art pass:

- [ ] Room 4 connects into Room 5.
- [ ] Entry vent works.
- [ ] Main objective is visually understandable.
- [ ] Complete Bob route is playable.
- [ ] Container is part of route.
- [ ] Sticky-tile finale works.
- [ ] Lasers are fair.
- [ ] Checkpoints work.
- [ ] Observation opening is reachable.
- [ ] Bob can stick to lever.
- [ ] Lever triggers release.
- [ ] Goop appears.
- [ ] Goop becomes controllable.
- [ ] Swapping works.
- [ ] Goop can dissolve exit barrier.
- [ ] Either slime can trigger exit.
- [ ] Level 2 transition works.

If any of these are broken:

> do not spend time decorating Room 5 yet.

---

# 182. Playtesting — Entry

Ask a tester to enter Room 5 without explanation.

Check whether they notice:

1. containment box;
2. observation room;
3. lever;
4. general direction of route.

If not, fix visual hierarchy.

Do not immediately add more HUD text.

---

# 183. Playtesting — Main Route

Observe whether tester:

- understands where to start;
- recognises sticky tiles;
- sees upper route;
- gets lost among decorative structures.

If players frequently wander into dead ends, simplify geometry.

---

# 184. Playtesting — Difficulty

Ideal difficulty curve:

```text
Entry:
easy

Lower route:
moderate

Containment:
moderate

Upper route:
moderate-hard

Final sticky section:
hard

Final bounce:
easy-moderate

Observation:
safe
```

---

# 185. Expected Failures

For a first-time player:

```text
main room:
2–5 failures
```

is probably reasonable.

If testers need 10+ attempts on one sticky jump:

> that jump is too strict.

---

# 186. Laser Failure Testing

Ask:

> Did you know why you died?

If answer is no:

- improve warning;
- improve visibility;
- reduce clutter around beam.

---

# 187. Final Wall-Jump Testing

Test with camera at awkward angles.

Player must be able to see:

- current sticky surface;
- destination surface;
- laser.

If not:

- move camera;
- widen room;
- move tiles.

---

# 188. Goop Release Testing

Ask tester:

> What did pulling the lever do?

They should immediately understand:

> It freed the second slime.

If cutscene is confusing, simplify it.

---

# 189. Swap Tutorial Testing

A new player should understand within seconds:

> I can now control Goop.

If they ignore prompt:

- increase prominence;
- temporarily pulse HUD;
- position camera so Goop is clearly visible.

---

# 190. Goop Ability Testing

Tester should naturally try Goop on the exit barrier.

If they do not:

- make barrier more obvious;
- improve soluble-surface visual language;
- reposition it.

Avoid adding explanatory paragraphs.

---

# 191. Level Transition Testing

Test:

```text
Bob enters exit
```

and separately:

```text
Goop enters exit
```

Both must correctly:

- start cutscene;
- include both slimes;
- load Level 2.

---

# 192. Edge Case — Player Never Swaps

The exit barrier remains blocked.

The swap tutorial remains.

The player cannot complete Level 1 until Goop is used.

This is intentional.

---

# 193. Edge Case — Player Swaps Back Immediately

Allow it.

Do not force-lock Goop control.

Prompt can remain until corrosion tutorial is completed.

---

# 194. Edge Case — Goop Corrosion Interrupted

If player begins dissolving barrier and swaps away:

Choose one consistent behaviour.

Recommended:

```text
dissolve progress pauses
```

Then resumes when Goop returns.

Or allow it to continue if Goop's contact remains active.

Whichever matches the game's eventual inactive-slime rules.

---

# 195. Edge Case — Bob Reaches Exit Barrier

Bob cannot destroy it.

No special error message required.

The material should communicate:

> wrong slime.

Optional small HUD hint after a few seconds:

```text
Try another slime
```

---

# 196. Edge Case — Goop Falls

Respawn Goop at post-release safe position.

Do not replay cutscene.

---

# 197. Edge Case — Bob Falls After Release

Respawn Bob at a safe appropriate position.

Do not reset Goop.

---

# 198. Edge Case — Player Restarts Level

A full Level 1 restart should restore:

- Goop containment;
- lever;
- barrier;
- slime roster;
- room progression.

That is separate from checkpoint respawn.

---

# 199. Performance Review

Room 5 is likely the heaviest Level 1 room because it contains many visible objects.

Keep it within browser constraints.

The brief specifically warns about:

- excessive texture resolution;
- draw calls;
- unnecessary allocations;
- GPU resources not being disposed;
- expensive shadows and post-processing.

---

# 200. Performance — Geometry

Reuse:

- pipe meshes;
- support beams;
- wall panels;
- sticky tiles;
- laser emitters.

---

# 201. Performance — Materials

Use shared materials.

Avoid unique copies for each environmental object.

---

# 202. Performance — Lights

Use emissive geometry for most small lights.

Reserve actual dynamic lights for important areas.

---

# 203. Performance — Shadows

Only important objects need to cast.

Examples:

- Bob;
- Goop;
- container;
- major structures.

---

# 204. Performance — Update Loops

Do not update decorative objects that do not move.

Interactive systems only.

---

# 205. Performance — Cutscene Objects

Do not create container meshes or Goop entities during every frame of cutscene.

Create them beforehand.

Animate existing transforms.

---

# 206. Performance — Level Disposal

When Level 1 ends, properly dispose Level 1 resources according to the project's existing level lifecycle.

This is especially important because Level 2 loads immediately afterward.

---

# 207. Visual Polish — Containment Signage

Possible labels:

```text
BIOLOGICAL SPECIMEN
CORROSIVE CLASS
AUTHORIZED PERSONNEL ONLY
```

Do not overload environment with readable paragraphs.

---

# 208. Visual Polish — Observation Glass

Add:

- reflections carefully;
- grime;
- warning decals;
- reinforced framing.

Keep Goop visible enough through it.

---

# 209. Visual Polish — Container Damage

Small corrosion marks around container seams can foreshadow Goop's ability.

Do not already have the container dissolving.

It still needs to appear secure.

---

# 210. Visual Polish — Exit Barrier Foreshadowing

The soluble exit barrier can be visible earlier in the room.

The player may notice it before Goop is freed.

This creates a small mental setup:

> I couldn't get through that earlier.

Then Goop solves it.

That is stronger than spawning the barrier after release.

---

# 211. Visual Polish — Goop Release

Add slight material reaction when Goop lands.

For example:

```text
tiny corrosion mark
```

on a nearby soluble decorative plate.

This previews the ability before player control.

Optional.

---

# 212. Visual Polish — Slime Swap

During switch:

- subtle outline;
- camera travel;
- HUD pulse;
- short audio cue.

Avoid large screen flashes that obscure gameplay.

---

# 213. Visual Polish — Level End

When both slimes fall through vent:

- camera follows briefly;
- airflow particles;
- lighting gets darker;
- transition into Level 2 lighting.

This makes the levels feel physically connected.

---

# 214. Things Not to Add

Do not expand Room 5 with:

- another new Bob ability;
- enemy AI;
- turrets tracking player;
- procedural lasers;
- multiple Goop puzzles;
- pressure-plate cooperation puzzle;
- mandatory two-slime backtracking;
- physics-based lever torque;
- destructible containment physics;
- branching escape paths;
- combat;
- health system;
- boss;
- multiple corrosive materials;
- complex Goop wall traversal.

Those belong elsewhere or not at all.

---

# 215. Minimum Viable Room 5

If scope becomes tight, the minimum version is:

1. Room 4 sticky transition;
2. short vent;
3. large chamber;
4. clear containment box;
5. simple Bob traversal route;
6. one sticky-wall final section;
7. observation-room opening;
8. sticky lever interaction;
9. short Goop release cutscene;
10. slime swapping prompt;
11. one soluble vent barrier;
12. enter vent;
13. short transition into Level 2.

Cut decorative complexity before cutting these beats.

---

# 216. Recommended Final Traversal Sequence

A strong initial version:

## Beat 1 — Room reveal

No danger.

Player identifies objective.

---

## Beat 2 — Lower machinery

Two or three moderate jumps.

---

## Beat 3 — First laser barrier

Player routes above it.

---

## Beat 4 — Reach containment pedestal

Small vertical climb.

---

## Beat 5 — Climb onto Goop container

Use container as platform.

---

## Beat 6 — Bounce to high pipe/catwalk

Reach upper room.

---

## Beat 7 — Upper platform movement

One moderate gap.

---

## Beat 8 — Checkpoint

Safe platform.

---

## Beat 9 — Sticky transfer 1

No laser.

---

## Beat 10 — Sticky transfer 2

Larger gap.

---

## Beat 11 — Sticky transfer 3

Timed laser.

---

## Beat 12 — Final wall transfer

Hardest Bob challenge.

---

## Beat 13 — High platform

Safe.

---

## Beat 14 — Final bounce

Enter observation room.

---

## Beat 15 — Lever

Stick and pull.

---

## Beat 16 — Goop release

Cutscene.

---

## Beat 17 — Swap tutorial

Control Goop.

---

## Beat 18 — Corrosion

Destroy vent barrier.

---

## Beat 19 — Exit

Enter vent.

---

## Beat 20 — Transition

Both slimes fall into Level 2.

---

# 217. Full Intended Player Experience

Bob exits the elevator shaft by jumping onto the sticky panels running across the wall.

The final panel sits beside an open maintenance vent.

Bob crawls inside.

The sound of Room 4's machinery fades behind them.

The duct turns.

The space ahead grows brighter.

Bob emerges from a floor-level opening into a huge industrial laboratory chamber.

For the first time in Level 1, the room feels almost overwhelming.

Pipes cross the ceiling.

Broken catwalks hang between machinery.

Lasers divide sections of the room.

In the middle sits a tall reinforced pedestal.

On top of it:

```text
a large metal containment box
```

covered in hazard markings.

Behind it, high above the room, is a glass observation chamber.

Inside:

```text
a large release lever
```

The player can see the destination.

They just cannot reach it yet.

Bob begins climbing.

They jump across machinery.

Bounce onto pipes.

Avoid a laser barrier.

Use a sticky panel to gain height.

Eventually they reach the central pedestal.

Up close, the container is massive.

Through a small viewing slit they can see something yellow-green moving inside.

Bob climbs higher.

The container itself becomes the next platform.

From its roof, Bob launches onto the upper maintenance structures.

The floor is now far below.

The observation room is getting closer.

A final sticky-wall route stretches between the player and the control room.

Bob sticks to the first tile.

Jumps.

Sticks to the second.

A laser sweeps across the next transfer.

Bob waits.

The beam disappears.

Jump.

Another tile.

Another transfer.

The final platform is reached.

Ahead:

```text
the opening above the observation glass
```

Bob charges the final bounce.

Launches.

Flies through the opening.

Lands inside the control room.

Everything becomes quiet.

The player walks toward the glass.

Goop's containment sits below.

Beside the window is the release lever.

Bob jumps onto it.

Sticks.

The lever begins moving under Bob's weight.

Metal strains.

The handle reaches the bottom.

```text
CLUNK
```

Control is removed.

Warning lights around the specimen enclosure activate.

The camera moves toward the containment box.

Locks disengage one by one.

```text
CLUNK

CLUNK

CLUNK
```

The metal panels separate.

Inside is Goop.

The corrosive slime drops from the open container and lands on the chamber floor.

The camera returns to gameplay.

A large prompt appears:

```text
SLIME SWAPPING

Press [Swap Key] to switch slime
```

The player presses it.

The camera moves away from Bob and toward Goop.

Goop is now under player control.

Nearby is an exit vent.

The opening is blocked by a weak marked panel.

Bob could not remove it.

Goop approaches.

The surface begins to hiss.

Its edges dissolve.

The panel breaks away.

The ventilation duct is now open.

The player enters using Goop — or swaps back to Bob and enters using Bob.

Control fades into a final short cutscene.

The active slime moves deeper into the ventilation system.

The other follows.

Both travel together through the duct.

The damaged duct suddenly gives way.

Bob and Goop fall together into darkness.

The camera follows.

Level 1 unloads.

The darkness gives way to the first room of Level 2.

Both slimes fall into the new chamber.

The player now has two bodies.

**Level 2 begins.**

---

# 218. Final Room 5 Build Checklist

## Room 4 Transition

- [ ] Elevator stops correctly.
- [ ] Sticky-tile route is visible.
- [ ] Bob can reach vent.
- [ ] Vent safely connects to Room 5.

## Initial Reveal

- [ ] Container is immediately noticeable.
- [ ] Observation room is visible.
- [ ] Lever can be seen or clearly inferred.
- [ ] Opening above glass is visible.
- [ ] Starting route is understandable.
- [ ] No immediate hazard attacks player.

## Main Traversal

- [ ] Lower route is clear.
- [ ] Container pedestal is reachable.
- [ ] Container is used as traversal geometry.
- [ ] Upper route is readable.
- [ ] Sticky surfaces are clearly marked.
- [ ] Final wall transfers are difficult but fair.
- [ ] Lasers complement traversal rather than dominate it.
- [ ] No unintended sticky shortcuts.

## Checkpoints

- [ ] Entry checkpoint works.
- [ ] Central checkpoint works.
- [ ] Final-challenge checkpoint works.
- [ ] Laser failure respawns correctly.
- [ ] Falling respawns correctly.
- [ ] Hazards restore correctly.

## Observation Room

- [ ] Final bounce reliably enters opening.
- [ ] Bob cannot easily fall back out.
- [ ] Lever is obvious.
- [ ] Container is visible through glass.

## Lever

- [ ] Bob can stick to handle.
- [ ] Lever moves smoothly.
- [ ] Lever only triggers once.
- [ ] Lever locks down.
- [ ] Correct audio/visual feedback occurs.

## Goop Release

- [ ] Control is disabled safely.
- [ ] Camera sequence works.
- [ ] Container opens.
- [ ] Goop becomes visible.
- [ ] Goop jumps to correct landing point.
- [ ] Camera returns correctly.
- [ ] Cutscene cannot trigger twice.
- [ ] Skipping cutscene preserves game state if skipping is supported.

## Slime Swapping

- [ ] Goop joins roster.
- [ ] Swap prompt appears.
- [ ] Actual bound key is displayed.
- [ ] Bob → Goop works.
- [ ] Goop → Bob works.
- [ ] Camera handoff works.
- [ ] Inactive slime remains in position.
- [ ] HUD shows both slimes.
- [ ] Prompt disappears after tutorial completion.

## Goop Tutorial

- [ ] Exit vent is visible/reachable.
- [ ] Soluble barrier is clearly marked.
- [ ] Bob cannot remove barrier.
- [ ] Goop can corrode barrier.
- [ ] Dissolve visual matches collision removal.
- [ ] Barrier stays removed after completion.

## Level End

- [ ] Bob can activate exit.
- [ ] Goop can activate exit.
- [ ] Trigger only fires once.
- [ ] Both slimes appear in transition.
- [ ] Vent cutscene works.
- [ ] Level 1 unloads safely.
- [ ] Level 2 loads.
- [ ] Both Bob and Goop exist in Level 2.
- [ ] Goop remains permanently unlocked.

## Camera

- [ ] Dense geometry does not constantly block camera.
- [ ] Sticky-wall jumps remain readable.
- [ ] Observation-room camera is stable.
- [ ] Cutscene handoffs are smooth.
- [ ] Slime swap camera does not disorient player.

## Visuals

- [ ] Goop container is the room's visual centrepiece.
- [ ] Observation room reads as a scientific workspace.
- [ ] Room feels dense without being physically cramped.
- [ ] Sticky tiles use established visual language.
- [ ] Soluble barrier establishes Goop's future visual language.
- [ ] Goop looks clearly distinct from Bob.

## Audio

- [ ] Main ambience works.
- [ ] Lasers have warnings.
- [ ] Lever has movement/lock sounds.
- [ ] Container has release sounds.
- [ ] Goop has landing/reveal sound.
- [ ] Swap has feedback.
- [ ] Corrosion has appropriate sound.
- [ ] Vent transition has audio.
- [ ] All loops stop correctly on unload.

## Performance

- [ ] Decorative meshes reuse geometry/materials where practical.
- [ ] Dynamic lights remain limited.
- [ ] Shadow casters remain limited.
- [ ] No unnecessary per-frame allocations.
- [ ] Room runs smoothly on weaker hardware.
- [ ] Level 1 resources dispose correctly before/while Level 2 loads.
- [ ] Memory does not continuously increase across the transition.

---

# 219. Final Scope Definition

Room 5 should ultimately be:

> **A large, visually dense final traversal chamber where Bob combines the movement mechanics learned throughout Level 1 to infiltrate an observation room and physically release Goop, after which the game immediately teaches slime swapping and Goop's corrosive ability through one simple blocked-vent interaction before both slimes escape together into Level 2.**

The room's four most important moments are:

1. **Entering the chamber and seeing Goop's containment.**
2. **Completing Bob's hardest sticky traversal.**
3. **Sticking to the lever and freeing Goop.**
4. **Switching to Goop and dissolving the final obstruction.**

Everything else exists to support those moments.

If scope becomes tight, simplify environmental decoration, reduce the number of lasers, and shorten the platforming route.

Do **not** sacrifice:

- the containment-room objective;
- the sticky lever interaction;
- the Goop release;
- slime swapping;
- the first corrosion interaction;
- the physical transition into Level 2.

Those are what make Room 5 function as the **ending of Level 1 and the beginning of the game's multi-slime identity**.