# Room 3 chemical stress laboratory

Original Specimen environment art, developed in the native Windows Blender MCP
session. The vertical hall has a reinforced acid reservoir, a recessed twin
filtration plant, rear extraction fans and manifolds, framed adhesion modules,
ceiling services and eight machined landing rigs. Four-point harnesses connect
the platforms to their existing thrusters. Selective chemical wear concentrates
around the basin instead of covering every surface uniformly.

Twelve optical laser heads replace the small block emitters. Each has a cooling
body, gimbal bearings, a focus barrel and an active lens or closed shutter.
Cantilever arms support the lower heads; wall heads mount on the test frames.
The sweeping heads follow the existing hazard endpoints and activation state.
No downloaded models, textures or fonts are introduced.

The entrance is one shared industrial bulkhead spanning the Room 2/3 wall.
Reinforced drive columns, an overhead roller case, raised shutter, status strips
and a physical access reader replace both rooms' separate thin frames. The
shutter remains raised above the original passage; it adds no collision,
interaction requirement or lighting resources.

## Source and export

- `generate-room-three.py`: deterministic geometry and material-batched export.
- `room-three-laboratory.blend`: editable studio with separate architectural
  parts, optical heads, harnesses and preview lighting.
- `room-three-laboratory.glb`: runtime geometry in the game's X/Y-up/Z coordinates.

Run from the repository root:

```sh
/home/kevin/bin/blender --background --factory-startup --python assets/environments/containment-room-three/generate-room-three.py
```

Interactive edits belong to the `Room 3 Chemical Stress Laboratory` scene and
`R3_` objects. Other open scenes are retained. Reconcile accepted edits into the
generator, regenerate, then reopen and review the exported geometry. Studio
cameras, lights, acid, exhausts and assembled laser previews are excluded from
the GLB; those effects retain their existing runtime owners.

`R3_Architecture` carries version `containment-room-three-v1` and the separate
`R3_LaserHousing` prefab carries `containment-room-three-laser-v1`. Export joins
temporary copies by region and finish, leaving the source parts editable.
`R3_Batch_{Shell|Platforms|Emitter}_{finish}` names select borrowed materials;
`R3_LaserAperture` and `R3_LaserShutter` borrow the live hazard materials.

## Runtime and performance

`RoomThreeShell` prepares the geometry before shader compilation and uploads.
Architecture totals 51,694 triangles in 14 finish batches. All twelve housings
share two geometry buffers (1,284 triangles per head), one aperture buffer and
one shutter buffer. No texture images, lights, cameras or animations ship in the
GLB. Metric UVs reuse Room 1's finish and texture bank. One owned material clone
adds baked vertex-colour wear while sharing the same maps. Only the platform
batches cast shadows; no new lights or shadow maps are allocated.

The old procedural dressing is hidden before gameplay and its retired buffers
are excluded from preparation. Collision, acid interaction, landing heights,
jump distances, adhesion coverage, camera tracking, monitor triggers, laser
timing and door/duct clearances retain their existing owners. Restart reuses
prepared resources; unload detaches the optical kit and releases owned geometry
and the wear material without disposing borrowed finishes or maps.

## Surface ownership and checks

Openings replace wall coverage. Landing treads own the walkable surface; armour,
rails, thruster harnesses, camera pads and laser mounts have physical clearances.
The Room 2 dividing wall reaches the reservoir bed behind the coping; coverage
checks probe the narrow space behind the rim as well as the doorway opening.
The opaque-triangle audit includes intra-batch overlaps and the live cameras,
monitor, thrusters and moving laser heads. Entry, disabled, both sweep ends,
reverse and reset states report zero conflicts at 0.1 mm and 2 mm tolerances.
A separate check covers the Room 2 and Room 4 seams. Transparent acid, exhausts
and beam glows remain separate from the opaque structural audit.

Focused checks live in `tests/RoomThreeShell.test.ts` and
`tests/browser/RoomThreeShell.spec.ts`; production captures and before/after
surface reports are under ignored `artifacts/evidence/room-three-shell/`.
Software WebGL verifies integration and resource behaviour; it does not measure
hardware frame rates.
