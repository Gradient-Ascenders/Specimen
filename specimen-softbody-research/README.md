# Specimen: deformable-body research lab

Research baseline: `Gradient-Ascenders/Specimen` main commit
`0be476e00094fd2125af2be3065c4a374b4524b3`.

This package contains an original, isolated experiment and an architecture report.
It does **not** change Specimen, contain a checkout of the project, reproduce
Gish exactly, or claim that the Level 1 controller has been replaced.

## Start

Open `sandbox.html` in a desktop browser. It is self-contained and makes no
network requests. On a browser that disallows local HTML, serve this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000/sandbox.html`.

Click the scene after using a form control to return keyboard focus to movement.
WASD controls movement; in wall mode W/S moves vertically and A/D traverses the
wall. Hold Space to apply internal compression and release to stiffen the
cross-body constraints. This is a **compression/release experiment, not a
calibrated gameplay jump**. R resets, P pauses. Drag the scene to orbit; use the
projection menu for side and top views. The highlighted node retains its
material identity. The grid spacing is one metre.

Use the **Reversal tape** button for a repeatable settle/forward/reverse/coast
sequence. Use **Drop from 2 m** for impact deformation. The floor drop starts
with the centre at y=2 m, not two metres above the resting centre.

For the traction ablation, set friction to zero **and reset** before running the
same tape. Changing friction while moving preserves the momentum already
acquired; the body should then slide, not abruptly stop. The torque actuator
applies forces to particles, not a desired centre velocity.

The moving-plane mode is a conveyor-like contact-velocity test on an infinite
plane. It is not a finite moving platform, elevator, or rotating support test.

In wall mode compare the 16 N per-node release setting with the unbreakable
setting. The latter locks this tuning instead of letting material contacts
release and advance. Successful climbing here uses an explicit surface-gravity
policy comparable in intent to Specimen's current wall locomotion. Turn that
policy off to expose the unresolved world-gravity climbing case.

## Reproduce tests

Node v22.16.0 was used for the included run:

```sh
node tests.cjs
```

This checks traction versus zero friction, drop/volume error, reversal inertia,
zero-net-force actuation in free space, moving-plane transport, a 15-degree
slope, the scoped surface-gravity wall case, exact reset/replay, and matching
fixed-tick outputs under 30/60/144 Hz render scheduling. It also records
explorations that are **not promotion tests**: insufficient jump height, locking
anchors, world-gravity wall failure, volume removal, and solver budgets.

Running it overwrites `results.json` with a new measured run. Timing is noisy,
not a unit-test threshold. A passing script does not mean production-ready.

The **Benchmark this browser** button times 12-, 42-, and 162-node variants.
It measures one body against an infinite plane, excluding Specimen's query
registry, authored scenes, other bodies, cameras, hazards, and rendering.
`browser-benchmark.json` is an actual headless Chromium run in the shared
research container, not a measurement on the user's laptop.

To rebuild the standalone HTML after editing the core or UI:

```sh
python3 build.py
```

## Contents

- `RESEARCH.md`: source-backed findings, actual main audit, architecture, risks,
  milestones, and acceptance gates.
- `softbody.js`: original JS core shared by Node and browser.
- `ui.html` / `build.py` / `sandbox.html`: source UI, builder, standalone output.
- `tests.cjs` / `results.json`: automated checks and numerical evidence.
- `browser-benchmark.json`: browser timing and environment disclosure.
- `browser-smoke.json`: browser interaction checks and error log.
- `sandbox-preview.png`: inspected debug-view capture.

## Deliberate limitations

Collision is plane-only and point-sampled. The lab does not implement a closed
collision skin, feature CCD, finite platforms, initial-overlap recovery for
arbitrary solids, self-collision, local inversion barriers, floor-to-wall/vent
lip transitions, moving/rotating OBBs, body-body collision, hazards, checkpoint
integration, camera integration, or Level 1 jump tuning. Global signed volume
preservation does not prove local non-inversion. Its constraints are suitable
for bounded experiments, not unrestricted squeezing.

Node-count comparisons use the same nominal coefficients, not a calibrated
continuum material at equal resolution-independent stiffness. The browser view
uses a 2D canvas to project a genuinely three-dimensional physics state; it is
not a 2D physics solver.

No Gish/FreeGish source or game assets are bundled. This is a separately written
implementation of the proposed experiment, not a translation of the GPL C
implementation. Review source licensing before importing any upstream code
into Specimen.
