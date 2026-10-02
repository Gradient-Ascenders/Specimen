# Integrated shadow preparation and validation (#173)

This completes the preparation implementation for the shadow rollout tracked by
[#168](https://github.com/Gradient-Ascenders/Specimen/issues/168). Acceptance is
recorded separately in [the integration evidence](evidence/issue-173/review.md).
Gameplay, assets, authored lights, collision and authoritative clocks retain
their existing ownership.

## Preparation

Containment prepares all five room signatures and four adjacent-room overlaps.
In addition to the visible, transmission and camera-fade variants, it explicitly
compiles the actual PCF caster materials, including authored morphs, instances,
secondary deformation and dissolve hooks. The hidden camera does not need to
see a caster to prepare its depth shader. Copies retain programs until unload;
instance copies release their own buffers without disposing borrowed geometry.
A pending depth compiler keeps its copies until settlement after cancellation.

Cultivation retains its staged queue and preparation overlay. Every visibility
configuration must finish before its first live draw; traversal can prepare
other configurations in the background. Startup prepares ordinary Room 1,
lift/dark coexistence and isolated Room 5. The queue prepares canvas receivers,
opaque transmission receivers, relevant depth/distance passes and both eye fade
variants. Point-distance passes are prepared only with a shadowed point source.
Visible foundation meshes are included alongside the authored rooms; their
dissolve and hazard materials also consume each room's light signature.
Shadow compilation uses light signatures without visible-pass fog/environment,
matching Three.js's actual null-scene shadow draws. Material copies preserve
custom hooks, uniform identity, alpha/clipping/displacement settings, morph
counts, normalized attributes and instanced geometry features.

Bob's transmissive body is compiled but does not draw in the queue's temporary
scenes. The same morph geometry uploads through his prepared depth pass. Only
the live camera creates his gameplay transmission target. This avoids retaining
an implicit Three.js transmission target for every temporary scene on reload.
Temporary PCF comparison depth/cube attachments, material and instance copies
remain queue-owned. Geometry, maps and presentation uniforms remain borrowed.

Blackout prepares its retained light signature behind the transition screen,
including hidden character forms, opaque/transparent eye programs, transparent
back faces, transmission receivers and all relevant caster materials. Power
changes retain registered light slots. Volt and specimen replace one point slot
when their existing presentations switch. Preparation never advances a powered
device, merge, door or encounter clock. Level-owned live maps allocate while
loading and invalidate before visible use. Preparation materials remain resident
until unload; cancellation waits for compilation before releasing copies.

`withIsolatedPrewarmState` restores target/cube-face/mip, viewport, scissor and
render counters synchronously before an asynchronous compiler yields, or after
an exception. `RenderLayer.withShadowPreparation` independently restores all
shared shadow policy fields. An isolated upload cannot overwrite live shadow
maps. Late work checks its resource generation before drawing or unloading.

## Live map updates

The existing [Containment policy](containment-lighting.md) caches only static
zones, explicitly invalidating moving assembly, visibility, dissolve, character
departure and reset changes. Occupied maps update continuously for stationary
secondary motion and fades. Cultivation searchlights and ordinary fixture maps
remain dynamic; inactive searchlight networks skip updates and invalidate on
return. Blackout updates its powered drone and hallway maps under their existing
presentation owners. No additional automatic-update caching or map/source/detail
change is introduced by #173.

## Reproduction

Build once, then run the production profiler:

```sh
npm run build
node scripts/profile-game-shadows.mjs
```

The default launches local Chromium, which may use software WebGL. The recorded
GPU identity determines whether results are hardware performance evidence.
`GAME_SHADOW_CDP_URL` connects an isolated existing native Chromium session;
`GAME_SHADOW_URL` supplies an existing production server; `GAME_SHADOW_OUTPUT`
selects the artifact folder. `GAME_SHADOW_DPR=2` samples the renderer's existing
DPR cap; `GAME_SHADOW_SKIP_LIFECYCLE=1` records timing without repeating cycles.
The profiler records production asset hashes and the dirty checkout paths.
When a native host cannot resolve a linked worktree's Git metadata,
`GAME_SHADOW_PROVENANCE` accepts a JSON file containing `revision` and
`dirtyPaths` recorded from the checkout. Browser debugging can remain bound to
native localhost by running the harness with native Node; no network relay is
required.
`GAME_SHADOW_SINGLE_SOURCE=room-1-pedestal-soft-key` restricts the frozen
Containment comparison to that source, retaining other lights' radiance and
restoring the full graph before continuous sampling. Combine it with
`GAME_SHADOW_SKIP_LIFECYCLE=1` and a separate output folder. This explicit
source comparison must not be replaced by dividing the whole graph's timing.

The profiler measures frozen off/on/on/off blocks separately from running fixed
simulation and presentation at spawn. It records raw samples, disjoint status,
GPU and submission distributions, draw/triangle/resource counts, camera/light
state, loading/handoff durations, three restarts and three rendered reloads per
level. The first reload may release comparison variants; later cycles must not
grow programs, geometries or textures, and all allocated level maps must dispose
once. Its debug completion APIs select real menu handoffs; they do not constitute
full native traversal or cutscene acceptance.

Production browser regressions support the same isolated hardware session:

```sh
SPECIMEN_BROWSER_CDP_URL=http://local-debug-endpoint \
SPECIMEN_PRODUCTION_URL=http://existing-production-server \
npx playwright test
```

Without those variables, the existing single-worker Chromium/preview workflow
is unchanged. Supplement with the existing character, Containment and
Cultivation/Blackout capture scripts for pose/coverage and encounter evidence.

## Budget and review

The [foundation budget](evidence/issue-169/review.md#initial-budget-for-subsequent-phases)
remains Room 1 GPU p95 ≤10 ms and render submission p95 ≤14 ms at 960×600/DPR 1.
The isolated per-source GPU overhead allowance remains p50 ≤2.5 ms / p95 ≤3 ms;
whole graphs cannot be divided by source count or multiplied into a larger
allowance. The running gameplay target remains 16.7 ms per frame. Higher DPR
and large encounters require their own evidence. No quality setting or increased
budget is assumed.

Visual approval remains separate from compilation, resource, screenshot and
performance checks. Native sequences and a full normal-input playthrough must
be explicitly recorded before claiming them. No new third-party code, assets or
resources were introduced; the existing Three.js credits entry covers its API.
