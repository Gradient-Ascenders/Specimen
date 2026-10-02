# Issue #169: Room 1 real-shadow proof

Local implementation and evidence for [#169](https://github.com/Gradient-Ascenders/Specimen/issues/169), part of [#168](https://github.com/Gradient-Ascenders/Specimen/issues/168).

## Visual evidence

Open [the matched comparison viewer](compare.html), or compare the individual
[shadow-off standing view](iris-xe/standing-off.png) and
[shadow-on standing view](iris-xe/standing-on.png). Nine pairs cover standing,
movement, charging, jumping, landing and four existing hatch API states.
The harness freezes simulation and camera for each pair, changes only the
scoped renderer request, and asserts identical camera and morph weights.
It uses the actual production bundle, instrumented only as served to the
capture browser. WASD/Space use the normal input and kinematic controller.

Agent visual inspection found coherent pedestal occlusion and Bob's projected
floor shadow, with readable cyan gel and traversal surfaces and no obvious
speckling in the reviewed views. Static source transforms, color and exposure
are unchanged. The shadow offset follows the key behind/above Bob. Small
secondary silhouette/contact differences remain #170; these captures do not
establish final deformation correctness. Human visual acceptance is pending.

**Hatch limitation:** this checkout exposes hatch lighting and egg-art state
APIs, but has no native hatch sequence. The four captures are explicitly staged
API views from the gameplay camera, not an end-to-end cutscene or cutscene
camera validation. Actual hatch-sequence acceptance remains pending that
sequence and its review. There are no gameplay or cutscene timer changes.

## Representative hardware baseline

Captured 2026-10-01T13:55:41.238Z using Chrome 154.0.8037.58 in an isolated
Windows headless session, with physical Intel Iris Xe (`0x46A6`) through ANGLE
D3D11, driver `32.0.101.7085`. Host: Intel Core i7-12800H, Windows 11 Pro
`10.0.26200`. The NVIDIA adapter was not used. This is physical-GPU evidence,
not software-renderer timing; a headed traversal remains for #173.

Viewport/drawing buffer `960 × 600`, browser/effective DPR `1`, cap `2`, FOV
`48°`, exposure `1`. Camera/light transforms, map configuration, each captured
pose and all raw metrics are in [measurements.json](iris-xe/measurements.json).
The camera is the ordinary gameplay camera, approximately 3.5 m from Bob.
The fixed standing baseline uses the existing key at `(0, 6.4, -0.5)`, target
`(0, 1.65, -0.5)`, color `#d9efff`, intensity `62`, angle `0.48`, penumbra
`0.72`, range `10 m`; map `1024²`, near `0.35 m`, bias `-0.0001`, normal bias
`0.015 m`, PCF radius `1.5`. Both fluorescent lights and the room fill remain.

Warmed off/on/on/off order, 60 samples per block. GPU timings use
`EXT_disjoint_timer_query_webgl2`; no disjoint samples were reported. Simulation
is paused, and the app-loop render is suppressed while a single measured draw
runs per animation frame. Render submission and GPU duration are separate;
frame intervals reflect browser/display cadence, not a full gameplay FPS claim.
Host scheduling variation remains visible between blocks.

| Shadows | GPU p50 ms | GPU p95 ms | Submission p95 ms | Frame interval p95 ms | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Off | 3.93 | 5.27 | 10.90 | 13.50 | 380 |
| On | 6.04 | 7.90 | 11.90 | 13.50 | 405 |
| On | 5.31 | 7.34 | 12.90 | 13.50 | 405 |
| Off | 5.58 | 6.78 | 10.70 | 13.50 | 380 |

The proof adds 25 draw calls and 6,012 submitted triangles in this baseline.
These counters include Three.js's rendering passes. Both settings retain the
same warmed program/resource set within the paired measurement.

## Initial budget for subsequent phases

At this same Iris Xe viewport/DPR/camera, use a provisional **per-source**
paired GPU overhead budget of `≤2.5 ms` p50 and `≤3 ms` p95. For this Room 1
render-only baseline, keep total GPU p95 `≤10 ms` and render submission p95
`≤14 ms`. The recorded paired blocks fit those bounds; they are an initial
review budget, not a guarantee for every pose, resolution or encounter.

The full gameplay target is `16.7 ms` per frame (60 FPS); fixed-step simulation,
all-level traversal, higher DPR, additional lights and worst-case poses must be
measured before broader rollout under #173. Do not multiply these per-source
allowances to justify all searchlights simultaneously. Map resolution/coverage
changes require a matched visual and timing comparison.

## Lifecycle and failure evidence

Three whole-level restarts and three authoritative checkpoint retries retain
`453` geometries, `19` textures, `152` programs and the same map. Three
unload/reload cycles stabilize at `450` geometries, `18` textures, `133`
programs; fewer variants are retained because off-mode comparison programs and
burst geometry are not live after reload. Every unload records exactly one
map and one attached depth-texture disposal, clears the map reference, releases
the owner and restores disabled renderer shadows. Renderer-retained caches
stabilize at one geometry and three textures; they are not live level maps.

An injected Room 2 compilation rejection occurs after the Room 1 map has been
allocated. The runtime returns to `unloaded`, owner `null`, shadows disabled,
map disposed exactly once and reference cleared. A subsequent reload succeeds
with the same stable resource counts. The expected rejection is caught by the
harness. Successful runs report zero console/page errors and zero failed asset
requests.

Focused policy tests also exercise an overlapping owner handoff, removal of an
older request, failed-owner restoration, synchronous and asynchronous
preparation restoration, and late requests after renderer disposal.

## Reproduction and checks

```sh
npm ci
npm run build
node scripts/capture-room-one-shadows.mjs
```

The default capture uses local Playwright Chromium; consult its recorded GPU
identity before treating timing as representative. For a physical browser,
start an isolated Chrome CDP session and a production preview reachable by that
browser, then use:

```sh
SHADOW_PROOF_CDP_URL=http://<local-cdp-address>:<port> \
SHADOW_PROOF_URL=http://<reachable-preview-address>:<port>/ \
SHADOW_PROOF_OUTPUT=docs/evidence/issue-169/iris-xe \
SHADOW_PROOF_REPRESENTATIVE=1 \
node scripts/capture-room-one-shadows.mjs
```

Select the representative flag only for the intended hardware; the report also
checks for software-renderer identities. The script closes only the context it
creates and leaves an externally supplied CDP browser alive. Temporary native
browser/proxy sessions used for this evidence were cleaned up afterward.

- `npm test`: all 106 test files pass on the final implementation.
- `npm run type-check`: passes.
- `npm run build`: passes; existing large-chunk advisory remains.
- `git diff --check`: passes.
- Production physical-GPU capture: nine matched pairs, paired GPU baseline,
  restart/retry/reload and injected-failure checks pass.
- Format/lint scripts are not provided by this repository. The complete browser
  traversal suite was not run; this bounded production proof does not claim #173.

Human approval of the Room 1 proof, native hatch sequence/camera review, and
#170's deformation-correct silhouette remain separate acceptance work.
