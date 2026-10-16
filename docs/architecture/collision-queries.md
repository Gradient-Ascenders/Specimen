# Collision queries

`CollisionWorld` owns authored box colliders independently of visual meshes and
room rendering. Movement, camera obstruction, projectiles, targeting and visual
scanner probes share its sphere sweeps and exact segment rays. A room hidden by
an ancestor's render visibility still participates in collision. The collider's
own `visible` flag and query layers retain their existing filtering behavior.

## Candidate iteration

Static bounds occupy a coarse 10-metre grid. Each query collects candidates
from overlapping cells into reusable storage, deduplicates multi-cell entries
with a query stamp, and appends overlapping dynamic colliders from a separate
collection. Reusable sorting storage restores increasing registration order
before the narrow phase (heapsort for small sets, byte radix passes for 128+
candidates). Equal-fraction hits therefore keep the first registered collider, including ties across dynamic, grid and oversized static collections.
Unregistering and registering a mesh again places it last.

Steady local queries visit nearby static entries and the dynamic collection;
they do not traverse the full collider registry. Boxes spanning more than 256
cells remain in the oversized static list, which every query visits. Queries
spanning more than 4096 cells traverse occupied grid cells within the query
bounds to avoid probing a huge empty volume. Dense queries and scenes dominated
by oversized or dynamic colliders can still require substantial work. Candidate
sorting skips already ordered sets; small sets cost O(k log k), while dense
sets use sequential radix passes over registry-order digits. Storage follows
the maximum candidate count and is released on removal or clear.

The static index rebuilds after static registration, removal, transform-mode
changes or explicit invalidation. Rebuilding and the extremely rare 32-bit
candidate-stamp rollover can traverse the registry. These are maintenance
boundaries, rather than a cost of every steady-state local query.

## Transform boundaries

Register frequently moving geometry as `Dynamic`. Ordinary sweeps and rays
refresh its live ancestor matrices independently and reuse inverse matrices,
normals and bounds only while the world matrix is unchanged. Rotation and
non-uniform scale retain the established conservative sphere expansion.

`withStableQueryTransforms` only wraps synchronous read-only batches against an
unchanged pose, such as one cone's visual probes. Nested scopes share that
snapshot, and exceptions release it. Do not wrap a movement/update sequence in
this scope: colliders and their ancestors can move between those queries.
Moving/reparenting a static collider requires `invalidateTransform`, or switching
it to dynamic mode. Explicit invalidation and mode changes also advance the
transform stamp, so a following query can refresh ancestors even within a scope.

`getLastQueryDiagnostics` reports the last sweep or ray's dynamic visits, static
entry visits (including duplicate cells), candidates, narrow checks and new
candidate storage slots. These counters require no registry scan. Rays keep
movement sweep diagnostics intact. The legacy global `eligibleColliders` sweep
statistic is computed only when read, using the last sweep's mask/ignored mesh
and the current registry/visibility. It costs O(n) and is intended for diagnostics,
not inner query loops. Candidate and narrow counters remain query-time values.

## Reproducing CPU evidence

Use the pinned Node 24/npm 11 toolchain, install with `npm ci`, then run:

```bash
node scripts/benchmark-collision-broadphase.ts --queries 4096 --allocations \
  --output artifacts/collision-broadphase/after.json
```

The report includes the CPU/OS, registry sizes, local candidate visits, query
counts, five rounds of wall/CPU microseconds per query, and exhaustive-reference
hit hashes. It probes production Containment and authored Cultivation collider
geometry, the same 64 local probes with and without 10,000 distant boxes, dense
boxes, and 256 dynamic colliders. Both sweeps and rays run ordinarily and in
stable batches of 32. Poses are fixed to isolate query cost; transform-motion,
mode-change and lifecycle correctness is covered by collision tests.

`--allocations` adds a separate V8 sampling pass with 1024-byte sampling intervals
and collected objects included, retaining raw profiles beside the JSON report. Allocation
bytes are statistical estimates, not exact allocation counts. Candidate storage
growth is an exact slot count and does not measure VM allocations. Timings
exclude sampling, diagnostic reads, scene construction and index warmup.

For matched comparisons, extract the base revision into a temporary directory,
install its locked dependencies, and run the same new benchmark script with
`--root /path/to/base --output artifacts/collision-broadphase/before.json`.
Use `--revision <base-commit>` for an extracted archive without Git metadata.
The report also hashes the collision source and benchmark, including uncommitted
changes. Old revisions report unavailable ray/work counters as null. Compare matching
scene/kind/scope hashes before interpreting CPU changes. Run revisions serially
without competing builds/tests. Keep raw JSON under ignored `artifacts/` and
attach it to the issue or pull request; do not use the old synthetic Cultivation
numbers as production evidence.

The assessment target is the ASUS NUC12WSK-B, Core i3-1220P (12 logical
processors), Alder Lake GT2 integrated Intel Graphics, 16 GiB RAM, 500.1 GB
storage, Ubuntu 24.04.1 LTS x86-64, GNOME 46/Wayland, kernel 6.8.0-124-generic.
This Node microbenchmark measures CPU query cost, not browser frame time, GPU
cost, loading or sustained gameplay. Browser/backend, power settings and numeric
budgets remain to be recorded under #187/#198. Independent teammate review and
matched production captures on the lab machine are still required for closure
of #194; local CPU/SwiftShader checks do not qualify that hardware.
