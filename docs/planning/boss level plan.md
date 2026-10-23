# CODEX IMPLEMENTATION PROMPT — SPECIMEN FINAL BOSS FIGHT

## Project: Specimen
**Repository:** https://github.com/Gradient-Ascenders/Specimen

**Feature:** Level 3 — Room 4: The Extermination Chamber

**Player Character:** The Specimen (Bob + Goop + Volt merged)

**Final Boss:** A massive autonomous extermination drone

**Encounter Structure:** Two-phase boss fight with predefined attacks, telegraphed hazards, vulnerability windows, environmental destruction, and a cinematic ending.

---

# 0. YOUR ROLE AND PRIMARY OBJECTIVE

You are acting as the lead gameplay programmer, technical game designer, 3D environment designer, combat systems engineer, graphics programmer, and QA engineer for Specimen.

Your task is to **design and implement a complete, polished, cinematic final boss encounter** in Level 3, Room 4.

This must be the climax of the game.

The player has spent three levels learning how to control three different slimes:

- **Bob:** Adhesion, climbing, mobility, powerful jumping, and traversal.
- **Goop:** Corrosive projectiles, dissolving obstacles, and environmental manipulation.
- **Volt:** Electricity, illumination, machinery activation, and electrical interactions.

At the conclusion of Level 3, the three slimes combine to become a single, substantially more powerful entity:

**THE SPECIMEN.**

Bob is the central/core organism of this merge, with Goop and Volt contributing their abilities.

The facility's scientists recognise the merged entity as an extreme threat. They abandon containment procedures and activate a final emergency defence system: an enormous, heavily armoured autonomous extermination drone.

The resulting encounter must have:

1. An enormous purpose-built extermination chamber.
2. An imposing, custom-designed boss drone.
3. A distinctive merged Specimen with upgraded mobility and electric-goop attacks.
4. A visible boss health bar.
5. Exactly two major combat phases.
6. Predefined, readable boss attack patterns.
7. Dodge-focused combat.
8. Specific vulnerability windows in which the boss can be damaged.
9. Smaller drones deployed from the boss.
10. Normal and charged electric-goop projectiles.
11. Charged attacks capable of destroying groups of smaller drones.
12. Arena geometry that meaningfully supports movement and combat.
13. Phase-dependent environmental hazards.
14. A dramatic Phase 2 transformation.
15. An introductory cinematic.
16. A cinematic defeat and escape sequence.
17. Appropriate sound, lighting, particle effects, shaders, UI, and feedback.
18. Reliable checkpoints, retries, and completion handling.
19. Good performance on relatively weak university laboratory computers.
20. Integration into the existing game without regressions.

This must be a **fully playable boss encounter**, not merely a visual mock-up.

However, before implementing anything, investigate the existing codebase thoroughly.

Do not blindly construct an unrelated new system.

Reuse existing engine architecture, movement controllers, projectile systems, drone systems, shaders, materials, audio managers, camera systems, checkpoint handling, and scene-building conventions wherever appropriate.

The specification below defines the intended experience. Numerical values are initial tuning targets rather than immutable constants.

Where the existing implementation differs, favour compatible integration and document any necessary deviations.

---

# 1. MANDATORY INITIAL REPOSITORY INVESTIGATION

Before modifying code, inspect the current `main` branch and understand the existing implementation.

Investigate the following:

## 1.1 Level architecture

Find and inspect:

- Level 3 implementation.
- Room 1, Room 2, and Room 3 scene construction.
- Existing Room 4 implementation, if any.
- Room transitions.
- Level completion logic.
- Checkpoint handling.
- Room reset behaviour.
- Player spawning and repositioning.
- Existing cutscene infrastructure.
- Lighting and environmental construction utilities.
- Geometry batching and asset disposal conventions.

Determine whether Room 4 already has a partial implementation or reserved space.

Preserve existing completed content.

## 1.2 Slime systems

Inspect:

- Bob's movement controller.
- Goop's projectile system.
- Volt's electrical abilities.
- Slime switching.
- Existing merge functionality.
- Character models and materials.
- Character collision handling.
- Camera controls.
- Player damage/death and respawn mechanisms, if any.
- Ability input mapping.

Identify which systems can be reused for The Specimen.

Do not replace working movement or collision systems unnecessarily.

## 1.3 Drone systems

Locate all existing drone implementations.

Inspect:

- Drone models.
- Patrol behaviour.
- Detection systems.
- Laser attacks.
- Projectile systems.
- Damage interactions.
- Destruction animations.
- Audio.
- Rendering optimisations.

Reuse smaller drones wherever possible.

The final boss must be visually and mechanically distinct from existing small drones.

## 1.4 Graphics and performance

Investigate:

- Three.js version.
- Existing custom shaders.
- Lighting configuration.
- Post-processing pipeline.
- Material and texture caching.
- Geometry reuse and instancing.
- Object pooling.
- Shadow settings.
- Performance budgets.
- Fixed-step gameplay loop.
- Resource disposal.
- Production-build validation.
- Automated tests.

Avoid introducing performance regressions.

## 1.5 Required investigation output

Before major implementation, document:

1. Relevant source files and architecture.
2. Existing mechanics suitable for reuse.
3. Missing systems.
4. Proposed new components.
5. Integration strategy.
6. Technical risks.
7. Intended implementation sequence.
8. Proposed verification approach.

Use this investigation to adapt the rest of this specification to the real repository.

Do not invent APIs, classes, or files without checking what already exists.

---

# 2. GIT WORKFLOW AND SAFETY REQUIREMENTS

Create a new feature branch from the latest appropriate `main` baseline.

Suggested branch:

`feat/level3-final-boss`

If this branch already exists, select a distinct descriptive branch name.

Do not work directly on `main`.

Before changing files:

- Inspect the current Git status.
- Preserve all unrelated work.
- Do not overwrite teammates' changes.
- Do not reset or clean unrelated modifications.
- Identify overlapping Level 3 work.
- Avoid accidental changes to other levels.

Use meaningful commits corresponding to substantial milestones.

Suggested milestones:

1. Arena construction and environment.
2. Merged Specimen abilities.
3. Boss model and combat architecture.
4. Phase 1 behaviour.
5. Phase 2 and environmental changes.
6. Cinematics, audiovisual polish, and UI.
7. Testing, performance, and final refinements.

These are conceptual milestones; combine related work where appropriate.

Avoid dozens of insignificant commits.

**Do not push changes or open a pull request unless explicitly instructed to do so.**

At completion, report the branch, commits, changed files, validation results, remaining limitations, and exact local testing instructions.

---

# 3. CORE CREATIVE DIRECTION

## 3.1 Encounter identity

The final encounter should feel like:

**A powerful escaped biological experiment fighting an enormous automated weapon inside an emergency extermination chamber that gradually destroys itself.**

The experience should combine:

- Fast movement.
- Precise dodging.
- Positioning.
- Pattern recognition.
- Charged projectile combat.
- Crowd control.
- Platform traversal.
- Environmental hazards.
- Dramatic visual effects.
- Strong audiovisual feedback.

The fight must feel fundamentally different from the rest of Specimen.

Previously, the player escaped security systems.

Now, the entire security system is focused on eliminating the player.

## 3.2 Narrative context

The scientists consider Bob the core intelligence or principal organism of the merged entity.

Combining with Goop and Volt has made Bob substantially more dangerous.

The scientists determine that containment is no longer viable.

They authorise the termination of the merged organism.

The final drone is deployed as the facility's last defence.

The encounter should communicate this through the environment, warning displays, alarms, mechanical systems, and short in-engine cinematic sequences.

Avoid long dialogue sequences.

The story should remain comprehensible through visual storytelling.

---

# 4. ROOM 4 — THE EXTERMINATION CHAMBER

## 4.1 Overall architecture

Construct an enormous circular industrial-science-fiction chamber.

The room was originally used for dangerous specimen research and large-scale containment experiments.

It has been converted into a last-resort elimination arena.

The space should look significantly larger and more intimidating than previous rooms.

Suggested initial dimensions:

- Arena diameter: approximately 40–50 metres.
- Main floor: broad circular combat surface.
- Central combat zone: approximately 25–30 metres across.
- Raised perimeter: surrounding maintenance walkway.
- Vertical space: enough to accommodate a massive hovering drone and dramatic overhead machinery.
- Boss width: approximately 7–10 metres, adjusted for gameplay and camera framing.

These are tuning targets, not rigid measurements.

Choose final proportions based on the current character scale, movement speed, jump height, combat range, camera distance, and field of view.

The arena must feel enormous while remaining functionally playable.

## 4.2 Three-level composition

Use three primary height layers.

### Layer A — Main combat floor

The main arena should provide:

- Wide open movement.
- Clear sightlines.
- Room for dodging.
- Projectile combat.
- Ground-level hazards.
- Telegraph indicators.
- Boss attack landing zones.
- Limited raised cover structures.
- Space for smaller drones.

Avoid clutter that unnecessarily interferes with movement or visibility.

A large proportion of the central floor should remain unobstructed.

### Layer B — Raised perimeter walkway

Construct a partially elevated circular maintenance walkway around the outer arena.

It should allow The Specimen to:

- Jump to higher ground.
- Evade certain ground attacks.
- Reposition.
- Obtain improved firing angles.
- Navigate around dangerous floor sections.

Include:

- Industrial railings where appropriate.
- Ramps or accessible jumps.
- Maintenance platforms.
- Broken sections.
- Mechanical supports.
- Wall panels.
- Pipes and conduits.

This walkway must not be permanently safe.

Some boss attacks must specifically threaten elevated positions.

Do not create narrow walkways that produce frustrating falls or camera collisions.

### Layer C — Overhead deployment infrastructure

Construct an enormous mechanical deployment system above the arena.

Features:

- Circular ceiling hatch.
- Reinforced structural beams.
- Heavy machinery.
- Suspended rails or mechanical supports.
- Hydraulic elements.
- Electrical cables.
- Maintenance gantries.
- Warning lights.
- Large mechanical doors.

The boss initially emerges from this machinery.

This layer is primarily environmental spectacle rather than a third full playable floor.

---

# 5. ARENA LAYOUT AND NAVIGATION

## 5.1 General plan

The arena should be primarily circular.

Suggested composition:

- Central combat floor.
- Large overhead boss deployment location.
- Outer maintenance ring.
- Three substantial raised cover structures, spaced around the chamber.
- Entrance positioned at one side.
- Scientists' control room overlooking the opposite side.
- Wall-mounted machinery and electrical systems.
- Several electrifiable floor sectors.
- At least two convenient routes between lower and raised areas.

The cover objects must not completely prevent the player from seeing the boss.

## 5.2 Cover

Include approximately three prominent pieces of industrial cover.

Potential examples:

- Reinforced reactor housings.
- Large structural maintenance units.
- Heavy power conduits.
- Mechanical cooling assemblies.

Cover should provide tactical opportunities against selected boss attacks.

However, it should not trivialise the encounter.

Some attacks may:

- Strike around cover.
- Target the player's last position.
- Approach from above.
- Threaten elevated areas.

Avoid arbitrary unavoidable damage.

## 5.3 Hazards

The arena contains electrically conductive floor panels.

Certain floor sectors can be temporarily electrified during specific boss attacks.

Electrical hazards must communicate three distinct states:

1. Inactive.
2. Warning/charging.
3. Dangerous.

For example:

- Inactive: dark metal.
- Charging: amber electrical patterns.
- Dangerous: bright blue-white electrical discharge.

Do not depend entirely on colour.

Add sound, animation, patterns, and clear visual changes.

Electrical hazards must have predictable timing.

The player must always have reachable safe ground.

## 5.4 Entry

The player enters from a reinforced industrial corridor.

Once they move into the arena:

1. The room transition completes.
2. The player reaches a clearly identifiable starting location.
3. The introductory cinematic begins.
4. The enormous blast door closes.
5. Emergency lighting activates.
6. The final boss deploys.
7. Gameplay begins.

The camera must return control smoothly to the player.

The player must not receive damage during the cinematic.

---

# 6. SCIENTISTS' OBSERVATION DECK

At the far end of the chamber, construct a prominent observation/control room.

Features:

- Large reinforced glass windows.
- Elevated position.
- Control consoles.
- Glowing monitors.
- Emergency warning lights.
- Industrial support beams.
- Security shutters.
- Facility surveillance equipment.

The scientists do not need fully animated human characters.

If suitable, use subtle human silhouettes or indistinct figures behind the glass.

This should remain a low-priority cosmetic detail.

The room must communicate that an intelligent authority is monitoring the experiment.

During Phase 2, show that control is being lost.

Possible environmental effects:

- Monitor flickering.
- Electrical sparks.
- Alarm changes.
- Emergency shutters activating.
- Broken glass or visible structural damage.
- Control screens switching to critical warnings.

Prefer inexpensive scripted effects.

Do not implement complex scientist NPC AI.

---

# 7. MAIN CHARACTER — THE SPECIMEN

## 7.1 Identity

The Specimen is the merged form of:

- Bob.
- Goop.
- Volt.

Bob is the central organism.

The visual and gameplay design should communicate a unified entity incorporating the strengths of all three slimes.

Do not portray the character as three ordinary slimes standing together.

The player should feel they have evolved into a much more powerful being.

## 7.2 Visual direction

Use the existing character art direction as the primary reference.

The Specimen should exhibit a recognisable mixture of:

- Bob's primary slime body and mobility identity.
- Goop's corrosive material qualities.
- Volt's electrical illumination and sparks.

Suggested features:

- Larger and more physically imposing slime silhouette.
- Strong deformation and squash/stretch.
- Electrical veins or energy patterns.
- Corrosive-looking green internal fluid.
- Yellow electrical highlights.
- Energy concentration during charged attacks.
- Subtle electrical particles.
- A stronger impact response when landing.

Avoid excessive visual complexity that harms readability or performance.

The final form should remain recognisable as part of Specimen's established art style.

## 7.3 Movement

The Specimen must have greater mobility than normal Bob.

Proposed abilities:

### Enhanced movement

Higher ground movement speed and responsive acceleration.

Avoid excessive momentum or sliding that makes combat frustrating.

### Enhanced jump

Greater jump height and distance than Bob.

Allow jumps between the main floor and perimeter platforms.

### Midair manoeuvrability

Support meaningful directional adjustment in the air.

The player should be able to reposition while preparing attacks.

### Simultaneous movement and charging

The player must be able to:

- Move.
- Jump.
- Aim.
- Charge a projectile.

These should not unnecessarily block one another.

### Camera

Use a third-person combat camera compatible with the existing camera system.

Ensure:

- The Specimen remains visible.
- Large boss attacks are readable.
- Target acquisition is comfortable.
- Platform edges remain visible.
- The camera does not clip through geometry.
- The boss does not obscure the entire screen.

Do not introduce unnecessary camera shake.

If camera shake exists, make it subtle and respect any existing settings.

## 7.4 Ability compatibility

The existing slime abilities must not be broken.

The Specimen may use upgraded mechanics, but the implementation must not modify Bob, Goop, or Volt in ways that unintentionally change earlier levels.

Prefer separate ability configuration or composition over broad global changes.

---

# 8. PRIMARY PLAYER WEAPON — ELECTRIC GOOP

## 8.1 Weapon concept

The Specimen fires powerful electrically charged corrosive projectiles.

This attack combines Goop's ranged corrosive ability with Volt's electrical power.

The projectile should look like a cohesive ball of glowing, electrically energised slime.

Suggested visual characteristics:

- Green or yellow-green viscous centre.
- Bright yellow electrical arcs.
- Small particles orbiting the projectile.
- Pulsing emissive glow.
- Distinct charging animation.
- Electrified impact burst.

The projectile should be clearly visible in the dark arena.

## 8.2 Normal attack

A brief press produces a normal electric-goop projectile.

Required behaviour:

- Fast projectile travel.
- Clear aiming.
- Reliable collision.
- Immediate launch feedback.
- Impact particles.
- Electrical hit sound.
- Ability to destroy standard small drones in one successful hit.

The normal attack should be useful for fast crowd control.

It must not trivialise boss damage.

## 8.3 Charged attack

Holding the attack button charges a more powerful projectile.

Suggested charge time:

Approximately 1.2–1.8 seconds.

Tune after testing.

Charging should gradually increase:

- Projectile size.
- Emissive intensity.
- Electric arc activity.
- Charge sound pitch.
- Visible energy surrounding The Specimen.

A clear indication must communicate full charge.

Releasing fires the projectile.

## 8.4 Fully charged impact

A fully charged projectile creates an electric-corrosive area-of-effect explosion.

Required capabilities:

- Significant damage to exposed boss weak points.
- One-hit destruction of standard small drones.
- Destruction of multiple closely grouped small drones.
- A clearly indicated explosion radius.
- Strong audiovisual feedback.
- Appropriate collision filtering.

Suggested initial explosion radius:

Approximately 4–6 metres.

Adjust for the actual arena and enemy scale.

## 8.5 Partial charge

Support a consistent intermediate result or clearly defined charge thresholds.

Avoid ambiguous charge states.

A simple implementation may use:

- Tap: normal projectile.
- Partial hold: stronger projectile.
- Full hold: maximum projectile with area-of-effect damage.

The exact implementation should align with existing input handling.

## 8.6 Restrictions

Do not introduce excessive particle counts.

Do not allocate new expensive resources for every projectile.

Use pooling when beneficial.

Ensure projectiles:

- Do not damage their owner.
- Cannot hit the same target repeatedly in a single explosion unless intended.
- Have finite lifetimes.
- Are removed or recycled correctly.
- Cannot pass through solid geometry unintentionally.
- Do not persist after room reset.

---

# 9. FINAL BOSS — MASSIVE EXTERMINATION DRONE

## 9.1 Identity

The boss is a giant autonomous security drone designed specifically to eliminate dangerous escaped specimens.

It should be visually related to the facility's smaller drones while appearing vastly more threatening.

Avoid making it simply a small drone scaled up.

It must have unique:

- Silhouette.
- Armour.
- Weapon systems.
- Animations.
- Deployment mechanism.
- Damage reactions.
- Weak points.
- Destruction sequence.

## 9.2 Proposed design

The drone should feature:

- Large armoured central body.
- Strong, identifiable frontal silhouette.
- Glowing central energy core.
- Heavy articulated armour plates.
- Multiple weapon mounts.
- A primary laser emitter.
- Secondary targeting emitters.
- Drone deployment compartments.
- Thrusters or hovering systems.
- Electrical circuitry.
- Red scanning or warning lights.
- Exposed machinery beneath the armour.

Its appearance should suggest an industrial execution machine rather than a friendly robot.

## 9.3 Modelling approach

Prefer a carefully designed custom model using the project's existing modelling approach.

If procedural geometry is appropriate, construct a coherent hierarchical mesh assembly.

For example:

```text
BossRoot
├── MainBody
│   ├── ArmourShell
│   ├── CoreHousing
│   │   └── ExposedEnergyCore
│   ├── PrimaryWeapon
│   │   ├── ChargingEmitter
│   │   └── LaserOrigin
│   ├── LeftWeaponAssembly
│   ├── RightWeaponAssembly
│   ├── DroneDeploymentBay
│   └── ElectricalDetails
├── ThrusterAssemblies
├── TargetingVisuals
└── DamageEffects
```

Use hierarchical modelling purposefully.

Weapon emitters should be children of their relevant mounts.

Thrusters should animate with the boss body.

The weak point should move correctly with its housing.

Avoid rebuilding meshes each frame.

## 9.4 Boss movement

The boss primarily hovers in the central arena.

It can:

- Reposition between predetermined locations.
- Rotate toward the player.
- Rise or lower slightly.
- Perform attack-specific movement.
- Recoil.
- Enter stunned or overheated states.
- React visually to damage.

Use authored trajectories, interpolation, or simple deterministic movement.

Do not build a complex general-purpose flying AI system unless the current engine already provides an appropriate one.

The boss must never move through walls or become unreachable.

---

# 10. BOSS HEALTH AND DAMAGE SYSTEM

## 10.1 Health bar

Display a prominent boss health bar near the top of the screen.

Suggested label:

**EXTERMINATION UNIT**

Alternative:

**EXTERMINATION PROTOCOL — ACTIVE**

The health bar should:

- Be clearly visible.
- Animate when damage is dealt.
- Show the transition between phases.
- Remain readable over the game environment.
- Use the existing HUD design language.
- Disappear after defeat.

Avoid UI that covers the player's aiming reticle.

## 10.2 Damage model

The boss should be armoured for most of the encounter.

Normal attacks against armour should produce visible feedback indicating ineffective damage.

For example:

- Sparks.
- Deflection sounds.
- Brief impact flash.
- No health reduction.

The player must understand why the attack failed.

## 10.3 Weak-point vulnerability

The boss exposes a vulnerable electrical core after selected major attacks.

While exposed:

- Projectiles can damage the boss.
- The core emits strong light.
- Armour plates open.
- A distinctive audio cue plays.
- The exposed location is clearly visible.

Suggested initial vulnerability duration:

4–6 seconds.

Adjust based on aiming difficulty and projectile travel time.

## 10.4 Damage tuning

The encounter should encourage learning attack patterns rather than prolonged repetitive firing.

As an initial tuning direction:

- A normal projectile deals modest damage during vulnerability.
- A fully charged projectile deals substantial damage.
- Hitting the core while fully charged is strongly rewarded.
- Missing one vulnerability window is recoverable.
- Boss damage is disabled during invulnerable cinematic transitions.

Define boss health and damage values in one configurable location.

Do not scatter magic numbers throughout unrelated classes.

---

# 11. COMBAT STRUCTURE

The fight contains exactly two main phases.

Suggested phase transition:

50% remaining boss health.

The fight should last approximately 3–5 minutes for a competent player.

Avoid turning it into an endurance fight.

The challenge should come from:

- Recognising attacks.
- Dodging successfully.
- Positioning.
- Managing smaller drones.
- Preparing charged shots.
- Taking advantage of vulnerability windows.

Not from enormous boss health.

---

# 12. PHASE 1 — CONTAINMENT PROTOCOL

## 12.1 Narrative state

The scientists still believe their extermination drone is capable of controlling the situation.

The room is mostly structurally intact.

Lights function normally, except for emergency warning systems.

Boss behaviour is deliberate and methodical.

Attacks have generous telegraphs.

The player learns the combat rhythm.

## 12.2 Attack A — Horizontal Laser Sweep

The boss rotates toward the player and prepares a wide laser sweep.

Sequence:

1. Boss enters targeting state.
2. Laser emitter begins glowing red.
3. A clear targeting indicator appears.
4. Charging sound plays.
5. The boss fires a powerful horizontal beam.
6. The beam sweeps across part of the arena.
7. The attack ends.
8. Boss enters recovery.

Player response:

- Jump over the beam where appropriate.
- Move around its sweep.
- Take cover where geometry provides protection.
- Reposition onto higher ground if useful.

The attack must have a predictable sweep speed.

Damage collision must match the rendered beam.

Avoid invisible or delayed hitboxes.

## 12.3 Attack B — Targeted Vertical Laser

The boss targets the player's position.

Sequence:

1. A targeting indicator tracks the player briefly.
2. The target location locks.
3. The indicator changes to a committed warning state.
4. The boss fires a concentrated laser at that position.
5. The area becomes dangerous temporarily.
6. The attack ends.

Player response:

Move laterally after the target locks.

The attack should punish remaining stationary.

Do not continuously retarget after the committed warning has completed.

## 12.4 Attack C — Drone Deployment

The boss opens its deployment bays.

A small group of standard security drones emerges.

Suggested initial deployment:

2–4 small drones.

Use existing smaller drone models and systems if suitable.

These drones should:

- Move using simple authored or existing behaviours.
- Threaten the player.
- Remain less dangerous than the main boss.
- Be destroyable by a normal electric-goop projectile.
- Be vulnerable to charged area-of-effect explosions.

This attack teaches the benefit of charging.

## 12.5 Phase 1 attack cadence

Use a controlled combat state machine.

Example pattern:

```text
Combat Start
    ↓
Laser Sweep
    ↓
Recovery
    ↓
Targeted Laser
    ↓
Vulnerability Window
    ↓
Drone Deployment
    ↓
Recovery
    ↓
Repeat / Vary Pattern
```

Do not make the encounter feel completely mechanically rigid.

Allow a limited selection of authored attack sequences.

However, avoid excessive randomness.

Attacks should always be readable and fair.

## 12.6 Phase 1 vulnerability

Following selected major attacks, the boss overheats.

Armour plates open and expose the energy core.

The player can attack during this window.

The most rewarding tactic is:

1. Recognise the coming attack.
2. Dodge.
3. Begin charging electric goop.
4. Reposition.
5. Fire into the exposed core.

Ensure the boss can be damaged reliably without requiring perfect timing.

---

# 13. PHASE TRANSITION — EXTERMINATION PROTOCOL

At approximately 50% remaining health, initiate a short cinematic transition.

The transition must be dramatic.

## 13.1 Sequence

1. The boss suffers a major hit.
2. It briefly loses stability.
3. Electrical sparks erupt from its armour.
4. Its current attack is safely cancelled.
5. The drone retreats or rises toward the centre.
6. Facility alarms intensify.
7. The observation room switches to emergency status.
8. The room's lighting changes.
9. The boss activates additional weapon systems.
10. Parts of the arena are damaged.
11. New electrical hazards become active.
12. The boss returns to combat.

Display:

**EXTERMINATION PROTOCOL ACTIVATED**

Potential secondary message:

**ALL SAFETY LIMITERS DISABLED**

The transition should feel like an escalation caused by the scientists' desperation.

## 13.2 Visual transformation

Phase 2 should visibly change the boss.

Potential changes:

- Armour becomes damaged.
- Core glow intensifies.
- Additional red emergency lights.
- Visible electrical arcs.
- More aggressive hovering movement.
- Damaged external panels.
- Increased thruster intensity.
- More violent attack animations.

Avoid building an entirely separate boss model unless necessary.

Reuse the original hierarchy and animate its parts into a new configuration.

## 13.3 Transition safety

During the transition:

- Freeze or safely suspend hostile damage.
- Clear dangerous projectile states as appropriate.
- Prevent unfair damage to the player.
- Disable boss damage until the transition ends.
- Preserve the player's legitimate combat progress.
- Restore camera and input cleanly.
- Support skipping if consistent with existing cutscene conventions.

---

# 14. PHASE 2 — EXTERMINATION PROTOCOL

## 14.1 Narrative state

The drone has abandoned safety restrictions.

Its attacks are faster and more aggressive.

The arena begins to deteriorate.

The scientists' observation room exhibits signs of losing control.

The player should feel the facility's final defence system is becoming unstable.

## 14.2 Reused attacks

Phase 2 may reuse Phase 1 attacks with carefully tuned modifications.

Examples:

- Faster laser sweep.
- Double targeting strike.
- More threatening drone deployment.
- Shorter recovery periods.

Do not eliminate all reaction time.

The player must still recognise and respond to attacks.

## 14.3 Attack D — Ground Shockwave

The boss rises slightly and charges its energy core.

It then emits a large expanding shockwave across the floor.

Visual design:

- Glowing expanding energy ring.
- Electrical discharge.
- Brief floor illumination.
- Strong sound cue.

Player response:

Jump over the shockwave or use sufficiently elevated structures.

The ring must move predictably.

Collision should align with its visual position and height.

## 14.4 Attack E — Electrified Floor Sectors

The boss sends electricity through selected floor panels.

Sequence:

1. Target sectors illuminate with warning patterns.
2. Warning sound plays.
3. Electrical energy spreads through the selected sectors.
4. The sectors become hazardous.
5. The electrical discharge stops.
6. The sectors return to their safe state.

Always leave reachable safe areas.

Never electrify the entire accessible floor simultaneously.

Avoid randomly selecting patterns that trap the player.

Use authored safe patterns with appropriate validation.

## 14.5 Attack F — Charged Devastation Beam

This is the boss's largest attack.

Sequence:

1. Boss moves toward a designated firing position.
2. Core begins charging.
3. A loud charge sound builds.
4. A large targeting beam indicates the intended attack direction.
5. The boss commits to the shot.
6. A massive energy beam fires.
7. Cover or positioning allows the player to survive.
8. The weapon overheats.
9. The boss exposes its energy core for a substantial damage window.

This move should be visually spectacular.

It must also be mechanically fair.

The player must always have enough time to reach safety.

Do not use excessive bloom that obscures the scene.

## 14.6 Arena destruction

Phase 2 introduces controlled environmental damage.

Suggested effects:

- Several walkway sections become visibly damaged.
- Selected nonessential structures collapse.
- Floor plates spark.
- Electrical conduits rupture.
- Emergency lights flicker.
- Smoke or steam vents activate.
- Machinery malfunctions.
- The observation room displays critical failures.

Keep environmental destruction authored and predictable.

Avoid expensive real-time structural physics.

Use predetermined animations or state transitions.

Do not remove essential traversal routes.

The player must never become permanently trapped.

---

# 15. SMALL DRONE COMBAT AND CHAIN REACTIONS

This mechanic should make the charged electric-goop weapon feel particularly powerful.

## 15.1 Small drone destruction

A normal projectile should destroy one standard small drone.

The hit should produce:

- Electrical sparks.
- Brief impact flash.
- Destruction sound.
- Suitable visual breakup or disappearance.
- Proper cleanup.

## 15.2 Charged explosions

A fully charged projectile should damage every eligible small drone within its explosion radius.

A well-placed shot should destroy several drones simultaneously.

## 15.3 Electrical chain reaction

For Phase 2, introduce an optional but strongly recommended interaction:

When a charged projectile destroys several nearby drones, their electrical systems overload and produce a chain reaction.

Possible consequences:

- Additional nearby drones are damaged.
- The boss's shield is briefly disrupted.
- The boss enters a short stagger state.
- A vulnerability window opens if allowed by the current phase state.

This mechanic gives drone waves a strategic purpose.

The player can choose between:

- Quickly eliminating drones individually.
- Charging a powerful area attack.
- Using grouped drones to create an opening against the boss.

## 15.4 Fairness and limits

Prevent infinite chain reactions.

Use bounded explosion propagation.

Do not create new particle systems recursively.

Ensure each drone is destroyed once.

Ensure chain damage cannot be applied repeatedly to the same target.

Define a maximum number of active drones.

Avoid unlimited accumulation of enemies.

---

# 16. PLAYER DAMAGE, FAILURE, AND CHECKPOINTS

Before designing the player health system, inspect the existing game's failure mechanics.

Determine whether Specimen already uses:

- Health.
- Hazard damage.
- One-hit death.
- Checkpoint-based respawning.
- Temporary invulnerability.
- Other failure mechanics.

Prefer compatibility with the existing framework.

## 16.1 Boss encounter survivability

The player needs enough survivability to learn attack patterns.

If the existing system has health, integrate boss damage with it.

If there is no suitable health system, implement the smallest isolated encounter-specific solution.

A possible starting point is three or four significant hits before defeat.

This value must be configurable.

Avoid introducing a global health system that modifies previous levels unnecessarily.

## 16.2 Damage feedback

When the player takes damage:

- Play a clear impact sound.
- Trigger a brief visual response.
- Update the relevant UI.
- Apply appropriate knockback only if compatible with movement.
- Provide a short invulnerability interval to prevent multiple hits from one continuous attack.

The player should understand precisely what caused damage.

## 16.3 Checkpoint

Create a checkpoint immediately before or at the start of the boss encounter.

On failure:

- Respawn the player.
- Restore the arena to its intended initial state.
- Restore the boss's health.
- Return the boss to Phase 1.
- Remove active projectiles.
- Remove summoned drones.
- Reset floor hazards.
- Restore damaged environment elements.
- Restore the Specimen's combat state.
- Reset audio and UI correctly.

The player must be able to retry without refreshing the browser.

## 16.4 Retry experience

Retries should be fast.

Avoid replaying a long unskippable cinematic.

Allow the introduction to be skipped, or use a shortened retry sequence.

Ensure checkpoint resets do not leak memory.

---

# 17. INTRODUCTORY CINEMATIC

Implement a short, dramatic, in-engine introduction.

Suggested duration:

Approximately 8–10 seconds.

Reuse the existing cutscene sequencer if available.

## 17.1 Shot sequence

### Shot 1 — Arrival

The Specimen enters the enormous chamber.

The camera establishes the scale of the room.

The arena appears ominously empty.

### Shot 2 — Lockdown

The heavy entrance blast door closes.

Warning lights activate.

An alarm sounds.

### Shot 3 — Threat classification

The observation room illuminates.

Facility monitors display:

**CONTAINMENT BREACH — CRITICAL**

**SPECIMEN CLASSIFICATION: EXTREME THREAT**

**EXTERMINATION PROTOCOL AUTHORIZED**

Use consistent typography with the rest of Specimen.

### Shot 4 — Deployment

The enormous ceiling hatch opens.

Mechanical supports move.

The extermination drone descends into view.

Its energy systems activate.

### Shot 5 — Combat begins

The boss faces The Specimen.

The boss health bar appears.

The camera returns to the gameplay position.

Combat begins.

## 17.2 Requirements

- Use in-engine rendering.
- Keep the sequence short.
- Make it skippable.
- Do not damage the player during cinematics.
- Avoid camera clipping.
- Restore pointer-lock/input safely.
- Prevent duplicate triggering.
- Avoid blocking game progression if cinematic playback fails.

---

# 18. ENDING CINEMATIC — BOSS DEFEAT

The boss's destruction should be a significant payoff.

## 18.1 Defeat trigger

When boss health reaches zero:

1. Stop initiating attacks.
2. Disable further hostile damage.
3. Remove or disable active smaller drones.
4. Prevent new drone spawns.
5. Cancel outstanding hazards safely.
6. Enter the defeat sequence.
7. Prevent duplicate completion events.

## 18.2 Destruction sequence

Suggested cinematic:

The boss loses stability.

Its armour sparks and breaks apart.

The central energy core becomes unstable.

The drone crashes toward the centre of the chamber.

Large electrical discharges spread across its surface.

The Specimen prepares one final fully charged electric-goop attack.

The projectile strikes the exposed core.

A large electrical explosion destroys the drone.

A chain reaction spreads through the facility's power systems.

An emergency exit is blown open.

## 18.3 Escape

The Specimen moves toward the newly opened exit.

The chamber begins collapsing behind it.

The final sequence should clearly communicate that the facility's extermination attempt has failed.

Integrate with the existing Level 3 ending and credits flow.

Do not bypass or duplicate existing completion logic.

## 18.4 Implementation pragmatism

If the exact cinematic becomes too expensive to implement, use scripted animation, camera movement, light flashes, effects, and sound rather than complex physics destruction.

Prioritise coherence and reliability.

---

# 19. COMBAT STATE MACHINE

Implement a clear and maintainable state machine.

Suggested states:

```text
INACTIVE
    ↓
INTRO_CINEMATIC
    ↓
PHASE_1
    ├── IDLE
    ├── POSITIONING
    ├── ATTACK_TELEGRAPH
    ├── ATTACK_EXECUTION
    ├── RECOVERY
    └── VULNERABLE
    ↓
PHASE_TRANSITION
    ↓
PHASE_2
    ├── IDLE
    ├── POSITIONING
    ├── ATTACK_TELEGRAPH
    ├── ATTACK_EXECUTION
    ├── RECOVERY
    └── VULNERABLE
    ↓
DEFEAT_CINEMATIC
    ↓
LEVEL_COMPLETE
```

Provide appropriate handling for:

- Player death.
- Retry.
- Pause.
- Level unload.
- Scene disposal.
- Cinematic skip.
- Interrupted attacks.
- Invalid transitions.

Avoid loosely coupled timers that can continue running after the encounter resets.

Prefer fixed-step or existing game-loop update logic.

Do not create multiple competing sources of truth for boss phase and combat state.

---

# 20. ATTACK TELEGRAPHING AND FAIRNESS

Every major boss attack must follow a consistent readability structure:

1. Warning.
2. Commitment.
3. Execution.
4. Recovery.

The player should be able to identify:

- Which attack is happening.
- Where it will hit.
- When it will happen.
- How to avoid it.
- When the boss becomes vulnerable.

Example:

```text
LASER CHARGE
    ↓
RED TARGETING INDICATOR
    ↓
TARGET LOCK
    ↓
LASER FIRES
    ↓
LASER ENDS
    ↓
CORE EXPOSED
    ↓
PLAYER ATTACK OPPORTUNITY
```

Avoid attacks that are:

- Instantaneous.
- Unreadable.
- Inconsistent with visual effects.
- Impossible to avoid.
- Too dependent on luck.
- Capable of repeatedly damaging the player during one animation without reasonable protection.

Balance the encounter through playtesting rather than assumptions.

---

# 21. LIGHTING AND ATMOSPHERE

## 21.1 Overall visual identity

The boss room should contrast strongly with earlier sections of Level 3.

It is dark, industrial, threatening, and technologically advanced.

Use a deliberate combination of:

- Low ambient illumination.
- Red warning lights.
- Cold industrial light.
- Blue-white electrical effects.
- Yellow illumination from The Specimen.
- Bright boss weapon emitters.
- Glowing control panels.
- Selective sparks and steam.

Maintain enough visibility for gameplay.

## 21.2 Phase 1 lighting

Suggested palette:

- Dark metallic environment.
- Subtle blue-grey illumination.
- Red emergency accents.
- Strong boss energy-core light.
- Warm electrical light from The Specimen.

The room should feel controlled but dangerous.

## 21.3 Phase 2 lighting

Suggested changes:

- Greater red warning intensity.
- Flickering lights.
- More visible electrical discharges.
- Damaged lighting fixtures.
- Bright exposed core.
- Sporadic flashes from failing equipment.

Do not make the room so dark that attacks become difficult to see.

## 21.4 Performance

Dynamic lighting can become very expensive in Three.js.

Use:

- Carefully limited shadow-casting lights.
- Emissive materials for small light sources.
- Precomputed or static lighting where practical.
- Efficient emissive animations.
- Limited bloom.
- Low-cost particles.
- Appropriate shadow map resolutions.

Do not allow every electric particle or projectile to create an independent shadow-casting light.

Prioritise visibility and frame rate over excessive visual effects.

---

# 22. SHADERS AND SPECIAL EFFECTS

The final encounter should meaningfully demonstrate custom graphics techniques.

Reuse existing shaders where appropriate.

Potential effects:

## 22.1 Electric-goop shader

A procedural material combining:

- Slime surface movement.
- Electrical pulses.
- Emissive highlights.
- Animated energy patterns.
- Charge-dependent intensity.
- Impact response.

Drive shader uniforms using gameplay state.

## 22.2 Boss energy-core shader

Create an animated core appearance.

Possible features:

- Pulsating energy.
- Rotating internal patterns.
- State-dependent colour.
- Increased intensity while charging.
- Exposed weak-point indicator.
- Damage-state flicker.

## 22.3 Laser effects

Render laser attacks with clear geometry and consistent collision representation.

Consider:

- Glowing beam core.
- Outer energy glow.
- Telegraphing line.
- Impact effects.
- Animated energy movement.

Avoid large numbers of transparent overlapping surfaces if they create overdraw problems.

## 22.4 Electrified floor shader

Animate electrical patterns across charged floor sectors.

The shader should distinguish:

- Inactive.
- Warning.
- Active.
- Recovery.

The visual appearance must correspond to collision and damage state.

## 22.5 Phase transition effects

Use controlled:

- Electrical arcs.
- Energy surges.
- Screen-space or material flashes.
- Boss armour animation.
- Light changes.
- Environmental sparks.

Avoid excessive fullscreen effects.

## 22.6 Shader implementation requirements

Where custom shader code is introduced:

- Use purposefully designed vertex/fragment stages.
- Keep uniforms explicit.
- Use gameplay-driven state.
- Avoid unnecessary per-frame allocations.
- Maintain reasonable shader complexity.
- Verify WebGL compatibility on Chrome/Ubuntu.
- Ensure effects are understandable and maintainable.

Do not add a shader merely to increase the shader count.

---

# 23. AUDIO DESIGN

The boss encounter must have a distinct audio identity.

Reuse the existing game's audio system.

## 23.1 Environmental audio

Include:

- Low industrial machinery rumble.
- Ventilation ambience.
- Distant electrical hum.
- Mechanical strain.
- Emergency alarms.

## 23.2 Boss audio

Include appropriate sounds for:

- Initial deployment.
- Thrusters.
- Target acquisition.
- Laser charging.
- Laser firing.
- Drone deployment.
- Electrical attacks.
- Armour impacts.
- Core exposure.
- Damage reaction.
- Phase transition.
- Defeat.

## 23.3 Player weapon audio

Include:

- Normal electric-goop firing.
- Charging buildup.
- Full-charge indication.
- Projectile travel, if appropriate.
- Projectile impact.
- Area-of-effect electrical explosion.
- Drone destruction.
- Boss weak-point damage.

## 23.4 Music

Use a dedicated final boss soundtrack if the existing soundtrack infrastructure permits it.

Phase 1 should feel tense and mechanical.

Phase 2 should feel faster and more desperate.

The phase transition should have a noticeable musical escalation.

Avoid abruptly restarting the same track unless musically intentional.

## 23.5 Browser compatibility

Respect browser autoplay restrictions and the existing audio-unlock implementation.

Do not break main-menu or level soundtrack behaviour.

Pause, retry, level unload, and completion must not leave sounds playing indefinitely.

---

# 24. UI AND GAMEPLAY FEEDBACK

Required interface elements:

## 24.1 Boss health bar

Prominent and readable.

Shows remaining health and phase changes.

## 24.2 Player health or failure indicator

Use existing mechanics where possible.

## 24.3 Weapon charge indicator

Communicate:

- Charging progress.
- Full charge.
- Release.
- Recovery or cooldown, if applicable.

## 24.4 Aiming reticle

Make aiming straightforward.

Do not obstruct the target.

## 24.5 Weak-point feedback

Communicate valid boss damage clearly.

Examples:

- Damage flash.
- Core reaction.
- Health-bar reduction.
- Unique hit sound.
- Small damage numbers only if consistent with the game's visual design.

## 24.6 Invalid-hit feedback

Armoured hits should visibly deflect.

The player must not mistake invulnerable armour for broken hit detection.

## 24.7 Accessibility

Where possible:

- Support reduced screen shake.
- Maintain strong telegraph contrast.
- Do not rely solely on colour.
- Keep visual effects readable.
- Respect existing volume settings.
- Avoid excessive flashing.

---

# 25. CAMERA DESIGN

The camera is especially important in a large 3D boss fight.

## 25.1 Combat camera

Use the established camera architecture.

Adjust camera distance and framing as necessary for the larger merged character.

Ensure the player can observe both:

- The Specimen.
- The boss's upcoming attacks.

Do not automatically force constant lock-on if it interferes with movement or aiming.

## 25.2 Aiming

The player must be able to aim electric-goop projectiles accurately.

Investigate whether Goop's existing aim mode can be extended.

Prefer consistent controls rather than introducing an entirely different aiming system.

## 25.3 Boss weak-point visibility

When the core becomes exposed:

- Make its location easy to identify.
- Do not hide it behind the boss body.
- Avoid vulnerability windows where the boss is facing an inaccessible direction.
- Ensure reasonable projectile trajectories.

## 25.4 Cinematic cameras

Use smooth authored camera positions and transitions.

Keep camera movement short and purposeful.

Restore standard gameplay camera configuration correctly after every cinematic.

---

# 26. ENVIRONMENTAL DESTRUCTION IMPLEMENTATION

Do not implement a fully dynamic destruction physics engine.

Use an authored destruction system.

Potential approach:

```text
ArenaElement
├── InitialState
├── DamagedState
├── DestroyedState
├── CollisionState
├── VisualState
└── ResetState
```

Each destructible or transformable element should have predictable states.

Examples:

- Intact walkway section.
- Damaged walkway section.
- Collapsed walkway section.

If collision changes, ensure the visual geometry reflects it.

No invisible walls.

No unsupported floating platforms.

No newly created softlocks.

Destruction should be deterministic and resettable.

Avoid debris with expensive continuous rigid-body simulation.

Use lightweight animation and limited particle bursts.

---

# 27. PERFORMANCE TARGETS

This is a browser game built with Three.js.

It must run on the university's laboratory hardware, not merely a powerful development machine.

Performance is a primary acceptance requirement.

## 27.1 Target performance

Aim for smooth, responsive gameplay.

Use 60 FPS as an aspirational target on capable hardware.

On weaker lab hardware, prioritise a stable playable frame rate and consistent input latency.

Measure rather than assume performance.

## 27.2 Optimisation requirements

- Reuse geometries and materials.
- Minimise draw calls.
- Pool frequently spawned projectiles and effects where beneficial.
- Avoid constructing Three.js objects inside per-frame loops.
- Keep particle counts bounded.
- Limit active smaller drones.
- Avoid excessive transparent overdraw.
- Avoid unnecessary real-time shadows.
- Reuse shader programs where possible.
- Keep textures appropriately sized.
- Avoid unnecessary 4K textures.
- Dispose GPU resources correctly.
- Avoid multiple expensive dynamic lights.
- Avoid unnecessary post-processing passes.

## 27.3 Loading

Preload necessary boss resources before the encounter begins, using the existing loading system.

Avoid sudden shader compilation or large asset loads during the first combat attack.

However, do not introduce an excessive preloading delay merely to eliminate minor stutters.

## 27.4 Profiling

Measure:

- FPS.
- Frame-time consistency.
- Draw calls.
- Triangle counts.
- GPU resource usage.
- Loading time.
- Active projectile counts.
- Active drone counts.
- Major attack performance.
- Phase transition frame times.
- Reset and repeated retry behaviour.

Pay special attention to Phase 2 because it combines more effects and enemies.

---

# 28. CODE ARCHITECTURE

Organise the implementation into cohesive systems aligned with the current repository.

Potential conceptual components include:

```text
FinalBossEncounter
├── ArenaController
├── BossController
│   ├── BossStateMachine
│   ├── BossAttackDirector
│   ├── BossHealth
│   ├── BossWeakPoint
│   ├── BossMovement
│   └── BossPresentation
├── SpecimenCombat
│   ├── SpecimenMovementConfig
│   ├── ElectricGoopWeapon
│   ├── ProjectilePool
│   └── ChargeController
├── ArenaHazards
│   ├── ElectrifiedFloor
│   ├── ShockwaveHazard
│   └── DestructionController
├── DroneDeployment
├── BossEncounterUI
├── BossEncounterAudio
├── BossCinematics
└── EncounterReset
```

This is a conceptual structure, not a mandatory file or class layout.

Do not introduce excessive abstraction.

Follow established source-tree conventions.

Prefer composition and focused responsibilities.

Avoid implementing the entire boss encounter inside one giant scene class.

The major systems must be individually testable.

---

# 29. ATTACK CONFIGURATION

Attack timings and balance values should be centralised.

Suggested configuration parameters:

```text
Boss:
- Maximum health
- Phase transition threshold
- Movement speed
- Hover height
- Vulnerability duration
- Recovery duration
- Attack cooldowns

Laser attacks:
- Telegraph duration
- Lock-on duration
- Beam duration
- Sweep speed
- Damage
- Collision width

Drone deployment:
- Drones per wave
- Maximum active drones
- Spawn interval
- Drone health
- Drone attack behaviour

Electric goop:
- Normal damage
- Charged damage
- Charge duration
- Projectile speed
- Projectile lifetime
- Explosion radius

Arena hazards:
- Telegraph duration
- Active duration
- Damage
- Recovery duration

Player:
- Encounter health or damage allowance
- Movement tuning
- Jump tuning
- Damage invulnerability duration
```

Avoid scattering numbers throughout source files.

Keep the encounter straightforward to tune after playtesting.

---

# 30. IMPLEMENTATION ORDER

Do not attempt to implement the entire encounter as one enormous untested change.

Work through logical, verifiable milestones.

## Milestone 1 — Investigation and grey-box arena

- Inspect existing architecture.
- Create the Room 4 integration.
- Implement the arena geometry.
- Implement entrance and exit locations.
- Add perimeter traversal.
- Add camera boundaries and collision.
- Verify movement around the entire arena.

**Acceptance:** The Specimen can navigate the complete grey-box arena without collision, camera, or softlock problems.

## Milestone 2 — The Specimen combat

- Integrate merged character state.
- Implement movement enhancements.
- Implement normal electric-goop attack.
- Implement charge mechanics.
- Implement fully charged explosion.
- Verify small drone destruction.
- Verify projectiles and effect cleanup.

**Acceptance:** The player can move, jump, aim, charge, fire, and destroy small drones reliably.

## Milestone 3 — Boss model and base controller

- Construct boss hierarchy.
- Implement hovering and repositioning.
- Implement health.
- Implement armour.
- Implement weak-point exposure.
- Implement boss HUD.
- Implement damage reactions.

**Acceptance:** Boss can be spawned, rendered, damaged only when vulnerable, and reset.

## Milestone 4 — Phase 1

- Horizontal laser sweep.
- Targeted laser.
- Drone deployment.
- Predefined attack sequences.
- Vulnerability windows.
- Damage and defeat handling.

**Acceptance:** Phase 1 is playable and has fair, recognisable attack patterns.

## Milestone 5 — Phase 2

- Phase transition.
- Enhanced boss presentation.
- Shockwave attack.
- Electrified floor sectors.
- Charged devastation beam.
- Environmental damage.
- Drone-chain interaction where feasible.

**Acceptance:** Phase 2 is playable, visually distinct, and does not introduce unavoidable attacks or softlocks.

## Milestone 6 — Cinematics and audiovisual polish

- Intro cinematic.
- Phase transition cinematic.
- Defeat cinematic.
- Exit sequence.
- Lighting.
- Audio.
- Particle effects.
- UI improvements.

**Acceptance:** A complete encounter can be played from the Room 4 entrance through the ending.

## Milestone 7 — Optimisation and validation

- Refactor duplicated systems.
- Test reset behaviour.
- Run existing test suite.
- Add focused tests.
- Profile performance.
- Validate production build.
- Perform browser verification.
- Inspect for regressions.

**Acceptance:** Encounter is stable, playable, performant, and integrated with the game's existing completion flow.

---

# 31. REQUIRED AUTOMATED TESTS

Create or extend tests using the repository's existing testing framework.

At minimum, cover:

## Boss state

- Correct initial state.
- Combat begins after introduction.
- Health decreases only during valid vulnerability.
- Invulnerable armour blocks damage.
- Phase 2 begins at the configured threshold.
- Phase transition occurs once.
- Defeat occurs once.
- Boss cannot attack after defeat.
- Reset restores Phase 1.

## Boss attacks

- Telegraph precedes damaging state.
- Laser collision matches attack state.
- Locked targeting does not unfairly track after commitment.
- Attack recovery completes.
- Boss cannot execute mutually exclusive attacks simultaneously.
- Attacks are cancelled on death or reset.

## Electric goop

- Normal projectile fires correctly.
- Charge level progresses correctly.
- Maximum charge is capped.
- Normal projectiles destroy small drones.
- Charged projectiles affect multiple drones.
- Boss armour blocks invalid damage.
- Weak-point damage is applied correctly.
- A single explosion does not damage the same target repeatedly.
- Projectiles expire and clean up.

## Small drones

- Spawn cap is enforced.
- Drone destruction occurs once.
- Chain reactions are bounded.
- Reset clears active drones.
- Defeat clears active drones.

## Arena

- Electrified panels telegraph before activation.
- Hazard damage is disabled outside the active state.
- Safe routes remain available.
- Destruction state is resettable.
- Checkpoint restore returns initial collision and visuals.

## Lifecycle

- Pausing suspends appropriate gameplay updates.
- Restart restores encounter state.
- Level unload disposes resources.
- Re-entering the encounter does not duplicate listeners.
- Completion fires once.
- Cinematic skip restores controls.
- Repeated retries do not accumulate objects or effects.

---

# 32. MANUAL GAMEPLAY VERIFICATION

Automated tests alone are insufficient.

You must manually inspect the encounter in a real browser where tooling permits.

Perform at least the following checks:

1. Enter Room 4 naturally through Level 3.
2. Observe introductory cinematic.
3. Skip the introduction and verify controls.
4. Inspect the boss from several camera angles.
5. Test normal electric-goop firing.
6. Test maximum charge.
7. Destroy one small drone.
8. Destroy several small drones with one charged shot.
9. Dodge the horizontal laser.
10. Dodge the targeted laser.
11. Damage the exposed boss core.
12. Trigger the Phase 2 transition.
13. Verify the arena visibly changes.
14. Dodge shockwave attacks.
15. Avoid electrified floor sectors.
16. Survive the charged devastation beam.
17. Complete the boss fight.
18. Verify the defeat cinematic.
19. Verify the exit and level completion.
20. Die and retry the encounter.
21. Restart without refreshing.
22. Pause and resume.
23. Check camera collisions.
24. Check console errors.
25. Check missing assets.
26. Check frame-time spikes.
27. Check repeated retry memory stability.
28. Verify earlier levels still work.

Use the existing production verification workflow wherever available.

Do not claim browser validation occurred unless it was actually performed.

---

# 33. FINAL VISUAL QUALITY REQUIREMENTS

Do not accept the first visually functional result as complete.

Perform a deliberate art-direction pass.

The room should have:

- Clear architectural identity.
- Strong sense of scale.
- Cohesive materials.
- Purposeful lighting.
- Recognisable machinery.
- Well-placed visual details.
- Distinct height layers.
- Clear navigation.
- Consistent colour palette.
- Readable hazards.
- Strong boss silhouette.

The boss should have:

- Distinct proportions.
- Carefully grouped armour.
- Recognisable weapon systems.
- Hierarchical animation.
- Strong energy-core presentation.
- Noticeable phase changes.
- Meaningful damage feedback.

The Specimen should have:

- Recognisable merged identity.
- Strong movement animation.
- Distinct electric-goop effects.
- Clear charging visuals.
- Appropriate glow without overwhelming the environment.

The final result should feel like part of the same game as the previous three levels, but larger in scale and intensity.

Avoid generic placeholder geometry in the final presentation.

However, preserve gameplay clarity above decorative complexity.

---

# 34. DESIGN PRINCIPLES THAT MUST NOT BE VIOLATED

### Principle 1 — Combat must be fair

The player should lose because they failed to respond to an understandable attack, not because of invisible collision or unpredictable timing.

### Principle 2 — Mobility must matter

The Specimen's upgraded movement must be useful throughout the encounter.

Do not create an arena where the optimal strategy is standing still and repeatedly shooting.

### Principle 3 — Charging must matter

Fully charged electric-goop attacks must provide meaningful strategic advantages.

### Principle 4 — Vulnerability windows must matter

The boss cannot be defeated by mindlessly firing into its armour.

### Principle 5 — Phase 2 must feel different

Do not simply increase boss movement speed and damage.

Change the presentation, attack combinations, and environmental hazards.

### Principle 6 — The arena is part of the fight

The floor, walkways, cover, and elevation must influence combat decisions.

### Principle 7 — No softlocks

The player must always retain a valid way to continue or retry.

### Principle 8 — Performance is mandatory

The encounter must remain practical for Chrome on modest Ubuntu laboratory hardware.

### Principle 9 — Integration over reinvention

Reuse established Specimen systems wherever practical.

### Principle 10 — Polish over unnecessary complexity

If a feature makes the encounter less stable, less readable, or significantly slower, simplify it.

---

# 35. SCOPE PRIORITIES

Implement features in the following order of importance.

## P0 — Essential

These must work for the encounter to be considered complete:

- Room 4 integration.
- Navigable boss arena.
- Merged Specimen movement.
- Electric-goop weapon.
- Charged attack.
- Main boss model.
- Boss health bar.
- Two combat phases.
- Telegraphing.
- Laser attacks.
- Drone summoning.
- Boss vulnerability windows.
- Player failure and retry.
- Boss defeat.
- Level completion.
- Resource cleanup.

## P1 — High-priority polish

- Raised perimeter.
- Environmental hazards.
- Phase 2 arena changes.
- Strong lighting.
- Attack sound effects.
- Boss damage reactions.
- Intro cinematic.
- Defeat cinematic.
- Charge indicators.
- Distinctive custom shader effects.

## P2 — Optional enhancements

- Detailed scientist silhouettes.
- Advanced armour deformation.
- More elaborate environmental destruction.
- Chain-reaction stagger mechanics.
- Additional cosmetic debris.
- Complex cutscene choreography.
- Extra background machinery animations.

Do not sacrifice P0 reliability to complete P2 effects.

If scope becomes constrained, prioritise a complete two-phase encounter with strong readability and stable performance.

---

# 36. DEFINITION OF DONE

Do not consider this feature complete until all of the following are true:

- The player can enter Room 4 normally.
- The boss introduction works.
- The Specimen can navigate the arena.
- Enhanced movement is noticeably useful.
- Normal electric-goop projectiles work.
- Charged electric-goop projectiles work.
- Small drones can be destroyed.
- Multiple small drones can be destroyed using a charged projectile.
- The boss has an appropriate health bar.
- The boss uses clear predefined attack patterns.
- The player can dodge attacks reliably.
- The boss exposes weak points.
- Attacking those weak points causes correct damage.
- Phase 1 functions from start to transition.
- Phase 2 functions from transition to defeat.
- Phase 2 introduces meaningful environmental changes.
- The player can fail and retry.
- The arena resets correctly.
- Boss defeat triggers once.
- The ending sequence works.
- Level 3 completion is preserved.
- No significant regression occurs in previous rooms or levels.
- No unexplained console or WebGL errors occur.
- Production type-check and build pass.
- Relevant automated tests pass.
- Performance is measured.
- GPU resources and listeners are cleaned up.
- The implementation is maintainable.
- Visual quality is consistent with Specimen.
- The entire encounter can be completed without reloading the page.

---

# 37. FINAL REPORT FORMAT

When implementation is complete, report:

## A. Summary

Describe the final implemented encounter and how it plays.

## B. Architecture

Explain:

- New systems.
- Reused systems.
- Main source files.
- Major state machines.
- Damage and collision handling.
- Room integration.

## C. Arena

Describe:

- Geometry.
- Navigation.
- Cover.
- Elevation.
- Environmental hazards.
- Phase 2 changes.

## D. The Specimen

Describe:

- Movement enhancements.
- Normal attack.
- Charged attack.
- Drone destruction.
- Damage handling.

## E. Boss

Describe:

- Model and presentation.
- Phase 1 attacks.
- Phase 2 attacks.
- Vulnerability mechanics.
- Health and damage tuning.
- Defeat handling.

## F. Cinematics and presentation

Describe:

- Intro.
- Phase transition.
- Defeat.
- Lighting.
- Audio.
- Shaders.
- UI.

## G. Validation

Provide:

- Automated test results.
- Type-check results.
- Build results.
- Browser verification results.
- Performance measurements.
- Memory/resource findings.
- Any unresolved issues.

## H. Git

Provide:

- Branch name.
- Commit hashes.
- Working tree status.
- Whether anything was pushed.
- Whether a PR was opened.

## I. Local testing

Provide exact commands and instructions to test the encounter locally.

Explain how to reach the room through ordinary gameplay.

If a development-only shortcut exists, document it separately.

---

# 38. FINAL INSTRUCTION

The final boss of Specimen must be the culmination of the entire game.

The player should experience a dramatic shift:

They are no longer a vulnerable slime attempting to escape a research facility.

They have become a powerful combined organism, and the facility is now desperately attempting to eliminate them.

The boss must be enormous, threatening, and visually distinctive.

The arena must be an industrial extermination chamber with a massive overhead deployment system, a central combat floor, elevated walkways, emergency warning systems, and meaningful hazards.

Combat must reward mobility, dodging, timing, and strategic use of powerful electric-goop projectiles.

The fight must have two clear phases.

Phase 1 should feel controlled and deliberate.

Phase 2 should feel desperate and increasingly destructive.

The drone must only be meaningfully vulnerable during clearly communicated attack openings.

The player must be able to destroy smaller drones individually or eliminate groups with a fully charged electric-goop attack.

The climax should end with the drone's destruction, a catastrophic facility reaction, and The Specimen's escape.

**Build something memorable, mechanically fair, visually impressive, maintainable, and performant.**

Start by investigating the existing repository and preparing the implementation approach.

Then implement the encounter incrementally, verifying each milestone.

Do not push changes or open a pull request without explicit instruction.

Do not declare success based solely on a successful compilation.

**The objective is a complete, polished, playable final boss encounter worthy of ending Specimen.**