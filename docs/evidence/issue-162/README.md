# Issue #162 / PR #179 — Final review results

Final runtime changes: spotlight readability `32554a1`; prebaked texture loading
`279b491` and load-error diagnostics `7dc6b14`. This evidence cleanup changes no
runtime behavior, production assets, material parameters, UVs or gameplay.

## Platform readability

The original narrow spotlight lit a central patch of each 5 × 7 m platform,
leaving landing boundaries dark. The local half-angle is now 0.708626 radians
(previously 0.278300), with penumbra 0.25 (previously 0.5). Visible cones and
occlusion use that same angle. Intensity 100, range 32 m, inverse-square decay,
and the single 512² shadow map are retained. All three decks show useful front
and lateral boundaries at the tested drone positions; all remain non-emissive
and difficult to see without illumination. Global lighting and gameplay are
unchanged.

On UHD 620 at 1280 × 800, the matched 40-sample hardware comparison recorded GPU
median 63.7 → 67.7 ms and p95 69.1 → 71.9 ms. Draw calls rose 538 → 542, with
geometry, texture and shader counts unchanged. The wider visible cone and some
illumination of surrounding acid are the accepted visual/cost compromises.

## Texture loading and ownership

The Level 3 asynchronous factory loads the 1,181,449-byte lossless prebaked
bundle alongside its runtime import, before scene construction. Native async
stream decompression and constant-size header validation create zero-copy RGBA8
views. The runtime retains CPU data for reload; each bay owns its GPU textures
and materials, disposing them once after borrowers. Restart reuses resources.
Missing, corrupt, empty or unsupported loads report the underlying error through
the existing transition path. Cancelled transitions dispose late runtime results
without constructing scenes; their downloads may finish. No global GPU cache or
new dependency was added.

All nine families, five detail finishes, 27 maps, colour spaces, sampling,
material parameters and UVs are preserved. Every map byte matches hashes from
`32554a1`; the matched before/after preload screenshot is byte-identical. The kit
still has 14 materials and 7,864,284 bytes of estimated RGBA8 mip data. Six reload
cycles returned to the same GPU baseline; focused tests verify exactly-once
texture/material disposal and independent level-instance GPU ownership.

Chrome 155 / UHD 620, 640 × 360, local no-store nested-path server. Values are
median / p95; warm construction uses 5 warmups plus 30 measured samples, cold
entry uses six fresh browsers, reload uses six cycles, restart uses 30 samples.
Timing instrumentation was response-only; Level 1 shader warm-up was skipped
identically to isolate Level 3. Shader figures are prewarm wall time, not
isolated GPU execution time.

| Measurement | Procedural PR | Prebaked implementation |
| --- | ---: | ---: |
| Warm bay construction | 133.1 / 144.1 ms | 3.2 / 4.7 ms |
| Cold bay construction | 320.7 / 358.2 ms | 8.0 / 9.6 ms |
| Asset loading/preparation | — | 37.9 / 42.5 ms |
| Shader/prewarm | 10.89 / 11.77 s | 10.94 / 11.47 s |
| Time to playable | 11.47 / 12.39 s | 11.17 / 11.69 s |
| Reload to ready | 965 / 3609 ms | 790 / 3414 ms |
| Restart | 1.0 / 2.2 ms | 1.1 / 4.3 ms |

Node 24 base-bay-source comparison: 3.08 / 5.49 ms; procedural PR:
136.88 / 170.10 ms; prebaked: 3.31 / 5.47 ms. Native asset preparation had no
overlapping 50 ms long task in the measured cold samples. Existing roughly
11-second shader preparation remains the main cold-entry cost on this host.
These local timings do not establish performance on other hardware or networks.

## Verification and limitations

Finding #1/#2 targeted gameplay, material, geometry, map-data, ownership,
shadow and cancellation tests passed. Type-check, production build, production
validation, exact offline asset regeneration, the Blackout browser regression
and both unmodified nested-path hardware smoke tests passed for the preload
implementation. The final error-message refinement was covered by targeted
failure/session tests and build checks. Full-suite validation was deferred.

Instrumented profiling recorded cancelled Bob GLB requests in before/after runs
and one cancelled map request in a reload benchmark. Those diagnostics are
preserved locally; these captures are not claimed to have zero failed requests.
The unmodified production smoke checks passed. Native DecompressionStream is
required; unsupported browsers fail with an actionable transition error.

Cleanup verification (2026-10-14): all 42 targeted material, geometry, map-asset,
ownership, route and spotlight tests passed; the authored-surface audit reports
63 meshes / 55 colliders. Type-check, build, production validation and exact
offline asset regeneration passed. Only the geometry fixture URL changed in its
existing test; no assertions were altered.

## Representative views

The first view is the final prebaked material-equivalence capture. The other
four come from the approved spotlight comparison; their material bytes are
unchanged by preloading. All use the shipping follow camera. Checkpoint/body
setup is staged; the spotlight comparison's drone repositioning and jumps use
normal keyboard Input and fixed simulation. These are sampled route views,
not evidence of a complete unstaged playthrough.

| View | Screenshot |
| --- | --- |
| First deck, prebaked materials and approved spotlight | [First platform](platform-first.png) |
| Second deck landing boundary | [Second platform](platform-second.png) |
| Third deck landing boundary | [Third platform](platform-third.png) |
| First deck during jump | [Mid-jump](platform-jump.png) |
| Route without drone illumination | [Dark route](platform-dark.png) |

## Fixture and reproduction

The untextured geometry baseline is now
`tests/fixtures/blackout-maintenance-authored-surfaces.json`, copied unchanged
from the original checkpoint baseline. The existing 63-mesh geometry, transform,
metadata, collision and shadow assertions remain intact. Deterministic map
hashes remain in `tests/fixtures/BlackoutMaintenanceMapHashes.json`.

See [texture generation/loading documentation](../../blackout-maintenance-textures.md)
for offline regeneration. The existing audit/capture scripts now default to
ignored `artifacts/issue-162/` output. Raw logs, JSON, superseded experiments and
the rejected perimeter patch were backed up outside tracked paths before removal.
A local path-and-SHA-256 manifest verifies all 230 original files. No backup or
raw diagnostic bundle is included in this PR.
