/** Small production-build diagnostic, not representative-hardware sign-off. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = 'http://127.0.0.1:4178';
const sampleFrames = Number(process.env.SPECIMEN_PROFILE_FRAMES ?? 12);
assert.ok(Number.isInteger(sampleFrames) && sampleFrames >= 4 && sampleFrames <= 120);
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], {
  cwd: root, stdio: 'ignore',
});
const launchArgs = [
  '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(baseUrl)).ok) break; } catch { /* Server is starting. */ }
    if (attempt === 99) throw new Error('Production preview did not start.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ args: launchArgs, executablePath: process.env.SPECIMEN_PROFILE_BROWSER });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180_000);
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push(request.url()));
  let exposures = 0;
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    let body = await response.text();
    const exported = /export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/;
    const match = body.match(exported);
    if (match) {
      exposures++;
      body = body.replace(exported,
        `class ProfiledBlackout extends ${match[1]}{constructor(...args){super(...args);globalThis.__transitProfileRuntime=this}}export{ProfiledBlackout as BlackoutLevelRuntime};`);
    }
    await route.fulfill({ response, body });
  });
  console.error('Preparing the production game and entering Blackout via the Level 1 shortcut.');
  await page.goto(`${baseUrl}/?debug=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').waitFor({ state: 'visible' });
  await page.locator('[data-action="start"]').click();
  await page.keyboard.press('Minus');
  await page.locator('[data-action="enter-level"]').waitFor({ state: 'visible' });
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__transitProfileRuntime?.state === 'running' &&
    globalThis.__transitProfileRuntime.resources?.bobPresentation.ready, undefined, { timeout: 180_000 });
  assert.equal(exposures, 1);
  await page.keyboard.press('2');
  await page.waitForFunction(() => globalThis.__transitProfileRuntime?.roomState.roomId === 'room-2');
  await page.evaluate(() => globalThis.__transitProfileRuntime.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI));

  const sample = async label => {
    console.error(`Sampling ${label}.`);
    const result = await page.evaluate(async ({ label, frames }) => {
      const runtime = globalThis.__transitProfileRuntime;
      for (let warmup = 0; warmup < 4; warmup++) await new Promise(requestAnimationFrame);
      let previous = await new Promise(requestAnimationFrame);
      const frameMilliseconds = [];
      for (let frame = 0; frame < frames; frame++) {
        const current = await new Promise(requestAnimationFrame);
        frameMilliseconds.push(current - previous);
        previous = current;
      }
      const renderer = runtime.renderLayer.renderer;
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const lights = runtime.resources.transit.searchLights;
      return {
        label, frameMilliseconds,
        diagnostics: runtime.renderLayer.getDiagnostics(),
        room: runtime.roomState.roomId, state: runtime.state,
        cameraPosition: runtime.renderLayer.cameraRig.camera.position.toArray(),
        lightBanksLatched: runtime.resources.transit.lights.map(receiver => receiver.latched),
        searchlights: lights.map(light => ({
          name: light.name, castShadow: light.castShadow, visible: light.visible,
          mapSize: light.shadow.mapSize.toArray(),
          allocatedMapSize: light.shadow.map ? [light.shadow.map.width, light.shadow.map.height] : null,
        })),
        graphicsRenderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        graphicsVendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      };
    }, { label, frames: sampleFrames });
    assert.equal(result.room, 'room-2');
    assert.equal(result.state, 'running');
    assert.equal(result.searchlights.length, 3);
    const ordered = [...result.frameMilliseconds].sort((a, b) => a - b);
    result.frameTime = {
      samples: ordered.length,
      p50Milliseconds: ordered[Math.floor(ordered.length * .5)],
      p95Milliseconds: ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * .95))],
      maximumMilliseconds: ordered.at(-1),
    };
    console.error(JSON.stringify({ label, frameTime: result.frameTime, diagnostics: result.diagnostics }));
    return result;
  };
  const unpowered = await sample('cp3-unpowered-three-1024-shadow-searchlights');
  for (const light of unpowered.searchlights) {
    assert.equal(light.castShadow, true);
    assert.deepEqual(light.mapSize, [1024, 1024]);
    assert.deepEqual(light.allocatedMapSize, [1024, 1024]);
  }
  // Authored puzzle-state setup: this is a lighting diagnostic, not a claim
  // that a complete cooperation playthrough was performed by the browser.
  await page.evaluate(() => {
    const runtime = globalThis.__transitProfileRuntime;
    for (const receiver of runtime.resources.transit.lights) receiver.target.setConnectionState(true);
    for (let step = 0; step < 100; step++) runtime.fixedUpdate(1 / 60);
  });
  const powered = await sample('cp3-all-three-light-banks-latched');
  assert.ok(powered.lightBanksLatched.every(Boolean));

  const recovery = [];
  for (let iteration = 0; iteration < 2; iteration++) {
    await page.evaluate(async () => {
      globalThis.__transitProfileRuntime.recoverActiveCheckpoint();
      for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    });
    const diagnostics = await page.evaluate(() => globalThis.__transitProfileRuntime.renderLayer.getDiagnostics());
    recovery.push(diagnostics);
  }
  for (const key of ['geometries', 'textures', 'programs']) assert.equal(recovery[0][key], recovery[1][key], `${key} grew after repeated CP3 recovery`);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    recordedAt: new Date().toISOString(), browserVersion: browser.version(),
    viewport: { width: 640, height: 360 }, pixelRatio: 1, launchArgs,
    softwareRendererDiagnosticOnly: true, unpowered, powered, recovery, errors, failedRequests,
  }, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
