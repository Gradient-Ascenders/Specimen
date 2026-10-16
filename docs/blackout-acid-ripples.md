# Level 3 interactive acid ripples

Branch: `fix/level1-level3-gameplay-polish`.

## Cause and implementation

The previous material update connected the established animated acid shader to
both Blackout basins, but did not connect `AcidLiquidInteractions`. Flow and
bubbles are time-driven; contacts need this separate read-only body sampler.
The sampler also had only two slots, while Blackout has three persistent bodies.

Both room owners now construct a three-slot sampler from their existing rendered
acid mesh and `AcidSurfaceMaterial`, after geometry authoring and static batching.
The sampler updates the mesh's world matrix and caches its actual world bounds.
The visible top heights are approximately -0.9500 m in Room 1 and -0.9675 m in
Room 2; these come from the meshes, not the approximate gameplay hazard constants.
No collision geometry, hazard extent or immunity rule changed.

`BlackoutLevelRuntime` samples the existing stable Bob/Goop/Volt body array after
physics and before acid failures. Inactive bodies participate. Each basin has
independent contact history and the shader's existing bounded twelve-ripple pool.
The sampler's default capacity remains two for Levels 1 and 2. Replaced/missing
body identities clear their slot's history, and teleport suppression remains.

The hazard thresholds can precede contact with the visible liquid. Each
controller's specific Bob/Volt acid branch now calls the existing `fallPulse()`
before returning a failure. The acid-specific mounted-drone rider loss also
projects Volt's impact. Generic death, lasers, drones, electric vents and
out-of-bounds failures do not call the projector. A projected impact is latched
per tracked body and cannot repeat or duplicate an already sampled contact
splash. Reset clears that latch.

Normal death updates stop sampling gameplay bodies. Room 1's material clock now
continues during death, as Room 2's already did, allowing the impact ring to
expand and fade. This advances only the existing acid uniform, not machinery or
body simulation. A stopped/paused runtime advances neither clock nor contacts.
Restart and checkpoint recovery reset both samplers before recovering bodies.
Ordinary room transitions preserve their independent histories, avoiding fresh
entry splashes when inactive characters remain in a previous basin. Room disposal
clears body references before releasing the existing material and noise texture.

## Scope and performance

Changed gameplay/presentation integration files:

- `src/render/environment/containment/AcidLiquidInteractions.ts`
- `src/levels/BlackoutMaintenanceBay.ts`
- `src/levels/BlackoutTransitRoom.ts`
- `src/levels/BlackoutMaintenanceBayController.ts`
- `src/levels/BlackoutTransitController.ts`
- `src/levels/BlackoutLevelRuntime.ts`

There is no shader change, new material, texture, mesh, particle system, draw
call or shader variant. The additional normal-step work is at most six cached
body/bounds checks across the two pools, with uniform writes only for real
disturbances. No new per-frame arrays, geometry or material objects are created.
The same bounded shader loop and uniform objects handle the events; ordinary
updates retain material versions and program cache keys. Existing room lighting,
graphics profiles, Level 1 rescue progression and Room 2 geometry remain intact.
Active rings execute the shader's existing analytic wave math, so visible
interactions still have a bounded fragment cost; no FPS improvement is claimed.

The earlier uncommitted environment-repair files were present at task start and
are intentionally excluded from the ripple commit. Their Vite entry restriction
was retained while testing development. No dependency/lockfile change was needed.

## Verification

Focused regressions cover:

- Three simultaneous contact slots and transformed world coordinates/heights.
- Entry, repeated walking wakes, takeoff, velocity-scaled landing and teleport /
  elevated/outside suppression, retaining the existing two-body tests.
- Bob and Volt acid failures in each room through real runtime physics,
  exactly one impact, continued death animation, pause and checkpoint/restart.
- Goop's real-body movement in both basins while remaining immune, and no
  projected impact from a generic failure.
- Existing acid hazard rules, traversal, material/noise ownership and disposal.

`BlackoutAcidRipples.spec.ts` opens the ordinary game URL, observes the existing
composition root without enabling debug query parameters, and stages progression
and room entry through existing runtime contracts. Goop falls naturally onto the
surface, walks with real keyboard input, jumps and lands again. Bob and Volt fall
into each basin and use the existing death path. The probe records exact ripple
uniforms, counts, material versions/cache keys, graphics settings and GL errors.
It checks that death frames do not emit again and that recovery clears ripples.

Browser screenshots use the gameplay camera turned across the basin and angled
down through its existing look-input API. Volt remains on the dry entry platform
and contributes his existing gameplay light. No lighting, exposure or effect
intensity is increased for the captures.

Development checks passed Standard/Normal, Standard/Performance at 0.75 scale,
and Minimum/Normal in installed Edge on Intel UHD Graphics 620 / ANGLE D3D11.
Evidence is under `artifacts/blackout-ripples/{development,production}/` with one
folder per profile. Each contains Goop wake/landing and Bob impact screenshots
for both rooms, plus JSON evidence for both Bob and Volt deaths.

These are staged interaction checks, not a complete unassisted puzzle playthrough
or a controlled FPS benchmark. Visual intensity remains that of the existing
acid effect and the deliberately dark Level 3 lighting.

Final results:

- Full current-worktree unit suite: **937 passed**, no failures/skips, 171.5 s,
  using `node --test --test-concurrency=1 tests/*.test.ts`. This includes the
  preceding environment-repair regression, which remains outside this commit.
- `npm run type-check` and `npm run build`: passed. The existing Vite chunk-size
  advisory remains; no shader source or dependencies changed.
- Installed Edge / Intel UHD 620 browser journeys: **3 development + 3 production
  profiles passed**, covering both pools, Goop entry/wakes/jumping, Bob and Volt
  impacts, exactly-once death behavior, and checkpoint clearing. No console,
  HTTP or WebGL errors were observed.
- [36 gameplay screenshots](../artifacts/blackout-ripples/gallery.html),
  [browser summary](../artifacts/blackout-ripples/browser-summary.json), and
  [full unit log](../artifacts/blackout-ripples/unit-tests.txt).
- The unchanged archive generator validated the ZIP root and all files. Output:
  `artifacts/specimen-production.zip`, 12,852,519 bytes, SHA-256
  `0b0e9f91e240f66ec3c25c400ed95dc3ec692645afe1fe3cf087d1553b89ae4c`.
- The plain production startup/credits/play/pause/restart smoke test passed
  against the extracted ZIP at `/group-folder/` in 34.8 s, without query flags
  or a runtime observer.

No push or PR was performed. Temporary development/preview servers are stopped
after verification so they do not retain the Windows Rolldown file lock.
