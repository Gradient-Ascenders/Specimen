# Blackout cinematic transmission retention fix

Status: focused production fix, locally committed for review. No opening warmup or other loading optimization is included.

## Repository boundary

Fetched `origin/main`; it remains **e1c92bc**. Branch: `codex/fix-blackout-cinematic-transmission-leak`, created from that main. Phase 2 (`codex/level-loading-phase-2-implementation`) and Phase 3 (`codex/investigate-level-loading-phase-3`, **578c9b5**) and their evidence remain intact. No unmerged Phase 2 production changes were imported.

Only two production files change: `src/levels/BlackoutLevelRuntime.ts` and the new `src/render/RetainedCameraView.ts`. Research/defeat timelines, camera tracks, shots, shaders, materials, lighting, physics, input and level-transition ownership remain authored as before. No Three private cache access, persistent cache or additional runtime is introduced.

## Cause and reproduction

Three 0.185.1 stores transmission targets under the persistent scene's render state, indexed by `camera.id`. The two temporary cameras created by `BlackoutResearchFinale.primePresentationFrames()` and `BossDefeatFinale.primePresentationFrames()` were passed to real hidden draws. Each new Blackout load therefore added two native texture allocations and six renderbuffers to that scene's retained target map. Removing the runtime root did not remove the persistent `RenderLayer.scene` or its camera-ID entries.

Reviewed Phase 3 allocation stacks, target identities and phase-tagged ownership. Its original ten-cycle trace showed gameplay textures **96→114**, menu textures **12→30**, and **20** surviving tiny transmission textures / **60** associated renderbuffers without target disposal.

Before changing production, repeated two native cycles on current main: gameplay **96,98**, menu **12,14**. At the second menu, four surviving 8×4.5 logical-size transmission textures were attributed to research/defeat rehearsals. The new actual-game browser regression also failed on the unfixed build's increasing texture sequence; it uses native allocation/deletion observation as well as renderer counters.

## Implementation

The cinematic functions continue to author their temporary cameras and mutate/restore their own scene state serially. Compilation still uses those exact authored views and the existing cache. Only the synchronous shadow-sampler/hidden render section borrows the **existing gameplay camera identity**.

`withRetainedCameraView()` copies the authored perspective view onto the retained camera with recursive copying disabled, executes the draw and restores the rig camera in `finally`. Three's copy contract preserves transforms, matrices/inverses, projection, near/far/FOV/zoom, view offset, film parameters, coordinate system, layers and update flags. The helper also handles viewport, which Three does not copy, and restores the original viewport/view-offset/pivot/metadata/animation references. Camera ID/UUID, parent and children stay owned by the rig. No borrowed camera state crosses an await; throwing draws restore it too. The live cameras used here are unparented.

The existing 16×9 bounded rehearsal viewport remains. Reusing the gameplay camera consequently shrinks its transmission storage during these hidden shots. After both cinematic owners restore their worlds, one isolated already-prepared transmissive mesh re-primes the target at the **gameplay viewport and selected transmission scale**. This avoids a full-world draw and ensures gameplay does not inherit the tiny buffer or perform its resize on first control. The original final GPU fence, hidden loading mask, compilation joins, all actual rehearsal shots and cancellation checks remain in place.

On cancelled preparation, the existing generation/current guards prevent further draws and the final resize; the camera has already been restored synchronously. The target belongs to the retained renderer/scene/camera, rather than to a temporary rehearsal camera. Context handling is not replaced by a new resource owner.

## Native lifecycle results

Native Chrome 156 / ANGLE D3D11 / Intel UHD 620 on this Windows laptop. No software renderer, forced GC or concurrent GPU benchmark. Lifecycle viewport 640×360, one-second settled gameplay/title samples; original load → real arrival → restart → death/retry → menu protocol. Arrival/death fixed updates are accelerated through the existing test helpers; this is not a legal full puzzle playthrough. Existing background workload remains uncontrolled.

| Capture | Cycles | Gameplay textures | Settled menu textures | Live native menu textures / renderbuffers |
|---|---:|---|---|---|
| Phase 3 original baseline | 10 | 96,98,…,114 | 12,14,…,30 | Linear retained transmission slope; 20 textures / 60 associated buffers after ten cycles |
| Fresh main reproduction | 2 | 96,98 | 12,14 | 16/10 → 18/16 |
| Fixed Medium | **10** | **94 every cycle** | **10 every cycle** | **14/4 every cycle** |
| Fixed High | 2 | **94,94** | **10,10** | **14/4,14/4** |

The native tracer includes four persistent GL fallback textures outside `renderer.info.memory`; its absolute count is not expected to equal Three's counter. The important result is that both counters and independently observed native live sets stabilize. Geometry warms from 884 to 894 in gameplay, then stabilizes; settled title geometry/program counts remain 12/13.

For the fixed Medium trace:

| Settled menu | Textures created / deleted / live | Renderbuffers created / deleted / live |
|---|---:|---:|
| Cycle 1 | 158 / 144 / 14 | 16 / 12 / 4 |
| Cycle 10 | 1,463 / 1,449 / 14 | 151 / 147 / 4 |

Each later cycle creates and deletes **145 textures and 15 renderbuffers**, with no continuing residual. No tiny research/defeat transmission allocation survives at the settled menu. One legitimate retained gameplay-camera transmission target remains. Three emits `target.dispose` on resize too; native handle deletion/replacement, not a dispose-event timestamp alone, establishes the corrected lifecycle.

The live target is **320×180 at Medium (scale .5)** and **640×360 at High (scale 1)**. Each prepared-before-Enter sample and gameplay sample has the same target texture allocation ID and expected dimensions. Thus the first visible gameplay draw does not restore a shrunken target or lower refraction quality. The new browser regression asserts the same before/after-Enter identity and dimensions in addition to the three-load plateau. Counts/dimensions are not estimates of driver memory or VRAM bytes.

## Visual, shader and cinematic verification

Captured 15 actual gameplay/research/ending frames per profile before and after, at native 960×540. Views include the research gallery, blackout, chase, fusion smoke, arena, glass break and boss handoff; defeat includes broken boss, balanced beams, explosion, regroup, collapse, daylight and credits. PNG contact sheets and original frames are under `artifacts/blackout-transmission-fix/`. Both profile contact sheets and the differing live boss frame were visually inspected.

All sampled retained program key/vertex/fragment fingerprint sets match: **zero missing or extra programs** in all 30 before/after pairs. Cinematic camera positions, quaternions, layers and projection matrices match exactly at authored samples. The initial live gameplay pose differs by less than 0.000001. **11/15 images per profile are pixel-identical**. The remaining live gameplay/handoff/regroup/daylight samples have small differences; these are not described as universal pixel identity. The largest difference is the High first live boss frame (0.560 mean channel delta on 0–255, 0.753% of pixels over eight levels), including a live attack/light change. All other mean deltas are below .029. The camera and program sets still match.

The first live boss attack uses the existing `FinalBossController` random source. To compare the same gameplay state, repeated the High captures on unmodified main and the fix with that source set to the same fixture value (`--deterministic-boss`). Both enter the same `gun-blast` telegraph at elapsed zero; the **boss-handoff PNGs are byte-identical**, with identical shader coverage. This controls the differing attack-warning state without changing any production gameplay or presentation code. Original uncontrolled captures and their differences remain in the evidence.

The unchanged full research and defeat browser journeys pass, including their rehearsal-completion, shot/effect, loading-mask, handoff, pause/skip and audio expectations. No cinematic timing constant or audio code changed. The resource trace also repeatedly exercises normal Level 3 entry, restart, death/retry, return to menu and re-entry. Boss progression/attacks are exercised by the existing integration fixture up to its separately reported stale scene lookup and by research→boss→defeat frame captures; no complete legal boss fight is claimed.

## Automated verification and existing failures

Passed: **548/548 unit tests**, including two new camera-state/ownership/error/pending-operation tests; `npm run type-check`; `npm run build`; `npm run validate:production` (205 files). The build keeps its existing large-chunk warning. Diagnostic evidence assertions verify all ten Medium / two High cycles, balanced native counts, full gameplay target size/identity and exact sampled shader coverage.

The initial native browser matrix had three passes (new actual-game lifecycle regression, full research and full defeat) and four failures. Existing expectations were not edited:

- `FinalBoss.spec.ts:362` reads `.position` on `getObjectByName('distant-shaft-bottom')`; that named object is absent from current main's authored scene/source.
- `TransmissionResourceSwitch.spec.ts:124` assumes every reduced-transmission level uses .5. Current main's general policy is .75; Blackout requests its own .5 cap. The fixture collected all 12 mode samples without captured errors, but fails the global-scale assertion.
- The newly added forced in-place context-recovery probes, Medium and High, restore camera state and finish cancellation cleanly but report `GL_INVALID_OPERATION` (1282) after re-preparation. No error is accepted or cleared to make that check pass.

All four failures were rerun against an isolated build of **original main e1c92bc**, with the runtime temporarily restored and `git diff --exit-code origin/main -- src` verified before building. The unused new helper was not imported by that build. Its output was served separately on port 4175; the fixed preview remained on 4173. The fixed source was restored byte-for-byte immediately after the baseline build. All four cases failed again at the same assertions/lookups. Logs and traces are preserved under `main-browser/`; no existing fixture or expectation was changed.

The context traces specifically report old-context `deleteVertexArray`/`delete` objects during re-preparation/disposal. The standard-profile fixed/main traces have the same 124/132 warning counts. A strict standalone `blackout-context-recovery.mjs` probe retains this failing scenario outside the default browser suite and still exits nonzero on any GL error. More detailed boundaries on the fixed build show zero before loss/after restoration and after the resumed draw, but 1282 after re-preparation and cancellation cleanup, in both profiles. This is **not** a context-restoration qualification pass. Repairing the independently reproduced old-context cleanup is a separate renderer-lifecycle issue; no workaround is mixed into this fix.

The final default regression file has **3/3 native passes**: the three-load texture/renderbuffer plateau and full target extent before Enter, plus ordinary-context re-preparation/cancellation at Medium and High. Cancellation occurs at the real awaited research rehearsal callback after its real draw; each case restores camera state, performs only one callback, unloads, restores canvas visibility and records zero GL errors at every checked boundary. Two new unit tests additionally cover full camera state/reference ownership on a thrown draw and restoration before a pending operation can yield. Together with the two passing unchanged cinematic journeys, five focused browser cases pass; the two unchanged boss/scale fixture failures and the strict forced-loss diagnostic remain explicitly reported above.

## Evidence and reproduction

[Compact native/visual evidence](blackout-transmission-leak-fix-evidence.json) records raw SHA-256 identities, build/asset manifests, allocation/deletion balances, target owners/extents, phase counts, camera state and image/source comparisons. Raw reports, native screenshots, browser traces and logs remain ignored under `artifacts/blackout-transmission-fix/`.

Build/serve production on port 4173. Reproduce the lifecycle with `node scripts/diagnostics/investigate-texture-cycles.mjs 10 OUTPUT standard`; the fourth positional argument selects `high` for the supplementary run. Capture actual authored views with `blackout-transmission-views.mjs OUTPUT standard|high [URL] [--deterministic-boss]`. Use the bundled Pillow runtime for `compare-blackout-transmission.py artifacts/blackout-transmission-fix`, then regenerate compact evidence using `summarize-blackout-transmission-fix.mjs ARTIFACT_ROOT OUTPUT.json`. The strict forced-loss probe is `node scripts/diagnostics/blackout-context-recovery.mjs OUTPUT [URL]`; its existing 1282 failure is intentional evidence, not a passing check. Run GPU commands sequentially. The new regression file runs with `npx playwright test tests/browser/rendering/BlackoutTransmissionLifecycle.spec.ts --project=rendering`; the recorded native runs set `SPECIMEN_BROWSER_CHANNEL=chrome` and used `--headed`.

No Ubuntu/other-GPU/browser qualification, peak VRAM measurement, exhaustive forced-loss timing matrix or full legal playthrough is claimed. The in-place context-restoration limitation is stated above. No production renderer cache policy, gameplay rule or existing test expectation is weakened. Proposal D remains untouched. No push, PR or merge; stop for review.
