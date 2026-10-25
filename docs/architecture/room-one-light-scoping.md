# Room 1 chamber lighting scope

The main chamber now uses its three local spotlights when both the player and
camera are inside the lower chamber and the vent portal is outside the view.
The existing duct lights remain available for upward vent views, climbing,
entry, retreat and trailing cameras. `ContainmentLightLayout` owns the temporary
selection and restores authored and padding visibility after every draw,
including failures. Shared shadow ownership remains with `RenderLayer`.

Previously the four duct sources joined the chamber's three lights, selecting
the ten-spot shader layout. Those sources contributed no visible light in the
sampled chamber views, but their shader slots roughly doubled GPU frame cost.
The smaller layout retains the existing gel, baked lighting and shadow quality.

## Preparation and loading

The existing loading pass prepares the chamber layout as well as the nine
room/doorway configurations. Every temporary selection is restored before
yielding to the opening. Camera fades and both canvas/linear programs are
prepared; depth programs and shared vertex/texture buffers are reused.

The extra chamber pass includes Room 1 and the Room 2 art still submitted by
the existing draw scope. It excludes the distant measured-resource catalogue,
duct geometry and captive Room 5 actor. Their original preparation remains in
the full room layouts. This avoids preparing unreachable shader combinations.
The loading verification retains `roomStepsCompleted: 9` and adds
`roomOneChamberPrepared: true`; the loading benchmark requires both.

## Local measurements

Intel Iris Xe through native Chrome/ANGLE D3D11, Medium, 1920×1080, DPR 1.
The frame comparison uses the final production build with A/B/B/A blocks,
45 GPU samples per block, warmup draws and the same staged camera. The control
temporarily bypasses only the new chamber selector. No programs were created
during timed draws and no GL errors or disjoint queries were recorded.

| Metric | Previous behavior | Implemented behavior |
| --- | ---: | ---: |
| Chamber GPU time, mean of block medians | 15.04 ms | 7.31 ms |
| Live idle sample at spawn | 54.9 FPS | 75.0 FPS |
| Submitted chamber draw calls | 196 | 196 |
| Submitted chamber triangles | 133,258 | 133,258 |
| Fresh-process Play to control | 21.52 s | 21.89 s |
| Same-context repeat Play to control | 2.71 s | 2.50 s |
| Fresh-process navigation to control | 23.03 s | 23.24 s |
| Same-context repeat navigation to control | 3.43 s | 3.12 s |

Initial loading uses separately launched isolated Chrome processes and normal
HTTP caching. OS/driver caches, power and temperature were not controlled;
these are local diagnostics and do not qualify the university NUC. The live FPS
samples are separate recordings; the matched GPU comparison isolates the gain.

Raw measurements and the diagnostic runner are ignored under
`artifacts/room-one-performance/`, including `implemented/results.json`,
`loading-before/results.json` and `loading-final/results.json`.

## Focused validation

- `ContainmentLightLayout.test.ts`: chamber/portal selection, climbing and
  trailing cameras, exception restoration, padding and shadow ownership.
- `ContainmentPrewarmScheduling.test.ts`: all configurations submitted before
  binding, bounded jobs, cancellation and state restoration before yields.
- `ContainmentChamberLightScope.spec.ts`: seven chamber/vent/retreat poses,
  matching pixels against the full rig, no new live programs and shadow texture
  reuse after restart.
- `ContainmentRoomTwoShaderHandoff.spec.ts`: existing duct and Room 2/3 entry
  replay still creates no new programs.

Eight focused unit tests, both browser checks and the production build passed.
