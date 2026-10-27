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
- All six surveillance cameras share the intro's `OI_Camera` geometry and
  existing finish bank. Their pan/tilt owners still track Bob; the doorway mount
  clears the raised shutter throughout its full rotation range.
- Room 5's Blender containment atrium replaces the procedural shell and cell
  dressing with sealed portals, a furnished observation gallery and reinforced
  landings. Platforms share the earlier rooms' inset tops, metal borders,
  amber corners and thruster harnesses. Moving platforms retain their original routes. The
  existing hinge, button, release and dissolve owners drive the new visuals.
  [Room 5 containment atrium](../../assets/environments/containment-room-five/README.md)
  documents the source, shared resources and moving-surface checks.

## Lighting and shadows

The five rooms share one ambient source with smoothly blended colour and
intensity at the existing doorway handoffs. Fixtures keep the same light count,
finite ranges and shadow-map budgets. Clinical keys emphasise the Room 1 chamber,
Room 2 uses softer route lighting, Room 3 separates cool work lights from acid
spill, the lift has warmer received light, and the atrium balances neutral
ceiling light against Goop's green containment light.

`ContainmentLightingArt` supplies simple shadow silhouettes derived offline from
the actual GLBs. Only substantial, nearly solid components and filled landings
become boxes; glass, hollow frames, small fittings and wall skins spanning
doorways are excluded. Each assembly uses one depth submission. The existing
hinges, platform interpolation and lift-door owners move their shadows; door
cache invalidation uses the geometry's local centre rather than its empty origin.
Soft vertex-alpha contact patches ground stationary equipment on authored flat
floors. The pass adds no texture images, lights, post-processing or render targets.

After changing an environment GLB, regenerate the small silhouette data:

```sh
node scripts/generate-containment-lighting.ts
```

The generated-asset check validates its source hashes and reproducibility.
The existing loading preparation explicitly primes all 137 geometry owners,
including the 19 small lighting meshes. Restart reuses them; unload releases
their geometry and two shared materials without disposing borrowed finishes.
Focused checks cover collision identity, silhouette budgets, transparent
openings, landing coverage, moving-door caching, ambient handoffs and disposal.
`tests/browser/ContainmentLightingPass.spec.ts` captures matching views through
all five rooms and checks prepared shaders and restart. The local before/after
comparison is under ignored `artifacts/evidence/containment-lighting/`; software
WebGL observations are integration evidence rather than hardware FPS guarantees.

## Verification focus

Play from title through the Level 2 handoff. Exercise wall attachment/detach,
charged jumps, laser death and Retry, moving-platform riding, Goop release,
switching with both bodies on sensors, pause/resume, and full restart. Confirm
one runtime/canvas/UI root, stable warm resource counts, no stale callbacks, and
no asset or console errors after repeated runs.
