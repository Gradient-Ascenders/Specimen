/** #162: matched, API-staged production game views. Never shipped with the game. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const stage = process.argv[2] ?? 'after';
const output = path.resolve(`artifacts/issue-162/checkpoint-2/${stage}`);
const url = process.env.SPECIMEN_CAPTURE_URL ?? 'http://127.0.0.1:4173/group-folder/';
await mkdir(output, { recursive: true });
const writeEvidence = async (filename, data) => {
  for (let attempt = 0; ; attempt++) {
    try { await writeFile(filename, JSON.stringify(data, null, 2) + '\n'); return; }
    catch (error) {
      if (attempt >= 5 || !['UNKNOWN', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      await delay(200);
    }
  }
};
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
    const r = globalThis.__blackout; r.stop(); r.__savedRender = r.render.bind(r); r.render = () => {};
    const renderer = r.renderLayer.renderer, gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    document.querySelector('.performance-recorder')?.remove();
    return { userAgent: navigator.userAgent, exposure: renderer.toneMappingExposure,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimerAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
  });
  const views = [
    { name: '17-drone-shell-detail', camera: [-.9, 2.5, 3.3], target: [-3, .5, 5], drone: [-3, .32, 5], lit: false, volt: [-3.8, 1.5, 4.5] },
    { name: '18-door-closed', camera: [3.5, 2.8, 49.5], target: [6, 2, 54], drone: [-3, 6.61, 17], lit: false, volt: [6.5, 1.5, 51.5] },
    { name: '19-vent-entrance-arcs', camera: [-4.6, 1.8, 51.4], target: [-6, 1.1, 54], drone: [-3, 6.61, 17], lit: false, volt: [-6.6, .46, 52.7], time: .08 },
    { name: '09-circuit-red', camera: [-7.5, 3.7, 50.5], target: [-9, 3, 53.6], drone: [-3, 6.61, 17], lit: false, volt: [-9, 1, 51.5] },
    { name: '10-circuit-green', camera: [-7.5, 3.7, 50.5], target: [-9, 3, 53.6], drone: [-3, 6.61, 17], lit: false, volt: [-9, 1, 51.5], connected: true },
    { name: '11-door-open', camera: [4, 2.4, 49], target: [6, 2, 54], drone: [-3, 6.61, 17], lit: false, volt: [6, .46, 51], connected: true },
    { name: '12-duct-sparks', camera: [-6, 1.3, 54.5], target: [-6, 1, 59], drone: [-3, 6.61, 17], lit: false, volt: [-6, .46, 56] },
    { name: '13-drone-close-unpowered', camera: [-1.5, 1.9, 3.3], target: [-3, .5, 5], drone: [-3, .32, 5], lit: false, volt: [-3, .46, 3.8] },
    { name: '14-drone-powered-parked', camera: [-1.5, 3.2, 3.3], target: [-3, 1.7, 5], drone: [-3, 1.5, 5], lit: true, volt: [-3, .46, 3.8] },
    { name: '15-hallway-dropout', camera: [6.9, 2.4, 55.5], target: [6, 1.8, 66], drone: [-3, 6.61, 17], lit: false, volt: [-15.6, .46, 5], time: .2 },
    { name: '16-hallway-bright', camera: [6.9, 2.4, 55.5], target: [6, 1.8, 66], drone: [-3, 6.61, 17], lit: false, volt: [-15.6, .46, 5], time: 2 },
    { name: '01-bay-dark', camera: [1, 3, 10], target: [-3, 0, 17], drone: [-3, 6.61, 17], lit: false },
    { name: '02-drone-spotlight-platform', camera: [1, 3, 12], target: [-3, 0, 17], drone: [-3, 6.61, 17], lit: true },
    { name: '03-entry-floor', camera: [-7, 3.2, 2], target: [-3, 0, 5], drone: [-3, 5, 5], lit: true },
    { name: '04-exit-floor', camera: [9, 3, 44], target: [12, 0, 49], drone: [12, 5, 49], lit: true },
    { name: '05-room-wide', camera: [12, 9, 4], target: [-2, 1, 30], drone: [-3, 6.61, 17], lit: true },
    { name: '06-acid-basin', camera: [-.5, .7, 12], target: [-3, -.5, 16], drone: [-3, 6.61, 17], lit: true },
    { name: '07-wall-spotlight', camera: [-11, 4, 12], target: [-16.6, 2, 17], drone: [-15, 7, 17], lit: true },
    { name: '08-volt-wall', camera: [-11, 2, 1], target: [-16.6, 1, 5], drone: [-3, 6.61, 17], lit: false, volt: [-15.6, .46, 5] },
  ];
  const captureFilter = process.env.SPECIMEN_CAPTURE_VIEW?.split(',');
  for (const view of views) {
    if (captureFilter && !captureFilter.includes(view.name)) continue;
    await page.evaluate(v => {
      const r = globalThis.__blackout, s = r.resources;
      s.maintenanceBay.reset();
      if (v.connected) {
        s.maintenanceBay.target.setConnectionState(true);
        for (let i = 0; i < 120; i++) s.maintenanceBay.update(1 / 60, { bob: s.group.bobBody, goop: s.group.goopBody, volt: s.group.voltBody });
      }
      s.scene.maintenanceBay.elapsed = v.time ?? 0; s.scene.maintenanceBay.update(1 / 60, !!v.connected);
      s.maintenanceDroneFixture.droneRoot.position.set(...v.drone);
      s.dronePresentation.elapsed = 0;
      s.dronePresentation.update(1 / 60, { ...s.maintenanceDrone.readModel, state: v.lit ? 'parked-hover' : 'grounded-idle', lightEnabled: v.lit, powered: v.lit });
      s.visuals.volt.position.set(...(v.volt ?? [2, .46, 2]));
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
      // GPU elapsed queries measure completed GPU work, separately from CPU submission.
      const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const gpuTimes = []; let rejectedQueries = 0;
      if (timer) for (let i = 0; i < 20; i++) {
        await new Promise(requestAnimationFrame);
        const query = gl.createQuery();
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query); r.renderLayer.render(); gl.endQuery(timer.TIME_ELAPSED_EXT);
        let ready = false;
        for (let frame = 0; frame < 120 && !ready; frame++) {
          await new Promise(requestAnimationFrame); ready = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
        }
        if (ready && !gl.getParameter(timer.GPU_DISJOINT_EXT)) gpuTimes.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        else rejectedQueries++;
        gl.deleteQuery(query);
      }
      gpuTimes.sort((a, b) => a - b);
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
        kit: r.resources.scene.maintenanceBay.surfaceMaterials.diagnostics,
        gpuElapsedMs: { samples: gpuTimes.length, rejectedQueries, p50: gpuTimes[10] ?? null, p95: gpuTimes[19] ?? null },
        hallwayLights: [1, 2, 3, 4].map(i => r.resources.scene.root.getObjectByName(`hallway-flicker-light-${i}`).intensity),
        cpuSubmissionMs: { samples: times.length, p50: times[10], p95: times[19] } };
    });
    if (process.env.SPECIMEN_ORDER_COMPARE === '1') {
      metrics.opaqueOrderPixels = await page.evaluate(() => {
        const r = globalThis.__blackout, bay = r.resources.scene.maintenanceBay;
        const material = bay.surfaceMaterials.get('ductSteel'), meshes = [];
        bay.root.traverse(o => { if (o.isMesh && o.material === material) meshes.push([o, o.renderOrder]); });
        const gl = r.renderLayer.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        const before = new Uint8Array(width * height * 4), after = new Uint8Array(before.length);
        for (const [mesh] of meshes) mesh.renderOrder = 0;
        r.renderLayer.render(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, before);
        const beforeImage = rendererImage(before);
        for (const [mesh, order] of meshes) mesh.renderOrder = order;
        r.renderLayer.render(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, after);
        const afterImage = rendererImage(after);
        r.renderLayer.render();
        const control = new Uint8Array(before.length);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, control);
        const controlImage = rendererImage(control);
        // Encode the exact measured buffer and avoid a second WebGL canvas readback.
        function rendererImage(pixels) {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const context = canvas.getContext('2d'), data = context.createImageData(width, height);
          for (let y = 0; y < height; y++) {
            data.data.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
          }
          context.putImageData(data, 0, 0); return canvas.toDataURL('image/png');
        }
        let changedPixels = 0, maximumChannelDifference = 0;
        for (let i = 0; i < before.length; i += 4) {
          let changed = false;
          for (let c = 0; c < 3; c++) {
            const difference = Math.abs(before[i + c] - after[i + c]);
            if (difference) changed = true;
            maximumChannelDifference = Math.max(maximumChannelDifference, difference);
          }
          if (changed) changedPixels++;
        }
        let unchangedOrderChangedPixels = 0;
        for (let i = 0; i < after.length; i += 4) {
          if ([0, 1, 2].some(c => after[i + c] !== control[i + c])) unchangedOrderChangedPixels++;
        }
        return { width, height, changedPixels, maximumChannelDifference, unchangedOrderChangedPixels, beforeImage, afterImage, controlImage };
      });
      if (stage === 'order-visual-audit') {
        for (const state of ['before', 'after', 'control']) {
          const data = metrics.opaqueOrderPixels[`${state}Image`].split(',')[1];
          await writeFile(path.join(output, `${view.name}-${state}-order.png`), Buffer.from(data, 'base64'));
        }
      }
      delete metrics.opaqueOrderPixels.beforeImage;
      delete metrics.opaqueOrderPixels.afterImage;
      delete metrics.opaqueOrderPixels.controlImage;
    }
    if (process.env.SPECIMEN_CAPTURE_METRICS_ONLY !== '1') await page.locator('canvas').screenshot({ path: path.join(output, `${view.name}.png`) });
    captures.push({ ...view, ...metrics }); console.log(`${view.name}: ${metrics.render.calls} calls, ${metrics.memory.textures} textures`);
    await writeEvidence(path.join(output, `${view.name}-metrics.json`), { environment, ...captures.at(-1) });
    if (stage.startsWith('duct-diagnostic') && view.name === '12-duct-sparks') {
      const diagnostic = await page.evaluate(async () => {
        const r = globalThis.__blackout, renderer = r.renderLayer.renderer, gl = renderer.getContext();
        const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!timer) return { supported: false };
        const material = r.resources.scene.maintenanceBay.surfaceMaterials.get('ductSteel');
        const normal = material.normalMap, rows = [];
        const measure = async label => {
          material.needsUpdate = true;
          for (let i = 0; i < 12; i++) { await new Promise(requestAnimationFrame); r.renderLayer.render(); }
          const times = [];
          for (let i = 0; i < 20; i++) {
            const query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
            r.renderLayer.render(); gl.endQuery(timer.TIME_ELAPSED_EXT);
            let ready = false;
            for (let frame = 0; frame < 120 && !ready; frame++) {
              await new Promise(requestAnimationFrame); ready = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
            }
            if (ready && !gl.getParameter(timer.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(query);
          }
          times.sort((a, b) => a - b); rows.push({ label, samples: times.length, p50: times[10], p95: times[19] });
        };
        await measure('shipping maps');
        material.normalMap = null; await measure('diagnostic only: no normal map');
        material.normalMap = normal;
        r.resources.scene.maintenanceBay.root.traverse(o => {
          if (o.isMesh && o.material === material && o.geometry.index) o.geometry.computeTangents();
        });
        await measure('same maps with precomputed vertex tangents');
        const albedo = material.map, roughness = material.roughnessMap;
        material.map = material.normalMap = material.roughnessMap = null;
        await measure('diagnostic only: no texture maps');
        material.map = albedo; material.normalMap = normal; material.roughnessMap = roughness;
        for (const texture of [albedo, normal, roughness]) { texture.anisotropy = 1; texture.needsUpdate = true; }
        await measure('same maps, anisotropy one');
        for (const texture of [albedo, normal, roughness]) { texture.anisotropy = 4; texture.needsUpdate = true; }
        r.resources.scene.maintenanceBay.root.traverse(o => {
          if (o.isMesh && o.material === material) o.renderOrder = -1;
        });
        await measure('same maps, opaque duct drawn first');
        return { supported: true, rows };
      });
      await writeEvidence(path.join(output, 'diagnostic.json'), diagnostic);
    }
  }
  const gameplay = [];
  if (stage === 'after' && (!captureFilter || captureFilter.includes('gameplay'))) {
    // API setup only; approach/charge/jump use browser keys, fixed simulation and
    // the shipping follow camera. No manually positioned camera or extra light.
    await page.evaluate(() => {
      const r = globalThis.__blackout; r.restartLevel(); r.stop();
      const s = r.resources;
      s.group.bobBody.teleport(s.group.bobBody.position.clone().set(-3, .46, 7.5));
      s.maintenanceDrone.restore({ ...s.maintenanceDrone.capture(), position: [-3, 6.61, 17], stableState: 'parked-hover', startupCompleted: true, tutorialCompleted: true, voltMounted: true });
      s.maintenanceDrone.reconcileAfterBodyRecovery('volt', s.group.voltBody);
      r.renderLayer.cameraRig.reset(); r.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
      r.start(); r.__savedFixedUpdate = r.fixedUpdate.bind(r); r.fixedUpdate = () => {};
    });
    const advance = async frames => page.evaluate(count => {
      const r = globalThis.__blackout;
      for (let i = 0; i < count; i++) { r.__savedFixedUpdate(1 / 60); r.__savedRender(1, { frameDeltaSeconds: 1 / 60 }); }
    }, frames);
    const record = async name => {
      const state = await page.evaluate(() => {
        const r = globalThis.__blackout, s = r.resources;
        return { bob: s.group.bobBody.position.toArray(), volt: s.group.voltBody.position.toArray(), grounded: s.group.bobBody.grounded,
          camera: r.renderLayer.cameraRig.camera.position.toArray(), drone: s.maintenanceDrone.readModel,
          active: s.manager.activeSlimeId };
      });
      await page.locator('canvas').screenshot({ path: path.join(output, `${name}.png`) });
      gameplay.push({ name, ...state });
      await writeEvidence(path.join(output, `${name}-state.json`), state);
    };
    await page.keyboard.down('Tab'); await advance(1); await page.keyboard.up('Tab');
    await advance(8); await record('20-gameplay-approach');
    await page.keyboard.down('w'); await advance(15); await page.keyboard.up('w');
    await record('21-gameplay-bank-edge');
    await page.keyboard.down('Space'); await advance(42); await page.keyboard.up('Space');
    await page.keyboard.down('w'); await advance(20); await record('22-gameplay-jump-approach');
    await advance(45); await page.keyboard.up('w'); await advance(20); await record('23-gameplay-after-jump');
    assert.equal(gameplay.at(-1).active, 'bob');
    assert.equal(gameplay.at(-1).grounded, true);
    assert.ok(gameplay.at(-1).bob[2] >= 13.5, 'keyboard jump reaches the first platform');
    assert.notDeepEqual(gameplay[0].camera, gameplay.at(-1).camera, 'native camera follows Bob');
    // A separate real mount/startup/flight/switch journey, from the normal reset.
    await page.evaluate(() => {
      const r = globalThis.__blackout; r.restartLevel();
      const s = r.resources, p = s.maintenanceDrone.readModel.position;
      s.group.voltBody.teleport(s.group.voltBody.position.clone().set(p.x - 1.4, .46, p.z));
      r.renderLayer.cameraRig.reset(); r.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
    });
    await advance(10); await page.keyboard.down('m'); await advance(1); await page.keyboard.up('m'); await advance(100);
    await record('24-gameplay-drone-mounted');
    assert.equal(gameplay.at(-1).drone.mounted, true);
    const mountedPosition = gameplay.at(-1).drone.position;
    await page.keyboard.down('w'); await page.keyboard.down('Space'); await advance(40);
    await page.keyboard.up('w'); await page.keyboard.up('Space'); await advance(15);
    await record('25-gameplay-drone-flight');
    assert.ok(gameplay.at(-1).drone.position.y > mountedPosition.y + .5);
    assert.ok(gameplay.at(-1).drone.position.z > mountedPosition.z + .5);
    await page.keyboard.down('Tab'); await advance(1); await page.keyboard.up('Tab');
    const parked = await page.evaluate(() => ({ ...globalThis.__blackout.resources.maintenanceDrone.readModel.position }));
    await advance(30); await record('26-gameplay-drone-parked');
    assert.equal(gameplay.at(-1).drone.state, 'parked-hover');
    assert.deepEqual(gameplay.at(-1).drone.position, parked);
    await page.evaluate(() => { const r = globalThis.__blackout; r.fixedUpdate = r.__savedFixedUpdate; r.stop(); });
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
  await writeEvidence(path.join(output, captureFilter?.includes('gameplay') ? 'gameplay-measurements.json' : captureFilter ? 'detail-measurements.json' : 'measurements.json'), { stage, kind: 'API-staged frozen production game views; gameplay captures use keyboard simulation and native camera after staged setup; existing lights unchanged', environment, captures, gameplay, inventory, lifecycle, errors, failures });
  assert.deepEqual(errors, []); assert.deepEqual(failures.filter(f => !f.endsWith('net::ERR_ABORTED')), []);
} finally { await context.close(); await browser.close(); }
