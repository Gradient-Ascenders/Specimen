# Volt model integration specification

Replace every production Volt sphere with the approved authored model: captive
Volt in Cultivation's moving pod, rescued/playable Volt in Cultivation, and
Volt throughout Blackout. Preserve his golden living-gel appearance, seated
black eyes and thick asymmetric lightning crest. Use the supplied morphs for
restrained motion, with the same lifecycle quality as Bob and Goop.

Implement the complete runtime journey, not only a GLB loader or debug scene.
The asset and review tooling are committed in `8d192b4`. The separate
`tools/volt-preview.html` review build is a visual reference, not a production
integration or gameplay acceptance test.

## Scope and gameplay authority

`KinematicBody`, `SlimeManager`, the persistent group, progression, level
controllers, checkpoint systems, `VoltElectricalSystem` and the maintenance
drone remain authoritative. Consume their state and events without changing
collision radius, movement/jump tuning, mounting, aim rays, target acquisition,
beam/socket origins, tether rules, damage or recovery positions. The collider
stays the existing 0.45 m sphere even though the gel and crest extend beyond it.

Volt keeps normal jumping and electrical ability. Do not add Bob's charged
jump, adhesion or physical rebound, or Goop's acid/dissolve behavior. Keep the
global pre-rescue roster locked; Cultivation rescue and Blackout's level-owned
definitions remain the routes to availability. Containment must not acquire a
playable Volt or unnecessary Volt asset loading.

Do not redesign the approved body, eyes or crest, sharpen it back into a blade,
add a second body shell, floating sparks, halos or permanent decorative arcs.
Preserve the existing functional electrical beam, target feedback and UI.
No Blender studio objects or compositor are imported into the game.

## Approved asset contract

Load `assets/characters/volt/volt.glb` through a Vite-managed URL, following
`GoopCharacterPresentation.ts`; never use root-relative `/assets/...` paths.
Keep the Blender source, generator, verifier and validation reports intact.

The approved GLB SHA-256 is
`4e1d5d7d6ea3f368e96cbc0d13ff6b1a232a7d9154e73602ee54f809ec6d2807`.

| Contract | Value |
| --- | --- |
| Root and children | `Volt`, containing `Volt-Body`, `Volt-Eye-Left`, `Volt-Eye-Right` |
| Root asset metadata | `asset: volt-lightning-gel-v3` |
| Axis metadata | `local_up: +Z Blender / +Y glTF`; `local_forward: +Y Blender / -Z glTF` |
| Runtime orientation and contact | +Y up, -Z forward; local sole Y=-0.45 m |
| Neutral body bounds | Min `(-0.649974, -0.45, -0.527022)`, max `(0.68208, 1.34, 0.541015)` m |
| Body topology | 16,034 vertices, 32,064 triangles, 96,192 indices |
| Each eye topology | 1,538 vertices, 3,072 triangles, 9,216 indices |
| Total | 38,208 triangles; three primitives, two visible materials |
| Materials | `Volt-Golden-Gel`, `Volt-Obsidian-Eyes` |
| Embedded maps | Two 2×512 PNGs: continuous emission and metallic/roughness |
| Morph targets on every mesh | `Squash`, `Stretch`, `Blink`, `CrestFlexLeft`, `CrestFlexRight`, all initially zero |
| Other content | Identity transforms; no bones, skins, clips, lights or cameras |

Implement `src/render/volt/VoltAsset.ts`. Validate the actual imported hierarchy,
metadata, counts, finite positions/normals, indices, bounds, contact, UVs,
materials, textures and all five morph dictionaries. Derive connectedness and
closed manifold topology from indexed geometry, not just metadata. Account for
legal zero/sparse morph accessors. Use the exact Volt metadata, not Bob or Goop
contract strings. Validate relative morph position/normal attributes and retain
them when replacing materials. Read exact eye bounds from `volt.validation.json`.

Extend `tests/VoltModelAsset.test.ts` and add a real-GLB loader fixture, following
`tests/fixtures/GoopAssetFixture.ts`. Check committed generator/source hashes
and the GLB hash separately from editable `.blend` byte identity. The 6,817
approved lower-body vertices and neutral eye geometry must remain unchanged.

## Presentation and resource ownership

Create `VoltCharacterPresentation.ts` and `VoltMaterials.ts` under
`src/render/volt/`. Reuse the established presentation boundary and shared
`GelMaterials.ts`, reflection, fade, shadow and burst infrastructure. Do not
copy Bob's entire class, wall-state machine or morph vocabulary.

Provide `prepare`, `ready`, `setPosition`, `setYaw`, `update`, `present`,
`setVisible`, `setOpacity`, `setShadowCasting`, `setReflectionEnvironment`,
`setReflectionIntensity`, `prepareCameraFadePrograms`, `onLaunch`, `onLanding`,
`startDeath`, `updateDeath`, `finishDeath`, `reset`, `diagnostics` and `dispose`,
plus death-resource preparation matching the current Goop implementation.

Use a `player-slime-volt-presentation` root so room preparation can discover it.
Separate world placement, character-facing/deformation and burst state. The
level-owned Volt light must follow interpolated placement without inheriting
crest flex, squash or facing. Hide character geometry during first-person aim
without hiding the level-owned light or functional electrical presentation.

Preparation must deduplicate concurrent loads, be retryable after failure and
honor visibility, opacity, shadow and reflection requests made before readiness.
Await it through the normal level loading/error path. A late result after
disposal must release resources without attachment. Arm construction rollback
before attaching roots or subscribing to events. A permanent sphere fallback
does not satisfy completion.

Each instance owns mutable mesh/morph state and its materials. Captive and
playable Volt must not share live morph weights or reparent one live instance
between levels. If geometry/maps are cached, define reference-counted ownership;
otherwise load independent instances. Keep gradient maps alive when disposing
replaced imported materials. Release each owned texture, geometry, material and
shadow variant once, but never dispose a borrowed level reflection environment.

## Golden gel and lighting

Use a Volt-specific shared-gel material profile. Preserve the continuous UV
ramps rather than replacing them with a uniform glow or stepped material bands.
Treat imported values as initial look-development settings:

| Setting | Initial value |
| --- | --- |
| Linear body color | `(1.0, 0.72, 0.003)` |
| Metalness and IOR | 0 and 1.38 |
| Body roughness | Map supplies 0.18–0.28; retain factor 1 with the map |
| Clearcoat and coat roughness | 0.32 and 0.12 |
| Transmission | 0.55; tune against actual gameplay lighting if needed |
| Warm emission | Map and imported factor approximately 0.95; effective body-to-crest ramp approximately 0.30–0.95 |
| Linear eye color | `(0.004, 0.0025, 0.001)` |
| Eye roughness and clearcoat | 0.16 and 0.35 |

Handle color space explicitly: emission texture is sRGB; roughness data is
non-color, uses the green channel, and must not be multiplied by 0.18 again.
Keep UVs attached to the morphing surface and retain clamped map sampling.
Use the shared physical material's optical-volume defaults as an initial runtime
profile, then document any tuning. Keep one closed body surface and FrontSide
rendering unless a measured defect justifies an exception; the imported
double-sided flag is not an instruction to add an extra runtime body pass.

Volt is intentionally self-lit, unlike Bob and Goop. Maintain a brighter crest
and readable golden body/black eyes without washing the whole silhouette into
white or peach. Evaluate bright Cultivation and powered/unpowered Blackout at
the game's exposure and camera distances. Do not add global bloom, change
global exposure, brighten other characters or introduce new light types.

Keep Blackout's existing `blackout-volt-foundation-light`: color `0xffdf75`,
range 8 m, decay 2, intensity 2.2 in foundation mode or 16 in authored Room 1,
non-shadow-casting. Preserve the pod's separate existing light and its shadow
policy. Borrow the existing level reflection environment and resolve reflection
weight at Volt's own position, not whichever character is active. Dark-room
reflection must not become an always-on bright fill.

Distinguish transmission from camera opacity. Fade body and both eyes together,
retain stable body transparency/depth-write policy and prewarm the eye's
opaque/faded variants. Restore full opacity on aim exit, switching, death
recovery, restart and level handoff. Fades must not extinguish Volt's navigation
light during ordinary aim.

## Morph motion and event routing

Resolve target indices by name on each mesh and apply the complete weight set
to all three meshes every update/reset. Do not assume a shared dictionary index
or update only the body. Clamp weights to 0–1; never combine opposing squash
and stretch or opposing left/right flex. Do not add a second transform-scale
squash on top of the authored morph.

At weight 1, `Squash` shortens height by 10%, `Stretch` lengthens it by 9%, and
both preserve the sole while compensating horizontal volume. `Blink` compresses
eye height to 13% and reseats the lenses; the body's Blink target is a no-op.
Crest flex affects only the upper head/crest, with at most 0.065 radians of
bend. These are test limits, not mandatory idle amplitudes.

Use restrained normal-jump takeoff/landing responses, occasional blink and
small acceleration/turn-driven crest lag. Start with ordinary body weights at
or below 0.5 and flex at or below 0.5; allow full blink. Make timing deterministic
and pause-aware, use fixed-step state and render interpolation, and settle
exactly to neutral. Idle Volt must not constantly bounce or swing his crest.

Use self-propelled `KinematicBody.locomotionPosition`/intent for locomotion and
facing. Moving-pod/drone/platform transport, parking, switching, teleport,
checkpoint restore and respawn must not generate artificial run or jump motion.
Mounted Volt follows the authoritative rider body and preserves his planted
support. Electrical aim may guide visual facing without changing aim authority.

Add Volt-specific movement event routing in Cultivation and Blackout. Blackout
currently supplies movement buses only to Bob and Goop; wire Volt explicitly.
Never animate another identity's model from Volt's launch, landing or damage.

Protect the sole, rounded tip and complete eye-seat regions if adding shared
secondary shader motion. The eye perimeter is embedded only 2 mm; do not apply
unmasked body displacement that exposes or swallows it. Matching visible,
depth and distance passes must evaluate the same morphs and any secondary
deformation. Share live uniforms and advance time only once. Test permitted
combined blink/body/flex states for seating, positive volume, finite geometry
and no collapsed or inverted faces. Expand render bounds conservatively for
morphs, never the gameplay collider.

## Integration points and lifecycle

| Location | Required change |
| --- | --- |
| `CultivationLevelRuntime.ts` | Replace `voltVisual`; add Volt preparation, event routing, interpolation, per-body lighting, fades, death, recovery and disposal. Cover normal and shortcut rescue registration. |
| `LevelTwoRoomFiveGreybox.ts` | Replace the `captiveVolt` sphere with an authored presentation anchor attached to the moving pod; preserve pod transforms, light, controller timing, glass/collision and release visibility. |
| `CultivationVoltPodArt.ts` and room presentation | Keep pod dressing/hidden collider material ownership intact; do not create a second captive sphere/model. |
| `BlackoutLevelRuntime.ts` | Replace `visuals.volt` and direct single-mesh material access; preserve electrical, drone, camera and specimen-form authority. Route all Volt lifecycle state through its presentation. |
| `CultivationPreparationQueue.ts`, `BlackoutPresentationPreparation.ts`, `PrepareCharacterCameraFades.ts` | Prepare hidden/captive/playable, morph, transmission, fade, shadow and burst variants before first use. Preserve cancellation and renderer-state restoration. |
| Existing runtime/browser/shadow tests | Update intentional old sphere locators to presentation capabilities without weakening gameplay, light, recovery or resource assertions. |

Cultivation must show the authored captive model throughout pod motion and the
release sequence, then exactly one playable model after rescue. Keep captive
casting disabled so the internal pod light is not eclipsed. Preserve existing
playable caster/receiver policy. Reset before rescue must relock/hide playable
Volt and restore the captive model; recovery after a rescued checkpoint must
restore the correct instance and active identity. Include the normal handoff
to Blackout and debug/shortcut paths; do not rely solely on shortcut evidence.

Blackout begins with Volt active in authored Room 1. Cover passive/active
switching, normal jumps, low maintenance vents, drone mount/dismount and moving
support, powered/unpowered areas, electrical aim and retained tether across
switching. Fit the visual within existing passages without changing collider
or route geometry. If the approved crest causes substantial clipping that
cannot be solved with bounded presentation, report it with evidence rather
than silently shrinking or remodeling the whole character.

During merge/specimen control, hide the separate Volt character and its light
according to the existing form rules. Split restores the same live presentation
at the recovered/interpolated body position, with no stale aim, morph, fade or
death state. Preserve the merged Specimen's existing model, light and attacks.

Volt owns a warm-yellow death burst through the shared burst infrastructure.
Route start/update/finish once at Volt's authoritative position; keep Bob and
Goop unaffected. Replace Cultivation's Volt use of `nonBobBurst` to prevent
double bursts. Guard death visibility against subsequent fixed/render updates.
Retry, checkpoint recovery and restart reset all weights, motion histories,
opacity, facing interpolation and secondary/death state. Electrical/drone
transient cancellation stays with existing gameplay owners. Pause freezes
motion; unload and construction failure detach roots/listeners and dispose
owned resources safely, including during unresolved loading/preparation.

## Preparation and diagnostics

Await authored assets before level preparation. Mark Volt eyes with the shared
`cameraFadeEye` capability recognized by existing prewarm paths. Preserve morph
attributes, dictionaries and influence arrays on compilation proxies. Include
actual shadow/PCF, transmission, faded-eye and first-death variants rather than
waiting for first gameplay use. Keep the current isolated-resource preparation
and comparison-map initialization; do not reintroduce PCF sampler mismatch or
advance gameplay while prewarming.

Expose readiness, names/counts, all five weights per mesh, opacity, requested
visibility, death state, facing/motion state, reflection targets and shadow
state through presentation diagnostics. Use those diagnostics in tests instead
of introducing a new production global probe.

The normal budget is three primitives/two visible materials per Volt instance,
plus bounded transmission/shadow passes. Do not allocate geometry, materials,
textures, maps or particles per frame. Reuse the level PMREM. A second warmed
journey must not compile new variants or grow retained resources for states
already exercised; keep existing Bob/Goop program-stability checks intact.

## Implementation order and acceptance

1. Implement the real-asset validator, injected-loader tests and presentation
   lifecycle, including failure/retry and late-load disposal.
2. Add the golden gel profile, retained gradient maps, morph driver, shadows,
   fades and burst; verify neutral and combined deformation.
3. Integrate Cultivation captive/rescue/playable instances and all recovery
   paths, then Blackout electrical/drone/form/death paths.
4. Complete hidden preparation, diagnostics and ownership; remove obsolete
   Volt sphere constructors, mesh/material assumptions and duplicate bursts.
5. Run focused tests, the full suite, production build and browser journeys.

Add tests for real GLB validation and malformed contracts, retained texture
color-space/channel behavior and disposal, async lifecycle, independent
instances, all-mesh weights/reset, fixed sole, legal blended poses, pause,
carrier-independent motion, launch/landing identity, visible/shadow agreement,
fade/aim/light separation, death/retry, rescue visibility and merge/split.
Extend `RoomFive.test.ts`, `CultivationLevelRuntime.test.ts`,
`CultivationBlackoutShadowCoverage.test.ts`, `BlackoutLevelRuntime.test.ts`,
`BlackoutRoomOneRuntime.test.ts`, and relevant preparation/program tests.
Retain `VoltElectricalSystem.test.ts`, `VoltElectricalPresentation.test.ts`,
`MaintenanceDrone.test.ts` and traversal regressions unchanged in intent.

Run the repository commands and record actual results:

```sh
npm run type-check
npm test
npm run build
npm run validate:production
npm run test:browser
npm run test:smoke
```

Read the Playwright configurations before starting servers; browser suites own
their production preview server unless explicitly configured otherwise. Verify
that the shipped Volt GLB loads from the nested deployment path, not only the
root-relative development preview. Add Volt production-browser coverage using
the existing runtime-exposure fixture conventions, plus ordinary shipped-page
smoke coverage without route injection.

Required browser evidence includes:

- Cultivation moving pod, normal release and handoff, checkpoint before/after
  rescue, restart, and a Volt failure/retry without duplicate or stale models.
- Blackout cold entry with Volt active; 3.5/5.2/7 m camera views; bright/powered
  and unpowered lighting; switch among all three slimes; normal jump/landing;
  electrical aim/release and tether persistence; drone mount/flight/dismount;
  low vent traversal; merge/split; death/retry and checkpoint/restart recovery.
- Front/side/back readability, black eye seating through blink and combined
  motion, rounded gel crest and grounded shadows. Record clips for movement,
  aim, carrier travel and recovery; static screenshots cannot prove timing.
- Pause/resume, repeated level transitions, unload during preparation, first
  fade/aim/death and a second warmed pass with stable program/resource counts.
  Fail on uncaught/console errors, WebGL sampler/context warnings, failed
  requests or missing assets.

Store new captures/logs under ignored `artifacts/` or external review artifacts.
The existing asset/preview checks establish geometry and software-rendered
fixture behavior, not production gameplay or real-GPU performance. Report
hardware measurements separately and leave untested journeys explicitly open.

Completion requires the authored model everywhere Volt is actually shown,
preserved gameplay and roster contracts, complete lifecycle/preparation, and
evidence for the journeys above. Deliver a concise verification note with
changed files, checks run, reproduction steps and remaining gaps. Do not push,
open a PR or merge unless separately requested by the user.
