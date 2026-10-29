/** #162: matched, API-staged production game views. Never shipped with the game. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const stage = process.argv[2] ?? 'after';
const output = path.resolve(`artifacts/issue-162/checkpoint-1/${stage}`);
const url = 'http://127.0.0.1:4173/group-folder/';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.SPECIMEN_BROWSER_CHANNEL ?? 'chrome', args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(240_000);
const errors = [], failures = [], captures = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', r => failures.push(`${r.url()} ${r.failure()?.errorText}`));
// The existing shadow-evidence script uses the same response-only runtime access.
await page.route('**/assets/*.js', async route => {
  const response = await route.fetch();
  const body = (await response.text())
    .replace(/([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/, '(globalThis.__containment=$1,$1.prepareLightingPrograms()).then(')
    .replace(/return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/, 'return globalThis.__cultivation=new $1.CultivationLevelRuntime(')
    .replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/, 'class __ExposedBlackout extends $1{constructor(...args){super(...args);globalThis.__blackout=this}}export{__ExposedBlackout as BlackoutLevelRuntime};');
  await route.fulfill({ response, body });
});
try {
  console.log(`Capturing ${stage}: production level transitions`);
  await page.goto(`${url}?debug=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => globalThis.__containment?.state === 'running');
  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__cultivation?.state === 'running');
  await page.evaluate(() => {
    const r = globalThis.__cultivation; r.resources.manager.unlock('volt');
    r.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
  });
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__blackout?.state === 'running');
  const environment = await page.evaluate(() => {
    const r = globalThis.__blackout; r.stop(); r.render = () => {};
    const renderer = r.renderLayer.renderer, gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    document.querySelector('.performance-recorder')?.remove();
    return { userAgent: navigator.userAgent, exposure: renderer.toneMappingExposure,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimerAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
  });
  const views = [
    { name: '01-bay-dark', camera: [1, 3, 10], target: [-3, 0, 17], drone: [-3, 6.61, 17], lit: false },
    { name: '02-drone-spotlight-platform', camera: [1, 3, 12], target: [-3, 0, 17], drone: [-3, 6.61, 17], lit: true },
    { name: '03-entry-floor', camera: [-7, 3.2, 2], target: [-3, 0, 5], drone: [-3, 5, 5], lit: true },
    { name: '04-exit-floor', camera: [9, 3, 44], target: [12, 0, 49], drone: [12, 5, 49], lit: true },
    { name: '05-room-wide', camera: [12, 9, 4], target: [-2, 1, 30], drone: [-3, 6.61, 17], lit: true },
    { name: '06-acid-basin', camera: [-.5, .7, 12], target: [-3, -.5, 16], drone: [-3, 6.61, 17], lit: true },
    { name: '07-wall-spotlight', camera: [-11, 4, 12], target: [-16.6, 2, 17], drone: [-15, 7, 17], lit: true },
    { name: '08-volt-wall', camera: [-11, 2, 1], target: [-16.6, 1, 5], drone: [-3, 6.61, 17], lit: false, volt: [-15.6, .46, 5] },
  ];
  for (const view of views) {
    if (process.env.SPECIMEN_CAPTURE_VIEW && view.name !== process.env.SPECIMEN_CAPTURE_VIEW) continue;
    await page.evaluate(v => {
      const r = globalThis.__blackout, s = r.resources;
      s.scene.maintenanceBay.elapsed = 0; s.scene.maintenanceBay.update(1 / 60, false);
      s.maintenanceDroneFixture.droneRoot.position.set(...v.drone);
      s.dronePresentation.elapsed = 0;
      s.dronePresentation.update(1 / 60, { ...s.maintenanceDrone.readModel, state: v.lit ? 'parked-hover' : 'grounded-idle', lightEnabled: v.lit, powered: v.lit });
      if (v.volt) s.visuals.volt.position.set(...v.volt);
      // Keep the player presentations fixed across runs; no local light is boosted.
      s.bobPresentation.reset(); s.bobPresentation.setPosition(s.group.bobBody.position.clone().set(-3, .61, 17)); s.bobPresentation.present();
      const camera = r.renderLayer.cameraRig.camera;
      camera.position.set(...v.camera); camera.lookAt(...v.target); camera.updateMatrixWorld();
      r.renderLayer.render();
    }, view);
    const metrics = await page.evaluate(async () => {
      const r = globalThis.__blackout, renderer = r.renderLayer.renderer, times = [];
      for (let i = 0; i < 25; i++) {
        await new Promise(requestAnimationFrame); const start = performance.now(); r.renderLayer.render();
        if (i >= 5) times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const materials = new Set(), textures = new Set();
      r.resources.scene.maintenanceBay.root.traverse(o => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m.visible) continue; materials.add(m);
          for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
        }
      });
      return { render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, programs: renderer.info.programs.length,
        bayMaterials: materials.size, bayTextures: textures.size,
        batching: r.resources.scene.maintenanceBay.staticVisuals.diagnostics,
        cpuSubmissionMs: { samples: times.length, p50: times[10], p95: times[19] } };
    });
    await page.locator('canvas').screenshot({ path: path.join(output, `${view.name}.png`) });
    captures.push({ ...view, ...metrics }); console.log(`${view.name}: ${metrics.render.calls} calls, ${metrics.memory.textures} textures`);
  }
  const inventory = await page.evaluate(() => {
    const r = globalThis.__blackout, bay = r.resources.scene.maintenanceBay;
    return bay.collisionMeshes.map(m => ({ name: m.name, position: m.position.toArray(), rotation: m.rotation.toArray(),
      geometry: m.geometry.parameters, material: m.material.name, color: m.material.color?.getHexString(),
      map: m.material.map?.name ?? null, castShadow: m.castShadow, receiveShadow: m.receiveShadow }));
  });
  const lifecycle = await page.evaluate(async () => {
    const r = globalThis.__blackout, renderer = r.renderLayer.renderer;
    const before = { ...renderer.info.memory };
    for (let i = 0; i < 3; i++) { r.restartLevel(); r.stop(); r.renderLayer.render(); }
    const afterRestart = { ...renderer.info.memory };
    r.unload(); r.unload(); r.renderLayer.render();
    const afterUnload = { ...renderer.info.memory };
    await r.load(); await r.preparePresentation(); r.stop(); r.renderLayer.render();
    const afterReload = { ...renderer.info.memory };
    r.unload(); r.renderLayer.render();
    return { before, afterRestart, afterUnload, afterReload, afterSecondUnload: { ...renderer.info.memory } };
  });
  await writeFile(path.join(output, 'measurements.json'), JSON.stringify({ stage, kind: 'API-staged frozen production game views; existing lights unchanged', environment, captures, inventory, lifecycle, errors, failures }, null, 2) + '\n');
  assert.deepEqual(errors, []); assert.deepEqual(failures.filter(f => !f.endsWith('net::ERR_ABORTED')), []);
} finally { await context.close(); await browser.close(); }
