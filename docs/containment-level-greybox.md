# Complete Containment grey-box

Issue #21 extends the Room 1/Room 2 teaching build into a physically connected
five-room Level 1. The level uses authored primitive collision and the existing
fixed-step movement, laser, elevator, checkpoint and death systems.

## Intended route

| Room | Main beat | Completion condition |
| --- | --- | --- |
| 1 | Discover the contaminated sticky wall and enter the duct. | Reach the Room 2 drop. |
| 2 | Learn the hard-landing reaction, charged height and a sticky wall catch. | Cross the formerly decorative upper doorway. |
| 3 | Combine bounce, adhesion and readable lethal lasers in a vertical route. | Enter the high rear ventilation duct. |
| 4 | Land on the elevator, survive its deterministic ascent and wait for the exit lock. | Cross the top doorway after `exitReady`. |
| 5 | Traverse lower machinery, the containment pedestal, upper platforms and final sticky transfers. | Adhere to the observation-room lever until containment fails. |

Room 3 begins at the Room 2 balcony height. Its final duct drops directly onto
the Room 4 elevator roof. The elevator's top platform is level with Room 5's
entry floor, so none of the production route uses a teleport.

## Checkpoints and reset ownership

`ContainmentLevelController` owns one `CheckpointManager` and one
`PuzzleRegistry`. Checkpoints are activated by sphere-versus-AABB trigger
volumes during the fixed update.

| Checkpoint | Reset group | Restored state |
| --- | --- | --- |
| Room 1 spawn | `containment-room-1` | Static teaching-room state. |
| Room 2 safe floor | `containment-room-2` | Static bounce-room state. |
| Room 3 entrance | `containment-room-3` | All Room 3 beams, timelines and triggers. |
| Room 4 elevator roof | `containment-room-4` | Elevator pose/state/timers, exit lock and all ascent lasers. |
| Room 5 entry | `containment-room-5` | Room 5 lasers, triggers, lever, containment doors and Etch placeholder. |

Laser contact and authored fall volumes request the existing death sequence.
The recovery callback is retained until Retry. Retry first resets the active
puzzle group and only then calls `KinematicBody.recoverAt(...)`, which clears
velocity, charge, adhesion and contact transients.

Room 5 keeps the latest Blender transforms as its motion origins. Moving
platform 1 oscillates symmetrically along runtime X; moving platform 2 travels
along runtime Z to the Blender Y-axis reference marker. Lasers 1–4 and 8 move
vertically, lasers 5 and 7 exchange their authored forward/back positions, and
laser 6 remains static. Room 5 checkpoint reset restores every platform, laser
phase and ending object to that authored starting state.

The Room 4 fixed-step order remains:

```text
player movement
→ support detection
→ elevator movement and carrier displacement
→ laser contact
→ checkpoint / failure / progression triggers
```

Reaching the top of the elevator activates the Room 5 entry checkpoint as soon
as the platform stops and enters `arrivalPause`. The player therefore recovers
inside Room 5 if they fall back down the shaft before crossing the exit trigger.
Walking through the Room 5 entrance activates the same checkpoint idempotently;
there are no additional checkpoints within Room 5.

## Elevator sequence

The initial grey-box timing is 50 seconds:

- 3-second warning while the platform remains stationary;
- 45-second linear ascent through single, alternating, faster, crossing and
  final laser placements;
- 2-second arrival pause before the exit becomes available.

Shaft walls are ordinary surfaces and cannot be climbed. The exit lock is both
visible and collidable until the authoritative elevator state becomes
`exitReady`.

## Level completion handoff

The Room 5 lever is a sticky collider. The player must remain attached for
0.35 seconds. Input then locks while a deterministic 2.5-second grey-box
sequence pulls the lever, separates the containment doors and moves the
non-playable Etch placeholder to its released position.

Completion is latched and emits exactly once:

```ts
completed: {
  levelId: 'containment';
  nextLevelId: 'level-2';
}
```

The event is the handoff boundary only. Issue #21 does not unload this scene or
construct Level 2. A whole-level reset restores `playing`, rearms completion
and returns Etch to containment.

## Grey-box and art contracts

- White/grey is ordinary laboratory architecture.
- Gold marks the intended platform route.
- Yellow-green surfaces use the `sticky` gameplay tag and an explicit
  `sticky-wall-tile` or `sticky-vent-tile` texture role.
- Bright red laser presentations match the authoritative collision segments.
- Green marks an available progression exit.
- The Etch placeholder communicates the release beat but owns no input,
  swapping, corrosion, AI or persistence.

## Deferred work

- final Level 1 environment models, textures, lighting, audio and effects;
- opening and ending cinematic camera work;
- playable Etch, slime swapping and corrosion;
- actual Level 2 loading;
- final jump spacing and laser timing adjustments after external playtesting;
- moving this controller into issue #23's lifecycle runtime after that branch is
  reconciled with current `main`.

## Manual verification

Development builds expose <kbd>1</kbd> through <kbd>5</kbd> and matching
debug-panel buttons to recover Bob directly at each room's entry checkpoint.
Each shortcut resets the selected room's puzzle group and updates the active
objective; these teleports are never part of the production route.

1. Complete Rooms 1–5 without debug movement or teleporting.
2. Intentionally hit every laser and enter each fall volume.
3. Confirm Retry returns to the expected room checkpoint without stale motion.
4. Jump during elevator warning, ascent and arrival; test all roof edges.
5. Recover during ascent and confirm platform, lasers and exit lock reset.
6. Attempt to climb ordinary shaft walls and to enter Room 5 early.
7. Backtrack and repeatedly contact checkpoint and exit volumes.
8. Attach to the observation lever, confirm input locks and count one completion.
9. Perform a whole-level reset and complete the level again.
10. Capture one clean full run and one failure-heavy run for the PR evidence.
