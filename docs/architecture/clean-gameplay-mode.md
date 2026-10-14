# F1 clean gameplay mode

Press **F1** during gameplay to hide the HUD and press it again to restore the
current UI. The browser help action is prevented for this shortcut, including
automatic repeats and menus; repeats do not toggle. Modified F1 shortcuts and editable
fields do not toggle. Menus, loading, death/recovery and preparation screens do
not accept the toggle.

The preference lasts for the application session, including character changes,
room/checkpoint changes, retries, level restarts and transitions across all three
levels. Pause, Settings, Credits and transition screens temporarily suspend clean
presentation so their controls remain usable. Resuming play reapplies the
preference. Reloading the application starts with normal UI.

## Ownership and rendering

`CleanGameplayMode` owns the preference, F1 listener and game-flow subscription.
`main.ts` connects it to the session and renderer and disposes it at shutdown.
It never stops the loop, changes gameplay input bindings, moves the camera,
changes puzzle/physics state, or changes audio state.

One `data-clean-gameplay` attribute on `#app` drives a CSS boundary. Every direct
DOM child is hidden except the marked gameplay canvas, game-flow menu container
and essential full-screen recovery/preparation surfaces. The game-flow container
is also hidden while its state is `playing`, removing its entire HUD and all
decorations. The rule overrides inline `display` changes, so new overlays added
after F1 remain hidden without per-frame scans or a mutation observer. New
screen-space UI should remain under this host boundary. Essential full-screen
blocking surfaces must opt in with `data-clean-gameplay-essential`.

HUDs continue receiving their normal live state updates while hidden. Restoring
normal presentation changes only this boundary, without replaying cached text,
changing individual `hidden` flags or resurrecting expired elements.

| Presentation | Clean-mode behavior |
| --- | --- |
| Objectives, guidance, control hints, roster, switch/passive status | Entire game HUD hidden |
| Goop acid crosshair; Volt electrical crosshair/status; merged attack charge/crosshair | Level-owned DOM overlays hidden |
| Maintenance drone mount instructions, status and tutorial | DOM overlay hidden |
| Elevator and security-network prompts | DOM overlays hidden |
| Damage vignette and screen-edge flashes | DOM feedback hidden; damage simulation continues |
| Diagnostics, FPS and performance recorder controls | DOM panels hidden; recording can continue |
| Inactive Bob/Goop letter markers, Volt target outlines, development spawn/recovery rings and debug collider wireframes | WebGL UI layer excluded for the draw |
| Pause, Settings, Credits, transitions, preparation failure and Retry | Kept usable |
| Characters, enemies, projectiles, acid splashes, electrical beams, lasers, particles, lights, shadows and authored world signs | Kept visible |

Three.js layer **30** is reserved for nonessential gameplay UI. Only inactive-body
locator sprites, aim target outlines, development reference rings and debug collider lines use it; layer 31 remains reserved for
isolated prewarming. The normal camera includes layer 30. A clean draw temporarily
excludes it and restores the original camera mask in `finally`, without changing
object visibility or camera pose. Normal overlay selection therefore survives F1.

Entering clean mode closes an open diagnostics inspection through its existing
close path, restoring only the input capture that inspection owned. While clean,
F2 cannot open an invisible interactive panel. Normal diagnostics behavior
returns with F1. This prevents hidden diagnostics from trapping gameplay input.

## Verification and examples

`tests/CleanGameplayMode.test.ts` covers keyboard guards, persistence, cleanup,
essential screens and the actual WebGL UI objects/layer mask. The production
browser test in `tests/smoke/CleanGameplayMode.spec.ts` exercises all three levels,
all playable identities, dynamic overlays, movement, switching, diagnostics,
pause/restart/transition behavior, unchanged audio state, and canvas visibility.
It observes real runtime seams without replacing game or rendering logic.

Browser captures are written to ignored `artifacts/evidence/f1-clean-gameplay/`.
Reviewed examples are retained under `docs/evidence/f1-clean-gameplay/`:

| Level | Normal | Clean | Restored |
| --- | --- | --- | --- |
| Containment | [Normal](../evidence/f1-clean-gameplay/level-1-normal.png) | [Clean](../evidence/f1-clean-gameplay/level-1-clean.png) | [Restored](../evidence/f1-clean-gameplay/level-1-restored.png) |
| Cultivation | [Normal](../evidence/f1-clean-gameplay/level-2-normal.png) | [Clean](../evidence/f1-clean-gameplay/level-2-clean.png) | [Restored](../evidence/f1-clean-gameplay/level-2-restored.png) |
| Blackout | [Normal](../evidence/f1-clean-gameplay/level-3-normal.png) | [Clean](../evidence/f1-clean-gameplay/level-3-clean.png) | [Restored](../evidence/f1-clean-gameplay/level-3-restored.png) |
