/** Capture a gameplay-camera review without changing the shipped asset or runtime.
 *
 * Run after `npm run build` and candidate generation. The GLB route aliases
 * the two candidate target names to the current loader contract only in this
 * browser session. The visual driver then samples authoritative velocity.
 */
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const evidence = path.join(root, 'docs/evidence/issue-150/locomotion-candidate');
const source = path.join(root, 'assets/characters/bob/bob-locomotion-candidate.glb');
const url = 'http://127.0.0.1:4175';
const clipOnly = process.env.BOB_CAPTURE_CLIP_ONLY === '1';

function previewGlb(bytes) {
  const jsonSize = bytes.readUInt32LE(12);
  const asset = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  for (const mesh of asset.meshes) {
    mesh.extras.targetNames.splice(0, 2, 'move-reach', 'move-gather');
  }
  const json = Buffer.from(JSON.stringify(asset));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(padded.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const output = Buffer.concat([
    Buffer.alloc(12),
    jsonHeader,
    padded,
    bytes.subarray(20 + jsonSize),
  ]);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  return output;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* Preview is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Preview server did not start');
}

await mkdir(evidence, { recursive: true });
const glb = previewGlb(await readFile(source));
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    viewport: clipOnly ? { width: 960, height: 600 } : { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  let bundleCount = 0;
  let assetCount = 0;
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    const match = body.match(pattern);
    if (!match) throw new Error('Could not expose gameplay runtime');
    bundleCount += 1;
    await route.fulfill({ response, body: body.replace(pattern,
      `(globalThis.__specimenBobPreviewRuntime=${match[1]},${match[1]}.prepareLightingPrograms()).then(`) });
  });
  await page.route('**/assets/bob-authored-*.glb', async (route) => {
    assetCount += 1;
    await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: glb });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => {
    const bob = window.__specimenBobPreviewRuntime?.resources?.testScene?.bob;
    return Boolean(bob?.asset);
  }, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const bob = window.__specimenBobPreviewRuntime.resources.testScene.bob;
    const update = bob.update;
    const updateFacing = bob.updateFacing;
    bob.__previewLean = 0;
    bob.__previewSpeedRatio = 0;
    bob.__previewTurnReleased = false;
    // Hold the old heading through the counterlean, then let Bob's existing
    // bounded turn carry him into the new travel heading.
    bob.updateFacing = function (deltaSeconds) {
      if (!this.reversing) this.__previewTurnReleased = false;
      if (this.reversing && this.__previewLean <= -0.65) {
        this.__previewTurnReleased = true;
      }
      if (this.reversing && !this.__previewTurnReleased) return;
      updateFacing.call(this, deltaSeconds);
    };
    bob.update = function (deltaSeconds, state) {
      update.call(this, deltaSeconds, state);
      const forwardX = -Math.sin(this.currentFacingYawRadians);
      const forwardZ = -Math.cos(this.currentFacingYawRadians);
      const speed = state.velocityWorld.x * forwardX + state.velocityWorld.z * forwardZ;
      const maximum = Math.max(state.maximumLocomotionSpeedMetresPerSecond, 1e-6);
      const target = state.grounded && !state.attached && state.jumpCharge === 0
        ? Math.max(-1, Math.min(1, speed / maximum)) : 0;
      const response = 1 - Math.exp(-Math.max(0, deltaSeconds) * (target === 0 ? 7 : 11));
      this.__previewLean += (target - this.__previewLean) * response;
      this.__previewSpeedRatio = Math.min(1, Math.abs(speed) / maximum);
      for (const mesh of [this.asset.body, ...this.asset.eyes]) {
        mesh.morphTargetInfluences[mesh.morphTargetDictionary['move-reach']] =
          Math.max(0, this.__previewLean);
        mesh.morphTargetInfluences[mesh.morphTargetDictionary['move-gather']] =
          Math.max(0, -this.__previewLean);
      }
    };
  });
  await page.evaluate(() => {
    const runtime = window.__specimenBobPreviewRuntime;
    const resources = runtime.resources;
    resources.containmentLevel.setActiveBody(resources.slimePair.activeBody);
    resources.containmentLevel.teleportToRoomForDebug(2);
    resources.testScene.bob.reset();
    resources.testScene.bob.setPosition(resources.body.position);
    runtime.syncContextualCamera(resources);
  });
  await page.waitForFunction(() => window.__specimenBobPreviewRuntime.resources.body.grounded);
  if (clipOnly) {
    await page.evaluate(() => {
      const stream = document.querySelector('canvas').captureStream(15);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      window.__bobPreviewRecording = { recorder, chunks, stream };
      recorder.start(100);
    });
  }
  const readState = () => page.evaluate(() => {
    const resources = window.__specimenBobPreviewRuntime.resources;
    const bob = resources.testScene.bob;
    const p = resources.body.position;
    return {
      position: { x: p.x, y: p.y, z: p.z },
      lean: bob.__previewLean,
      speedRatio: bob.__previewSpeedRatio,
      facingYawRadians: bob.diagnostics.facingYawRadians,
      reversing: bob.diagnostics.reversing,
      grounded: resources.body.grounded,
    };
  });
  const observations = { neutral: await readState() };
  if (!clipOnly) await page.screenshot({ path: path.join(evidence, 'gameplay-neutral.png') });
  await page.keyboard.down('a');
  await page.waitForFunction(() => {
    const bob = window.__specimenBobPreviewRuntime.resources?.testScene?.bob;
    return bob?.__previewSpeedRatio > 0.65 && bob.__previewLean > 0.5;
  }, null, { timeout: 20_000 });
  observations.forward = await readState();
  if (!clipOnly) await page.screenshot({ path: path.join(evidence, 'gameplay-forward.png') });
  await page.keyboard.up('a');
  await page.keyboard.down('d');
  await page.waitForFunction(() => {
    const bob = window.__specimenBobPreviewRuntime.resources?.testScene?.bob;
    return bob?.__previewLean < -0.4;
  }, null, { timeout: 20_000 });
  observations.reversal = await readState();
  if (!clipOnly) await page.screenshot({ path: path.join(evidence, 'gameplay-reversal.png') });
  await page.waitForFunction(() => {
    const bob = window.__specimenBobPreviewRuntime.resources?.testScene?.bob;
    return bob && !bob.diagnostics.reversing;
  }, null, { timeout: 20_000 });
  observations.oppositeTravel = await readState();
  if (!clipOnly) await page.screenshot({ path: path.join(evidence, 'gameplay-opposite-travel.png') });
  await page.keyboard.up('d');
  await page.waitForFunction(() => {
    const bob = window.__specimenBobPreviewRuntime.resources?.testScene?.bob;
    return bob && Math.abs(bob.__previewLean) < 0.05;
  }, null, { timeout: 20_000 });
  observations.settled = await readState();
  if (!clipOnly) await page.screenshot({ path: path.join(evidence, 'gameplay-settled.png') });
  if (clipOnly) {
    const video = await page.evaluate(async () => {
      const { recorder, chunks, stream } = window.__bobPreviewRecording;
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const bytes = new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      }
      return btoa(binary);
    });
    await writeFile(path.join(evidence, 'gameplay-camera-movement.webm'), Buffer.from(video, 'base64'));
  }
  await context.close();
  await writeFile(path.join(evidence, 'gameplay-observations.json'), JSON.stringify({
    candidateAssetRequests: assetCount,
    instrumentedBundles: bundleCount,
    observations,
    pageErrors: errors,
    failedRequests,
  }, null, 2) + '\n');
  if (errors.length || failedRequests.length || assetCount !== 1 || bundleCount !== 1) {
    throw new Error('Gameplay preview had errors or did not load the candidate once');
  }
  console.log(JSON.stringify(observations, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
