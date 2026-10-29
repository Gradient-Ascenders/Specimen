# Localhost Level 3 transition investigation

## Confirmed cause

Reproduced on this checkout with Vite 8.2.1, Three.js 0.185.1,
Node 24.19.0, npm 11.18.0, and a fresh Playwright Chromium profile using
SwiftShader. Selecting Blackout from the title failed with the reported
`Cannot read properties of undefined (reading 'version')` exception.

The original `CameraOcclusion.ts:58` expression was:

```ts
position instanceof THREE.BufferAttribute ? position.version : position.data.version
```

The failing mesh was
`blackout-entry-collapsed-panel-batched-static-visuals-static-batch-1`.
Its position attribute had `isBufferAttribute === true`, but its constructor
was different from the application's `THREE.BufferAttribute`. It was not
interleaved and had no `data` field. The false `instanceof` branch therefore
read `version` from undefined. The same assumption also existed in the
per-draw bounds invalidation path.

The captured development stack (served TypeScript line numbers) was:

```text
TypeError: Cannot read properties of undefined (reading 'version')
  at src/render/CameraOcclusion.ts:40:99
  at Mesh.traverse (node_modules/.vite/deps/three.module-BEvS_7fE.js:9838:3)
  at Group.traverse (node_modules/.vite/deps/three.module-BEvS_7fE.js:9840:64)
  [three additional Group.traverse frames]
  at new CameraOcclusion (src/render/CameraOcclusion.ts:32:34)
  at src/levels/BlackoutLevelRuntime.ts:285:58
```

The coordinator schedules the transition, disposes the previous runtime,
constructs and loads Blackout, then awaits `preparePresentation()`. That method
joins its character, environment, and cinematic asset promises before installing
camera occlusion. The constructor fails there, before Blackout lighting and
`BlackoutPresentationPreparation` shader compilation/instance-buffer priming.
The rejection reaches `GameSessionCoordinator.failTransition`, which displays
the message without retaining the stack in the UI. Test-only response transforms
captured the original error and attribute identity; no diagnostic transforms
or extra logging were added to the shipped game.

## Why this checkout differs

Before the fix, Vite's optimized dependency metadata resolved
`three/addons/geometries/RoundedBoxGeometry.js` and
`three/addons/utils/BufferGeometryUtils.js` from:

```text
artifacts/performance-overhaul/experiment-source/node_modules/three/...
```

Other Three.js imports resolved from the application's `node_modules`.
Both copies were version 0.185.1; matching versions do not give separately
loaded classes the same constructor identity. The optimizer emitted two separate
Three.js chunks, and the console warned
`Multiple instances of Three.js being imported`. The ignored experiment includes
its own `index.html` and dependencies. Vite's default HTML discovery picked up
that local snapshot; Git ignore rules do not define Vite's entry points.
Geometry created/merged by those addons crossed module identities.

This local generated content explains why a teammate without that snapshot
could succeed. Teammate files were not inspected, so that comparison remains an
inference. The failure was reproduced using software rendering and a fresh
profile, without extensions or previous browser state. A GPU driver fault,
shader compatibility issue, buffer disposal race, or slower hardware is not
needed to explain the observed exception. No failing asset response appeared in
the reproduction. The absent `KHR_parallel_shader_compile` extension produced a
warning, but also remained present in the successful run.

## Fix

- Explicitly scan only `index.html` in Vite's dependency optimizer. Local HTML
  experiments and archived builds can no longer supply dependency entries.
- Deduplicate `three` through Vite's resolver so addons share the application's
  dependency even if another local tree is introduced.
- Read attribute versions using the interleaved-storage discriminator in both
  camera-occlusion paths. A foreign ordinary attribute retains valid bounds
  tracking instead of being mistaken for interleaved storage.

No shaders, light settings, assets, instanced buffers, quality profiles,
simulation behavior, or preparation batching were reduced or replaced.
Changing the Vite configuration invalidates its optimized dependency cache;
manual cache deletion is not the fix. Restart an already-running dev server
and reload browser tabs after updating this branch.

## Regression coverage and scope

Unit cases use a real second Three.js constructor from its CommonJS entry and
verify both construction and bounds invalidation after attribute edits. A
separate case verifies interleaved backing-buffer version tracking.

The browser regression starts Cultivation, stages the Volt roster normally
earned by its finale, emits the runtime's completion event, and exercises the
real coordinator transition into Blackout. It then restarts Blackout and
returns to the title, checking console/network/WebGL errors and duplicate
Three.js warnings. It does not replay all Level 1 and Level 2 puzzles or their
finale cinematics. Production tests use the nested `/group-folder/` host path.

Verification:

- Targeted rendering unit suite: 11 passed, including both new attribute cases.
- Full `npm test`: 536 passed; the archive-cache test initially failed with a
  sandbox `EPERM` during a temporary ZIP rename, then passed outside the sandbox.
  All 537 cases therefore passed across the full run and that targeted retry.
- `npm run type-check`: passed after restoring the declared dependencies. The
  original checkout lacked `@types/node`; no package manifest or lockfile changed.
- `npm run build`: passed.
- `npm run validate:production`: passed, validating 205 production files.
- Fresh localhost selection of Level 3: reached Ready after the fix.
- Localhost browser regression: passed (Level 2 completion, Level 3 entry,
  restart, return to title). Post-restart screenshot inspected.
- Production browser regression at `/group-folder/`: passed for the same
  transition, restart, and menu journey, with no captured console/network/WebGL
  errors or duplicate Three.js warnings.

Browser runs use Playwright Chromium with software WebGL. Native GPU/driver
rendering, a complete Level 1-to-3 puzzle playthrough, and comparative performance
benchmarks are not covered by these checks. Retest normal play in the user's
usual browser after restarting Vite. The successfully reproduced exception
does not require a hardware-specific hypothesis.

Original probes and local logs are under ignored `artifacts/level3-investigation/`.
