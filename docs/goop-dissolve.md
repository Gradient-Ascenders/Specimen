# Goop reversible dissolve mechanic and rendering

Issue #30 implements the corrosive ability using the current official slime
names: **Goop** replaces the older issue wording "Etch", and **Bob** replaces
"Tack". Issue #31 adds the gameplay-driven rendering described below without
changing issue #30's ability, timing, collision, completion, or reset rules.

## Authoring contract

Geometry is soluble only when explicitly marked:

```text
mesh.userData.soluble = true
```

The current development barrier additionally authors:

```text
dissolveDurationSeconds = 1.8
dissolveCollisionDisableProgress = 0.72
dissolveActivationRangeMetres = 0.12
```

Unmarked geometry is never inserted into the dissolve runtime. Ordinary
`default`, `sticky`, `nonStick`, and `bouncy` surfaces therefore remain
unaffected.

The current authored targets are the Room 1 orange development barrier and the
Room 5 Goop wooden door. Room 5 includes three authored point lights; because
the dissolve surface retains `MeshStandardMaterial`, that door responds to
those lights instead of switching to an inspection-rig approximation.

## Control and ability gate

The named gameplay action is:

```text
useAbility → E
```

Dissolve requires all of the following:

```text
active slime is available
        +
SlimeManager permits `dissolve`
        +
active body is in range of an authored soluble target
        +
E is held
```

Bob's roster configuration has `dissolve = false`, so the manager blocks the
ability callback even when Bob is physically touching the same target.

Goop keeps the movement limitations established previously:

```text
adhesion = false
rebound = false
jump mode = normal
dissolve = true
```

## Progress and interruption

Progress is deterministic fixed-step state:

```text
progress += fixedDelta / dissolveDuration
```

It is clamped to `[0, 1]`.

If E is released or Goop switches away before completion, progress pauses at
its current value. It does not automatically rebuild during ordinary gameplay.

When E is held continuously, an activation that already started may continue
through the collision-disable threshold even though the collider itself is no
longer present.

## Gameplay/render boundary

`DissolveTarget.progress` is the single source of truth.

```text
0% ------------------ 72% ------------------ 100%
intact shader mask      collision off          completed
collision on                                   invisible
```

Every fixed-step gameplay change calls the target's existing presentation
boundary. That boundary copies the already-bounded progress into one shared
`uDissolveAmount` uniform object used by the target's visible, depth, and point
light distance materials. Rendering never advances, eases, or reconstructs
progress. When input is interrupted, gameplay stops calling `advance()`, so the
uniform and procedural cutout remain at exactly the same partial state.

At the authored threshold the target is unregistered from both
`CollisionWorld` and `SurfaceRegistry`.

At completion:

```text
progress = 1
collision = disabled
visible = false
completed = true
```

No vertex data, imported asset geometry, or destructive mesh data is changed.

## Dissolve shader

`DissolveMaterial` extends Three.js's `MeshStandardMaterial` shader through
`onBeforeCompile`. It first copies the explicitly authored standard material,
then inserts only the dissolve coordinates, threshold, and edge. Three.js keeps
evaluating the room's actual directional, hemisphere, point, and spot lights as
well as the authored roughness, metalness, maps, fog, and tone mapping. At
`uDissolveAmount = 0`, the edge is inactive and the discard guard is inactive,
so the retained surface has the source material's standard-lighting response.

The vertex insertion passes Three.js's transformed target-local position to the
fragment stage after morph, skin, and displacement chunks and before projection.
Target-local position keeps corrosion fixed to the authored object when the
object or camera moves, without requiring a world-normal approximation.

The fragment stage evaluates stable three-dimensional value noise. A small
hash creates values at lattice corners, cubic interpolation joins each cell,
and three fixed-frequency layers provide broad holes plus finer corrosion. A
deterministic offset derived from the target ID varies the pattern between
targets. There is no time input in the threshold path.

```text
target-local position
        + deterministic target offset
        ↓
three-layer value noise → mask in [0, 1]
        ↓
discard when mask <= uDissolveAmount
        ↓
kept fragments within uEdgeWidth of the threshold receive emissive edge colour
```

A strict zero-progress guard prevents even a rare zero-valued mask sample from
being discarded after reset. At completion the existing gameplay code clamps
progress to `1` and hides the mesh. The bright green-white band is added to
Three.js's `totalEmissiveRadiance` after the source emissive map is evaluated,
so it remains legible in dim Cultivation conditions without replacing the
surface's real scene-light response.

### Uniform contract

| Uniform | Source | Purpose |
| --- | --- | --- |
| `uDissolveAmount` | `DissolveTarget.progress`, `[0, 1]` | Sole threshold authority; zero is intact and one is complete. |
| `uNoiseScale` | material constant, target-local inverse metres | Sets corrosion feature size without a texture. |
| `uNoiseOffset` | deterministic hash of target ID | Gives targets stable, distinct masks without random runtime state. |
| `uEdgeWidth` | material constant in mask units | Width of the visible band immediately above the discard threshold. |
| `uEdgeColour` | material constant | High-contrast corrosion boundary. |

The current integration supports explicitly authored static `Mesh` geometry
whose slots use `MeshStandardMaterial`. Each private dissolve material copies
the complete source standard-material contract, including colour, opacity,
roughness, metalness, emissive response, supported texture maps, side, depth,
fog, and clipping properties. Other material families are rejected with an
authoring error instead of silently changing their lighting model.

## Depth and shadows

The current renderer has shadow maps disabled and the Room 1 proof target does
not set `castShadow`, so it does not presently participate in a shadow pass.
Each target nevertheless installs both a `MeshDepthMaterial` and a
`MeshDistanceMaterial` through Three.js's `customDepthMaterial` and
`customDistanceMaterial` hooks. Their compiled fragment shaders use the same
noise function, offset, scale, and `uDissolveAmount` object as the visible
material, then discard the same fragments. They also borrow relevant authored
alpha/displacement maps and clipping settings. This covers directional/spot
shadow maps and point-light distance maps if a later authored target enables
shadows; it cannot cast an obviously intact shadow after its visible surface
has holes.

The visible material stays opaque with depth writes enabled for the current
opaque barrier. Fragment discard therefore produces correct holes in the main
depth buffer without the sorting and depth artefacts of the previous fade.

## Completion events

Each target exposes typed discrete events:

```text
collisionChanged
completed
```

`completed` fires once when a cycle reaches 100%. Reset re-arms the target for
a later completion cycle.

## Reset/checkpoint contract

`DissolveTarget` implements the existing puzzle `reset()` contract and is
registered in `PuzzleRegistry`.

Reset restores the same authored mesh:

```text
progress = 0
completed = false
visible = true
collision = registered
uDissolveAmount = 0
```

The zero uniform restores the intact pattern immediately. No material,
geometry, texture, or mesh is recreated during reset, and no stale partial
threshold can survive into the next cycle.

The current two-body recovery helper performs:

```text
reset active dissolve puzzle group
        ↓
restore Bob + Goop recovery state
```

This follows the existing checkpoint ordering where puzzle-group reset occurs
before recovery-target placement. No browser reload or second game-wide restart
path is introduced.

## Development proof

Room 1 contains one orange/brown explicitly-soluble barrier near the two-body
development area.

To inspect:

1. Switch to **Bob** and walk into the marked barrier.
2. Hold **E**. Progress must remain `0%`.
3. Switch to **Goop**.
4. Touch the barrier and hold **E**.
5. Release E partway through; progress must remain at the partial value.
6. Hold E again.
7. At `72%`, diagnostics must report collision disabled.
8. Continue holding to `100%`; the barrier must become invisible/completed.
9. Restart or trigger recovery; the same barrier must immediately return with
   progress `0%` and collision enabled.

F2 diagnostics expose:

```text
dissolve action / permitted
dissolve contact / active target
dissolve progress
dissolve collision / completed
dissolve threshold / duration
dissolve completions
```

The **Check Goop dissolve** regression verifies:

- Bob cannot progress the target;
- Goop can partially dissolve;
- interrupted progress is retained;
- all four existing non-soluble surface classes remain rejected;
- collision flips on the authored progress threshold;
- completion hides the target and emits once;
- reset restores the same mesh without reload;
- five repeated complete/reset cycles remain deterministic.

Expected result:

```text
Goop dissolve: PASS — Bob rejected — Goop partial/interrupted/complete — 4 non-soluble surface classes rejected — collision threshold synchronized — 5 repeated reset cycles
```

`tests/DissolveTarget.test.ts` additionally verifies the deterministic render
contract: visible/depth/distance progress synchronisation, partial-state hold,
resume, completion, five repeated resets, independent multi-target uniforms
and seeds, compatible shadow-discard injection, and idempotent disposal.

## Ownership and lifecycle

One `DissolveMaterialBundle` is created when `DissolveTarget` wraps an authored
mesh. It owns one `DissolveMaterial` per authored material slot plus one depth
and one distance material. The original surface and any pre-existing custom
depth/distance materials remain borrowed and are restored by `dispose()`.

Copied surface materials and shadow materials borrow source textures; they do
not clone or own those textures. Bundle disposal therefore releases only its
owned material/program resources, while the level remains responsible for the
source material, geometry, and textures.

Fixed-step updates mutate one scalar uniform; they do not set `needsUpdate` or
allocate render resources. Reset reuses the same bundle. Disposal releases all
bundle-owned materials once. Geometry and source-material disposal remain with
the level scene that originally authored them.

## Visual evidence

- [`issue-31-partial.png`](evidence/issue-31-partial.png) shows a stable partial
  cutout with the emissive corrosion band.
- [`issue-31-complete.png`](evidence/issue-31-complete.png) shows the same route
  after gameplay reaches completion.
- [`issue-31-reset-restored.png`](evidence/issue-31-reset-restored.png) shows the
  intact target after recovery reset.
- [`issue-31-dissolve-reset.webm`](evidence/issue-31-dissolve-reset.webm)
  records intact → partial → complete → reset in the live canvas.

## Deferred scope

This issue does not implement:

- dissolving arbitrary meshes;
- destructive geometry mutation;
- Bob dissolve access;
- Goop adhesion/rebound;
- dissolve audio;
- unrelated Cultivation puzzle authoring.

Future soluble-target authors can reuse the material contract without moving
collision, ability gating, timing, completion, or reset authority into
rendering.
