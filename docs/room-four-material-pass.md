# Room 4 laboratory elevator art

## Repository integration

Fetched origin/main and verified PR #118, merge aa9b3cf, includes fc2d1ea
(elevator encounter and Volt rescue rooms) and 97573df (review fixes).
Local Rooms 1–3 art was saved in a named stash, main merged without a commit,
and the stash applied. Scene construction/import/disposal conflicts were
resolved explicitly preserving both systems. The stash remains a backup.
The working tree contains the merged sources; Git remains in an uncommitted
merge state as requested. No commit, push or PR was created.

## Presentation

CultivationElevatorArt reuses CultivationLabMaterials and
CultivationChamberMaterials. Five material variants borrow existing maps:
reinforced deck, dark shaft backing, off-white service panels, muted teal
machinery finish, and restrained shaft marker emission. No textures are added.
Existing 256px metal/duct, 512px wall/floor and 128px hazard-stripe maps are reused.

The deck has rougher panel surfacing, shallow tread ribs and perimeter fasteners.
Boundary rails use dark structural metal, with warning finishes limited to deck edges. Guide rails use shared dark
metal; motor and carriages use muted teal. The boarding safety guard gains
attached off-white panels and warning trim. Door state indicators remain owned
by the door. No objects are placed in walking or aiming routes.

All eight scrolling shaft modules share four merged geometries on the side and forward walls: service panels,
vent/frame metal, teal bands and low-emission markers. Their existing parents
own all travel and reset transforms. Metre-based UVs avoid stretched shaft
textures. The backing stays dark to separate pale drones and panels. The lift's
existing two lights and camera are unchanged. Panel emission is restrained to
keep distant shaft features readable beyond the local lights' range.

Room 4 drones use SecurityDronePresentationResources with the same borrowed
metal bump/roughness maps as Room 3. Cables borrow the reinforced soluble cable
finish; cable geometry, stretching, hitboxes and dissolve parameters are unchanged.

## Cost and lifecycle

The art adds 35 draw calls before frustum culling, seven unique merged geometries,
five material variants, 7,728 rendered triangles and zero texture assets. Repeated shaft modules reuse
geometry and materials. All construction happens once; there is no art update
loop or per-frame allocation. Owned meshes/geometries/material variants are
removed and disposed once; borrowed maps remain owned by the shared lab system.

## Verification

The art regression compares every collider's vertex positions, metadata,
transforms and scale against the original Room 4 for the entire 60-second ride,
arrival and reset. Controller state is identical at each sampled second. It also
checks geometry sharing and idempotent disposal. Existing encounter tests cover
all 12 spawns, cable acid hits, falling wrecks, damage, capacity, reset, boarding
and arrival traversal. RoomFourController and RoomFourGreybox remain byte-for-byte
identical to origin/main.

The merged Room 5 adds acid surfaces; the older Rooms 1–3 acid regression now
explicitly limits its inventory to those three rooms. Room 5 presentation is
preserved as merged and is outside this Room 4 art pass.


All 388 automated tests pass after integration, along with type-check and the
production build (the existing large-chunk warning remains). Browser diagnostic
review uses actual runtime descent and drone simulation, invoking the existing
cable burn action automatically as each drone approaches, rather than manual
mouse aiming. Beginning, middle, waves, final descent, arrival and reset are
captured in artifacts/room-four-art. No shader, console or resource errors were
observed in the final complete-descent run. All 12 cable burns completed, both
slimes survived, the arrival vent opened and progression advanced to Room 5.
Restart retained the completed-elevator checkpoint as authored. Targeted projectile tests cover
one-hit cable shooting; manual aiming feel remains a useful local review.

Review locally: the moving forward/side panels, shaft depth above the drones,
warning trim restraint, cable targeting contrast during waves, and the arrival
vent after the shield closes. No frame-rate guarantee is inferred from automated
headless rendering; art resource counts are bounded and no per-frame art objects
are constructed.
