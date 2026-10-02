/** #171 production evidence. Staged route poses are labelled separately from live input. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.env.CONTAINMENT_SHADOW_OUTPUT ?? path.join(root, 'docs/evidence/issue-171/local'));
const url = process.env.CONTAINMENT_SHADOW_URL ?? 'http://127.0.0.1:4181/';
const cdp = process.env.CONTAINMENT_SHADOW_CDP_URL;
const server = process.env.CONTAINMENT_SHADOW_URL ? undefined : spawn('npm',
  ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4181', '--strictPort'],
  { cwd: root, stdio: 'ignore' });
const errors = [], failures = [], captures = [], timings = [], lifecycle = [];
let browser, context, page;
try {
  await mkdir(output, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Starting preview. */ }
    if (attempt === 99) throw new Error('Preview did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = cdp ? await chromium.connectOverCDP(cdp) : await chromium.launch({ args: [
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  ] });
  context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(240_000);
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
      `(globalThis.__containmentShadows=${match[1]},${match[1]}.prepareLightingPrograms()).then(`) : body });
  });
  const frames = (count = 3) => page.evaluate(async n => {
    for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
  }, count);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => globalThis.__containmentShadows?.state === 'running');
  assert.equal(exposures, 1);
  await frames(10);
  const environment = await page.evaluate(() => {
    const r = globalThis.__containmentShadows, renderer = r.renderLayer.renderer;
    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, dpr: devicePixelRatio,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      timerAvailable: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
      exposure: renderer.toneMappingExposure, prewarm: r.lightingPrewarmProfile };
  });
  console.log(`GPU: ${environment.gpu}`);
  const freeze = () => page.evaluate(() => {
    const r = globalThis.__containmentShadows;
    r.stop(); r.__captureRender = r.render;
    r.render = () => r.renderLayer.render();
  });
  const resume = () => page.evaluate(() => {
    const r = globalThis.__containmentShadows;
    r.render = r.__captureRender; r.start();
  });
  const installCounters = () => page.evaluate(() => {
    const r = globalThis.__containmentShadows;
    const lights = [];
    r.resources.testScene.lighting.root.traverse(object => { if (object.isLight && object.castShadow) lights.push(object); });
    globalThis.__shadowDraws = {};
    globalThis.__countShadows = true;
    r.renderLayer.scene.traverse(object => {
      if (!object.isMesh || !object.castShadow) return;
      const original = object.onBeforeShadow;
      object.onBeforeShadow = function (...args) {
        const source = globalThis.__countShadows ? lights.find(light => light.shadow.camera === args[3]) : undefined;
        if (source && globalThis.__countShadows) {
          const counts = globalThis.__shadowDraws[source.name] ??= { calls: 0, sourceMeshes: {} };
          counts.calls++;
          counts.sourceMeshes[object.name] = (counts.sourceMeshes[object.name] ?? 0) + 1;
        }
        original.apply(this, args);
      };
    });
    r.__captureLayerRender = r.renderLayer.render;
    r.renderLayer.render = function (...args) {
      globalThis.__shadowDraws = {};
      if (r.resources) r.resources.testScene.lighting.prepareShadowFrame([r.resources.body.position, r.resources.goopBody.position]);
      return r.__captureLayerRender.apply(this, args);
    };
  });
  await installCounters();
  const snapshot = () => page.evaluate(() => {
    const r = globalThis.__containmentShadows, scene = r.resources.testScene;
    const camera = r.renderLayer.cameraRig.camera;
    const body = scene.bob.root.getObjectByName('Bob-Body');
    const sources = [];
    scene.lighting.root.traverse(object => {
      if (!object.isLight || !object.castShadow) return;
      sources.push({ name: object.name, type: object.type, position: object.position.toArray(),
        target: object.target?.position.toArray(), intensity: object.intensity, colour: object.color.getHexString(),
        distance: object.distance, angle: object.angle, mapSize: object.shadow.mapSize.toArray(),
        near: object.shadow.camera.near, far: object.shadow.camera.far, bias: object.shadow.bias,
        normalBias: object.shadow.normalBias, radius: object.shadow.radius, mapAllocated: Boolean(object.shadow.map) });
    });
    return { camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov },
      morphs: body.morphTargetInfluences.slice(), bob: scene.bob.diagnostics,
      lighting: scene.lightingDiagnostics, sources, shadowDraws: globalThis.__shadowDraws,
      render: r.renderLayer.getDiagnostics() };
  });
  const setShadows = async enabled => {
    await page.evaluate(value => globalThis.__containmentShadows.shadowRequest.update({ enabled: value }), enabled);
    await frames();
  };
  const capture = async (name, kind = 'staged-production-pose') => {
    await page.evaluate(() => { globalThis.__countShadows = true; });
    const before = await snapshot(), modes = [];
    for (const enabled of [false, true]) {
      await setShadows(enabled);
      await page.locator('canvas').screenshot({ path: path.join(output, `${name}-${enabled ? 'on' : 'off'}.png`) });
      modes.push({ enabled, ...await snapshot() });
    }
    assert.deepEqual(modes[1].camera, before.camera);
    assert.deepEqual(modes[1].morphs, before.morphs);
    captures.push({ name, kind, modes });
    console.log(`Captured ${name}`);
  };
  const stage = async (room, position, cameraOffset = [3, 2, -4], normal = [0, 1, 0]) => page.evaluate(
    ({ room, position, cameraOffset, normal }) => {
      const r = globalThis.__containmentShadows, res = r.resources, scene = res.testScene;
      res.body.teleport({ x: position[0], y: position[1], z: position[2] });
      scene.lighting.setActiveRoom(room);
      scene.lighting.setTraversalPosition(res.body.position);
      scene.bob.reset();
      const state = { ...res.slimeVisualState, grounded: true, attached: normal[1] === 0,
        chargingJump: false, jumpCharge: 0, contactCount: 1,
        surfaceNormalWorld: res.body.position.clone().set(...normal),
        gameplayUpWorld: res.body.position.clone().set(...normal),
        contactNormalWorld: res.body.position.clone().set(...normal),
        movementIntentWorld: res.noMovement, landedThisStep: false };
      scene.bob.update(1 / 60, state); scene.bob.setPosition(res.body.position); scene.bob.present();
      const camera = r.renderLayer.cameraRig.camera;
      camera.position.set(position[0] + cameraOffset[0], position[1] + cameraOffset[1], position[2] + cameraOffset[2]);
      camera.lookAt(position[0], position[1], position[2]); camera.updateMatrixWorld();
    }, { room, position, cameraOffset, normal });
  const profile = async name => {
    // Suppress the app-loop draw; sample exactly one warmed render per rAF.
    await page.evaluate(() => { globalThis.__containmentShadows.render = () => {}; });
    for (const enabled of [false, true, true, false]) {
      await setShadows(enabled);
      const measurement = await page.evaluate(async () => {
        const r = globalThis.__containmentShadows, renderer = r.renderLayer.renderer;
        const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        globalThis.__countShadows = false;
        const submissions = [], queries = [], intervals = [];
        for (let i = 0; i < 5; i++) { await new Promise(requestAnimationFrame); r.renderLayer.render(); }
        let previous = await new Promise(requestAnimationFrame);
        for (let i = 0; i < 40; i++) {
          const current = await new Promise(requestAnimationFrame);
          intervals.push(current - previous); previous = current;
          const query = timer ? gl.createQuery() : null;
          if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          const started = performance.now(); r.renderLayer.render(); submissions.push(performance.now() - started);
          if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(query); }
        }
        for (let i = 0; i < 120 && queries.some(q => !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)); i++) await new Promise(requestAnimationFrame);
        const disjoint = timer ? gl.getParameter(timer.GPU_DISJOINT_EXT) : false;
        const gpu = disjoint ? [] : queries.filter(q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))
          .map(q => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        queries.forEach(q => gl.deleteQuery(q));
        const stats = values => {
          if (!values.length) return null;
          values.sort((a, b) => a - b);
          return { samples: values.length, p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], maximum: values.at(-1) };
        };
        // Caster instrumentation runs in a separate untimed draw.
        globalThis.__countShadows = true; r.renderLayer.render();
        const shadowDraws = globalThis.__shadowDraws; globalThis.__countShadows = false;
        return { gpuMs: stats(gpu), submissionMs: stats(submissions), frameIntervalMs: stats(intervals),
          disjoint, render: r.renderLayer.getDiagnostics(), shadowDraws };
      });
      timings.push({ name, enabled, ...measurement });
    }
    await setShadows(true);
    await page.evaluate(() => { const r = globalThis.__containmentShadows; r.render = () => r.renderLayer.render(); });
    console.log(`Profiled ${name}`);
  };
  await freeze();
  await capture('room-1-standing', 'normal-input-spawn');
  await profile('room-1-standing');
  await resume();
  await page.locator('canvas').click();
  await page.keyboard.down('Space'); await frames(10); await page.keyboard.up('Space');
  await page.waitForFunction(() => !globalThis.__containmentShadows.resources.body.grounded);
  await freeze(); await capture('room-1-jumping', 'normal-input-jump'); await resume();
  await page.waitForFunction(() => globalThis.__containmentShadows.resources.body.grounded);
  await freeze(); await capture('room-1-landing', 'normal-input-landing');
  for (const [name, room, position, offset, normal] of [
    ['room-1-sticky-wall', 1, [-4.8, 5.8, 5.35], [2, 0.5, -3], [0, 0, -1]],
    ['duct-low-run', 1, [-4.8, 5.8, 10.5], [0, 0.7, -2]],
    ['duct-ramp', 1, [-4.8, 8.7, 19], [0, 0.6, -2]],
    ['duct-turn', 1, [-7.8, 10.95, 24.1], [0, 0.6, 2]],
    ['handoff-1-2', 1, [-8.4, 10.95, 27], [0, 0.5, -1.5]],
    ['room-2-floor', 2, [-9, 0.46, 31]],
    ['room-2-sticky-wall', 2, [14.2, 10.5, 43], [-3, 1, -4], [-1, 0, 0]],
    ['handoff-2-3', 2, [0, 11.4, 49], [1, 1.5, -3]],
    ['room-3-entry', 3, [0, 10.9, 51.5]],
    ['room-3-sticky-wall', 3, [16.2, 20, 63], [-3, 1, -4], [-1, 0, 0]],
    ['room-3-upper-platform', 3, [10, 22.85, 60.5]],
    ['handoff-3-4', 3, [9, 31.7, 79.5], [0, 0.4, -1.5]],
    ['room-4-lower', 4, [9, 29, 85.5], [2, 1.5, -3]],
    ['handoff-4-5', 4, [9, 75.3, 91.5], [1, 1, -3]],
    ['room-5-entry', 5, [9, 75.3, 94]],
    ['room-5-upper-platform', 5, [6.1, 83, 110.3]],
    ['room-5-sticky-wall', 5, [19.2, 97.5, 115.6], [-3, 0.8, -4], [-1, 0, 0]],
    ['room-5-observation', 5, [-10, 99, 131.25]],
  ]) {
    if (name === 'handoff-4-5') await page.evaluate(() => { const s = globalThis.__containmentShadows.resources.testScene; const e = s.roomFour.elevator; e.begin(); e.update(e.startDelaySeconds + e.travelDurationSeconds + e.arrivalDelaySeconds + 1, []); s.roomFour.elevatorPresentation.sync(); s.lighting.update(0); });
    await stage(room, position, offset, normal); await capture(name);
    if (['room-2-floor', 'room-3-entry', 'room-4-lower', 'room-5-upper-platform', 'handoff-4-5'].includes(name)) await profile(name);
  }
  for (const [index, progress] of [[1, 0], [1, 1], [2, 0], [2, 1]]) {
    const p = await page.evaluate(({ index, progress }) => {
      const res = globalThis.__containmentShadows.resources;
      const platform = index === 1 ? res.testScene.roomFive.movingPlatformOne : res.testScene.roomFive.movingPlatformTwo;
      platform.restoreState({ progress, target: 'end' });
      return [platform.root.position.x, platform.root.position.y + platform.size.y * .5 + res.body.radiusMetres + .05, platform.root.position.z];
    }, { index, progress });
    await stage(5, p, [2, 1.5, -3]);
    await capture(`moving-platform-${index}-${progress ? 'end' : 'start'}`, 'authoritative-platform-pose-staged-camera');
  }
  await stage(5, [0, 75.4, 122], [3, 2, -4]);
  await page.evaluate(() => {
    const r = globalThis.__containmentShadows, res = r.resources;
    res.goopBody.teleport(res.body.position);
    res.testScene.bob.setVisible(false);
    res.slimePairPresentation.update({ x: 0, y: .53, z: -2.6 }, res.goopBody.position, 'goop', r.renderLayer.cameraRig.camera, res.collisionWorld);
  });
  await capture('room-5-goop-door', 'staged-live-goop-presentation');
  await page.evaluate(() => globalThis.__containmentShadows.resources.testScene.roomFour.reset());
  for (const progress of [0, .25, .5, .75, 1]) {
    await page.evaluate(value => {
      const s = globalThis.__containmentShadows.resources.testScene, lift = s.roomFour.elevator;
      lift.reset(); lift.begin(); lift.update(lift.startDelaySeconds + lift.travelDurationSeconds * value, []);
      s.roomFour.elevatorPresentation.sync(); s.lighting.update(0);
    }, progress);
    const p = await page.evaluate(() => {
      const r = globalThis.__containmentShadows, platform = r.resources.testScene.roomFour.elevatorPlatform;
      return [platform.root.position.x, platform.root.position.y + platform.size.y * .5 + r.resources.body.radiusMetres + .05, platform.root.position.z];
    });
    await stage(4, p, [2, 1.5, -3]); await capture(`elevator-${progress * 100}`, 'authoritative-lift-timer-staged-camera');
  }
  await stage(5, [0, 76.4, 110], [3, 2, -5]);
  await page.evaluate(() => {
    const r = globalThis.__containmentShadows, p = r.resources.body.position;
    r.resources.goopBody.teleport({ x: 1.3, y: 76.4, z: 110 });
    r.resources.slimePairPresentation.update(p, r.resources.goopBody.position, 'bob', r.renderLayer.cameraRig.camera, r.resources.collisionWorld);
  });
  for (const state of ['normal', 'warning', 'locks-disengaging', 'opening', 'reveal', 'released']) {
    await page.evaluate(value => {
      const s = globalThis.__containmentShadows.resources.testScene;
      s.cutsceneLighting.setGoopReleaseLightingState(value); s.lighting.update(.1);
      for (const panel of Object.keys(s.roomFive.art.panelPivots)) s.roomFive.art.setPanelPreview(panel, ['opening', 'reveal', 'released'].includes(value) ? 1.05 : 0);
    }, state);
    await capture(`release-api-${state}`, 'staged-release-lighting-art-api');
    if (state === 'reveal') await profile('release-api-reveal');
  }
  await stage(1, [-.2, .53, -2.6]);
  for (const state of ['establishing', 'emergence', 'impact', 'complete']) {
    await page.evaluate(value => {
      const s = globalThis.__containmentShadows.resources.testScene;
      s.cutsceneLighting.setBobHatchLightingState(value);
      s.teaching.roomOneArt.setEggState(value === 'establishing' ? 'intact' : 'half-broken');
    }, state);
    await capture(`hatch-api-${state}`, 'staged-hatch-lighting-art-api');
  }
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.evaluate(() => globalThis.__containmentShadows.restartLevel());
    await frames(); lifecycle.push({ cycle, ...await snapshot() });
  }
  const disposal = await page.evaluate(() => {
    const r = globalThis.__containmentShadows, sources = [];
    r.resources.testScene.lighting.root.traverse(light => {
      if (light.isLight && light.castShadow) sources.push(light);
    });
    let maps = 0, disposedMaps = 0;
    for (const light of sources) if (light.shadow.map) {
      maps++; light.shadow.map.addEventListener('dispose', () => disposedMaps++);
    }
    r.stop(); r.unload();
    return { maps, disposedMaps, cleared: sources.every(light => light.shadow.map === null),
      enabled: r.renderLayer.renderer.shadowMap.enabled };
  });
  assert.equal(disposal.maps, disposal.disposedMaps);
  assert.equal(disposal.cleared, true); assert.equal(disposal.enabled, false);
  const report = { capturedAtUtc: new Date().toISOString(), browserVersion: browser.version(), environment,
    physicalGpuDetected: !/swiftshader|llvmpipe|software/i.test(environment.gpu),
    limitations: ['Human visual approval is separate.', 'Staged poses do not establish full normal-input traversal.',
      'Existing Room 5 ending progression and lighting/art APIs do not provide dedicated native hatch/release cutscene cameras.', 'Warmed render-only timings exclude gameplay simulation.'],
    captures, timings, lifecycle, disposal, errors, failures };
  await writeFile(path.join(output, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(output, 'compare.html'), `<!doctype html><meta charset="utf-8"><title>Containment shadows #171</title><style>body{background:#15191b;color:#eee;font:16px system-ui;margin:24px}section{margin-bottom:24px}div{display:flex;gap:12px}figure{margin:0;width:48%}img{width:100%}figcaption{padding:8px}</style><h1>Containment shadows #171</h1><p>Matched poses. Left: shadows off. Right: shadows on. Staged route/API views are identified below.</p>${captures.map(c => `<section><h2>${c.name}</h2><p>${c.kind}</p><div>${['off', 'on'].map(mode => `<figure><img loading="lazy" src="${c.name}-${mode}.png"><figcaption>${mode}</figcaption></figure>`).join('')}</div></section>`).join('')}`);
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  console.log(`Evidence: ${output}; disposed ${disposal.maps} maps`);
} catch (error) {
  await writeFile(path.join(output, 'capture-failure.json'), JSON.stringify({ error: String(error), errors, failures }, null, 2));
  await page?.screenshot({ path: path.join(output, 'capture-failure.png') }).catch(() => {});
  throw error;
} finally {
  await context?.close(); await browser?.close(); server?.kill();
}
