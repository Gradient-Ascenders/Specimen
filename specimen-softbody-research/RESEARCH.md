# Specimen: an authoritative deformable-body movement architecture

**Research date:** 13 September 2026  
**Specimen baseline:** `main` at `0be476e00094fd2125af2be3065c4a374b4524b3`  
**Primary Gish implementation examined:** FreeGish at `dc21281678a43cb1427c8c2780679181de55c00f`  
**Scope:** movement, body dynamics, contact, control, and gameplay integration. No character-model, shader, morph-target, or animation production work.

## 1. Decision

Replace the slime's authoritative single-sphere movement with a **coarse, fully three-dimensional deformable cage**. Use compliant constraints, per-material-region contact, and a force-limited particle torque actuator. Keep a support frame for interpreting controls, but do not constrain the physical body to that plane.

The proposed hybrid is **physical body plus explicit gameplay policies**, not a kinematic collider plus secondary deformation. The centre, bulk velocity, support state, bounds, and visible geometry must be outputs of the particle state. A centre or bounding sphere can remain useful for broadphase, camera framing, and intentionally coarse triggers; it must not prescribe collision response or locomotion.

The isolated experiment supports this direction: it translates through traction, loses propulsion at zero friction, deforms under impact, retains reversal momentum, and can advance wall contacts with bounded adhesion. It does **not** establish production collision reliability, pure-world-gravity wall climbing, or Level 1 jump viability. The first playable milestone is still a test-room promotion gate, not a completed claim.

No production files, repository branches, or worktrees were modified. The accompanying sandbox is an independently written research artifact, not a port of Gish's C code or an integration into Specimen.

## 2. What the actual Gish implementation does

### 2.1 Representation and topology

`createtarboy()` creates sixteen perimeter particles on a circle of radius 0.9 in the XY plane. Each particle has mass 0.25; the object's nominal mass is 4. The object's radius field is 1.5, which must not be mistaken for the particle-ring radius. There is no physical centre particle in this constructor. The seventeen-particle wheel constructor is a different object. [G1]

For each perimeter index i, the constructor requests bonds to i+1, i+2, and i+8 modulo sixteen. `createbond()` removes duplicate unordered endpoint pairs. The resulting body has **16 perimeter bonds, 16 second-neighbour bonds, and 8 diametric bonds: 40 unique bonds**. Sixteen perimeter segments also describe the object's collision boundary. [G1, G2]

This is a low-dimensional, deliberately structured material model. Second-neighbour links help resist a sharp local fold; diameters provide a weak restorative shape scaffold. It is not an arbitrary dense mesh, a pressure-only balloon, or a rigid object decorated with springs.

### 2.2 Stiffness, damping, and solver scheduling

The relevant active solver is `game/physics.c::bondsimulation2()`, not merely the similarly named generic routine in `physics/bond.c`. The game calls it from `simulation()`. [G3, G4]

The ordinary perimeter/second-neighbour bonds use type 3: elasticity 0.2 and cycle mask 3. Diameters use type 2: elasticity 0.02 and ordinary cycle mask 31. During the **32 velocity-solver passes**, a bond is eligible when `(pass & cycles) == 0`. Thus the ordinary schedules are eight and one applications per tick respectively. These are solver passes, not temporal substeps. [G3]

For a pair, the solver combines current length error with relative velocity projected onto the bond direction. In the source's displacement-per-tick units, its scalar error is approximately:

```
e = (distance - restLength) + dot(vB_previousPass - vA_previousPass, direction)
```

Velocity corrections are scaled by elasticity and divided between endpoints using their masses. Relative motion therefore participates directly in the restorative correction. Directions and current lengths are prepared before the pass loop in the active solver; this is not a fresh position-based geometrical solve each pass. [G3]

There is also particle drag, normally 0.995 per tick. These values are not interchangeable with SI spring stiffnesses, damping ratios, or XPBD compliance. Copying 0.2 into a new solver would not reproduce the material. [G3, G5]

### 2.3 Shape preservation is approximate, not incompressibility

In the inspected player-body path, preservation comes from the link network and its rest lengths. I did not find a pressure equation, polygon-area equality constraint, or explicit incompressibility constraint in that path. This is a scoped source finding, not a claim about every Gish fork. [G1, G3]

An important anti-collapse rule increases the update frequency of a diametric bond to every solver pass when it is compressed below one quarter of its rest length. Shape resistance also changes with player modes. A separate Gish-object check can damage a severely collapsed body when sufficiently separated ring indices become very close. Neither mechanism is a robust general-purpose 3D non-inversion guarantee. [G3, G6]

For Specimen, separate approximately conserved volume from soft shear, bending, and stretch. Do not expect a set of diameters alone to protect a 3D body against flattening, inversion, or opposing-wall compression.

### 2.4 Collision and friction

The active Gish path queries individual body particles against level geometry and generates temporary contact constraints. Object–object interaction additionally uses a particle against another object's perimeter segment, distributing reaction to that segment's endpoints. The generic particle collision routines are not sufficient evidence of the character's active collision behavior. A level-edge/body-edge path in `objectcollision()` explicitly excludes the Gish type. [G3, G4, G7]

The contact constraints are solved alongside the material bonds. `calculatefriction()` limits a tangential correction by a coefficient times the normal correction: a Coulomb-like response. Body friction is normally 1.2; slick mode changes it to 0.01. This is a contact mechanism, distinct from global particle drag. [G3, G5, G6]

The inspected terrain-contact path is not a basis for claiming modern continuous collision detection against arbitrary thin geometry. Specimen should preserve and extend its swept-query work rather than inherit a reliability regression from a literal port.

### 2.5 Locomotion, acceleration, and reversal

The meaningful player locomotion lives in `game/objfunc.c::objectcycle()`; `game/player.c` is largely player/profile management, not the blob controller. `objectcycle()` derives object position and velocity from its particles. For Gish, it computes a support orientation from contacts and maps input into a spin command. Supported particles receive tangential velocity increments around the derived centre. [G6]

The characteristic tangential increment is `spin * 0.004` per eligible tick. The same block also adds smaller direct per-particle directional increments: horizontal input uses 0.001; upward input uses 0.0005; downward input uses 0.001. Gish is therefore **not a perfectly torque-only simulation**. Its tangential vectors are normalized individually, which also means their sum need not vanish on a distorted body. [G6]

Nevertheless, the essential architecture is the one requested: act on material points; let contacts and internal coupling determine the resulting motion. A lower material region can resist the floor while other regions advance and load the body. The controller is not setting a rigid body's desired translation and then animating the skin.

There is no target-centre-velocity clamp or instant reversal assignment in this locomotion block. Ongoing input, drag, friction, stiffness, and stored particle velocities interact. Reversing input changes the forcing rather than erasing every material point's momentum. [G6]

Specimen should retain that causal direction, while implementing a more deliberate three-axis torque actuator and explicit response envelopes. The lab's zero-net-linear-force motor is intentionally cleaner than Gish's exact mixed steering implementation; it is not a claim to be source-equivalent.

### 2.6 Jumping, compression, and player modes

The input mapping identifies jump as button bit 2 and heavy mode as bit 8. In the Gish object block, either enables diametric bonds on every solver pass. Ordinary operation schedules those bonds much less often. Jump thus materially changes the body's restorative response; the inspected jump path does not set a scalar launch velocity. Heavy mode additionally increases node mass and gravity. [G4, G6]

This explains why compression and input timing matter, but it must not be misreported as Specimen's hold-to-charge/release-to-launch contract. A faithful 3D material can still have an unsuitable jump height. Internal actuation without a contact reaction cannot independently accelerate an isolated body's centre of mass; explicit air-control or coyote-jump assistance must be identified as gameplay forces rather than credited to elasticity.

### 2.7 Adhesion is persistent, local, and breakable

World adhesion creates persistent node-specific anchor constraints. Adhesion to another deformable object can use an interpolated point on that object's segment, distributing reaction across its endpoints. These sticky constraints survive the ordinary per-tick contact cleanup. They break on a separation/relative-motion test or relevant input/material changes. The separation thresholds in the old solver are not force limits measured in newtons. [G3]

This is more informative than saying “raise friction.” Adhesion can sustain tensile attachment away from a surface, while ordinary unilateral contact cannot. Rolling grip also requires release: pinning all acquired material points forever creates a welded body, not crawling.

### 2.8 Integration and reconstruction

`PHYSICSCYCLE` is 50. The normal game scheduler uses a 20 ms tick, with a bounded catch-up loop; turbo uses a different scheduler interval. `particlesimulation()` applies drag and advances positions using stored velocity. The main simulation then applies gravity, generates contacts, runs object control, and solves bonds to adjust velocities. Gish's active scheme is not the article's position/previous-position Verlet demonstration. [G4, G5]

`prerender.c` constructs a 33-vertex render object from the sixteen-node state, inserting interpolated perimeter positions. Sticky render positions can use their anchor positions. More render vertices do not imply more physical particles. Specimen can eventually build presentation from its cage in the same one-way fashion; the current milestone should simply render the actual material nodes and links. [G8]

### 2.9 What the 2006 “Blob Physics” article adds

Mick West's article presents an illustrative Verlet-based blob, not Gish's exact solver. Its first centre-and-ring design folded and snagged; a double-skin structure improved the result. It stresses separate force gathering and integration, and discusses smaller steps and resolution-related kinking. The useful lesson is to test topology, curvature resistance, and contact behavior together—not to attribute its double ring to Gish. [A1]

## 3. Audit of Specimen's actual main

### 3.1 Current authority and motion

`KinematicBody` owns one sphere's position, previous position, velocity, ground normal, gameplay-up, attachment, jump state, and contacts. `applyLocomotion()` projects input into the current support plane and moves tangent velocity toward a target. Default ground acceleration/braking are 32/36 m/s², nominal maximum speed 5.5 m/s, gravity 18 m/s², radius 0.45 m, and skin 0.01 m. These are **class defaults**, not a claim that every slime definition uses every default unchanged. [S2]

`moveAndSlide()` sweeps that sphere, moves its centre to the first impact, removes inward motion, and repeats up to the configured collision iteration count. Grounded gravity deliberately omits passive downhill acceleration. Attachment sets a single gameplay-up/support normal and removes the normal component of the body's velocity. A convex sticky-edge transition can rotate velocity and reposition the centre using a probe hit. Those are useful current gameplay behaviors, but they cannot remain the physical authority for a deformable replacement. [S2]

### 3.2 Collision infrastructure to retain, with important qualifications

`CollisionWorld` is a layered query registry, not a rigid-body simulator. It already provides authored collider registration, transform caches, static spatial broadphase, dynamic-collider handling, stable candidate ordering, masks, reusable hit objects, and diagnostics. Keep that investment. [S3]

However, the exact sphere–box feature solver is **opt-in** for movement colliders with `preciseMovementCorners`. Other queries retain conservative expanded-box behavior. Non-uniform scale remains conservative. `movementFaceMode = 'vertical-sides'` intentionally hides thin panel caps and edge strips from movement while leaving the camera's geometry intact. A replacement must preserve these authoring semantics. [S3, S4]

A particularly important interface detail: **`CollisionHit.point` is currently the swept sphere centre at impact, not the physical surface anchor**. It cannot be copied directly into a new adhesive contact. Moreover, a zero-displacement sweep returns false; it is not a penetration-depth or persistent-contact query. New contact generation needs genuine surface locations, closest features, overlaps, and multiple simultaneous contacts. [S3]

### 3.3 Jump and bounce contracts

The default charged jump launches between 5.37 and 9.84 m/s, using a 0.7 s maximum charge and exponent 1.35. The default coyote window is 0.1 s and input buffer 0.12 s. Wall launch preserves tangent locomotion and may retain local surface gravity for 1.35 s. Retain those input and directional policies initially, even while replacing how the impulse or actuation is produced. [S2]

At gravity 18, the ideal ballistic rise associated with the default minimum/maximum launch speeds is approximately 0.80/2.69 m. These calculations ignore collision, air control, and changes in gravity direction, so they are reference envelopes, not a substitute for measuring the authored route.

An important documentation discrepancy: a teaching document describes an impact-scaled innate rebound, but current `tryApplySlimeLandingReactionHop()` checks a hard-landing threshold and applies a configured fixed hop. Defaults are a 10 m/s threshold and a 5 m/s outgoing hop; buffered deliberate jump input takes priority. Do not retain this automatic hop unchanged on top of an independently energetic elastic rebound: it can double-count energy. Current code should decide the baseline, not the older description. [S2, S6]

### 3.4 Level 1 is a stronger acceptance test than an empty floor

The authored progression requires sticky-wall-to-vent traversal without a jump, the Room 2 drop and charged platform route, an elevated wall catch, Room 3 laser traversal, the Room 4 elevator, Room 5 moving platforms and sticky transfers, and a lever requiring 0.35 s attachment. Recovery resets the relevant puzzle group before recovering the body. Current controller code maintains persistent bodies, room state, completion state, and checkpoint ownership. [S6, S7, S8]

These are architectural constraints, not scenery. In particular, “the blob can climb an infinite wall” does not validate the vent lip, an elevator edge, the lever, or the sequence after a death.

### 3.5 Retain / extend / replace

| System | Decision | Required change |
|---|---|---|
| `Loop` | Retain | Keep 60 Hz gameplay, render interpolation, pause handling, bounded catch-up. Substep only the body's physical solve. |
| Named input and movement intent | Retain | Feed a force/constraint policy rather than a centre-velocity controller. |
| `KinematicBody` authority | Replace for deformable slimes | Node state owns motion. Keep the old body behind a comparison flag and for unaffected entities during migration. |
| `CollisionWorld` | Retain and extend | Batch broadphase and true multi-feature contacts; keep layers, visibility, surface-face exceptions, caches, and deterministic ordering. |
| `SurfaceRegistry` | Retain authoring boundary | Add physical friction/adhesion parameters. Current `tractionMultiplier` scales acceleration/braking; it is not already a Coulomb coefficient. |
| Coyote, buffer, charge, ability gating | Extract and retain as policy | Do not reuse their direct velocity setter as the material solver. |
| Attachment, probing, edge snapping | Replace | Persistent local contacts and a support-policy state machine; no whole-body snap/rotation. |
| Carrier displacement | Replace | Contact-point relative motion and local anchors; remove the extra centre-translation path for soft bodies. |
| Camera | Retain observer role | Read derived centre/bounds and authoritative support frame; no feedback of camera smoothing into physics. |
| Hazards | Retain timelines/death routing | Replace sphere-only narrowphase with deformable-shape intersection and swept coverage. |
| Checkpoints / `PuzzleRegistry` | Retain ownership | Reset every particle, constraint, grip, motor, frame, and interpolated state after world reset. |
| Persistent slime manager | Retain policy | Introduce a body interface; maintain physical simulation of inactive bodies as required. |
| Visual slime / one-shot squash | Leave out of milestone | Use debug geometry only; later consume physical state without changing it. |

The source for these boundaries is the current body, loop, registry, level controller, and laser target interface. `LaserContactTarget` currently exposes only position and radius; `LaserHazardSystem` already latches one recovery request rather than emitting one per intersecting beam. Preserve that event discipline when many nodes touch. [S2, S3, S5, S8, S9, S10, S11]

## 4. Practical 3D architecture

### 4.1 Why not a support-plane 2D ring?

A genuine 2.5D body would be appropriate for lanes or a side-scrolling world. Specimen needs two independent tangent directions on a floor, two on a wall, steering between them, diagonal ledges, and simultaneous contacts with multiple faces.

A vertical ring can contain a support normal and one travel direction. Turning changes that ring's plane. Rotating/reconstructing the physical ring to follow input would also rotate material velocities, deformation, and anchors. Extruding it does not automatically solve lateral contact or corner wrapping. A body on a floor and wall simultaneously is not adequately represented by one such ring.

**Use the support plane for control interpretation only.** All nodes remain in world-space XYZ, and each contact keeps its real geometric normal. Camera orientation is another separate observer state.

### 4.2 Start with a coarse closed cage, not a fluid solver

The experimentally exercised starting topology is an icosahedron subdivided once: **42 surface nodes, 80 triangular faces, 120 surface edges**. The lab adds 120 across-edge distance links as bending/shear surrogates, 21 opposite-node links, and one global volume constraint: 262 structural/volume constraints before contacts.

These additional links are not a claim of continuum-correct bending. They provide a small, inspectable initial material. Start with soft stretch and bending/shear, weaker cross-body restoration, and stronger volume resistance. Keep rotation free: rest shape must not be attached to a world-space orientation.

A closed shell's signed volume is useful but insufficient. Before production, add local collapse/inversion guards and non-adjacent self-contact or a demonstrated deformation bound. A finite-mass internal node and non-inverting tetrahedral fan is a concrete fallback if the shell cannot pass the squeeze tests. It would be a passive part of the physical scaffold, **not an authoritative centre**. Avoid making every tetrahedron individually incompressible or all radial spokes rigid: that would erase the intended local flow.

Do not start with hundreds of fluid particles, a high-resolution render mesh as the simulation mesh, or a globally rigid shape-matching target. The gameplay requires a bounded, cohesive, steerable elastic body; topology changes, splitting, and fluid flow are not current requirements.

### 4.3 State and interfaces

A proposed `DeformableSlimeBody` contains preallocated node positions, prior-substep positions, prior-fixed-tick positions, velocities, masses, topology, rest constraints, multipliers, contact records, and fixed-tick gameplay policy state.

A small `GameplayBody` observer/interaction interface should expose derived position and velocity, nominal size/bounds, gameplay-up, support information, physical contact queries, recovery, and explicitly distributed external impulses. Keep separate `LocomotionActuator`, `JumpPolicy`, `GripPolicy`, and `SupportFrame` responsibilities. Avoid a monolithic port that mixes Three.js mesh traversal, jump input, constraint solving, death, and presentation.

The dependency direction is:

```
input + ability/jump policy
    -> particle forces / material actuation / adhesive constraints
    -> deformable-body integration and collision solve
    -> derived centre, velocity, support, bounds, contact events
    -> camera, hazards, progression, later presentation
```

A read-only position getter may retain its existing name. It must not become a writable movement target through an adapter.

### 4.4 Solver and body preservation

Use XPBD for compliant distance/volume constraints rather than explicit stiff springs. For substep h, compliance is scaled as `alphaTilde = alpha / h²`, and a scalar constraint updates its accumulated multiplier using its error, gradient, inverse masses, and compliance. Store multipliers through the solve, reset them at each substep unless a deliberate warm-start scheme is implemented, then reconstruct velocity from corrected displacement. [P1]

Start at the existing 60 Hz outer tick with **four substeps and eight passes**. This is an experimentally exercised starting budget, not a theorem or a final setting. The small-steps paper motivates comparing temporal substeps with extra iterations; it does not prove that one budget is best for these contacts. [P2]

In the lab's own drop test, one, two, four, and eight substeps did not produce identical deformation or volume error. Finite solve budgets still matter. Retest rather than treating XPBD's material parameterization as a guarantee of identical trajectories.

Use pairwise axial damping or a well-defined constraint damping model. Do not heavily damp all particle velocities toward a shared centre velocity: that destroys precisely the local lag being sought. Moderate, explicit air drag can remain a separate gameplay parameter.

For a closed oriented surface, volume can be computed by summing signed triangle tetrahedra relative to a nearby reference point. Use consistent orientation, validate the volume gradient, and track local validity independently of total volume. The volume constraint and collision constraints must participate in the same substep loop; a volume-restoration pass must not freely push the body through a wall after collision is supposedly complete.

### 4.5 Actuation that genuinely produces locomotion

The lab estimates angular velocity from particle positions and velocities using the cage's inertia matrix. Input specifies a target angular motion about `supportNormal × desiredTangentDirection`. A bounded torque-like actuator applies node acceleration proportional to `angularAcceleration × (nodePosition - massCentre)`.

Because the mass-weighted offsets sum to zero, this actuator adds no net translational force in isolation. On a floor, contact resists the lower material's movement, and the reaction moves the body. Opposite input changes torque; it does not replace centre velocity. Braking is also a bounded actuator/contact process.

A three-axis estimate matters. An early scalar-axis version of the lab developed lateral drift during straight travel; controlling unwanted angular components through torques greatly reduced that drift without adding a centre-translation correction.

An air-steering force, speed governor, or small direct steering assist may still be appropriate—Gish itself uses direct per-particle steering. Keep each named, bounded, and individually disableable. A speed limit should reduce opposing/propulsive force or apply a documented distributed force, not quietly restore the old target-centre-velocity controller.

### 4.6 Contact should grip material regions, not the centroid

Give each persistent contact a material identity, collider/feature identity, true surface location, normal, relative surface velocity, normal load, and tangential history. Static friction retains a local anchor until the required tangent force exceeds its load-dependent limit; sliding updates that anchor according to kinetic friction. Adhesion adds a separate tensile constraint and release criterion.

The local sequence should be: acquire contact, load, hold or slide, peel/release, and reacquire elsewhere. Which material points go through that sequence must follow the physical state rather than a visual phase timer.

For barycentric contact on a face, let the material contact point be `p = sum(b_i * x_i)`. Its normal-constraint gradient on node i is `b_i * normal`; the effective inverse mass is `sum(w_i * b_i²)`. A normal or tangent correction is distributed back through those weights. Thus an edge midpoint or face-interior contact can push the actual body without becoming an extra independent mass or a hidden rigid collider.

### 4.7 A point cage is not a closed collision skin

With small node radii, a thin obstacle can pass through the gap between nodes or through a face. Increasing node radii until every gap is covered can create a lumpy, inflated collision envelope. Neither is a production solution.

Build a batched collision adapter around the existing registry. Gather candidates from the body's swept bounds once, then generate node/edge/face contacts against the authored boxes and their permitted faces. Start by exercising existing sphere sweeps for nodes, but add true swept feature coverage or a conservative swept volumetric representation before claiming reliable collision. Virtual barycentric samples are useful for contact quality, **not by themselves a proof against tunnelling**.

Test both body features against world faces and obstacle features against body faces. Include initial-overlap recovery, tiny displacement, thin geometry, corners, and deformation-induced motion after the initial prediction. Update contact candidates when corrections expand the swept envelope. Preserve exact-corner opt-ins, side-only panel rules, layers, and deterministic ties.

The hardest engineering risk is this closed, continuously covered collision skin—not whether a few dozen constrained nodes can run in a browser.

### 4.8 Adhesion, support transitions, and gravity

Store adhesive anchors in the contacted collider's local coordinates. Use finite force/separation limits and a short reacquisition policy so a peeled point does not immediately re-weld. Scale production grip limits by represented surface area or patch budget, not an unchanging force per vertex; otherwise increasing node count makes adhesion stronger for accidental reasons.

Choose the control support frame from actual loaded contact patches with hysteresis and transition intent. Do not simply average a floor and wall normal and treat the average as actual collision geometry. Physical contacts retain their own normals even while control interpretation changes.

Preserve Specimen's authored surface-gravity policy initially, including its post-wall-jump behavior. Apply that gravity as a force on every mass, not by moving a collider. Keep it distinct from adhesion. Removing local gravity in the same change would alter Level 1's traversal contract and make it difficult to tell a material bug from a gameplay redesign.

The Room 1 vent lip is a mandatory dedicated test: the next contact patch must acquire support while old wall contacts release. The current whole-centre reposition/velocity-rotation shortcut cannot remain the soft body's hidden solution.

### 4.9 Jumping and landing need their own validation

The preferred mechanism is a charged internal actuation that preloads/compresses the supported body, then releases/restores it through the contact solve. A short, bounded extension actuator can help deliver a repeatable take-off without overwriting the entire velocity field. Calibrate the injected work against the required launch envelope and retain tangent momentum.

The lab's release experiment rises only about 0.113 m above its settled centre. That is far below the default game's maximum jump envelope. This is direct evidence that “elastic body plus stiffness switch” is not sufficient tuning for Specimen.

If precise platform reach needs additional assistance, use an explicit limited body-distributed impulse or support-contact actuator, record its contribution, and preserve the deformation state. Coyote-time assistance, in particular, is not a current contact reaction. Do not mislabel it as one. First gate pure ground traction independently of such assists, so jumping accommodations cannot conceal sliding locomotion.

On landing, separate material rebound, deliberate buffered jump, and an authored reaction-hop policy. Choose which owns the outgoing energy. Do not add all three unconditionally.

### 4.10 Moving surfaces, hazards, reset, and performance

Moving supports must provide previous/current transforms and point velocity, including rotational motion. Solve friction and adhesion relative to the contacted point. Do not also run the old `applyCarrierDisplacement()` on the derived centre; that would transport the body twice. Coordinate the outer gameplay order so carrier poses are sampled consistently through the substeps, then evaluate hazards/progression once against the completed physical step and swept interval.

Hazards must test the physical cage, including a beam passing between nodes or entirely through its interior. Keep stable body identity and one death request per relevant contact episode. Coarse bounds may reject distant hazards quickly but should not kill the player solely because a loose broadphase sphere touched a beam.

Reset must clear positions, velocities, interpolation state, constraint multipliers, contact IDs, local anchors, release cooldowns, support selection, motor state, charge/buffer/coyote timers, gravity-transition state, and pending events. Reset world puzzle poses first. The included same-engine repeat test is exact; cross-engine/network determinism has not been established.

Keep the first implementation CPU-based and preallocated. Batch collider queries; do not traverse or refresh scene transforms separately for every node and every solver pass. Measure all persistent bodies, not just the active one. Quality changes must be explicit in replay/config state rather than silently changing with render FPS.

## 5. Experiments and actual results

The original solver is in `softbody.js`; `tests.cjs` writes the full machine-readable measurements. The default cage has 42 nodes, nominal outer size near the current game's scale, 262 structural/volume constraints, and a 60 Hz × 4 × 8 solve. Contact is against planes only.

| Experiment | Measured result | Interpretation |
|---|---:|---|
| Ten-second floor run; forward command after settling | 24.512 m X displacement | Traction produces translation without a centre-velocity setter. |
| Same run, friction zero | X displacement about −6.65 × 10⁻¹³ m | Torque alone does not propel the body across the floor. |
| Drop with initial centre y=2 m | Minimum body height 0.674 m; maximum volume error 0.274% | Material compresses while global volume remains close to rest in this case. |
| Reversal from about +2.705 m/s | Still +2.603 after first reverse tick; sign reversal at 0.25 s; 0.294 m overshoot | Input does not erase momentum. |
| Compression/release | Peak centre rise about 0.113 m | Not enough for the current charged-jump route. |
| Wall climb, finite adhesion, surface gravity | About 11.55 m upward over the five-second command interval | A scoped attachment/release proof, not a world-gravity Gish clone. |
| Same wall policy, effectively unbreakable anchors | About 0.090 m net climb | Permanent welding prevents locomotion. |
| World-gravity wall variant at this tuning | Does not sustain the intended climb | Explicit unresolved case; not a passing promotion test. |
| Reset and repeated 600-tick tape | Exact state hash match | Same implementation/runtime/config repeatability. |
| 30/60/144 Hz render scheduling | Same 360-tick final hash | Rendering does not change the sampled fixed-tick simulation. |

The script also checks moving-plane transport, a 15-degree plane ascent, and zero net translational actuation in free space. Those checks do not cover finite platforms, changing support patches, or general level geometry.

### Browser measurements

An actual headless Chromium 144 run in the shared research container measured one isolated body, 360 timed fixed updates after warm-up, four substeps, eight solver passes:

| Surface nodes | Mean fixed-update time | p95 |
|---:|---:|---:|
| 12 | 0.144 ms | 0.300 ms |
| 42 | 0.466 ms | 0.600 ms |
| 162 | 1.852 ms | 2.200 ms |

The body core is plausible at 42 nodes; this is **not** an acceptable-browser-performance sign-off for Specimen. These times exclude its authored collision world, multiple bodies, hazards, and rendering, and are not measurements on the user's laptop. Node-count material coefficients were not resolution-normalized. The HTML includes a benchmark button for local reproduction.

### Budget exploration

For the same y=2 m drop, maximum global volume error was about 0.891% at 1×8, 0.409% at 2×8, 0.274% at 4×8, and 0.338% at 8×4. All tested cases remained finite, but deformation and strain differed. Four substeps/eight passes is a reasonable starting point from this limited sweep, not a universal optimum.

## 6. Staged implementation on the new branch

### Stage 0 — Freeze the reference and isolate the new owner

Pin the source SHA and record short current-main traversal/input captures. Catalogue actual room geometry and per-slime overrides. Introduce a narrow body interface and a development-only soft-body test route. Keep the old controller switchable for comparison; do not replace every caller in one commit.

**Gate:** existing main tests still pass; the new test route does not alter production Level 1. No art dependencies.

### Stage 1 — Cohesive body and genuinely contact-driven locomotion

Implement the 42-node cage, fixed substeps, constraint diagnostics, contact-driven actuation, static/sliding friction, reset, and debug view. Port the useful lab ablations, but not its plane-only collision as a finished world adapter.

**Gate:** deformation on drop; local contact turnover; zero-friction propulsion ablation; inertial reversal; free-space centre test; stable idle and repeatable reset. Human comparison against Gish is required for feel; numerical success alone is insufficient.

### Stage 2 — Production collision and bounded deformation

Extend `CollisionWorld` with batched candidates and feature contacts. Add a closed collision skin, initial-overlap treatment, inversion/self-contact protection, and authored face-rule preservation. Exercise floors, 15-degree slopes, steeper non-walkable surfaces, platform sides/edges, narrow gaps, corners, thin obstructions, and high-speed drops.

**Gate:** no tunnelling, no inverted/inside-out body, no fictitious ledges, and no final-pose-only correction through thin geometry across the test battery. Suggested contact tolerance targets must be scaled to the existing 1 cm skin and actual level features, not copied blindly from the lab's exact planes.

### Stage 3 — Adhesion and support transitions

Implement local-space anchors, patch-scaled tensile/shear limits, release hysteresis, support-frame selection, and current surface-gravity policy. Test mixed floor/wall contacts, wall-to-wall corners, convex lips, clean-wall rejection, detachment, and jump reacquisition cooldown.

**Gate:** Room 1's sticky route enters the vent without a jump or a whole-body snap. Room 2's catch and the lever's attachment semantics are predictable.

### Stage 4 — Jump, landing, and envelope calibration

Extract charge/buffer/coyote policy. Calibrate support-based actuation and any explicit assists to the current launch/reach contract. Validate rebound energy and buffered-jump priority. Measure take-off from moving surfaces and along local wall up.

**Gate:** the full Room 2 platform route and wall catch work without enlarging hidden colliders or inventing a visual jump; no doubled bounce energy; the maximum/minimum charge distinction remains useful.

### Stage 5 — Level systems and multiple bodies

Replace carrier-centre transport with relative contact motion. Adapt hazards, checkpoints, trigger semantics, persistent-body identity, ability gating, and camera observer interfaces. Clear all new state during recovery. Preserve deterministic puzzle ordering and once-only completion.

**Gate:** elevator warning/ascent/arrival and roof edges, Room 5 moving platforms, lever hold, repeated deaths/retries, inactive-body behavior, and a clean five-room completion run all pass. Neither the old sphere nor the camera is correcting the blob behind the scenes.

### Stage 6 — Target-browser profiling and feel sign-off

Profile the real authored scenes on the user's intended browsers and laptops, including all persistent bodies and simultaneous contacts. Collect p50/p95/p99 physics time, candidate and feature counts, allocations, penetration, volume/strain extrema, support churn, and reset equivalence. Tune force limits, compliance, and damping using both fixed tapes and human play.

**Gate:** agreed full-scene frame budget and predictable controls. Only after this gate should a character presentation be attached to the physical cage.

## 7. Highest-risk decisions to keep visible

1. **Collision coverage:** node sweeps leave holes; constraint projection itself can cross geometry. This is the first production engineering priority.
2. **Overconstraint versus collapse:** strong shape restoration makes a rolling rubber ball; insufficient local validity permits folding or inversion even with correct total volume.
3. **Adhesive lock versus release cascade:** grip must permit contact turnover without making wall support fragile. Patch area and node count must not accidentally redefine material strength.
4. **Jump/landing energy:** elastic response and authored assists can undershoot the route or double-count rebound energy.
5. **Support-frame transitions:** changing input/gravity frames must not teleport material state, overwrite momentum, or inherit camera damping.
6. **Integration and cost:** carrier ordering, sphere-only hazard interfaces, persistent bodies, and query multiplication can break a solver that looks excellent on an infinite floor.

The recommended next production-facing work is the body interface plus the isolated test route and collision-contact API—not a character mesh and not a wholesale untested deletion of `KinematicBody`.

## 8. Source atlas

These links identify the inspected versions. The analysis of concrete Gish constants is qualified to the pinned FreeGish implementation, not asserted to be a byte-identical reconstruction of the 2004 retail executable. The separately inspected `blinry/gish` constructor is refactored around a resolution variable, illustrating why forks must not be treated as interchangeable.

### Gish / FreeGish

- **G1 — Construction / topology:** [FreeGish `src/game/gameobject.c`, `createtarboy`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/game/gameobject.c).
- **G2 — Bond allocation / duplicate suppression:** [FreeGish `src/physics/bond.c`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/physics/bond.c).
- **G3 — Material setup, character collision, active 32-pass solver, persistent/breakable adhesives:** [FreeGish `src/game/physics.c`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/game/physics.c).
- **G4 — Scheduler, simulation order, input bits:** [FreeGish `src/game/game.c`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/game/game.c).
- **G5 — Particle integration, friction helper, rate definition:** [FreeGish `src/physics/particle.c`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/physics/particle.c) and [`particle.h`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/physics/particle.h).
- **G6 — Actual material-level player control and derived object state:** [FreeGish `src/game/objfunc.c`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/game/objfunc.c).
- **G7 — Object intersection helpers:** [FreeGish `src/physics/object.c`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/physics/object.c).
- **G8 — Reconstruction from physical/adhesive state:** [FreeGish `src/game/prerender.c`](https://github.com/freegish/freegish/blob/dc21281678a43cb1427c8c2780679181de55c00f/src/game/prerender.c).

### Article and solver papers

- **A1:** Mick West, *Blob Physics*, 2006 Game Developer column, [author's 2007 republication](https://cowboyprogramming.com/2007/01/05/blob-physics/).
- **P1:** Macklin, Müller, Chentanez, *XPBD: Position-Based Simulation of Compliant Constrained Dynamics*, 2016, [author-hosted paper](https://matthias-research.github.io/pages/publications/XPBD.pdf), especially the algorithm and compliant update equations.
- **P2:** Macklin et al., *Small Steps in Physics Simulation*, 2019, [author-hosted paper](https://mmacklin.com/smallsteps.pdf).

### Specimen, pinned main

- **S1 — Historical authority decision:** [`docs/kinematic-controller.md`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/docs/kinematic-controller.md). Read as historical documentation; current code supersedes outdated feature descriptions.
- **S2 — Current body / movement / jumps / attachment / carrier / recovery:** [`src/physics/KinematicBody.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/physics/KinematicBody.ts).
- **S3 — Registry, broadphase, masks, opt-in precise corners, side-only faces, hit semantics:** [`src/physics/CollisionWorld.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/physics/CollisionWorld.ts).
- **S4 — Exact local sphere/box feature routine:** [`src/physics/SphereBoxSweep.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/physics/SphereBoxSweep.ts).
- **S5 — Fixed-step scheduler:** [`src/core/Loop.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/core/Loop.ts).
- **S6 — Room 1/2 route and surface teaching contracts:** [`docs/containment-teaching-greybox.md`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/docs/containment-teaching-greybox.md).
- **S7 — Five-room route, moving surfaces, recovery, lever:** [`docs/containment-level-greybox.md`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/docs/containment-level-greybox.md).
- **S8 — Actual progression, persistent-body and checkpoint integration:** [`src/levels/ContainmentLevelController.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/levels/ContainmentLevelController.ts).
- **S9 — Current sphere target interface:** [`src/hazards/LaserHazard.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/hazards/LaserHazard.ts).
- **S10 — Once-per-contact hazard routing and reset:** [`src/hazards/LaserHazardSystem.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/hazards/LaserHazardSystem.ts).
- **S11 — Authoring surface definitions:** [`src/physics/SurfaceRegistry.ts`](https://github.com/Gradient-Ascenders/Specimen/blob/0be476e00094fd2125af2be3065c4a374b4524b3/src/physics/SurfaceRegistry.ts).

No upstream game source, binaries, art, or font files are included in this package. Review licensing before copying any upstream implementation; the research prototype is separately written.
