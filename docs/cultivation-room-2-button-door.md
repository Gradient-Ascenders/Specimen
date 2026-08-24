# Cultivation Room 2 wall button and blast door

Issue #95 implements the cooperative Room 2 gate from `Room 2 Detailed.md`.
Bob must adhere to a wall control while Goop crosses a vertically translating
blast door. Both slimes remain persistent and continue simulating, so switching
active ownership never releases a valid Bob hold.

## Source-design mapping

The design's Room 2 coordinates are relative to the Room 2 entrance. The live
foundation places that entrance at world Z `11`, so the button and far door use
world Z `24` and `30.8`. The supplied design describes a wider final room than
the existing 16-metre foundation shell. The button's X coordinate is therefore
adapted from approximately `-11.8` to `-7.55`, preserving its left-wall role
without expanding the established scene or invalidating current routes.

The authored values live in `CultivationFoundationManifest.wallButtonDoor`:

- button: `(-7.55, 6.25, 24)`, Bob-only, with separate sticky surface and local
  contact-box dimensions;
- door: closed centre `(0, 2.3, 30.8)`, panel `3.8 × 4.6 × 0.35` metres;
- motion: positive local Y, `4.9` metres, `1.0` second open and `0.8` second
  close;
- safety: local obstruction box `4.6 × 5.2 × 2.4` metres, plus swept-panel
  collision against both persistent bodies.

The far Room 2 wall is split into authored box colliders around the centre door
and upper-right exit. Six explicitly tagged sticky panels supply Bob's wall
route. No gameplay behavior is inferred from mesh colour or names.

## Fixed-step flow

`CultivationLevelRuntime` creates one `WallButton`, one `VerticalBlastDoor`, and
one `WallButtonDoorCoordinator`. During each normal fixed update, after both
bodies simulate, the coordinator:

1. tests the complete Bob/Goop collection against the enabled button;
2. opens the door only while the exact configured Bob body is attached to the
   button's registered sticky collider and intersects its contact region;
3. advances the door and checks both Bob and Goop for closing obstructions.

The button is enabled only while Room 2 is authoritative and gameplay is in the
playing state. Room changes and recovery disable it immediately. Door state,
progress, obstruction IDs, and button occupancy are visible in F2 diagnostics.
While Bob uses wall-local gravity, Cultivation resolves WASD through the same
camera-relative surface basis as Containment. The camera damps toward Bob's
authoritative `gameplayUp`, so forward/backward input becomes visible up/down
wall traversal rather than remaining locked to the world-ground plane.

## Door safety and reset contract

Door states are `closed`, `opening`, `open`, `closing`, `blocked`, and
`reopening`. Motion is fixed-step deterministic, reverses from partial progress,
and clamps to exact endpoints. On a closing obstruction the panel first holds
at its current pose, then reopens while occupied. It resumes closing only after
both bodies clear the authored/swept volume.

The Room 2 puzzle group registers components in coordinator → button → door
order. Checkpoint recovery therefore disables the relationship and clears
occupancy before the door restores its exact closed collider; only then are
spawn anchors safety-checked and both bodies recovered. Disposal reverses
ownership: coordinator subscription, door registrations/resources, then button
registrations/resources.

## Verification focus

Automated coverage verifies strict body identity and exact support-collider
matching, inactive-body holds, transition stability, both-body obstruction,
high-speed collision sweeps, partial reversal, exact reset from every door
state, registration cleanup across repeated lifecycles, checkpoint reset-before-
validation ordering, scene-authoring validation, and regression behavior for
the existing `PressurePlate` and hinged `Door`.

The source design's lasers, final art/audio treatment, and rooms beyond this
cooperative gate remain separate work; this change does not add new runtime
dependencies or broaden the static browser-only architecture.
