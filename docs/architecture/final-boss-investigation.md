# Extermination Chamber implementation investigation

Baseline: `origin/main` at `64d9eaa` (22 October 2026). Specification:
`docs/planning/boss level plan.md`, read in full before implementation.

## Preserved work

The optional fusion tutorial and its isolated mechanics are saved on
`feat/fused-slime-mechanics`, local commit `a70a1c9`. They are not included in
this boss branch. Reuse is limited to the relevant, independently configured
movement/weapon/presentation improvements. Unrelated untracked planning and
RoomFiveGreybox files remain untouched. Nothing is pushed.

## Existing architecture and reusable systems

- `BlackoutLevelRuntime.ts` owns the three persistent slime bodies, the merged
  body/form, fixed-step input, failure/retry, puzzle participants, and the
  once-only `completed` event consumed by the existing game-flow/credits UI.
- `BlackoutLevelScene.ts` builds the authored maintenance bay, transit room,
  and a sealed `BlackoutBossStaging.ts` corridor. The actual Room 4 is absent.
  The non-authored foundation remains a backend test harness, not the route
  played in the shipped game. Its checkpoints/coordinates must stay compatible.
- `BlackoutFoundationManifest.ts`, `BlackoutCheckpointManager.ts`, and
  `BlackoutRuntimeState.ts` already define merge/boss/split/escape contracts.
  Authored checkpoints replace foundation coordinates where appropriate.
- `SpecimenFormController.ts` owns group/merged participation and the guarded
  six-second merge. `KinematicBody.ts` owns collision, charged jumps, adhesion,
  support, and recovery. Use separate final-form tuning; leave ordinary slimes
  and the legacy foundation's radius unchanged.
- `SpecimenProjectileSystem.ts`, `CombatTargetRegistry.ts`, and
  `SentinelWeakPointTarget.ts` provide pooled shots, swept collision, occluded
  splash, registered damage eligibility, and a stable weak-point identity.
- `SentinelBossController.ts` and `SentinelBossDevelopmentRig.ts` are a tested
  THREE-phase armour-layer fixture. Silently relabelling it as two phases
  would violate both the new plan and its existing checkpoint tests.
- `TimedSentinelAttack`, laser/shockwave implementations, and
  `SentinelDroneSquad` provide reusable fixed-step attack lifecycles, swept
  hazards, bounded hostile shots, targets, and cancellation semantics.
- `SecurityDronePresentation`, `DroneBreakupPresentation`, `CameraRig`,
  existing authored cinematic timelines, `GameplayAudio`/`AudioManager`, and
  the material/light/resource-preparation utilities provide production
  presentation patterns. There is no general all-purpose cutscene sequencer;
  existing cinematics use deterministic, level-owned timelines and camera
  handoff. Follow that convention.

## Missing components and integration approach

1. A circular authored Room 4 attached after the staging corridor: broad main
   floor, wide raised ring, multiple access routes, three cover assemblies,
   overhead deployment machinery, observation deck, and an escape portal.
2. A production two-phase controller using the existing weak-point adapter.
   Keep legacy Sentinel fixtures intact. Centralize health,
   timing, damage, movement, drone caps, and arena dimensions.
3. Authored targeted-strike, floor-sector, and devastation attacks alongside
   reusable sweep/shockwave/drone mechanisms. Both collision and visuals must
   read the same committed geometry. Cover must stop relevant beams.
4. A hierarchical extermination-drone model and merged-slime presentation;
   state-driven core/floor shaders, bounded impact pools, boss/player HUD,
   phase changes, positional audio, and resettable environmental damage.
5. Level-owned intro/transition/defeat/escape timelines. Damage is suspended
   during cinematics, skips settle their final state, and completion routes
   through Blackout's existing macro phases and once-only completion event.
6. An authored boss checkpoint restores phase one and all transient state.
   Natural entry is through the completed transit/staging corridor; a separate
   debug-only Room 4 shortcut supports local iteration. The optional tutorial
   is not required to reach or complete the boss.

## Risks and deliberate constraints

- Main's authored Room 3 is only a staging destination. Append the boss route
  rather than replacing the completed maintenance/transit rooms or pretending
  additional upstream content exists.
- The old merged-body radius is 0.675 m, incompatible with the new larger form.
  Give authored boss checkpoints their own radius/anchors and validate them;
  preserve foundation tests and all ordinary-body configuration.
- CollisionWorld uses conservative sphere-vs-box sweeps: bake solid dimensions
  into geometry, do not use stretched unit boxes as physical platforms/walls.
- Global ambient/directional lights would brighten the earlier darkness puzzle.
  Use a few finite-range non-shadowing room lights, stable light slots, shared
  emissive materials, and existing finite-light evaluation.
- Pool drones/projectiles/effects; use authored destruction, not rigid bodies.
  Prewarm all attack/effect material variants before combat. Do not promise
  hardware qualification from a software-rendered browser timing.
- Existing licensed music contains no dedicated boss track. Preserve the
  soundtrack system and use phase-reactive existing SFX rather than inventing
  a missing audio asset or changing earlier music behavior.

## Milestones and verification

Implement and commit coherent, verified milestones: arena/integration; merged
combat; boss authority/model/phase one; phase two/hazards; cinematics/ending;
polish/regression checks. Each milestone must work before advancing.

Add tests for actual traversal/clearance; two-phase health/vulnerability gates;
telegraph/commit/execute/cancel; locked aim; fair safe sectors; bounded drone
deployment and charge-group destruction; damage grace; checkpoint cleanup;
cinematic skip/pause/unload; exactly-once completion; and repeated resource
counts. Run the full Node suite, type-check/build, generated-asset checks,
production validation, and a real production-browser fight/retry/ending pass.
Inspect visual captures at key states and record draw/triangle/resource counts
and timing observations separately from lab-hardware qualification.

## Follow-up findings

The completed controller uses its own pure fixed-step stage timeline, rather
than forcing the three-phase fixture into a two-phase shape. Shared physics,
weapons, target adapters, drone pool, audio, camera profiles and checkpoint/macro
owners remain reused. Actual traversal tests caught and fixed overlapping deck
lips at the ramps. Browser testing caught the zoom-in-only camera scale API and
reversed cinematic handback; authored contextual framing now handles both.

The old completion event only stopped music; it did not open credits. Its
existing application listener now opens the existing ledger once. Final credits
return to a fresh title, not a terminal paused runtime. See `final-boss.md` for
the completed design, controls, validation and hardware limitation.
