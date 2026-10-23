# Room 4 — Elevator Laser Ascent

## 1. Room Purpose

Room 4 is a short, high-energy traversal set-piece that follows Room 3.

The player exits Room 3 through a maintenance vent, drops onto the roof of an industrial elevator, and is carried upward through a vertical shaft while dodging scripted laser patterns.

The room should be quick, readable, and replayable rather than puzzle-heavy.

---

## 2. Core Sequence

1. **Enter through the vent**
   - The player crawls through the vent from Room 3.
   - The vent opens above an elevator shaft.
   - The player drops directly onto the roof of a stationary industrial elevator.

2. **Room checkpoint activates**
   - A checkpoint is set as soon as the player lands safely on the elevator.
   - Any failure during this room restarts the player here.

3. **Elevator starts moving**
   - After a short pause, warning lights activate.
   - The elevator begins moving upward automatically.
   - The player remains free to move and jump on the elevator roof.

4. **Laser sequence begins**
   - Security lasers activate in predetermined patterns.
   - The player must dodge them using normal movement and Tack's bounce/jump abilities.

5. **Difficulty escalates**
   - Early patterns are simple and clearly teach the hazard.
   - Later patterns require quicker movement and better timing.

6. **Elevator reaches the top**
   - The lasers shut down.
   - The elevator stops near the exit.
   - The player jumps or moves into the next maintenance opening/platform leading to Room 5.

---

## 3. Suggested Laser Patterns

Keep all laser behaviour scripted rather than procedural.

### Pattern 1 — Single Sweep
- One horizontal laser sweeps across the elevator roof.
- Teaches the player that touching a laser causes a room reset.
- Player can jump or bounce over it.

### Pattern 2 — Alternating Sweeps
- Lasers cross the platform from opposite sides at different times.
- Requires the player to reposition instead of staying in one place.

### Pattern 3 — Crossing Pattern
- Two angled or rotating beams create a moving safe area.
- Encourages movement around the elevator roof.

### Pattern 4 — Final Burst
- A short sequence of faster laser sweeps.
- Acts as the climax of the room.
- Should still use predictable timing rather than randomness.

---

## 4. Failure and Restart

There is no full death screen.

If the player:

- touches an active laser;
- falls from the elevator;
- becomes trapped outside the intended play area;

the room immediately resets.

### Reset State

Reset:

- player position and velocity;
- elevator position;
- elevator movement timer;
- laser positions/rotations;
- laser sequence timer;
- any temporary room effects.

The restart should be fast so repeated attempts do not become frustrating.

---

## 5. Elevator Design

The elevator should be an **industrial cargo/specimen elevator** rather than a small passenger elevator.

This allows the roof to be large enough for gameplay.

The roof needs enough space for:

- lateral movement;
- jumping;
- bouncing;
- changing direction;
- avoiding multiple laser paths.

The elevator movement itself should be authored and deterministic.

---

## 6. Environment

### Main Visual Identity

- Tall industrial elevator shaft.
- Dark metal walls and maintenance structures.
- Red security/warning lighting during the laser sequence.
- Moving shaft geometry helps communicate that the elevator is travelling upward.

### Possible Details

- elevator cables;
- wall supports;
- pipes;
- maintenance platforms;
- numbered floor markings;
- warning lights;
- sparks or small particles;
- machinery sounds;
- a clear view upward into the shaft.

These details are visual only and do not need complex physics.

---

## 7. Camera

The normal player camera should remain active.

Important requirements:

- camera follows the moving elevator without visible jitter;
- the player can clearly see incoming lasers;
- shaft walls should not constantly block the camera;
- upward movement should feel fast without making the player disoriented.

A slightly wider camera distance may be useful during this room.

---

## 8. Technical Components

The room can be built from a small number of systems:

- `MovingPlatform` or elevator controller;
- trigger/checkpoint at room entry;
- scripted laser hazard objects;
- hazard collision checks;
- room sequence/timeline controller;
- room reset function;
- Room 5 exit trigger.

No procedural laser generator or advanced physics simulation is required.

---

## 9. Scope Limits

Do **not** add the following unless the basic room is already polished:

- procedural/random laser generation;
- simulated elevator cables;
- multiple moving elevators;
- destructible lasers;
- laser reflections;
- realistic acceleration forces on the slime;
- complex wall-climbing sections inside the shaft;
- large numbers of independently simulated hazards.

The room should remain a short scripted set-piece.

---

## 10. Target Experience

Approximate room duration:

**30–60 seconds on a successful run.**

The intended pacing is:

**vent traversal → quiet drop → elevator activation → escalating laser dodging → sudden shutdown → elevator arrival → Room 5**

The room should feel like a brief action sequence between larger traversal/puzzle rooms rather than a full puzzle room.
