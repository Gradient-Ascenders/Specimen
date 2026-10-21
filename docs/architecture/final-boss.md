# The Extermination Chamber

Implemented from `docs/planning/boss level plan.md`; initial investigation is in
`final-boss-investigation.md`. The optional fusion tutorial remains saved on
`feat/fused-slime-mechanics` at local commit `a70a1c9`, outside this branch.

## Route and local controls

Finish Level 3's transit cooperation puzzle, bring all three slimes into the
staging corridor and move past its gathering point. A six-second visual merge
leads into the boss deployment. The tutorial is not required or loaded.

For iteration, run `npm run dev`, use `?debug=1`, enter Level 3 and let its
arrival finish, then press **4**. Existing **0** shortcuts advance earlier
levels; **1/2/3** keep their existing Level 3 destinations. Ordinary production
ignores the Room 4 shortcut.

- WASD: movement; Space: charged jump; right mouse: aim.
- Tap/release left mouse: electric goop, one-shotting ordinary small drones.
- Hold left mouse **1.5 seconds**, release: larger electric ball with up to
  **6 m** splash, swept collision and cover/line-of-sight checks. Partial
  charges retain direct damage, but have no area damage.
- Enter skips the current cinematic; P pauses.
- Death's existing Retry restores full health and a clean phase-one fight,
  skipping the long intro. Restart Trial returns to Level 3's CP1.

## Architecture and arena

`BlackoutLevelScene` appends `ExterminationArena` beyond the old sealed staging
corridor. It is 52 m across, with an open central floor, wide raised perimeter,
two radial access ramps, three substantial solid covers, overhead deployment
hatch/machinery, observation deck/silhouettes and entry/escape blast doors.
Solid dimensions are baked into geometry. Static box visuals are instanced by
material; their original colliders remain visible to physics on a non-camera
render layer. Doors alone use dynamic collision transforms.

`FinalBossConfig` scopes the 1.65 m merged radius, 13.2 m/s movement, stronger
acceleration/air control, 1.8x Bob jump velocities, camera and weapon tuning to
the authored final form. Original slimes and the non-authored Sentinel fixture
retain their existing tuning. The fused visual remains a replaceable procedural
model, with Bob's droplet/antenna/eyes, Goop-like fins and electrical veins.

`FinalBossController` is a separate pure fixed-step two-phase authority, not a
relabelling of the legacy three-phase Sentinel controller. It owns 180 health,
the 90-health escalation boundary, 5.5-second core openings, ordered attacks,
one-shot defeat, 100 player integrity and 1.1-second damage grace. Major hits
deal 28 damage, devastation 34 and drone shots 16. Damage is disabled during
cinematics. A phase-two three-drone group kill can stagger once, without an
unbounded chain or recursively extending the opening.

`FinalBossEncounter` reuses the target registry, weak-point adapter, pooled
weapon, four-slot Sentinel drone squad and 16 hostile-shot slots. Its target IDs
are separate from the retained legacy fixture. Targeted beams lock during the
warning and never follow subsequent player movement. Actual solid geometry
clips authoritative endpoints before both rendering and hit checks.

Phase one orders sweep, targeted strike, summons and targeted strike. Phase two
adds warning/active floor sectors, an elevated sweep, a jumpable radial
shockwave and a committed devastation beam. Three broad sectors and the central
hub remain safe from floor electrification. Raised ground avoids floor/ring
attacks, but aimed strikes and the elevated sweep still threaten it.

## Presentation and lifecycle

`FinalBossPresentation` owns the hierarchical extermination machine, opening
core petals, spreading phase-two armour, thrusters, shaders, shared materials
and a 64-particle pool. Small drones use `SecurityDronePresentation` and emerge
beneath the machine's deployment bays before spreading and aiming. Core/floor
shaders and the boss HUD communicate vulnerability, warnings, phase, player
integrity and openings; the existing reticle/charge UI remains in use.

The 9-second intro, 5-second escalation, 7-second destruction and 6-second
escape use simulation time. Pause freezes them; skip settles the next stable
state. FOV and input ownership are restored on handback, retry or unload. The
destruction includes a scripted final charge, electrical blast and breached
exit; a broad curved escape route clears the cover. Environmental debris is
authored/resettable rather than structural physics that could destroy routes.

The ending follows the existing boss-defeated -> splitting -> escape -> complete
macro chain and its once-only completion event. After the merged escape shot,
the split settles at safe authored anchors out of view. The existing application
completion listener opens the existing credits ledger. Back reloads a fresh
title instead of returning to a dead terminal runtime.

Level 3 loading and its existing hidden-form preparation warm the resources.
Four finite-range, non-shadowing room lights keep stable slots; no global light
brightens earlier darkness puzzles. Existing positional SFX and Blackout music
are reused. Reset/death/unload clear shots, sectors, drones, loops, effects and
cinematic ownership. Instanced buffers are explicitly disposed by their owners.

## Validation and limitations

Tests cover phase/vulnerability boundaries, locked aim, scripts/safe sectors,
damage grace, bounded chain stagger, skips, real large-body checkpoint
clearance, both actual ramp traversals, the real camera profile, charged group
kills, natural entry, repeated clean recovery, debug gating and exactly-once
macro/UI completion. Existing authored rooms and the legacy fixture stay tested.

The production-browser test uses actual DOM input, camera rays, charge/release,
swept projectiles and damage to beat both phases after exercising death/retry.
It verifies pause and the escape-to-credits handoff. Only the test response
exposes the composition root for observation; no inspection hook is shipped.
WebGL canvas captures and companion JSON record actual draw/resource counts and
GL errors. The software runner advances real simulation without drawing every
step, so its timings are not a frame-rate benchmark.

Software Chromium is not target Ubuntu/lab hardware qualification. Human
playtesting should still tune difficulty, art, cinematic timing and audio on
the intended hardware; the fused model is intentionally not a final asset.

### Executed results (22 October 2026)

- Full Node gate: **1,460 passed, one existing skip, no failures** (1,461 total).
- Final focused authority/physics/runtime/camera/UI/presentation gate: **90
  passed**. The subsequent upper-doorway seal also passes all 12 boss tests,
  including a large-body sweep proving the locked entry cannot be vaulted.
- `npm run build` / TypeScript: passed. Vite retains its existing large-chunk
  advisory; no dependency or asset pipeline was added.
- `npm run check:generated-assets`: passed, including all existing maps,
  character LODs and acid noise.
- `npm run validate:production`: passed, 77 deployed files at the nested path.
- Production Chromium 149 / SwiftShader: **full fight-to-credits passed twice**,
  including after static batching. Real charged shots reach the half-health
  transition and defeat phase two, after pause and death/retry checks. No
  console/shader/GL errors. Intro, combat, transition, defeat and escape frames
  were captured and inspected. Hardware FPS is not inferred from this run.

Post-batching sampled counters (Performance preset, reduced render resolution):

| State | Draw calls | Triangles | Programs | Textures |
| --- | ---: | ---: | ---: | ---: |
| Deployment | 177 | 6,530 | 61 | 63 |
| Combat | 59 | 7,040 | 61 | 63 |
| Escalation | 180 | 6,884 | 61 | 63 |
| Defeated | 53 | 4,460 | 61 | 63 |
| Escape | 236 | 23,890 | 61 | 63 |

The combat view previously used 177 draw calls; instancing reduced that sample
to 59 without replacing physical colliders. All samples report GL error 0 and
fixed capacities of 12 friendly shots and 16 hostile shots. Geometry residency
was 620 through combat, 715 after the wide escape view first displayed more
retained scene geometry; it is not reported as constant or as a leak test.
Programs/textures stayed stable across both phases and the ending. Sampled JS
render submission took 2.1–8.5 ms, but synchronous software readback took
60.6–6,722 ms; neither is a target-hardware FPS qualification.

Artifacts are under `/tmp/specimen-boss-smoke-results/` in this workspace;
`tests/smoke/FinalBoss.spec.ts` reproduces captures and companion JSON with the
standard production smoke config and an installed matching Playwright browser.
