# Level 2 — Room 4: Elevator Descent Drone Gauntlet

## 1. Room Identity

**Core identity:**  
A 60-second downward elevator survival sequence where Bob and Goop are trapped together while waves of security drones descend from above. Goop must destroy the drones indirectly by dissolving the cables suspending them before they reach firing range.

This room should feel significantly different from the more conventional traversal and puzzle rooms before it. Instead of asking the player to figure out where to go, the room temporarily removes exploration and turns the elevator itself into a moving combat-puzzle arena.

The player already understands:

- Bob's movement.
- Bob's jumping and bouncing.
- Bob's sticky traversal.
- Switching between Bob and Goop.
- Goop's acid projectile.
- Goop's ability to dissolve specially marked objects.
- Drones from the previous room.
- The rule that **Goop cannot directly dissolve drones themselves**.
- The rule that drone support cables/ropes **can** be dissolved.

Room 4 takes those existing mechanics and asks the player to perform them quickly and accurately under increasing pressure.

---

# 2. High-Level Player Experience

The intended emotional progression is:

**Quiet descent → Suspicion → First drone tutorial → Short recovery → Escalation → Pressure → Large final assault → Relief**

The room should initially feel almost too calm.

The elevator begins descending.

Nothing happens for roughly the first 15 seconds.

The player gets time to:

- Look around.
- Understand that this elevator is travelling much farther than the Level 1 elevator.
- Notice the huge vertical shaft above and below them.
- Position Bob and Goop.
- Hear the machinery.
- Realise they are trapped in the elevator for the duration of the descent.

Then something appears high above.

A single drone begins rapidly descending toward the elevator while hanging from a cable.

This first drone teaches the room's entire rule:

> **Shoot the cable before the drone gets close enough to fire.**

Once that concept is established, the room gradually increases the number of drones until the player is defending the elevator against five consecutive descending drones shortly before reaching the bottom.

The complete sequence lasts approximately **60 seconds**.

---

# 3. Elevator Entry

## 3.1 Entry Layout

Room 4 begins with Bob and Goop arriving at a large industrial elevator.

The elevator should feel substantially larger and heavier than the elevator used in Level 1.

Suggested dimensions:

- Large enough for both slimes to move comfortably.
- Large enough that drone targeting creates meaningful movement.
- Small enough that the player cannot simply run indefinitely to avoid fire.
- Roughly square or slightly rectangular.

Example conceptual dimensions:

- Width: 8–10 metres.
- Length: 8–10 metres.
- Low railing or reinforced edge around the platform.
- Central mechanical section or floor detailing without obstructing movement too heavily.

The platform should remain visually readable even when several drones are descending overhead.

---

# 4. Both Slimes Are Required

The elevator **must not activate unless both Bob and Goop are physically inside it**.

This should be explicitly communicated rather than appearing broken.

## 4.1 Detection

The elevator has a containment/scanner zone covering the platform.

It tracks:

- Bob inside elevator: YES / NO
- Goop inside elevator: YES / NO

Example elevator status display:

> SPECIMEN COUNT  
> BOB ........ PRESENT  
> GOOP ....... REQUIRED

Once Bob enters:

> BOB ........ PRESENT  
> GOOP ....... REQUIRED

Once Goop also enters:

> BOB ........ PRESENT  
> GOOP ....... PRESENT  
> DESCENT AUTHORIZED

The elevator doors then close.

---

# 5. Preventing Accidental Activation

The elevator should not immediately depart the exact frame both slimes touch the platform.

Instead:

1. Both slimes enter.
2. Scanner confirms both specimens.
3. A short 1–2 second confirmation period occurs.
4. Elevator doors close.
5. Warning light activates.
6. Machinery starts.
7. Elevator begins descending.

This gives the player time to understand that they have started the set-piece.

---

# 6. Locking the Encounter

Once descent begins:

- The elevator cannot be exited.
- The entrance door remains locked.
- The player cannot fall through gaps around the elevator.
- Bob and Goop remain on the platform.
- Slime swapping remains fully available.
- The elevator continues descending regardless of which slime is currently controlled.

The entire encounter should be deterministic enough that retrying feels fair.

---

# 7. Elevator Descent

## Duration

**Total descent time: approximately 60 seconds.**

The elevator should move continuously downward rather than repeatedly stopping for encounters.

Its movement is part of the spectacle.

The shaft moves past the player while the elevator stays visually stable relative to the camera/player.

---

# 8. Elevator Movement Profile

The elevator should not instantly begin at full velocity.

Suggested movement:

### 0–2 seconds

Slow acceleration downward.

### 2–57 seconds

Stable descent speed.

### 57–60 seconds

Smooth deceleration approaching the destination.

The drone timeline should be based on **authoritative elevator encounter time/progress**, not loosely chained animation callbacks.

This means the encounter remains synchronized even if the game's frame rate fluctuates.

---

# 9. Camera Behaviour

The normal gameplay camera should remain active.

Do **not** make the whole encounter a cutscene.

The player needs full camera control because spotting descending cables is part of the challenge.

However, the camera can subtly help.

## Initial Descent

When the elevator begins moving:

- Slightly widen the camera framing.
- Allow more of the shaft above the player to remain visible.
- Avoid ceilings or platform geometry obstructing upward aiming.

## Drone Arrival

Do not forcefully snap the camera toward drones.

Instead use:

- Audio cues.
- Lighting cues.
- HUD indicators.
- Cable movement.
- Drone engine sound.

The player should remain responsible for finding and shooting threats.

---

# 10. Shaft Design

The elevator travels through a very deep industrial shaft.

The environment should communicate genuine vertical movement.

Potential shaft elements:

- Structural beams passing upward.
- Pipes.
- Maintenance platforms.
- Broken laboratory sections.
- Warning lights.
- Moving shadows.
- Ventilation openings.
- Electrical conduits.
- Occasional sparks.
- Numbered depth markers.
- Security signage.
- Emergency lamps.

The shaft should not simply be an empty box.

---

# 11. Performance-Friendly Illusion of Depth

The entire 60-second shaft does not necessarily need to exist as enormous physical geometry.

A looping/recycled environment system can be used.

For example:

- Several shaft modules positioned vertically.
- Once a module moves sufficiently above the player, recycle it beneath the elevator.
- Randomise minor decorative pieces if necessary.
- Keep collision simple.
- Keep the illusion of continuous downward travel.

The elevator's authoritative vertical progress can still represent the story/gameplay descent even if environmental modules are recycled.

This prevents an unnecessarily enormous level and keeps rendering costs controlled.

---

# 12. Core Drone Mechanic

Each attacking drone is suspended from a cable.

The cable extends upward toward an unseen mechanism somewhere above the elevator.

The drone descends along with the cable.

The drone itself **cannot be dissolved by Goop**.

The cable **can be dissolved by Goop**.

Therefore:

> Goop must shoot the cable.

Once the cable is sufficiently dissolved:

1. Cable breaks.
2. Drone loses support.
3. Drone falls.
4. Drone crashes onto/below the elevator or falls past it.
5. Drone becomes permanently deactivated.
6. It no longer shoots.
7. Threat is removed.

This keeps the established drone rules consistent.

---

# 13. Why the Cable Matters

The player should never be encouraged to spam acid directly at the drone body.

Direct drone hits should provide clear feedback that they do nothing.

Possible feedback:

- Acid splashes harmlessly.
- Metallic spark.
- Small ricochet effect.
- No dissolve shader.
- No health reaction.
- Distinct "ineffective hit" sound.

Cable hits should be dramatically different:

- Acid sticks.
- Cable begins glowing/corroding.
- Small fumes.
- Dissolve effect.
- Cable strands visibly weaken.
- Stronger audio feedback.
- Cable eventually snaps.

The player immediately understands:

**Drone = wrong target.  
Cable = correct target.**

---

# 14. Drone Descent Behaviour

When a drone first enters the encounter it should descend **faster than the elevator**.

This creates the impression that the drone is actively being lowered toward the specimens.

The descent has two phases.

## Phase A — Rapid Approach

The drone enters far above the elevator.

It travels downward rapidly.

During this period:

- It does not fire.
- It is visible.
- Its cable can already be attacked.
- The player is rewarded for noticing it quickly.

## Phase B — Threat Tracking

Once the drone reaches a predetermined height above the elevator, it slows down.

From this point onward its vertical speed approximately matches the elevator's descent.

This keeps it suspended above the platform rather than immediately flying past.

At this stage the drone is entering its firing zone.

---

# 15. Suggested Vertical Zones

Use configurable distances rather than hard-coding behaviour directly into animation.

Example conceptual values:

### Spawn Zone

~25–35 metres above elevator.

Drone appears.

### Early Attack Opportunity

~15–25 metres above elevator.

Drone visible and vulnerable but not shooting.

### Warning Zone

~10–15 metres above elevator.

Drone begins target acquisition.

### Firing Zone

~7–10 metres above elevator.

Drone begins firing rapidly.

### Critical Zone

~4–6 metres above elevator.

Drone is now dangerously close and should be extremely difficult to ignore.

Exact values must be tuned according to camera FOV, acid projectile velocity and elevator dimensions.

---

# 16. Drone Firing Rule

Drones **must not shoot immediately when they spawn**.

They only begin shooting when they reach a relatively short distance above the slimes.

This creates the intended skill test:

> The player has a limited window to destroy the cable before the drone becomes dangerous.

The sequence becomes:

1. Drone appears.
2. Player hears/observes it.
3. Drone rapidly approaches.
4. Goop aims upward.
5. Goop shoots cable.
6. Cable dissolves.
7. Drone falls.

OR:

1. Drone appears.
2. Player reacts too slowly.
3. Drone enters firing range.
4. Drone starts shooting rapidly.
5. Player must dodge while still trying to destroy the cable.
6. Encounter becomes much more difficult.

---

# 17. Drone Targeting

Once firing begins, the drone should target the slimes on the elevator.

Preferred target logic:

- Prioritise the currently controlled slime.
- Occasionally evaluate the other slime.
- Do not instantly kill inactive slimes because the player happened to be controlling Goop/Bob.
- Avoid unavoidable hits immediately after switching.

For gameplay readability, the drone should telegraph its target.

Example:

1. Red targeting laser appears.
2. Drone tracks target for a short duration.
3. Brief charging sound.
4. Projectile/beam fired.
5. Short recovery.
6. Repeat.

Later waves can shorten the interval slightly, but the mechanics themselves should remain consistent.

---

# 18. Drone Accuracy

Drone shots should be threatening without becoming hitscan punishment.

Prefer projectiles or short telegraphed bursts.

The player should be capable of:

- Seeing a shot coming.
- Moving sideways.
- Jumping.
- Switching position.
- Using Bob's mobility.
- Continuing to shoot as Goop under pressure.

The room should test accuracy and composure rather than requiring the player to absorb unavoidable damage.

---

# 19. Role of Bob

Goop is the main offensive slime during this encounter, but Bob must still matter.

Bob's role is primarily:

- Survival.
- Dodging.
- Repositioning.
- Potentially drawing fire.
- Remaining safely inside the elevator.
- Providing an alternative body if Goop is under direct pressure.

The player may switch to Bob temporarily to dodge an incoming volley and then switch back to Goop.

This preserves the two-slime identity of the room instead of turning it into a Goop-only shooting gallery.

---

# 20. Role of Goop

Goop is the essential slime.

Goop must:

- Locate incoming drones.
- Identify cables.
- Aim acid upward.
- Lead moving targets if necessary.
- Break cables before firing begins.
- Deal with multiple sequential threats.
- Continue operating while dodging incoming attacks.

The room is effectively Goop's accuracy/timing challenge.

---

# 21. Important Input Requirement

Goop must be able to aim comfortably upward.

Before building this room, verify:

- Camera pitch allows sufficient upward aiming.
- Projectile spawning works at steep camera angles.
- Projectile collision works correctly against narrow cables.
- Cable hitboxes are forgiving enough.
- Elevator roof geometry does not block shots.
- Bob/Goop bodies do not interfere with projectile raycasts.
- Camera collision does not force the camera into an unusable position.

This room will expose weaknesses in the shooting system very quickly.

---

# 22. Cable Hitbox Design

The visible cable can be relatively thin, but the gameplay hitbox should be slightly more generous.

The player is firing at a moving target while:

- The elevator is moving.
- The drone is moving.
- The camera is moving.
- Multiple drones may be present.
- The player may be dodging.

Therefore the gameplay collision radius should be larger than the exact visual cable diameter.

Do not make this feel like pixel hunting.

---

# 23. Cable Dissolve Time

The cable should not require excessive repeated hits.

Preferred options:

### Option A — One accurate acid shot

A successful projectile sticks to the cable and rapidly corrodes through it.

Advantages:

- Very readable.
- Rewards accuracy.
- Good for later five-drone wave.
- Avoids tedious spam.

### Option B — Two quick hits

Cable requires two acid hits.

Advantages:

- Slightly higher difficulty.
- Gives dissolve feedback time.

For this particular room, **one strong accurate hit or one projectile that causes a short automatic corrosion process is recommended**.

The challenge should come from locating and hitting many moving cables, not pumping damage into each individual cable.

---

# 24. Cable Destruction Sequence

On successful acid impact:

### 0.00 s

Projectile hits cable.

### 0.00–0.15 s

Bright corrosive splash.

### 0.15–0.50 s

Acid travels slightly around cable.

### 0.50–0.80 s

Cable visibly weakens.

### ~0.80 s

Cable snaps.

### Immediately afterwards

Drone drops.

The player receives strong confirmation that the threat has been neutralised.

---

# 25. Drone Falling Sequence

When the cable breaks:

- Drone stops tracking.
- Weapon immediately disables.
- Drone tilts uncontrollably.
- Sparks appear.
- Drone falls downward.
- Falling speed increases.
- Drone disappears below the platform/into shaft darkness or collides with some environment below.

If visually appropriate, a drone may strike the elevator before falling away, but this should be presentation-only and not randomly damage the slimes.

---

# 26. Drone Destruction Feedback

Each successful drone takedown should feel satisfying.

Use several feedback layers:

### Visual

- Cable dissolve.
- Sparks.
- Falling drone.
- Brief weapon shutdown.
- Small electrical burst.

### Audio

- Acid impact.
- Cable sizzling.
- Cable snap.
- Drone alarm/glitch.
- Falling mechanical whistle.
- Distant crash.

### UI

Optional subtle indicator:

> SECURITY UNIT DISCONNECTED

Avoid large UI messages for every drone because later waves would clutter the screen.

---

# 27. Encounter Timeline

The elevator encounter begins at **T = 0 seconds** when descent actually starts.

Approximate timeline:

| Time | Event |
|---|---|
| 0 s | Elevator begins descending |
| 0–15 s | Calm descent / atmosphere |
| 15 s | Wave 1: 1 drone |
| 25 s | Wave 2: 3 drones sequentially |
| 35 s | Wave 3: 4 drones sequentially |
| 50 s | Wave 4: 5 drones sequentially |
| 57 s | Elevator begins slowing |
| 60 s | Elevator reaches destination |

The exact individual drone spacing should be tuned during playtesting.

---

# 28. Phase 1 — Initial Descent

## T = 0–15 seconds

No drones attack.

This is deliberate.

The player should experience the depth of the descent.

Use this period for atmosphere.

Possible events:

- Elevator machinery groans.
- Depth numbers decrease/increase.
- Lights pass by.
- Shaft becomes darker.
- Distant security alarms.
- Wind grows louder.
- Occasional sparks.
- Radio/static-like facility audio.

The player should start wondering:

> "Why is this elevator taking so long?"

At approximately 12–13 seconds, subtly foreshadow the first threat.

Possible warning:

- Metallic mechanism far above.
- Drone activation chirp.
- Red light appears above.
- Cable rattling.
- Security system beep.

Do not explicitly tell the player what to do yet.

---

# 29. Wave 1 — Tutorial Drone

## T ≈ 15 seconds

**Drone count: 1**

This is the tutorial for the encounter.

The drone appears far above.

It initially descends rapidly.

The player should have several seconds before it reaches firing range.

Because there is only one target, the player can focus entirely on understanding the mechanic.

Suggested spawn behaviour:

1. Cable mechanism sound.
2. Drone enters view.
3. Drone red light activates.
4. Drone rapidly descends.
5. Cable remains highly visible.
6. HUD briefly highlights hostile activity.

If the player aims at the drone itself:

- Direct hit does nothing meaningful.

If the player hits the cable:

- Cable dissolves.
- Drone falls.

---

# 30. Optional First-Wave Assistance

For the very first drone only, the game may provide a subtle hint if the player fails to understand the mechanic.

Example after the drone has been visible for ~2 seconds:

> **CORROSIVE MATERIAL DETECTED — SUPPORT CABLE**

Or:

> **GOOP: DISSOLVE CABLE**

This should only appear if necessary.

Do not repeat the tutorial prompt throughout later waves.

---

# 31. Wave 1 Failure Pressure

If the first drone reaches firing range:

- It begins firing.
- Fire rate should initially be moderate.
- Player still has enough time to understand what went wrong.
- Do not immediately overwhelm them.

Wave 1 should teach through consequences rather than instantly killing the player.

---

# 32. Recovery After Wave 1

Once the first drone is destroyed, there should be a short quiet period before Wave 2.

The player should think:

> "Okay. I understand this now."

Then the encounter escalates.

---

# 33. Wave 2 — Three Sequential Drones

## T ≈ 25 seconds

**Drone count: 3**

The three drones should **not drop simultaneously**.

They descend sequentially.

The intent is to test whether the player can repeat the newly learned action quickly.

Suggested spacing:

- Drone 2A at 25.0 s
- Drone 2B at ~27.0 s
- Drone 2C at ~29.0 s

Exact spacing should be tuned.

The next drone can appear while the previous one is still falling.

This prevents the encounter from becoming:

shoot → wait → shoot → wait.

Instead it becomes increasingly rhythmic.

---

# 34. Wave 2 Behaviour

The three drones can use slightly different horizontal positions.

Example:

- Drone A — left side.
- Drone B — right side.
- Drone C — centre/back.

This forces camera movement.

Do not repeatedly spawn every drone directly above the same point.

---

# 35. Wave 2 Learning Goal

The player learns:

> "I cannot tunnel-vision one location. I need to scan the shaft."

This is the first genuine execution wave.

A competent player should be able to destroy all three before they fire.

A slower player may allow one drone into firing range.

That creates manageable pressure without overwhelming them.

---

# 36. Wave 3 — Four Sequential Drones

## T ≈ 35 seconds

**Drone count: 4**

This is the first serious wave.

Suggested conceptual spacing:

- 35.0 s
- 37.0 s
- 39.0 s
- 41.0 s

The exact gap may vary between roughly 1.5–2.0 seconds.

At least one moment should allow two drones to be visible simultaneously.

This is important because otherwise "four drones" simply feels like four independent repetitions.

---

# 37. Wave 3 Pressure

The player should now need to:

- Destroy a cable.
- Immediately scan for the next drone.
- Re-aim.
- Possibly dodge fire.
- Switch if necessary.
- Continue tracking the elevator surroundings.

The room has now transitioned from tutorial to challenge.

---

# 38. Wave 3 Spawn Pattern

Suggested pattern:

### Drone 3A

Front-left.

### Drone 3B

Back-right.

### Drone 3C

Front-right.

### Drone 3D

Near centre but slightly farther away.

This encourages large camera sweeps.

However, every cable should remain realistically visible from the elevator.

Do not spawn drones behind solid shaft geometry.

---

# 39. Recovery Before Final Wave

After Wave 3 resolves, provide a noticeable pause.

Approximately **8–9 seconds** of relative calm can occur before the final wave begins around T = 50.

This is valuable.

Without recovery, the encounter becomes one continuous stream and loses pacing.

During this pause:

- Elevator continues descending.
- Music tension remains.
- Player hears machinery.
- Shaft environment changes.
- Destination may begin appearing far below.
- Player might falsely believe the encounter is finished.

Then:

**security alarm spikes.**

Final wave begins.

---

# 40. Wave 4 — Five Sequential Drones

## T ≈ 50 seconds

**Drone count: 5**

This is the finale.

Because only roughly 10 seconds remain in the descent, these drones need to arrive relatively quickly.

Suggested spacing:

- 50.0 s
- 51.5 s
- 53.0 s
- 54.5 s
- 56.0 s

This is deliberately much faster than the earlier waves.

The player should immediately understand:

> "This is the final assault."

---

# 41. Final Wave Presentation

Make this wave feel more dramatic without changing the fundamental rules.

Possible additions:

- Stronger alarm.
- Red emergency lighting.
- Faster music layer.
- Multiple drone engine sounds overlapping.
- Several red targeting lights visible above.
- Sparks from shaft walls.
- Elevator vibration.
- Facility announcement tone.

No new mechanic should suddenly appear.

The finale should test mastery of everything the room already taught.

---

# 42. Final Wave Difficulty

The five drones should still arrive **sequentially**, not all five at exactly once.

The player needs a realistic opportunity to shoot each cable.

However, their timings should overlap enough that delaying one has consequences.

Ideal skilled-player experience:

1. Shoot cable 1.
2. Immediately rotate.
3. Shoot cable 2.
4. Drone 3 already descending.
5. Shoot cable 3.
6. Hear drone 4.
7. Turn.
8. Shoot.
9. Final drone appears as elevator begins slowing.
10. Destroy cable.
11. Elevator reaches bottom.

This produces a strong rhythm and payoff.

---

# 43. Elevator Arrival During Final Wave

The elevator should begin slowing at approximately T = 57 seconds.

If the player has handled the final wave efficiently, the last drone falls just as the elevator enters the destination chamber.

This creates a satisfying cinematic coincidence:

**Cable snaps → drone falls → elevator brakes → doors open.**

---

# 44. Handling Remaining Drones at T = 60

A deterministic rule is required for drones that remain alive when the elevator reaches the bottom.

Do **not** allow drones to continue floating through the destination room indefinitely.

Recommended behaviour:

When the elevator reaches the secure lower level:

1. Blast door/ceiling shield closes above the elevator.
2. Any drone still above the barrier is blocked from following.
3. Encounter ends.
4. Drone targeting disables.

However, reaching the bottom should not become an easy strategy for ignoring the final wave.

Therefore unresolved drones should remain dangerous until the final few moments.

The player survives by dealing with the wave, not simply waiting out the timer.

---

# 45. Recommended Success Condition

The elevator reaching the bottom is the structural completion condition.

The player does **not necessarily need to destroy 100% of all drones** for the elevator to arrive.

However:

- Leaving drones alive makes survival significantly harder.
- The final blast door removes remaining threats only after arrival.
- Good play means destroying almost every drone before firing begins.

This keeps the room from softlocking if the player misses one late cable.

---

# 46. Failure Condition

Use the game's existing death/failure system.

Failure can occur if:

- Bob dies.
- Goop dies.
- Both become incapacitated according to the game's existing rules.

Because both are narratively required to continue through the level, losing either slime should trigger the appropriate retry/reset behaviour.

---

# 47. Checkpoint Placement

Place a checkpoint **immediately before entering the elevator**.

The player should never need to replay the previous room because they died during this set-piece.

On retry:

- Both Bob and Goop restore outside or at the entrance of the elevator.
- All drones reset.
- Elevator returns to top.
- Encounter timer resets.
- Destroyed cables/drones reset.
- Doors return to initial state.
- Music returns to pre-encounter state.

The retry should be quick.

---

# 48. Optional Faster Retry

After the first failed attempt, consider allowing the checkpoint to place both slimes directly inside the elevator shortly before departure.

This avoids repeatedly performing the simple "put both slimes inside" setup.

However, only do this if it integrates cleanly with the existing checkpoint system.

---

# 49. Drone Spawn Architecture

Use an encounter controller rather than manually scripting thirteen individual drones throughout the level code.

Conceptually:

`ElevatorDroneEncounter`

Responsibilities:

- Track elapsed encounter time.
- Track elevator progress.
- Trigger waves.
- Spawn drones.
- Assign spawn positions.
- Track active drones.
- Resolve drone destruction.
- Control encounter audio.
- Control warning indicators.
- End encounter at destination.
- Reset encounter on death/restart.

---

# 50. Wave Configuration

The waves should be data-driven.

Conceptual structure:

Wave 1:
- startTime: 15
- count: 1
- spacing: 0

Wave 2:
- startTime: 25
- count: 3
- spacing: ~2.0

Wave 3:
- startTime: 35
- count: 4
- spacing: ~2.0

Wave 4:
- startTime: 50
- count: 5
- spacing: ~1.5

This makes balancing easy without rewriting encounter logic.

---

# 51. Important Timing Note

The exact values above should be considered **design targets rather than untouchable constants**.

The desired narrative timing is locked:

- 15 seconds → 1 drone
- +10 seconds → 3 drones
- +10 seconds → 4 drones
- +15 seconds → 5 drones
- total descent ≈ 60 seconds

But individual spacing within each wave should be adjusted after playtesting.

The goal is for the final sequence to feel intense but possible.

---

# 52. Drone Spawn Position System

Create several predefined anchor positions around the elevator shaft.

For example:

- Front-left
- Front-centre
- Front-right
- Left
- Right
- Back-left
- Back-centre
- Back-right

The encounter controller selects a deliberate pattern for each wave.

Avoid fully random spawning.

Hand-authored patterns are easier to balance and make retries feel fair.

Small random horizontal offsets may be added only for visual variation.

---

# 53. Preventing Cheap Spawns

Never spawn a drone:

- Directly outside the camera clipping plane.
- Inside geometry.
- Behind an opaque beam.
- So close that the player cannot react.
- With its cable hidden.
- Directly above another drone in a way that makes the cables indistinguishable.
- At an angle Goop cannot physically aim toward.

Every threat needs to be readable.

---

# 54. Cable Visual Design

The cables need to be immediately recognisable as soluble targets.

Suggested appearance:

- Distinct material from drone metal.
- Slightly thicker than realistic cable.
- High-contrast yellow/industrial coating.
- Small soluble-material markings.
- Subtle pulsing highlight when Goop is active.
- Clear silhouette against the shaft.

The game should not require the player to guess which tiny component is vulnerable.

---

# 55. Optional Goop Target Feedback

When Goop's aim passes over a cable:

- Crosshair subtly changes.
- Cable receives a faint outline.
- Reticle displays corrosive-compatible feedback.

Do not auto-lock onto cables.

The player should still aim.

This is merely confirmation that the target is valid.

---

# 56. Drone Warning Audio

Each newly arriving drone should have a short positional sound.

Examples:

- Cable deployment mechanism.
- Servo activation.
- Electronic chirp.
- Motor whine.

This is crucial in Waves 3 and 4 because the player cannot keep every spawn location on-screen simultaneously.

Positional audio becomes part of threat detection.

---

# 57. Firing Warning Audio

When a drone reaches firing range:

1. Target acquisition beep.
2. Weapon charge.
3. Shot.

The charge sound should be distinctive enough that the player knows:

> "I missed one."

This gives the player an opportunity to dodge without needing the drone onscreen.

---

# 58. Music Structure

The room is well suited to dynamic music.

## 0–15 seconds

Low industrial ambience.

No major combat layer.

## First drone

A tension layer begins.

## Three-drone wave

Percussion/rhythm introduced.

## Four-drone wave

Music intensity increases.

## Final five-drone wave

Full tension layer.

## Elevator arrival

Abrupt release or transition.

The music should reinforce the encounter escalation without becoming exhausting.

---

# 59. Elevator Audio

The elevator itself should have constant mechanical presence.

Use:

- Heavy motor loop.
- Cable tension.
- Rail vibration.
- Wind.
- Structural rattling.
- Occasional metal impact.
- Brake sound near destination.

The elevator's sound should evolve as it accelerates and decelerates.

---

# 60. Environmental Lighting

Lighting should reinforce descent.

Possible progression:

### Upper shaft

Normal facility lighting.

### Middle shaft

Darker and more damaged.

### Later descent

Emergency lights and red warnings.

### Final approach

Lighting from the destination begins appearing below.

This visually communicates progress without needing a timer on screen.

---

# 61. Progress Communication

The player should have some sense of how much longer the ride will last.

Avoid simply displaying:

> 43 SECONDS REMAINING

unless that suits the existing UI.

More immersive approaches:

### Depth display

> DEPTH: 032 m  
> DEPTH: 048 m  
> DEPTH: 071 m

### Progress strip

Industrial elevator panel showing downward progress.

### Floor/depth sectors

> SUBLEVEL 04  
> SUBLEVEL 05  
> SUBLEVEL 06

These provide anticipation during the final wave.

---

# 62. Preventing Camping Exploits

Check for obvious exploits.

The player should not be able to:

- Hide underneath geometry where drones cannot target them.
- Move outside the elevator.
- Shoot drones before they officially spawn.
- Destroy cables through walls.
- Stand somewhere projectiles never reach.
- Cause drones to collide with shaft geometry automatically.
- Leave Goop behind and activate the elevator with Bob.
- wedge inactive slime into doorway to stop departure.
- Jump onto descending drones and escape.

Any collision/geometry allowing these behaviours should be addressed.

---

# 63. Bob's Sticky Ability in the Elevator

Be careful about making elevator walls accidentally sticky.

Unless intentionally desired, the elevator platform itself should use normal surfaces.

If Bob can stick to the elevator's vertical walls, players may use this to avoid projectiles in interesting ways—but it may also cause camera problems in such a confined moving arena.

Recommended initial design:

- Floor is normal.
- Railings/walls are normal.
- No mandatory adhesion during this encounter.

The challenge should remain focused on drone cables.

---

# 64. Bob's Jumping

Bob should still be able to jump/bounce normally.

This gives him a defensive identity.

However:

- Avoid low ceilings.
- Avoid elevator geometry that catches Bob.
- Ensure high jumps do not leave the elevator's collision volume.
- Ensure drone projectiles remain fair against vertical movement.

---

# 65. Goop Mobility

Because Goop cannot climb, the elevator arena must remain completely traversable on the floor.

No part of the encounter should require Goop to reach an elevated platform before shooting.

The challenge is aiming and reaction speed, not traversal.

---

# 66. Inactive Slime Safety

A major design concern is what happens to the slime the player is not controlling.

Do not allow the inactive slime to stand motionless in the centre and absorb every attack unfairly.

Recommended behaviour:

- Drones strongly prefer the active slime.
- Inactive slime can still be damaged if genuinely hit.
- Target switching has a cooldown.
- Drones do not constantly retarget the inactive slime just because it is stationary.

This preserves switching without making inactivity a punishment.

---

# 67. Optional Positioning Strategy

If desired, the elevator can include a small amount of cover.

For example:

- Central control housing.
- Two waist-height machinery units.

This gives Bob and Goop limited defensive positioning.

However:

- Cover must not completely invalidate drones.
- Cables must remain visible.
- It must not clutter aiming.
- Do not turn the encounter into a conventional cover shooter.

A mostly open elevator is probably preferable.

---

# 68. Damage Balance

This should not be a one-hit-kill encounter.

A player who misses one cable should face a dangerous situation, not an unavoidable reset.

The design should allow:

- One mistake.
- Recovery.
- Emergency dodging.
- Destroying a drone after it has begun firing.

The final wave can punish repeated mistakes.

---

# 69. Drone Fire Rate Escalation

Prefer increasing encounter difficulty primarily through **number and timing of drones**, not by secretly changing every drone's statistics.

Keeping drones mechanically consistent is fairer.

Recommended:

- Same basic descent speed.
- Same firing distance.
- Same projectile behaviour.
- Same cable durability.

Escalation comes from:

- More drones.
- Less spacing.
- More camera movement.
- More simultaneous threats.

---

# 70. Wave Completion

A wave is considered resolved when:

- All drones from that wave have had their cables destroyed,

OR

- Any surviving drones remain active while the next wave begins.

Do not force the next wave to wait for the previous wave to be completely cleared.

This is important.

Falling behind should naturally increase difficulty.

If the player fails to destroy Drone 2C before Wave 3 begins, they may now need to deal with that existing threat plus incoming drones.

That is a fair consequence of poor performance.

---

# 71. Maximum Active Drone Protection

Despite the rule above, include a safety cap to prevent catastrophic accumulation.

For example:

- Maximum 5–6 actively firing drones.

If extreme failure somehow exceeds this:

- Delay later spawns slightly.
- Or disable older drones once they fall too low.

This prevents performance issues and impossible situations.

Most normal playthroughs should never hit this cap.

---

# 72. Descent Synchronisation

All drones must understand the elevator's current transform.

When in tracking phase:

`droneDesiredHeight = elevatorHeight + threatOffset`

Do not independently animate them toward absolute world-space heights that stop making sense while the elevator continues moving.

Their tracking needs to account for the moving arena.

---

# 73. Cable Anchor Behaviour

The cable can either:

### A. Extend from a moving overhead carrier

More physically believable.

OR

### B. Extend upward beyond visible darkness

Much simpler.

For this room, option B is completely acceptable.

The player only needs to perceive:

> Drone suspended from vulnerable cable above.

The entire cable mechanism does not need to be simulated.

---

# 74. Physics vs Presentation

Avoid expensive or unstable full rope physics unless already available.

The cable can be:

- A simple line/cylinder.
- Visually stretched between two points.
- Slightly swaying through shader or procedural animation.

When destroyed:

- Hide/remove upper cable section.
- Spawn short falling cable pieces if desired.
- Give drone authored falling motion.

The gameplay does not benefit enough from true rope simulation to justify the complexity.

---

# 75. Falling Drone Collision

Once a drone is disabled:

- It should stop being a harmful combat entity immediately.
- Its falling body can become presentation-only.
- It should not create random physics collisions that knock Bob/Goop off the elevator.
- It should eventually despawn after falling sufficiently far below.

This keeps gameplay deterministic.

---

# 76. Drone Pooling

Because the encounter spawns a total of:

**1 + 3 + 4 + 5 = 13 drones**

consider reusing drone objects through pooling if the current implementation makes creation/destruction expensive.

At minimum:

- Reuse geometry.
- Reuse materials where possible.
- Reuse audio assets.
- Avoid recompiling shaders per drone.
- Avoid allocating unnecessary objects every frame.

The encounter should remain smooth during the five-drone finale.

---

# 77. Acid Projectile Performance

During frantic waves the player may fire many acid projectiles.

Ensure:

- Projectiles have a lifetime.
- Missed projectiles despawn.
- Particle effects are bounded.
- Dissolve effects dispose/reset correctly.
- No lingering collision objects remain.
- No audio sources accumulate indefinitely.

The final wave is an excellent stress test for the projectile system.

---

# 78. HUD During Encounter

The HUD should remain minimal.

Useful elements:

- Current slime.
- Crosshair.
- Existing health/death information if applicable.
- Optional elevator progress.
- Optional incoming-threat indicator.

Avoid giant objective text remaining onscreen for all 60 seconds.

At encounter start, briefly show:

> **DESCEND TO LOWER SECTOR**

After first drone appears:

> **DISSOLVE THE SUPPORT CABLES**

Then fade the message.

---

# 79. Threat Indicators

If drones can arrive outside the current camera view, use subtle directional indicators.

Example:

- Small red marker near screen edge.
- Indicates direction of an approaching drone.
- Only appears once drone is reasonably close.
- Does not reveal exact cable location.
- Disappears when drone is onscreen.

This can significantly improve fairness during the five-drone wave.

---

# 80. Accessibility / Readability

Make sure cable vulnerability is not communicated by colour alone.

Combine:

- Colour.
- Shape.
- Material.
- Dissolve symbol.
- Crosshair feedback.
- Audio.

Similarly, drone firing warnings should use both:

- Visual targeting indicator.
- Audio cue.

---

# 81. First-Time Player Tuning Goal

A first-time player should ideally experience:

### Wave 1

Destroy drone successfully after understanding cable rule.

### Wave 2

Destroy 2–3 drones cleanly.

### Wave 3

Allow perhaps one drone to enter firing range.

### Wave 4

Feel under serious pressure and potentially take damage, but still survive with competent play.

This gives the encounter a satisfying escalation curve.

---

# 82. Experienced Player Tuning Goal

A skilled player should be able to:

- Recognise drone spawn sounds.
- Snap aim toward cables.
- Destroy most drones before they fire.
- Complete the room cleanly.
- Feel rewarded for mastery.

The room should become satisfying rather than tedious on repeat attempts.

---

# 83. Avoiding Excessive Difficulty

If testing shows the encounter is too difficult, reduce difficulty in this order:

1. Increase cable hitbox.
2. Increase pre-fire distance/time.
3. Increase spacing between drones.
4. Slow rapid descent slightly.
5. Reduce drone firing accuracy.
6. Reduce projectile speed.
7. Reduce final-wave count only as a last resort.

The intended 1 → 3 → 4 → 5 escalation is a strong part of the room's identity and should be preserved if possible.

---

# 84. Avoiding Excessive Ease

If the encounter is too easy:

1. Reduce inter-drone spacing slightly.
2. Move spawn locations farther apart horizontally.
3. Shorten target acquisition delay.
4. Make Wave 4 overlap more heavily.
5. Increase drone projectile pressure slightly.

Do not make cable hitboxes tiny.

Difficulty should come from pressure, not frustrating aiming precision.

---

# 85. Elevator Arrival

At approximately 60 seconds:

1. Elevator begins strong braking sequence.
2. Mechanical brakes engage.
3. Platform shakes slightly.
4. Lighting below becomes brighter.
5. Elevator enters lower chamber.
6. Ceiling/security barrier seals above.
7. Remaining drone threat is cut off.
8. Elevator comes to complete stop.
9. Combat music fades/releases.
10. Door unlock indicator activates.
11. Doors open.

The player should experience a clear moment of relief.

---

# 86. End-of-Encounter Pause

Do not open the doors the same frame the final wave ends.

Give approximately 1–2 seconds after the elevator stops.

Use:

- Brake hiss.
- Mechanical locks.
- Green light.
- Quiet ambience.

Then:

> ACCESS GRANTED

Doors open into the next room.

This gives the encounter a proper ending.

---

# 87. Transition Into Room 5

Room 5 should begin immediately beyond the elevator doors.

The contrast should be noticeable.

After a loud, frantic 60-second set-piece, the next area can initially be quieter.

This gives the player time to recover before the next challenge.

---

# 88. Narrative Function

The elevator should communicate that Bob and Goop are moving deeper into the facility.

The security response also establishes that the facility now recognises the escaping specimens as a serious problem.

The escalation from:

- one drone,
- to three,
- to four,
- to five,

makes the facility feel increasingly desperate.

The room therefore advances both gameplay and environmental storytelling.

---

# 89. Why Both Slimes Need to Be Present

Requiring Bob and Goop before descent is important for more than puzzle gating.

It guarantees:

- Goop is available for the cable mechanic.
- Bob cannot progress alone.
- Goop cannot progress alone.
- The story keeps both slimes together.
- The encounter can confidently design around switching.
- The player cannot accidentally strand a slime above the elevator.

This should be treated as a hard requirement.

---

# 90. Softlock Protection

Before descent begins:

- Both slimes required.

After descent begins:

- Neither slime can leave.

When descent ends:

- Both slimes must still be transported to the destination.

On retry:

- Both return together.

Never create a state where one slime reaches the bottom while the other remains 60 seconds above.

---

# 91. Technical State Machine

Suggested elevator encounter states:

`WAITING_FOR_SLIMES`

→ both present

`PREPARING_DESCENT`

→ doors close

`DESCENDING_INTRO`

→ 0–15 s

`WAVE_1`

→ first drone

`WAVE_2`

→ three drones

`WAVE_3`

→ four drones

`FINAL_WAVE`

→ five drones

`ARRIVAL`

→ elevator braking

`COMPLETE`

This makes debugging significantly easier than a collection of independent timers.

---

# 92. Drone State Machine

Suggested drone states:

`SPAWNING`

→ visible high above elevator

`FAST_DESCENT`

→ approaching rapidly

`TRACKING_DESCENT`

→ matches elevator movement

`TARGETING`

→ threat warning

`FIRING`

→ attacking slimes

`CABLE_DISSOLVING`

→ successful Goop hit

`FALLING`

→ disabled

`DESPAWNED`

Ensure a cable hit can interrupt:

- targeting,
- firing,
- or descent.

Once cable destruction begins, the drone should stop firing immediately or almost immediately.

---

# 93. Reset Requirements

A room reset must restore:

- Elevator position.
- Elevator velocity.
- Elevator doors.
- Encounter timer.
- Wave indices.
- Spawned drones.
- Drone cable states.
- Dissolve effects.
- Projectiles.
- Drone audio.
- Combat music.
- Environmental warning lights.
- Bob position.
- Goop position.
- Any damage state required by checkpoint behaviour.

No residual drone should survive between attempts.

---

# 94. Debug Tools

During implementation, add temporary debugging information for:

- Encounter timer.
- Elevator progress percentage.
- Current wave.
- Pending drones.
- Active drones.
- Drone state.
- Drone distance from elevator.
- Firing threshold.
- Cable hit state.
- Spawn location ID.

This room has enough synchronized systems that debugging only by watching it visually will waste time.

---

# 95. Suggested Test Cases

## Elevator Activation

- Bob alone → no descent.
- Goop alone → no descent.
- Both inside → descent begins.
- Bob leaves before countdown → countdown cancelled.
- Goop leaves before countdown → countdown cancelled.
- Both present after doors close → encounter proceeds.

## Drone Cable

- Shoot drone → no dissolve.
- Shoot cable → dissolve starts.
- Shoot cable while drone descending → valid.
- Shoot cable while drone targeting → valid.
- Shoot cable while drone firing → valid.
- Cable breaks → weapon disables.
- Falling drone cannot fire.

## Encounter

- Wave 1 starts around 15 s.
- Wave 2 starts around 25 s.
- Wave 3 starts around 35 s.
- Wave 4 starts around 50 s.
- Arrival occurs around 60 s.
- Previous surviving drones can overlap later waves.
- Final arrival properly clears/blocks remaining threats.

## Reset

- Die during Wave 1.
- Die during Wave 2.
- Die during Wave 3.
- Die during Wave 4.
- Retry each case.
- Ensure timer and drone state return to initial values.

---

# 96. Performance Test

Specifically test Wave 4 while:

- Five drones are active/appearing.
- Several acid projectiles are flying.
- Dissolve effects are active.
- Drone particles are active.
- Elevator environment is moving.
- Dynamic sounds are playing.
- Both slime shaders are visible.

Watch:

- FPS.
- Draw calls.
- Geometry count.
- Material count.
- GPU memory.
- JS allocations.
- Garbage-collection spikes.

The final wave represents the room's worst-case runtime load.

---

# 97. Visual Polish Opportunities

Optional polish if the core encounter is already complete:

### Drone searchlights

A narrow red searchlight briefly sweeps the elevator during target acquisition.

### Cable sway

Cable subtly swings because of elevator airflow.

### Shaft wind

Particles or dust move upward relative to descent.

### Acid illumination

Goop's projectile briefly lights nearby shaft geometry.

### Falling drone sparks

Creates moving light as drone disappears downward.

### Elevator vibration

Very subtle camera/environment vibration during braking or heavy machinery moments.

### Emergency lights

Flash during the five-drone final wave.

These should only be added after gameplay is stable.

---

# 98. Sound Polish Opportunities

Useful sound layers:

- Elevator motor.
- Elevator rail vibration.
- Wind.
- Drone deployment.
- Cable movement.
- Drone hover/motor.
- Target lock.
- Weapon charge.
- Weapon fire.
- Acid projectile.
- Acid impact.
- Cable corrosion.
- Cable snap.
- Drone electrical shutdown.
- Drone falling.
- Distant crash.
- Emergency alarm.
- Elevator braking.
- Door unlocking.

Spatial audio should be used where appropriate so the player can detect drone direction.

---

# 99. Room Difficulty Philosophy

The room should feel dangerous because the player is **falling behind**, not because individual drones are unfair.

Every drone presents the same understandable problem:

> Find it.  
> Aim at the cable.  
> Shoot before it reaches firing distance.

The escalating number of threats changes a simple action into a stressful skill test.

That simplicity is one of the room's strengths.

---

# 100. Final Intended Sequence

The ideal complete playthrough should feel approximately like this:

### 0:00

Bob and Goop enter the elevator.

Scanner confirms both specimens.

Doors close.

### 0:02

Elevator begins moving down.

Heavy machinery starts.

### 0:05

Player looks into the massive shaft.

Everything is calm.

### 0:12

A strange security sound can be heard above.

### 0:15

A single drone drops rapidly into view.

Player switches/controls Goop.

They shoot the cable.

Cable corrodes and snaps.

Drone falls into the darkness.

The mechanic is understood.

### 0:25

Three drones begin descending one after another.

Player rotates around the elevator, destroying cables.

One may get close enough to begin targeting.

Player learns that reaction speed matters.

### 0:35

Four drones descend.

Threats now overlap.

Player is rapidly turning, aiming, firing and occasionally dodging.

The elevator continues falling the entire time.

### 0:42

Wave finishes.

A temporary silence.

Only machinery and wind remain.

The destination appears faintly far below.

### 0:48

Alarm changes.

Something is wrong.

### 0:50

Final wave.

Five drones begin dropping rapidly and sequentially from different positions.

Player destroys one.

Turns.

Destroys another.

Third reaches targeting range.

Player dodges incoming fire.

Shoots cable.

Fourth appears.

Fifth appears.

Music peaks.

### 0:57

Elevator begins braking.

Final drone is descending.

Player fires.

Acid hits cable.

### 0:58

Cable snaps.

Drone falls beside the elevator.

### 1:00

Elevator slams gently into final position.

Security barrier shuts overhead.

Alarm stops.

Machinery winds down.

### 1:01–1:02

Green access light appears.

### 1:02

Doors open.

Bob and Goop enter Room 5.

---

# 101. Room 4 Design Summary

**Room type:** Timed elevator defence / shooting set-piece.

**Duration:** ~60 seconds.

**Required slimes:** Bob + Goop.

**Primary slime:** Goop.

**Bob's role:** Survival, dodging, switching and remaining part of the two-slime journey.

**Goop's role:** Destroy vulnerable drone support cables with acid.

**Enemy rule:** Drones cannot be directly dissolved.

**Weak point:** Cable.

**Drone behaviour:** Fast initial descent → match elevator speed near player → acquire target → fire rapidly.

**Wave structure:**

- 15 s: **1 drone**
- 25 s: **3 drones**
- 35 s: **4 drones**
- 50 s: **5 drones**
- 60 s: **Elevator arrives**

**Total drones:** **13**

**Difficulty progression:** Understanding → repetition → pressure → mastery.

**Failure pressure:** Any drone not destroyed before reaching firing range begins attacking.

**Main skill being tested:** Rapid identification and accurate acid shooting under increasing pressure.

**Major design principle:** Difficulty comes from overlapping threats and reaction speed, **not tiny cable hitboxes or unfair enemy damage**.

**Set-piece payoff:** The final cable should ideally snap immediately before the elevator reaches the bottom, giving the encounter a dramatic final beat before the doors open into Room 5.