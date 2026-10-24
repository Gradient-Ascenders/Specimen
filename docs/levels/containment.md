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
- Room 1's Blender-authored shell is prepared before shader compilation. Its
  circular floor island, observation recess and service crown replace the old
  wall dressing while collision remains unchanged. Authoring/source details:
  [Room 1 laboratory](../../assets/environments/containment-room-one/README.md).
- Room 2's Blender hall uses the same finish bank. Its observation workshop,
  service bay, adhesion installation and braced thruster-platform rigs replace
  the procedural dressing while preserving the route and tracking owners.
  [Room 2 laboratory](../../assets/environments/containment-room-two/README.md)
  documents authoring, resource ownership and surface-clearance checks.
- Room 3's Blender chemical stress hall adds a reinforced basin, filtration and
  extraction machinery, braced landing rigs and optical laser heads. It shares
  the existing finish bank and preserves all hazard timing, acid interaction
  and traversal geometry. [Room 3 laboratory](../../assets/environments/containment-room-three/README.md)
  documents the source, runtime ownership and moving-state surface checks.
- Level-owned effects and resources are disposed on unload; restart restores
  authored state without rebuilding static room geometry.
- Room 4's Blender freight lift adds a car body, guide carriages, cables,
  recessed counterweight and three shaft sections. A height display, charging
  optics and pocket doors read the existing lift and hazard state. The original
  travel, collision and camera profiles remain authoritative.
  [Room 4 freight lift](../../assets/environments/containment-room-four/README.md)
  documents assembly ownership and moving-surface checks.
- Surveillance cameras in Rooms 1–3 share the intro's `OI_Camera` geometry and
  existing finish bank. Their pan/tilt owners still track Bob; the doorway mount
  clears the raised shutter throughout its full rotation range.

## Verification focus

Play from title through the Level 2 handoff. Exercise wall attachment/detach,
charged jumps, laser death and Retry, moving-platform riding, Goop release,
switching with both bodies on sensors, pause/resume, and full restart. Confirm
one runtime/canvas/UI root, stable warm resource counts, no stale callbacks, and
no asset or console errors after repeated runs.
