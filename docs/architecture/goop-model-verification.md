# Goop runtime integration and verification

The approved `assets/characters/goop/goop.glb` now owns Goop's appearance in
Containment, its Room 5 reveal, Cultivation, and Blackout. Gameplay bodies,
abilities, colliders, progression, and checkpoint positions remain authoritative.

## Implementation

- `src/render/goop/GoopAsset.ts` validates the real static export, metadata,
  finite geometry, approved bounds/counts, closed connected topology, and
  absence of animation, skinning, or studio objects. Imported resources have
  explicit disposal; reflection textures remain borrowed.
- `GoopCharacterPresentation.ts` owns asynchronous loading, interpolation of
  facing/deformation, normal jump/landing responses around the sole, visibility,
  fades, shadows, reflections, recovery, and a green death burst. Concurrent
  preparation is deduplicated; failed loads can retry; late loads after disposal
  release their resources.
- `src/render/slime/GelMaterials.ts` and `GelSecondaryMotionShader.ts` share
  Bob's physical rendering and shadow infrastructure. Bob's public exports,
  defaults, and shader keys are preserved. Goop uses the approved linear green
  palette and optical settings, with zero body emission. Conservative masks
  protect both entire eye seats, the sole, the forelock, and all spike tips.
- The three runtimes route separate Goop movement events, authoritative travel
  snapshots, position interpolation, aim/fade state, death/retry, and disposal.
  Containment has a separately owned reveal instance using the original ending
  positions and timing. Blackout preserves Volt and the merged Specimen.
- `SlimePairPresentation.ts` now owns locators only. The sphere proxy and
  `visuals.goop` are removed. Character preparation includes Goop eye fade
  variants and the first green burst. No additional PMREM is created for Goop.
- Blackout reflection intensity samples Goop's position against the existing
  local point/spot lights. Recovery snaps the next reflection target; ordinary
  changes blend. Neither Goop nor its shader supplies a permanent light source.

The GLB, Blender source, generator/verifier scripts, reports, and intended studio
evidence remain in `assets/characters/goop/`. Python caches are ignored. The GLB
hash is checked against the asset report by the real-export unit test.

## Elastic movement polish

Goop uses Bob's ground response rates, speed hysteresis, turn speed limit, and
brief reversal hold. Facing follows resolved travel continuously with exponential
damping. The former five-degree heading threshold held gradual turns still and
then snapped them forward; damping suppresses small travel noise without those
steps. Fixed-step snapshots interpolate facing and lean between render frames.
Resolved travel plus actual player intent drives a smooth
forward lean; a reversal first counterleans, then turns and settles forward.
Stops and airborne transitions release the lean smoothly. Carrier transport,
passive movement, and position discontinuities do not initiate locomotion poses.

The complete body, eyes, and crest share one sole-anchored transform. Shear moves
the upper body forward without tilting the skirt into the floor. Squash/stretch
preserves volume through reciprocal horizontal spread. No authored vertices,
morphs, material settings, or gameplay collision are changed; culling spheres
include a margin for shear.

Normal takeoff has a short stretch, followed by a velocity-dependent airborne
pose. Landing compression scales with impact speed, releases over 0.24 seconds,
then has a small visual overshoot that settles by 0.42 seconds. The existing
protected gel ripple starts at the contact normal in the presented body's local
coordinates. Damage events in Containment and Cultivation also have a restrained
body reaction. Reset clears the lean, reversal, launch, landing, damage, and
pending ripple state. The supported capsule/release instance retains its resting
silhouette throughout the scripted ending.

All levels supply authoritative velocity and maximum movement speed. Blackout
preserves a separate Goop movement-intent snapshot before the drone clears its
shared movement scratch vector, so Goop's locomotion response works there too.

`tests/GoopCharacterPresentation.test.ts` checks planted contact, volume and eye
seating, interpolated lean, reversal, airborne motion, impact-scaled compression,
recovery, passive travel rejection, directional ripple, and reset. Gradual-steering
regressions check every update and render sample for pauses or jumps and cover
alternating heading noise. The Blackout
runtime test drives actual control and confirms that clearing the scratch vector
does not suppress Goop's lean. `tests/browser/GoopMotion.spec.ts` exercises real
production movement and normal-jump events in deterministic fixed steps, saving
pose screenshots and diagnostics in `artifacts/evidence/goop/motion/`. Its gradual
steering sequence renders at three samples per 60 Hz controller update to verify
smooth facing through the production runtime.

Motion-pass verification: the full unit suite (124 files), 29 focused character,
Blackout runtime and death/recovery tests, type check, production build, and
production layout validation passed. Both the production motion test and the
existing all-level Goop journey passed with zero console errors, WebGL warnings,
or failed requests. Motion poses retained 306 Containment shader programs;
Cultivation and Blackout retained 203 and 73 respectively through recovery.

The continuous-facing follow-up passed 28 character/runtime tests, the production
build, and the expanded browser motion regression. All 30 gradual-steering
updates and 90 interpolated render samples advanced without pauses or heading
jumps, retaining 306 programs with zero console errors or failed requests.

## Verification results, 2026-10-13

| Check | Result |
| --- | --- |
| `npm run type-check` | Passed |
| `npm test` | 124 test files passed |
| Focused character/identity/death checks | 27 tests passed |
| Final preparation/shadow checks | 15 tests passed |
| `npm run build` and `npm run validate:production` | Passed; 27 production files validated |
| Reference `npm run test:browser` suite | 10 passed; 1 unchanged-baseline culling failure described below |
| Final Goop browser journey | Passed, including strict console/WebGL checks and unload during preparation |
| `npm run test:smoke` | Both plain production tests passed at `/group-folder/`, including all-level restarts |

The final recorded journey has zero console errors, WebGL warnings, or failed
requests. Containment's cold, first retry, and second warmed retry all retain
306 programs, 604 uploaded geometries, and 60 textures. Cultivation retains
203 programs through independent bright/dark-room lighting and recovery;
Blackout retains 73 through powered lighting, acid aim, recovery, merge, and
split. First visits to additional rooms/coverage upload existing room resources;
the recorded geometry totals include that work, not just the character meshes.

Goop's burst preparation exposed a PCF sampler mismatch in Cultivation. An empty
isolated draw now initializes the level-owned comparison maps before the burst
draw, restores renderer/layer state, and invalidates the maps for the first real
frame. It avoids uploading unused room geometry. The strict Goop journey and
nested production smoke tests pass after this fix.

Local evidence is in `artifacts/evidence/goop/`:

- `sweep-front.png`, `sweep-side.png`, `sweep-back.png`: clean gameplay-distance
  views of the approved silhouette and seated eyes.
- `whole-game.webm` and `journeys.json`: the complete recorded journey and
  phase/resource/error diagnostics.
- `movement-and-shadows.webm`, `aim-and-fire.webm`, `fade-and-recovery.webm`,
  `powered-lighting-and-aim.webm`, `merge-and-split.webm`: short excerpts.
  `clips.json` records each excerpt's source, start time, and duration.
- `checks/`: retained unit, build, browser, nested-path, and baseline logs.

## Reproduce

```sh
npm run type-check
npm test
npm run build
npm run validate:production
npm run test:browser
npm run test:smoke
```

Focused lifecycle checks:

```sh
node --test --test-isolation=none tests/GoopCharacterPresentation.test.ts \
  tests/GoopIdentity.test.ts tests/GreyboxDeathPresentation.test.ts \
  tests/GelReflectionLighting.test.ts tests/BlackoutLevelRuntime.test.ts
```

For the recorded Goop journey alone, start the production preview and run:

```sh
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
# In another terminal:
SPECIMEN_PRODUCTION_URL=http://127.0.0.1:4174 \
  npx playwright test tests/browser/GoopPresentation.spec.ts
```

The browser test stores screenshots, phase/resource diagnostics, and video under
ignored `artifacts/evidence/goop/`. It exposes production runtime instances only
inside intercepted test bundles. Room changes, release timing, power state, and
merge/split use controlled fixtures; this is rendering/lifecycle evidence rather
than a claim that every puzzle has been solved manually.

## Known reference-suite failure

The Room 1 sticky-wall culling image comparison at
`tests/browser/LevelOneShaderProgramStability.spec.ts:699` reports a maximum
channel difference of 64 against its limit of 20. The same test reports 64 on
unchanged baseline `fed22a0`, built in an isolated directory and run with the
same browser/renderer. The differences are sparse distant pixels above the
vent. This assertion remains unchanged. The other ten reference browser checks
passed, including Bob's lifecycle and program/binding stability checks.

## Evidence limits

The browser renderer is ANGLE Vulkan SwiftShader. These checks establish
rendering correctness and bounded resource/program behavior in that environment;
they do not establish real GPU frame times or weakest-device performance.
Controlled browser fixtures and the unit carrier-motion check do not replace a
manual moving-platform journey, sensor/dissolve puzzle completion, or a sweep of
every narrow passage on a physical GPU. No gameplay tuning or asset resizing
has been introduced to hide possible passage clipping.
