/** Reproducible, matched Room 1 proof. Instrument only the served bundle. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const evidence = path.resolve(process.env.SHADOW_PROOF_OUTPUT ?? path.join(root, 'artifacts/evidence/shadows/room-one'));
const url = process.env.SHADOW_PROOF_URL ?? 'http://127.0.0.1:4179/';
// A CDP connection allows the same capture on representative physical hardware.
const cdp = process.env.SHADOW_PROOF_CDP_URL;
const server = process.env.SHADOW_PROOF_URL ? undefined : spawn('npm',
  ['run', 'preview', '--', '--host', '0.0.0.0', '--port', '4179', '--strictPort'],
  { cwd: root, stdio: 'ignore' });
const errors = [], failures = [], poses = [], lifecycle = [];
let browser, context, page;
const frames = async (page, count = 3) => page.evaluate(async (n) => {
  for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
}, count);
try {
  await mkdir(evidence, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Starting preview. */ }
    if (i === 99) throw new Error('Preview did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = cdp ? await chromium.connectOverCDP(cdp) : await chromium.launch({
    args: ['--disable-dev-shm-usage', '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });
  context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(180_000);
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  let exposures = 0;
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    const match = body.match(pattern);
    if (match) exposures++;
    await route.fulfill({ response, body: match ? body.replace(pattern,
      `(globalThis.__shadowRuntime=${match[1]},${match[1]}.prepareLightingPrograms()).then(`) : body });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => globalThis.__shadowRuntime?.state === 'running');
  if (exposures !== 1) throw new Error(`Expected one runtime exposure, found ${exposures}`);
  await frames(page, 10);
  await page.locator('canvas').click();

  const freeze = () => page.evaluate(() => {
    const r = globalThis.__shadowRuntime;
    r.stop();
    globalThis.__shadowRender = r.render;
    r.render = () => r.renderLayer.render();
  });
  const resume = () => page.evaluate(() => {
    const r = globalThis.__shadowRuntime;
    r.render = globalThis.__shadowRender;
    r.start();
  });
  const snapshot = () => page.evaluate(() => {
    const r = globalThis.__shadowRuntime, b = r.resources.body;
    const key = r.resources.testScene.root.getObjectByName('room-1-pedestal-soft-key');
    const camera = r.renderLayer.cameraRig.camera;
    const body = r.resources.testScene.bob.root.getObjectByName('Bob-Body');
    return {
      bodyPosition: b.position.toArray(), velocity: b.velocity.toArray(), grounded: b.grounded,
      charging: b.chargingJump, charge: b.chargeFraction,
      morphs: body.morphTargetInfluences.slice(),
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov },
      light: { position: key.position.toArray(), target: key.target.position.toArray(),
        intensity: key.intensity, colour: key.color.getHexString(), distance: key.distance,
        angle: key.angle, penumbra: key.penumbra, mapSize: key.shadow.mapSize.toArray(),
        near: key.shadow.camera.near, far: key.shadow.camera.far, bias: key.shadow.bias,
        normalBias: key.shadow.normalBias, radius: key.shadow.radius },
      exposure: r.renderLayer.renderer.toneMappingExposure,
      render: r.renderLayer.getDiagnostics(), owner: r.renderLayer.shadowConfigurationOwner,
      shadowMapAllocated: Boolean(key.shadow.map),
    };
  });
  const setShadows = async enabled => {
    await page.evaluate(value => globalThis.__shadowRuntime.shadowRequest.update({ enabled: value }), enabled);
    await frames(page);
  };
  const capture = async (name, alreadyFrozen = false) => {
    if (!alreadyFrozen) await freeze();
    const before = await snapshot();
    for (const enabled of [false, true]) {
      await setShadows(enabled);
      await page.locator('canvas').screenshot({ path: path.join(evidence, `${name}-${enabled ? 'on' : 'off'}.png`) });
    }
    const after = await snapshot();
    if (JSON.stringify(before.camera) !== JSON.stringify(after.camera) ||
        JSON.stringify(before.morphs) !== JSON.stringify(after.morphs)) throw new Error(`Unmatched pose: ${name}`);
    poses.push({ name, ...after });
    console.log(`Captured ${name}`);
    if (!alreadyFrozen) await resume();
  };
  await capture('standing');
  await page.keyboard.down('KeyW');
  await frames(page, 8);
  await capture('movement');
  await page.keyboard.up('KeyW');
  await frames(page, 4);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => globalThis.__shadowRuntime.resources.body.chargeFraction >= 0.35);
  await capture('charging');
  await page.keyboard.up('Space');
  // stop()/start() clears held input; issue an ordinary charged jump again.
  await page.keyboard.down('Space');
  await frames(page, 8);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => !globalThis.__shadowRuntime.resources.body.grounded);
  await capture('jumping');
  await page.waitForFunction(() => globalThis.__shadowRuntime.resources.body.grounded);
  await capture('landing');

  // #38 has not delivered a gameplay hatch sequence. Exercise its existing
  // authored visual API explicitly; these are staged views, not a cutscene claim.
  await freeze();
  for (const [state, egg] of [['establishing', 'intact'], ['emergence', 'half-broken'], ['impact', 'half-broken'], ['complete', 'half-broken']]) {
    await page.evaluate(({ state, egg }) => {
      const r = globalThis.__shadowRuntime;
      r.resources.testScene.cutsceneLighting.setBobHatchLightingState(state);
      r.resources.testScene.teaching.roomOneArt.setEggState(egg);
    }, { state, egg });
    await capture(`hatch-api-${state}`, true);
  }
  await page.evaluate(() => globalThis.__shadowRuntime.resources.testScene.resetPresentation());
  await resume();
  await page.evaluate(() => globalThis.__shadowRuntime.restartLevel());
  await frames(page, 10);
  await freeze();
  const environment = await page.evaluate(() => {
    const r = globalThis.__shadowRuntime;
    const gl = r.renderLayer.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      gpuVendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      gpuRenderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimerAvailable: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
      browserDpr: devicePixelRatio };
  });
  const timings = [];
  // Prevent a second app-loop draw from contaminating the measured frame.
  await page.evaluate(() => { globalThis.__shadowRuntime.render = () => {}; });
  // Paired AB/BA order, warmed maps/programs; includes GPU query if supported.
  for (const enabled of [false, true, true, false]) {
    await setShadows(enabled);
    const sample = await page.evaluate(async () => {
      const r = globalThis.__shadowRuntime, renderer = r.renderLayer.renderer;
      const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const renderMs = [], intervals = [], queries = [];
      let previous = await new Promise(requestAnimationFrame);
      for (let i = 0; i < 60; i++) {
        const current = await new Promise(requestAnimationFrame);
        intervals.push(current - previous); previous = current;
        const query = timer ? gl.createQuery() : null;
        if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        const start = performance.now(); r.renderLayer.render(); renderMs.push(performance.now() - start);
        if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(query); }
      }
      for (let attempt = 0; attempt < 120 && queries.some(q => !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)); attempt++) {
        await new Promise(requestAnimationFrame);
      }
      const disjoint = timer ? gl.getParameter(timer.GPU_DISJOINT_EXT) : false;
      const gpuMs = disjoint ? [] : queries.filter(q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))
        .map(q => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      queries.forEach(q => gl.deleteQuery(q));
      const stats = values => {
        if (!values.length) return null;
        values.sort((a, b) => a - b);
        return { samples: values.length, p50: values[Math.floor(values.length * .5)],
          p95: values[Math.floor(values.length * .95)], maximum: values.at(-1) };
      };
      return { renderSubmissionMs: stats(renderMs), frameIntervalMs: stats(intervals),
        gpuMs: stats(gpuMs), gpuDisjoint: disjoint, render: r.renderLayer.getDiagnostics() };
    });
    timings.push({ enabled, ...sample });
  }
  await setShadows(true);
  await resume();
  const inspectLifecycle = async operation => {
    await frames(page);
    const s = await snapshot(); lifecycle.push({ operation, ...s });
  };
  await inspectLifecycle('initial');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => globalThis.__shadowRuntime.restartLevel());
    await inspectLifecycle(`restart-${i + 1}`);
    await page.evaluate(() => {
      const r = globalThis.__shadowRuntime;
      r.resources.containmentLevel.requestHazardFailure({ roomId: 'room-3', hazardId: 'shadow-proof-retry' });
      r.resources.deathSequence.update(10);
      r.resources.testScene.bob.updateDeath(10);
      r.retryAfterDeath();
    });
    await inspectLifecycle(`retry-${i + 1}`);
  }
  const unloads = [];
  for (let i = 0; i < 3; i++) {
    unloads.push(await page.evaluate(() => {
      const r = globalThis.__shadowRuntime;
      const key = r.resources.testScene.root.getObjectByName('room-1-pedestal-soft-key');
      const map = key.shadow.map;
      let disposals = 0, depthDisposals = 0;
      const depth = map.depthTexture;
      depth.addEventListener('dispose', () => depthDisposals++);
      map.addEventListener('dispose', () => disposals++);
      r.stop(); r.unload();
      return { enabled: r.renderLayer.renderer.shadowMap.enabled, owner: r.renderLayer.shadowConfigurationOwner ?? null,
        disposals, depthDisposals, mapCleared: key.shadow.map === null, render: r.renderLayer.getDiagnostics() };
    }));
    await page.evaluate(async () => {
      const r = globalThis.__shadowRuntime; r.load(); await r.prepareLightingPrograms(); r.start();
    });
    await inspectLifecycle(`reload-${i + 1}`);
  }
  const failedLoad = await page.evaluate(async () => {
    const r = globalThis.__shadowRuntime, renderer = r.renderLayer.renderer;
    r.stop(); r.unload(); r.load();
    const compile = renderer.compileAsync;
    let calls = 0, map, key, disposals = 0;
    renderer.compileAsync = (...args) => {
      if (++calls === 3) {
        key = r.resources.testScene.root.getObjectByName('room-1-pedestal-soft-key');
        map = key.shadow.map;
        map?.addEventListener('dispose', () => disposals++);
        return Promise.reject(new Error('injected shadow preparation failure'));
      }
      return compile.apply(renderer, args);
    };
    let error;
    try { await r.prepareLightingPrograms(); } catch (failure) { error = String(failure); }
    finally { renderer.compileAsync = compile; }
    return { error, state: r.state, enabled: renderer.shadowMap.enabled,
      owner: r.renderLayer.shadowConfigurationOwner ?? null, allocatedBeforeFailure: Boolean(map),
      disposals, mapCleared: key?.shadow.map === null };
  });
  if (failedLoad.state !== 'unloaded' || failedLoad.enabled || failedLoad.disposals !== 1 || !failedLoad.mapCleared) {
    throw new Error('Failed preparation did not release its configuration and shadow map');
  }
  await page.evaluate(async () => {
    const r = globalThis.__shadowRuntime; r.load(); await r.prepareLightingPrograms(); r.start();
  });
  await inspectLifecycle('reload-after-failure');
  const baseline = await snapshot();
  const report = { capturedAtUtc: new Date().toISOString(), browserVersion: browser.version(), environment, cdp: Boolean(cdp), physicalGpuDetected: !/swiftshader|llvmpipe|software/i.test(environment.gpuRenderer), representativeHardwareVerified: process.env.SHADOW_PROOF_REPRESENTATIVE === '1' && !/swiftshader|llvmpipe|software/i.test(environment.gpuRenderer),
    limitations: ['Human visual acceptance is separate.', 'Bob secondary deformation and fade shadow correctness remain #170.',
      'Hatch evidence stages the existing lighting/art API; no native hatch cutscene exists in this checkout.',
      'Timings measure warmed Room 1 at a fixed standing pose; traversal profiling remains #173.'],
    baseline, poses, timings, lifecycle, unloads, failedLoad, errors, failures };
  await writeFile(path.join(evidence, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
  if (errors.length || failures.length) throw new Error(`Capture had ${errors.length} errors and ${failures.length} request failures`);
  console.log(`Evidence: ${evidence}; GPU: ${environment.gpuRenderer}`);
} catch (error) {
  await writeFile(path.join(evidence, 'capture-failure.json'), JSON.stringify({ error: String(error), errors, failures }, null, 2));
  await page?.screenshot({ path: path.join(evidence, 'capture-failure.png') }).catch(() => {});
  throw error;
} finally {
  await context?.close();
  if (!cdp) await browser?.close();
  server?.kill();
}
