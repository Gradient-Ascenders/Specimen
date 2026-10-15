/** Local CPU attribution control. Run with Node 24; this does not measure game FPS. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BobCharacterPresentation } from '../src/render/bob/BobCharacterPresentation.ts';

const poses = ['move-forward', 'move-reverse', 'squash', 'flatten', 'stress'] as const;
type Pose = (typeof poses)[number];
type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

// Diagnostic access to the production method without adding a gameplay API.
interface ProjectionProbe {
  readonly wallContactPositions: Attribute;
  readonly wallContactMorphs: ReadonlyMap<Pose, Attribute>;
  readonly wallContactMorphsRelative: boolean;
  readonly wallNormalLocal: THREE.Vector3;
  readonly poseWeights: Record<Pose, number>;
  findWallContactMinimumProjection(): number;
}

/** Original per-vertex pose selection, retained as the comparison control. */
function originalProjection(this: ProjectionProbe): number {
  const positions = this.wallContactPositions;
  if (!positions) return Infinity;
  let minimumProjection = Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    const baseX = positions.getX(index);
    const baseY = positions.getY(index);
    const baseZ = positions.getZ(index);
    let x = baseX, y = baseY, z = baseZ;
    for (const pose of poses) {
      const weight = this.poseWeights[pose];
      if (weight <= 0) continue;
      const morph = this.wallContactMorphs.get(pose)!;
      x += weight * (morph.getX(index) - (this.wallContactMorphsRelative ? 0 : baseX));
      y += weight * (morph.getY(index) - (this.wallContactMorphsRelative ? 0 : baseY));
      z += weight * (morph.getZ(index) - (this.wallContactMorphsRelative ? 0 : baseZ));
    }
    minimumProjection = Math.min(minimumProjection,
      x * this.wallNormalLocal.x + y * this.wallNormalLocal.y + z * this.wallNormalLocal.z);
  }
  return minimumProjection;
}

const bob = new BobCharacterPresentation(0.45);
try {
  await bob.prepare(async () => {
    const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return (await new GLTFLoader().parseAsync(buffer, '')).scene;
  });
  const probe = bob as unknown as ProjectionProbe;
  const original = originalProjection.bind(probe);
  const optimized = probe.findWallContactMinimumProjection.bind(probe);
  const correctnessCases = 250;
  for (let sample = 0; sample < correctnessCases; sample++) {
    for (const [index, pose] of poses.entries()) probe.poseWeights[pose] = ((sample * (index + 3)) % 23) / 46;
    probe.wallNormalLocal.set(Math.sin(sample * 0.13), Math.cos(sample * 0.17), Math.sin(sample * 0.19)).normalize();
    assert.equal(optimized(), original(), `Projection changed at sample ${sample}`);
  }

  const median = (values: number[]): number => {
    const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const cases: { name: string; weights: Partial<Record<Pose, number>> }[] = [
    { name: 'neutral', weights: {} },
    { name: 'lean', weights: { 'move-forward': 0.6 } },
    { name: 'charge', weights: { squash: 0.75 } },
    { name: 'mixed', weights: { 'move-reverse': 0.25, squash: 0.4 } },
  ];
  const iterations = 300, batches = 12;
  const results: object[] = [];
  let checksum = 0;
  for (const entry of cases) {
    for (const pose of poses) probe.poseWeights[pose] = entry.weights[pose] ?? 0;
    probe.wallNormalLocal.set(0.3, 0.8, 0.5).normalize();
    assert.equal(optimized(), original(), entry.name);
    for (let warmup = 0; warmup < 500; warmup++) { checksum += original(); checksum += optimized(); }
    const samples: Record<'original' | 'optimized', number[]> = { original: [], optimized: [] };
    for (let batch = 0; batch < batches; batch++) {
      // Alternate order to reduce systematic clock/cache drift in the control.
      const order = batch % 2 ? ['optimized', 'original'] as const : ['original', 'optimized'] as const;
      for (const name of order) {
        const project = name === 'original' ? original : optimized;
        const start = performance.now();
        for (let iteration = 0; iteration < iterations; iteration++) checksum += project();
        samples[name].push((performance.now() - start) / iterations);
      }
    }
    results.push({ pose: entry.name, originalMedianMs: median(samples.original),
      optimizedMedianMs: median(samples.optimized), samplesMsPerCall: samples });
  }
  console.log(JSON.stringify({
    scope: 'Isolated local CPU projection; original reference versus the production method. No browser/GPU or game FPS claim.',
    node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model,
    vertices: probe.wallContactPositions.count, supportedPoses: poses.length,
    correctnessCases, maximumProjectionDifference: 0, iterationsPerBatch: iterations, batches,
    results, checksum,
  }, null, 2));
} finally { bob.dispose(); }
