# Room 4 — Elevator Laser Ascent

## Detailed Build Plan

---

# 1. Room Overview

## Room identity

**Room 4 is a short vertical survival set-piece built around a moving industrial elevator and scripted security lasers.**

The player exits Room 3 through a maintenance duct, falls onto the roof of an elevator, and is carried upward through a tall shaft. During the ascent, security lasers activate in increasingly difficult patterns. Tack must move and bounce around the elevator roof to avoid them.

The room should be noticeably different in pacing from the surrounding traversal rooms.

The intended experience is:

> **Vent → unexpected drop → quiet landing → elevator activation → warning → laser sequence → escalation → sudden silence → arrival → Room 5**

The room should take approximately:

- **First attempt:** 1–3 minutes depending on failures.
- **Successful run:** roughly **40–60 seconds**.
- **Restart after failure:** ideally **under 1–1.5 seconds**.

This room should not become a large puzzle. It is a short action sequence.

The existing project architecture already supports authored moving platforms, checkpoints, room/puzzle resets, custom collision and static hazards, so this room should be implemented using those systems rather than introducing a new physics framework.

---

# 2. Design Goals

Room 4 has five primary goals.

## Goal 1 — Change the pacing

Rooms before this can focus on exploration, climbing, vents and environmental traversal.

Room 4 should suddenly become much faster.

The player is placed in a confined space and has to react to hazards rather than determine where to go.

---

## Goal 2 — Make bouncing useful under pressure

The player should already understand Tack's movement by this point.

Room 4 tests whether the player can use:

- normal movement;
- directional movement while airborne;
- jumping/bouncing;
- positioning;
- timing.

Do **not** introduce a completely new control here.

The challenge should come from combining existing movement abilities under pressure.

---

## Goal 3 — Create a memorable visual set-piece

The elevator shaft gives an opportunity for:

- strong vertical depth;
- moving environment geometry;
- animated lights;
- emissive lasers;
- warning flashes;
- shadows;
- sparks;
- moving machinery;
- sound escalation.

This supports the project's emphasis on viewing, 3D effects, polish and memorable gameplay. The project brief specifically rewards animated environments, multiple lighting effects, smooth cameras and visually appealing 3D effects.

---

## Goal 4 — Make failure painless

The player will probably be hit several times while learning the patterns.

Failure therefore must be fast.

There should be:

- no loading screen;
- no death menu;
- no return to Room 3;
- no long animation before retrying.

A laser hit is treated as a **room failure/checkpoint reset**, consistent with the project's existing no-health/no-combat failure model.

---

## Goal 5 — Keep implementation scope controlled

This room must feel complicated without actually being complicated internally.

The lasers should be:

**scripted + deterministic + resettable.**

Do not create procedural hazard generation.

Do not simulate real elevator mechanics.

Do not add new physics systems just for this room.

---

# 3. Room Structure

The room consists of six functional zones.

```text
                     ROOM 5
                        │
                        │
                ┌───────┴────────┐
                │  EXIT PLATFORM │
                │ / SERVICE DOOR │
                └───────┬────────┘
                        │
                        │
              FINAL LASER SECTION
                        │
                   ─────────
                        │
                        │
                 CROSSING LASERS
                     \     /
                      \   /
                       \ /
                        │
                        │
              ALTERNATING SWEEPS
                  ───────────
                        │
                        │
                  FIRST LASER
                  ───────────
                        │
                        │
               ┌────────────────┐
               │                │
               │    ELEVATOR    │
               │      ROOF      │
               │                │
               └────────────────┘
                        ▲
                        │
                PLAYER LANDS HERE
                        ▲
                        │
                  VENT OPENING
                        ▲
                        │
                     ROOM 3
```

The actual elevator remains beneath the player throughout the main sequence.

The shaft geometry moves past the player as the elevator travels upward.

---

# 4. Recommended Greybox Dimensions

These values are starting points only. They should be tuned after testing.

Use world units consistently.

Assume approximately:

> **1 unit ≈ 1 metre**

if that roughly matches the existing Level 1 scale.

---

## 4.1 Elevator roof

Recommended initial dimensions:

```text
Width:   9–11 units
Depth:   9–11 units
Height:  approximately 1 unit for visible elevator body
```

Recommended starting size:

```text
10 × 10 units
```

This is intentionally larger than a realistic passenger elevator.

It should visually read as:

> **industrial cargo/specimen lift**

rather than a normal office elevator.

The player's challenge should be avoiding lasers.

The challenge should **not** be constantly falling from a tiny platform.

---

## 4.2 Elevator shaft

Recommended interior dimensions:

```text
Width:   16–20 units
Depth:   16–20 units
Height:  80–120 units
```

Starting point:

```text
18 × 18 × 100 units
```

This creates enough clearance around the elevator for:

- camera movement;
- visible cables;
- wall supports;
- laser machinery;
- maintenance platforms;
- pipes;
- depth.

---

## 4.3 Elevator clearance

If the elevator is 10 × 10 and the shaft is 18 × 18:

```text
┌──────────────────┐
│                  │
│   ┌──────────┐   │
│   │          │   │
│   │ ELEVATOR │   │
│   │          │   │
│   └──────────┘   │
│                  │
└──────────────────┘
```

There are approximately four units of space between each elevator edge and the surrounding shaft wall.

This gives the camera room to operate.

---

# 5. Coordinate Convention

Pick one clear convention before building the room.

Recommended:

```text
Y = vertical/up
X = elevator left/right
Z = elevator front/back
```

The elevator therefore moves along:

```text
+Y
```

Example:

```text
Room start:        Y = 0
First laser:       Y = 15
Pattern 2:         Y = 35
Pattern 3:         Y = 55
Final pattern:     Y = 75
Exit:              Y = 95
```

The exact world coordinates do not matter as much as keeping the room predictable.

---

# 6. Room Entry From Room 3

## 6.1 Vent connection

Room 3 should end in a maintenance vent.

The player enters the vent normally.

The duct gradually directs them toward the elevator shaft.

Near the end of the duct:

- ambient machinery noise becomes louder;
- the duct becomes darker;
- faint red lights may be visible through the final grate;
- the player should not immediately see the entire elevator shaft.

The transition should preserve surprise.

---

## 6.2 Final vent section

Recommended shape:

```text
ROOM 3
   │
   ▼
═══════════════════════╗
                       ║
 MAINTENANCE VENT      ║
                       ║
═══════════════════╗   ║
                   ║   ║
                   ╚═══╝
                     │
                     ▼
                  OPENING
                     │
                     ▼
                 ELEVATOR
```

The vent can either:

### Option A — Broken/open vent

The duct simply ends.

The player falls out automatically if they continue moving.

### Option B — Weak grate

The player reaches a damaged vent grate that collapses when touched.

This is more visually interesting but requires one extra scripted object.

For initial implementation, use **Option A**.

Add the collapsing grate later only if desired.

---

# 7. The Drop

The player should fall approximately:

```text
5–10 units
```

before landing on the elevator.

The drop needs to be long enough to feel intentional but short enough that the player does not assume they made a mistake.

During the drop, the camera should expose the elevator below.

Example:

```text
VENT
 │
 │
 ●  ← Tack falling
 │
 │
 ▼
┌──────────────┐
│   ELEVATOR   │
└──────────────┘
```

The player should land close to the elevator centre.

Do not require the player to aim at the elevator during this first entrance.

The entrance itself should not be a difficult jump.

---

# 8. Initial Elevator State

Before the player lands:

```text
elevatorState = IDLE
laserSequence = INACTIVE
warningLights = OFF
roomCheckpoint = NOT_ACTIVE
```

The elevator should appear inactive.

Possible visual state:

- dim emergency lighting;
- slight machinery vibration;
- inactive red laser emitters;
- elevator control light off;
- low mechanical hum.

---

# 9. Landing Trigger

Place a trigger over the elevator roof.

Conceptually:

```text
ElevatorEntryTrigger
```

When Tack enters it for the first time:

1. activate Room 4 checkpoint;
2. mark Room 4 as entered;
3. wait approximately 1 second;
4. begin elevator startup sequence.

Do not activate the lasers instantly.

The player needs a short moment to understand where they are.

---

# 10. Startup Sequence

Recommended duration:

```text
2–3 seconds
```

Example timeline:

### T = 0.0

Player lands.

Heavy metallic landing sound.

Elevator remains stationary.

---

### T = 0.5

Small warning lamps activate.

```text
RED LIGHT
RED LIGHT
RED LIGHT
```

Optional:

```text
BEEP
```

---

### T = 1.0

Elevator machinery engages.

Sound:

```text
CLUNK
```

followed by:

```text
motor hum increasing
```

---

### T = 1.5

Elevator begins moving upward slowly.

---

### T = 2.0

First laser emitter activates farther up the shaft.

It should glow before becoming dangerous.

---

### T = 2.5–3.0

First laser begins moving.

Gameplay sequence starts.

---

# 11. Elevator Motion

Do not implement real elevator physics.

The elevator should follow an authored vertical path.

Conceptually:

```text
startY = 0
endY = 95
duration ≈ 45 seconds
```

Movement can use a simple interpolation or speed curve.

---

## 11.1 Basic speed

A starting point:

```text
2–3 world units per second
```

Tune this based on:

- shaft height;
- laser timing;
- camera feel;
- visual speed.

---

## 11.2 Elevator acceleration

You may optionally ease the elevator into motion.

Example:

```text
0–2 sec:
slow acceleration

2–40 sec:
constant speed

40–45 sec:
slight slowdown

45 sec:
stop
```

Do **not** apply realistic acceleration forces to Tack.

The elevator's acceleration should be visual only.

---

# 12. Player and Moving Elevator Interaction

This is the most important technical requirement in the room.

The player needs to remain stable while standing on the elevator.

The project already plans authored moving platforms and rider handling, so Room 4 should reuse that system rather than create separate elevator physics.

---

## Required behaviour

While grounded on the elevator:

```text
player world movement
=
player normal movement
+
elevator displacement
```

The player should:

- remain stationary relative to the elevator when no input is given;
- be able to run normally;
- jump normally;
- land normally;
- not jitter;
- not slowly slide through the platform.

---

## Avoid

Do not simply change the elevator position and hope collision resolution pushes the player upward.

That can create:

- jitter;
- clipping;
- inconsistent jump heights;
- occasional tunnelling.

Reuse the existing moving-platform rider solution.

---

# 13. Elevator Collider

The roof should have a simple collider.

Recommended:

```text
one box collider
```

Do not use detailed elevator geometry for collision.

Visual:

```text
detailed elevator mesh
```

Collision:

```text
simple invisible rectangular box
```

This keeps collision reliable.

---

# 14. Elevator Edges

There are two viable options.

## Preferred option — allow falling

The player can genuinely fall off the elevator.

If Tack falls below a defined kill/reset plane:

```text
resetRoom4()
```

This creates natural tension.

However, elevator dimensions should be generous enough that falling is not constant.

---

## Alternative — invisible safety lip

If testing shows players accidentally fall too often, use a very low raised edge or invisible collision lip.

Height:

```text
0.2–0.4 units
```

This prevents minor accidental slips without preventing intentional jumps.

Only add this if playtesting shows it is necessary.

---

# 15. Laser System Overview

Each laser consists of four conceptual parts.

```text
LaserHazard
├── emitter
├── visible beam
├── hazard volume
└── animation behaviour
```

Do not treat the visible laser mesh itself as the collision system.

Visual and gameplay collision should be separate.

---

# 16. Laser Visual

A laser should visually resemble:

```text
Emitter ●════════════════════════● Receiver
```

Possible representation:

- thin cylinder;
- elongated box;
- custom beam mesh;
- shader-driven beam later.

For the greybox:

```text
THREE.BoxGeometry
```

is enough.

Example dimensions:

```text
length = 14 units
width = 0.08–0.15 units
height = 0.08–0.15 units
```

---

# 17. Laser Material

Initial implementation:

- bright emissive red material;
- high visibility against dark shaft walls.

Later polish:

- additive glow;
- bloom;
- animated beam noise;
- brighter centre;
- small emitter light.

Do not require bloom for the beam to be readable.

It must still clearly exist if post-processing is disabled.

---

# 18. Laser Hazard Volume

The collision volume should be slightly thicker than the visible beam.

For example:

```text
visible beam thickness:
0.10

hazard thickness:
0.20–0.30
```

This prevents situations where the slime visibly passes through the beam but collision fails due to extremely thin geometry.

At the same time, the hazard should not be so thick that the player feels cheated.

---

# 19. Laser Collision

You do not need physical collision response.

The laser does not push Tack.

It only checks:

```text
Is the player intersecting an ACTIVE laser hazard?
```

If yes:

```text
roomFail()
```

Conceptually:

```ts
if (
    laser.active &&
    laser.hazard.intersects(playerCollider)
) {
    roomController.fail();
}
```

---

# 20. Laser States

Every laser should have clear states.

```text
OFF
WARNING
ACTIVE
COOLDOWN
```

---

## OFF

- beam invisible;
- collider inactive;
- emitter dim.

---

## WARNING

- emitter glows;
- warning sound may play;
- beam may appear faintly;
- collider remains inactive.

Duration:

```text
0.5–1.0 seconds
```

---

## ACTIVE

- beam fully visible;
- collision enabled;
- laser moves according to pattern.

---

## COOLDOWN

- beam turns off;
- emitter fades;
- collision disabled.

This prevents lasers from appearing instantly with no telegraph.

---

# 21. Telegraphing

Every dangerous movement needs visual warning.

A player should ideally be able to understand:

> "Something is about to happen here."

before the beam becomes lethal.

Possible telegraphs:

- emitter flashes;
- red light activates;
- mechanical aperture opens;
- short charging sound;
- faint beam preview;
- sparks around emitter.

Do not make laser patterns purely reaction-based.

They should reward reading and timing.

---

# 22. Laser Sequence Structure

Use approximately four main phases.

```text
PHASE 0 — Introduction
PHASE 1 — Single Sweep
PHASE 2 — Alternating Sweeps
PHASE 3 — Crossing/Rotating Pattern
PHASE 4 — Final Burst
PHASE 5 — Shutdown
```

Each phase lasts approximately:

```text
6–10 seconds
```

The entire gameplay sequence should remain under roughly one minute.

---

# 23. Phase 0 — Introduction

Duration:

```text
2–3 seconds
```

Purpose:

Allow the player to realise the elevator is moving.

No lethal hazards yet.

Visuals:

- shaft starts passing downward;
- motor noise increases;
- warning lights flash;
- first laser emitter activates above.

---

# 24. Phase 1 — Single Sweep

## Purpose

Teach the laser rule.

Only one laser is active.

The player should immediately understand:

> red beam = avoid it.

---

## Layout

Top view:

```text
┌─────────────────────────┐
│                         │
│                         │
│  ───────────────────    │
│                         │
│            ●            │
│                         │
└─────────────────────────┘
```

The beam travels across the elevator.

Example:

```text
left → right
```

---

## Timing

1. emitter flashes;
2. beam appears;
3. wait approximately 0.5 seconds;
4. sweep begins;
5. beam crosses platform in approximately 2 seconds;
6. beam disappears.

Repeat once if needed.

---

## Intended response

The player can:

- jump over it;
- bounce over it;
- reposition around the timing.

This should be easy.

If testers regularly fail Phase 1, the pattern is too fast.

---

# 25. Phase 2 — Alternating Sweeps

## Purpose

Force movement rather than a single stationary jump.

Use two lasers.

Example:

```text
Laser A:
left → right

Laser B:
right → left
```

Stagger them.

---

## Example timeline

```text
0.0  Laser A warning
0.8  Laser A active
2.5  Laser A leaves

3.0  Laser B warning
3.8  Laser B active
5.5  Laser B leaves

6.0  A and B sequence overlap slightly
```

Do not create an impossible wall.

There must always be a readable safe action.

---

# 26. Phase 3 — Crossing / Rotating Pattern

This should be the most visually interesting section.

Two laser emitters rotate or sweep diagonally.

Top view:

```text
┌───────────────────────┐
│ \                   / │
│  \                 /  │
│   \               /   │
│    \             /    │
│     \     ●     /     │
│      \         /      │
│       \       /       │
└───────────────────────┘
```

The safe area should move across the elevator.

---

## Simplest implementation

Do not calculate complex beam intersections.

Attach each beam to a pivot.

```text
LaserPivot
└── LaserBeam
```

Then animate:

```text
pivot.rotation
```

This makes rotating beams easy and provides a clean scene hierarchy.

---

## Example movement

Laser A:

```text
-35° → +35°
```

Laser B:

```text
+35° → -35°
```

Use easing or constant angular speed.

---

# 27. Phase 4 — Final Burst

The final phase should feel intense but remain fair.

Use previously learned patterns in quick succession.

Do not introduce a completely new mechanic in the final five seconds.

Example:

```text
Sweep from left
        ↓
Sweep from right
        ↓
Diagonal crossing
        ↓
short pause
        ↓
final sweep
```

Possible warning lighting:

```text
RED
OFF
RED
OFF
RED
```

Motor pitch can increase slightly here to make the climax feel more dramatic.

---

# 28. Difficulty Rule

The room should test execution, not memorisation.

The player should be able to succeed on a first attempt if they react well.

Therefore:

- no invisible lasers;
- no instant activations;
- no completely random movement;
- no unavoidable combinations;
- no laser appearing directly inside the player;
- no excessive speed.

---

# 29. Laser Height

Be careful with vertical placement.

If every beam is exactly at floor height:

```text
jumping solves everything.
```

If every beam is chest/head height:

```text
the player may not understand how to avoid them.
```

For the first implementation, use primarily **low sweeping lasers** that encourage jumping.

Later, if Tack's movement supports it clearly, some beams can be placed at slightly different heights.

Do not introduce crouching just for this room.

---

# 30. Recommended Laser Types

Keep it to three reusable behaviours.

## `SweepLaser`

Moves from one side of the elevator to another.

---

## `RotatingLaser`

Rotates around a pivot.

---

## `StaticPulseLaser`

Appears in a fixed position for a short duration after a warning.

Optional.

You can build the entire room using only the first two types.

---

# 31. Room Timeline Controller

Do not allow every laser to independently decide when it should activate.

Use one central room sequence controller.

Suggested concept:

```text
Room4ElevatorController
```

Responsibilities:

- startup;
- elevator state;
- sequence timer;
- current phase;
- laser activation;
- room completion;
- reset;
- failure lockout.

---

# 32. Suggested State Machine

```text
WAITING_FOR_PLAYER
        │
        ▼
STARTUP
        │
        ▼
PHASE_1
        │
        ▼
PHASE_2
        │
        ▼
PHASE_3
        │
        ▼
PHASE_4
        │
        ▼
ARRIVAL
        │
        ▼
COMPLETE
```

Failure can occur during:

```text
STARTUP
PHASE_1
PHASE_2
PHASE_3
PHASE_4
```

and sends the room through:

```text
FAIL
 ↓
RESETTING
 ↓
STARTUP
```

---

# 33. Suggested Internal Variables

Conceptually:

```ts
state
stateTime
sequenceTime

elevatorStartY
elevatorEndY
elevatorSpeed

hasCheckpoint
isResetting
isComplete

lasers[]
```

Avoid scattered anonymous timers.

One state machine will be much easier to reset reliably.

---

# 34. Failure Handling

Failure occurs when:

### Laser hit

```text
active laser intersects player
```

### Fall

```text
player.position.y < failureThreshold
```

### Optional out-of-bounds

If the player somehow leaves the valid shaft area.

---

# 35. Failure Feedback

When a laser hits Tack:

Immediate feedback should happen.

Possible sequence:

```text
0 ms       collision detected
0–100 ms   bright flash
0–200 ms   zap/splat sound
200–500 ms brief slime visual reaction
500–900 ms room resets
```

Keep it short.

Do not make the player watch a long death animation.

---

# 36. Room Reset

This system must be reliable.

When reset begins:

### Player

Reset:

- position;
- velocity;
- grounded state;
- attachment state if relevant;
- temporary movement state.

---

### Elevator

Reset:

- position;
- velocity/path progress;
- startup state.

---

### Lasers

Reset:

- position;
- rotation;
- active state;
- visibility;
- warning state;
- timers.

---

### Environment

Reset:

- warning lights;
- particles;
- sound state;
- emitter state.

---

### Controller

Reset:

```text
state = STARTUP
stateTime = 0
sequenceTime = 0
```

The project already specifies that puzzle objects should expose a `reset()` contract and that checkpoint restore should return a puzzle group to its authored state. Room 4 should follow the same model.

---

# 37. Checkpoint Location

The checkpoint should activate **after the player lands on the elevator for the first time**.

Recommended respawn location:

```text
centre of elevator roof
```

Slightly above the surface:

```text
0.2–0.5 units
```

to avoid spawning intersecting the platform.

---

# 38. Restart Behaviour

After failure, do not make the player fall through the vent again.

Respawn directly on the elevator.

So:

### First entry

```text
Room 3
→ vent
→ fall
→ elevator
→ startup
```

### Retry

```text
flash
→ elevator starting position
→ startup
```

This keeps retries quick.

---

# 39. Camera Design

The room uses the normal third-person camera.

Do not create a completely separate camera-control system.

However, Room 4 may temporarily adjust camera parameters.

---

# 40. Recommended Camera Behaviour

During elevator gameplay:

- slightly increase follow distance;
- slightly raise camera angle;
- ensure most of elevator roof is visible;
- avoid camera clipping through shaft walls.

The player needs to see incoming lasers.

---

## Possible normal room view

```text
       CAMERA
          \
           \
            ● Tack
```

Room 4 may pull back slightly:

```text
CAMERA
    \
     \
      \
       ● Tack
 ┌──────────────┐
 │   ELEVATOR   │
 └──────────────┘
```

---

# 41. Camera Restrictions

Avoid camera angles that point directly into nearby shaft walls.

If necessary:

- make the shaft wider;
- reduce maximum camera distance;
- limit problematic yaw angles slightly;
- make nearby wall materials fade or hide when blocking the view.

Do not overengineer camera transparency unless clipping becomes a real problem.

Fix geometry first.

---

# 42. Camera and Elevator Motion

The camera should follow the player's world position normally.

Do not separately animate the camera upward unless required.

If the player inherits elevator displacement correctly, the camera target naturally moves with them.

This reduces duplicate movement code.

---

# 43. Environmental Geometry

Greybox the shaft using simple modules.

Suggested modules:

```text
shaft-wall-panel
shaft-support
maintenance-platform
pipe
cable
laser-mount
warning-light
elevator
```

These can initially all be primitives.

---

# 44. Repeating Shaft Sections

To sell vertical movement, place repeated visual features along the walls.

Example every 8–12 units:

```text
floor number
metal support
pipe connection
maintenance lamp
crossbeam
```

As these move past the player, elevator speed becomes obvious.

Without reference geometry, moving upward inside a uniform shaft may visually feel stationary.

---

# 45. Floor Markings

Add simple floor indicators:

```text
B4
B3
B2
B1
01
02
03
```

or facility-specific labels:

```text
SUBLEVEL 07
SUBLEVEL 06
SUBLEVEL 05
```

They can pass by rapidly during the ascent.

This reinforces movement and environmental storytelling.

---

# 46. Cables

Add elevator cables above the platform.

They should be visual only.

Do not simulate them.

Possible hierarchy:

```text
ElevatorRoot
├── ElevatorBody
├── Roof
└── cable anchor visuals
```

Long shaft cables may remain attached to the shaft instead.

Whatever approach looks convincing is fine.

---

# 47. Shaft Walls

Do not model every wall as one giant flat rectangle.

Use some depth.

Example:

```text
wall
│
├── structural beams
├── pipes
├── recesses
├── vents
├── laser mounts
└── warning lamps
```

However, collision can remain simple.

---

# 48. Collision Geometry

Collision should be much simpler than visuals.

Suggested:

```text
Elevator:
1 box

Shaft walls:
4 large boxes

Exit platform:
1–3 boxes

Vent:
simple boxes

Laser hazards:
simple beam volumes
```

Do not raycast against every decorative pipe.

---

# 49. Lighting

Room 4 can use a strong limited palette.

Recommended primary colours:

```text
dark neutral metal
dim white/blue industrial lighting
red security lighting
bright red lasers
```

This creates immediate contrast.

---

# 50. Base Lighting

Before the sequence:

- low ambient lighting;
- dim overhead industrial lights;
- elevator roof readable but not brightly lit.

---

# 51. Warning Lighting

When the elevator starts:

Red warning lights begin flashing.

Place them:

- on elevator corners;
- on shaft walls;
- near laser emitters.

Do not create dozens of shadow-casting point lights.

The brief explicitly warns that shadows and excessive rendering work are expensive, especially on lab hardware.

Most warning lights can be represented by:

- emissive meshes;
- very few actual lights.

---

# 52. Laser Lighting

Do not give every laser a separate expensive dynamic light.

Possible solution:

### Beam

Emissive visual.

### Emitters

Small emissive meshes.

### Optional

One or two real red lights affecting the elevator during intense phases.

This gives the visual impression of many light sources without excessive cost.

---

# 53. Shadows

If shadows are enabled:

Prioritise:

- Tack;
- elevator;
- major nearby geometry.

Do not require every pipe and beam to cast shadows.

The room is moving and visually busy anyway.

---

# 54. Audio Design

Audio will significantly improve this room.

Use layered audio rather than one constant sound.

---

## Ambient shaft loop

Low:

```text
ventilation
distant machinery
electrical hum
```

---

## Elevator startup

```text
metal CLUNK
motor engaging
hydraulic/mechanical rumble
```

---

## Elevator movement

Loop:

```text
low industrial motor
cable/mechanical movement
```

Pitch or volume can gradually increase slightly.

---

## Laser warning

Short sound:

```text
beep
charge
electrical whine
```

---

## Laser active

Subtle:

```text
high electrical hum
```

Do not make every laser unbearably loud.

---

## Laser impact

Immediate:

```text
zap
slime impact/splat
```

---

## Arrival

Use a deliberate contrast.

Sequence:

```text
LASERS OFF

motor slowing

...

DING
```

That tiny silence before the ding can make the ending memorable.

---

# 55. Particles

Particles are optional polish.

Good candidates:

- sparks from damaged shaft machinery;
- small dust particles moving downward;
- electrical sparks from laser emitters;
- short impact sparks when Tack touches a laser.

Do not use particle collisions.

Particles should be purely visual.

---

# 56. Creating the Illusion of Speed

The elevator itself moving upward is not enough.

Use several cues.

## Cue 1

Wall details pass downward.

## Cue 2

Floor numbers pass by.

## Cue 3

Particles drift downward relative to the player.

## Cue 4

Wind/motor sound intensifies.

## Cue 5

Camera has slight smooth vertical follow lag if already supported.

## Cue 6

Lights pass beneath the elevator.

These make the room feel much faster without actually increasing elevator velocity.

---

# 57. Exit Sequence

After the final laser pattern:

1. all lasers switch off;
2. warning lights stop flashing;
3. elevator begins slowing;
4. motor pitch drops;
5. elevator reaches final position;
6. short silence;
7. arrival sound;
8. Room 5 route becomes obvious.

---

# 58. Room 5 Exit

Recommended layout:

```text
              ROOM 5
                │
         ┌──────┴──────┐
         │   PLATFORM  │
         └──────┬──────┘
                │
          small jump/gap
                │
┌───────────────┴──────────────┐
│          ELEVATOR            │
└──────────────────────────────┘
```

Require a small final jump from elevator to exit platform.

Do not put another difficult challenge immediately after surviving the lasers.

The jump should be almost impossible to fail.

---

# 59. Preventing Early Exit

The exit should not be reachable until the elevator completes its ascent.

This happens naturally because the exit starts high above the player.

No invisible barrier should be necessary.

---

# 60. Room Completion Trigger

Place a trigger just inside the Room 5 entrance.

When entered:

```text
Room4 = COMPLETE
```

At this point:

- elevator no longer needs resetting;
- Room 5 checkpoint can take over;
- Room 4 hazards can remain disabled.

---

# 61. Suggested File Responsibilities

Fit the room into the existing project architecture rather than creating an isolated subsystem.

Possible structure:

```text
src/
├── levels/
│   └── Level1Containment.ts
│
├── puzzle/
│   ├── MovingPlatform.ts
│   ├── Trigger.ts
│   └── LaserHazard.ts
│
└── levels/room4/
    └── Room4ElevatorController.ts
```

If the project does not use room-specific folders, keep it inside the Level 1 implementation instead.

Do not restructure the repository just to match this document.

---

# 62. `LaserHazard`

Suggested responsibilities:

```text
visual beam
hazard volume
warning state
active state
pivot/transform
reset
```

It should **not** know the entire room sequence.

The controller tells the laser what to do.

---

# 63. `Room4ElevatorController`

Suggested responsibilities:

```text
start room
control timeline
activate laser patterns
control elevator progression
handle failure
reset room
complete room
```

It should coordinate existing systems rather than replace them.

---

# 64. Suggested Laser API

Conceptually:

```ts
laser.warn();
laser.activate();
laser.deactivate();

laser.setRotation(angle);
laser.setPosition(position);

laser.reset();
```

For sweeping lasers:

```ts
laser.setProgress(t);
```

Keep the API simple.

---

# 65. Sequence Implementation

Prefer a state machine over dozens of independent `setTimeout()` calls.

Avoid:

```ts
setTimeout(...)
setTimeout(...)
setTimeout(...)
setTimeout(...)
```

because resetting the room becomes difficult.

Instead update sequence time every frame.

Conceptually:

```ts
update(dt) {
    this.stateTime += dt;

    switch (this.state) {
        case 'PHASE_1':
            this.updatePhase1();
            break;

        case 'PHASE_2':
            this.updatePhase2();
            break;
    }
}
```

This makes the sequence:

- deterministic;
- pausable;
- resettable;
- easy to debug.

---

# 66. Laser Animation

Do not allocate vectors or materials every frame.

Reuse everything.

The project brief specifically warns against creating new objects in the animation loop because garbage collection can cause stutter.

Update existing transforms only.

Good:

```ts
laserPivot.rotation.z = angle;
```

Avoid repeatedly constructing temporary geometry/materials during gameplay.

---

# 67. Debug Controls

During development, add temporary controls if useful.

Examples:

```text
1 = Phase 1
2 = Phase 2
3 = Phase 3
4 = Phase 4
R = Reset Room 4
E = Jump elevator to end
```

These should only exist in debug mode.

They will dramatically speed up testing.

---

# 68. Debug Information

The debug overlay should ideally expose:

```text
Room 4 state
sequence time
elevator Y
current phase
active lasers
player grounded platform
```

This makes timing bugs much easier to diagnose.

---

# 69. Building the Room — Recommended Order

Do not build art first.

Build Room 4 in strict layers.

---

# Phase A — Empty Shaft

## Step 1

Create the shaft.

Only use:

- floor;
- four walls;
- elevator platform;
- exit platform.

No lasers.

---

## Step 2

Place the vent opening from Room 3.

Make sure Tack can:

```text
Room 3
→ vent
→ drop
→ elevator
```

reliably.

---

## Step 3

Make sure the camera survives the drop.

Fix camera clipping before continuing.

---

# Phase B — Elevator

## Step 4

Make the elevator move vertically.

No hazards yet.

Test:

- Tack standing still;
- Tack running;
- Tack jumping;
- Tack landing;
- Tack near edges.

---

## Step 5

Run the elevator from start to finish at least ten times.

Do not continue until:

- no jitter;
- no sinking;
- no random falling through;
- camera remains stable.

This is the technical gate for Room 4.

---

# Phase C — Reset

## Step 6

Add the room checkpoint.

---

## Step 7

Create:

```text
resetRoom4()
```

Test reset before lasers exist.

Reset during:

- elevator start;
- middle of ascent;
- near end.

It should always return to exactly the same state.

---

# Phase D — First Laser

## Step 8

Build one static laser.

Make it:

- visible;
- warning-capable;
- lethal while active;
- resettable.

---

## Step 9

Turn it into a sweeping laser.

---

## Step 10

Test hitting it from:

- standing;
- jumping;
- moving;
- platform edge.

Make sure one hit causes exactly one reset.

---

# Phase E — Patterns

## Step 11

Build Phase 1.

Playtest.

---

## Step 12

Build Phase 2.

Playtest.

---

## Step 13

Build Phase 3.

Playtest.

---

## Step 14

Build Phase 4.

Playtest.

Do not build all four patterns before testing any of them.

---

# Phase F — Exit

## Step 15

Add final slowdown.

---

## Step 16

Add Room 5 platform.

---

## Step 17

Add completion trigger.

Test:

```text
Room 3
→ Room 4
→ Room 5
```

without debug tools.

---

# Phase G — Art Pass

Only after gameplay works:

- replace greybox elevator;
- add structural beams;
- add pipes;
- add cables;
- add floor markings;
- add emitters;
- add warning lights.

---

# Phase H — Effects Pass

Then add:

- emissive lasers;
- better lighting;
- sparks;
- elevator vibration;
- impact effect;
- audio.

---

# Phase I — Final Tuning

Tune:

- elevator speed;
- warning duration;
- laser speed;
- safe gaps;
- camera distance;
- restart delay.

---

# 70. Greybox Acceptance Gate

Before any art pass, Room 4 must satisfy:

- Player enters from Room 3 correctly.
- Player lands safely on elevator.
- Checkpoint activates.
- Elevator starts automatically.
- Player remains stable on moving platform.
- Lasers can be avoided.
- Lasers correctly detect hits.
- Falling resets room.
- Laser hit resets room.
- Reset restores the entire sequence.
- Elevator reaches exit.
- Player can enter Room 5.
- Room can be completed repeatedly.

If any of these are broken, do not start polishing.

---

# 71. Difficulty Tuning

Use a player who does **not** know the laser sequence.

Observe silently.

Watch for:

### Good result

Player sees warning.

Player reacts.

Player gets hit occasionally.

Player quickly understands why.

Player improves on second attempt.

---

### Bad result A

Player repeatedly says:

> "I didn't see that."

Increase warning time/readability.

---

### Bad result B

Player understands the laser but physically cannot avoid it.

Slow the pattern or increase platform space.

---

### Bad result C

Player stays in one corner and never moves.

Patterns are too easily cheesed.

Adjust sweep range/timing.

---

### Bad result D

Player falls off constantly without touching lasers.

Elevator is too small or controls/camera are the real challenge.

Increase elevator size.

---

# 72. Expected Failure Count

Ideal first-time player:

```text
0–3 failures
```

The room should not become a ten-attempt obstacle.

It is a pacing set-piece, not the game's hardest challenge.

---

# 73. Accessibility / Readability Considerations

Do not communicate laser danger exclusively through colour.

Use:

- glow;
- shape;
- sound;
- movement;
- warning animation.

The beam should be visually distinct even if red colour perception is reduced.

Possible additions:

- bright white centre;
- strong emissive intensity;
- visible emitter charging;
- audio cue.

---

# 74. Performance Requirements

The project is browser-based and will be marked on lab hardware, so keep the room lightweight. The brief explicitly stresses draw calls, texture sizes, allocation behaviour and GPU memory.

---

## Reuse geometry

All identical laser emitters should reuse:

```text
geometry
material
```

where possible.

---

## Reuse shaft modules

Repeated structural beams should share geometry/materials.

---

## Limit real lights

Prefer emissive meshes for small warning lamps.

---

## Avoid unnecessary shadows

Especially on decorative shaft geometry.

---

## No per-frame allocations

Reuse temporary vectors.

---

## Dispose on level unload

Any Room 4-specific:

- geometries;
- materials;
- textures;
- particle resources;
- audio resources;

should follow the level disposal rules.

---

# 75. Edge Cases to Test

## Player jumps when elevator starts

Should work normally.

---

## Player is airborne during phase transition

Lasers should continue normally.

---

## Player hits two lasers simultaneously

Only trigger **one** failure/reset.

Use a failure lock.

Example:

```text
if (isResetting) return
```

---

## Player falls while already hit

Still only one reset.

---

## Player lands on a laser emitter

Prefer making emitters outside reachable gameplay space.

---

## Player jumps against shaft wall

Normal collision should resolve it.

Do not allow accidental sticky-wall attachment unless specifically desired.

If Tack automatically sticks to surfaces, **shaft walls should probably NOT be tagged as sticky surfaces**.

This is important.

Otherwise the player could leave the elevator and climb the shaft, completely bypassing the intended challenge.

---

# 76. Surface Tagging

Room 4 should deliberately control which surfaces have gameplay properties.

Recommended:

### Elevator roof

```text
normal traversable
```

### Shaft walls

```text
non-sticky
```

### Pipes/supports

```text
non-sticky
```

### Exit wall/platform

Whatever Room 5 requires.

This prevents unintended shortcuts.

---

# 77. Preventing Laser Cheesing

Potential cheese:

### Standing underneath emitter geometry

Solution:

Mount emitters beyond elevator boundaries.

---

### Climbing shaft wall

Solution:

Walls are not sticky.

---

### Jumping outside every laser's radius

Solution:

Make beams span the useful elevator area.

---

### Staying permanently airborne

If Tack's bounce allows this, tune the timing so airborne movement is still required.

Do not add artificial invisible ceilings unless genuinely necessary.

---

# 78. Elevator Ceiling / Shaft Constraints

You probably do not need a ceiling around the player's gameplay area.

However, if the player can jump absurdly high:

Use visible overhead structural crossbeams or a generous invisible upper boundary.

Prefer physical-looking geometry rather than invisible constraints.

---

# 79. Environmental Storytelling

The shaft can communicate that the facility is failing.

Possible details:

- one broken maintenance platform;
- cables hanging loose;
- sparks;
- warning labels;
- damaged wall panels;
- disabled lift signage;
- laser security system still functioning despite facility decay.

This reinforces the game's abandoned research facility setting.

---

# 80. Why the Lasers Exist

No dialogue is required.

Environmental explanation can be:

> The elevator enters a restricted containment/security shaft whose automated defence system still operates.

Possible signage:

```text
AUTHORIZED SPECIMEN TRANSPORT ONLY
```

or:

```text
CONTAINMENT TRANSIT SHAFT
AUTOMATED STERILIZATION ACTIVE
```

This makes the hazards feel like part of the facility rather than arbitrary game obstacles.

---

# 81. Optional Sterilisation Theme

Instead of describing them simply as security lasers, visually frame the sequence as:

> **an automated specimen sterilisation/scanning system**

That fits the laboratory environment.

The beams could be:

- scanning beams;
- containment sensors;
- sterilisation fields.

Mechanically they remain identical.

Do not add extra systems because of the name.

---

# 82. Polish Idea — Elevator Reaction

The elevator could react slightly when Tack lands.

Very small visual movement:

```text
platform drops 0.05–0.1 units
then settles
```

Do not move the actual collision platform independently if it risks physics problems.

This could be visual-only via the elevator mesh.

---

# 83. Polish Idea — Laser Near Miss

Optional stretch:

When an active laser passes very close to Tack:

- slime shader briefly increases emissive rim;
- subtle electrical sound;
- tiny particles.

Only do this after the room is complete.

---

# 84. Polish Idea — Shaft Wind

During faster elevator sections:

- slight particle streaks;
- louder wind;
- slime visual deformation could react to movement speed.

This connects the room to the project's deformable slime shader.

Again, this is polish, not required gameplay.

---

# 85. Polish Idea — Dynamic Warning Lights

During the final phase:

```text
warning light frequency increases
```

For example:

Phase 1:

```text
flash every 1.0 sec
```

Final:

```text
flash every 0.35 sec
```

Simple change, strong perceived escalation.

---

# 86. Polish Idea — Arrival Contrast

At the end:

```text
laser hum stops
red lights stop
motor fades
```

Then perhaps neutral Room 5 lighting appears above.

This visual contrast tells the player:

> challenge complete.

---

# 87. Optional Camera Moment at Arrival

Do not interrupt gameplay with a long cutscene.

At most, briefly bias the camera toward the newly opened Room 5 route.

Example:

```text
0.5-second subtle camera look
```

Then immediately return full control.

This is optional.

---

# 88. Things That Should NOT Be Added

Do not add:

- random laser generation;
- enemy AI;
- turrets tracking the player;
- physically simulated elevator cables;
- elevator damage system;
- health;
- multiple lives;
- moving elevator counterweights;
- destructible walls;
- destructible lasers;
- laser reflections;
- mirrors;
- realistic acceleration forces;
- physics-based swinging obstacles;
- procedural shaft generation;
- multiple elevator cars;
- wall-climbing route alternatives;
- a boss encounter.

Any of these could turn this small room into its own subsystem.

---

# 89. Minimum Viable Room 4

If time becomes limited, Room 4 only needs:

1. vent drop;
2. moving elevator;
3. checkpoint;
4. three laser patterns;
5. room reset;
6. exit platform.

Everything else can be removed.

Even this version still delivers the intended experience.

---

# 90. Recommended Final Laser Sequence

A good concrete first version would be:

## 0–3 seconds

Elevator startup.

No hazard.

---

## 3–9 seconds

Single laser sweep.

```text
LEFT → RIGHT
```

Two repetitions.

---

## 9–17 seconds

Alternating sweep.

```text
LEFT → RIGHT

RIGHT → LEFT
```

---

## 17–27 seconds

Two sweeps with shorter pauses.

Player must reposition more quickly.

---

## 27–37 seconds

Crossing rotating beams.

Safe zone moves across elevator.

---

## 37–45 seconds

Final combination:

```text
left sweep
right sweep
crossing beam
final horizontal sweep
```

---

## 45–48 seconds

Everything shuts off.

Elevator slows.

---

## 48–50 seconds

Arrival.

```text
DING
```

Player moves into Room 5.

Total:

> **approximately 50 seconds**

This should be treated as the starting timeline rather than a locked number.

Playtesting decides the final timing.

---

# 91. Full Player Experience

The finished room should feel approximately like this:

The player leaves Room 3 through a cramped maintenance duct.

The duct suddenly opens beneath them.

Tack drops into darkness.

A large industrial elevator rushes into view beneath the camera.

Tack lands heavily on its roof.

For a moment, nothing happens.

Then:

```text
CLICK
```

Red warning lights activate.

```text
CLUNK
```

The machinery engages.

The elevator begins climbing.

Shaft supports start sliding rapidly downward around the player.

Ahead, one laser emitter begins glowing.

A warning tone sounds.

The first beam sweeps across the elevator.

The player jumps.

Another appears from the opposite side.

The patterns begin overlapping.

The elevator continues climbing while pipes, floor numbers and maintenance platforms rush past.

The warning lights accelerate.

Two beams rotate across the elevator roof, forcing Tack to move between safe spaces.

The motor reaches its loudest point.

The final sequence fires.

Then—

everything stops.

The lasers disappear.

The warning lights go dark.

The elevator slows.

A neutral light appears above.

```text
DING
```

A maintenance platform leading toward Room 5 sits beside the elevator.

The player jumps across and continues.

---

# 92. Final Build Checklist

Before considering Room 4 finished:

## Geometry

- [ ] Room 3 vent connects correctly.
- [ ] Elevator shaft has clear scale and depth.
- [ ] Elevator roof has sufficient movement space.
- [ ] Exit platform clearly leads to Room 5.
- [ ] Shaft walls cannot be exploited through sticky climbing.

## Elevator

- [ ] Elevator moves smoothly.
- [ ] Tack inherits elevator motion correctly.
- [ ] Tack can walk normally on elevator.
- [ ] Tack can jump normally.
- [ ] Tack can land normally.
- [ ] No visible jitter.
- [ ] No platform tunnelling.

## Lasers

- [ ] Laser warnings are visible.
- [ ] Laser collision matches visuals.
- [ ] Laser sequence is deterministic.
- [ ] No unavoidable patterns.
- [ ] All lasers reset correctly.
- [ ] Laser hit only triggers one failure event.

## Failure

- [ ] Falling resets Room 4.
- [ ] Laser contact resets Room 4.
- [ ] Reset does not return player to Room 3.
- [ ] Player velocity resets.
- [ ] Elevator resets.
- [ ] Lasers reset.
- [ ] Audio resets.
- [ ] Effects reset.
- [ ] Retry delay is short.

## Camera

- [ ] Player can see incoming hazards.
- [ ] Camera does not constantly hit shaft walls.
- [ ] Camera does not shake with elevator.
- [ ] Drop from vent remains readable.
- [ ] Exit direction is obvious.

## Visuals

- [ ] Elevator movement is visually obvious.
- [ ] Shaft contains repeating depth/speed cues.
- [ ] Lasers remain readable without bloom.
- [ ] Warning state clearly differs from active state.
- [ ] Lighting does not obscure player.

## Audio

- [ ] Elevator startup sound.
- [ ] Elevator movement loop.
- [ ] Laser warning sound.
- [ ] Laser impact sound.
- [ ] Arrival sound.
- [ ] Loops stop correctly on reset.

## Performance

- [ ] No geometry/material allocation each frame.
- [ ] Repeated objects share resources where practical.
- [ ] Number of dynamic lights remains limited.
- [ ] Shadows remain within budget.
- [ ] Room runs smoothly on weaker hardware.
- [ ] Room unload does not increase GPU memory permanently.

## Progression

- [ ] Room can be entered from Room 3.
- [ ] Room can be completed without debug controls.
- [ ] Room 5 can be entered.
- [ ] Room completion state is recorded correctly.
- [ ] Room can be replayed after a full game restart.

---

# 93. Final Scope Decision

**Room 4 should remain a short, authored action set-piece.**

The implementation target is:

> **One moving industrial elevator, one room checkpoint, a deterministic laser timeline, three to four readable hazard patterns, rapid room reset, and a clean transition into Room 5.**

The room does **not** need sophisticated physics or procedural systems to be memorable.

Its strength should come from:

- pacing;
- vertical movement;
- readable hazards;
- lighting;
- sound;
- strong visual presentation;
- Tack's movement being tested under pressure.

The most important technical requirement is the stability of Tack on the moving elevator.

The most important gameplay requirement is that every laser pattern is readable and fair.

The most important scope requirement is that the room stays short.

If those three things work, Room 4 can become one of the strongest set-pieces in Level 1 without becoming one of the most expensive rooms to build.