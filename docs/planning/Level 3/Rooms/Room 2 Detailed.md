# Level 3 — Room 2: Powered Transit Gauntlet
## Detailed Level Design and Implementation Plan

---

# 1. Room Purpose

Room 2 is the first major **three-slime cooperation puzzle** of Level 3.

Room 1 taught the player how Volt works individually:

- Volt produces light.
- Volt can interact with electrical technology.
- Volt can operate specialised machinery.
- Volt can safely use electrical infrastructure.

Room 2 now asks:

> **How can Volt use electricity to help Bob and Goop, and how can Bob and Goop help Volt in return?**

The central identity of Room 2 is:

> **POWERED MOVEMENT**

Volt acts as the room's portable energy source.

Volt can:

- activate industrial lights;
- charge thruster-powered moving platforms;
- activate machinery;
- eventually secure the bridge that allows him to reunite with Bob and Goop.

Bob performs the main traversal challenge.

Goop manipulates the environment to protect Bob and Volt from security drones.

The room should repeatedly demonstrate:

> **Volt reveals and powers.**

> **Goop creates safety.**

> **Bob traverses.**

The final bridge sequence reverses the dependency so that Bob and Goop must help Volt.

---

# 2. Room Identity

Room 2 should feel like a large abandoned industrial transit chamber.

The facility originally used this chamber to move:

- equipment;
- maintenance platforms;
- machinery;
- personnel;
- heavy objects between different elevations.

The blackout has left most systems dead.

The only remaining illumination comes from:

- Volt;
- weak emergency indicators;
- security drone searchlights;
- lasers;
- electrical sparks;
- machinery powered by Volt;
- individual industrial lights that Volt reactivates.

The room should feel significantly larger and more mechanical than Room 1.

---

# 3. Core Gameplay Pillars

Room 2 should be designed around four major ideas.

## Pillar 1 — Volt Powers the Environment

Volt is not simply opening doors.

Volt directly causes the environment to move.

Examples:

- thruster platforms rise;
- industrial lighting activates;
- bridge locking systems engage;
- machinery comes back to life.

---

## Pillar 2 — Bob Traverses the Environment

Bob must cross the room through:

- normal jumps;
- sticky walls;
- moving platforms;
- lasers;
- drone-controlled danger zones.

The acid-covered floor prevents Bob from simply walking across.

---

## Pillar 3 — Goop Manipulates Sightlines

Goop protects Bob from stationary security drones.

Goop shoots the supports holding wooden cover panels above the room.

The covers fall into position and physically block drone vision.

This does NOT destroy the drone.

Instead:

> **Goop changes the environment around the drone.**

---

## Pillar 4 — Cooperation Works Both Ways

The first half of the room focuses heavily on helping Bob.

The final section reverses this.

Bob must hold a wall-mounted switch to deploy a bridge for Volt.

Goop must block a security drone watching that bridge.

Volt then crosses and permanently locks the bridge into place.

This ensures that Volt is not simply supporting Bob for the entire room.

---

# 4. High-Level Room Flow

The intended progression is:

**Bob and Goop enter together through the main Room 1 exit**

↓

**Volt enters separately through the electrical maintenance vent**

↓

**All three can see each other across parts of the chamber but cannot immediately regroup**

↓

**Player discovers that most of the floor is acid**

↓

**Goop moves freely through the lower acid-covered section**

↓

**Bob is forced onto an elevated parkour route**

↓

**Volt begins on a separated maintenance/service route**

↓

**First security drone blocks Bob's route**

↓

**Volt activates an overhead light bank**

↓

**Goop can now clearly see the wooden overhead cover and its support**

↓

**Goop shoots the support**

↓

**Cover drops and blocks the drone's vision**

↓

**Bob passes safely**

↓

**Second parkour section introduces a Volt-powered thruster platform**

↓

**Volt powers the platform**

↓

**Bob uses it to reach the next sticky wall**

↓

**Lasers are introduced alongside the powered platform traversal**

↓

**Another drone requires another Goop cover interaction**

↓

**Bob reaches the central sticky-wall switch**

↓

**Bob holds the switch**

↓

**A bridge deploys for Volt**

↓

**A security drone is watching the bridge**

↓

**Volt activates nearby lighting**

↓

**Goop locates and drops the corresponding cover**

↓

**Drone vision is blocked**

↓

**Volt crosses the bridge**

↓

**Volt powers the bridge locking system**

↓

**Bridge becomes permanently locked open**

↓

**Bob can leave the wall switch**

↓

**All three slimes progress toward the Room 3 transition**

↓

**Room 2 complete**

---

# 5. Suggested Room Scale

The room should feel large and vertically layered.

Suggested greybox dimensions:

- Length: approximately 35–45 metres
- Width: approximately 20–28 metres
- Height: approximately 12–18 metres

Exact dimensions should be tuned around Bob's movement.

The important requirement is that the player can visually understand that:

- Bob is above the acid;
- Goop is moving below;
- Volt is operating machinery from another level/side;
- the three routes are separate but interconnected.

---

# 6. Room Vertical Structure

A useful conceptual layout is:

                UPPER STRUCTURE
        Drone positions / hanging covers
                    |
                    |
            BOB PARKOUR ROUTE
    sticky walls / platforms / lasers
                    |
                    |
       VOLT SERVICE ROUTE / CATWALKS
     light controls / power receivers
                    |
                    |
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ACID FLOOR
               GOOP ROUTE
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The characters should regularly be able to see each other.

The room must feel like one shared puzzle rather than three separate rooms.

---

# 7. Entry Setup

## Bob and Goop

Bob and Goop enter from the normal Room 1 doorway.

They arrive on a safe entrance platform.

Immediately beyond the platform:

> **the entire floor is acid.**

Goop can enter safely.

Bob cannot.

Bob's only route forward is the elevated parkour path.

---

## Volt

Volt exits Room 1 through the electrified maintenance vent.

His vent exits somewhere separated from Bob and Goop.

Recommended position:

- slightly higher than Bob/Goop;
- along one side wall;
- on a narrow maintenance catwalk;
- close to the first electrical light receiver.

Volt should be able to see Bob and Goop below.

However, Volt cannot simply walk to them.

The room geometry should make it obvious that he has a separate route.

---

# 8. Initial Environmental Read

When Room 2 begins:

- most industrial lights are dead;
- acid is faintly visible;
- security drone cones are visible in the darkness;
- lasers remain clearly emissive;
- several weak electrical indicators can be seen;
- Volt provides local illumination.

The player should be able to recognise the room's major shape without being able to clearly see every gameplay object.

This preserves the Level 3 blackout identity.

---

# 9. Security Drones

Room 2 reuses flying security drones.

However, their behaviour is intentionally simplified.

They should:

- hover in fixed positions;
- face one predetermined direction;
- not patrol;
- not rotate back and forth;
- not chase the player;
- not move toward Bob;
- maintain their existing security/detection behaviour.

The Room 2 variation is therefore:

> **Stationary surveillance drones.**

The challenge is understanding and blocking their line of sight.

---

# 10. Drone Searchlight

Each drone emits a clearly visible searchlight/ray into the darkness.

The cone should communicate:

> **This area is being watched.**

Recommended appearance:

- pale white / blue-white beam;
- narrow enough to communicate direction;
- visible volumetric-style cone mesh;
- brighter near the drone;
- soft edge;
- subtle particles/dust inside the beam.

The cone should remain visible even when surrounding lights are off.

This makes security drones readable in the darkness.

---

# 11. Drone Detection Behaviour

Do not introduce new combat AI for Room 2.

Reuse the existing drone hazard/detection consequence already used elsewhere in the game.

Room 2 only changes:

- drone movement;
- drone orientation;
- environmental counterplay.

The drone should remain dangerous whenever Bob or Volt is visible inside its viewing area.

---

# 12. Drone Line-of-Sight Requirement

Drone detection must respect physical occlusion.

If a dropped cover exists between the drone and the slime:

> the drone must no longer detect the slime.

Do not merely hide the visual searchlight.

The gameplay detection ray/check must also be blocked by the cover.

---

# 13. Wooden Cover Mechanic

Above each important drone sightline is a large wooden cover panel.

Initially the cover is stored close to the ceiling.

The panel is held in place by:

- wooden restraints;
- wooden support beams;
- soluble braces;
- or another clearly Goop-compatible support.

Goop can shoot the support with acid.

The support dissolves/breaks.

The cover then:

- falls;
- swings;
- rotates;
- or drops down its guide.

It eventually settles between the drone and the protected route.

---

# 14. Cover Behaviour

The cover should NOT disappear when Goop shoots it.

The intended interaction is:

> Goop releases the cover.

Not:

> Goop destroys the cover.

Recommended setup:

1. Large wooden panel is hinged or attached to a ceiling rail.
2. One or two small soluble supports hold it horizontally.
3. Goop shoots the support.
4. Support dissolves.
5. Gravity causes the panel to swing downward.
6. Panel reaches an authored stopping position.
7. Panel becomes the permanent sight blocker.

This gives the interaction physical weight.

---

# 15. Cover Visual Feedback

When the panel drops:

- loud wooden crack;
- chain rattle;
- large impact sound;
- dust particles;
- slight screen/camera shake if appropriate;
- searchlight visibly cuts against the new obstruction.

The drone remains behind it.

The player should be able to see the drone's searchlight spilling around the edges of the cover.

This makes it obvious that:

> **The drone is still active. It simply cannot see through the obstruction.**

---

# 16. One Cover Per Drone

Each major drone should have one clearly associated cover.

Avoid situations where the player cannot determine which panel belongs to which drone.

Recommended visual alignment:

Drone
↓
Searchlight
↓
Bob route

Cover
↑
directly above/intersecting intended sightline

The relationship should become obvious once the lights are turned on.

---

# 17. Volt-Controlled Light Banks

Goop should not initially be able to clearly see all the ceiling covers.

Volt must activate industrial lighting.

Each major room section should have a local light bank.

Volt finds an electrical receiver.

Volt powers it.

The light bank turns on.

---

# 18. Light Activation Sequence

When Volt activates a light receiver:

1. Receiver begins sparking.
2. Electrical pulse travels through conduit.
3. Large overhead lamp flickers.
4. Lamp attempts to start several times.
5. Lamp stabilises.
6. Nearby geometry becomes visible.

This should take approximately 1–2 seconds.

---

# 19. Light Persistence

Once an industrial light bank has been fully charged:

> **it stays active permanently.**

Volt should NOT need to maintain continuous power for lighting.

This avoids repetitive switching.

The mechanical rule becomes:

### Lights

**Charge once → stay on.**

### Moving machinery

**Power required → movement continues only while energy is being supplied / stored charge remains.**

This distinction should remain consistent.

---

# 20. What the Lights Reveal

Activating a light should reveal useful gameplay information.

Examples:

- wooden cover support;
- ceiling structure;
- Bob's next sticky wall;
- platform machinery;
- laser emitter;
- drone body;
- wall markings;
- electrical receiver.

The player should feel:

> **Volt revealed the solution.**

---

# 21. Goop's Route

Goop travels primarily through the acid-covered lower floor.

This should be relatively straightforward.

Goop's challenge is not parkour.

Goop's challenge is:

- reaching useful firing positions;
- identifying the correct overhead supports;
- helping Bob;
- helping Volt later.

Large machinery should occasionally interrupt direct sightlines so Goop has to reposition.

However:

> Do not make Goop's movement tedious.

Goop should be able to move around the lower chamber efficiently.

---

# 22. Bob's Route

Bob receives the main traversal challenge.

The parkour should use already-established Bob mechanics:

- normal jumps;
- charged jumps where appropriate;
- sticky walls;
- wall traversal;
- moving platforms;
- lasers.

Room 2 should NOT introduce another new Bob movement ability.

The novelty comes from the environment being controlled by Volt and Goop.

---

# 23. Bob Parkour Difficulty

The route should be moderate rather than extremely difficult.

Bob is already dealing with:

- darkness;
- drone line-of-sight;
- lasers;
- moving machinery;
- switching between three characters.

Therefore precision requirements should remain forgiving.

The difficulty should come from:

> **understanding the cooperation sequence**

rather than tiny landing areas.

---

# 24. Parkour Section 1 — Drone Cover Tutorial

The first parkour section should be simple.

Layout:

Entrance Platform

↓

Short Bob jump

↓

Sticky wall

↓

Landing platform

↓

Drone watching next section

The drone is clearly visible because of its searchlight.

Bob cannot safely progress.

---

# 25. Section 1 Cooperation Sequence

The intended sequence is:

1. Player sees drone watching Bob's route.
2. Switch to Volt.
3. Volt notices nearby electrical receiver.
4. Volt powers receiver.
5. Light Bank A activates.
6. Ceiling becomes visible.
7. Player notices suspended wooden cover.
8. Switch to Goop.
9. Goop positions underneath.
10. Goop aims upward.
11. Goop shoots soluble wooden support.
12. Cover falls.
13. Cover blocks drone searchlight.
14. Switch to Bob.
15. Bob continues safely.

This teaches the full Room 2 cooperation language with very little danger.

---

# 26. Powered Thruster Platforms

The next major mechanic is a Volt-powered moving platform.

The platform should look heavy and industrial.

Recommended design:

- thick metal platform;
- exposed machinery;
- downward-facing thrusters;
- yellow electrical receiver;
- worn industrial markings;
- visible power indicator;
- inactive thrusters when unpowered.

---

# 27. Thruster Platform Behaviour

Volt powers the platform by directing electrical energy into its receiver.

While receiving power:

- energy indicator fills;
- thrusters ignite;
- platform rises.

When Volt stops supplying electricity:

- thrusters lose intensity;
- platform begins descending;
- platform eventually returns to its authored resting position.

The movement must be smooth and predictable.

---

# 28. Platform Power Model

Because the game is single-player and requires character switching, the platform must allow enough time for:

1. Volt to power it.
2. Player to switch to Bob.
3. Bob to use it.

Recommended behaviour:

- Volt's electricity rapidly charges the platform.
- While powered, the platform rises.
- When Volt stops powering it, the platform begins descending slowly rather than instantly dropping.
- A short residual-energy/grace period may be used if required during tuning.

The player should feel urgency without fighting the character-switch system.

---

# 29. Platform Visual Power Indicator

Avoid relying entirely on HUD UI.

The platform itself should communicate charge.

Possible visual language:

    [■□□□]
    [■■□□]
    [■■■□]
    [■■■■]

Use emissive segments or lights on the receiver.

Thruster intensity should also correspond to power.

---

# 30. Parkour Section 2 — Powered Movement

Suggested sequence:

Bob reaches a safe platform.

↓

Next platform is too high.

↓

Volt has line of sight to the thruster platform receiver.

↓

Goop has access to the lower chamber.

↓

Security drone watches part of the route.

↓

Volt activates Light Bank B.

↓

Goop can see Cover B.

↓

Goop drops Cover B.

↓

Bob moves onto the powered platform.

↓

Switch to Volt.

↓

Volt charges/powers platform.

↓

Thrusters ignite.

↓

Platform rises.

↓

Switch to Bob.

↓

Bob jumps from elevated platform onto sticky wall.

↓

Bob climbs.

↓

Laser obstacle follows.

This is the first proper combination of:

- Volt power;
- Goop protection;
- Bob traversal.

---

# 31. Sticky Walls

Sticky walls should remain visually recognisable even in reduced lighting.

Recommended readability:

- familiar sticky material;
- subtle reflective highlights;
- strong response when illuminated;
- clearly different roughness/texture from surrounding wall.

Volt's lights should make them much easier to identify.

---

# 32. Laser Integration

Lasers should appear during the Bob route.

Do not make the lasers dependent on Volt.

They are already an established hazard and should function normally.

Their purpose is to add timing/traversal difficulty while Volt and Goop manage the larger room systems.

---

# 33. Laser Visibility

Lasers must remain readable in the darkness.

Use:

- emissive beam;
- visible emitter;
- subtle bloom if already available;
- small illumination around impact points.

The player should never die because a laser was completely invisible.

---

# 34. Laser Placement

Avoid stacking every hazard simultaneously.

Good sequence:

Sticky wall

↓

small laser timing obstacle

↓

safe platform

↓

powered platform

↓

drone sightline

Rather than:

> drone + moving platform + three lasers + difficult jump all at once.

Complexity should escalate gradually.

---

# 35. Parkour Section 3 — Combined Challenge

The third section combines the learned ideas.

Potential structure:

1. Bob climbs sticky wall.
2. Small laser forces timing.
3. Bob lands on platform.
4. Drone controls next sightline.
5. Volt activates Light Bank C.
6. Goop drops appropriate cover.
7. Bob crosses.
8. Bob reaches central wall-mounted pressure switch.

This leads directly into the room's major cooperative set-piece.

---

# 36. Bob's Wall-Mounted Button

Bob eventually reaches a sticky wall near the middle/late section of the room.

Attached to this wall is a large physical pressure switch.

The switch should be positioned so Bob can:

- stick to the wall;
- physically press against it;
- remain attached while inactive.

The switch should clearly connect to the bridge mechanism.

---

# 37. Why Bob Is Needed

The button should be inaccessible or impractical for Volt and Goop.

The intended interaction is specifically:

> **Bob uses his adhesion to hold the wall switch.**

This turns Bob's sticky ability into part of the cooperative puzzle rather than only movement.

---

# 38. Wall Button Behaviour

When Bob presses the switch:

1. Button depresses.
2. Mechanical connection activates.
3. Warning lights flicker.
4. Large bridge mechanism unlocks.
5. Bridge begins extending.
6. Bridge reaches Volt's separated route.

The bridge remains deployed only while:

> Bob continues holding the switch.

---

# 39. Inactive Bob Behaviour

If the player switches away from Bob while he is correctly positioned on the button:

- Bob remains attached;
- Bob keeps pressing the button;
- bridge remains extended.

This follows the established inactive-slime behaviour.

---

# 40. Volt Bridge

The bridge connects Volt's isolated service route to the far side of the room.

Before deployment:

> Volt cannot progress.

Once Bob activates the wall switch:

> Volt finally has a path toward Bob and Goop.

However, the bridge should not immediately be safe.

---

# 41. Bridge Security Drone

A stationary security drone watches directly across the bridge.

Its searchlight clearly covers Volt's crossing route.

This drone should be visible before Volt attempts to cross.

The player understands:

> Bob opened the bridge, but Volt still cannot safely use it.

This creates Goop's opportunity to help Volt.

---

# 42. Bridge Cover

A wooden cover is suspended above the bridge/drone sightline.

However, because the chamber is dark, Goop should not initially be able to clearly identify the correct support.

Volt must first activate the nearby lighting.

Sequence:

1. Bob holds wall button.
2. Bridge deploys.
3. Switch to Volt.
4. Volt activates bridge-area light bank.
5. Searchlight / ceiling structure becomes clearer.
6. Switch to Goop.
7. Goop identifies overhead cover.
8. Goop shoots support.
9. Cover drops.
10. Drone vision becomes blocked.
11. Volt can now cross.

This is the room's clearest demonstration of:

> **Bob helps Volt.**

> **Goop helps Volt.**

---

# 43. Volt Crosses

With:

- Bob holding the bridge;
- Goop blocking the drone;

Volt crosses safely.

This should feel significant because Volt has been physically separated since Room 1.

Volt reaches the far side for the first time.

---

# 44. Bridge Locking Receiver

Once Volt crosses, he finds an electrical bridge-lock receiver.

Volt powers it.

Sequence:

1. Volt fires electricity into receiver.
2. Mechanical locks engage.
3. Bridge rails clamp into place.
4. Green/yellow indicator changes to stable powered state.
5. Bridge becomes permanently deployed.

Now the bridge no longer depends on Bob holding the wall switch.

---

# 45. Bob Releases the Button

Once Volt locks the bridge:

- Bob can leave the switch;
- button returns to idle;
- bridge remains deployed;
- Bob continues his route.

This completes the cooperation loop:

**Bob deploys bridge**

↓

**Goop makes bridge safe**

↓

**Volt crosses**

↓

**Volt locks bridge**

↓

**Bob becomes free to continue**

---

# 46. Why This Sequence Matters

Up to this point, much of Room 2 has been:

> Volt + Goop helping Bob.

The bridge sequence reverses the dependency.

Bob and Goop now help Volt.

This prevents the room from feeling like:

> "Bob is the real player while Volt and Goop are support characters."

All three directly enable progression.

---

# 47. Final Regroup

After the bridge sequence:

Volt is now on the same general side as Bob and Goop.

The remaining traversal should be comparatively short.

Do not add another major mechanic.

Allow the player to enjoy the fact that the group has reunited.

Possible final route:

- Bob finishes one final sticky-wall jump.
- Goop leaves the acid floor via a safe ramp.
- Volt follows the newly locked bridge.
- all three reach the Room 3 transition area.

---

# 48. Room Completion Condition

Room 2 completes when:

- Bob reaches the final safe area;
- Goop reaches the final safe area;
- Volt reaches the final safe area.

Once all three are present:

> activate the Room 3 transition.

Do not begin Room 3 while one slime is still stranded behind.

---

# 49. Suggested Drone Count

Recommended starting target:

### Drone 1

First Bob tutorial sightline.

Purpose:

Teach Volt light → Goop cover → Bob traversal.

### Drone 2

Mid-room Bob parkour.

Purpose:

Combine cover mechanic with moving platform / lasers.

### Drone 3

Volt bridge.

Purpose:

Goop protects Volt instead of Bob.

Three drones should be enough.

Add more only if playtesting shows the room needs them.

---

# 50. Suggested Light Bank Count

Recommended:

### Light Bank A

Reveals first cover.

### Light Bank B

Reveals powered-platform section.

### Light Bank C

Reveals final bridge cover / machinery.

Three clear lighting zones should be sufficient.

---

# 51. Suggested Powered Platform Count

Use approximately 2 powered platform interactions.

### Platform 1

Simple vertical lift.

Purpose:

Teach the mechanic.

### Platform 2

More integrated with sticky-wall traversal.

Purpose:

Test the mechanic.

Do not fill the entire room with powered platforms.

They should remain memorable.

---

# 52. Character Responsibilities

## Bob

Responsible for:

- elevated traversal;
- sticky walls;
- jumps;
- lasers;
- moving platform usage;
- wall-mounted bridge button.

Bob's role:

> **Traversal and physical positioning.**

---

## Goop

Responsible for:

- moving freely through acid;
- locating useful firing positions;
- destroying/releasing wooden cover supports;
- protecting Bob from drones;
- protecting Volt during the bridge sequence.

Goop's role:

> **Environmental manipulation and protection.**

---

## Volt

Responsible for:

- providing local light;
- activating industrial light banks;
- charging thruster platforms;
- bringing machinery back online;
- eventually locking the bridge.

Volt's role:

> **Power and machinery.**

---

# 53. Darkness Rules

The room must remain dark even after lights are activated.

Light banks should illuminate local areas only.

For example:

Light Bank A activates:

> Section A becomes readable.

Section B remains dark.

This preserves the blackout theme.

By the end of the room, several islands of illumination exist rather than the entire room becoming bright.

---

# 54. Visual Progression

At room start:

> Almost everything is dark.

As the player progresses:

- Light Bank A comes alive.
- One piece of machinery activates.
- Light Bank B comes alive.
- Thruster flames illuminate the environment.
- Cover panels change the room silhouette.
- Bridge extends.
- Light Bank C activates.
- More machinery comes alive.

The room should visually reflect player progress.

---

# 55. Powered Machinery Presentation

When Volt powers machinery:

- conduits illuminate;
- indicator lights activate;
- motors begin moving;
- thrusters ignite;
- sparks appear;
- dust gets pushed by exhaust;
- nearby geometry briefly becomes visible.

Volt should feel like he is **waking up dead machinery**.

---

# 56. Thruster Presentation

Thrusters should use:

- bright exhaust;
- short particle trail;
- heat distortion if already supported cheaply;
- mechanical rumble;
- increasing pitch while rising.

The thruster glow becomes an additional temporary light source.

However:

> avoid using large expensive shadow-casting lights for every thruster.

Visual meshes/emissive materials can create most of the effect.

---

# 57. Audio Design

Room ambience:

- distant machinery;
- acid bubbling;
- failing ventilation;
- electrical hum;
- occasional sparks;
- distant metal impacts.

---

## Drone Audio

Stationary drones should emit:

- quiet hover hum;
- electronic scanning noise;
- subtle warning tone when detection becomes relevant.

Their sound helps indicate danger in darkness.

---

## Cover Audio

When Goop releases a cover:

- wood cracking;
- metal chain movement;
- heavy panel swing;
- loud impact.

The cover should sound heavy.

---

## Light Activation Audio

Sequence:

- electrical charge;
- fluorescent/industrial flicker;
- transformer hum;
- stable lamp buzz.

---

## Platform Audio

Sequence:

- electrical charge;
- motor startup;
- thruster ignition;
- machinery strain;
- descending mechanical whine when power stops.

---

## Bridge Audio

Sequence:

- button impact;
- lock disengagement;
- heavy bridge extension;
- metal grinding;
- Volt lock activation;
- final heavy mechanical clamp.

The bridge should sound significant.

---

# 58. Camera Considerations

Bob's parkour camera must maintain visibility of:

- current platform;
- next platform;
- drone searchlights;
- lasers.

Avoid camera positions where ceiling covers completely obscure Bob.

---

## Goop Aiming

When Goop needs to shoot ceiling supports:

- camera should allow comfortable upward aiming;
- supports should not sit at extreme vertical angles;
- room geometry should not constantly block aim mode.

The intended target should be visually obvious once Volt activates the light.

---

## Volt

Volt's separated route should allow clear views of:

- light receivers;
- powered platforms;
- Bob's position;
- final bridge.

This supports the feeling that Volt is operating the room.

---

# 59. Checkpoints

Recommended checkpoint structure:

## Checkpoint 1 — Room Entry

Activated immediately.

Restores:

- Bob;
- Goop;
- Volt;
- drones;
- covers;
- lights;
- platforms;
- bridge.

---

## Checkpoint 2 — After First Cooperation Tutorial

Once Bob passes Drone 1.

This avoids repeatedly replaying the tutorial.

---

## Checkpoint 3 — Before Final Bridge Sequence

Once Bob reaches the wall-button section.

This protects the player from repeating most of the parkour because of a late mistake.

---

# 60. Persistent Puzzle State

Within a checkpoint segment:

Dropped covers should remain dropped.

Activated lights should remain activated.

If Bob dies:

> Do not unnecessarily reset Goop's successful cover interaction unless the checkpoint system requires the entire puzzle group reset.

The room should respect completed progress where practical.

---

# 61. Failure and Recovery

## Bob Falls Into Acid

Bob fails and returns to latest checkpoint.

---

## Volt Falls Into Acid

Volt fails and returns to his latest valid position/checkpoint.

---

## Goop Enters Acid

No failure.

---

## Bob Is Detected By Drone

Use the existing drone hazard response.

---

## Volt Is Detected On Bridge

Use the existing drone hazard response.

---

## Bob Touches Laser

Use existing laser failure behaviour.

---

## Moving Platform Descends

Bob should fall naturally if he fails to jump in time.

Avoid instant crushing behaviour.

---

# 62. Bridge Safety

The bridge must not create permanent softlocks.

If Bob releases the button while Volt is crossing:

- bridge should retract with a short readable delay rather than instantly disappearing.

Possible delay:

approximately 0.5–1 second.

This gives the player feedback without making the mechanic trivial.

---

# 63. Cover Safety

A dropped cover should never:

- crush Bob;
- crush Goop;
- crush Volt;
- block the only required traversal path;
- permanently trap a slime.

Use authored final positions.

Do not rely on uncontrolled rigid-body physics.

---

# 64. Moving Platform Implementation

Moving platforms should use authored paths.

Do not use unrestricted physics simulation.

Recommended states:

- `RESTING`
- `CHARGING`
- `RISING`
- `POWERED`
- `DESCENDING`

The platform should know:

- minimum height;
- maximum height;
- current charge;
- rise speed;
- fall/return speed.

---

# 65. Light Bank Implementation

Suggested states:

- `OFF`
- `CHARGING`
- `ACTIVE`

Once `ACTIVE`:

> remain active until checkpoint/reset.

This keeps the puzzle readable.

---

# 66. Cover Implementation

Suggested states:

- `STOWED`
- `RELEASING`
- `DEPLOYED`

Once `DEPLOYED`:

- panel becomes stable;
- drone LOS recognises it as an occluder;
- panel no longer moves.

---

# 67. Bridge Implementation

Suggested states:

- `RETRACTED`
- `EXTENDING`
- `HELD_OPEN`
- `RETRACTING`
- `LOCKED_OPEN`

Bob's switch controls:

`RETRACTED ↔ HELD_OPEN`

Volt's final receiver changes:

`HELD_OPEN → LOCKED_OPEN`

Once `LOCKED_OPEN`:

> bridge stays deployed permanently.

---

# 68. Drone Implementation

Room 2 drones can reuse the existing drone system with configuration changes.

Recommended Room 2 configuration:

- movement disabled;
- patrol disabled;
- yaw sweep disabled;
- pitch sweep disabled;
- fixed authored orientation;
- existing LOS/detection retained;
- searchlight retained;
- cover objects added to LOS obstruction layer.

This avoids unnecessary new AI complexity.

---

# 69. Softlock Test Cases

Explicitly test all of the following:

1. Bob falls before Goop releases first cover.
2. Bob falls after cover has been released.
3. Goop reaches far side before Bob.
4. Volt activates lights before Goop reaches the relevant area.
5. Goop shoots covers before Bob arrives.
6. Goop attempts to shoot the wrong panel.
7. Bob enters drone sightline before cover drops.
8. Bob stands on powered platform before Volt charges it.
9. Volt stops powering platform immediately.
10. Bob switches while platform is moving.
11. Bob rides platform to maximum height.
12. Bob falls off moving platform.
13. Bob presses wall button before Goop is ready.
14. Bob presses wall button before Volt is ready.
15. Player switches away from Bob while button is held.
16. Bridge remains correctly open while Bob is inactive.
17. Goop drops bridge cover before Volt crosses.
18. Volt attempts bridge crossing without cover.
19. Bob releases button while Volt is crossing.
20. Volt reaches far side but does not lock bridge.
21. Volt locks bridge.
22. Bob releases button after bridge is locked.
23. Bridge remains open.
24. Bob dies after bridge is locked.
25. Goop dies/resets after bridge is locked.
26. Volt dies after crossing.
27. All three reach exit in different orders.

No sequence should permanently prevent completion.

---

# 70. Difficulty Curve

Room 2 should progress like this:

### Beginning

Easy.

Learn:

> light → cover → Bob passes drone.

### Middle

Moderate.

Combine:

> light + cover + moving platform + sticky wall + laser.

### End

Cooperative puzzle.

Combine:

> Bob button + Goop cover + Volt bridge crossing + Volt lock.

The final challenge should be about coordination, not precision.

---

# 71. Switching Frequency

Avoid forcing the player to switch characters every few seconds.

Bad:

Volt

↓

Goop

↓

Bob

↓

Volt

↓

Goop

↓

Bob

every single jump.

Better:

Volt activates the area's light.

↓

Goop prepares the cover.

↓

Bob completes several traversal actions.

↓

Volt handles the next machine.

Group actions into meaningful chunks.

---

# 72. Room Pacing

Recommended rhythm:

### Observation

Player sees obstacle.

### Understanding

Player identifies which slime can affect it.

### Preparation

Volt/Goop change the environment.

### Execution

Bob traverses.

### Reward

Player reaches a new area and sees more of the chamber.

Repeat with increased complexity.

---

# 73. Environmental Storytelling

The room should feel like a genuine facility logistics chamber.

Possible props:

- heavy cargo rails;
- broken industrial lift systems;
- maintenance signs;
- numbered transport sectors;
- abandoned crates;
- broken catwalks;
- power conduits;
- rusted mechanical arms;
- warning markings;
- damaged safety barriers;
- emergency lights;
- drone charging brackets;
- suspended maintenance panels.

The gameplay objects should look like repurposed facility infrastructure rather than arbitrary puzzle devices.

---

# 74. Art Direction

Main palette:

- near-black environment;
- dark steel;
- rusted industrial surfaces;
- poisonous green/yellow acid;
- Volt yellow;
- orange thruster exhaust;
- blue-white drone searchlights;
- red laser beams;
- weak amber emergency indicators.

The room should use colour to separate information.

### Yellow

Volt / power / machinery.

### White-blue

Security surveillance.

### Red

Laser hazard.

### Green/yellow

Acid / Goop environment.

---

# 75. Performance Considerations

Room 2 contains many visually bright objects, but most should not be real dynamic lights.

Recommended:

- drone cones use emissive transparent geometry;
- lasers use emissive materials;
- distant indicators use emissive textures/materials;
- only important local lamps use real lights;
- limit shadow-casting lights;
- thruster glow can mostly be emissive + particles;
- reuse drone geometry/materials;
- reuse cover geometry where possible;
- pool sparks/particles;
- create nothing per frame.

The room should remain performant on weaker marking hardware.

---

# 76. Greybox Phase

Before art, build only:

- room shell;
- acid floor;
- Bob platforms;
- sticky walls;
- Volt service route;
- Goop floor route;
- three drone positions;
- three cover panels;
- three light receivers;
- two powered platforms;
- laser placements;
- wall button;
- bridge;
- bridge lock receiver;
- final exit area.

Do not begin detailed decoration until the cooperation loop works.

---

# 77. Greybox Gate 1 — Route Validation

Confirm independently:

### Bob

Can traverse the complete route when all puzzle systems are already solved.

### Goop

Can reach every required firing position.

### Volt

Can reach every receiver and eventually cross the bridge.

Only then add cooperation dependencies.

---

# 78. Greybox Gate 2 — Cooperation Validation

Test:

> Volt activates light.

> Goop sees target.

> Goop releases cover.

> Bob passes.

Then:

> Volt powers platform.

> Bob uses platform.

Then:

> Bob opens bridge.

> Goop protects bridge.

> Volt crosses.

If any step is unclear without verbal explanation from the developer:

> improve the environmental communication.

---

# 79. Greybox Gate 3 — Darkness Validation

Turn on final intended darkness.

Verify that:

- drone cones remain readable;
- lasers remain readable;
- Volt remains useful;
- cover targets become clearly visible after lights activate;
- Bob can identify safe surfaces;
- acid remains recognisable;
- the player is never completely blind.

---

# 80. Non-Goals

Do NOT add to Room 2:

- moving/patrolling drones;
- drone combat;
- Goop destroying drones;
- Volt riding another drone;
- complex circuit-routing puzzles;
- merge mechanics;
- boss mechanics;
- new Bob movement abilities;
- new Goop abilities;
- timed global power failure;
- battery inventory;
- multiple bridge puzzles;
- complicated fluid simulation;
- realistic rigid-body cover physics.

Keep the room focused on:

> **powered machinery + cooperative traversal.**

---

# 81. Bob Launcher

Do not introduce the Bob-launching machine in Room 2.

The room already contains:

- drones;
- Goop cover manipulation;
- darkness;
- sticky walls;
- lasers;
- Volt lighting;
- powered platforms;
- the bridge cooperation set-piece.

The launcher remains a strong candidate for Room 3.

Saving it gives Room 3 another memorable mechanic rather than overloading Room 2.

---

# 82. Core Interaction Summary

The fundamental Room 2 loop is:

### Volt

**Reveals and powers.**

↓

### Goop

**Changes the environment and creates safety.**

↓

### Bob

**Traverses the resulting route.**

Then the final puzzle reverses it:

### Bob

**Creates Volt's route.**

↓

### Goop

**Makes Volt's route safe.**

↓

### Volt

**Crosses and permanently secures the route.**

This is the central cooperative idea of Room 2.

---

# 83. Acceptance Criteria

Room 2 is complete when:

## Entry

- [ ] Bob and Goop enter together.
- [ ] Volt enters separately.
- [ ] The characters can visually recognise each other across the room.
- [ ] Acid prevents Bob from using the floor.
- [ ] Goop can safely traverse the acid.

## Darkness

- [ ] Room remains intentionally dark.
- [ ] Volt provides useful local lighting.
- [ ] Drone beams remain visible.
- [ ] Lasers remain visible.
- [ ] Acid remains readable.
- [ ] Major silhouettes remain perceptible.

## Volt Lighting

- [ ] Volt can power Light Bank A.
- [ ] Volt can power Light Bank B.
- [ ] Volt can power Light Bank C.
- [ ] Activated light banks remain active.
- [ ] Lights reveal meaningful puzzle information.

## Drones

- [ ] Drones remain stationary.
- [ ] Drones face authored directions.
- [ ] Drones retain their existing hazard behaviour.
- [ ] Searchlight direction is clearly visible.
- [ ] Dropped covers block actual detection.

## Goop

- [ ] Goop can reach every required shooting position.
- [ ] Goop can release Cover A.
- [ ] Goop can release Cover B.
- [ ] Goop can release the bridge cover.
- [ ] Covers visibly fall into blocking positions.
- [ ] Covers remain deployed.

## Bob

- [ ] Bob has a complete parkour route.
- [ ] Sticky walls are used.
- [ ] Lasers are used.
- [ ] Bob uses powered moving platforms.
- [ ] Bob reaches the wall-mounted switch.
- [ ] Bob can remain attached while holding the switch.

## Powered Platforms

- [ ] Volt can charge/power platforms.
- [ ] Thrusters activate visibly.
- [ ] Platform rises predictably.
- [ ] Platform descends when power is removed.
- [ ] Descent timing allows fair character switching.
- [ ] Bob can reliably use the platform.

## Bridge

- [ ] Bob's switch deploys the bridge.
- [ ] Bob can hold the switch while inactive.
- [ ] Bridge gives Volt a route across.
- [ ] Bridge drone blocks Volt initially.
- [ ] Goop can block that drone.
- [ ] Volt can safely cross.
- [ ] Volt can activate bridge lock.
- [ ] Bridge remains permanently open afterward.
- [ ] Bob can release the switch afterward.

## Recovery

- [ ] No cover can permanently trap a character.
- [ ] No moving platform can permanently disappear.
- [ ] Bridge cannot permanently strand Volt.
- [ ] Checkpoints restore valid states.
- [ ] Bob deaths are recoverable.
- [ ] Volt deaths are recoverable.
- [ ] Goop cannot softlock progression.
- [ ] All three slimes can always eventually reach the exit.

## Completion

- [ ] All three slimes regroup.
- [ ] Room 2 completion requires all three.
- [ ] Room 3 transition can begin afterward.

---

# 84. Final Intended Experience

Room 1 taught:

> **Volt can interact with technology.**

Room 2 should make the player realise:

> **Volt can make the level itself move.**

The room begins with all three characters separated by darkness, acid and broken infrastructure.

Volt slowly wakes the room back up.

Lights activate.

Thrusters ignite.

Platforms rise.

Goop changes the environment by dropping protective cover.

Bob traverses increasingly complicated machinery.

For most of the room, Bob relies on Volt and Goop.

Then the relationship reverses.

Bob holds open Volt's bridge.

Goop blocks the security drone watching it.

Volt finally crosses.

Volt permanently locks the bridge.

The three slimes reunite.

The player should leave Room 2 understanding that the three characters are no longer simply three different abilities.

They are becoming a cooperative system:

> **Bob reaches places the others cannot.**

> **Goop changes the environment for the others.**

> **Volt powers the technology the others depend on.**

Room 3 can now build on this relationship with harder cooperation and the next major Level 3 mechanic.