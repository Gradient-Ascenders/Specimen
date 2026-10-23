# Camera view modes

Press **V** during gameplay to toggle third-person / first-person. The action
can be rebound in Settings and is included in the HUD controls hint. Holding
the key does not repeat. Paused/disabled input and editable controls ignore it.
Older valid keybinding saves retain their controls; if V was already assigned,
the new action receives an unused bindable key, shown in Settings/the HUD.

## Ownership and lifecycle

`RenderLayer.cameraRig` remains the single camera owner. `CameraRig.viewMode`,
`setViewMode()` and `toggleViewMode()` represent the player's selection, separate
from ability aim, obstruction distance, contextual profiles and scripted poses.
The same camera survives level progression. Selection survives slime switching,
checkpoint recovery, death and level restart. Returning to the menu resets it to
third-person; a new browser session also starts in third-person. Perspective is
session state, not a saved setting.

The manual transition uses the existing 0.2-second presentation blend and
collision-aware boom. First-person places its focus 0.18 m above the interpolated
body centre and its camera 0.08 m behind that focus. Unlike third-person framing,
the fully selected near-eye position has no positional follow lag: camera,
rider and platform dressing use the same interpolation interval. Orientation
still follows the existing smoothed surface-up basis and mouse orbit. Rendering
never writes to the authoritative body.

Both focus and boom retain camera-layer collision sweeps. First-person clearance
also encloses near-plane corners at the configured FOV/aspect ratio. A completely
collapsed boom retains its orbit direction instead of looking at its own position.
No FOV, sensitivity, movement, platform, collision or interpolation settings are
replaced.

## Presentation precedence

1. External authored sequences temporarily request third-person presentation:
   death, Containment finale, Cultivation arrival/clearance/finale, and Blackout
   arrival/merge/split/defeat/terminal states. Opening remains owned by its
   existing movie/presentation. Their subjects stay visible.
2. Fixed-pitch contextual profiles (e.g. rescue framing and Containment lift)
   temporarily outweigh both the manual first-person blend and any held/stale
   ability aim. Player-controlled-pitch
   profiles (e.g. Cultivation descent) allow either selected view.
3. In normal gameplay the effective near-eye weight is the maximum of manual
   first-person and ability aim. Aim retains its prior pose when third-person is
   selected. Releasing aim cannot erase manual first-person selection.

Overrides never replace the selected mode. Returning from an external override
restarts the short manual blend; contextual handoffs use their existing profile
blend. Aim rays continue to originate from the actual camera's screen centre.
Maintenance drone control follows Volt through the existing body/follow contract.
Boss gameplay allows either view; authored takeover states show the subject.

## Controlled-body visibility

`CameraBodyVisibility` binds once to the body and eye meshes of Bob, Goop and
Volt, and to the merged Specimen mesh. Only meshes associated with the effective
follow target suppress colour/depth writes in the gameplay camera pass. The
material flags are restored after each draw and the hooks are restored on
disposal. Other characters, projectiles, death bursts and effects are not bound.

This deliberately keeps mesh visibility, shadow participation and separate
depth/distance materials intact. Three.js shadow passes use their separate
shadow hooks, so hiding the player's view does not remove the character from
shadow rendering. Using camera layers alone would also exclude the character
from Three.js shadow collection. Existing third-person proximity fades remain.

## Verification and local checks

```text
npm test
npm run type-check
npm run build
npm run validate:production
npx playwright test tests/smoke/CameraViewMode.spec.ts --config playwright.smoke.config.ts
```

Focused Node coverage exercises the real rig at 30/60/144 Hz, transition reversal,
heading, real obstruction boxes, maximum-FOV wide-screen near-plane corners,
wall/ceiling orientation, visibility hooks, key migration/input edges, target
switching, recovery and scripted precedence. Both actual Room 5 rider routes run
for 13 seconds at 30/60/90 Hz with camera/rider/platform phase checks. A Blackout
runtime test uses the real rig with Volt/Goop aiming, merge takeover, Specimen
projectiles and restart. Existing platform/shadow-cache regression tests remain
in the full suite.

The browser checks exercise shipped bundles under `/group-folder/` in Chromium
with SwiftShader. They observe the existing composition root, use actual input,
and stage distant scenarios through existing room/controller/recovery contracts.
Simulation and camera cadence are explicitly advanced; representative frames
are rendered instead of submitting every intermediate software-rendered frame.
Captures read the canvas immediately after rendering because the production
renderer does not preserve an idle drawing buffer. This is staged integration
coverage rather than an uninterrupted full-game playthrough.

Browser evidence is generated locally in ignored
`artifacts/evidence/camera-view/` (PNG views and JSON diagnostics). Inspect views
at a comfortable desktop size on the target GPU before release. Software browser
timings do not establish hardware FPS. The authored production Blackout
maintenance/transit layout has no CP8 checkpoint; merged/boss checks therefore
stage the existing macro/controller entry points rather than claiming a full
authored boss/ending playthrough.

### Recorded resource sanity check

The October 22 run passed 1,486 Node tests, type-check, production build and
production-layout validation (77 files). The build retains its existing large
chunk warning. All six browser scenarios passed across the full run and the
focused recovery rerun. The latter uses the real death-animation/Retry contract:
direct checkpoint recovery alone intentionally does not complete a death state.
No page/console, asset-loading or WebGL errors were observed in the passing
scenarios (expected cancellation of streamed music uses the existing filter).
The real-rig ability/recovery integration file also passed all 14 tests after
adding both selected-view aim checks and actual Retry coverage.

Browser resource counts immediately before/after toggling were:

| Level | Geometries, both modes | Textures, both modes | Draw calls, third / first |
| --- | ---: | ---: | ---: |
| Containment | 618 | 73 | 229 / 202 |
| Cultivation | 900 | 67 | 83 / 76 |
| Blackout | 529 | 60 | 172 / 125 |

The camera UUID remained identical within each run and resource counts also
remained stable when toggling back. Draw-call differences reflect the different
frusta and room visibility; they are not a controlled GPU speed comparison.
The feature adds no camera, renderer, render target, light or shadow map, and no
new per-frame scene traversal. Visibility hooks are installed/disposed once per
asset and use explicit arguments without per-draw argument arrays. Masked meshes
still submit their existing draws; this preserves shadows rather than promising
free rendering. No target-hardware FPS claim is made from SwiftShader.

For manual testing:

1. `npm run dev`, start a trial or select any level, finish its arrival, click
   the canvas, then press V. Move the mouse to inspect the horizon and nearby
   geometry. Walk/jump, toggle repeatedly, and check controls/settings rebinding.
2. In Containment, climb a sticky wall, traverse the vent, ride both Room 5
   platforms, then switch to rescued Goop and aim/fire/release in both views.
3. In Cultivation, inspect the traversal platforms and Room 2-to-3 duct; switch
   Bob/Goop and ride the Room 4 lift in both views. Inspect rescue framing when
   the authored sequence takes control.
4. In Blackout, switch all three slimes, aim with Volt/Goop, mount and park the
   maintenance drone, and inspect any available merged/boss/scripted staging.
5. Recover a checkpoint, restart and progress levels: selection should remain.
   Return to the menu and start again: third-person should be restored.

## Change manifest

- `src/render/CameraRig.ts`: selected/effective perspective, transitions,
  near-eye framing, collision clearance and override API.
- `src/render/CameraBodyVisibility.ts`: colour-pass visibility with shadows intact.
- `src/render/bob/BobCharacterPresentation.ts`,
  `src/render/goop/GoopCharacterPresentation.ts`,
  `src/render/volt/VoltCharacterPresentation.ts`: bind/dispose body visibility.
- `src/levels/GreyboxLevelRuntime.ts`, `src/levels/CultivationLevelRuntime.ts`,
  `src/levels/BlackoutLevelRuntime.ts`: input, subject bindings, effective
  visibility and authored precedence, including Specimen lifecycle.
- `src/core/Input.ts`, `src/core/KeyBindings.ts`: named toggle and save migration.
- `src/ui/GameSettings.ts`, `src/ui/GameFlowUI.ts`: preference loading and hint.
- `src/main.ts`: fresh menu-session default.
- `tests/CameraViewMode.test.ts`, `tests/RoomFivePlatformPresentation.test.ts`,
  `tests/BlackoutLevelRuntime.test.ts`: behaviour and integration regressions.
- `tests/BlackoutRoomOneRuntime.test.ts`, `tests/CultivationLevelRuntime.test.ts`:
  existing fixture compatibility with the shared camera API.
- `tests/smoke/CameraViewMode.spec.ts`: production browser scenarios/evidence.
- `docs/camera-view-modes.md`: architecture, precedence and testing notes.
