# Goop model integration specification

Replace Goop’s temporary sphere visuals with the approved authored model in
Containment, Cultivation, and Blackout. Goop should have the same standard of
scene-lit gel rendering, transmission, reflections, secondary motion, fading,
shadows, and lifecycle handling as Bob. Preserve Goop’s green appearance,
six-spike crest, seated black eyes, and distinct gameplay abilities.

This is an implementation handoff. The Blender asset is finished; runtime
integration described here is required work. Implement the complete journey,
including the containment reveal, ordinary play, death/retry, and merge/split.

## Scope and authority

`KinematicBody`, the roster, level controllers, ability systems, and checkpoint
systems remain authoritative. The model consumes snapshots and events. It must
not change colliders, movement tuning, jump height, camera collision, targeting,
damage, dissolution, progression, or recovery positions.

| Reuse from Bob’s presentation | Keep specific to Goop | Exclude from Goop |
| --- | --- | --- |
| Physical gel lighting, transmission, reflection environment, bounded wobble and impact ripple | Acid-green body and attenuation, six sharp spikes, black eyes, broader pooled skirt | Bob’s cyan palette and authored geometry |
| Async preparation, fades, shadow materials, reset, disposal, diagnostics | Normal-jump takeoff and landing response; existing acid aim/fire presentation | Charged-jump anticipation, charge flattening, rebound ability |
| Smooth facing, interpolation, modest squash/stretch, death-burst infrastructure | Existing dissolve ability and radiation immunity | Sticky attachment, wall climbing, wall-hang poses and clearance logic |
| Shared rendering infrastructure with explicit ownership | Goop-specific deformation masks and visual tuning | Bob’s morph names, expression set, curl poses, stress-expression behavior |

Goop’s current roster contract is `jumpMode: 'normal'`, adhesion/rebound/electrical
disabled, dissolve enabled, and radiation immunity. Retain it. Normal landing
compression and a surface ripple are visual reactions, not permission to add
Bob’s physical rebound. Goop does not gain Volt’s light or electrical behavior.

Do not redesign the approved asset, add loose slime puddles, add an inner shell,
or make Goop emissive to compensate for poor lighting. Existing acid projectile
and burst effects may retain their intentional emission. Rigging, new authored
expressions, and a new gameplay animation system are outside this integration.

## Approved asset contract

Use `assets/characters/goop/goop.glb`. The same directory contains `goop.blend`,
`goop_model.py`, `generate-goop.py`, `verify-goop.py`, `goop.validation.json`, and
`goop.roundtrip.json`. Preserve these source and validation artifacts. The
directory is currently untracked in this worktree; include the intended asset
files in the eventual implementation delivery rather than assuming they exist
in another checkout. Exclude Python caches and temporary captures.

The current production candidate has:

- Root `Goop`; meshes `Goop-Body`, `Goop-Eye-Left`, `Goop-Eye-Right`.
- Imported materials `Goop-Acid-Gel` and `Goop-Obsidian-Eyes`.
- Runtime axes +Y up, -Z forward; identity object transforms.
- Resting sole at local Y = -0.45 m, matching the current 0.45 m gameplay radius.
- 33,716 triangles: 26,804 body and 3,456 per eye; three visible meshes and two
  shared visible materials. Extra depth/distance passes are additional draws.
- One closed connected component per mesh; no bones, morph targets, or clips.
- Body footprint approximately 1.46 m wide, 1.30 m tall including the crest,
  and 1.28 m deep. Exact bounds are in the validation report.

Use a Vite-managed URL following Bob’s `new URL(..., import.meta.url)` pattern.
Do not introduce a root-relative `/assets/...` URL. Do not load the Blender
studio, lights, or camera into the game. Imported GLB materials are reference
look-development inputs; replace them with runtime gel materials deliberately.

Create a Goop-specific asset validator. Validate names, mesh types, topology
counts/bounds, finite positions/normals, axis/contact metadata, and absence of
unexpected meshes, skinning, morphs, and animation. Use Goop’s actual metadata:
it does not use Bob’s `contract` values or exact axis metadata strings. Do not
rename Goop into a Bob asset or pass it through `validateBobMorphAsset`.

Keep the authored proportions at the 0.45 m body radius. The skirt and spikes
extend outside the sphere by design. Verify narrow passages and camera views;
do not enlarge gameplay collision or shrink the whole model to fit Bob’s bounds.
If meaningful clipping cannot be resolved within presentation, report it with
evidence rather than silently changing gameplay or remodeling the asset.

## Runtime structure

Create `src/render/goop/GoopCharacterPresentation.ts` and a Goop asset validator.
Use Bob’s public presentation boundary as the lifecycle reference, not as a
base class containing unwanted wall and morph behavior.

The presentation owns its character hierarchy, geometry/material instances,
temporary motion state, and Goop death presentation. Provide the equivalents
of `prepare`, `ready`, `setPosition`, `setYaw`, `update`, `present`, `setVisible`,
`setOpacity`, `setShadowCasting`, `setReflectionEnvironment`,
`setReflectionIntensity`, `prepareCameraFadePrograms`, `onLanding`, `onLaunch`,
`startDeath`, `updateDeath`, `finishDeath`, `reset`, `diagnostics`, and `dispose`.
Names may follow an existing shared interface if one is extracted.

Use a root such as `player-slime-goop-presentation`; keep character transforms
separate from the death-burst root. The level owns authoritative/interpolated
position. The presentation owns bounded facing and deformation beneath it.

Preparation must be idempotent, deduplicate concurrent loads, and support a
retry after failure. A late successful load after disposal must release its
resources without attaching anything. Apply visibility, opacity, reflection,
and shadow state requested before loading finishes. Use the normal level
loading/error path; a permanent sphere fallback is not completion.

Dispose replaced imported materials once, including any owned textures. Do not
dispose a borrowed reflection texture. If loading is cached, clone mutable
presentation state and make shared geometry ownership explicit. Never reparent
one live character instance between levels. Wire rollback before attachment
in runtimes that use construction rollback.

## Gel shading and transparency

Extract a small configurable shared gel implementation from
`BobGateTwoMaterials.ts` and `BobSecondaryMotionShader.ts`, or reuse equivalent
shared helpers. Keep Bob’s existing API and defaults intact. Share physical
rendering and shadow logic; isolate identity colors, displacement masks, and
motion tuning. A copy of the whole Bob presentation with renamed symbols is
not the intended implementation.

Use these initial Goop material settings, then tune only with browser evidence:

| Setting | Initial Goop value |
| --- | --- |
| Body base color | Authored linear RGB `(0.045, 0.60, 0.001)`; handle color space explicitly |
| Roughness and clearcoat | 0.26 roughness, 0.25 clearcoat, 0.18 coat roughness |
| Gel transmission | Start at Bob’s 0.28, rather than the Blender preview’s 0.06 |
| Optical volume | Start at Bob’s thickness 0.42 m, IOR 1.34, attenuation distance 1.35 m; use green attenuation |
| Body emission and metalness | Zero |
| Eyes | Near-black, opaque at normal visibility; start at authored roughness 0.23 and coat 0.18 |

The result should read as green gel under the game’s lights, not a washed-out
glass shell. Keep the seated eyes black and readable through angle changes;
avoid visible rear eye shells, extra face silhouettes, or refraction artifacts.
Do not add fake white catchlight meshes. Keep one body surface and FrontSide
rendering unless a measured rendering defect requires a documented exception.

Distinguish physical transmission from camera opacity. At ordinary visibility,
body opacity is 1 and transmission supplies the gel appearance. Follow Bob’s
stable body transparency mode, depth-write policy, and opaque-to-transparent
eye transition for camera fades. Recompile only when the material mode changes,
not whenever opacity changes. Restore full opacity after switching, aim exit,
death recovery, restart, and level handoff.

Borrow the level’s existing reflection environment instead of allocating a
second PMREM per character. Resolve reflection intensity using Goop’s own room
and position, even when Bob is active elsewhere. Retain smooth transitions and
snap at lifecycle boundaries. Blackout must still become dark when its actual
lighting is dark; Goop must not inherit a permanent bright reflection fill.

## Motion and eye seating

The supplied asset has no authored morphs. Do not invent morph names or reuse
Bob’s pose dictionary. Use bounded presentation transforms for subtle normal
jump/landing squash and stretch, applied to the complete body-and-eyes group
around the sole. Keep the contact point stable and return exactly to neutral.

Use authoritative travel and movement intent for facing and optional subtle
ground motion. Carrier displacement, teleport, checkpoint recovery, switching,
and respawn must not appear as self-propelled motion. Keep fixed-step updates
and render interpolation separate. Stationary Goop retains a stable heading;
acid aim may use the authoritative aim direction without steering the collider.

Reuse the assessed custom secondary shader behavior: restrained idle wobble,
localized event-driven impact ripple, and corresponding lighting-normal
response. Bob’s displacement bounds (0.0035 m wobble and 0.006 m impact) are
upper starting bounds, not a requirement to maximize displacement on Goop.
Expire impact strength and age, and reset accumulated state on recovery.

Replace Bob’s hard-coded eye-seat mask with Goop-specific protection derived
from the approved eye bounds and actual front-facing geometry. Goop’s eye
perimeters are embedded only about 0.0015 m; an unmasked 0.006 m body wave can
expose or swallow them. Suppress body displacement across the complete seated
eye regions with a smooth margin, or prove a shared body/eye deformation keeps
them seated. Test maximum combined motion, not only neutral.

Protect the sole, forelock contact, and thin spike tips against inversion,
ground penetration, and exaggerated wobble. Keep all six spikes sharp and the
ridge slim. Do not use shader motion to reintroduce the large forehead gap.
Expand rendering bounds for bounded deformation without changing collision.

Goop needs its own correctly routed movement events. The existing buses in the
three runtimes primarily feed Bob, and Blackout currently supplies movement
events only to Bob’s body. Add a separate Goop bus or identity-tagged routing;
never make Goop’s landing animate Bob or vice versa. Do not fabricate Bob charge
or sticky-contact events for Goop.

## Shadows and camera visibility

Assign matching custom depth and distance materials. Visible and shadow passes
must evaluate the same positions and share the same live uniform objects;
only one update advances time. Preserve shadow fading during camera opacity
changes and exclude hidden/dead bodies from casting. Honor each level’s shadow
coverage and camera-culling policy. Burst particles remain non-casting.

Apply the existing camera-proximity opacity resolver to the active Goop body,
including both eyes and all body spikes. First-person acid aiming must hide
the controlled model cleanly. Preserve the existing camera and aim transitions;
do not leave black eyes, a crest, or a detached shadow in the camera.

Resolve visibility from lifecycle state so one update cannot undo another:
unprepared/locked or retired reveal instance, death, merged form, and active
first-person aim take precedence over ordinary visibility. Inactive Goop stays
visible in the world when appropriate. Locator updates must never resurrect a
hidden character. Reset restores the state required by the authoritative phase.

## Integration points

| Area | Required change |
| --- | --- |
| `SlimePairPresentation.ts` | Remove ownership of `goop-development-body`; retain Bob/Goop inactive locators and their occlusion behavior. Levels own the authored Goop presentation. Adapt `setGoopVisible` callers instead of retaining a hidden duplicate proxy. |
| `GreyboxLevelRuntime.ts` and `ContainmentTeachingScene.ts` | Prepare and mount Goop; route its snapshots/events, interpolation, room lighting, opacity, shadow coverage, reset and disposal alongside Bob. Preserve unlock and switching authority. |
| `RoomFiveGreybox.ts` | Replace `etchPlaceholder` / `room-5-contained-etch-placeholder` with the authored appearance during containment and release. Keep the existing release positions/timing, lighting cues, skip/finalize and reset behavior. Transfer visibility at unlock so there is exactly one visible Goop. A separate reveal instance is acceptable with explicit ownership and disposal. |
| `CultivationLevelRuntime.ts` | Replace the pair’s sphere; prepare Goop, route per-body events and reflection targets, integrate normal play, parked bodies, acid aim, room transitions, death/retry, and checkpoint recovery. |
| `BlackoutLevelRuntime.ts` | Replace `visuals.goop` and all direct mesh/material assumptions with Goop’s presentation. Preserve `visuals.volt`, Volt’s light, and the merged Specimen. Cover merge, split, first-person aim, death, reset, and construction rollback. |
| `GoopAcidPresentation.ts` | Preserve its authority boundary and existing crosshair, trails, impacts, highlights and dissolve feedback. This class is not the character-model owner. |

Leave `AcidProjectileSystem` aim rays, projectile origins, collision, cadence,
and damage unchanged. Do not redirect authoritative shots through a decorative
mouth socket; the approved model has no mouth mesh. Any cosmetic launch reaction
must follow a real fired event and must not create or delay a projectile.

Remove the Level 1 path that calls `testScene.bob.startDeath` for Goop. Give Goop
an identity-correct death presentation using the shared `SlimeBurstPresentation`
with a green base color and existing `DeathSequence` timing. Ordinary Goop and
its shadow retire exactly once; the burst originates at Goop’s authoritative
position. Bob remains at Bob’s position. Do not copy Bob’s stress morphs.
Replace/route Cultivation’s non-Bob burst ownership carefully to prevent double
effects, and cover Blackout’s Goop failure path as well. Retry restores the
whole group and the recovered active identity without briefly displaying the
old sphere or a second Goop.

## Preparation and resource stability

Await Goop preparation before compiling level presentation. Include its body,
eyes, transmission variants, fade variants, depth/distance programs, and first
death burst in the existing hidden preparation path. Preserve cancellation and
renderer-state restoration when unloading during preparation.

Containment selects some prewarm sources by the `player-slime-` prefix and
hierarchy. Naming the root correctly is necessary but not sufficient: ensure
the actual mounted root is enumerated in every relevant room. Blackout’s
`BlackoutPresentationPreparation.ts` explicitly recognizes `Bob-Eye` for faded
eye variants; extend this through an explicit shared capability or Goop support.
Audit the Cultivation preparation path too. Do not remove program-stability
assertions to make a new character pass.

The normal character budget is three visible meshes and two shared visible
materials per Goop instance, plus bounded shadow/transmission passes. No new
per-frame geometry, materials, textures, scene traversal, or unbounded particles.
No extra PMREM allocation for Goop when the level already owns one. Diagnostics
should expose asset readiness/counts, visibility, opacity, facing, secondary
motion, reflection targets, shadow state, and death state.

## Implementation order

1. Add the Goop loader/validator and presentation lifecycle with injected loader
   tests. Verify the real GLB, not only a synthetic test fixture.
2. Extract/configure common gel and shadow behavior while preserving Bob’s
   outputs. Add Goop masks, materials, normal-jump motion, and green burst.
3. Integrate Containment, including reveal, acid aim and Goop death. Then wire
   Cultivation and Blackout through the same presentation class.
4. Complete preparation, fades, per-body lighting, reset/disposal and diagnostics
   across all levels. Remove obsolete Goop proxies and material assumptions.
5. Run unit, build and real-browser verification below. Deliver evidence and
   report remaining gaps explicitly.

## Acceptance and verification

Add focused tests for Goop asset validation; async load failure/retry and
late-resolution disposal; pre-load state; neutral reset; normal jump/landing;
body/eye deformation protection; shared visible/shadow uniforms; stable shader
cache keys; camera fades; green death burst; and ownership/disposal. Extend
runtime and locator tests to catch visibility being overwritten by subsequent
updates. Test negative identity cases: Goop cannot charge, climb, rebound, or
power devices, and retains acid behavior and radiation immunity.

Existing reference suites include `BobCharacterPresentation.test.ts`,
`BobGateTwoMaterials.test.ts`, `SlimePairPresentation.test.ts`,
`SlimeBurstPresentation.test.ts`, `AcidProjectileSystem.test.ts`,
`GoopAcidPresentation.test.ts`, `CultivationLevelRuntime.test.ts`,
`BlackoutLevelRuntime.test.ts`, and the shadow/preparation suites. Existing
browser references include `LevelOneShaderProgramStability.spec.ts`,
`CultivationBobPresentation.spec.ts`, and `BlackoutBobPresentation.spec.ts`.
Extend them or add Goop-specific coverage without weakening Bob assertions.

Run the repository commands:

```sh
npm run type-check
npm test
npm run build
npm run test:browser
npm run validate:production
```

Use focused `node --test tests/<actual-file>.test.ts` runs during development.
`test:browser` builds and uses the repository Playwright configuration. Inspect
that configuration before launching another server. For manual production
inspection use `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.
Verify the built asset also loads from a nested deployment path.

Required browser journeys and evidence:

- Containment: normal reveal plus skip/reset, switch Bob ↔ Goop, leave Goop
  parked on a sensor, normal jump/landing, aim/fire/dissolve, tight-camera fade,
  death and retry. No cyan Bob at Goop’s death position and no duplicate model.
- Cultivation: both bodies in different rooms, moving-platform travel, bright
  and dark zones, acid interaction, independent lighting, death/recovery, and
  transition into Blackout.
- Blackout: dark unpowered versus powered lighting, acid aim with Volt still
  visible/useful, merge/split visibility, Goop failure and group recovery.
- Visual sweep: front/side/back and gameplay distance; maximum ripple and
  squash; eye seating; six-spike silhouette; contact/shadow alignment; no large
  forehead gap, sorting artifacts, floating eyes, or glow in unlit rooms.
- Lifecycle/performance: cold entry, first fade/aim/death, pause/resume,
  restart, repeated level transitions, and unload during preparation. Record
  shader-program and warm resource counts, console/WebGL errors, and failed
  requests. A second warmed pass must not grow resources or compile a new
  variant for already exercised states.

Capture short clips for movement, aim transitions, shadows and recovery;
screenshots alone cannot establish those behaviors. Store local evidence under
ignored `artifacts/` or attach it to the eventual review. Distinguish real GPU
measurements from SwiftShader correctness checks. Do not claim performance or
in-game acceptance from the existing Blender validation reports.

Completion means the same authored Goop is used throughout the game, Bob’s
presentation remains intact, all identity/lifecycle checks pass, and the browser
journeys above have evidence. Report files changed, checks actually run,
remaining limitations, and exact reproduction steps. Commit/push/PR actions
remain subject to the user’s delivery instructions.
