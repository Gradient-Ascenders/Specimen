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

`DissolveMaterial` is a handwritten, texture-free `ShaderMaterial`. The vertex
stage passes the undeformed target-local position and world normal to the
fragment stage. Target-local position keeps the corrosion fixed to the authored
object when the object or camera moves; current soluble meshes must use geometry
dimensions or uniform mesh scale because the lightweight world-normal transform
assumes rigid/uniform scale.

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
progress to `1` and hides the mesh. The bright green-white edge is emissive, so
it remains legible under dim or occluded Cultivation-style lighting. The base
surface uses an explicit hemisphere plus directional diffuse approximation of
the current `RenderLayer` inspection lighting and carries the authored base and
emissive colours forward.

### Uniform contract

| Uniform | Source | Purpose |
| --- | --- | --- |
| `uDissolveAmount` | `DissolveTarget.progress`, `[0, 1]` | Sole threshold authority; zero is intact and one is complete. |
| `uNoiseScale` | material constant, target-local inverse metres | Sets corrosion feature size without a texture. |
| `uNoiseOffset` | deterministic hash of target ID | Gives targets stable, distinct masks without random runtime state. |
| `uEdgeWidth` | material constant in mask units | Width of the visible band immediately above the discard threshold. |
| `uBaseColour` | authored material colour | Lit colour of retained structure. |
| `uEmissiveColour` | authored emissive colour × intensity | Preserves the authored low-light cue. |
| `uEdgeColour` | material constant | High-contrast corrosion boundary. |
| lighting uniforms | fixed inspection-light approximation | Keeps retained structure readable without consuming arbitrary scene lights. |
| `uOpacity` | authored material opacity | Preserves the supported source opacity contract. |

The current integration supports explicitly authored static `Mesh` geometry
and preserves each source material slot's colour, emissive contribution,
opacity, side, depth-test, and depth-write settings. It does not implicitly
convert arbitrary meshes, skinned/displaced geometry, or source texture/PBR
map stacks; those require deliberate authoring rather than a silent fallback.

## Depth and shadows

The current renderer has shadow maps disabled and the Room 1 proof target does
not set `castShadow`, so it does not presently participate in a shadow pass.
Each target nevertheless installs both a `MeshDepthMaterial` and a
`MeshDistanceMaterial` through Three.js's `customDepthMaterial` and
`customDistanceMaterial` hooks. Their compiled fragment shaders use the same
noise function, offset, scale, and `uDissolveAmount` object as the visible
material, then discard the same fragments. This covers directional/spot shadow
maps and point-light distance maps if a later authored target enables shadows;
it cannot cast an obviously intact shadow after its visible surface has holes.

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
- final Cultivation room placement.

Final Cultivation authors can reuse the material contract without moving
collision, ability gating, timing, completion, or reset authority into
rendering.
