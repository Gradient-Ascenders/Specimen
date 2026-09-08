# Remaining performance investigation — 8 September 2026

Scope: performance only, preserving the existing room art and gameplay. No commit, push, or PR. Existing resolved merge and other local work retained.

## Measurement method and limits

Edge headless, 1280×720, Intel UHD 620 on this machine. Captured Vite development CPU profiles and isolated minified production before/after builds. Production uses the existing ?debug=1 switch because the authored Level 2 preview rooms are gated behind debug availability. Production measurement did not enable the CPU sampler or wrap WebGL calls. RAF intervals cover entry, repeated room visits, three restarts, and a further 60-second Room 5 observation. These are assisted debug routes, not an uninterrupted manual playthrough. Samples are camera-specific and cannot establish a minimum FPS across every camera or device.

The isolated baseline preserves the same art but restores the pre-fix CollisionWorld and disables the new preparation hook using a Vite transform, without reverting source or the pending merge. Generated evidence and scripts are under artifacts/performance-freezes/ (ignored): before.cpuprofile, collision.cpuprofile, warm.cpuprofile, warm2.cpuprofile, production-before.json, production-after.json, their events JSON files, and production-after-audit.json. Baseline config: baseline.vite.ts.

## Requested findings

1. **Sustained CPU cause.** Each collision sweep repeatedly updated shared ancestor matrices and recomputed inverse matrices, normal matrices, scale factors, and world bounds even for unchanged colliders. Room 5 has 517 intentional collider meshes; Level 2 registers 681. Repeated body and drone queries amplify this work. Production first Room 5 fixed-update median fell 12.5 → 7.4 ms; subsequent fixed samples fell roughly 11 → 7 ms.

2. **Freeze cause.** First rendering of new room material/light combinations blocks the main thread in WebGL program finalization/status reporting. The development CPU trace is dominated by getProgramInfoLog during the freezes, with 23,816 sampled hits. Production independently reproduced 9.56-second Room 5 and 8.01-second Room 3 frames. This was not merely development-server overhead.

3. **Onset.** First Room 2 entry stalled 3.13 seconds, Room 3 8.01 seconds, Room 4 1.78 seconds, and Room 5 9.56 seconds. Room 5 is also where sustained CPU cost becomes most pronounced. Repeated visits were much less affected than first visits; timing did not suggest a fixed periodic task.

4. **Profiler evidence and staged fixes.** First cached derived collision transforms, then deduplicated ancestor updates within each synchronous sweep, profiling each stage. Separately introduced loading-time compileAsync and real render priming. Follow-up traces identified shadow depth/distance variants associated with the preceding room's light signature and buffer uploads for invisible colliders; preparation now includes these. The final production measurement is independent of development CPU profiler overhead.

5. **GC.** The baseline CPU sample recorded approximately 196 ms of GC in total, with a largest contiguous sampled GC span of about 25.7 ms. This can affect individual frames but does not explain 8–10-second stops. Sampling is not a complete GC event trace; no claim that GC can never cause a minor hitch.

6. **Allocations.** Collision matrix storage is allocated at registration, reused thereafter; query stamps and a WeakMap avoid rebuilding ancestor sets per query. Existing body, camera, slime, acid and drone scratch/pool patterns were retained. No speculative broad rewrite of ordinary initialization allocations. Debug diagnostics build arrays/strings only when visible and throttled, rather than every normal gameplay frame.

7. **Procedural textures.** Lab maps are generated during resource construction and reused across rooms and resets. No expensive canvas generation was found in hot updates. Texture initialization is now explicitly primed during loading. No global downscaling or new textures was introduced.

8. **Shader findings and fix.** Level 1 already prepares its shaders before play; Level 2 lacked equivalent preparation. New prepareCultivationPresentation borrows live materials/geometries in temporary leaf proxies, warms authored room/light visibility configurations and hidden future presentation states, then restores renderer/scene ownership. GameSessionCoordinator holds simulation and rendering until preparation completes. It guards asynchronous completion/failure/disposal. FiniteLightEvaluation sets material.needsUpdate once when installed (WeakSet guarded), not every frame. Remaining needsUpdate writes are constructor texture/UV initialization or changing buffer attributes/instance transforms; those are not per-frame shader recompilation. Animation uses uniforms.

9. **Acid.** Sixteen Level 2 interaction surfaces share the existing acid material. The pool capacity is 12, with a bounded contact-slot scheme and expired events reused. Final sample: zero active, five emitted. No unbounded historical wake arrays or per-surface shader creation. Effects, quality and hazard rules retained.

10. **Room activation.** Existing spatial render visibility excludes distant room roots and their lights. Existing encounter gating considers both slime occupants. Room 4/5 lifecycle and cross-room puzzle updates remain where needed. Presentation visibility is not used to disable authoritative colliders. No unsafe blanket pause of inactive bodies or puzzle systems.

11. **Lights/shadows.** At sampled L2 cameras, total visible lights are 7/10/19/10/21. They comprise one hemisphere and one directional plus 5/8/17/8/10 points; Room 5 additionally has nine spots. Visible light counts include zero-intensity lights. Room 5 retains its nine 512px shadow searchlights and Volt's 512px point shadow. Sampled shadow-casting meshes: 0/0/0/0/142. No quality, shadow resolution or fixture removal. Light counts are identical before/after.

12. **Collision.** Cache invalidation uses exact world-matrix comparison; every new query refreshes hierarchy state, so movement, reparenting, rotation and scale remain visible. Query order, layers, bounding boxes, normals, surface metadata and hit tie behavior are unchanged. Tests exercise moved/reparented parents against a reference world. Decorative art remains separate from intentional collider registration.

13. **Resource/leak audit.** Final renderer resources stabilize at 1,315 geometries, 44 textures and 349 programs through three restarts and the extended observation. The old lazy baseline grew to 604/42/74 as new content appeared. The higher prepared counts are deliberate eager GPU residency, not newly authored meshes or textures. Preparation warms hidden future geometry and more possible lighting programs. Temporary proxies are detached, instanced proxies disposed, borrowed resources retained for their original owner. Listener audit at end: session HUD 1, runtime HUD 1, Room 5 subscriptions 2. Visible scene-object/material counts match baseline. A single JS heap sample (~75 MB) does not prove absence of every possible leak or bound multi-hour play.

14–15. **Draw calls and triangles.** No batching or geometry reduction was required in this follow-up; prior art batching remains. Small differences below are moving drones/particles and timing, not static visual changes.

| View | Calls before → after | Triangles before → after | Median FPS before → after | Fixed CPU ms before → after |
|---|---:|---:|---:|---:|
| Level 1 | 196 → 196 | 27044 → 27044 | 59.9 → 59.9 | 0.3 → 0.3 |
| Level 2 Room 1 | 18 → 18 | 2162 → 2162 | 59.9 → 59.9 | 1.1 → 0.8 |
| Level 2 Room 2 | 44 → 46 | 1620 → 1732 | 59.9 → 59.9 | 1.5 → 0.9 |
| Level 2 Room 3 | 72 → 71 | 92744 → 92224 | 59.9 → 59.9 | 1.4 → 1.6 |
| Level 2 Room 4 | 63 → 63 | 6086 → 6086 | 59.9 → 59.9 | 1.4 → 1.0 |
| Level 2 Room 5 | 431 → 433 | 101017 → 101269 | 29.9 → 59.9 | 12.5 → 7.4 |


16. **GPU geometry counts.** Level 1 stays 366. Baseline L2 Room 1/2/3/4/5: 21/90/280/332/602, ending 604. Prepared L2: 1,315 throughout. This is Three's uploaded-resource count, not the authored mesh count. Invisible solid colliders also receive buffer uploads in Three before material.visible is checked.

17. **Texture counts and sizes.** Level 1 stays 10 renderer textures. Baseline L2 rises 16 → 42; prepared L2 holds 44. No 2048/4096 environment maps identified. Most major lab maps are 512px, with smaller 256/128/64/32 maps. Unique material-map RGBA8+mipmap estimate is 14.2 MiB; this excludes driver allocation overhead and shadow/render targets and is not a total GPU-memory measurement. No duplicate map regeneration on restart was observed.

18. **Frame results.** Room 5 first-view median improved 33.4 → 16.7 ms (29.9 → 59.9 FPS). Level 1 and Rooms 1–4 median stayed 16.7 ms. Across all recorded Room 5 entry/revisit intervals, mean fell 45.32 → 20.30 ms (includes freezes). Extended Room 5 mean fell 23.02 → 17.67 ms; p99 fell 50 → 33.4 ms. Some 33 ms frames remain; 60 FPS median is not a claim of locked 60 FPS.

19. **Worst frames.** Production gameplay maximum fell 9,564.4 → 116.7 ms. Room 2 maximum 3,132.6 → 16.9 ms; Room 3 8,014.8 → 33.7 ms; Room 4 1,782.9 → 50 ms. Extended Room 5 maximum fell 116.6 → 83.3 ms. Room 5 frames over 50 ms fell from 70/1,143 to 8/1,572 in entry/revisit phases; extended observation from 23/2,699 to 4/3,494.

20. **Remaining stalls.** Multi-second gameplay freezes were not reproduced after preparation on this route. Occasional 67–117 ms hitches remain, so the strict request for only imperceptible variation is not fully proven. Preparation itself moves substantial work to loading: observed Level 2 transition phase was approximately 94.6 seconds versus 3.6 seconds in the lazy baseline. Loading frames can still block for around 1.65 seconds. This is a significant cold-load trade-off and must not be presented as free optimization.

21. **Visual quality.** No new art, removed props, lower texture resolution, disabled acid, reduced shadow quality, changed lighting rules or global renderer-quality reduction. Proxy priming uses a temporary 1px viewport behind the transition and restores the real viewport/scissor before gameplay.

22. **Gameplay.** Controllers, body positions, room layouts, drone detection, dissolve timing and checkpoint semantics were not changed. Automated checks cover collision, switching, acid, drones, elevator, Room 5 traversal and resets. Browser regression outcome is recorded below; assisted positioning/burn invocation is distinguished from natural play.

23. **Verification.** Full Node suite: 397 passed, 0 failed. Type-check and production build passed. New tests cover collision cache correctness under hierarchy changes, asynchronous transition success/failure/disposal, and preparation restoring scene/renderer state without disposing borrowed resources on success/failure. Production profiling reports no console/page errors or HTTP failures. git diff --check passed (only Git line-ending advisories); no unmerged index entries.

24. **Remaining risks.** Long cold preparation, greater upfront program/buffer residency, occasional measured hitches, camera/device-dependent GPU cost and limited session duration. No claim of every-device smoothness or a multi-hour leak soak. The identified multi-second first-use mechanism is addressed and sustained CPU load materially reduced; the loading cost and residual frame variation remain explicit limitations.

## Browser gameplay regression

Passed the assisted production journey (artifacts/performance-freezes/gameplay.log). Room 3 acid contact/wake/landing used 2/6/7 active events within the fixed pool. Room 4 completed its full 60-second descent, all 12 cable burns, both slimes alive, and arrival. Room 5 verified Goop vent/sewer travel, acid wake, three damaged-drone burns, red/blue/green network controls, Bob route checkpoints, rescue and Volt unlock, deliberate acid death and Retry retaining the rescued checkpoint, switching to Volt, terminal power, and final completion. No console/page/HTTP errors were logged. Reviewed elevator boarding and Room 5 control screenshots. Positioning and dissolve calls were scripted; natural timing/LOS and parkour are additionally covered by automated tests, not claimed as a full manual playthrough.
