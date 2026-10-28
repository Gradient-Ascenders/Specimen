# Medium 1080p performance pass

This pass targets the assessment ASUS NUC12WSK-B: Core i3-1220P, integrated
Alder Lake GT2 graphics, 16 GiB RAM and Ubuntu 24.04.1/Wayland. The target is
the existing **Medium** profile (`standard`) at a **1920 × 1080 drawing
buffer**. Its render scale, 1024 shadow cap, reduced transmission and full
effects density are unchanged. This is implementation and correctness
evidence, not a measured FPS or loading-time result on that computer.

The comparison source is `36abf014fae1d125b601d70e7ef8ae31e2d96ca0`.
The earlier lab runs described in `lab-performance-optimisation.md` used
different graphics settings and older content. They do not qualify this build
at Medium/1080p.

## Loading and delivery

| Asset | Authored bytes | Delivered bytes | Change |
| --- | ---: | ---: | --- |
| Containment Room 2 | 2,345,668 | 537,946 | Lossless gzip |
| Containment Room 3 | 3,509,852 | 699,775 | Lossless gzip |
| Containment Room 4 | 1,358,252 | 262,577 | Lossless gzip |
| Containment Room 5 | 2,668,084 | 525,940 | Lossless gzip |
| Specimen | 9,801,168 | 6,608,734 | Lossless gzip |

The four room transfers total 2,026,238 bytes instead of 9,881,856, a 79.5%
reduction before any hosting-level compression. The retained GLBs remain the
source of truth. `generate:delivery-assets` produces transport copies and a
source SHA-256 manifest under `src/assets/delivery/`. Its check decompresses
each copy and compares every byte to the source. Runtime uses the existing
native gzip decoder before the existing GLB parser. No decoder library or
new hosting headers are required. Already compressed textures/audio are not
recompressed. This reduces transfer size, not the decoded geometry footprint.

Containment prepares Room 1's shared finishes first, then overlaps Room 2,
surveillance cameras and Room 3. Rooms 4 and 5 overlap only after Room 3's
shared emitter is ready. The join waits for every sibling before propagating
failure, preserving borrower/owner teardown ordering.

Depth preparation remembers exact geometry/material/custom-depth variants
within one preparation run, avoiding repeated submissions across overlapping
room scopes. Blackout's cinematic preparation similarly reuses unchanged
compiler submissions while invalidating geometry, shader features, lights,
environment and renderer configuration. Every authored rehearsal frame still
draws and retains its first-use resource preparation and GPU completion fence.
Caches do not survive a new preparation run or settings change.

Audio IDs that reference the same recording share one download and decoded
buffer. Their gain, voice limits, playback instances and event routing remain
separate. Music continues to stream through the existing path.

## Room-by-room outcome

| Level / area | Retained change or decision |
| --- | --- |
| Containment Room 1 | Receives the shared loading/preparation improvements; completed or inactive monitor text no longer causes hidden texture repaints. Existing chamber/duct lighting and shadow scopes remain. |
| Containment Room 2 | Smaller lossless model download and concurrent preparation; hidden monitor painting is suspended while dialogue time continues. |
| Containment Room 3 | Smaller download and concurrent preparation; emitter ownership remains ordered; hidden monitor painting is suspended. |
| Containment Room 4 | Smaller download and concurrent preparation after the emitter; existing enclosed-lift culling remains. |
| Containment Room 5 | Smaller download; ordinary atrium views can omit Rooms 1–3 once both camera and player clear the upper threshold. The neighbouring lift remains available. Monitor painting catches up when visible. |
| Cultivation Rooms 1–2 | Keep existing batching, light budgets, room scopes and preparation admission. Additional batch splitting increased draw submissions. |
| Cultivation Room 3 | Rejected extra partitioning after fixed-view counts showed more draws; retain existing chamber culling and drone detail. |
| Cultivation Room 4 | Keep the existing small authored mesh and enclosed-passage visibility rather than add more batches. |
| Cultivation Room 5 | Rejected extra partitioning: the modest visible-triangle reduction did not justify higher draw counts. Existing sewer scopes and shared models remain. |
| Blackout maintenance bay | Retain existing visibility: a whole-room culling trial changed visible boundary pixels. Shared preparation and audio improvements apply. |
| Blackout transit | Retain the neighbouring arena geometry that contributes through door/wall edges; keep existing lighting and shadow scopes. |
| Blackout ascent | Retain complete neighbouring geometry, including at shutter edges. No new whole-room mask is installed. |
| Blackout arena | Distant Specimen detail reduces vertex work; keep earlier boundary geometry visible at the entry. |
| Blackout research/ending | Reuse unchanged compiler submissions; retain every rehearsal draw and cinematic cue. Ending instance buffers upload only active ranges. |

Containment's existing draw scope restores visibility in `finally`, including
after a rendering failure. The new upper-atrium condition reuses that scope
and its prepared branch lists; it leaves collision and light ownership intact.

Specimen uses the same projected-size/hysteresis detail mechanism as Goop and
Volt. Full detail is 81,040 triangles; distant detail is 20,232. An extra
122,189-byte index bank shares all authored vertices, morphs and materials.
Indices are installed before the first GPU draw, and subsequent switches use
`drawRange`; no live buffer replacement or second morph texture is required.
Close shots retain full detail. Missing or invalid optional indices fall back
to the full model; disposal during loading releases the model. The generator
constrains the strongest morphs within Meshopt's attribute limit, so distant
poses still require visual review on the assessment display.

Ending effects retain their full density on Medium. The existing Low density
setting now reduces cosmetic smoke, sparks and rings, while beam launches,
hits and choreography are preserved. Active matrix/color upload ranges help
all profiles without changing their visible effect counts.

## Rejected geometry trial

Spatially splitting the Cultivation bank preserved every triangle and vertex
attribute, but increased draw submissions. A coarse three-slab trial changed
the staged Room 3 view from 71 to 88 calls with the same 211,863 triangles.
Room 5 changed from 169 calls / 284,883 triangles to 185 / 272,166. Finer
partitioning saved more triangles but added substantially more calls. These
are CPU-side frustum/submission counts, not GPU timings. No partitioned bank
or runtime partition code is retained. `WORKLOAD_ASSET_FILE` lets the existing
workload diagnostic inspect an alternate bank for future comparisons.

A separate Blackout whole-room culling trial reduced submissions, but exact
1080p comparisons found changed pixels along doors and wall edges. Repeated
unculled frames were identical, so the difference was caused by culling.
The maintenance forward view changed 5,150 color channels, transit forward
1,899, lift forward 10 and arena entry 12,678, out of 8,294,400 RGBA channels.
Even these small differences demonstrate that the neighbouring geometry is
not completely occluded. The masks and their runtime wiring were removed.

## Validation and assessment run

Local validation covers the production build/layout, the unit suite, exact
asset reproduction, and production startup/transitions/restart across all
three levels. `MediumPerformanceSafety.spec.ts` separately checks a 1080p
Medium drawing buffer, complete ending rehearsal and near/far/near Specimen
detail switches after GPU upload without growth in geometry/texture counts.
Software WebGL can establish correctness;
it cannot establish integrated-GPU frame rate or loading-time gains.

The retained build passed 503 unit tests and the two production smoke tests.
The Medium/1080p Blackout check passed with 81,040 → 20,232 → 81,040 triangles,
1,188 retained geometries and 95 textures throughout those three draws, and
zero WebGL errors. These are renderer object counts, not memory-byte totals.
`ContainmentLightingPass.spec.ts` also compares the added atrium scope against
the previous rendering in its Room 5 poses; `CONTAINMENT_LIGHTING_1080=1`
selects the evaluation drawing size for that five-room route. The route and
restart passed at Medium/1080p with no new shader programs, no WebGL errors
and zero changed pixel channels in all three sampled Room 5 views.

On the NUC, build a clean reviewed revision and serve the production files.
Use a hardware-accelerated Chrome/Chromium session and verify the actual
renderer is Intel/Mesa rather than SwiftShader/llvmpipe. Keep Medium selected,
render scale at 100%, and verify the drawing buffer, not only the desktop
resolution. Do not compare these results to the older Low/720p samples.

For normal production startup and repeat loading, with `vite preview` running:

```sh
npm run benchmark:loading -- --viewport 1920x1080 --passes 3
```

The runner selects Medium and rejects software rendering. Record the first
fresh browser navigation separately from same-context reloads; OS and driver
caches are not automatically cold. Its JSON includes timing, renderer,
preferences, drawing-buffer size and preparation diagnostics.

For the existing broader staged route diagnostic:

```sh
PROFILE_GRAPHICS_PROFILE=standard PROFILE_WIDTH=1920 PROFILE_HEIGHT=1080 \
PROFILE_DPR=1 PROFILE_HEADLESS=0 PROFILE_GPU=1 \
node scripts/profile-lab-performance.mjs
```

That runner requires a clean committed build and records the renderer. Check
it for hardware acceleration; do not request a software ANGLE backend.
`benchmark:level-two` also supplies fixed Medium/1080p Cultivation views via
an explicitly supplied hardware Chrome CDP endpoint. Staged views supplement
an actual traversal of every room, including doorway turns, separated
companions, hazards, checkpoints/restarts, the ascent, research escape, both
boss phases and the complete ending. Record frame-time p95/p99, long frames,
GPU timing when available, and memory across repeated level cycles. A stable
60 FPS (16.7 ms frame budget) is the engineering target, not a result claimed
by this patch.
