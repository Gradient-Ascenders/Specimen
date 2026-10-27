# Room 5 containment atrium

Original Specimen art authored and reviewed through the native Windows Blender
MCP session. The atrium has a recessed service wall, a central containment court,
a reinforced Goop cell, maintenance landings, an observation gallery and a
sealed escape duct. Every doorway has a structural surround with separate
cheeks, returns and trim. The lift-facing wall meets the floor continuously;
the threshold owns its floor coverage instead of overlaying another surface.

The platforms use the earlier rooms' inset grey tops, metal perimeter and amber
corner markers. All nine also share the annular cradle, four splayed struts,
clevises and amber latches from Rooms 2 and 3. Moving platforms retain their
existing thrusters, exhaust, spill-light pool and hover audio. There are no rails
or support posts. Their existing presentation parents still own interpolation.
Ceiling services have direct suspension; exposed cross-room feed pipes and
brackets protruding below the gallery have been removed.

## Reproducible source

- `generate-room-five.py`: deterministic Blender geometry, metric UVs and export.
- `room-five-atrium.blend`: editable assemblies and a preview studio.
- `room-five-atrium.glb`: geometry batched by assembly and shared finish.
- `generate-security-preview.ts` / `security-preview.png`: an authoring copy of
  the existing procedural security atlas, packed into the Blender source only.

```sh
node assets/environments/containment-room-five/generate-security-preview.ts
/home/kevin/bin/blender --background --factory-startup --python assets/environments/containment-room-five/generate-room-five.py
```

Only `R5_` objects in `Room 5 Containment Atrium` regenerate. Other live scenes
are retained. Accepted interactive edits must be reconciled into the generator,
regenerated, and the exact GLB reopened for native review. No downloaded models,
fonts or textures are used. Studio lights and cameras are excluded from export.

The `containment-room-five-v1` roots are `R5_Architecture`, `R5_Cell`, `R5_Front`,
`R5_Rear`, `R5_Left`, `R5_Right`, `R5_CarriageOne`, `R5_CarriageTwo`, `R5_Locks`,
`R5_Status` and `R5_ButtonCap`. Static parts use authored world coordinates.
Panels use the original hinge-local coordinates; carriages and the button use
local coordinates beneath their existing moving owners. `R5_Batch_{part}_{finish}`
identifies each shared-finish batch. Export copies are joined; source parts stay
editable.

## Runtime and performance

`RoomFiveShell` borrows Room 1's finish bank and texture maps, the existing sticky
membrane and Room 3's optical-head geometry. It owns two material clones: baked
vertex wear and the release indicator colour. There are no new texture images,
lights, shadow maps, render targets or animation tracks. The GLB has 44 geometry
buffers. Only the two moving-platform assemblies cast additional model shadows.

The old procedural dressing is hidden after adoption. Existing thrusters,
lighting fixtures, dialogue monitor and gameplay meshes retain their owners.
The front lock indicator sits below the warning triangle on the moving armour;
the fixed corner indicators stay seated in their sockets when the hatch opens.
The original four panel pivots, platform roots and button cap animate the new
meshes. Locks and status colours read the existing release progress. The roof
and all landing tops remain aligned with the original collision geometry.

Goop's hatch has a heavy armoured header and sill, critical-threat and corrosive
warning plates, caution bands and four retracting drop bolts. The plates and
front bands share the hatch's motion; the side bands remain on the fixed frame.
Their `Security` batches borrow the original 1 MiB atlas and material without
another runtime image. Bolts clear the sill before the hatch lifts; the existing
release sequence still reaches the same fully open pose at the same time.
The continuous floor caution border owns a cutout in the court surface, keeping
both finishes at the same floor height without overlapping faces. The cell base
is sealed from the floor to the original plinth; the moving sill has only a
5 mm running clearance above it.

The wooden escape cover has a thin slatted face inside a fitted steel sleeve.
It remains one dissolvable target with unchanged collider dimensions and identity;
the surrounding steel remains after dissolution. Fifteen simple solid collision
shapes cover the observation furnishings, release console, cell service units and
escape sleeve. They block movement and support jumps, while the centre aisle
stays clear. Service units sit east of the cell to leave Goop's scripted escape
unobstructed. All six surveillance fixtures reuse the intro camera model and
its existing shared buffers. Original platform paths, laser
timing, jump clearances, checkpoints, release timing and cinematic anchors are
preserved. The corrected Room 5 fall boundary remains at
its floor's front edge, outside the lift shaft.

Preparation warms the actual authored buffers and the lift/atrium doorway view.
Restart reuses the asset; unload detaches borrowed optics, releases owned
geometry and material clones once, and leaves shared finishes with their owners.

## Verification

`tests/RoomFiveShell.test.ts` checks the actual GLB, collision fingerprint, light
and thruster budgets, entrance-wall coverage, sliding-door seams, moving-platform
interpolation, roof height, release/reset behaviour and disposal. Opaque-triangle
audits use 0.1 mm and 2 mm tolerances, including same-batch geometry, the existing
wooden cover, moving platforms and partially opened hatch states. Repairs use
surface ownership and physical clearances, without polygon offsets or broad
conflict exclusions.

`tests/RoomFiveProps.test.ts` verifies blocked movement, a real charged jump onto
the desk, chair/cabinet support and clear button/escape approaches.

`tests/browser/RoomFiveShell.spec.ts` exercises real production preparation,
entry, the cell, platform movement, observation, release and restart. Captures
and before/after surface reports live under ignored
`artifacts/evidence/room-five-atrium/`. Software WebGL checks validate integration
and resource preparation; they do not establish hardware frame rates.
