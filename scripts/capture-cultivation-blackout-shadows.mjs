/** #172 production evidence. API-staged poses; no application debug exports. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const output = path.resolve(process.env.LEVEL_SHADOW_OUTPUT ?? 'artifacts/evidence/shadows/cultivation-blackout');
const baseline = process.env.LEVEL_SHADOW_BASELINE === '1';
const url = process.env.LEVEL_SHADOW_URL ?? 'http://127.0.0.1:4182/';
const server = process.env.LEVEL_SHADOW_URL ? undefined : spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4182', '--strictPort'], { stdio: 'ignore' });
let browser, context;
const errors = [], failures = [], captures = [], timings = [], lifecycle = [];
try {
  await mkdir(output, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = process.env.LEVEL_SHADOW_CDP_URL
    ? await chromium.connectOverCDP(process.env.LEVEL_SHADOW_CDP_URL)
    : await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
  context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(240_000);
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
  page.on('requestfailed', request => failures.push({ url: request.url(), reason: request.failure()?.errorText }));
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/, '(globalThis.__containment=$1,$1.prepareLightingPrograms()).then(')
      .replace(/return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/, 'return globalThis.__cultivation=new $1.CultivationLevelRuntime(')
      .replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/, 'class __ExposedBlackout extends $1{constructor(...args){super(...args);globalThis.__blackout=this}}export{__ExposedBlackout as BlackoutLevelRuntime};');
    await route.fulfill({ response, body });
  });
  const frames = (count = 3) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame); }, count);
  console.log('Loading production');
  await page.goto(`${url}?debug=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => globalThis.__containment?.state === 'running');
  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  console.log('Preparing Cultivation');
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__cultivation?.state === 'running');
  const environment = await page.evaluate(() => {
    const renderer = globalThis.__cultivation.renderLayer.renderer;
    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, dpr: devicePixelRatio, exposure: renderer.toneMappingExposure,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      timerAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
  });
  console.log(`GPU: ${environment.gpu}`);
  const freeze = key => page.evaluate(k => {
    const r = globalThis[k]; r.stop(); r.__savedRender ??= r.render; r.render = () => {};
    globalThis.__active = r;
    const lights = []; r.renderLayer.scene.traverseVisible(o => { if (o.isLight && o.castShadow) lights.push(o); });
    r.__lights = lights; r.__draws = {};
    r.renderLayer.scene.traverse(o => {
      if (!o.isMesh || o.__instrumented) return;
      o.__instrumented = true;
      const original = o.onBeforeShadow;
      o.onBeforeShadow = function (...args) {
        if (r.__count) {
          const light = r.__lights.find(l => l.shadow.camera === args[3]);
          if (light) { const count = r.__draws[light.name] ??= { calls: 0, triangles: 0 }; count.calls++; count.triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); }
        }
        original.apply(this, args);
      };
    });
  }, key);
  const draw = () => page.evaluate(() => { const r = globalThis.__active; r.__draws = {}; r.__count = true; r.renderLayer.render(); r.__count = false; });
  const capture = async name => {
    const modes = [];
    // Three derives a shadow camera's far plane from light.distance on its
    // first shadow update. Normalize it before the off snapshot as well.
    await page.evaluate(() => {
      const r = globalThis.__active; r.renderLayer.scene.updateMatrixWorld(true);
      for (const light of r.__lights) {
        if (light.isPointLight) {
          // r185 updates point projections inside WebGLShadowMap, not through
          // LightShadow.updateMatrices (point lights have no target object).
          light.shadow.camera.far = light.distance || light.shadow.camera.far;
          light.shadow.camera.updateProjectionMatrix();
        } else light.shadow.updateMatrices(light);
      }
    });
    for (const enabled of [false, true]) {
      console.log(`${name}: shadow ${enabled ? 'on' : 'off'}`);
      await page.evaluate(value => {
        const r = globalThis.__active;
        r.shadowRequest.update({ enabled: value });
        if (r.preparationLightState) r.renderLayer.renderer.compile(r.preparationLightState, r.renderLayer.cameraRig.camera, r.renderLayer.scene);
      }, enabled);
      await draw(); await frames();
      console.log(`${name}: rendered`);
      await page.locator('canvas').screenshot({ path: path.join(output, `${name}-${enabled ? 'on' : 'off'}.png`) });
      modes.push(await page.evaluate(value => {
        const r = globalThis.__active, renderer = r.renderLayer.renderer, camera = r.renderLayer.cameraRig.camera;
        const sources = r.__lights.map(l => ({ name: l.name, type: l.type, intensity: l.intensity, position: l.getWorldPosition(l.position.clone()).toArray(),
          target: l.target?.getWorldPosition(l.position.clone()).toArray(), angle: l.angle, distance: l.distance,
          mapSize: l.shadow.mapSize.toArray(), near: l.shadow.camera.near, far: l.shadow.camera.far, bias: l.shadow.bias, normalBias: l.shadow.normalBias }));
        return { enabled: value, camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() }, sources,
          bob: r.resources.bobPresentation.diagnostics,
          morphs: r.resources.bobPresentation.root.getObjectByName('Bob-Body')?.morphTargetInfluences.slice(),
          shadowDraws: { ...r.__draws }, render: r.renderLayer.getDiagnostics(), geometries: renderer.info.memory.geometries };
      }, enabled));
    }
    assert.deepEqual(modes[0].camera, modes[1].camera);
    assert.deepEqual(modes[0].morphs, modes[1].morphs);
    assert.deepEqual(modes[0].sources, modes[1].sources);
    const submission = await page.evaluate(async () => {
      const r = globalThis.__active, times = [];
      for (let i = 0; i < 5; i++) { await new Promise(requestAnimationFrame); r.renderLayer.render(); }
      for (let i = 0; i < 20; i++) { await new Promise(requestAnimationFrame); const t = performance.now(); r.renderLayer.render(); times.push(performance.now() - t); }
      times.sort((a, b) => a - b); return { samples: times.length, p50: times[10], p95: times[19] };
    });
    captures.push({ name, kind: 'API-staged frozen production view', modes, submissionMs: submission });
    console.log(`Captured ${name}`);
  };
  const profile = async name => {
    for (const enabled of [false, true, true, false]) {
      const result = await page.evaluate(async value => {
        const r = globalThis.__active, renderer = r.renderLayer.renderer;
        r.shadowRequest.update({ enabled: value });
        if (r.preparationLightState) renderer.compile(r.preparationLightState, r.renderLayer.cameraRig.camera, r.renderLayer.scene);
        const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const queries = [], submission = [];
        for (let i = 0; i < 5; i++) { await new Promise(requestAnimationFrame); r.renderLayer.render(); }
        for (let i = 0; i < 20; i++) {
          await new Promise(requestAnimationFrame);
          const q = timer ? gl.createQuery() : null;
          if (q) gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
          const t = performance.now(); r.renderLayer.render(); submission.push(performance.now() - t);
          if (q) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(q); }
        }
        for (let i = 0; i < 120 && queries.some(q => !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)); i++) await new Promise(requestAnimationFrame);
        const disjoint = timer ? gl.getParameter(timer.GPU_DISJOINT_EXT) : false;
        const gpu = disjoint ? [] : queries.filter(q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map(q => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        queries.forEach(q => gl.deleteQuery(q));
        const stats = values => { if (!values.length) return null; values.sort((a, b) => a - b); return { samples: values.length, p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)] }; };
        return { disjoint, gpuMs: stats(gpu), submissionMs: stats(submission) };
      }, enabled);
      timings.push({ name, enabled, ...result });
    }
    await page.evaluate(() => globalThis.__active.shadowRequest.update({ enabled: true }));
  };
  const stageCultivation = async room => {
    console.log(`Staging Cultivation ${room}`);
    await page.evaluate(id => {
      const r = globalThis.__cultivation;
      r.stop(); r.__savedRender ??= r.render; r.render = () => {};
      r.teleportToAuthoredPreviewRoom(id);
      const p = r.resources.authoredPreview, room = p[['', 'roomOne', 'roomTwo', 'roomThree', 'roomFour', 'roomFive'][id]];
      for (const root of [p.roomOne.root, p.roomOneToTwoPassage.root, p.roomTwo.root, p.roomTwoToThreeGoopPassage.root, p.roomTwoToThreeBobAirDuct.root, p.roomThree.root, p.roomFour.root, p.roomFive.root]) root.visible = root === room.root;
      r.resources.scene.root.userData.darkRoomBlend = id === 5 ? 1 : 0;
      r.resources.scene.setDarkRoomLighting(id === 5, 1, id <= 3);
      r.lightLayout.sync(r.renderLayer.scene);
      if (id === 5) r.resources.roomFiveEncounter.update(1 / 60);
      const bob = r.resources.bobPresentation, origin = room.root.getWorldPosition(r.resources.renderedBobPosition.clone());
      const at = id === 5 ? [-14.5, 10.9, 28.2] : id === 4 ? [0, 1, 2] :
        id === 3 ? [3.5, 20.61, 14] : id === 2 ? [-3, .66, 4] : [-11, .66, 5.5];
      const position = origin.clone().add({ x: at[0], y: at[1], z: at[2] });
      bob.reset(); bob.setShadowCasting(true); bob.setPosition(position); bob.present();
      bob.setReflectionIntensity(id === 5 ? .12 : .38, id === 5 ? .28 : .74, true);
      const camera = r.renderLayer.cameraRig.camera; camera.position.copy(position).add({ x: 4, y: 3, z: id === 5 || id <= 2 ? 6 : -6 }); camera.lookAt(position); camera.updateMatrixWorld();
      const recorder = document.querySelector('.performance-recorder'); if (recorder) recorder.style.display = 'none';
    }, room);
    await freeze('__cultivation');
  };
  const checkPreparationFailure = async () => {
    lifecycle.push(await page.evaluate(async () => {
      const r = globalThis.__blackout;
      const previous = r.renderLayer.requestShadowConfiguration('failed-preparation-prior', { enabled: false });
      r.load();
      r.resources.bobPresentation.prepare = () => Promise.reject(new Error('injected shadow preparation failure'));
      let error;
      try { await r.preparePresentation(); } catch (failure) { error = failure.message; }
      const result = { level: 'blackout', failure: error, state: r.state, resourcesReleased: !r.resources,
        restoredOwner: r.renderLayer.shadowPolicy.activeOwner, enabled: r.renderLayer.renderer.shadowMap.enabled };
      previous.dispose(); return result;
    }));
    const failure = lifecycle.at(-1);
    assert.equal(failure.state, 'unloaded'); assert.equal(failure.resourcesReleased, true);
    assert.equal(failure.restoredOwner, 'failed-preparation-prior'); assert.equal(failure.enabled, false);
  };
  const selectedRooms = process.env.LEVEL_SHADOW_ROOMS?.split(',').map(Number);
  if (selectedRooms) {
    for (const room of selectedRooms) { await stageCultivation(room); await capture(`cultivation-room-${room}`); }
  } else if (process.env.LEVEL_SHADOW_FAILURE_ONLY === '1') {
    await page.evaluate(() => {
      const r = globalThis.__cultivation; r.resources.manager.unlock('volt');
      r.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
    });
    await page.locator('[data-action="enter-level"]').click();
    await page.waitForFunction(() => globalThis.__blackout?.state === 'running');
    await page.evaluate(() => globalThis.__blackout.unload());
    await checkPreparationFailure();
  } else {
    await stageCultivation(5);
    await capture('cultivation-searchlights');
    await profile('cultivation-searchlights');
    if (!baseline) {
      for (const room of [1, 2, 3, 4]) { await stageCultivation(room); await capture(`cultivation-room-${room}`); }
      await stageCultivation(5);
      await page.evaluate(() => {
        const r = globalThis.__cultivation, room = r.resources.authoredPreview.roomFive;
        room.controller.security.select('red'); r.resources.roomFiveEncounter.update(1 / 60);
      });
      await capture('cultivation-red-network-off');
      await page.evaluate(() => {
        const r = globalThis.__cultivation, room = r.resources.authoredPreview.roomFive;
        room.restoreCheckpoint('rescued'); r.resources.roomFiveEncounter.update(1 / 60);
        const position = room.pod.getWorldPosition(r.resources.renderedBobPosition.clone()).add({ x: 1.5, y: -1.35, z: -1.5 });
        r.resources.bobPresentation.setPosition(position); r.resources.bobPresentation.present();
        const camera = r.renderLayer.cameraRig.camera; camera.position.copy(position).add({ x: 5, y: 2, z: 6 }); camera.lookAt(position); camera.updateMatrixWorld();
      });
      await capture('cultivation-rescued-point');
      await page.evaluate(() => {
        const r = globalThis.__cultivation, p = r.resources.authoredPreview;
        p.roomFour.root.visible = true; p.roomFour.controller.restoreArrival();
        r.lightLayout.sync(r.renderLayer.scene);
      });
      await freeze('__cultivation'); await capture('cultivation-lift-dark-handoff');
      lifecycle.push(await page.evaluate(() => {
        const r = globalThis.__cultivation, renderer = r.renderLayer.renderer;
        const maps = []; r.renderLayer.scene.traverse(o => { if (o.isLight && o.shadow?.map) maps.push({ light: o, map: o.shadow.map }); });
        const before = { programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
        for (let i = 0; i < 3; i++) r.restartLevel();
        const retained = maps.every(({ light, map }) => light.shadow.map === map);
        let freed = 0; for (const { map } of maps) map.addEventListener('dispose', () => freed++);
        r.__disposeAudit = { maps, get freed() { return freed; } };
        return { level: 'cultivation', restartCount: 3, retained, enabled: renderer.shadowMap.enabled, before,
          after: { programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } };
      }));
      await page.evaluate(() => {
        const r = globalThis.__cultivation; r.resources.manager.unlock('volt');
        r.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
      });
      console.log('Preparing Blackout');
      await page.locator('[data-action="enter-level"]').click();
      await page.waitForFunction(() => globalThis.__blackout?.state === 'running');
      lifecycle.push(await page.evaluate(() => {
        const r = globalThis.__cultivation, audit = r.__disposeAudit;
        return { level: 'cultivation', handoffState: r.state, allocated: audit.maps.length, freed: audit.freed,
          cleared: audit.maps.every(({ light }) => light.shadow.map === null),
          owner: globalThis.__blackout.renderLayer.shadowPolicy.activeOwner };
      }));
      await freeze('__blackout');
      const stageBlackout = async (hallway, powered) => page.evaluate(({ hallway, powered }) => {
        const r = globalThis.__blackout, s = r.resources, body = s.group.bobBody;
        const position = body.position.clone().set(hallway ? 6 : -3, hallway ? .46 : .61, hallway ? 62 : 17);
        s.bobPresentation.reset(); s.bobPresentation.setPosition(position); s.bobPresentation.present();
        const dronePosition = position.clone().add({ x: 0, y: 6, z: 0 });
        s.maintenanceDroneFixture.droneRoot.position.copy(dronePosition);
        s.dronePresentation.update(1 / 60, { ...s.maintenanceDrone.readModel, state: powered ? 'parked-hover' : 'grounded-idle', lightEnabled: powered, powered });
        s.maintenanceBay.target.setConnectionState(powered);
        // Native door timing remains authoritative; only presentation of the drone is staged.
        const bodies = { bob: s.group.bobBody, goop: s.group.goopBody, volt: s.group.voltBody };
        for (let i = 0; i < 120; i++) s.maintenanceBay.update(1 / 60, bodies);
        const camera = r.renderLayer.cameraRig.camera; camera.position.copy(position).add({ x: hallway ? 1.8 : 4, y: 2.4, z: hallway ? 3 : -5 }); camera.lookAt(position); camera.updateMatrixWorld();
      }, { hallway, powered });
      for (const powered of [false, true]) {
        await stageBlackout(false, powered); await capture(`blackout-drone-${powered ? 'powered' : 'unpowered'}`);
        await stageBlackout(true, powered); await capture(`blackout-hallway-${powered ? 'powered' : 'unpowered'}`);
      }
      await profile('blackout-hallway-powered');
      lifecycle.push(await page.evaluate(() => {
        const r = globalThis.__blackout, renderer = r.renderLayer.renderer;
        const maps = []; r.renderLayer.scene.traverse(o => { if (o.isLight && o.shadow?.map) maps.push({ light: o, map: o.shadow.map }); });
        r.recoverActiveCheckpoint(); r.restartLevel();
        const retained = maps.every(({ light, map }) => light.shadow.map === map);
        const spot = r.renderLayer.scene.getObjectByName('blackout-maintenance-searchlight');
        const powerRestored = spot.intensity === 0 && !spot.shadow.autoUpdate;
        let freed = 0; for (const { map } of maps) map.addEventListener('dispose', () => freed++);
        r.unload(); r.unload();
        return { level: 'blackout', retained, powerRestored, allocated: maps.length, freed, cleared: maps.every(({ light }) => light.shadow.map === null),
          unloadedState: r.state, owner: renderer.shadowMap.enabled ? r.renderLayer.shadowPolicy.activeOwner : null, enabled: renderer.shadowMap.enabled };
      }));
      for (const entry of lifecycle) {
        if ('retained' in entry) assert.equal(entry.retained, true);
        if ('powerRestored' in entry) assert.equal(entry.powerRestored, true);
        if ('allocated' in entry) { assert.equal(entry.freed, entry.allocated); assert.equal(entry.cleared, true); }
      }
      await checkPreparationFailure();
    }
  }
  const report = { recordedAt: new Date().toISOString(), baseline, environment, captures, timings, lifecycle, errors, failures };
  await writeFile(path.join(output, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(failures.filter(f => f.reason !== 'net::ERR_ABORTED'), []);
} finally { await context?.close().catch(() => {}); await browser?.close().catch(() => {}); server?.kill(); }
