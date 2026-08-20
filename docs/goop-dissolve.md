# Goop reversible dissolve mechanic

Issue #30 implements the corrosive ability using the current official slime
names: **Goop** replaces the older issue wording "Etch", and **Bob** replaces
"Tack".

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

## Collision and presentation

`DissolveTarget.progress` is the single source of truth.

```text
0% ------------------ 72% ------------------ 100%
visible/fading          collision off          completed
collision on                                   invisible
```

The development target fades through private cloned material instances, so
unrelated shared materials are never mutated.

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
```

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

## Deferred scope

This issue does not implement:

- dissolving arbitrary meshes;
- destructive geometry mutation;
- Bob dissolve access;
- Goop adhesion/rebound;
- final corrosion shader/VFX/audio;
- final Cultivation room placement.

Presentation work can later read dissolve progress without owning collision,
ability gating, timing, completion, or reset state.
