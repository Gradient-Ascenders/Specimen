# Collision / bounded deformation — isolated Stage 2

Status: playable test environment; **awaiting manual collision/feel review**.
The ground material is already human accepted, not under renewed tuning.
This is not authorization to adopt the body in Level 1 or proceed to Stage 3.

## Play and compare

Run `npm run dev -- --host 127.0.0.1` and open
[the collision lab](http://127.0.0.1:5173/collision-lab.html).
The [original ground lab](http://127.0.0.1:5173/ground-lab.html) remains available.
Both are development-only HTML entries, excluded from the production build.

- WASD/arrows move on world X/Z; release brakes, Shift coasts. R resets; P pauses.
- Select one of 13 environments. Scene/body/friction selection resets the run.
- On **Flat reference / A–B**, switch between finite collision and the original
  accepted plane-contact path with identical material. The actual KinematicBody
  is a third comparator, also available on finite geometry.
- Use close camera distance for contact/material inspection, or course/wide
  distance to see obstacles ahead. Side/top views expose edges and passage width.
- Orange points mark loaded node/triangle contacts. Cage node colors retain
  catch/grip/slide/release; links show strain. Optional internal links, local-volume
  diagnostics and contact/step-limit counters expose collision intervention.
- Record from reset, stop, then replay: complete material/contact state is compared,
  not just the displayed hash. The 10-second reversal tape can also be replayed.
- Zero friction is a diagnostic, not a material preset. Restore it before feel A/B.
- Falls below the course pause with an explicit reset message; there is no hidden
  floor, automatic teleport, jump control or hazard system.

The high-speed and compressed-start rooms use **diagnostic initial conditions**.
They do not grant player abilities. KinematicBody does not receive those cage-only
initial conditions, and its original control response is not calibrated to them.

## Accepted material, frozen

`MaterialPresets.ts` exports the immutable, complete `ACCEPTED_GROUND_CONFIG`,
identified as `accepted-ground-v1`. Both starting states use it; comparison presets
are retired and material/control sliders in the ground lab are disabled.

| Property | Accepted value |
| --- | ---: |
| Stretch | 13× |
| Bending/shear | 25.25× |
| Diameter | 16× |
| Axial damping | 13 |
| Friction | .90 (existing dynamic .65 unchanged) |
| Angular speed | 7.78 rad/s |
| Angular acceleration limit | 85 rad/s² |
| Volume compliance | 2e-6 |

Mass, gravity, node pads, link model, motor, damping, four substeps and eight XPBD
material passes remain unchanged. Collision gets its own bounded contact cleanup;
it does not add elastic stiffness or quietly increase the material solver budget.

## Collision authority and implementation boundary

The physical body is still 42 particle positions/velocities and 80 oriented cage
triangles. There is **no authoritative centre sphere, rigid pose target, or centre
velocity controller**. Node pads are the original per-material-node 50 mm pads,
not a substitute body. The closed triangular skin between them has a 5 mm offset.
These are deliberately distinct: inflating every entire face by the node-pad
radius changed corner behavior unnecessarily.

The only production-source addition is `CollisionWorld.collectBoxCandidates()`:
a batched, registration-ordered bounds query using the existing layer masks and
transform/broadphase caches. Existing sphere queries and diagnostics are unchanged.
The adapter uses the registry's authored **box bounds**, transformed into oriented
3D boxes. It does not promise arbitrary mesh-triangle collision. Current rooms are
static; moving-obstacle contact/transport is deferred.

`DeformableBody` accepts an optional `BodyCollision`. Without one it runs its
original y=0 contact path. With `CageWorldContacts`, each substep validates the
predicted particle update, then each completed material-constraint pass. Proposed
positions remain trial data until that pass's collision/validity check accepts them.

1. Batch candidates over previous/proposed cage extents; refresh when contact or
   constraint corrections leave the current batch bounds.
2. Sweep every node pad. Respect the existing precise-corner opt-in and normal
   transformation/conservative minimum-scale convention.
3. Check every full triangle, not just vertices/edges, against candidate boxes.
   SAT over the six start/end triangle vertices gives a conservative swept hull.
   Temporal subdivision resolves uncertain intervals; an interval is accepted
   only with a separating axis. This includes constraint-driven movement and
   obstacles thin enough for both endpoints and every node trajectory to miss.
4. Solve unilateral normal contact and Coulomb friction on material nodes or
   barycentric triangle points. Contact mass comes from the affected particles.
   Only upward supporting contacts activate the ground motor; a vertical wall
   does not activate airborne wall locomotion or reorient gravity.
5. For difficult coupled contacts, run bounded collision-only cleanup. Remaining
   colliding patches have their own trial displacements shortened locally. A final
   whole-update line search protects the closed skin and topology if needed.
   Free particles are not replaced with a rigid translation/rotation.

The registry's authored `vertical-sides` exception is retained: excluded caps do
not become fictitious ledges. Such a panel intentionally is **not** a closed solid
volume for movement; a patch entering through an excluded cap may leave it.
All 13 visible test environments use closed solid boxes. Regression tests exercise
the side-only exception separately, including broad-side blocking.

For an invalid initial spawn, detect pad/surface intersection **and a solid wholly
enclosed inside the cage**, using oriented solid angle. A bounded search chooses
an exit from actual cage extents, checks nearby solids, and clears velocity. This
explicit reset-only recovery can translate the initial cage; ordinary locomotion
never uses it. An unrecoverable invalid spawn reports an error, not silent leakage.

## Bounded deformation, not rigidity

Inactive inequality guards enforce surface edges between 5% and 300% of rest
length, positive local tetrahedral-fan volumes above 1% of rest, and separation of
non-neighbor surface patches. The fan centre is the **derived particle mean**, not
an extra particle or collision object. Exact extrema of the cubic local volume
along each proposed linear update catch collapse/inversion between endpoints.
Swept non-neighbor face hulls provide conservative self-contact protection.

These guards permit substantial strain but deliberately do not support arbitrary
folding/non-star-shaped topology. They may conservatively restrict extreme squeeze
states. Local patch clipping/line search is dissipative; this is not a frictionless
energy-conserving contact integrator or a guarantee that every apparently passable
gap will admit the body. In particular, the 0.70 m passage can resist entry; reversing
away is tested. Do not hide such issues by retuning the accepted material.

The flat-ground comparison exercises the accepted material with **no patch or
whole-update clipping**, protecting against bounds that silently rigidify normal
movement. Human A/B review is still the authority on preserved feel.

## Environments and evidence

The selector contains flat A/B, solid blocks/steps/corners, finite platforms with a
lower landing, a 15° ramp/bank join, a 45° obstacle slope, a 12 mm post/20 mm plate,
0.70 m and 0.30 m gaps, floor-overlap and enclosed-solid resets, 60 m/s drop onto a
20 mm floor, 80 m/s impact into a 20 mm wall, and compressed-start constraint contact.
Metre marks are clipped to real finite top faces, including the sloping ramp.

Focused automated coverage is in `tests/DeformableCollision.test.ts`:
candidate semantics, a triangle-interior sweep missed by all node trajectories,
constraint-correction face contacts, collapse/inversion guards, accepted-plane A/B,
zero friction, all scene runs, edge release/falling, reversing from gap/post contacts,
side-only caps, complete reset/replay, and 30/60/144 Hz render scheduling.
The scene matrix measures final geometry independently of contact lambda values:
no positive-depth shell intersections, node penetration below 50 micrometres,
finite state, locally valid topology, and bounded volume error. These are finite
test-battery tolerances, not a mathematical guarantee for arbitrary geometry or
arbitrary floating-point speeds.

`npm test` passed **100/100 test files**, including the existing production
controller, collision, collider snapshot and level regressions. The final focused
collision suite passed **10/10**, including the side-only-cap and render-scheduling
checks added after the full-suite run. `npm run build` passed (including TypeScript).
Browser checks cover scene selection,
frozen settings, movement, A/B, record/replay, reset and camera controls. A 94-tick
keyboard-driven recording replayed exactly (`680b2fed`), with no page errors.
The finite flat idle probe settled with less than `6e-14 m` particle drift over
its final 120 ticks and no patch/whole-update clipping. The final focused flat A/B
test also explicitly checks that neither fallback intervenes during normal travel.
Software WebGL browser evidence is not target-hardware performance certification;
full authored-level gameplay/browser traversal is not claimed.

The geometry approach uses the separating-axis framework described by
[Geometric Tools](https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf)
and conservative interval reasoning motivated by the hazards discussed in
[Brochu, Edwards and Bridson's CCD work](https://www.cs.ubc.ca/labs/imager/tr/2012/ExactContinuousCollisionDetection/BEB2012.html).
This implementation is **not** their exact-predicate CCD or IPC; it claims neither's
formal guarantees. Context7 informed standard Three.js triangle/barycentric and
debug-geometry API usage, not the solver's correctness.

## Stop / discard boundary

Stop here for manual review. No adhesion, wall traversal, jumping, Level 1 adoption,
character mesh, custom shaders, moving-platform transport or hazard integration.
All solver/adapter/session/scene work is isolated under `src/experimental/`; the
existing KinematicBody is unchanged. To discard, remove the two lab HTML entries,
experimental directories, lab tests/docs/evidence and the additive candidate-query
interface/method in CollisionWorld. The user-supplied research folder is untouched.
