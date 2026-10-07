/** #170: production character/shadow evidence; expose only the served bundle. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.env.CHARACTER_SHADOW_OUTPUT ?? 'artifacts/evidence/shadows/characters');
const url = process.env.CHARACTER_SHADOW_URL ?? 'http://127.0.0.1:4180/';
const server = process.env.CHARACTER_SHADOW_URL ? undefined : spawn('npm',
  ['run', 'preview', '--', '--host', '0.0.0.0', '--port', '4180', '--strictPort'],
  { cwd: root, stdio: 'ignore' });
let browser, context;
const errors = [], failures = [], captures = [], lifecycle = [];
try {
  await mkdir(output, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Starting preview. */ }
    if (attempt === 99) throw new Error('Preview did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = process.env.CHARACTER_SHADOW_CDP_URL
    ? await chromium.connectOverCDP(process.env.CHARACTER_SHADOW_CDP_URL)
    : await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
  context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(240_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/,
        '(globalThis.__characterRoomOne=$1,$1.prepareLightingPrograms()).then(')
      .replace(/return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/,
        'return globalThis.__characterCultivation=new $1.CultivationLevelRuntime(');
    await route.fulfill({ response, body });
  });
  const frames = (count = 3) => page.evaluate(async n => {
    for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
  }, count);
  const freeze = key => page.evaluate(k => {
    const r = globalThis[k];
    r.stop();
    r.__originalRender = r.render;
    r.render = () => r.renderLayer.render();
    globalThis.__characterActive = r;
    globalThis.__characterBob = r.resources.testScene?.bob ?? r.resources.bobPresentation;
    if (k === '__characterRoomOne') {
      const camera = r.renderLayer.cameraRig.camera;
      camera.position.copy(globalThis.__characterSpotCamera.position);
      camera.quaternion.copy(globalThis.__characterSpotCamera.quaternion);
      camera.updateMatrixWorld();
    }
  }, key);
  const resume = () => page.evaluate(() => {
    const r = globalThis.__characterActive;
    r.render = r.__originalRender;
    r.start();
  });
  const capture = async name => {
    await frames();
    await page.locator('canvas').screenshot({ path: path.join(output, `${name}.png`) });
    captures.push(await page.evaluate(n => {
      const r = globalThis.__characterActive, bob = globalThis.__characterBob;
      const body = bob.root.getObjectByName('Bob-Body');
      const camera = r.renderLayer.cameraRig.camera;
      return { name: n, bob: bob.diagnostics, morphs: body.morphTargetInfluences.slice(),
        camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
        depthKey: body.customDepthMaterial.customProgramCacheKey(), distanceKey: body.customDistanceMaterial.customProgramCacheKey(),
        depthPrograms: r.renderLayer.renderer.properties.get(body.customDepthMaterial).programs?.size ?? 0,
        distancePrograms: r.renderLayer.renderer.properties.get(body.customDistanceMaterial).programs?.size ?? 0,
        dissolve: globalThis.__characterDissolve ? { progress: globalThis.__characterDissolve.progress,
          visible: globalThis.__characterDissolve.mesh.visible, collisionEnabled: globalThis.__characterDissolve.collisionEnabled,
          diagnostics: globalThis.__characterDissolve.renderDiagnostics } : undefined,
        render: r.renderLayer.getDiagnostics() };
    }, name));
    console.log(`Captured ${name}`);
  };
  await page.goto(`${url}?debug=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => globalThis.__characterRoomOne?.state === 'running');
  await frames(10);
  await page.evaluate(() => {
    const camera = globalThis.__characterRoomOne.renderLayer.cameraRig.camera;
    globalThis.__characterSpotCamera = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    // Keep diagnostic overlays out of the floor/contact evidence only.
    const recorder = document.querySelector('.performance-recorder');
    if (recorder) recorder.style.display = 'none';
  });
  const environment = await page.evaluate(() => {
    const gl = globalThis.__characterRoomOne.renderLayer.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, dpr: devicePixelRatio,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  console.log(`Browser GPU: ${environment.gpu}`);
  await freeze('__characterRoomOne');
  await capture('spot-standing');
  await resume();
  await page.locator('canvas').click();
  await page.keyboard.down('KeyW');
  await frames(8);
  await freeze('__characterRoomOne');
  await capture('spot-moving');
  await page.keyboard.up('KeyW');
  await resume();
  await page.keyboard.down('Space');
  await page.waitForFunction(() => globalThis.__characterRoomOne.resources.body.chargeFraction >= 0.4);
  await freeze('__characterRoomOne');
  await capture('spot-charging');
  await page.keyboard.up('Space');
  await resume();
  await page.keyboard.down('Space');
  await frames(8);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => !globalThis.__characterRoomOne.resources.body.grounded);
  await freeze('__characterRoomOne');
  await capture('spot-jumping');
  await resume();
  await page.waitForFunction(() => globalThis.__characterRoomOne.resources.body.grounded);
  await freeze('__characterRoomOne');
  await capture('spot-landing');
  await page.evaluate(() => {
    const bob = globalThis.__characterBob;
    bob.onLanding({ x: 0, y: 1, z: 0 }, 8);
    bob.present(); // Consume the impact at the production presentation seam.
    bob.materialSet.update(0.05);
  });
  await capture('spot-impact');
  await page.evaluate(() => globalThis.__characterBob.setOpacity(0.25));
  await capture('spot-faded');
  await page.evaluate(() => globalThis.__characterBob.setOpacity(0));
  await capture('spot-zero-opacity');
  await page.evaluate(() => {
    const bob = globalThis.__characterBob;
    bob.reset(); bob.setVisible(false);
  });
  await capture('spot-hidden');
  await page.evaluate(() => {
    const bob = globalThis.__characterBob;
    bob.reset(); bob.startDeath(globalThis.__characterRoomOne.resources.body.position); bob.updateDeath(0.03);
  });
  await capture('spot-death-anticipation');
  await page.evaluate(() => globalThis.__characterBob.updateDeath(0.15));
  await capture('spot-rupture');
  await page.evaluate(() => globalThis.__characterBob.finishDeath(globalThis.__characterRoomOne.resources.body.position));
  await capture('spot-recovered');
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.evaluate(() => globalThis.__characterRoomOne.restartLevel());
    await frames();
    lifecycle.push(await page.evaluate(() => {
      const r = globalThis.__characterRoomOne;
      const body = r.resources.testScene.bob.root.getObjectByName('Bob-Body');
      return { depth: body.customDepthMaterial.uuid, distance: body.customDistanceMaterial.uuid,
        render: r.renderLayer.getDiagnostics(), visible: r.resources.testScene.bob.diagnostics.visible };
    }));
  }
  assert.equal(new Set(lifecycle.map(v => v.depth)).size, 1);
  assert.equal(new Set(lifecycle.map(v => v.distance)).size, 1);
  assert.equal(new Set(lifecycle.map(v => v.render.programs)).size, 1);
  await resume();
  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__characterCultivation?.state === 'running');
  await page.keyboard.press('5');
  await page.waitForFunction(() => globalThis.__characterCultivation.renderLayer.renderer.shadowMap.enabled);
  await freeze('__characterCultivation');
  // Bounded staged pose inside the existing Room 5 pod, using its authored point
  // source unchanged. This exercises the distance pass, not a traversal claim.
  const point = await page.evaluate(() => {
    const r = globalThis.__characterCultivation, bob = globalThis.__characterBob;
    const room = r.resources.authoredPreview.roomFive;
    room.root.updateWorldMatrix(true, true);
    const light = room.root.getObjectByName('room-5-volt-glow');
    const p = light.getWorldPosition(r.resources.renderedBobPosition.clone());
    bob.reset(); bob.setShadowCasting(true);
    bob.setPosition({ x: p.x + 1.5, y: p.y - 1.35, z: p.z - 1.5 });
    bob.present();
    const camera = r.renderLayer.cameraRig.camera;
    camera.position.set(p.x + 5, p.y + 0.2, p.z - 6);
    camera.lookAt(p.x + 1, p.y - 1, p.z - 1);
    camera.updateMatrixWorld();
    return { name: light.name, worldPosition: p.toArray(), intensity: light.intensity,
      castShadow: light.castShadow, mapSize: light.shadow.mapSize.toArray() };
  });
  assert.equal(point.castShadow, true);
  await capture('point-standing');
  await page.evaluate(() => {
    const bob = globalThis.__characterBob;
    bob.onLanding({ x: 0, y: 1, z: 0 }, 8); bob.present(); bob.materialSet.update(0.05);
  });
  await capture('point-impact');
  await page.evaluate(() => {
    const r = globalThis.__characterCultivation, bob = globalThis.__characterBob;
    bob.update(1 / 60, { ...r.resources.bobPresentationState, grounded: true, jumpCharge: 0.6, chargingJump: true });
    bob.present();
  });
  await capture('point-charging');
  await page.evaluate(() => globalThis.__characterBob.setOpacity(0.25));
  await capture('point-faded');
  await page.evaluate(() => globalThis.__characterBob.setOpacity(0));
  await capture('point-zero-opacity');
  await page.evaluate(() => {
    const r = globalThis.__characterCultivation;
    globalThis.__characterBob.reset();
    const light = r.resources.authoredPreview.roomFive.root.getObjectByName('room-5-volt-glow');
    const p = light.getWorldPosition(r.resources.renderedBobPosition.clone());
    const target = r.resources.dissolveTargets[0];
    // Exercise an existing authoritative target's masks at a bounded staged
    // placement under this source; simulation stays stopped throughout.
    globalThis.__characterDissolve = target;
    const mesh = target.mesh;
    globalThis.__characterDissolvePlacement = { parent: mesh.parent, position: mesh.position.clone(),
      quaternion: mesh.quaternion.clone(), scale: mesh.scale.clone(), castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow, visible: mesh.visible };
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(p.clone());
    const center = mesh.geometry.boundingBox.getCenter(p.clone());
    const scale = 1 / Math.max(size.x, size.y, size.z);
    mesh.scale.setScalar(scale);
    mesh.quaternion.identity();
    const world = p.clone().set(p.x - 1, p.y - 1.3, p.z - 1.5);
    mesh.position.copy(mesh.parent.worldToLocal(world)).addScaledVector(center, -scale);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.visible = true;
    // Keep the staged target visible even if its source room is culled.
    r.renderLayer.scene.attach(mesh);
  });
  await capture('point-dissolve-intact');
  await page.evaluate(() => {
    const t = globalThis.__characterDissolve;
    t.advance(t.dissolveDurationSeconds * 0.5);
  });
  await capture('point-dissolve-half');
  await page.evaluate(() => {
    const t = globalThis.__characterDissolve;
    t.advance(t.dissolveDurationSeconds * 0.5);
  });
  await capture('point-dissolve-complete');
  await page.evaluate(() => globalThis.__characterDissolve.reset());
  await capture('point-dissolve-reset');
  await page.evaluate(() => {
    const mesh = globalThis.__characterDissolve.mesh, saved = globalThis.__characterDissolvePlacement;
    saved.parent.add(mesh);
    mesh.position.copy(saved.position); mesh.quaternion.copy(saved.quaternion); mesh.scale.copy(saved.scale);
    mesh.castShadow = saved.castShadow; mesh.receiveShadow = saved.receiveShadow; mesh.visible = saved.visible;
  });
  assert.equal(captures.find(c => c.name === 'spot-standing').depthPrograms > 0, true);
  assert.equal(captures.find(c => c.name === 'point-standing').distancePrograms > 0, true);
  await writeFile(path.join(output, 'measurements.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), environment, point, captures, lifecycle, errors, failures,
    limits: ['Point pose, fades and death are staged through existing presentation APIs.',
      'Spot captures use a fixed initial gameplay camera to keep floor contacts visible.',
      'GPU identity is recorded; these captures do not establish hardware performance or human acceptance.'],
  }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log('Character shadow proof passed');
} finally {
  if (context) await context.close();
  // For connectOverCDP, close() disconnects this Playwright connection; it
  // leaves the externally supplied Chrome process alive.
  if (browser) await browser.close();
  server?.kill();
}
