# Issue #92 — Goop acid presentation evidence

## Architecture and ownership

- #91 remains authoritative for aim candidates/selection, cooldown, projectile
  transforms, impacts, and burns.
- #31 remains authoritative for dissolve progress and removal.
- #92 consumes the stable read models and typed events in one level-owned
  `GoopAcidPresentation` instance. It adds no scene traversal, raycast, physics,
  hit detection, or gameplay timer.
- One reusable DOM crosshair and bounded GPU pools are created per loaded level
  and disposed on unload.
- The existing dissolve material receives presentation-only emissive uniforms;
  zero strength leaves its authored appearance unchanged.
- The existing collision-aware camera rig receives a smooth shoulder/distance
  modifier. Its resulting live centre ray remains authoritative; only the look
  pivot shifts laterally, while the camera position remains on the normal
  obstruction-swept boom.

All effects are procedural Three.js geometry/shader/CSS work. No external
textures, code, or third-party visual assets were introduced, so `CREDITS.md`
does not require a new entry.

## Automated evidence

Focused tests cover crosshair mapping, Bob/Goop idle invisibility,
candidate-to-selected fades, partial dissolve coexistence, cooldown, one-DOM
reuse, authoritative projectile creation/update/removal, weak versus strong
impact feedback, repeated hits, burn-to-dissolve fade, switch during flight,
suspend/reset cleanup, camera interpolation/live-ray agreement, and idempotent
resource disposal.

Full command results and browser observations are recorded in the issue handoff.

## Visual captures

All captures come from production archives served from the deployment-style
`/group-folder/` subpath. The final compatibility pass was run after
fast-forwarding to `origin/main` at `5c86af2`, which includes #33's merged
authored Containment lighting and environmental effects:

- `issue-92-bob-idle.png` — Bob active with no crosshair or target treatment;
- `issue-92-goop-aim-selected.png` — the shoulder aim pose, selected procedural
  hatch/contour, and ready crosshair in the white Room 1 laboratory;
- `issue-92-acid-projectile.png` — live shot/valid-hit frame with the compact
  yellow-green projectile/flash language;
- `issue-92-valid-hit-burn.png` — stronger target-local valid-hit flash;
- `issue-92-partial-dissolve.png` — the real gameplay burn paused at 35%, with
  the existing dissolve holes and edge emission remaining visually dominant;
- `issue-92-narrow-neutral.png` — neutral/no-target crosshair at 480 × 800;
- `issue-92-room-5-aim.png` — neutral aim in the current authored Room 5
  containment environment.

The production browser reported no console errors, shader warnings, failed
requests, or asset 404s. Four Chromium software-WebGL `ReadPixels` performance
warnings were emitted while screenshots were captured; they are tooling/driver
warnings rather than application errors.

Manual interaction covered Bob idle, Goop idle/aim, selected and no-target
states, the post-shot cooldown crosshair, valid and world impacts, burn, 35%
partial dissolve, completion, pause/resume, death/retry, slime switching,
reset/restart, Room 1 white/glass
surfaces, current Room 5 containment geometry/lighting, and the narrow viewport.
The authoritative diagnostics recorded one world impact separately from valid
hits. The pre-art lifecycle stress pass kept the presentation fixed at 8
projectile slots, 48 droplets, 8 flashes, and one DOM node through eleven
restarts. After the #33 branch update, all 202 tests pass, including the final
lighting rig's disposal/recreation invariants. The production prewarm compiled
the acid representatives in all five room subsets (`50 / 38 / 62 / 75 / 83`
representatives total per room), and the first valid shot left the shader cache
stable at 79 programs. These software-WebGL observations are lifecycle and
cache checks, not a lab-hardware benchmark.

#33's room-owned shader prewarm now explicitly includes #92's bounded acid
presentation root. It compiles representatives for the core, halo, trail,
droplets, and impact flash against the active authored light signatures without
showing or advancing an authoritative projectile. The final Room 5 lighting,
release-green palette, containment glass, and alarm colours were rechecked with
the persistent dissolve/highlight material rather than treated as future work.
