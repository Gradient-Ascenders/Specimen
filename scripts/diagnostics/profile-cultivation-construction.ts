/** Local CPU diagnostic: construction only, never an FPS or loading budget. */
import { Session } from 'node:inspector';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';

const option = (key: string) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? undefined : process.argv[index + 1];
};
const baselineRoot = option('--baseline-root');
const root = baselineRoot ? resolve(baselineRoot) : resolve('.');
const { LevelTwoPreviewScene } = await import(pathToFileURL(resolve(root, 'src/levels/LevelTwoPreviewScene.ts')).href);
const decodeStart = performance.now();
const assets = baselineRoot ? undefined : (await import('../lib/read-cultivation-assets.ts')).cultivationAssets;
const assetReadAndDecodeMs = baselineRoot ? null : performance.now() - decodeStart;
globalThis.gc?.();
const session = new Session(); session.connect();
const post = (method: string, params = {}): Promise<any> => new Promise((resolve, reject) => {
  session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
});
await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 1000 });
await post('Profiler.start');
const before = process.memoryUsage(), start = performance.now();
const scene = new LevelTwoPreviewScene(() => {}, assets);
const constructionMs = performance.now() - start, after = process.memoryUsage();
const { profile } = await post('Profiler.stop'); session.disconnect();
const parents = new Map<number, number>(), nodes = new Map<number, any>();
for (const node of profile.nodes) {
  nodes.set(node.id, node);
  for (const child of node.children ?? []) parents.set(child, node.id);
}
let repairSampleMs = 0, gcSampleMs = 0;
const hotspotNames = /createCoplanarSurfaceRepairs|generateCultivationSurfaceRepairs/;
for (let index = 0; index < profile.samples.length; index++) {
  let id: number | undefined = profile.samples[index], repair = false, gc = false;
  while (id !== undefined) {
    const node = nodes.get(id);
    repair ||= hotspotNames.test(node.callFrame.functionName);
    gc ||= node.callFrame.functionName === '(garbage collector)';
    id = parents.get(id);
  }
  const ms = profile.timeDeltas[index] / 1000;
  if (repair) repairSampleMs += ms;
  if (gc) gcSampleMs += ms;
}
const report = {
  mode: baselineRoot ? 'baseline' : 'baked', node: process.version,
  machine: { cpu: cpus()[0].model, platform: platform(), release: release() },
  constructionMs, assetReadAndDecodeMs, repairSampleMs, gcSampleMs,
  heapDeltaBytes: after.heapUsed - before.heapUsed, externalDeltaBytes: after.external - before.external,
  repairedMeshes: scene.surfaceCleanup.repairedMeshes,
  note: 'One local cold construction. Asset read/decode is separate; samples are nested attribution, not additive phases. No GPU or target-hardware qualification.',
};
scene.dispose();
const output = resolve(option('--output') ?? `artifacts/perf-192/${report.mode}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
await writeFile(output.replace(/\.json$/, '.cpuprofile'), JSON.stringify(profile));
console.log(JSON.stringify(report, null, 2));
