/** #193 isolated encounter CPU diagnostic. Same production content and scripted
 * patrol/blocker states in either revision. Does not measure rendering or FPS. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from 'three';

const { values } = parseArgs({ options: {
  root: { type: 'string', default: '.' }, output: { type: 'string', default: 'artifacts/scanner-beams/isolated.json' },
  frames: { type: 'string', default: '360' },
} });
const root = resolve(values.root!), frames = Number(values.frames);
assert.ok(Number.isInteger(frames) && frames >= 60);
const load = (file: string) => import(pathToFileURL(resolve(root, file)).href);
const [{ LevelTwoPreviewScene }, { cultivationAssets }, { RoomFiveDroneEncounter },
  { CollisionWorld, ColliderTransformMode }, { SurfaceRegistry }, { KinematicBody }] = await Promise.all([
  load('src/levels/LevelTwoPreviewScene.ts'), load('scripts/lib/read-cultivation-assets.ts'),
  load('src/hazards/RoomFiveDroneEncounter.ts'), load('src/physics/CollisionWorld.ts'),
  load('src/physics/SurfaceRegistry.ts'), load('src/physics/KinematicBody.ts'),
]);
const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
const room = scene.roomFive, world = new CollisionWorld(), surfaces = new SurfaceRegistry();
scene.root.updateWorldMatrix(true, true);
world.registerAll(scene.collisionMeshes, undefined, ColliderTransformMode.Static);
for (const mesh of scene.dynamicCollisionMeshes) world.setTransformMode(mesh, ColliderTransformMode.Dynamic);
surfaces.registerAll(scene.collisionMeshes);
const bob = new KinematicBody({ world, surfaces, initialPosition: room.root.localToWorld(new THREE.Vector3(-12, 10.66, 23)) });
const goop = new KinematicBody({ world, surfaces, initialPosition: room.root.localToWorld(new THREE.Vector3(44, -10.54, 122)) });
const encounter = new RoomFiveDroneEncounter(room, world, surfaces, bob, goop, () => true);
const camera = new THREE.PerspectiveCamera(110, 1.6, .1, 300);
camera.position.copy(room.root.localToWorld(new THREE.Vector3(0, 22, -15)));
camera.lookAt(room.root.localToWorld(new THREE.Vector3(0, 18, 45)));
const blocker = room.dynamicCollisionMeshes[0], blockerStart = blocker.position.clone();
let cosmeticSweeps = 0, gameplaySweeps = 0;
const sweep = world.sweepSphere.bind(world);
world.sweepSphere = (...args: Parameters<typeof world.sweepSphere>) => {
  if (args[2] === .01) cosmeticSweeps++; else gameplaySweeps++;
  return sweep(...args);
};
const summary = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) };
};
const cases = [], colliders = world.colliderCount;
try {
  for (const steps of [1, 6]) for (const visible of [true, false]) {
    const updateMs: number[] = [], presentationMs: number[] = [], frameMs: number[] = [];
    const sweepCounts: number[] = [], hash = createHash('sha256');
    let gameplayTotal = 0;
    room.restoreCheckpoint('split'); encounter.reset(); room.root.visible = visible;
    const runFrame = (frame: number, record: boolean) => {
      cosmeticSweeps = gameplaySweeps = 0;
      const start = performance.now();
      for (let step = 0; step < steps; step++) {
        const tick = frame * steps + step;
        blocker.position.x = blockerStart.x + Math.sin(tick / 60) * .5;
        if (tick === 90) room.controller.security.select('red');
        if (tick === 150) room.controller.security.toggle('red');
        encounter.update(1 / 60);
      }
      const updated = performance.now();
      encounter.updatePresentation?.(steps / 60, camera);
      const end = performance.now();
      if (record) {
        updateMs.push(updated - start); presentationMs.push(end - updated); frameMs.push(end - start);
        sweepCounts.push(cosmeticSweeps); gameplayTotal += gameplaySweeps;
        hash.update(JSON.stringify({ drones: encounter.drones.map((d: any) => d.readModel),
          health: encounter.damage.health, projectiles: encounter.projectiles.states }));
      }
    };
    for (let frame = 0; frame < 120; frame++) runFrame(frame, false);
    room.restoreCheckpoint('split'); encounter.reset();
    for (let frame = 0; frame < frames; frame++) runFrame(frame, true);
    cases.push({ steps, visible, frames, updateMs: summary(updateMs), presentationMs: summary(presentationMs),
      encounterFrameMs: summary(frameMs), cosmeticSweeps: { total: sweepCounts.reduce((a, b) => a + b, 0),
        meanPerFrame: sweepCounts.reduce((a, b) => a + b, 0) / frames, maxPerFrame: Math.max(...sweepCounts) },
      gameplaySweeps: gameplayTotal, gameplayHash: hash.digest('hex'), raw: { updateMs, presentationMs, sweepCounts } });
  }
} finally { encounter.dispose(); scene.dispose(); world.clear(); surfaces.clear(); }
const report = { recordedAt: new Date().toISOString(), sourceRoot: root,
  environment: { node: process.version, cpu: cpus()[0].model, platform: platform(), kernel: release() },
  protocol: 'Isolated encounter only; full authored production collider registry; fixed targets; matched scripted patrols, network toggles and moving blocker; 120-frame warmup per case; no GPU/FPS claim.',
  colliders, cases };
await mkdir(dirname(resolve(values.output!)), { recursive: true });
await writeFile(values.output!, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(cases.map(({ raw, ...rest }) => rest), null, 2));
