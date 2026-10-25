# Gameplay performance pass

Local diagnostics on 2026-10-25 used Chrome with Intel Iris Xe through ANGLE
D3D11, Medium settings, a 1920 × 1080 drawing buffer and DPR 1. These results
are directional measurements on the development machine. The university NUC's
CPU, GPU configuration, shared memory and Ubuntu/Mesa drivers still need their
own qualification run.

## Retained changes

| Change | Matched local result |
| --- | --- |
| [Separate Room 1 chamber and duct light scopes](room-one-light-scoping.md) | Chamber GPU time approximately 15.0 → 7.3 ms; repeat Play-to-control loading approximately 2.7 → 2.5 s |
| Cull earlier chambers while both player and camera are inside the upper lift | 297 → 127 draw calls; GPU time approximately 9.6 → 7.3 ms |
| Native BC7 maps for the shared Level 1 finishes | Complete mip storage approximately 32 → 8 MiB; approximately 2–7% lower GPU time in stable sampled views |
| Distant industrial drones in Cultivation's chamber and elevator | 23,056 fewer submitted triangles in the reviewed chamber view; approximately 2% lower GPU time there |
| Avoid unchanged lighting/HUD work | Hidden full health produces zero DOM mutations over the 120-frame browser check; ordinary rendering no longer builds full lighting diagnostic snapshots |

Lift culling requires both positions to clear the entry portal and remain
inside the shaft footprint. It preserves lights and collision, restores
visibility after drawing, and leaves entrance, exit and trailing-camera views
available. It does not change other rooms' visibility rules.

The compressed bank is chosen through `EXT_texture_compression_bptc` support.
Other GPUs use the original RGBA bank, which also handles a failed optional
bank request. Encoding and mip generation happen offline; gameplay loads
native blocks without a transcoder or texture worker. The gzip bank grows
from 969,264 to 1,099,327 bytes. Storage figures count texture mip data, not
total application VRAM or driver overhead. Regeneration and provenance are
documented in the [asset README](../../assets/environments/containment-room-one/README.md).

Distant drones retain the eye, warnings, aim, gameplay anchors and collision.
Projected size and hysteresis select the mesh detail. Nearby models keep the
original geometry. Buffers are shared per model configuration and their
hidden primers participate in the existing bounded room preparation queue.
Only the chamber/elevator encounters request these resources; cinematic
drones keep their existing preparation work.

Lighting reuses stable room weights and reads the active room/visibility
directly. Decorative surveillance tracking skips inactive lighting rooms.
The health HUD avoids unchanged attributes and progress values while retaining
the existing damage, regeneration, full-health hold and exit animation.
CPU frame samples were noisy; no general CPU/FPS percentage is claimed.

## Trials not retained

An additional camera test for Level 1 shadow maps did not reduce submitted
work in the sampled views. Existing caching and simplified casters already
cover those cases, so the added test was removed.

A camera-prop index LOD prototype reduced its potential geometry from 2,088
to 1,124 triangles, but did not reduce visible submissions in the sampled
views. It was not added to the gameplay path.

Forcing single-pass rendering on double-sided transparent materials did not
change sampled draw counts. Reducing refraction capture scale from 0.75 to
0.5 reduced GPU time by approximately 17% in one view, but changes the Medium
quality setting. The current profile remains at 0.75.

## Evidence and limits

The local diagnostic runner and raw results are under ignored
`artifacts/gameplay-optimisation/`. Experiments use sequential A/B/B/A blocks
with 45 samples per block, GPU timer queries, warm-up draws and staged camera
poses. They expose runtime references through instrumented bundle routing;
they measure frozen rendering, not natural traversal or loading time.
The drone view uses the actual chamber with a staged interior camera.
OS/driver caches and power/thermal state were not controlled.

All recorded query batches completed without a disjoint timer or WebGL error.
Longer Room 5 diagnostic sequences created additional programs in both the
original baseline and candidate; those sequences do not establish complete
live-state shader coverage. The focused travel/restart browser check separately
passed without new programs in its authored poses.

Focused coverage includes texture validation/fallback/disposal, drone warning
and collision preservation, shared resources, lift portal/visibility recovery,
lighting handoffs and HUD animation/idle mutations. Use the existing lab
performance protocol for a clean, committed build on the actual assessment PC.
