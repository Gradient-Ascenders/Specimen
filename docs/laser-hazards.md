# Deterministic laser hazards

Issue #65 provides the reusable runtime/backend contract for lethal lasers.
Final emitters, glow, particles, audio and room presentation remain owned by
issue #67. Room placement remains level-authoring work.

## Ownership

`LaserHazard` owns:

- stable beam ID;
- current start/end endpoints;
- current enabled state;
- development-readable red beam/emitter proxy;
- collision volume aligned to that beam;
- deterministic fixed-step timeline state;
- reset of pose, enabled state and sequence timers.

`LaserHazardSystem` owns:

- fixed-step updates for a related authored beam set;
- group-level contact detection;
- exactly one recovery request when the player enters one or more beams;
- deterministic reset of all member beams.

Neither class owns health, damage-over-time, random activation, player movement
or browser reload/restart behaviour.

## Player/contact contract

A laser checks the authoritative player collision sphere:

```ts
interface LaserContactTarget {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMetres: number;
}
```

`KinematicBody` already satisfies that shape.

The visible development beam is a finite cylinder from `start` to `end`.
Collision computes the closest point on that same finite segment and expands
the beam radius by the player's sphere radius. This capsule-style query closely
matches the visible proxy while remaining allocation-free in the fixed-step
hot path.

## Checkpoint integration

Do not create another death/restart system.

Register the laser system as a resettable member of the same puzzle group used
by the active room checkpoint:

```ts
const room3Laser = new LaserHazard({
  id: 'room3-first-static-laser',
  start: new THREE.Vector3(-2, 0.9, 0),
  end: new THREE.Vector3(2, 0.9, 0),
});

const room3Lasers = new LaserHazardSystem({
  id: 'room3-lasers',
  hazards: [room3Laser],
  requestRecovery: () =>
    requestPlayerDeath(() => checkpoints.recover(playerBody)),
});

puzzleRegistry.register(
  'room3-lasers',
  room3Lasers,
  'room3-route',
);
```

The resulting failure order preserves the existing checkpoint contract:

1. laser contact starts the death presentation once and retains the active
   checkpoint recovery action;
2. Retry invokes `CheckpointManager`, which validates the active spawn;
3. `PuzzleRegistry.resetGroup(activeGroup)` resets the lasers and connected
   room puzzle state in authored order;
4. `KinematicBody.recoverAt(...)` clears movement/transient state and copies the
   verified checkpoint position;
5. only after recovery succeeds does the death flow restore the live slime,
   gameplay input, and UI.

Issue #23 remains the owner of whole-level/game restart lifecycle.

## Static Room 3 baseline

The first lesson beam should have no timeline:

```ts
new LaserHazard({
  id: 'room3-first-static-laser',
  start,
  end,
  enabled: true,
});
```

The proxy keeps dark-red emitter hardware visible at both endpoints and a
bright-red beam visible only while enabled. Actual Room 3 placement should keep
the beam isolated and visible before the player commits; final placement belongs
to the Level 1 integration issue.

## Authored timeline

A timeline rotates the authored beam direction around a world-space axis through
the beam start point. It contains only explicit `hold` and `sweep` steps.

```ts
timeline: {
  axisWorld: new THREE.Vector3(0, 1, 0),
  repeat: true,
  steps: [
    {
      kind: 'hold',
      durationSeconds: 0.4,
      enabled: false,
      angleRadians: -0.55,
    },
    {
      kind: 'sweep',
      durationSeconds: 0.9,
      enabled: true,
      fromAngleRadians: -0.55,
      toAngleRadians: 0.55,
    },
  ],
}
```

No random source is read. Every timer advances only by the fixed-step delta.

### Single sweep

Use a disabled warning hold, one enabled sweep, then an optional disabled final
hold with `repeat: false`.

### Alternating sweeps

Author two hazards with the same cycle length:

- beam A: active sweep, then an equally long disabled hold;
- beam B: equally long disabled hold, then active sweep.

Because both are updated from the same fixed-step system, their phase remains
deterministic after every reset.

### Crossing beams

Author two enabled sweep timelines with mirrored angles, for example:

- beam A: `-0.55 -> +0.55`;
- beam B: `+0.55 -> -0.55`.

They may contact the player in the same step, but `LaserHazardSystem` requests
only one recovery.

### Short final burst

Use short enabled/disabled `hold` steps at a fixed angle, for example three
authored pulses. Keep `repeat: false` so the sequence completes deterministically.

## Reset contract

`reset()` restores:

- authored start/end;
- initial or first-step enabled state;
- step index;
- step elapsed time;
- sequence elapsed time;
- pattern pose;
- contact latch in the containing `LaserHazardSystem`.

The system's cumulative recovery-request count and last-failure ID are
development diagnostics, not mutable gameplay state, so they intentionally
survive puzzle resets.

## Renderer state contract for #67

Kevin's renderer may read:

```text
LaserHazard.id
LaserHazard.start
LaserHazard.end
LaserHazard.enabled
LaserHazard.sequenceState
LaserHazard.sequenceStepIndex
LaserHazard.phaseProgress
LaserHazard.sequenceElapsedSeconds
```

Final visuals may replace/hide the runtime proxy. They must not write endpoints,
timers, enabled state, collision results or recovery logic.

## Manual verification for #65

Before the PR:

1. Place one isolated static hazard in the development/Room 3 authoring scene.
2. Confirm its red proxy cylinder and collision line remain visually aligned.
3. Enter the beam once and confirm exactly one recovery request is recorded.
4. Hold/move through the contact area and confirm there is no duplicate reset.
5. Change the active checkpoint/puzzle group and confirm failure restores that
   group before the player position is recovered.
6. Exercise a single sweep, alternating pair, crossing pair and short burst.
7. Reset each sequence at several different times and confirm identical authored
   pose, enabled state, step index and timer.
8. Confirm the static Room 3 beam never moves or activates randomly.
9. Run type-check and the production build.
10. Attach browser screenshots/video plus concise verification notes.


## Development harness

The #65 development harness adds `LaserTestRig` without changing the existing
`PuzzleTestRig`. The two rigs intentionally own separate checkpoint/puzzle
state so the laser proof does not repurpose or destabilize the reusable puzzle
component tests.

The first static beam is authored across the main grey-box floor:

```text
start: (-7.4, 0.62, 3.6)
end:   (-0.6, 0.62, 3.6)
```

The ordinary player spawn remains at `(-4, 0.46, 5)`, so the beam is visible
ahead of the player before contact. Entering it uses a real
`CheckpointManager` whose active group contains the laser system. The group is
reset before `KinematicBody.recoverAt()` returns the player to the verified
spawn.

The pattern showcase runs above ordinary traversal and demonstrates one single
sweep, an alternating pair, a crossing pair and a short final burst without
obscuring the static Room 3 lesson.

Harness controls:

- **Toggle static laser** — proves authored enabled state is mutable and that
  disabled emitters remain readable.
- **Reset laser timelines** — restores every beam's authored pose, enabled
  state, sequence step and timer.
- **Run laser determinism checks** — performs ten reset/replay cycles at
  different fixed-step offsets and verifies identical state.
- Walk through the static red beam — proves exactly-one checkpoint recovery.

Useful diagnostics include the laser checkpoint ID, recovery request count,
last failing beam ID, static endpoints/enabled state, and pattern phases.
