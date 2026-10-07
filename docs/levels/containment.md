# Containment

Containment is the Level 1 teaching sequence. `GreyboxLevelRuntime` and the
Containment scene/controller own the level; application resources remain with
the session bootstrap.

## Progression

The level introduces movement and charged jumping, Bob's adhesive traversal,
switches and moving geometry, laser timing, Goop release, two-body switching,
and a final cooperative route. The route is authored as five connected rooms.
Debug shortcuts may enter later sections, but normal completion must use the
same checkpoint and progression operations.

Goop's unlock changes roster availability without replacing Bob. Both bodies
remain in the scene after switching and can occupy puzzle sensors. Completion
emits a `level-2` progression snapshot containing unlocked identities and the
active identity; the coordinator then disposes Containment before loading
Cultivation.

## Authoring contracts

- Collision and sticky faces use explicit authored primitives/metadata.
- Doors, pressure plates, laser sequences, elevators, and release machinery own
  resettable state through the puzzle registry.
- Lighting and art may change presentation but cannot change puzzle authority.
- Level-owned effects and resources are disposed on unload; restart restores
  authored state without rebuilding static room geometry.

## Verification focus

Play from title through the Level 2 handoff. Exercise wall attachment/detach,
charged jumps, laser death and Retry, moving-platform riding, Goop release,
switching with both bodies on sensors, pause/resume, and full restart. Confirm
one runtime/canvas/UI root, stable warm resource counts, no stale callbacks, and
no asset or console errors after repeated runs.
