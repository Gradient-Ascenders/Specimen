# Level 3 — Blackout

## Detailed Design and Implementation Plan

---

# 1. Level Overview

## 1.1 Level Identity

> **Level 3 — Blackout: Master electricity and coordinate all three slimes through the facility's forbidden security sector before combining them into Specimen and destroying the facility's final defence.**

Level 3 is the final level of the game and should feel substantially different from Levels 1 and 2.

The player has already learned:

- Bob's movement.
- Charged jumping.
- Bouncing.
- Sticky surfaces.
- Vent traversal.
- Goop's corrosive ability.
- Slime switching.
- Cooperation between Bob and Goop.
- Lasers.
- Drones.
- Moving machinery.
- Environmental hazards.

Level 3 must now:

1. Introduce Volt.
2. Teach electricity and electrical connections.
3. Make darkness and light part of gameplay.
4. Require all three slimes to cooperate.
5. Reintroduce previous hazards in more advanced combinations.
6. Merge the three slimes into Specimen.
7. Introduce limited combat through Specimen.
8. End with a large scripted boss encounter.
9. Provide the narrative and mechanical climax of the game.

---

# 2. Level Structure

Level 3 contains four major rooms.

However, Room 4 is internally split into two sections.

| Section | Purpose |
|---|---|
| Room 1 | Teach Volt |
| Room 2 | Introduce three-slime cooperation |
| Room 3 | Advanced three-slime mastery gauntlet |
| Room 4A | Merge into Specimen and learn Specimen |
| Room 4B | Final boss encounter |
| Ending | Escape and final cinematic |

The intended progression is:

> **Learn → Cooperate → Master → Merge → Fight → Escape**

---

# 3. Level Atmosphere

## 3.1 General Theme

Level 3 takes place in an area of the facility that was never intended to be accessed by ordinary personnel.

This is the facility's:

- restricted research wing;
- security sector;
- high-voltage infrastructure area;
- experimental specimen control region;
- automated defence centre.

The player should immediately understand:

> **You are somewhere dangerous and forbidden.**

Level 1 was controlled and clinical.

Level 2 was damaged and increasingly unstable.

Level 3 should feel like the facility itself is actively hostile.

---

# 4. Environment Visual Identity

Level 3 should be significantly darker than the previous levels.

The environment should contain:

- broken ceiling lights;
- flickering emergency lights;
- exposed wiring;
- electrical sparks;
- damaged conduits;
- industrial machinery;
- warning lights;
- security cameras;
- hazard stripes;
- reinforced doors;
- surveillance equipment;
- drone charging stations;
- laser emitters;
- electrical substations;
- maintenance walkways;
- deep vertical shafts;
- observation windows;
- heavy blast doors;
- collapsed ceiling panels;
- dangling cables;
- occasional smoke or steam;
- inactive machinery that comes alive when Volt powers it.

The environment should mostly use:

- dark greys;
- black metal;
- muted industrial colours;
- warning orange/red;
- emergency red lights.

Volt's yellow glow should therefore contrast strongly against the environment.

---

# 5. Lighting Philosophy

Light is no longer simply visual decoration.

In Level 3:

> **Light becomes part of gameplay.**

Some rooms should initially be extremely dark.

The player should still be able to navigate enough to avoid becoming completely stuck, so there should always be a very low ambient lighting floor.

The darkness must create tension without making the game frustrating.

Sources of illumination include:

- Volt himself;
- emergency lighting;
- electrical arcs;
- powered ceiling lights;
- machinery indicators;
- lasers;
- sparks;
- Specimen's glow;
- boss weak points;
- warning lights.

---

# 6. Volt

## 6.1 Visual Identity

Volt is a yellow electrical slime.

He should immediately look different from Bob and Goop.

Volt should have:

- bright yellow body colour;
- emissive internal glow;
- electrical particles;
- small sparks travelling around his body;
- occasional electrical arcs;
- a soft point light following him;
- pulsing emissive intensity;
- stronger glow while using electricity;
- stronger glow when connected to machinery.

Volt's visual animation should make him look unstable and energetic.

---

# 7. Volt Movement

Volt uses the normal slime movement framework.

Volt:

- walks/slithers normally;
- can perform the standard weak jump available to non-Bob slimes;
- cannot climb sticky walls;
- cannot use Bob's advanced traversal;
- cannot dissolve surfaces;
- cannot destroy drones.

Volt's speciality is entirely electrical.

This preserves the importance of switching.

---

# 8. Volt Aim Mode

Volt uses the same basic interaction philosophy as Goop.

## Controls

### Right Mouse Button

Hold or toggle RMB to enter:

> **Volt Aim Mode**

The camera transitions into first-person or near-first-person aiming.

The centre of the screen receives a crosshair.

Electrical targets become easier to identify.

---

# 9. Electrical Vision

While Volt is aiming, conductive objects should gain special visual feedback.

Examples:

- electrical terminals;
- power sockets;
- ceiling lights;
- machinery;
- generators;
- doors;
- lifts;
- moving platforms;
- rotating bridges;
- laser control units.

Possible visual treatment:

- faint yellow outline;
- electrical shimmer;
- pulsing circuit pattern;
- small electrical symbol;
- glowing connection socket.

Objects should NOT glow brightly from across the entire map.

Electrical vision should primarily help the player identify nearby or relevant objects.

Suggested states:

### Inactive compatible object

Faint electrical pulse.

### Target under crosshair

Brighter highlight.

### Valid connection target

Strong yellow highlight.

### Powered target

Continuous electrical animation.

---

# 10. Volt Electrical Beam

## 10.1 Beam Behaviour

Volt does NOT fire a projectile.

Instead, Volt produces a continuous electrical beam.

The beam should behave like:

> Volt → Electricity Beam → Target

Suggested implementation:

- raycast from camera/crosshair;
- maximum acquisition range;
- electrical arc rendered between Volt and the hit location;
- dynamic noise/jitter in the arc;
- collision point produces sparks.

---

# 11. Beam Controls

Recommended controls:

### Enter Aim Mode

RMB.

### Search / Project Electricity

Hold LMB.

While LMB is held:

- electricity travels toward the crosshair;
- beam remains active;
- beam follows aim;
- if no valid object is hit, nothing permanently happens.

### Establish Connection

If the beam touches a compatible electrical target:

> Volt connects to that object.

The beam becomes locked between Volt and the device.

Volt no longer needs LMB to remain held.

### Disconnect

Press LMB again while a connection exists.

This intentionally creates a clear state:

1. Aim.
2. Hold electricity.
3. Find target.
4. Connect.
5. Release controls.
6. Switch slime if necessary.
7. Target stays powered.
8. Return to Volt later.
9. Disconnect.

---

# 12. Persistent Volt Connections

This mechanic is extremely important.

If Volt is connected to a device and the player switches to Bob or Goop:

> **Volt remains connected.**

Examples:

Volt powers a platform.

Player switches to Bob.

Bob rides the platform.

Volt remains standing where the player left him.

The electrical arc remains visible.

The platform continues moving.

This becomes one of Level 3's primary cooperative puzzle mechanics.

---

# 13. Electrical Connection Rules

Connections should be predictable.

## Recommended rules

A connection breaks if:

- the player intentionally disconnects;
- Volt dies;
- the puzzle resets;
- the object becomes invalid;
- Volt moves beyond maximum tether range.

A connection should NOT randomly break because:

- Bob walked between Volt and the device;
- a small prop passed through the beam;
- the camera moved;
- another slime switched.

Initial connection should require line-of-sight.

Once established, minor obstruction should not constantly break it.

This prevents frustrating puzzles.

---

# 14. Electrical Device Types

Level 3 should reuse a small number of consistent electrical device types.

## 14.1 Powered Light

Volt connects to:

> Ceiling Light Socket

Result:

- room lights activate;
- visibility dramatically improves;
- nearby electrical elements become easier to see.

Purpose:

Teach electricity.

---

## 14.2 Powered Door

Volt powers:

> Door Control Node

Result:

- blast door opens.

Volt may need to remain connected.

---

## 14.3 Powered Moving Platform

Volt powers:

> Platform Motor

Result:

- platform begins moving.

Useful for Bob traversal.

---

## 14.4 Powered Elevator

Volt powers:

> Lift Motor

Result:

- elevator moves while Volt remains connected.

---

## 14.5 Powered Rotating Bridge

Volt powers:

> Rotation Motor

Result:

- bridge rotates into another position.

---

## 14.6 Laser Control Circuit

Volt powers or overloads:

> Laser Junction

Possible behaviour:

- disable one laser;
- redirect laser;
- open timed safety window.

Do not make Volt permanently disable every laser.

Lasers should remain threats.

---

## 14.7 Generator

Large electrical node.

Used later in advanced puzzles.

May power multiple systems simultaneously.

---

# 15. Level 3 Transition

Level 2 ends after Volt is rescued.

Level 3 should begin almost immediately after this event.

Suggested transition:

The three slimes move toward the next sector.

A heavy security door is visible.

The door has:

> RESTRICTED SECTOR  
> HIGH VOLTAGE  
> AUTHORIZED PERSONNEL ONLY

The lights beyond it are almost completely dead.

Volt approaches.

The door's electrical components respond to him.

This naturally establishes:

> Volt is required to continue.

The Level 3 title appears:

# BLACKOUT

---

# 16. Room 1 — Volt Tutorial

## Purpose

Room 1 exists almost entirely to teach Volt.

This room should NOT be overly difficult.

The player should finish Room 1 understanding:

- Volt emits light;
- Volt has Aim Mode;
- Volt can identify electrical objects;
- Volt produces a continuous beam;
- Volt can establish electrical connections;
- Volt can keep systems powered while inactive;
- Volt cannot solve everything alone.

---

# 17. Room 1 Layout

Suggested layout:

1. Dark entrance corridor.
2. Small power-control room.
3. Main dark chamber.
4. Machinery crossing.
5. Exit door.

The room should gradually become larger as the tutorial progresses.

---

# 18. Room 1 — Beat 1: Enter Darkness

The three slimes enter the restricted area.

Almost every light fails.

Bob and Goop become difficult to see.

Volt remains visibly illuminated.

The player is automatically switched to Volt if necessary.

A short UI tutorial appears:

> **VOLT EMITS LIGHT**

No enemy should attack yet.

Allow the player to simply experience walking through darkness with Volt.

The player notices that Volt:

- illuminates nearby walls;
- illuminates Bob;
- illuminates Goop;
- casts moving light around the room.

---

# 19. Room 1 — Beat 2: First Electrical Target

The corridor ends at a closed door.

Beside the door:

> Electrical Socket / Terminal

UI instruction:

> **Hold Right Mouse Button to aim.**

The player enters Volt Aim Mode.

The terminal begins glowing.

Next prompt:

> **Hold Left Mouse Button to conduct electricity.**

Volt fires his beam.

Electricity reaches the terminal.

The terminal powers on.

Door opens.

This should be extremely easy.

No punishment.

---

# 20. Room 1 — Beat 3: Persistent Connection

The player enters a larger dark room.

Visible objects:

- Volt;
- Bob;
- Goop;
- one unpowered overhead light system;
- one door;
- one platform.

The player connects Volt to the lighting system.

Room lights activate.

Then the game encourages switching.

Prompt:

> **Volt remains connected while controlling another slime.**

Player switches to Bob.

The room remains illuminated.

This is the first major Level 3 lesson.

---

# 21. Room 1 — Beat 4: Powered Platform

Bob cannot cross a gap.

A moving platform is present but inactive.

Volt's electrical target is positioned near the starting side.

Player must:

1. Switch to Volt.
2. Connect to platform motor.
3. Switch to Bob.
4. Ride platform across gap.

This teaches:

> Volt can operate machinery for other slimes.

---

# 22. Room 1 — Beat 5: Volt Cannot Do Everything

The far side contains a small sticky-wall traversal.

Bob must climb it.

This deliberately reminds the player:

> Volt powers the solution.

> Bob executes the traversal.

Do not allow Volt to bypass Bob's role.

---

# 23. Room 1 — Beat 6: Connection Range

Introduce connection range carefully.

A machine must remain powered.

Volt cannot simply walk infinitely far away.

Visual feedback:

As Volt approaches maximum range:

- arc stretches;
- electricity becomes unstable;
- warning pulses;
- device light flickers.

If Volt exceeds range:

Connection breaks.

This should be taught somewhere safe.

---

# 24. Room 1 Ending

The room exits into a larger security area.

The camera briefly reveals:

- multiple dark corridors;
- lasers;
- drone infrastructure;
- high-voltage machinery.

This visually communicates:

> The tutorial is finished.

From this point onward the game expects the player to understand Volt.

---

# 25. Room 2 — Three-Slime Cooperation

## Purpose

Room 2 teaches the player that:

> Bob, Goop and Volt are now one puzzle-solving team.

Unlike Room 1, there should be no long tutorial prompts.

The player should solve problems using knowledge gained from previous levels.

Room 2 is mainly about:

> **planning and positioning**

rather than intense hazards.

---

# 26. Room 2 Core Puzzle Philosophy

Avoid repeatedly doing:

> Volt powers door → Bob walks through.

Instead, systems should overlap.

Each slime should contribute something unique.

Ideal puzzle structure:

> Volt creates possibility.

> Goop changes geometry.

> Bob traverses the resulting environment.

---

# 27. Room 2 Layout

Suggested large room:

### Lower Section

- Bob/Goop/Volt starting position.
- power station;
- disabled machinery.

### Central Section

- rotating industrial bridge;
- soluble barriers;
- inaccessible platforms.

### Upper Section

- sticky walls;
- final controls;
- exit door.

The room should be vertically layered.

---

# 28. Room 2 — Puzzle 1: Restore the Machinery

A large rotating bridge blocks progression.

Its motor has no power.

Volt must connect to:

> Bridge Motor

The bridge rotates.

However:

A soluble maintenance barrier prevents the bridge from reaching its full position.

The player must identify:

> The machine works, but something physical blocks it.

---

# 29. Room 2 — Puzzle 2: Goop Clears the Mechanism

Switch to Goop.

Goop navigates to the obstruction.

Goop dissolves:

> Corrodible mechanical locking brace / blockage.

The bridge can now rotate farther.

This is important because Volt did not simply solve the puzzle.

Volt activated the system.

Goop modified the environment.

---

# 30. Room 2 — Puzzle 3: Bob Uses the Result

Volt reconnects to the motor.

Bridge rotates completely.

Switch to Bob.

Bob crosses the bridge.

The route leads into:

- sticky wall;
- wall-climbing section;
- elevated maintenance walkway.

Only Bob can reach the upper control area.

---

# 31. Room 2 — Puzzle 4: Bob Helps the Others

At the top, Bob activates:

> Mechanical release lever.

This opens a lower route.

Goop and Volt can now move farther into the room.

Important design principle:

Bob must not merely receive help.

Bob should also create opportunities for Goop and Volt.

---

# 32. Room 2 — Puzzle 5: Light Positioning

The next area is almost completely dark.

There are two important pathways:

### Left path

Bob traversal.

### Right path

Goop corrosive route.

Volt can illuminate one important region effectively from a central position.

The player should position Volt carefully.

Possible structure:

Volt powers an overhead industrial floodlight.

The floodlight illuminates both pathways.

However Volt must remain at the electrical station.

Player then uses Bob and Goop separately.

This reinforces:

> Leaving Volt behind is sometimes strategically necessary.

---

# 33. Room 2 — Puzzle 6: Goop Opens Bob's Route

Goop dissolves:

> corrodible ceiling support / blocked vent / soluble plate.

This exposes a new sticky wall or passage.

Bob can now continue.

Again:

Goop alters environment.

Bob traverses.

Volt maintains infrastructure.

---

# 34. Room 2 Final Puzzle

All three slimes must end up in different positions.

Example:

### Volt

Connected to main generator.

### Goop

Standing behind a dissolved maintenance barrier on a pressure switch.

### Bob

High above on a sticky wall beside the final emergency release.

Bob activates release.

Goop's plate enables one safety circuit.

Volt provides electricity.

All three conditions become true.

Final blast door opens.

This is the first explicit:

> **All three are required simultaneously**

moment.

---

# 35. Room 2 Completion

When the door opens:

- electrical machinery activates;
- distant warning sirens begin;
- facility detects unauthorized activity.

Security system voice/message can optionally show:

> CONTAINMENT BREACH DETECTED

No dialogue is necessary.

Simple environmental alarm feedback is sufficient.

This signals the transition into Room 3.

---

# 36. Room 3 — Three-Slime Mastery Gauntlet

## Purpose

Room 3 is the hardest traditional puzzle section in the game.

Room 1 taught Volt.

Room 2 taught cooperation.

Room 3 tests mastery.

Its identity is:

> **Perform three-slime cooperation while under pressure from environmental hazards.**

---

# 37. Room 3 Atmosphere

Room 3 should feel much more dangerous.

Use:

- deeper darkness;
- emergency red lighting;
- lasers;
- drones;
- damaged platforms;
- electrical machinery;
- moving hazards;
- large drops;
- exposed machinery;
- alarm sounds.

The facility is now actively responding to the slimes.

---

# 38. Room 3 Hazard Philosophy

Do not overload the room with enemies.

The difficulty should come from:

> interaction between systems.

For example:

Volt must power a system.

Powering the system also activates a laser.

Goop must disable another obstacle.

Bob must physically navigate through the active machinery.

The challenge should be:

> solve the sequence.

Not:

> survive random chaos.

---

# 39. Room 3 Structure

Suggested Room 3:

### Stage A

Laser corridor.

### Stage B

Drone security hall.

### Stage C

Vertical reactor chamber.

### Stage D

Final three-slime synchronization puzzle.

---

# 40. Room 3A — Electrical Laser Corridor

The corridor contains:

- moving lasers;
- dark environment;
- powered shutters.

Volt discovers an electrical junction.

Powering it opens the next door.

However:

Powering it also activates the laser grid.

This introduces:

> Electricity can create both benefits and threats.

Player must power the system with Volt.

Then switch to Bob.

Bob uses movement timing to cross the laser field.

---

# 41. Room 3A — Goop Contribution

One section contains overlapping lasers that Bob cannot safely traverse.

Goop can reach:

> corrosible housing protecting a laser control unit.

Goop dissolves the housing.

This disables or modifies ONE portion of the laser network.

Important:

Goop should not disable the entire challenge.

The player still has to perform traversal.

---

# 42. Room 3B — Drone Security Hall

Drones return.

They should feel like a known threat.

Do not introduce too many new drone mechanics here.

Suggested amount:

2–4 meaningful drones.

Possible layout:

- dark security hall;
- cover structures;
- moving platform;
- one elevated drone;
- one patrolling drone.

Volt's glow creates an interesting risk:

> Volt is visually obvious.

However this does NOT need an advanced stealth detection system unless one already exists.

Keep existing drone rules.

---

# 43. Room 3B — Cooperation Against Drones

Possible sequence:

1. Volt powers a lift.
2. Bob rides lift upward.
3. Bob reaches rear of a drone.
4. Bob disables/pushes drone using existing mechanics.
5. Goop dissolves security barrier.
6. Volt moves to the next electrical terminal.
7. All three advance.

Avoid giving Volt direct drone destruction.

Specimen should later be the character that gains true anti-drone firepower.

This creates progression.

---

# 44. Room 3C — Vertical Reactor Chamber

This should be the major visual spectacle before the final room.

Large vertical chamber.

Features:

- deep shaft;
- giant cables;
- suspended platforms;
- electrical equipment;
- sticky wall surfaces;
- broken lights;
- lasers;
- machinery moving vertically.

The player can look upward and see the eventual destination.

---

# 45. Reactor Chamber Core Puzzle

Volt must power:

> Vertical maintenance platform.

Bob uses the platform.

Goop must remove:

> obstructing soluble supports/barriers.

Suggested sequence:

1. Volt powers platform.
2. Bob rides upward.
3. Platform stops at obstruction.
4. Goop reaches maintenance route.
5. Goop dissolves obstruction.
6. Platform can continue.
7. Bob climbs sticky walls at top.
8. Bob opens upper access route.
9. Volt and Goop advance.

---

# 46. Dynamic Lighting Opportunity

When Volt connects to the reactor system:

Lights can activate progressively.

Example:

Each electrical connection activates sections of the chamber upward.

This produces a visually impressive moment.

The player can literally see their progress through illumination.

---

# 47. Room 3D — Final Three-Slime Puzzle

This is the final puzzle before Specimen.

It should require:

> all three slimes to remain in meaningful positions simultaneously.

No slime should simply stand on an arbitrary button unless it makes sense.

---

# 48. Suggested Final Puzzle

A large security blast door protects the experimental core.

The door requires three systems:

### System A — Electricity

Volt must maintain power to:

> Main Security Grid.

### System B — Corrosion

Goop must dissolve:

> emergency mechanical lock.

### System C — Manual Override

Bob must reach:

> elevated physical release mechanism.

Sequence:

1. Volt connects to main grid.
2. Security systems activate.
3. Goop uses newly powered access door.
4. Goop dissolves mechanical lock.
5. Bob gains access to wall traversal route.
6. Bob climbs through lasers/machinery.
7. Bob reaches manual override.
8. Player activates manual override.
9. All three conditions align.
10. Door begins opening.

---

# 49. Room 3 Climax

As the blast door opens:

The security system becomes unstable.

Electricity surges through the room.

The three slimes are pulled or forced toward:

> Experimental Merge Chamber.

The environment strongly suggests:

This machine was designed to combine biological specimens.

This transitions naturally into Room 4.

---

# 50. Room 4 — The Final Chamber

Room 4 contains:

- Specimen transformation;
- short tutorial;
- boss arena.

Room 4 should be visually larger than every previous room.

---

# 51. Room 4A — Merge Chamber

The three slimes enter a circular experimental chamber.

The room contains:

- three specimen platforms;
- overhead machinery;
- electrical conduits;
- glass containment structures;
- central merge platform.

The exit locks behind them.

A huge security system activates.

---

# 52. Merge Sequence

Bob, Goop and Volt become trapped or surrounded by energy.

The machinery activates.

Suggested visual progression:

1. Bob begins glowing.
2. Goop begins glowing.
3. Volt begins releasing electricity.
4. Three bodies lift slightly.
5. Energy streams connect them.
6. Colours swirl together.
7. Bodies merge.
8. Large red slime forms.
9. Powerful energy pulse expands through room.
10. Lights flicker or explode.
11. Camera settles behind Specimen.

Duration:

Approximately 5–8 seconds.

Skippable after first viewing if possible.

---

# 53. Specimen

The merged slime is called:

# SPECIMEN

This is the payoff of the game's title.

Specimen is:

- larger than individual slimes;
- red;
- highly emissive;
- physically powerful;
- electrically unstable;
- capable of using all three slime abilities.

---

# 54. Specimen Visual Design

Primary colour:

> Deep luminous red.

Secondary details:

- yellow electrical arcs from Volt;
- green corrosive glow from Goop;
- blue/teal motion streaks or surface features representing Bob;
- bright internal core;
- sparks;
- stronger vertex deformation;
- heavier landing animation.

The three original slime colours should remain subtly visible.

This visually communicates:

> Specimen contains all three.

---

# 55. Specimen Size

Specimen should be noticeably larger.

Recommended:

Approximately 1.5×–2× normal slime apparent size.

Do not make him so large that:

- cameras clip constantly;
- corridors break;
- collision becomes unreliable.

Boss arena geometry should be authored around his dimensions.

---

# 56. Specimen Movement

Specimen inherits Bob's movement strengths.

Specimen can:

- move normally;
- jump;
- charged jump;
- bounce;
- stick to sticky walls;
- traverse vertical surfaces.

He should feel slightly heavier than Bob.

Suggested feel:

- strong acceleration;
- weightier landing;
- powerful jumps;
- bigger impact effects.

Do NOT make Specimen slow.

The finale should feel empowering.

---

# 57. Specimen Aim Mode

RMB:

> Enter Specimen Aim Mode.

Same fundamental camera behaviour as Goop and Volt.

Crosshair appears.

---

# 58. Specimen Normal Attack

Tap LMB:

> Fire Electric Acid Blast.

This combines:

- Goop's acid;
- Volt's electricity.

Projectile should:

- travel quickly;
- glow;
- leave a short electrical trail;
- produce corrosive/electrical impact;
- destroy combat-capable drones where appropriate;
- damage boss weak points.

This is the first time the player gains a proper offensive ability.

---

# 59. Specimen Charged Attack

Hold LMB:

> Charge Electric Acid Blast.

While charging:

- Specimen glows brighter;
- electricity increases;
- sparks intensify;
- internal light pulses;
- nearby environment receives stronger illumination;
- audio pitch rises;
- particles become more violent;
- crosshair indicates charge.

At full charge:

Strong visual/audio cue.

Release LMB:

> Fire powerful charged blast.

---

# 60. Charged Blast Purpose

Charged attack should:

- destroy stronger drone types;
- break reinforced boss components;
- deal major weak-point damage;
- produce large visual impact.

Normal attack:

fast and practical.

Charged attack:

powerful but risky because the player must spend time charging.

---

# 61. Specimen Tutorial

The Specimen tutorial must be SHORT.

Target duration:

45–90 seconds.

Do not create another full puzzle room.

The route toward the boss should teach the controls naturally.

---

# 62. Tutorial Beat 1 — Movement

Specimen exits merge chamber.

Small gap.

Player jumps across.

---

# 63. Tutorial Beat 2 — Sticky Wall

Short sticky-wall section.

Specimen climbs it.

This demonstrates:

> Bob's ability survived the merge.

---

# 64. Tutorial Beat 3 — Normal Attack

One inactive/security drone blocks the route.

Prompt:

> **RMB — Aim**

> **LMB — Electric Acid**

Player destroys drone.

This demonstrates:

> Goop + Volt.

---

# 65. Tutorial Beat 4 — Charged Attack

A reinforced security barrier blocks the boss arena.

Prompt:

> **Hold LMB to charge.**

Player charges.

Specimen becomes extremely bright.

Release.

Barrier explodes.

Silence for a moment.

Then:

Boss arena becomes visible.

---

# 66. Boss Introduction

Camera pulls back.

Large room.

At far end:

> Giant Security Drone / Facility Defence Unit.

It powers on.

Lights activate.

Alarm begins.

Boss descends or rotates toward Specimen.

This should be one of the game's strongest presentation moments.

---

# 67. Boss Design Philosophy

The boss should NOT require advanced general-purpose AI.

Implement the boss primarily as:

> **Scripted state machine + authored attacks**

This reduces technical risk.

Boss behaviour should be deterministic enough to debug.

---

# 68. Boss Concept

Working name:

# SENTINEL

Possible alternatives:

- Warden;
- Overseer;
- Guardian;
- Custodian;
- Defence Core.

Sentinel is recommended.

---

# 69. Boss Appearance

Large airborne or semi-suspended security machine.

Visual elements:

- central glowing eye/core;
- multiple mechanical arms or weapon modules;
- laser emitters;
- drone deployment bays;
- armour plates;
- rotating rings;
- exposed electrical components;
- large weak point hidden behind armour.

The boss should look like an evolution of the drones already seen in the game.

This makes it feel connected to the facility.

---

# 70. Boss Arena

Large circular or rectangular industrial chamber.

Arena should contain:

- sticky walls;
- raised platforms;
- cover;
- destructible/dissolvable-looking hazards;
- drone spawn points;
- laser emitters;
- vertical traversal possibilities;
- open centre area.

Avoid excessive decorative geometry that interferes with movement.

---

# 71. Boss Fight Structure

Recommended:

Three phases.

Each phase follows:

> Boss Attack → Player Survives/Solves → Weak Point Opens → Player Attacks

Do NOT use a giant HP sponge.

Recommended boss health model:

> Three major successful damage cycles.

---

# 72. Boss Phase 1 — Introduction

Purpose:

Teach basic combat.

Boss attacks using:

- simple sweeping laser;
- 1–2 drones.

Player must:

- move;
- jump;
- use walls;
- destroy drones.

After attack cycle:

Boss overheats.

Front armour opens.

Weak point exposed.

Player shoots weak point.

Normal shots work.

After sufficient damage:

Phase 2.

---

# 73. Boss Phase 1 Laser

Boss projects visible aiming line before firing.

Telegraph:

1. Red targeting beam.
2. Charging sound.
3. Brief delay.
4. Powerful laser sweep.

Player can:

- jump;
- move behind cover;
- climb wall.

Never fire unavoidable attacks.

---

# 74. Boss Phase 1 Drones

Maximum:

2–3 drones.

Keep performance predictable.

Specimen can destroy them using electric acid.

This creates a satisfying contrast:

Earlier:

The player had to avoid/manipulate drones.

Now:

Specimen can destroy them.

---

# 75. Boss Phase 2 — Environmental Control

Boss becomes more aggressive.

Introduces:

- moving lasers;
- temporary arena obstacles;
- electrical floor hazards;
- more advanced drone.

Boss uses arena infrastructure.

---

# 76. Phase 2 Obstacle Concept

Boss activates security barriers.

Examples:

- laser walls;
- moving energy gates;
- rotating emitters.

Player must use Bob-derived mobility.

Sticky walls become useful.

This prevents the boss from becoming:

> stand still and shoot.

---

# 77. Phase 2 Strong Drone

Boss may summon:

> Heavy Security Drone.

Heavy drone cannot be efficiently destroyed with normal shots.

Player should use:

> Charged Electric Acid Blast.

This reinforces charged attack.

---

# 78. Phase 2 Weak Point

After heavy attack sequence:

Boss power system overloads.

Armour opens.

Weak point is visible for limited period.

Player must:

1. aim;
2. charge;
3. avoid remaining hazards;
4. release charged blast.

Successful hit:

Major explosion.

Boss becomes damaged.

Phase 3 begins.

---

# 79. Boss Phase 3 — Final Escalation

Boss is heavily damaged.

Lighting fails.

Arena becomes darker.

Emergency lights activate.

Boss attacks become faster but still readable.

Specimen's own glow becomes visually important.

---

# 80. Phase 3 Attacks

Use a combination of existing attacks.

Avoid introducing too many completely new mechanics.

Possible sequence:

1. sweeping laser;
2. drone deployment;
3. rotating laser grid;
4. electrical shockwave;
5. final vulnerability.

---

# 81. Electrical Shockwave

Boss charges electricity.

Clear floor warning.

Shockwave expands outward.

Player avoids by:

- jumping;
- charged jump;
- climbing wall.

This tests Bob's mobility.

---

# 82. Final Vulnerability

Boss becomes unstable.

Core opens completely.

Boss attempts to charge one final devastating attack.

Visual:

- arena lights flicker;
- electricity feeds boss;
- alarms intensify;
- weak point becomes extremely bright.

Player must charge Specimen's strongest attack.

During charge:

Specimen becomes brighter and brighter.

The entire room may become illuminated by him.

This is the final mechanical and visual payoff of Volt.

---

# 83. Final Attack

Player releases charged shot.

Projectile hits exposed core.

Boss freezes.

Brief silence.

Then:

Large internal explosion.

Electric arcs spread through boss.

Armour fragments fall.

Boss crashes.

Security systems shut down.

---

# 84. Boss Defeat Cinematic

Recommended short sequence:

1. Boss core explodes.
2. Main lights fail.
3. Emergency systems power down.
4. Arena door unlocks.
5. Specimen looks toward escape route.
6. Facility begins structural failure.

Optional message:

> SECURITY NETWORK OFFLINE

or:

> CONTAINMENT FAILURE — TOTAL

---

# 85. Post-Boss State

Possible options:

### Option A — Specimen splits

After defeating boss, Specimen automatically separates back into:

- Bob;
- Goop;
- Volt.

This reinforces that they remain three individuals.

### Option B — Specimen remains merged until ending

Less recommended.

Recommended:

> Split them again before the final escape.

This gives the ending emotional clarity.

---

# 86. Final Escape Sequence

Keep it short.

The player should not face another major puzzle.

The escape should mainly provide closure.

Possible structure:

1. Boss defeated.
2. Exit opens.
3. Specimen splits.
4. Three slimes travel together.
5. Short corridor/shaft.
6. Emergency door opens.
7. Bright natural light appears.

---

# 87. Natural Light Ending

The game has spent Level 3 in darkness.

Therefore the final visual should be:

> intense natural daylight.

The three slimes emerge outside.

Use:

- blue sky;
- sunlight;
- vegetation;
- distant landscape;
- natural ambience.

This should feel completely different from the facility.

---

# 88. Ending Cinematic

Suggested sequence:

The three slimes emerge.

Camera starts behind them.

They move toward daylight.

Camera slowly rises.

Facility entrance visible behind them.

Bob, Goop and Volt stand together.

Camera pulls farther back.

Fade.

# SPECIMEN

Credits.

---

# 89. Checkpoint Strategy

Level 3 is long.

Use checkpoints aggressively.

Recommended checkpoints:

### CP1

Start of Room 1.

### CP2

After Volt tutorial.

### CP3

Start of Room 2.

### CP4

After Room 2 central bridge puzzle.

### CP5

Start of Room 3.

### CP6

Before reactor chamber.

### CP7

Before final three-slime puzzle.

### CP8

After merge / before boss.

### CP9

Optional boss phase checkpoint.

Prefer restarting entire boss fight unless it becomes too long.

Boss fight target duration:

3–6 minutes.

---

# 90. Reset Behaviour

Every puzzle must support reset.

Reset should restore:

- Volt connections;
- moving platform positions;
- lights;
- doors;
- dissolved surfaces where appropriate;
- drone states;
- lasers;
- machinery;
- slime positions;
- boss state.

No puzzle should require reloading the page.

---

# 91. Volt Connection Reset

Checkpoint reset must:

1. remove existing electrical arc;
2. disconnect Volt;
3. restore device initial state;
4. restore Volt position;
5. re-evaluate powered systems.

Do not leave invisible powered objects after reset.

---

# 92. Boss Reset

Boss must have explicit reset logic.

Reset:

- boss transform;
- boss phase;
- weak-point state;
- armour state;
- drones;
- lasers;
- temporary hazards;
- projectiles;
- audio;
- particles;
- Specimen health/failure state;
- camera.

No leftover entities.

---

# 93. Failure Model

Use existing death/failure behaviour.

Potential Level 3 failure sources:

- acid;
- lasers;
- falls;
- drone attacks;
- boss attacks;
- electrical hazards.

Specimen should not introduce a complicated RPG health system unless one already exists.

Recommended boss failure model:

Use the game's normal hazard/death mechanics.

If Specimen is hit by lethal attacks:

> existing death sequence.

Then restart boss.

---

# 94. UI — Volt

HUD should show:

### Active Slime

VOLT.

### Connection state

Possible:

> CONNECTED

with target name/icon.

Example:

> CONNECTED — PLATFORM MOTOR

### Range warning

If connection approaches maximum distance:

> CONNECTION UNSTABLE

Avoid excessive UI.

Most feedback should remain visual.

---

# 95. UI — Specimen

When merge completes:

Existing slime selector should temporarily change.

Display:

> SPECIMEN

The Bob/Goop/Volt switching controls should disable.

Ability indicators could show:

- movement;
- electric acid;
- charged blast.

Do not clutter HUD.

---

# 96. Audio — Volt

Volt requires unique audio identity.

Necessary sounds:

- idle electrical crackle;
- Aim Mode enter;
- beam start;
- beam loop;
- beam impact;
- successful connection;
- disconnection;
- connection instability;
- powered machinery;
- electrical sparks.

Beam loop must transition smoothly.

---

# 97. Audio — Specimen

Required sounds:

- merge;
- heavy movement;
- jump;
- landing;
- sticky contact;
- normal projectile;
- projectile impact;
- charge loop;
- full-charge cue;
- charged blast;
- boss impact.

---

# 98. Audio — Boss

Required:

- activation;
- mechanical movement;
- targeting;
- laser charge;
- laser firing;
- drone deployment;
- damage;
- armour opening;
- core exposure;
- phase transition;
- final destruction.

Boss fight music should escalate between phases if practical.

---

# 99. Visual Effects — Volt Beam

Beam can use:

- line geometry;
- animated noise;
- multiple displaced line segments;
- emissive material;
- small spark particles.

Do not create expensive new geometries every frame.

Reuse buffers.

---

# 100. Visual Effects — Specimen Charge

Specimen charge is one of the game's major visual effects.

Charge amount should drive:

- emissive intensity;
- point-light intensity;
- electrical particle frequency;
- arc frequency;
- shader distortion;
- body pulse;
- projectile size;
- audio pitch.

Use one:

> `chargeAmount`

value.

Range:

0 → 1.

Drive multiple effects from it.

---

# 101. Shader Opportunities

Level 3 is ideal for demonstrating custom shader integration.

Potential shader-driven elements:

### Volt

Electrical pulse through slime shader.

### Electrical Targets

Animated circuit texture.

### Volt Beam

Procedural electric distortion.

### Specimen

Merged slime shader state.

### Charged Attack

Intensity driven by charge amount.

### Boss Core

Pulsating procedural energy.

### Weak Point

Shader changes based on boss state.

These effects should respond to gameplay state.

---

# 102. Lighting Performance Rules

Do not make every lamp a real dynamic shadow-casting light.

Recommended:

### Volt

1 real dynamic point light.

### Powered lights

Mostly:

- emissive materials;
- selective non-shadow lights.

### Specimen

1 dynamic light.

### Boss

Use emissive materials heavily.

Limit shadow-casting lights.

---

# 103. Drone Performance

Boss must not spawn unlimited drones.

Maximum recommended simultaneous drones:

3–4.

When drone is destroyed:

- remove from update systems;
- remove collider;
- dispose/reuse resources appropriately.

Prefer pooling if practical.

---

# 104. Projectile Performance

Specimen projectiles should use pooling.

Avoid:

> `new Mesh()`

every time the player shoots.

Maintain reusable projectile instances.

Especially important during boss fight.

---

# 105. Boss Architecture

Recommended boss state machine:

- `INTRO`
- `PHASE_1_ATTACK`
- `PHASE_1_VULNERABLE`
- `PHASE_2_ATTACK`
- `PHASE_2_VULNERABLE`
- `PHASE_3_ATTACK`
- `FINAL_VULNERABLE`
- `DEFEATED`

Keep transitions explicit.

Avoid unpredictable AI.

---

# 106. Boss Attack Architecture

Each boss attack should implement something similar to:

- `start()`
- `update(dt)`
- `isComplete()`
- `cancel()`
- `reset()`

Examples:

- LaserSweepAttack.
- DroneDeployAttack.
- ShockwaveAttack.
- RotatingLaserAttack.

Boss state machine chooses which attack runs.

---

# 107. Weak Point Architecture

Boss weak point should be explicit.

Properties:

- active/inactive;
- damage allowed;
- normal projectile response;
- charged projectile response;
- visual glow;
- hit feedback.

Do not simply raycast against entire boss and subtract HP.

Player should understand exactly where to shoot.

---

# 108. Boss Telegraphing

Every dangerous attack must have three states:

### Telegraph

Shows what is about to happen.

### Active

Attack occurs.

### Recovery

Boss pauses.

Example laser:

1. red aiming line;
2. charge sound;
3. laser fires;
4. cooldown.

This ensures deaths feel fair.

---

# 109. Camera Requirements

Level 3 uses several camera modes.

### Third Person

Normal movement.

### Volt Aim

First-person aiming.

### Specimen Aim

First-person aiming.

### Merge Cinematic

Scripted camera.

### Boss Introduction

Scripted camera.

### Boss Defeat

Scripted camera.

### Ending

Scripted camera.

Transitions should avoid harsh cuts unless intentional.

---

# 110. Specimen Camera

Specimen is larger.

Normal camera distance may need adjustment.

Recommended:

Increase follow distance slightly.

Camera collision must still work.

Aim camera should originate correctly relative to larger body.

Test:

- sticky walls;
- jumping;
- boss arena edges;
- cover objects.

---

# 111. Level 3 Environmental Storytelling

No dialogue required.

Suggested environmental clues:

- `RESTRICTED`;
- `EXPERIMENTAL BIOFUSION`;
- `SECURITY CORE`;
- `HIGH VOLTAGE`;
- `AUTHORIZED PERSONNEL ONLY`;
- broken specimen chambers;
- merge machinery;
- drone storage bays.

This subtly explains why the merge machine exists.

---

# 112. Room Difficulty Curve

## Room 1

Difficulty:

Low.

Focus:

Learning.

## Room 2

Difficulty:

Medium.

Focus:

Planning.

## Room 3

Difficulty:

High.

Focus:

Execution.

## Specimen Tutorial

Difficulty:

Low.

Focus:

Power fantasy.

## Boss

Difficulty:

Medium–High.

Focus:

Mastery and spectacle.

---

# 113. Important Design Rule

Level 3 should never become:

> constant slime-switching for no reason.

Every switch should have purpose.

Good example:

> Switch to Volt because machinery needs continuous power.

Bad example:

> Switch to Volt only to press an electrical button and immediately switch back.

Volt should often remain actively contributing after switching away.

---

# 114. Another Important Design Rule

Volt should not replace Goop.

Electrical systems must remain separate from soluble systems.

Likewise:

Goop should not replace Volt.

Bob should not replace either.

Room 2 and Room 3 should constantly reinforce:

> They are strongest together because none of them can do everything.

---

# 115. Specimen Design Rule

Specimen exists as the payoff for mastering the three individual slimes.

Therefore:

Every Specimen ability should clearly descend from an existing slime.

| Specimen Ability | Origin |
|---|---|
| Jumping | Bob |
| Charged Jump | Bob |
| Sticky Walls | Bob |
| Electric Acid | Goop + Volt |
| Charged Blast | Goop + Volt |
| Glow | Volt |
| Electrical Effects | Volt |
| Corrosive Damage | Goop |

Avoid adding unrelated abilities.

---

# 116. Boss Design Rule

Boss should test existing mechanics.

Boss should NOT introduce an entirely different game.

The fight should test:

- aiming;
- movement;
- jumping;
- wall traversal;
- dodging;
- normal attacks;
- charged attacks.

---

# 117. Suggested Implementation Order

Do NOT begin by building all four rooms.

Build systems first.

Recommended order:

## Stage 1 — Volt Core

Implement:

- Volt visuals;
- Volt light;
- Aim Mode;
- electrical raycast;
- target highlighting;
- beam;
- connection/disconnection;
- persistent connection;
- range;
- reset.

---

# 118. Stage 2 — Electrical Devices

Implement reusable components:

- ElectricalDevice base;
- PoweredLight;
- PoweredDoor;
- PoweredPlatform;
- PoweredLift;
- PoweredBridge;
- ElectricalTerminal.

Test in dedicated rig.

---

# 119. Stage 3 — Room 1

Build Volt tutorial.

Do not proceed until:

- connections are reliable;
- switching does not break them;
- reset works;
- lighting performs acceptably.

---

# 120. Stage 4 — Room 2

Build cooperation puzzles.

Playtest heavily for softlocks.

Verify all three slimes can always be recovered/reset.

---

# 121. Stage 5 — Room 3

Add:

- lasers;
- drones;
- advanced machinery;
- three-slime finale.

Reuse existing systems.

Avoid new backend architecture unless necessary.

---

# 122. Stage 6 — Specimen

Implement:

- merge state;
- Specimen visual;
- larger collider if necessary;
- movement;
- sticky ability;
- Aim Mode;
- electric-acid projectile;
- charged attack;
- projectiles;
- destruction reactions.

Test independently before boss.

---

# 123. Stage 7 — Boss Prototype

First build ugly greybox boss.

Requirements:

- state machine;
- one laser;
- one drone spawn;
- weak point;
- damage;
- phase change;
- defeat.

No art yet.

---

# 124. Stage 8 — Complete Boss

Add:

- Phase 2;
- Phase 3;
- shockwave;
- stronger drones;
- charged weak-point sequence.

Only after greybox boss is reliable.

---

# 125. Stage 9 — Presentation

Add:

- boss model;
- merge cinematic;
- lighting;
- particles;
- sound;
- boss music;
- cutscenes;
- environmental decoration.

---

# 126. Stage 10 — Optimisation

Profile:

- Room 1 powered lighting;
- Room 3 lasers;
- reactor chamber;
- Specimen particles;
- boss arena;
- drones;
- projectiles;
- shadow maps.

Target the weakest available computer.

---

# 127. Required Test Cases — Volt

Test:

- connect;
- disconnect;
- switch slime;
- connection remains;
- move Volt;
- exceed range;
- reset;
- death;
- reconnect;
- target destroyed/disabled;
- level restart;
- checkpoint respawn.

---

# 128. Required Test Cases — Specimen

Test:

- merge;
- movement;
- jump;
- charged jump;
- sticky wall;
- wall detach;
- Aim Mode;
- normal attack;
- charge cancel;
- full charge;
- projectile collision;
- drone destruction;
- boss weak point;
- death;
- boss restart.

---

# 129. Required Test Cases — Boss

Test every phase repeatedly.

Verify:

- no impossible attacks;
- no unavoidable damage;
- drones clean up;
- projectiles clean up;
- lasers clean up;
- restart works;
- checkpoints work;
- audio stops;
- boss cannot remain damaged after reset;
- weak point cannot be hit when closed;
- phase transitions occur only once;
- final cutscene triggers only once.

---

# 130. Performance Budget

Level 3 is likely to be the most expensive level.

Main risks:

- dynamic lighting;
- shadows;
- electrical particles;
- lasers;
- drones;
- Specimen effects;
- projectiles;
- boss geometry.

General rule:

> Make effects LOOK expensive without BEING expensive.

Prefer:

- emissive materials;
- shared textures;
- shared geometry;
- particle pooling;
- projectile pooling;
- limited dynamic lights;
- limited shadows.

---

# 131. Scope Priorities

If time becomes limited, preserve:

1. Volt.
2. Electrical connections.
3. Room 1.
4. Three-slime cooperation.
5. Specimen.
6. Boss core fight.
7. Ending.

Reduce before removing core systems:

- number of drones;
- decorative animations;
- secondary boss attacks;
- particle density;
- environmental props;
- advanced light effects.

---

# 132. Minimum Viable Boss

If schedule becomes dangerous:

Keep:

- giant boss;
- laser attack;
- drone attack;
- exposed weak point;
- normal attack;
- charged final attack;
- three phases.

Remove:

- complicated arena transformation;
- advanced AI;
- excessive drones;
- destructible arena;
- unnecessary boss limbs.

The boss can still feel impressive through presentation.

---

# 133. Level 3 Success Criteria

Level 3 is complete when:

- Volt feels clearly different from Bob and Goop.
- Electricity is understandable without constant tutorial text.
- Volt connections remain while switching.
- Light has gameplay value.
- Room 2 requires all three slimes.
- Room 3 tests all three under hazards.
- No puzzle can permanently softlock.
- Specimen clearly combines the three characters.
- Specimen feels powerful.
- Combat remains simple and readable.
- Boss attacks are fair and telegraphed.
- Boss fight uses movement as well as shooting.
- Final charged attack feels climactic.
- Level runs smoothly.
- Restart works without page refresh.
- Ending gives satisfying closure.

---

# 134. Final Player Experience

The intended emotional journey should be:

### Enter Level 3

> "This place is dangerous."

### Discover Volt

> "I can bring the facility back to life."

### Room 2

> "I need all three of them."

### Room 3

> "I understand how this team works."

### Merge

> "They became one."

### Specimen Tutorial

> "I am incredibly powerful now."

### Boss Appears

> "This is what everything has been building toward."

### Final Charged Shot

> "Everything Bob, Goop and Volt taught me is inside this attack."

### Exit Facility

> "We made it."

---

# 135. Final Design Summary

## Room 1 — Volt

> Learn electricity and persistent power connections.

## Room 2 — Cooperation

> Use Bob, Goop and Volt together to manipulate the environment.

## Room 3 — Mastery

> Coordinate all three while dealing with darkness, lasers, drones and complex machinery.

## Room 4A — Specimen

> Merge the three slimes and learn their combined abilities.

## Room 4B — Boss

> Use movement, electric acid and charged attacks to defeat the facility's final defence system.

## Ending

> Split back into Bob, Goop and Volt and escape into natural daylight.

---

# 136. One-Sentence Level Description for the Demonstration

> **Level 3 turns electricity and light into puzzle resources, requires all three slimes to cooperate, and concludes by combining their abilities into Specimen for a multi-phase boss encounter.**

---

# 137. Core Principle

The entire level should build toward one idea:

> **Bob, Goop and Volt are individually limited, but together they become something the facility can no longer contain.**