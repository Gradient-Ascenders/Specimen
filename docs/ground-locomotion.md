# Ground locomotion prototype — Stage 0 / ground-only Stage 1

Status: **flat-ground material/feel accepted by the user, 13 September 2026**.
The winning comparison was “More cross-body softness”. It is now the locked
`accepted-ground-v1` baseline. Do not retune it to compensate for collision work.
The next isolated milestone is documented in [Collision / bounded deformation](collision-lab.md).
Neither milestone approves Level 1 adoption.

## Play

Run `npm ci` if needed, then `npm run dev -- --host 127.0.0.1` and visit
[the ground lab](http://127.0.0.1:5173/ground-lab.html).
This is a separate Vite development entry. It is not included in `npm run build`.
The normal `/` entry and every production controller caller remain unchanged.

- WASD / arrows: world X/Z movement. D is +X; W is -Z. Camera selection does not change input axes.
- Release movement: bounded rotational braking. Hold Shift: release both motor and brake to coast (cage only).
- R: deterministic reset. P: pause/resume. One tick: advance one fixed tick while paused.
- Controller/body: select the actual `KinematicBody` comparator or the deformable cage; selection resets.
- Material: **Accepted ground reference · v1**, with material and control-response sliders locked. Prior comparisons are retired.
- Friction diagnostics reset. Use **Zero friction + reset**, then hold D or play the reversal tape; restore grip before A/B review.
- Reversal tape: 120 idle ticks, 240 +X ticks, 120 -X ticks, 120 coast ticks. Ends frozen for inspection; R returns to play.
- Record from reset: up to 1,800 ticks (30 seconds). Stop, then Replay last tape; body/config/spawn restore automatically.
- Save tape downloads versioned JSON with sampled inputs, config, and expected final state for review. There is no file-import UI in this milestone.

For feel review, try sustained D, reverse with A while moving, brake by releasing,
and compare coasting. Side view makes material rotation easiest to read; oblique
and top views expose the real three-dimensional body and steering. Switch to the
original controller to compare its response. Its original 5.5 m/s speed and
braking are preserved. Cage travel speed now varies with material response;
every material preset uses the same 7.78 rad/s motor target and 85 rad/s² limit. Shift and
the friction slider do not modify the original controller.

The debug nodes and all links follow solved material positions. White marks a
new catch, green loaded grip, orange sliding, and pink a recent release. Crosses
show persistent floor anchors; force bars show normal and tangential load
(0.05 visual metres per newton). The selected material node has a white diamond,
a trajectory, and a text readout. Surface links show stretch/compression; internal
links can be enabled separately. Idle need not wiggle: the “alive” target applies
to sustained movement.

## Accepted baseline — current

The immutable `ACCEPTED_GROUND_CONFIG` in `MaterialPresets.ts` explicitly freezes
the complete configuration rather than inheriting future solver-default changes.
Both labs start with it; **Restore accepted reference** also restores it.
Existing recordings still carry their complete numeric configuration.

| Property | Accepted value |
| --- | ---: |
| Surface/stretch multiplier | 13× (`.0195` compliance) |
| Bending/shear multiplier | 25.25× (`.37875` compliance) |
| Cross-body/diameter multiplier | 16× (`.96` compliance) |
| Axial damping | 13 |
| Static / dynamic friction | .90 / .65 (dynamic unchanged) |
| Angular speed / acceleration limit | 7.78 rad/s / 85 rad/s² |
| Volume compliance | 2e-6 |

The original plane-contact path, actual KinematicBody A/B comparator, 42-node
cage, four substeps/eight material passes, contact motor and damping algorithm
remain available. The collision lab selects its optional collision adapter;
the ground lab does not instantiate it.

`GroundMaterialPresets.test.ts` now checks the accepted winner/default, retirement
of comparisons, cohesion/settling/zero friction and exact replay restoration.

## Historical material exploration — superseded, not current controls

The following preserves the earlier comparison measurements. “Preferred” in this
historical section means the **previous 13× diameter** reference; its **16× diameter**
comparison won the subsequent manual review. Sliders and comparisons described
here are no longer enabled. Historical pending-review statements are superseded
by the acceptance above.

`MaterialPresets.ts` preserves the exact requested reference: angular speed
7.78, angular acceleration limit 85, stretch 13×, bending/shear 25.25×,
diameter 13×, axial damping 13, friction .90, volume compliance 2e-6.
It is the initial session configuration and the **Restore preferred reference**
button target. The original `DEFAULT_CAGE_CONFIG` remains the historical research
baseline for the original tests; existing tapes still restore their numeric config.
Preset identity is inferred from the complete configuration, so hand tuning reads
**Custom tuning**, and replay restores the correct named preset where applicable.

The three independent compliance sliders replace combined softness. Higher values
permit more stretch, more bending/shear, or weaker diameter restoration respectively.
Values are multipliers of the original link-family compliances: stretch `.0015`,
bending `.015`, diameter `.06`. Each slider also displays the absolute compliance.
The bending/shear control adjusts opposite-face links; it is not a new continuum
shear solver. Axial damping still uses the existing momentum-preserving pairwise
model. No force, mass, friction, solver-budget or damping-algorithm change is hidden
inside a preset.

| Preset | Stretch | Bend/shear | Diameter | Axial damping |
| --- | ---: | ---: | ---: | ---: |
| Preferred reference | 13× | 25.25× | 13× | 13 |
| More shear | 13× | 32× | 13× | 13 |
| More cross-body softness | 13× | 25.25× | 16× | 13 |
| More stretch | 16× | 25.25× | 13× | 13 |
| Slightly more damping | 13× | 25.25× | 13× | 15 |
| Slightly less damping | 13× | 25.25× | 13× | 11 |

All six keep angular speed **7.78**, angular acceleration limit **85**, static/
dynamic friction **.9/.65**, and volume compliance **2e-6**. Volume remains a
separate, strong constraint with no material-slider coupling. The reference's
absolute stretch/bend/diameter compliances are `.0195 / .37875 / .78`.
Comparisons inherit the complete reference and override exactly one material key;
the tests enforce that no other setting changes. The intended character is very
deformable shear/bending with cohesive, volume-preserving goo and fairly strong
damping. Material feel remains a human decision.
Control-response sliders remain under a separate collapsed section; their ranges
were not increased and the speed slider now represents 7.78 exactly (step .01).

Expanded ranges: stretch **.25–24×**, bend/shear **.25–48×**, diameter **.25–48×**,
axial damping **0–40**. The three old softness limits were effectively 3× together,
and damping stopped at 8. The high corner (24/48/48, damping 40) passed the same
flat-ground probe; this is not an exhaustive guarantee for every mixed setting.

The user's new manual reference supersedes the prior 3/3/3, damping-8 reference
and its broader multi-property comparisons. Nearby compliance increases are about
23–27%; damping changes by ±2. Compare each option directly against the reference.
No motor or architecture change compensates for material-dependent travel behavior.

The shared measurement path is 2 s idle, 8 s forward, 3 s reverse, 3 s perpendicular
travel, 14 s braking/settling, then a 2 s idle drift sample. Shape extrema below
are measured during movement; volume includes the initial settle and braking.
Widths include node radii and describe material redistribution in the cage.

| Preset | Minimum height | Maximum X width | Peak surface strain | Maximum volume error |
| --- | ---: | ---: | ---: | ---: |
| Preferred | .658 m | 1.024 m | 26.55% | .0391% |
| More shear | .675 m | 1.026 m | 27.16% | .0388% |
| More cross-body softness | .665 m | 1.024 m | 26.84% | .0393% |
| More stretch | .672 m | 1.036 m | 32.91% | .0355% |
| Slightly more damping | .678 m | 1.022 m | 26.48% | .0385% |
| Slightly less damping | .675 m | 1.024 m | 27.83% | .0397% |

All six had zero measured floor penetration and settled particle drift below
2e-13 m over the final 2 s sample. Contact sequencing means single-property
changes need not produce monotonic shape extrema over a moving tape. These
measurements establish cohesion and clean settling in the probe, not a ranking
of material feel or protection against arbitrary inversion.

Current-reference validation: `node tests/GroundMaterialPresets.test.ts` **5/5**;
`npm run type-check` passed. Checks cover the exact immutable reference/default,
single-property isolation for every comparison, every preset's cohesion,
settling, complete reset/replay and zero-friction ablation, the expanded high corner,
and preset/config restoration after recording. Browser verification covers startup,
all six selectors, restoring the new reference, and ground movement. The full
repository suite was not rerun for this preset-only change; the earlier initial
prototype results below are historical.

That material-review iteration changed no ground solver mechanics or production gameplay.

## Ownership and deliberately limited implementation

All runtime work is in `src/experimental/ground/`, behind `GroundBody`.
`KinematicGroundBody` delegates to the existing controller against one large box
floor. `DeformableBody` owns every particle position/velocity and contact;
`GroundView` is an observer. `GroundSession` owns fixed-tick inputs and tapes.
The existing `Loop` schedules 60 Hz updates, caps catch-up and handles focus loss.
No physics quality setting varies with frame rate.

The cage is the approved original research direction adapted into TypeScript:
42 equal-mass nodes, 80 oriented triangular faces, 120 surface links, 120 opposite-
face links, 21 diameters, and one signed-volume constraint. Four substeps and
eight alternating solver passes use XPBD compliance divided by substep time
squared. Multipliers reset per substep. Contact runs last on every pass.
Pairwise axial damping preserves linear momentum and rigid rotation; mild
uniform drag is an explicitly separate parameter.

Input specifies angular motion about `worldUp × input`. A full inertia tensor
estimates angular velocity. A bounded angular acceleration acts through
`acceleration × (particle - massCentre)`. Equal masses make its linear sum zero.
Idle targets zero angular motion using this same bounded actuator. Neither
propulsion nor braking writes centre velocity. Only gravity, drag and floor
contact can change bulk momentum. The `motorInAir` option exists solely for the
free-space proof; normal play enables the motor only when loaded contacts exist.

Per-node unilateral contact against y=0 supplies normal load. Persistent tangent
anchors grip within the static Coulomb limit, slide at the kinetic limit, release
when separated, and reacquire with the same material identity. Contacts retain
age/acquisition/release observations. This is point-sampled **flat-floor contact**,
not a closed production collision skin. Global volume preservation does not
guarantee local non-inversion under arbitrary confinement.

This original ground-only entry has no Level 1 integration, closed world collision,
adhesion, solid walls, jump mechanics, hazards, moving platforms, character mesh,
or custom shaders. Finite collision now lives in the separate collision lab.
The isolated room is an unbounded floor with a local metre grid; it has no solid
perimeter or gameplay geometry. Stock Three.js materials draw debug primitives.
The original research folder is user-provided and is neither modified nor
imported by the prototype. To discard both experimental labs, see the removal
boundary in [collision-lab.md](collision-lab.md); they share the material solver
and debug view. There are no production controller caller changes to unwind.

## Stage 0 reference freeze

Reference commit: `0be476e00094fd2125af2be3065c4a374b4524b3` (worktree HEAD and
the approved research baseline). Source SHA-256 values at implementation:

| Source | SHA-256 |
| --- | --- |
| `src/physics/KinematicBody.ts` | `8733597575015546881db8e1867632d1d248bc9f38102390322795b4079b4724` |
| `src/physics/CollisionWorld.ts` | `9bb0ce184d49da9f77abc01ced8a36b34e67c48d5456e797fbe20ca75edfedcd` |
| `src/slimes/SlimeRoster.ts` | `afd538542fb776b9baea580f844eff9906f21b11fcb28918384c7f4b8b889de7` |
| `src/levels/GreyboxLevelRuntime.ts` | `fe40a3c4cedb42e467d662a8349c8dda7ba620e506cb3f7dd23f67dd6e472796` |
| `src/levels/ContainmentTeachingScene.ts` | `6f77aa24b6ce1e89f04df7003b1a214ab90274d54e6fbc69e7191eb89427815a` |
| `src/levels/RoomThreeGreybox.ts` | `c419697d3a690a1ce251f0db9036652dea937e8b22a8e396dd586eaf1aa0a1c4` |
| `src/levels/RoomFourGreybox.ts` | `52effd47741bf7bf7027e015a9f82a3c35b3bf09b01bae8987368db56bec3f14` |
| `src/levels/RoomFiveGreybox.ts` | `213a1e1ecc29005943c147978a2529d92dd60b93e0a29eab64c45987241618ff` |
| `tests/fixtures/containment-colliders.json` | `35e1eea73e636726f707862d2471ed1cac944ee8acccaf1e8482de3aea959eea` |
| `specimen-softbody-research/softbody.js` | `23c901a51564a4c345eb6a9b970cddc7060cf579315bdd3e4cf656bac9497963` |

The exact geometry catalogue is the existing frozen collider fixture, exercised
by `ContainmentColliderSnapshot.test.ts`. Shell floor sizes (X/Y/Z, metres) are:
Room 1 `[14,.4,12]`, Room 2 `[30,.4,22]`, Room 3 `[34,.4,28]`, Room 4
`[13,.4,13]`, and Room 5 `[40,.4,34]`. The pinned owners above retain the full
platform/vent/shaft/door layout; none is re-authored for this lab.

Current Level 1 bodies use the default 0.45 m sphere, 18 m/s² gravity, 5.5 m/s
maximum speed, and 32/36 m/s² ground acceleration/braking. Its runtime overrides
only the identity flags: Bob enables adhesion/rebound/charged jump; Goop disables
those and uses normal jump. Volt is configured but has no registered Level 1 body.
Those abilities are not exposed by the lab's input interface.

Baseline browser captures at this SHA: [Room 1 start](ground-locomotion-evidence/baseline-room-one-start.png)
and [after D held for one wall-clock second, then released](ground-locomotion-evidence/baseline-room-one-after-right.png).
These are short current-controller reference captures at `/?debug=1`, not a full
Level 1 traversal sign-off. The debug runtime reported grounded Bob on
`room-1-floor`, no death/retry, at `[-2.36,.46,-2.60]` after release. Its slow
software-rendered wall-clock timing is not a deterministic input tape.

For a fixed-tick baseline instead, the common 600-tick reversal tape gives the
actual KinematicBody x/vx values: tick 360 `21.572222 / 5.5`, tick 361
`21.655 / 4.966667`, tick 376 `21.830 / -3.033333`, tick 600
`11.997222 / 0`. The baseline ignores the cage-only coast flag and brakes during
the final idle segment.

## Initial prototype verification — 13 September 2026

`node tests/GroundLocomotion.test.ts`: **13/13 passed**. `npm test`: **98/98 test
files passed**, including the existing controller, collider snapshot and level
regressions. `npm run build` and `npm run type-check` passed. The production
output contains no ground-lab modules or HTML entry.

| Mechanical proof | Observed result |
| --- | --- |
| Traction, 2 s idle + 8 s input | X travel 21.6955 m; Z travel 21.7562 m |
| Same tapes, friction zero | Horizontal drift below 1.3e-12 m |
| Motor's net linear impulse | Below 1e-10 kg m/s per tick |
| Contact accounts for translation, drag off | Momentum-change residual below 1e-8 kg m/s |
| Free-space motor probe | Rotation without centre translation, below 1e-8 m drift |
| Four seconds of sustained travel after warm-up | 24 loaded material nodes, 22 gripping nodes; 112 catches / 112 releases |
| Sustained material deformation | Height range 0.0472 m; edge-strain range 0.0252; speed stays between 2 and 4 m/s |
| Reverse from +2.8623 m/s | First reverse tick +2.7200 m/s; sign changes after 0.2667 s; 0.3481 m overshoot |
| Idle / brake | Settled particle drift below 1e-7 m; release brakes below .001 m/s |
| Ground and y=2 m drop probe | Penetration below 1e-8 m; deforms below .8 m height; volume error below 2% |
| Zero-friction braking, drag off | Injected test momentum is retained within 1e-8 m/s |
| Reset / replay / render scheduling | Exact complete cage-state repeat; identical outputs at 30/60/144 Hz scheduling |

Browser verification used headless Chromium with software WebGL. The built-in
600-tick tape and replay matched exactly (`f3c0fb0c`); a manually recorded 63-tick
W tape at friction .35 also matched (`26e616d7`). The displayed digest is only a
convenience: replay compares the complete serialized state, not the hash alone.
Configuration, interpolation history, velocities, constraint multipliers,
anchors, contact lifecycle, motor observations and counters reset together.
This establishes same-runtime repeatability, not cross-engine/network determinism.

Keyboard movement, zero/restore friction, tuning reset, A/B selection, three-axis
debug views, pause/one-tick, record/stop/replay, and blur/focus input clearing were
checked. Browser movement with friction zero remained below 1e-12 m; the actual
KinematicBody reached its unchanged 5.5 m/s. No lab JavaScript errors occurred.
Visual captures: [sustained forward](ground-locomotion-evidence/cage-forward.png),
[inertial reversal](ground-locomotion-evidence/cage-reversal.png).

These historical mechanical and browser checks did **not** establish that it felt
like Gish. The user subsequently supplied that acceptance for `accepted-ground-v1`.
No target-hardware performance claim or full authored-level browser regression
is made. The Context7 lookup informed only standard Three.js r185 dynamic debug
buffer updates; the physics and its acceptance evidence are independent.
