/** CPU-only collision attribution. Run the same script against either revision
 * with --root; scene content always comes from that root's production classes. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector/promises';
import { cpus, platform, release } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from 'three';
import type { CollisionQueryDiagnostics } from '../src/physics/CollisionWorld.ts';

const { values } = parseArgs({ options: {
  root: { type: 'string', default: '.' },
  output: { type: 'string', default: 'artifacts/collision-broadphase/report.json' },
  queries: { type: 'string', default: '4096' },
  allocations: { type: 'boolean', default: false },
  revision: { type: 'string' },
} });
const root = resolve(values.root!), queries = Number(values.queries), output = resolve(values.output!);
assert.ok(Number.isInteger(queries) && queries >= 256);
const revision = values.revision ?? (() => {
  try { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
})();
const load = (file: string) => import(pathToFileURL(resolve(root, file)).href);
const [{ ContainmentLevelScene }, { LevelTwoPreviewScene }, { cultivationAssets },
  { CollisionWorld, ColliderTransformMode, CollisionHit, CollisionLayer }] = await Promise.all([
  load('src/levels/ContainmentLevelScene.ts'), load('src/levels/LevelTwoPreviewScene.ts'),
  load('scripts/lib/read-cultivation-assets.ts'), load('src/physics/CollisionWorld.ts'),
]);

interface BenchmarkScene {
  readonly name: string;
  readonly collisionMeshes: readonly THREE.Mesh[];
  readonly dynamicCollisionMeshes: readonly THREE.Mesh[];
  readonly cameraObstructionMeshes?: readonly THREE.Mesh[];
  readonly probeMeshes?: readonly THREE.Mesh[];
  readonly root: THREE.Object3D;
  dispose(): void;
}

// Shared unit geometry; no visuals/material work is included in the timings.
const stress = (name: string, distant: number, dense = 0, dynamic = 4): BenchmarkScene => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry(2, 2, 2);
  const collisionMeshes: THREE.Mesh[] = [], dynamicCollisionMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 64 + distant + dense + dynamic; i++) {
    const mesh = new THREE.Mesh(geometry);
    if (i < 64) mesh.position.set((i % 8) * 4, 0, Math.floor(i / 8) * 4);
    else if (i < 64 + distant) mesh.position.set(1000 + (i % 100) * 20, 0, 1000 + Math.floor(i / 100) * 20);
    else if (i < 64 + distant + dense) mesh.position.set((i % 10) * .1, (i % 7) * .1, (i % 13) * .1);
    else {
      mesh.position.set((i % 8) * 4, 0, (i % 7) * 4);
      dynamicCollisionMeshes.push(mesh);
    }
    root.add(mesh); collisionMeshes.push(mesh);
  }
  return { name, root, collisionMeshes, dynamicCollisionMeshes,
    probeMeshes: collisionMeshes.slice(0, 64), dispose: () => { root.clear(); geometry.dispose(); } };
};
const factories: (() => BenchmarkScene)[] = [
  () => Object.assign(new ContainmentLevelScene(() => {}), { name: 'containment-production' }),
  // LevelTwoPreviewScene is the authored production Cultivation implementation.
  () => Object.assign(new LevelTwoPreviewScene(() => {}, cultivationAssets), { name: 'cultivation-production' }),
  () => stress('local-64', 0),
  () => stress('local-64-plus-10000-distant', 10000),
  () => stress('dense-1024', 0, 1024),
  () => stress('dynamic-256', 0, 0, 256),
];
const rows: Record<string, unknown>[] = [];
const profileDirectory = resolve(dirname(output), `${basename(output, '.json')}-profiles`);
if (values.allocations) await mkdir(profileDirectory, { recursive: true });
for (const factory of factories) {
  const scene = factory();
  scene.root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3(), centre = new THREE.Vector3(), size = new THREE.Vector3();
  const cases = (scene.probeMeshes ?? scene.collisionMeshes).map((mesh, index) => {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    bounds.getCenter(centre); bounds.getSize(size);
    const axis = index % 3, direction = new THREE.Vector3().setComponent(axis, 1);
    const distance = size.getComponent(axis) + 2;
    return { origin: centre.clone().addScaledVector(direction, -distance / 2),
      displacement: direction.clone().multiplyScalar(distance), direction, distance,
      radius: index % 5 === 0 ? .22 : .45,
      mask: index % 11 === 0 ? CollisionLayer.CameraObstruction
        : index % 7 === 0 ? CollisionLayer.Projectile : CollisionLayer.Movement };
  });
  try {
    for (const broadphaseEnabled of [false, true]) {
      const world = new CollisionWorld({ broadphaseEnabled });
      world.registerAll(scene.collisionMeshes, undefined, ColliderTransformMode.Static);
      for (const mesh of scene.dynamicCollisionMeshes) world.setTransformMode(mesh, ColliderTransformMode.Dynamic);
      world.registerAll(scene.cameraObstructionMeshes ?? [], CollisionLayer.CameraObstruction, ColliderTransformMode.Static);
      const hit = new CollisionHit();
      const names = new Map<THREE.Mesh, number>([...scene.collisionMeshes, ...scene.cameraObstructionMeshes ?? []].map((mesh, i) => [mesh, i]));
      const hasWorkDiagnostics = typeof world.getLastQueryDiagnostics === 'function';
      try {
        for (const kind of ['sweep', 'ray'] as const) for (const stableTransforms of [false, true]) {
          const query = (index: number) => {
            const c = cases[index % cases.length];
            return kind === 'sweep'
              ? world.sweepSphere(c.origin, c.displacement, c.radius, hit, c.mask)
              : world.raycast(c.origin, c.direction, c.distance, hit, c.mask);
          };
          // Stable scopes model synchronous scanner/visual batches of 32;
          // ordinary queries model movement, camera, projectiles and LOS.
          const batch = (count: number) => {
            for (let start = 0; start < count; start += 32) {
              const run = () => { for (let i = start; i < Math.min(start + 32, count); i++) query(i); };
              if (stableTransforms) world.withStableQueryTransforms(run); else run();
            }
          };
          batch(Math.max(cases.length, 1024));
          const rounds = 5, wallMicrosecondsPerQuery: number[] = [], cpuMicrosecondsPerQuery: number[] = [];
          for (let round = 0; round < rounds; round++) {
            const cpuStart = process.cpuUsage(), started = performance.now();
            batch(queries);
            const elapsed = performance.now() - started, cpu = process.cpuUsage(cpuStart);
            wallMicrosecondsPerQuery.push(elapsed * 1000 / queries);
            cpuMicrosecondsPerQuery.push((cpu.user + cpu.system) / queries);
          }
          // Hash and diagnostics are deliberately outside the timed/allocation sections.
          const hash = createHash('sha256');
          let candidates = 0, narrow = 0, dynamicVisits = 0, staticVisits = 0, bufferGrowth = 0;
          for (let i = 0; i < cases.length; i++) {
            const found = query(i);
            hash.update(JSON.stringify([found, hit.object ? names.get(hit.object) : null,
              hit.fraction, hit.point.toArray(), hit.normal.toArray()]));
            if (hasWorkDiagnostics) {
              const d: CollisionQueryDiagnostics = world.getLastQueryDiagnostics();
              candidates += d.candidates; narrow += d.narrowPhaseChecks;
              dynamicVisits += d.dynamicCollidersVisited; staticVisits += d.staticEntriesVisited;
              bufferGrowth += d.candidateBufferGrowth;
            } else if (kind === 'sweep') {
              const d = world.getLastSweepDiagnostics();
              candidates += d.broadphaseCandidates; narrow += d.narrowPhaseChecks;
            }
          }
          let allocationSampling: Record<string, unknown> | null = null;
          if (values.allocations) {
            const session = new Session(); session.connect();
            try {
              await session.post('HeapProfiler.startSampling', { samplingInterval: 1024,
                includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
              batch(queries);
              const { profile } = await session.post('HeapProfiler.stopSampling');
              let collisionBytes = 0, totalBytes = 0;
              const visit = (node: typeof profile.head, insideCollision: boolean) => {
                const inside = insideCollision || node.callFrame.url.endsWith('/src/physics/CollisionWorld.ts');
                totalBytes += node.selfSize;
                if (inside) collisionBytes += node.selfSize;
                for (const child of node.children) visit(child, inside);
              };
              visit(profile.head, false);
              allocationSampling = { queries, samplingIntervalBytes: 1024,
                estimatedTotalBytes: totalBytes, estimatedCollisionBytes: collisionBytes,
                estimatedCollisionBytesPerQuery: collisionBytes / queries,
                includesCollectedObjects: true, exactAllocationCount: null };
              const profilePath = resolve(profileDirectory, `${scene.name}-${broadphaseEnabled}-${kind}-${stableTransforms}.heapprofile`);
              await writeFile(profilePath, JSON.stringify(profile));
              allocationSampling.profilePath = profilePath;
            } finally { session.disconnect(); }
          }
          rows.push({ scene: scene.name, mode: broadphaseEnabled ? 'broadphase' : 'exhaustive', kind, stableTransforms,
            registeredColliders: world.colliderCount, dynamicColliders: scene.dynamicCollisionMeshes.length,
            queryCases: cases.length, timedQueries: queries * rounds, wallMicrosecondsPerQuery, cpuMicrosecondsPerQuery,
            averageCandidates: hasWorkDiagnostics || kind === 'sweep' ? candidates / cases.length : null,
            averageNarrowChecks: hasWorkDiagnostics || kind === 'sweep' ? narrow / cases.length : null,
            averageDynamicVisits: hasWorkDiagnostics ? dynamicVisits / cases.length : null,
            averageStaticEntriesVisited: hasWorkDiagnostics ? staticVisits / cases.length : null,
            candidateBufferGrowthAfterWarmup: hasWorkDiagnostics ? bufferGrowth : null,
            resultHash: hash.digest('hex'), allocationSampling });
          console.log(`${scene.name} ${broadphaseEnabled ? 'broadphase' : 'exhaustive'} ${kind} stable=${stableTransforms}`);
        }
      } finally { world.clear(); }
    }
  } finally { scene.dispose(); }
}
// Exhaustive parity is a hard gate; timing thresholds belong on target hardware.
for (const row of rows.filter(row => row.mode === 'broadphase')) {
  const reference = rows.find(other => other.scene === row.scene && other.kind === row.kind &&
    other.stableTransforms === row.stableTransforms && other.mode === 'exhaustive');
  assert.equal(row.resultHash, reference?.resultHash, `Reference mismatch: ${row.scene}/${row.kind}/${row.stableTransforms}`);
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ recordedAt: new Date().toISOString(), sourceRoot: root, revision,
  contentMode: 'authored-production-colliders', viewport: null, graphicsProfile: null, gpu: null,
  instrumentation: 'Node CPU counters; optional separate V8 allocation sampling; no renderer',
  environment: { node: process.version, cpu: cpus()[0]?.model, logicalProcessors: cpus().length, platform: platform(), kernel: release() },
  protocol: 'CPU microbenchmark; static geometry poses; per-collider production probes and local/dense/dynamic stress. 1024+ warmup queries, five timed rounds. Allocation sampling is separate, statistical and includes collected objects; buffer growth counts explicit storage slots only. No GPU/FPS or lab qualification claim.',
  sourceSha256: { collisionWorld: createHash('sha256').update(await readFile(resolve(root, 'src/physics/CollisionWorld.ts'))).digest('hex'),
    benchmark: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex') },
  rows }, null, 2) + '\n');
console.log(`Wrote ${rows.length} cases with exhaustive hit parity to ${output}`);
