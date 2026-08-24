# Goop acid aim, projectiles, reversible burns, and rendering

Issues #30, #31, and #91 share one dissolve authority. Issue #30 introduced
authored, reset-safe `DissolveTarget` progress, Issue #31 made that progress
drive the dissolve shader, and Issue #91 replaces the development-only
contact/hold activation with Goop's ranged acid interaction.

## Controls and ability gate

The named gameplay actions are:

```text
aimAbility  -> hold Right Mouse Button
fireAbility -> press Left Mouse Button while aiming
```

Mouse actions are accepted only while the game canvas owns pointer lock. The
canvas alone suppresses the browser context menu. `Input` remains the sole
browser-event owner; gameplay code never reads raw mouse events.

Aim mode requires all of the following:

```text
normal gameplay accepts input
        +
the canvas owns pointer lock
        +
Goop is active, unlocked, and registered
        +
SlimeManager permits `dissolve`
        +
Right Mouse Button is held
```

Bob's roster configuration has `dissolve = false`, so Bob cannot enter aim mode
or fire acid. Movement and normal jumping remain available while Goop aims.

## Soluble authoring

Only explicit gameplay metadata creates a target:

```text
mesh.userData.soluble = true
mesh.userData.solubleId = "stable-authored-id"
mesh.userData.dissolveDurationSeconds = 1.8
mesh.userData.dissolveCollisionDisableProgress = 0.72
```

Names, colours, textures, and materials do not grant eligibility. Unmarked
`default`, `sticky`, `nonStick`, and `bouncy` geometry remains immune. The old
`dissolveActivationRangeMetres` metadata is retained for compatibility with the
original target contract but no longer starts production corrosion.

The current authored targets are the Room 1 orange development barrier and the
Room 5 Goop wooden door. Room 5 includes authored point lights, and the target's
derived `MeshStandardMaterial` continues to respond to the real scene lighting.

## Camera targeting and launch safety

The active `CameraRig` copies its live centre-crosshair ray into caller-owned
vectors. `AcidProjectileSystem` sweeps a very small probe along that ray and
clamps the aim point to the nearest camera-obstruction collider or the maximum
range. Goop can pitch this ray up to 80° above the movement plane. Aim mode
smoothly moves the existing rig to a centred first-person pose and suppresses
Goop's body for the full camera blend, preventing the slime from obscuring this
ray at steep or close angles.

This camera query is targeting data, not impact authority. Firing calculates a
new direction from Goop's authoritative body position toward the clamped aim
point. Before a projectile becomes live, the system sweeps from Goop's centre
to a launch point outside the body radius. An obstruction in that short launch
segment wins immediately, so an offset camera cannot shoot through a wall near
Goop.

Firing into empty space is valid. The projectile expires at its range or
lifetime limit.

## Central tuning

The initial playtest defaults are held in
`DEFAULT_ACID_PROJECTILE_CONFIG`:

| Setting | Default |
| --- | ---: |
| Maximum range | `75 m` |
| Projectile speed | `18 m/s` |
| Collision radius | `0.10 m` |
| Lifetime | `4.20 s` |
| Fire cooldown | `0.45 s` |
| Launch clearance | `0.02 m` |
| Maximum live projectiles | `10` |
| Maximum visible target IDs / occlusion probes per step | `16` |

These values are data, not assumptions embedded in targeting or presentation.
The lifetime covers a full-range shot at the default speed, and the ten-slot
pool preserves cooldown-paced firing while those longer shots remain active.
The visibility limit caps expensive occlusion probes independently from the
number of successful results, so a run of hidden targets cannot produce an
unbounded set of fixed-step collision sweeps. An eligible target hit by the
main camera ray is inserted first using that existing sweep, ensuring the
crosshair target cannot be displaced by earlier occluded registration entries.

## Projectile collision

Projectiles run on the existing `1 / 60 s` fixed step. Each movement segment is
a `CollisionWorld.sweepSphere` query against the movement collision layer. The
nearest registered box collider therefore wins even when the projectile would
cross a thin target in one update.

- Registered walls, floors, platforms, glass, and other ordinary objects stop
  the projectile harmlessly.
- A hit starts a burn only when its exact mesh maps to a registered
  `DissolveTarget`.
- Slime bodies are not part of the authored world-collider registry, so acid
  does not interact with Bob or Goop.
- Lasers do not participate in projectile collision.
- There is no ricochet, penetration, homing, ammo, reload, or damage.
- A fixed pool caps live projectile state. No geometry or material is allocated
  by gameplay firing.

## Burn coordination

`DissolveSystem` is the non-stacking fixed-step burn coordinator. A valid
projectile hit calls `startBurn(target)` once. Accepted targets continue burning
after aim release or slime switching:

```text
progress += fixedDelta / dissolveDuration
```

A second hit returns `already-burning` and may produce a secondary presentation
impact, but it never adds another progress update. A target with partial
authoritative progress continues from that progress. Completed targets reject
new burn work.

`DissolveTarget.progress` remains the only threshold authority:

```text
0% ------------------ authored threshold ------------------ 100%
intact shader mask       collision off                        completed, hidden
collision on
```

At the threshold the target unregisters from both `CollisionWorld` and
`SurfaceRegistry`. Projectile code never edits material, visibility, shader
state, or collision registration directly.

## Dissolve rendering

Every accepted fixed-step progress change copies the bounded value into the
shared `uDissolveAmount` uniform used by the target's visible, depth, and point
light distance materials. Rendering never advances, eases, or reconstructs
gameplay progress.

`DissolveMaterial` extends Three.js's `MeshStandardMaterial` shader through
`onBeforeCompile`. It preserves the authored material's lighting, roughness,
metalness, maps, fog, and tone mapping, while adding only the target-local
dissolve coordinates, threshold, and emissive edge. Stable three-dimensional
value noise creates the cutout; a deterministic target-ID offset gives separate
targets distinct patterns without runtime randomness or a time input.

```text
target-local position + deterministic target offset
        -> three-layer value noise
        -> discard when mask <= uDissolveAmount
        -> emissive edge immediately above the threshold
```

A strict zero-progress guard leaves the source surface intact after reset. The
surface remains opaque with depth writes enabled, so discarded fragments create
real depth holes without transparent sorting artefacts. Matching
`MeshDepthMaterial` and `MeshDistanceMaterial` shaders use the same mask and
uniform object, preventing an intact shadow after the visible surface has
dissolved.

The integration supports explicitly-authored static `Mesh` geometry using
`MeshStandardMaterial`. Unsupported material families fail authoring instead of
silently changing their lighting model. Each target owns its derived surface,
depth, and distance materials, borrows source textures, and restores the
original material hooks on disposal.

## Presentation contracts

Continuous state is read directly from stable, bounded projections:

- `aimReadModel`: active state, camera origin/direction, clamped point, maximum
  range, selected soluble ID, visible/in-range soluble IDs, firing readiness,
  and cooldown state;
- `projectileStates`: a fixed pool containing active flag, current/previous
  position, and direction for interpolation;
- `DissolveTarget.progress` and render diagnostics: the authoritative burn and
  synchronized shader state.

Discrete typed events cover:

- aim entered/exited;
- projectile fired;
- soluble or world impact;
- burn started, completed, or reset;
- target collision changes and completion.

These are presentation/audio inputs for #92 and #37. They cannot change target
eligibility, collision results, or dissolve progress.

### Goop corrosion presentation (#92)

`GoopAcidPresentation` is a level-owned adapter over those projections and
events. It never performs target discovery, eligibility checks, raycasts,
projectile integration, hit detection, or burn timing. The mapping is:

| Authoritative state from #91 / #31 | Presentation only |
| --- | --- |
| `aimReadModel.active` and candidate IDs | One crosshair and a clean, steady target glow |
| `selectedTargetId` | Stronger hatch/pulse and ready/cooldown confirmation |
| `projectileStates` current/previous transforms | Pooled acid core, halo, and short line trail |
| world/soluble impact event | Bounded weak/strong procedural splash |
| `burnStarted`, completion, and reset events | Target-local sizzle that yields to dissolve |
| `DissolveTarget.progress` | The existing dissolve shader and removal path only |

Each `DissolveTarget` keeps its persistent surface/depth/distance material
bundle. Presentation writes only the shared surface uniforms below; it never
replaces a material during aiming and never writes `uDissolveAmount`.

| Uniform | Owner |
| --- | --- |
| `uDissolveAmount` | `DissolveTarget.progress` exclusively |
| `uAimHighlightStrength` | #92 candidate fade |
| `uAimSelectedStrength` | #92 selected-target fade/pulse mask |
| `uAimHighlightColour` | #92 sickly green/yellow language |
| `uBurnHighlightStrength` | #92 bounded authoritative-burn sizzle |
| `uBurnHighlightColour` | #92 valid-hit yellow-green accent |
| `uCorrosionPresentationTime` | #92 presentation pattern motion |

At zero highlight and burn strengths the injected shader contribution is
exactly zero, leaving the authored lit surface unchanged. Candidate highlighting
adds steady emission after the normal material lighting, so the authored
material identity and partial dissolve remain visible without a noise-contour
overlay. Candidate and selected strengths approach their targets over 0.2
seconds. Selection adds a geometric hatch and pulse as well as colour, and the
crosshair uses shape, line style, and colour for neutral, ready, and cooldown
states.

The projectile slots are allocated once to match #91's fixed authoritative
pool. Core geometry, halo texture/material, and trail materials are shared.
Impacts use a fixed 48-droplet instanced pool and eight flash sprites; slots are
recycled when full and never grow. #91 currently reports an impact point but no
surface normal, so the procedural splash is deliberately compact and
omnidirectional rather than inventing a presentation collision query. A valid
flash remains target-local when the target moves. Repeated hits can emit a
smaller secondary splash but cannot restart or intensify the burn envelope.

Containment's #33 loading prewarm includes the persistent acid-presentation
root in every room-owned compile subset. It compiles one representative of the
core, halo, trail, droplet, and impact material signatures against each authored
lighting signature without making a projectile/effect visible, allocating a
live gameplay slot, or advancing #91 state. This keeps the first player-fired
shot from becoming the first-use shader boundary under the final room lights.

The burn presentation records progress only when #91 emits `burnStarted`, then
fades within the first 0.22 authoritative dissolve progress (and a bounded
0.55-second visual ceiling). This gives the dissolve edge visual precedence;
completion and reset remove the sizzle immediately.

## Reset and lifecycle

- Switching away from Goop cancels aim immediately; fired projectiles and burns
  continue.
- Pause and pointer-lock loss cancel aim. A stopped level freezes fixed-step
  projectiles and burns, hides their transient projectile/trail/burn rendering,
  and reconciles that presentation from the unchanged live state when gameplay
  resumes.
- Death cancels aim and disables input. Retry clears projectiles and active
  burns before the puzzle group restores its targets and then recovers both
  slime bodies.
- Whole-level restart clears aim, projectiles, cooldown, and burns before
  `PuzzleRegistry` restores every target.
- Unload disposes projectile/burn events and references before targets and world
  collision are disposed.

The reset order is intentionally:

```text
clear aim and live projectiles
        -> cancel active burns
        -> reset DissolveTarget puzzle state
        -> recover Bob and Goop
```

Reset restores the same authored mesh with zero progress, collision enabled,
authored visibility, and `uDissolveAmount = 0`. It does not recreate geometry,
materials, or textures. Repeated lifecycle cycles retain no listeners,
projectile systems, burns, or target registrations from an old level instance.

The #92 adapter follows the same seams. Aim cancellation fades/clears the
crosshair, target presentation, and camera request. Slime switching does not
destroy accepted projectiles or burns while #91 still reports them. Pause,
death, cutscene ownership, and other lifecycle-disallowed states hide pooled
projectiles, trails, impacts, flashes, and all target highlight/burn strengths
without mutating #91 state. A permitted resume reconciles from the live read
models. Retry, checkpoint recovery, and restart clear those transient states
immediately. Level unload removes its single DOM node, unsubscribes typed-event
listeners, detaches the presentation root, and disposes only resources it owns.
Shared source textures on soluble authored materials remain borrowed and are
not disposed.

## Verification diagnostics

The F2 panel reports aim state, targeted/candidate IDs, live/fired projectiles,
impact counts, cooldown, active burn IDs, progress, collision, completion, and
reset counts. The **Check Goop dissolve** regression verifies non-stacking burn
progress, authored eligibility, collision synchronisation, and repeated reset.

Automated target tests additionally cover visible/depth/distance progress
synchronisation, partial-state hold, completion, repeated resets, independent
multi-target uniforms and seeds, shadow-discard injection, and idempotent
disposal.

Historical Issue #31 visual evidence remains in `docs/evidence/`:

- `issue-31-partial.png` shows a stable partial cutout and corrosion band;
- `issue-31-complete.png` shows the route after gameplay completion;
- `issue-31-reset-restored.png` shows the intact target after reset;
- `issue-31-dissolve-reset.webm` records intact, partial, complete, and reset.

## Deferred scope

This feature does not implement arbitrary-mesh dissolution, destructive
geometry mutation, Bob dissolve access, Goop adhesion/rebound, acid damage,
ricochet, penetration, homing, ammo/reload, or audio.
