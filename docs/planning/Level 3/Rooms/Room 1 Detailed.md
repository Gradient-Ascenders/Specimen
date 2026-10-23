# Level 3 — Room 1: Blackout Maintenance Bay
## Detailed Level Design and Implementation Plan

---

## 1. Room Purpose

Room 1 is the player's formal introduction to **Volt** and establishes the core identity of Level 3:

> **Darkness is a gameplay obstacle, Volt's light is a resource, and Volt can interact with electrical technology that the other slimes cannot use.**

This room should primarily function as a tutorial rather than a difficult puzzle.

By the end of Room 1, the player should understand that:

1. Volt naturally produces light.
2. Volt can interact with electrical machinery.
3. Volt can use certain technological devices that Bob and Goop cannot.
4. Volt can mount and control a specialised maintenance drone.
5. The drone allows Volt to fly despite Volt normally having poor mobility.
6. Volt can still use his electrical beam while mounted.
7. Volt and the drone can be parked in place while the player switches to another slime.
8. Volt's light can be positioned to help Bob navigate through darkness.
9. Goop can traverse acid that blocks Bob and Volt.
10. Bob can cross difficult terrain using his superior jumping ability.
11. Volt can safely enter electrified infrastructure that is lethal to Bob and Goop.
12. Not every route is intended for every slime.

Room 1 should teach these concepts naturally through the environment rather than through excessive tutorial text.

---

# 2. High-Level Room Flow

The intended sequence is:

**All three slimes enter from a ceiling vent**

↓

**Player discovers that the room is almost completely dark**

↓

**Volt's natural glow becomes immediately useful**

↓

**Player notices a damaged maintenance drone because it is sparking**

↓

**Volt approaches the drone**

↓

**[M] MOUNT prompt appears**

↓

**Player learns how to fly the drone**

↓

**Goop crosses the acid floor directly**

↓

**Bob begins the platform route**

↓

**Volt flies beside Bob and positions the drone's downward light to reveal Bob's route**

↓

**Player repeatedly switches between Volt and Bob**

↓

**Bob reaches the opposite side**

↓

**Volt discovers the damaged wall circuit controlling the exit door**

↓

**Volt powers the circuit using his electrical ability while mounted**

↓

**The main door opens**

↓

**Bob and Goop move through the door into the Room 2 transition area**

↓

**Volt cannot follow because moving away from the powered circuit breaks the connection and closes the door**

↓

**Player notices the elevated maintenance vent**

↓

**Vent entrance visibly contains dangerous electrical arcs**

↓

**Volt flies the drone to the vent**

↓

**Drone physically cannot fit through the vent**

↓

**Volt lands the drone on the maintenance ledge**

↓

**Volt dismounts**

↓

**Volt enters the electrified vent alone**

↓

**Room 1 complete**

↓

**All three slimes arrive at Room 2 from different routes**

---

# 3. Room Identity

## Environment

Room 1 should feel like the player has entered a much more dangerous and restricted part of the facility.

Compared with the previous levels:

- lighting is mostly non-functional;
- the room is significantly darker;
- exposed electrical systems are common;
- large portions of the facility are damaged;
- acid has flooded most of the floor;
- industrial technology is scattered throughout the room;
- old maintenance equipment is damaged but still partially functional;
- sparks, warning lights and electrical arcs become important navigation cues.

The room should resemble an abandoned underground maintenance or power-transfer chamber.

This is not a clean laboratory.

It should feel like:

> **"This part of the facility was never meant to be accessed by the specimens."**

---

# 4. Lighting Philosophy

The room must be dark, but it should **not be completely black**.

There should be an extremely low ambient lighting floor so the player can still vaguely perceive:

- large walls;
- major structural silhouettes;
- the acid surface;
- the ceiling;
- nearby objects.

However, fine navigation details should be difficult or impossible to see without Volt.

The player should therefore feel uncomfortable moving through the environment without Volt without becoming completely blind.

## Important Rule

The room should never become fully illuminated.

Even when Volt activates electrical machinery, only individual pieces of technology should light up.

The room should remain fundamentally dark throughout.

This preserves the Level 3 atmosphere.

---

# 5. Suggested Room Layout

The exact dimensions can be adjusted during greyboxing, but the room should be significantly larger than a normal corridor or puzzle chamber.

Suggested approximate scale:

- Length: 28–35 metres
- Width: 18–24 metres
- Height: 10–14 metres

The room should feel large enough for meaningful drone flight without becoming difficult to navigate.

---

## 5.1 Major Spatial Zones

The room should contain five major zones:

### Zone A — Entry Platform

A safe elevated platform underneath the ceiling entrance vent.

Contains:

- all three slime spawn positions;
- the damaged maintenance drone;
- enough safe floor for the player to experiment;
- a view into the dark chamber;
- the beginning of Bob's platform route;
- visible acid surrounding the safe area.

---

### Zone B — Acid Chamber

The majority of the room.

Contains:

- acid covering most of the floor;
- Bob's elevated platform route;
- open airspace for Volt's drone;
- Goop's direct traversal route.

---

### Zone C — Midpoint Platform

A slightly larger safe platform approximately halfway through Bob's route.

Purpose:

- break Bob's route into manageable sections;
- give the player somewhere to stop;
- provide a potential Bob checkpoint;
- prevent one failed jump from requiring the entire room to be repeated.

---

### Zone D — Exit Platform

A large safe area on the opposite side.

Contains:

- Bob's final landing;
- Goop's acid exit;
- locked Room 2 door;
- damaged electrical circuit;
- electrical conduit running along the wall;
- drone manoeuvring space.

---

### Zone E — Elevated Maintenance Vent

Located above or beside the exit door.

Contains:

- electrified vent entrance;
- maintenance landing ledge;
- visible exposed cables;
- strong electrical warning effects;
- Volt's alternative route into Room 2.

---

# 6. Entry Sequence

The eventual Level 2 → Level 3 transition will be designed separately.

For now, Room 1 should begin with all three slimes entering through a ceiling vent.

They land on the safe starting platform.

The ceiling vent should remain above them so it is visually obvious where they came from.

The player should immediately notice that something has changed dramatically compared with Level 2.

The room is dark.

Most normal lights are:

- broken;
- flickering;
- hanging from the ceiling;
- sparking;
- completely dead.

Only weak emergency systems remain active.

---

# 7. Introducing Volt's Light

Volt should immediately stand out.

Volt provides:

- yellow ambient illumination;
- soft glow around nearby surfaces;
- electrical particles;
- occasional small electrical arcs;
- subtle emissive pulsing.

The starting platform should deliberately contain objects that demonstrate the difference between standing near Volt and standing away from Volt.

For example:

Without Volt nearby:

- platform edges are barely visible;
- wall details disappear;
- the damaged drone is only visible through its sparks.

With Volt nearby:

- warning stripes become visible;
- nearby machinery becomes readable;
- textures and geometry can be clearly recognised.

No tutorial text is necessary to explain this.

The environment should communicate it automatically.

---

# 8. Damaged Maintenance Drone

A broken maintenance drone sits near the starting platform.

This drone is the first major Room 1 interaction.

It should immediately look different from the security drones used previously.

---

## 8.1 Visual Design

The drone should look like maintenance equipment rather than a weapon.

Recommended visual language:

- rounder body;
- industrial shell;
- yellow electrical components;
- worn maintenance markings;
- exposed wiring;
- damaged outer panels;
- no weapon barrel;
- no laser emitter;
- no red hostile optics;
- several small yellow status lights.

The drone should occasionally:

- spark;
- twitch;
- attempt to start;
- briefly illuminate itself;
- produce broken electronic sounds.

These effects are intended to attract the player's attention.

---

# 9. Mounting the Drone

Only Volt can mount the maintenance drone.

When Volt enters interaction range:

> **[M] MOUNT**

should appear.

Bob and Goop should not receive the mount prompt.

Optionally, if they approach very closely, a small feedback message may appear:

> **ELECTRICAL INTERFACE REQUIRED**

This should only appear if necessary.

Environmental communication is preferable.

---

# 10. Drone Start-Up Sequence

The first time Volt mounts the drone:

1. Volt attaches to the top/control section of the drone.
2. Electrical energy flows from Volt into the drone.
3. Broken lights flicker.
4. Motors begin spinning.
5. The drone rises approximately 0.5–1 metre.
6. The underside light activates.
7. Electrical sparks stabilise slightly.
8. The drone enters player-controlled flight.

This sequence should be fast.

Approximately 1–2 seconds is enough.

It should feel satisfying without interrupting gameplay.

---

# 11. Drone Controls

While Volt is mounted:

| Input | Action |
|---|---|
| WASD | Horizontal drone movement |
| Space | Ascend |
| Shift | Descend |
| Mouse | Camera |
| M | Dismount |
| Right Mouse Button | Enter Volt aim mode |
| Existing Volt beam input | Fire electrical beam |

The drone should use simple movement.

Do **not** implement realistic aircraft physics.

The drone should remain upright.

Movement should feel closer to a floating platform than a helicopter.

Recommended behaviour:

- smooth acceleration;
- smooth braking;
- limited maximum speed;
- no complicated banking;
- no pitch-controlled movement;
- minor visual tilt while moving;
- slight hover animation.

The player should be able to understand the drone within seconds.

---

# 12. First-Time Drone Tutorial

On the first successful mount only, briefly show:

> **WASD — MOVE**  
> **SPACE — ASCEND**  
> **SHIFT — DESCEND**  
> **M — DISMOUNT**

The message should disappear after several seconds or once movement begins.

Do not repeatedly display it.

Aim-mode instructions can appear later when relevant.

---

# 13. Drone Lighting

The maintenance drone should emit a strong yellow light from its underside.

The visual reference should resemble a UFO beam.

The light points downward.

It should be much wider than the scanning cones used by previous security drones.

The drone light should illuminate approximately:

- Bob's current platform;
- the next platform;
- a small amount of surrounding space.

It should **not** illuminate the entire room.

---

## 13.1 Light Presentation

Recommended presentation:

- real spotlight for nearby illumination;
- emissive/translucent cone mesh for visible light volume;
- subtle dust particles inside the beam;
- yellow/amber colour;
- soft edge rather than a hard security-scanner edge.

The beam should visually communicate:

> **"This is a light source, not a weapon."**

The maintenance drone does not shoot lasers.

---

# 14. Drone Behaviour While Volt Is Inactive

This is critical to the room.

If Volt is mounted and the player switches to Bob or Goop:

- Volt remains mounted;
- the drone stops accepting movement input;
- the drone stays hovering at its current position;
- the drone does not drift;
- the downward light remains active;
- Volt's natural glow remains active.

This allows the player to position Volt's light and then switch to Bob.

Example:

1. Fly drone above Platform 3.
2. Switch to Bob.
3. Drone stays where it was parked.
4. Bob uses the light to see Platform 4.
5. Switch back to Volt.
6. Move drone farther forward.
7. Repeat.

This is the core gameplay interaction of Room 1.

---

# 15. Goop's Route

Goop should have the simplest route through Room 1.

Because Goop is resistant to acid, Goop can simply travel across the flooded floor.

This is intentional.

Room 1 is not supposed to teach Goop.

Goop's role is to demonstrate the contrast between the three slimes.

The player sees:

> Bob cannot touch the acid.

> Volt cannot touch the acid.

> Goop does not care about the acid.

This reinforces the complementary slime identities.

---

## 15.1 Goop Navigation

Goop's route should be mostly direct.

Avoid making Goop solve another complicated puzzle.

The far exit should be subtly visible through:

- sparks from the door circuit;
- weak emergency lighting;
- occasional reflections;
- distant facility indicators.

The acid may have a very faint surface shimmer but should not illuminate the room strongly.

---

# 16. Bob's Platform Route

Bob must cross the room without touching the acid.

A series of platforms should cross the acid chamber.

The route should require Bob's normal movement and jumping abilities.

However, it should **not** be an extremely difficult parkour sequence.

The challenge is meant to come from:

> **positioning the light and switching between Volt and Bob**

rather than extremely precise jumping.

---

# 17. Suggested Bob Platform Layout

Use approximately 6–9 major platforms.

Possible sequence:

### Platform 1

Close to the starting area.

Clearly visible even with the limited starting light.

Purpose:

Introduce the route.

---

### Platform 2

Slightly farther away.

Requires a normal Bob jump.

Volt's drone light should make the landing area clearer.

---

### Platform 3

Offset sideways.

This forces the player to move the drone rather than simply flying straight forward.

---

### Midpoint Platform

Larger than the others.

Acts as:

- rest area;
- orientation point;
- potential checkpoint.

---

### Platform 5

Slight height increase.

The drone needs to reposition vertically to illuminate it effectively.

---

### Platform 6

Partially obscured by machinery or structural supports.

Volt must move around the obstruction.

---

### Final Platforms

Lead toward the far exit platform.

Difficulty should increase slightly but remain forgiving.

---

# 18. Bob + Volt Cooperation Loop

The intended interaction becomes:

1. Position Volt's drone.
2. Illuminate the next section.
3. Switch to Bob.
4. Jump forward.
5. Reach the edge of visible space.
6. Switch back to Volt.
7. Reposition the drone.
8. Switch back to Bob.
9. Continue.

The player should gradually become comfortable with switching between the two.

Avoid requiring switching after every single jump.

Ideally, one drone position should reveal approximately two useful jumps.

This prevents the mechanic from becoming tedious.

---

# 19. Platform Readability

The platforms should not simply disappear completely in darkness.

The player should be able to perceive vague silhouettes.

Volt's light should reveal:

- actual platform edges;
- warning markings;
- depth;
- surface details;
- safe landing zones.

Recommended platform details:

- reflective warning strips;
- small maintenance numbers;
- worn metal surfaces;
- occasional broken indicator lights.

Volt's light makes these details readable.

---

# 20. Acid Hazard

Acid covers most of the floor.

Bob and Volt die if they enter it.

Goop is unaffected.

The acid should provide clear visual feedback:

- animated surface;
- corrosive particles;
- occasional bubbles;
- faint fumes;
- slight green/yellow reflection.

However, avoid making the acid so bright that it becomes the room's primary light source.

---

# 21. Drone and Acid

The drone should not become a permanent softlock if it falls into the acid.

If the drone enters the acid:

1. electrical systems short out;
2. sparks appear;
3. drone becomes unusable;
4. after a short delay it resets to its original maintenance location, or the relevant room checkpoint resets it.

The player must always be able to recover.

Do not allow the player to permanently lose the drone.

---

# 22. Dismount Behaviour

Pressing **M** while mounted dismounts Volt.

If the drone is flying:

- Volt is placed on top of the drone;
- the drone immediately loses powered flight;
- gravity affects it normally;
- the drone begins falling;
- Volt remains physically affected by the falling support.

This should preserve the previously agreed drone behaviour.

If the player dismounts over acid, this will likely cause Volt to fall into the acid.

That is acceptable because it was a deliberate player action.

The drone should then reset if necessary.

---

# 23. Preventing Drone Exploits

The drone exists specifically for Volt.

Bob and Goop should not be able to bypass the room by using it as a flying platform.

Recommended behaviour:

- only Volt receives the mount interaction;
- Bob and Goop should not be treated as drone riders;
- drone collision should not allow inactive Bob/Goop to simply stand on top and be transported across the room.

The intended cooperative mechanic must remain:

> Drone carries Volt.

> Volt carries the light.

> Bob follows the light.

---

# 24. Far-Side Exit Platform

Bob and Goop eventually reach a large safe platform on the opposite side of the acid chamber.

The main Room 2 door is located here.

The door is initially completely locked.

Nearby there should be a damaged electrical network.

This network becomes the player's next focus.

---

# 25. Wall Circuit Visual Language

A damaged electrical conduit should run along the wall.

It should be deliberately visible even in darkness.

Use:

- tiny yellow lights;
- occasional sparks;
- exposed cables;
- weak current pulses;
- broken junction boxes;
- small flashes moving through damaged wiring.

The conduit should lead visually toward the main door.

This teaches the player:

> **The circuit is connected to the door.**

No tutorial message should be required.

---

# 26. Electrical Receiver

The circuit terminates at an exposed electrical receiver or junction.

The receiver should look compatible with Volt.

Recommended cues:

- exposed conductive contacts;
- yellow electrical iconography;
- sparking socket;
- weak flashing indicator;
- wiring leading directly toward the door.

The player should naturally try Volt's electrical beam.

---

# 27. Powered Door Interaction

Volt should be able to activate the receiver while mounted on the drone.

This deliberately teaches:

> **Volt's beam still works while Volt is riding technology.**

Sequence:

1. Volt enters aim mode.
2. Volt targets the exposed circuit.
3. Volt fires electrical energy into it.
4. Circuit begins charging.
5. Electricity visibly travels along the wall conduit.
6. Dead lights along the conduit activate.
7. Door machinery comes alive.
8. Door opens.

---

# 28. Circuit Power Hold

The circuit should not simply permanently unlock the door.

Otherwise Volt could activate it and immediately follow Bob and Goop through.

Instead, powering the circuit establishes a **persistent electrical connection** between Volt and the receiver.

Once successfully connected:

- the electrical link remains active while Volt stays in the valid power position/range;
- Volt may be switched away from;
- the parked drone stays hovering;
- the electrical connection remains active;
- the door remains open.

This lets the player switch to Bob and Goop and move them through the doorway.

---

# 29. Circuit Feedback

While active:

- electrical arc/tether remains visible between Volt/drone and receiver;
- conduit lights remain illuminated;
- door motor remains powered;
- electrical humming becomes audible.

This visually explains why the door is open.

The player should understand:

> **Volt is currently holding the door open.**

---

# 30. Why Volt Cannot Follow Through the Door

The powered connection should have:

- limited range;
- required line of sight;
- a fixed receiver position.

If Volt moves toward the doorway:

1. the connection breaks;
2. conduit lights shut down;
3. door begins closing;
4. Volt cannot reach the opening before it closes.

The geometry should reinforce this.

The receiver can be positioned so that the door frame itself eventually blocks the beam/link if Volt attempts to move through.

The restriction should therefore feel physical rather than arbitrary.

---

# 31. Door Safety

The door should never crush the player.

If a slime is underneath the door when it begins closing:

- temporarily pause closing;
- reopen;
- or push the slime safely away.

Do not create unfair deaths here.

---

# 32. Bob and Goop Exit

With Volt powering the circuit:

### Goop

Moves through the main door.

### Bob

Moves through the main door.

They enter a small staging corridor rather than immediately loading Room 2.

This prevents complications with having two rooms active simultaneously.

---

# 33. Room 2 Transition Vestibule

Behind the main door should be a short safe chamber.

Bob and Goop wait here.

They should not encounter Room 2's actual puzzle yet.

The vestibule is still technically part of Room 1.

The next room only officially begins once Volt completes his route.

This simplifies:

- checkpoints;
- room loading;
- room state;
- camera behaviour;
- puzzle ownership.

---

# 34. Revealing Volt's Alternate Route

After Bob and Goop have crossed, the player switches back to Volt.

Volt moves away from the circuit.

The electrical connection breaks.

The main door closes.

The player is now clearly separated from Bob and Goop.

At this point the player's attention should naturally be drawn toward the elevated maintenance vent.

---

# 35. Maintenance Vent Placement

Place the vent high on the wall.

Recommended height:

Approximately 4–7 metres above the floor depending on final room scale.

It should be impossible for normal Volt movement to reach.

The drone is required.

This reinforces its purpose.

---

# 36. Vent Electrical Hazard

The entrance should immediately communicate that the vent is dangerous.

Use:

- exposed live cables;
- visible electrical arcs;
- flashing warning symbols;
- sparks;
- electrical crackling;
- scorch marks;
- broken insulation;
- cables crossing the entrance.

The player should understand that entering it as Bob or Goop is dangerous before actually testing it.

---

# 37. Bob and Goop Vent Behaviour

If Bob or Goop touches the electrified section:

- immediate electrical damage/death;
- clear electrical visual effect;
- strong sound feedback;
- respawn from checkpoint.

This should not be ambiguous.

The hazard is specifically designed to exclude them.

---

# 38. Volt Vent Behaviour

Volt is immune to the electrical hazard.

When Volt approaches:

- arcs may briefly react toward Volt;
- Volt's electrical particles may intensify;
- electricity can travel harmlessly across Volt's surface.

This makes the immunity visually satisfying.

Volt should not simply ignore the effect as though nothing happened.

---

# 39. Drone Cannot Enter the Vent

The vent must be physically too small for the maintenance drone.

Do not use an invisible "drone forbidden" trigger unless absolutely necessary.

The actual drone collider should physically collide with the vent frame.

The player should be able to see:

> Volt fits.

> Drone does not.

This makes dismounting an obvious solution.

---

# 40. Vent Landing Ledge

Place a small maintenance ledge directly beside or underneath the vent opening.

The ledge must be large enough for the player to safely land the drone.

Intended sequence:

1. Fly drone toward vent.
2. Attempting to enter shows that the drone is too large.
3. Move onto maintenance ledge.
4. Allow drone to settle physically onto the ledge.
5. Press **M**.
6. Volt dismounts safely.
7. Drone remains resting on the ledge.
8. Volt enters vent.

This avoids forcing the player to perform a difficult mid-air dismount.

---

# 41. Vent Interior

The vent should continue the electrical theme.

Inside:

- electrical cables;
- occasional arcs;
- damaged panels;
- narrow metallic tunnel;
- strong electrical ambience;
- yellow/blue electrical flashes.

Volt's natural light remains useful.

The vent does not need to contain another puzzle.

It is primarily a transition route.

Keep it relatively short.

---

# 42. Room Completion

Room 1 completes when:

- Bob is inside the transition vestibule;
- Goop is inside the transition vestibule;
- Volt reaches the vent exit / Room 2 arrival trigger.

Once all three conditions are true:

> **Room 1 complete.**

Room 2 can then initialise.

---

# 43. Room 2 Arrival Setup

The Room 1 design naturally creates different Room 2 entrances.

Bob and Goop arrive through:

> Main facility doorway.

Volt arrives through:

> Electrical maintenance vent.

This can be used when designing Room 2.

The three characters may begin Room 2 slightly separated before eventually regrouping.

---

# 44. Checkpoint Design

The room should be forgiving.

Recommended checkpoints:

### Checkpoint 1 — Room Start

Activated when the slimes land from the ceiling vent.

Restores:

- all three slimes;
- drone;
- door;
- circuit;
- room state.

---

### Checkpoint 2 — Bob Midpoint

Optional checkpoint on the large middle platform.

This prevents repeated frustration if Bob falls late in the sequence.

---

### Checkpoint 3 — Far Side

Once Bob and/or Goop safely reach the far staging platform, preserve their successful traversal where possible.

The player should not repeatedly redo completed sections because Volt made a mistake later.

---

# 45. Failure and Recovery

## Bob Falls Into Acid

Bob dies and respawns at the latest valid checkpoint.

Drone and other slime positions should remain sensible.

---

## Volt Falls Into Acid

Volt dies and respawns.

If the drone was lost at the same time, reset it.

---

## Goop Enters Acid

No failure.

---

## Drone Falls Into Acid

Drone shorts out and resets.

---

## Bob/Goop Enter Electrified Vent

They die and respawn.

---

## Player Dismounts Drone Over Acid

Volt likely falls and dies.

This is acceptable.

Recover through normal checkpoint behaviour.

---

## Door Closes Unexpectedly

Do not crush slimes.

Keep already-crossed Bob/Goop safe inside the transition vestibule.

---

# 46. Camera Behaviour

## Normal Drone Flight

Use third-person camera behaviour similar to standard slime movement.

The camera should:

- follow Volt/drone;
- stay stable;
- allow clear vertical visibility;
- avoid excessive bobbing;
- avoid clipping into ceilings.

---

## Vertical Movement

Slightly widen the camera framing during significant ascent/descent if necessary.

The player should always be able to judge:

- drone height;
- nearby platforms;
- acid surface.

---

## Aim Mode

Volt should retain the existing first-person electrical aim mode while mounted.

Entering aim mode should:

- preserve drone position;
- stop unintended drifting;
- allow accurate circuit targeting.

Leaving aim mode returns to normal third-person drone camera.

---

# 47. Audio Design

Room ambience should include:

- distant electrical humming;
- damaged ventilation;
- acid bubbling;
- occasional metal creaks;
- distant facility machinery;
- intermittent electrical arcs.

---

## Drone Audio

Drone should have:

- broken startup sound;
- electrical ignition sound;
- hover hum;
- motor pitch changing slightly with ascent/descent;
- subtle rattling from damaged parts;
- shutdown sound when dismounted.

---

## Circuit Audio

When charging:

- electrical build-up;
- rising hum;
- conduit activation sequence.

When active:

- stable power hum.

When disconnected:

- electrical snap;
- machinery shutdown;
- door closing motor.

---

## Vent Audio

Use:

- strong electrical crackling;
- sharp arc sounds;
- buzzing wires;
- metallic resonance.

The sound alone should warn the player that the vent is dangerous.

---

# 48. Visual Effects

Recommended Room 1 effects:

- Volt electrical particles;
- drone sparks;
- drone underside volumetric-style light cone;
- acid bubbles;
- acid fumes;
- electrical arcs;
- wall circuit sparks;
- conduit activation pulses;
- door machinery sparks;
- broken ceiling light flicker;
- subtle environmental dust.

Avoid excessive particle counts.

The darkness means small effects will already be visually noticeable.

---

# 49. Performance Considerations

Room 1 relies heavily on lighting, so performance needs to be considered from the beginning.

Recommended approach:

- keep ambient lighting extremely cheap;
- use limited dynamic lights;
- avoid making every broken lamp an actual Three.js light;
- use emissive materials for distant indicators;
- use particle sparks instead of additional point lights where possible;
- drone light should be the primary movable dynamic light;
- avoid expensive moving shadow maps unless performance testing proves they are affordable;
- represent the visible drone beam partly with geometry/material effects;
- pool spark particles;
- create no new materials/geometries every frame.

The room should still perform well on weaker lab hardware.

---

# 50. Greybox First

Do not begin with final art.

First build a greybox containing only:

- room shell;
- acid floor;
- entry platform;
- Bob platforms;
- midpoint platform;
- exit platform;
- main door;
- circuit location;
- vent location;
- maintenance ledge;
- temporary drone.

Verify the entire gameplay loop before adding visual detail.

---

# 51. Greybox Tuning Goals

During greyboxing confirm:

### Bob

- jumps are comfortable;
- platforms are readable when illuminated;
- route is not excessively difficult;
- switching frequency does not become annoying.

### Volt

- drone controls feel responsive;
- vertical movement is intuitive;
- light reveals enough information;
- parking the drone works correctly;
- switching away does not move the drone.

### Goop

- direct acid traversal is obvious;
- Goop reaches the exit quickly.

### Door

- circuit connection is understandable;
- Bob and Goop have enough time/space to pass;
- Volt cannot cheese the door.

### Vent

- clearly visible after the door sequence;
- drone genuinely cannot fit;
- landing is easy;
- electrical danger is obvious.

---

# 52. Important Softlock Tests

Explicitly test:

1. Drone dropped into acid.
2. Drone dropped underneath inaccessible geometry.
3. Volt dismounts while extremely high.
4. Volt dies while Bob is already across.
5. Bob dies while Volt is parked halfway across.
6. Goop reaches the exit before Bob.
7. Bob reaches the exit before Goop.
8. Volt reaches the door before either.
9. Bob attempts to ride the drone.
10. Goop attempts to ride the drone.
11. Player switches away from Volt while drone is moving.
12. Player switches away from Volt while drone is parked.
13. Player switches away while circuit is powered.
14. Volt attempts to move through the powered door.
15. Door attempts to close on Bob.
16. Door attempts to close on Goop.
17. Bob enters the electrified vent.
18. Goop enters the electrified vent.
19. Drone attempts to enter vent.
20. Volt enters vent without Bob/Goop being ready.

None of these states should permanently break progression.

---

# 53. Room Difficulty

Room 1 should be easy-to-moderate.

The player's mental workload is already high because they are learning:

- a new slime;
- darkness gameplay;
- a flying vehicle;
- vertical drone movement;
- light positioning;
- mounted electrical aiming;
- electrical hazards.

Therefore:

> Do not make Bob's platforming extremely difficult.

> Do not give Goop another complicated puzzle.

> Do not introduce hostile drones here.

> Do not introduce lasers here unless purely environmental.

> Do not introduce merge mechanics here.

Room 1's challenge should come from understanding Volt.

---

# 54. Intended Player Learning Sequence

At the beginning:

> "I can't see anything."

Then:

> "Volt lets me see."

Then:

> "Volt can power this broken drone."

Then:

> "Volt can fly using technology."

Then:

> "The drone's light can be positioned."

Then:

> "I can park Volt and switch to Bob."

Then:

> "Bob needs Volt's light."

Then:

> "Goop doesn't care about the acid."

Then:

> "Volt can still shoot electricity while flying."

Then:

> "Volt can power facility systems."

Then:

> "Volt has to stay behind to keep this door powered."

Then:

> "There must be another route for Volt."

Then:

> "That vent is electrified."

Then:

> "Electricity is dangerous to Bob and Goop, but useful to Volt."

Then:

> "The drone is too large."

Then:

> "Volt must continue alone."

That is the complete teaching arc of Room 1.

---

# 55. Environmental Storytelling

The room should suggest that the maintenance drone originally belonged to facility workers.

Possible environmental details:

- abandoned maintenance station;
- drone charging dock;
- tool cabinets;
- electrical warning signs;
- damaged power distribution equipment;
- broken walkway above acid;
- collapsed railing;
- maintenance identifiers on the drone;
- emergency evacuation lighting.

The player should feel as though Volt is hijacking old facility infrastructure rather than receiving a purpose-built gameplay vehicle.

---

# 56. Art Direction

Main colours:

- near-black environment;
- very dark steel;
- desaturated industrial surfaces;
- toxic green/yellow acid;
- yellow Volt lighting;
- yellow maintenance drone lighting;
- blue-white electrical arcs;
- occasional red warning indicators.

Volt's yellow light should become one of the strongest colours in the scene.

This makes the player instinctively associate:

> Yellow light = safety / visibility / Volt technology.

---

# 57. Non-Goals for Room 1

Do **not** add:

- enemy drone combat;
- drone weapons;
- security lasers as major hazards;
- complex Goop puzzles;
- difficult Bob parkour;
- merge mechanics;
- boss mechanics;
- multiple drone types;
- drone upgrades;
- battery management;
- fuel management;
- timed flight sections;
- complex electrical circuit puzzles;
- large numbers of moving machinery hazards.

Those ideas belong in later rooms if needed.

Room 1 must remain focused.

---

# 58. Room 1 Core Gameplay Pillars

Everything in Room 1 should support one of these four ideas:

### Pillar 1 — Darkness

The environment is dangerous because the player cannot properly see it.

### Pillar 2 — Light Positioning

Volt and the maintenance drone allow the player to choose where visibility exists.

### Pillar 3 — Technology

Volt can interact with systems that Bob and Goop cannot.

### Pillar 4 — Complementary Limitations

Each slime crosses the same room differently.

Goop:

> Acid.

Bob:

> Platforms.

Volt:

> Technology + flight.

---

# 59. Acceptance Criteria

Room 1 is complete when all of the following work:

- [ ] All three slimes start together.
- [ ] Room remains intentionally dark.
- [ ] Volt visibly illuminates nearby geometry.
- [ ] Damaged drone clearly attracts attention.
- [ ] Only Volt can mount drone.
- [ ] Drone responds to WASD.
- [ ] Space ascends.
- [ ] Shift descends.
- [ ] M dismounts.
- [ ] Drone remains upright and controllable.
- [ ] Drone emits downward yellow light.
- [ ] Drone cannot fire weapons.
- [ ] Volt can use electrical aim/beam while mounted.
- [ ] Drone remains hovering when switching away from Volt.
- [ ] Drone light remains active while Volt is inactive.
- [ ] Goop can safely cross acid.
- [ ] Bob dies in acid.
- [ ] Volt dies in acid.
- [ ] Bob has a complete platform route.
- [ ] Volt's light meaningfully improves platform visibility.
- [ ] Wall circuit is visible through subtle sparks/lights.
- [ ] Circuit clearly connects to main door.
- [ ] Volt can energise circuit.
- [ ] Circuit visibly activates.
- [ ] Door opens.
- [ ] Bob can pass through door.
- [ ] Goop can pass through door.
- [ ] Volt cannot simply follow them through.
- [ ] Vent entrance is visibly electrified.
- [ ] Bob dies when touching vent electricity.
- [ ] Goop dies when touching vent electricity.
- [ ] Volt survives vent electricity.
- [ ] Drone physically cannot fit through vent.
- [ ] Maintenance landing ledge exists.
- [ ] Volt can safely land and dismount.
- [ ] Volt can enter vent.
- [ ] Drone loss cannot permanently softlock the room.
- [ ] Door cannot crush a slime.
- [ ] Bob/Goop remain safe after crossing.
- [ ] Room only completes once all three characters have progressed.
- [ ] Transition into Room 2 is ready for future implementation.

---

# 60. Final Intended Experience

Room 1 should make the player feel that Level 3 has fundamentally changed the rules.

Previously the environment was something the player could normally see and navigate.

Now visibility itself becomes something that must be managed.

Volt is therefore not simply:

> **"The slime that shoots electricity."**

Volt becomes:

> **The slime that brings dead technology back to life.**

The maintenance drone demonstrates this immediately.

The player uses Volt to revive broken machinery, move light through the darkness, support Bob's traversal, open the facility's electrical systems and finally enter dangerous infrastructure that the other two slimes cannot survive.

By the time Room 1 ends, the player should completely understand Volt's individual role.

Room 2 and Room 3 can then stop teaching basic Volt mechanics and instead focus on increasingly complex cooperation between Bob, Goop and Volt.