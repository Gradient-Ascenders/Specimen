/** Focused art views using authored geometry, shared lighting and the gameplay camera.
 * This fixture is visual evidence, not a full-game preparation/performance test.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filtration = process.env.PASSAGE_CAPTURE_ROUTE === '2-3';
const output = path.resolve(process.env.PASSAGE_CAPTURE_OUTPUT ?? path.join(root, filtration ? 'artifacts/cultivation-filtration' : 'artifacts/cultivation-passage'));
await mkdir(path.join(root, 'artifacts'), { recursive: true });
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(root, 'artifacts/.passage-preview-'));
const errors = [], failures = [], captures = [];
let browser, server;
try {
  await writeFile(path.join(fixture, 'index.html'), `<!doctype html>
<html><body style="margin:0"><script type="module">
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '/src/levels/LevelTwoPreviewScene.ts';
import { CultivationLevelScene } from '/src/levels/CultivationLevelScene.ts';
import { CULTIVATION_FOUNDATION_MANIFEST } from '/src/levels/CultivationFoundationManifest.ts';
import { CameraRig } from '/src/render/CameraRig.ts';
import { CollisionWorld } from '/src/physics/CollisionWorld.ts';
import { RENDER_EXPOSURE } from '/src/render/RenderLayer.ts';
const preview = new LevelTwoPreviewScene(() => {});
const passage = ${filtration ? 'preview.roomTwoToThreeGoopPassage' : 'preview.roomOneToTwoPassage'};
const art = ${filtration ? 'preview.filtrationArt' : 'preview.passageArt'};
for (const child of preview.root.children) child.visible = child === passage.root;
const foundation = new CultivationLevelScene(CULTIVATION_FOUNDATION_MANIFEST);
foundation.setDarkRoomLighting(false, 1, true);
for (const child of foundation.root.children) child.visible = child.name === 'cultivation-foundation-lighting';
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07110f); scene.add(preview.root, foundation.root);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1440, 900); renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = RENDER_EXPOSURE;
document.body.append(renderer.domElement);
const world = new CollisionWorld(); world.registerAll(preview.collisionMeshes);
const rig = new CameraRig(); rig.resize(1440, 900);
const target = { position: new THREE.Vector3(), previousPosition: new THREE.Vector3(),
  velocity: new THREE.Vector3(), gameplayUp: new THREE.Vector3(0, 1, 0), grounded: true, attached: false };
rig.setFollowTarget(target, world);
globalThis.stagePassage = ({ at, yaw, overview, duct, focus }) => {
  const selected = duct ? preview.roomTwoToThreeBobAirDuct : passage;
  for (const child of preview.root.children) child.visible = child === selected.root;
  target.position.copy(selected.root.localToWorld(new THREE.Vector3(...at)));
  target.previousPosition.copy(target.position);
  rig.reset(); rig.setGroundOrbitYawRadians(yaw);
  if (duct) rig.setFollowDistanceScale(.25);
  rig.update(1, 1 / 60);
  if (overview) rig.camera.lookAt(selected.root.localToWorld(new THREE.Vector3(0, duct ? 1 : 2.1, 14)));
  if (focus) rig.camera.lookAt(selected.root.localToWorld(new THREE.Vector3(...focus)));
  renderer.render(scene, rig.camera);
  return { camera: rig.camera.position.toArray(), art: art?.diagnostics,
    render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, programs: renderer.info.programs.length };
};
globalThis.checkSteadyPassage = () => {
  const before = { ...renderer.info.memory, programs: renderer.info.programs.length };
  for (let i = 0; i < 60; i++) { art?.update?.(1 / 60); renderer.render(scene, rig.camera); }
  return { before, after: { ...renderer.info.memory, programs: renderer.info.programs.length } };
};
const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
globalThis.environment = { gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  userAgent: navigator.userAgent, exposure: renderer.toneMappingExposure };
globalThis.releasePassage = () => { preview.dispose(); foundation.dispose(); world.clear(); renderer.dispose(); };
globalThis.passageReady = true;
</script></body></html>`);
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4184', '--strictPort'], { cwd: root, stdio: 'ignore' });
  const url = 'http://127.0.0.1:4184';
  for (let i = 0; i < 100; i++) {
    if (server.exitCode != null) throw new Error(`Capture preview exited with ${server.exitCode}.`);
    try { if ((await fetch(url)).ok) break; } catch { /* Starting preview. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  const fixtureUrl = path.relative(root, fixture).split(path.sep).join('/');
  await page.goto(`${url}/${fixtureUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.passageReady, undefined, { timeout: 120_000 });
  const environment = await page.evaluate(() => globalThis.environment);
  for (const [name, at, yaw, focus] of [
    ['overview', [0, .66, 6.4], Math.PI],
    ['entrance', [0, .66, 6.4], Math.PI],
    [filtration ? 'filters' : 'observation', [0, .66, 10.7], Math.PI * 1.38],
    ['service-bay', [0, .66, 16.5], Math.PI * .62],
    [filtration ? 'exit' : 'decontamination', [0, .66, 23], Math.PI],
    ...(filtration ? [
      ['filter-detail', [0, .66, 10.7], Math.PI * 1.38, [3.7, 3.05, 12]],
      ['cradle-detail', [0, .66, 16.5], Math.PI * .62, [-3.8, 2.95, 20.2]],
      ['duct', [0, .46, 12], Math.PI],
    ] : []),
  ]) {
    const state = await page.evaluate(pose => globalThis.stagePassage(pose), { at, yaw, overview: name === 'overview', duct: name === 'duct', focus });
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    captures.push({ name, cameraMode: name === 'overview' ? 'staged overview' : focus ? 'staged detail' : 'native gameplay camera', ...state });
    console.log(`Captured ${name}`);
  }
  await page.evaluate(() => globalThis.stagePassage({ at: [0, .66, 6.4], yaw: Math.PI, overview: true }));
  const steady = await page.evaluate(() => globalThis.checkSteadyPassage());
  assert.deepEqual(steady.after, steady.before, 'steady frames retain geometry, texture and shader counts');
  await page.evaluate(() => globalThis.releasePassage());
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify({
    kind: 'Isolated authored-passage art fixture; shared foundation lighting, native camera poses and a staged overview; no characters or full-game preparation/performance claim',
    environment, captures, steady, errors, failures,
  }, null, 2) + '\n');
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
} finally {
  await browser?.close(); server?.kill(); await rm(fixture, { recursive: true, force: true });
}
