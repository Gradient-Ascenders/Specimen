# Blackout maintenance texture maps

Room 1 uses a project-authored, lossless bundle at
`src/assets/blackout/maintenance-maps.bin`. Rebuild it with Node 24:

```text
npm run generate:blackout-maps
node scripts/generate-blackout-maintenance-maps.ts --check
```

The generator retains the original seeded wear, corrosion, relief and normals.
Gzip header byte 9 (OS) is normalized to 255 (unknown) before writing or checking,
so Windows and Linux produce the same bundle. The Linux PR unit-test job runs
the exact regeneration check shown above.
The gzip payload starts with `SPCBM001`, nine little-endian uint32 dimensions in
`BLACKOUT_MATERIAL_FAMILIES` order, then RGBA8 albedo, roughness and normal bytes
for each family. Changing the format/order requires a new version. The `.bin`
extension avoids hosts treating the file as HTTP Content-Encoding gzip.

The existing asynchronous Level 3 factory loads the versioned Vite asset URL
(relative to its module, including nested deployments) alongside the runtime
import. Native `DecompressionStream('gzip')` prepares the buffer asynchronously.
The parser validates version, dimensions and exact length, then creates 27
zero-copy views; no procedural generation, image decode or per-pixel processing
runs in scene construction. Missing assets, corrupt gzip and invalid bundles
reject the existing transition with a Room 1 preparation error. Browsers need
[native compression streams](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream);
there is no synchronous decompression fallback.

One runtime retains the prepared CPU data for unload/load. Each bay owns fresh
GPU textures/materials and disposes them once after its borrowers. Restart keeps
those resources. Runtime disposal drops its CPU data reference. There is no
process-wide texture/GPU cache. The coordinator's existing generation guard
disposes late factory results without loading their scene after cancellation;
a cancelled transition may finish its download, but allocates no scene/GPU
resources. Loader callers may also supply an AbortSignal.

Tests compare every prebaked map byte against the offline generator, retain
colour-space/UV/material assertions, and cover disposal, failures and late
transition cancellation. The offline generator is outside `src/` and is never
imported by the game.
