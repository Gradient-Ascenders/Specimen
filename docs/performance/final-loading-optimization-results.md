# Loading preparation and transmission lifecycle fixes

The retained changes in PR #257 improve preparation correctness and resource ownership. **No significant overall loading-time reduction is claimed.** Proposal D opening compiler warmup was rejected and fully reverted; no compiler worker, shader bank, speculative cache, build hook or opening callback remains.

## Production changes

- **Blackout transmission targets:** Three.js retains transmission render targets by scene/camera identity. Hidden research and defeat rehearsals previously used fresh temporary cameras on every initialization, leaking two targets per load. `withRetainedCameraView()` borrows the retained gameplay camera identity only for synchronous draws, copies the authored cinematic view, and restores projection, transforms, layers, rendering flags and reference ownership in `finally`. Compilation still uses the authored views. The gameplay target extent is restored before the existing final fence and player control.
- **Containment plaque preparation (A):** Include the plaque in the existing Room 4 shader compile subset so its required program is prepared before readiness. Live scene drawing and material quality are unchanged.
- **Clipping-seed preparation (B):** Resolve tiny clipping-state seed programs before expensive scene submissions while retaining per-group seeds and real readiness checks. No forced-ready result or Three.js private-cache change is introduced.

Original implementation commits: `9bd9d8c` (validated original `fcfc409`), `5f04fc6` (A from `52d58ca`), and `f8ba542` (B from `51f8723`). Investigation branches and historical evidence remain available in Git history. The removed detailed reports and measurements are preserved at [pre-cleanup commit 9aff76a](https://github.com/Gradient-Ascenders/Specimen/tree/9aff76add992543ae04dd6c0d3a086370e754549/docs/performance).

## Regression checks

`ClippingRestoration.spec.ts` is a correctness test on the default SwiftShader configuration and on native WebGL. Both parallel-compilation modes must lose/restore the context, allocate a new native program identity, preserve the entire pixel buffer, display the expected red/green pixels, actually clip the opposite side, and return zero GL errors. The renderer name is attached to the test result; it is not a hardware precondition. No browser configuration or production rendering behavior is changed for this test.

`BlackoutTransmissionLifecycle.spec.ts` verifies three real load/menu cycles, stable Three.js/native texture and renderbuffer counts, the retained target's prepared/gameplay identity and full expected extent. Its Medium/High cancellation cases verify complete camera restoration, zero GL errors, serial cancellation and teardown. Unit tests cover camera state/reference ownership on exceptions and pending callbacks, plus clipping seed order/readiness. Existing research and defeat cinematic journeys cover the authored presentations. Native runs of the same correctness tests remain useful supplementary coverage; timings from software rendering do not qualify hardware performance.

Run the focused software cases without native environment overrides:

```text
npx playwright test tests/browser/rendering/ClippingRestoration.spec.ts --project=rendering
npx playwright test --project=rendering
```

For supplementary native coverage set `SPECIMEN_BROWSER_CHANNEL=chrome` and add `--headed`. Check the attached renderer identity when using the result for hardware qualification. Keep GPU runs serial.

## Reusable native diagnostics

- `trace-texture-ownership.mjs` observes allocation/deletion and render-target owners without retaining GL objects; it is also imported by the permanent lifecycle regression.
- `investigate-texture-cycles.mjs CYCLES OUTPUT standard|high` exercises arrival, restart, death/retry, menu and re-entry on a production preview at port 4173. It rejects software GPUs, records build/GPU identity and saves native object/target counts. Counts are not VRAM bytes and no forced GC is used.
- `blackout-context-recovery.mjs OUTPUT [URL]` is the strict native forced-loss diagnostic. It deliberately fails on GL errors; it does not accept the known old-context cleanup limitation to manufacture a pass.

Prior accepted native validation recorded ten Medium and two High cycles with 94 gameplay / 10 menu renderer textures and 14 native textures / 4 renderbuffers at menu, without growth. At 640×360, the prepared gameplay target was 320×180 Medium and 480×270 current High. Shader/camera comparisons and full research/defeat journeys passed in the original leak-fix investigation. These historical results do not replace validation of later integration changes.

## PR review update and current validation

Kevin's reproduced default-browser failures came from rejecting SwiftShader before checking correctness. The hardware rejection has been removed from that correctness test and the pixel assertions strengthened. Large generated JSON evidence, redundant reports, one-off screenshot comparison/capture tools and superseded benchmark summaries were removed from the PR; history and existing investigation branches remain intact. The three diagnostics above retain ongoing regression/maintenance value.

Merged main `ecfd2d4260345b48351b0e57f1b6b626efd4f749` (PR #258: credits/attribution and its UI/media expectations) normally in `f5a1eed8dc11a41006dbdf507ecb8e529fa52f7d`, without conflicts or rewriting published history. Main's four changed files match upstream exactly. The four approved production files still match `9aff76a` exactly.

- Default SwiftShader clipping regression: **2/2 passed**, including actual clipping pixels and exact restoration, with no native browser environment overrides.
- **589/589 unit tests**, type checking, production build and 205-file layout validation passed. An initial sandbox ZIP-rename EPERM passed on rerun outside that filesystem sandbox; no test or archive implementation was changed.
- The unchanged full generated-assets command passed in an export matching committed LF bytes. The ordinary CRLF Windows checkout still exits nonzero at the inherited lighting text comparison. No generated assets or check rules were changed.
- The full default rendering project is checked through the existing Browser regressions workflow (`suite=rendering`, default Chromium/SwiftShader, four CI shards), with an independent current-main run for comparison. The initial local run reproduced screenshot/input/wake timing failures in existing acid/Bob journeys; it was stopped while case 5/73 was running after the user approved completing the full suite in CI. The focused clipping cases above passed independently. Full-suite status, baseline comparisons and supplementary native/cinematic/transition results are recorded in PR #257 before re-review; no all-project green claim is made here.

## Limitations

The inherited Windows generated-assets failure is an exact-text comparison against CRLF checkout bytes. Committed bytes are LF. The unchanged complete check passed on Ubuntu CI and a committed-LF export before this review; current integration results are recorded above. No generated content or validation expectation has been changed to hide a failure.

Previously reproduced unrelated limitations include old-context GL cleanup during forced Blackout in-place recovery, a missing `distant-shaft-bottom` object in the boss fixture, and the global reduced-transmission-scale fixture's .5 expectation where main uses .75. They remain distinct from ordinary cancellation and the isolated clipping recovery probe. No Ubuntu lab GPU, exhaustive forced-loss matrix or full legal human playthrough qualification is claimed. Existing bundle-size and inherited Vite development-tool audit warnings are outside these production fixes.
