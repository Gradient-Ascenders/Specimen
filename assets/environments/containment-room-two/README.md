# Room 2 locomotion laboratory

Original Specimen environment art, developed through the native Windows Blender
MCP session. The 30 × 22 × 18 m teaching hall has a pressure-calibration service
bay, a furnished observation workshop, a framed adhesion-testing module,
overhead calibration gantries and eight machined landing rigs. Each platform
has a four-point thruster harness, annular cradle and a connection to its
existing engine. Deck heights and complete gameplay collision remain unchanged.

The two dismantled workshop drones reuse the original Guardian/Pursuer geometry
from `assets/characters/exterminator/exterminator-family.glb`. One has a missing
armour cap and detached turbine; the other has a bent rotor assembly. Small
rotor guards/blades are simplified for this scale, and powered indicators are
removed. Existing drone source assets are unchanged. Loose components furnish
the third bench. These are static scenery behind the existing collision wall.
No downloaded models, textures or fonts are introduced.

## Source and export

- `generate-room-two.py`: reproducible geometry and material-batched GLB export.
- `room-two-hall.blend`: editable studio; individual architectural parts,
  harnesses and wreck components remain separately editable.
- `room-two-hall.glb`: runtime geometry, in the game's X/Y-up/Z coordinates.

Run from the repository root:

```sh
/home/kevin/bin/blender --background --factory-startup --python assets/environments/containment-room-two/generate-room-two.py
```

Interactive changes belong to the `Room 2 Locomotion Hall` scene and `R2_`
objects. Reconcile accepted edits into the generator before regenerating and
reviewing the exported asset. Other live Blender scenes are retained. Preview
lighting and render cameras are excluded from the GLB.

`R2_Architecture` carries version `containment-room-two-v1`. Temporary mesh copies
are joined by region and finish during export; source meshes are not joined.
`R2_Batch_{Shell|Platforms}_{finish}` names select borrowed materials.

## Runtime and performance

`RoomTwoShell` prepares the hall before shader compilation and resource upload.
It borrows Room 1's existing ceramic/resin map bank and finish instances, plus
the existing sticky material. UVs use world metres. No extra texture bank,
dynamic lights, shadow maps or post-processing targets are allocated.

Architecture, harnesses and wrecks total 34,936 triangles in 15 finish batches.
The two tracking cameras use the original cutscene model shared by Rooms 1–3;
the older Room 2 camera prefab is no longer exported. Only the platform
batches cast shadows. The existing three room lights, two pooled booster spill
lights and their activation rules remain with their current owners. The old
procedural storyboard is hidden before gameplay and its retired buffers are
excluded from the preparation list.

Camera wall mounts, tracking joints, monitor triggers, thruster effects, jump
distances, adhesion coverage and door/duct clearances keep their existing
authorities. Restart reuses prepared geometry and materials; unload releases
owned geometry without disposing borrowed finishes. The original Iris Xe upload
timings predate this asset and do not measure its hardware performance.

The exit uses Room 3's shared raised-shutter bulkhead. Room 2 supplies the wall
opening and existing camera mount, with no duplicate frame or indicator.
The doorway surveillance mount is raised to leave clearance over the shutter
through the complete camera tilt range.

## Surface ownership and checks

Wall openings replace panel coverage. Platform tops have one tread surface;
underside rails meet at shared edges. Harnesses have deliberate clearances from
engine casings and exhausts. The audit checks actual opaque triangles within
batches and instances, including the runtime monitor, boosters and tracking
cameras, at 0.1 mm and 2 mm tolerances. Landing, side-jump, climbing, upper route,
exit and reset poses have no reported conflicts. A separate assembled-level
check covers new geometry against neighbouring room and duct surfaces.

Focused checks: `tests/RoomTwoShell.test.ts`, the Containment collider/art/lighting
and platform-booster tests, and `tests/browser/RoomTwoShell.spec.ts`. Production
captures and before/after surface reports live under ignored
`artifacts/evidence/room-two-shell/`. Software WebGL captures verify rendering,
resource reuse and integration; they are not hardware FPS measurements.
