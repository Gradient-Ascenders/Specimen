# Cultivation soluble-support assemblies

Issue #94 adds six deterministic, reset-safe structural assemblies to the
Cultivation foundation. The backend intentionally uses authored transforms and
box colliders rather than general rigid-body or rope-constraint physics.

## Authored metadata

`CULTIVATION_FOUNDATION_MANIFEST.structuralAssemblies` is the source of truth
for each assembly's:

- stable assembly and soluble-support IDs;
- `drop-to-acid` or `rope-catch` mode;
- Room 1 or Room 2 puzzle reset group;
- support role (`soluble-rope` or `soluble-brace`);
- support position and forgiving hit-box size;
- exact initial and final moving transforms;
- moving collider size, release delay, travel duration and final surface tag;
- optional retained-rope settling duration and swing angle.

`CultivationLevelScene` copies the association to explicit mesh metadata:

```text
assemblyId
supportRole
soluble = true
solubleId
```

The runtime resolves the exact `solubleId` and validates that the target's
`assemblyId` and `supportRole` match. It never searches names for words such as
`rope`, `brace`, `block` or `platform`. Duplicate assembly IDs, support IDs or
completion subscriptions fail during construction. Load-time authoring validation
also rejects non-finite transforms, invalid dimensions/durations, a support role
that does not match its assembly mode, and initial/final proxy colliders that
overlap the foundation's static collision boxes.

Only the three Room 1 ropes and three Room 2 wooden braces are soluble. Room 2's
retained ropes, blocks, mounts and spools are presentation roles for the later
art pass and must never be registered as dissolve targets.

Room 2's supplied design coordinates are local to its entrance. The current
foundation places that entrance at world `Z = 11`, so its authored support and
block positions apply that offset. Room 1's source design specifies relative
spacing; its three platforms are distributed across the current foundation's
start-to-Room-2 span and remain tuning data rather than assumptions in assembly
logic.

## State machines

Room 1 uses `DropToAcidAssembly`:

```text
suspended -> dissolving -> released -> falling -> landed
```

Room 2 uses `RopeCatchAssembly`:

```text
suspended -> braceDissolving -> released -> dropping
          -> ropeTaut -> settling -> stable
```

`DissolveTarget.progress` is the only support-dissolve authority. Partial
progress changes only the assembly's readable dissolving state. The target's
typed `completed` event releases the associated assembly once. Travel progress
uses fixed-step elapsed time, a bounded acceleration curve and an exact final
snap. The retained-rope assembly exposes a one-update `ropeTaut` boundary,
followed by a small bounded damped swing that ends at the exact final transform.

Continuous pose, support progress, travel progress, collision state and
transition count are read directly through assembly diagnostics. Typed events
cover state changes, release, landing, rope-taut, settled and reset. Presentation
and audio may consume those values but do not advance or choose gameplay state.

## Collision and fixed-step order

Each assembly owns one ordinary box collider and keeps its visible greybox mesh
and collision transform on the same root. The collider is registered with both
`CollisionWorld` and `SurfaceRegistry` and uses the manifest's explicit final
surface tag.

Cultivation advances every structural assembly before either persistent slime's
movement query. A collider therefore occupies its exact caught/landed pose on
the fixed step that a body queries it. Falling assemblies do not parent a slime
or copy their downward velocity into one; authored placement keeps suspended
and moving routes clear of the bodies. Bob and Goop query the ordinary stable
collider after landing.

Radiation remains a separate identity-aware hazard system. Structural geometry
is never supplied as a radiation target, and the safe top of a landed platform
does not become hazardous merely because it overlaps the liquid presentation.

## Reset and lifecycle order

The Cultivation controller continues to own `PuzzleRegistry`. Each assembly is
registered in its room group immediately after its support target:

```text
cancel room/hazard transients
  -> DissolveTarget.reset()
  -> SuspendedStructureAssembly.reset()
  -> recover Bob and Goop
```

This synchronously restores support progress, material, visibility and
collision before restoring the assembly's state, pose, displacement, swing and
event latches. The assembly does not run a second dissolve timer or reset its
target independently.

Unload disposes the controller registrations, then every assembly subscription
and owned collider/resource, then every dissolve target, followed by the scene
and collision registries. Failed construction uses the same reverse ownership
order. A disposed assembly cannot receive an old target completion callback.

## Development verification

The Cultivation F2 panel reports every assembly/support ID, state, dissolve and
travel progress, position, collision state and transition count. Until the
Level 2 projectile presentation is integrated, the development-only partial and
complete support buttons drive the existing `DissolveTarget` contract directly.
They do not introduce another production dissolve implementation.

Use the controls to inspect all six assemblies, reset during every transient
state, and exercise completions in different orders. Full verification also
includes all six three-target completion orders for each room mode, a kinematic
support check on every authored final collider, automated transition/reset/lifecycle
tests, type checking, the production build, repeated Level 2 load/restart/unload
cycles and browser console inspection.
