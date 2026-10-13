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
