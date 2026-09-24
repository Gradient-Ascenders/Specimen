/** Record Bob's shipped asset and production movement from the gameplay camera. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const evidence = path.join(root, 'docs/evidence/issue-150/locomotion-runtime');
const url = 'http://127.0.0.1:4175';
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) break;
    } catch { /* Server is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 99) throw new Error('Preview server did not start');
  }
  browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  let exposedBundles = 0;
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    const match = body.match(pattern);
    if (!match) throw new Error('Could not expose production runtime');
    exposedBundles += 1;
    await route.fulfill({ response, body: body.replace(pattern,
      `(globalThis.__bobRuntime=${match[1]},${match[1]}.prepareLightingPrograms()).then(`) });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => Boolean(window.__bobRuntime?.resources?.testScene?.bob?.ready),
    null, { timeout: 120_000 });
  const visitRoom = async (room) => {
    await page.evaluate((roomId) => {
      const runtime = window.__bobRuntime;
      const resources = runtime.resources;
      resources.containmentLevel.setActiveBody(resources.slimePair.activeBody);
      resources.containmentLevel.teleportToRoomForDebug(roomId);
      resources.testScene.bob.reset();
      resources.testScene.bob.setPosition(resources.body.position);
      runtime.syncContextualCamera(resources);
    }, room);
    await page.waitForFunction(() => window.__bobRuntime.resources.body.grounded);
  };
  const sample = () => page.evaluate(() => {
    const resources = window.__bobRuntime.resources;
    const bob = resources.testScene.bob;
    const body = resources.body;
    const morph = bob.root.getObjectByName('Bob-Body');
    const weight = (name) => morph.morphTargetInfluences[morph.morphTargetDictionary[name]];
    return {
      position: { x: body.position.x, y: body.position.y, z: body.position.z },
      velocity: { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z },
      grounded: body.grounded,
      attached: body.attached,
      supportNormal: {
        x: body.groundNormal.x,
        y: body.groundNormal.y,
        z: body.groundNormal.z,
      },
      forward: weight('move-forward'),
      reverse: weight('move-reverse'),
      squash: weight('squash'),
      flatten: weight('flatten'),
      launch: weight('launch'),
      airborne: weight('airborne'),
      facingYawRadians: bob.diagnostics.facingYawRadians,
      reversing: bob.diagnostics.reversing,
    };
  });
  const recordStart = () => page.evaluate(() => {
    const stream = document.querySelector('canvas').captureStream(15);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    window.__bobRecording = { stream, recorder, chunks };
    recorder.start(100);
  });
  const recordStop = () => page.evaluate(async () => {
    const { stream, recorder, chunks } = window.__bobRecording;
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
  await mkdir(evidence, { recursive: true });
  await visitRoom(2);
  await recordStart();
  const observations = { neutral: await sample() };
  await page.keyboard.down('a');
  try {
    await page.waitForFunction(() => {
      const bob = window.__bobRuntime.resources.testScene.bob;
      const body = bob.root.getObjectByName('Bob-Body');
      return body.morphTargetInfluences[body.morphTargetDictionary['move-forward']] > 0.65;
    }, null, { timeout: 10_000 });
  } catch (error) {
    console.error('Acceleration checkpoint:', await sample());
    throw error;
  }
  observations.accelerating = await sample();
  await page.waitForTimeout(350);
  observations.cruising = await sample();
  await page.keyboard.up('a');
  await page.waitForFunction(() => window.__bobRuntime.resources.testScene.bob.diagnostics.speed === 0,
    null, { timeout: 5_000 });
  observations.stopping = await sample();
  await page.waitForFunction(() => window.__bobRuntime.resources.testScene.bob.diagnostics.locomotionStrength < 0.05,
    null, { timeout: 5_000 });
  observations.settled = await sample();
  await page.keyboard.down('d');
  await page.waitForFunction(() => {
    const bob = window.__bobRuntime.resources.testScene.bob;
    const body = bob.root.getObjectByName('Bob-Body');
    return bob.diagnostics.reversing &&
      body.morphTargetInfluences[body.morphTargetDictionary['move-reverse']] > 0.25;
  }, null, { timeout: 10_000 });
  observations.counterlean = await sample();
  await page.waitForFunction(() => !window.__bobRuntime.resources.testScene.bob.diagnostics.reversing,
    null, { timeout: 10_000 });
  observations.reversed = await sample();
  await page.keyboard.up('d');
  await page.waitForFunction(() => window.__bobRuntime.resources.testScene.bob.diagnostics.speed === 0,
    null, { timeout: 5_000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  observations.charge = await sample();
  await page.keyboard.up('Space');
  await page.waitForFunction(() => !window.__bobRuntime.resources.body.grounded,
    null, { timeout: 5_000 });
  observations.takeoff = await sample();
  await page.waitForFunction(() => window.__bobRuntime.resources.body.grounded,
    null, { timeout: 10_000 });
  observations.landing = await sample();

  await visitRoom(1);
  await page.evaluate(() => {
    const runtime = window.__bobRuntime;
    const resources = runtime.resources;
    resources.body.recoverAt(resources.body.position.clone().set(-4.8, 0.46, 5.1));
    resources.testScene.bob.reset();
    resources.testScene.bob.setPosition(resources.body.position);
    runtime.syncContextualCamera(resources);
  });
  let wallKey;
  for (const key of ['w', 's', 'a', 'd']) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(() => {
        const body = window.__bobRuntime.resources.body;
        return body.attached && Math.abs(body.groundNormal.y) < 0.5 &&
          body.position.y > 1;
      }, null, { timeout: 3000 });
      wallKey = key;
      break;
    } catch {
      await page.keyboard.up(key);
      await page.evaluate(() => {
        const runtime = window.__bobRuntime;
        const resources = runtime.resources;
        resources.body.recoverAt(resources.body.position.clone().set(-4.8, 0.46, 5.1));
        resources.testScene.bob.reset();
        resources.testScene.bob.setPosition(resources.body.position);
        runtime.syncContextualCamera(resources);
      });
    }
  }
  if (!wallKey) throw new Error('Could not reach the sticky wall through controls');
  observations.wallAttach = { key: wallKey, ...await sample() };
  await page.keyboard.up(wallKey);
  const clip = Buffer.from(await recordStop(), 'base64');
  await writeFile(path.join(evidence, 'gameplay-camera-movement.webm'), clip);
  await writeFile(path.join(evidence, 'observations.json'), JSON.stringify({
    runtimeAsset: 'bob-authored.glb',
    temporaryMotionDriver: false,
    exposedBundles,
    observations,
    pageErrors,
    failedRequests,
  }, null, 2) + '\n');
  if (exposedBundles !== 1 || pageErrors.length || failedRequests.length) {
    throw new Error('Production capture had errors or failed requests');
  }
  if (observations.cruising.forward <= 0.65 || observations.counterlean.reverse <= 0.25 ||
      !observations.takeoff.airborne && !observations.takeoff.launch ||
      !observations.landing.grounded || !observations.wallAttach.attached ||
      Math.abs(observations.wallAttach.supportNormal.y) >= 0.5) {
    throw new Error('Production movement did not reach the required checkpoints');
  }
  console.log(JSON.stringify({ clipBytes: clip.length, observations, pageErrors, failedRequests }, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
