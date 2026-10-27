# Room 4 freight lift

Original Specimen art, authored and reviewed through the native Windows Blender
MCP session. The shaft has a lower machinery pit, recessed middle service plant
and cleaner upper landing. A substantial freight car runs on visible guide
carriages. Cables, rollers and a counterweight follow the existing lift route;
the counterweight and guard sit behind the camera boundary in a wall recess.
Large segment numerals distinguish the shaft sections without a dense sign grid.

The lift-side entry has a recessed steel sleeve, reinforced surround and amber
markers. The shaft opening fits Room 3's existing duct lining, closing the old
gaps beside and beneath it. Room 3 retains the inner lining and floor; the new
surround leaves the passage and drop to the lift clear.

The roof retains its 8 × 8 m walkable footprint. A flush instrument inlay shows
metres travelled using one instanced segment buffer. The motor casing has a
small vibration that respects reduced-motion preferences. Warning lenses reuse
Room 3's optical emitter geometry and charge during the last 0.45 seconds before
the existing lasers activate. They do not control lethal timing.

The arrival uses a docking sill, separate pocket-sliding door leaves and an
illuminated route arrow. The doors open during the existing arrival pause and
the original exit lock releases at its normal time. The fixed sill sits 12 mm
above the travelling roof, giving these separate motion owners a physical
clearance at docking. No gameplay collision, travel speed, checkpoints, hazard
paths are changed.

The lift camera now keeps its focus above the roof and bounds the camera to the
shaft interior, including near-plane clearance. Framing follows the platform
with damped adjustment at roof edges; it follows the player more closely near
the landing. A soft boundary bends the orbit inward before a wall blocks the
view. Near the landing it also eases upward into available headroom before
shortening the view. Existing obstruction sweeps, arrival blend and exit handoff
remain active.

## Source and export

- `generate-room-four.py`: deterministic Blender source and batched export.
- `room-four-lift.blend`: editable studio with separate structural parts.
- `room-four-lift.glb`: geometry in the game's X/Y-up/Z coordinates.

```sh
/home/kevin/bin/blender --background --factory-startup --python assets/environments/containment-room-four/generate-room-four.py
```

Only the `Room 4 Freight Lift` scene and `R4_` objects belong to this generator.
Other live Blender scenes are retained. Accepted interactive edits must be
reconciled into the generator, regenerated, then reopened for review. Studio
lights, camera and initial assembly poses are excluded from the game export.
No downloaded models, textures or fonts are introduced.

The ten `containment-room-four-v1` roots are `R4_Architecture`, `R4_Car`,
`R4_Counterweight`, `R4_Wheel`, `R4_Motor`, `R4_DoorLeft`, `R4_DoorRight`,
`R4_ExitArrow`, `R4_Segment` and `R4_Cable`. The shaft and doors use authored
room coordinates; car, motor, counterweight and shared primitive kits use local
coordinates. Temporary export copies join by assembly and finish; editable
source parts remain separate. `R4_Batch_{assembly}_{finish}` selects finishes.

## Ownership and performance

`RoomFourShell` borrows Room 1's finish instances and maps. One owned material
clone reads baked vertex wear on lower machinery and contact panels. Room 3
retains ownership of the shared optical-head kit. Eight small charge materials
share one ring buffer. No new texture images, lights, shadow maps or render
targets are allocated. Only the freight-car batches cast shadows.
The GLB contains 19,417 triangles in 29 shared geometry buffers; the charging
ring adds one small buffer. Repeated wheels, cables and display segments reuse
their templates.

The display updates its instance matrices only when the displayed metre
changes. Machinery poses derive from lift progress; door poses derive from the
arrival state. Existing pooled audio supplies the motor, rail-joint accents,
departure and braking cues, with pitch and gain shaped without changing motion.
The old procedural static dressing and travelling deck are hidden after asset
adoption. The four original warning lamps retain their state and light slots.

Preparation warms the actual authored buffers and neighbouring doorway views.
Restart reuses the prepared asset. Unload restores presentation adapters,
releases owned geometry, charge materials and display instances, and leaves
borrowed finishes and optical geometry with their original owners.

## Surface checks

Opaque-triangle checks cover within-batch overlaps, the moving car and rollers,
counterweight, cables, existing warning fixtures, optical heads, closed doors,
partly open doors, open doors and reset. Checks use both 0.1 mm and 2 mm plane
tolerances, with separate Room 3/5 seam checks and roof coverage probes.
Structural repairs use ownership and physical clearances rather than polygon
offsets. Transparent beam halos and charging rings are outside the opaque audit.

`tests/RoomFourShell.test.ts` checks the real GLB, collision fingerprint, travel,
material sharing, moving surfaces, warning timing and disposal. The focused
browser journey is `tests/browser/RoomFourShell.spec.ts`. Captures and matched
before/after audit reports are stored under ignored
`artifacts/evidence/room-four-lift/`. Software WebGL evidence verifies rendering
and integration; it does not establish hardware frame rates.
