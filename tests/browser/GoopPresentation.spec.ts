import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './fixtures.ts';

// These probes expose production instances only in the intercepted test bundle.
// Gameplay remains owned by the real controllers and kinematic bodies.
test.use({ video: 'on' });
test('authored Goop owns reveal, normal play, independent death and all-level recovery', async ({ page }) => {
  test.setTimeout(1_800_000);
  page.setDefaultTimeout(30_000);
  const recordingStartedAt = Date.now();
  const directory = resolve('artifacts/evidence/goop');
  await mkdir(directory, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  const webglWarnings: { phase: string; message: string }[] = [];
  let currentPhase = 'loading-containment';
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => {
    if (e.type() === 'error') errors.push(e.text());
    if (/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(e.text())) webglWarnings.push({ phase: currentPhase, message: e.text() });
  });
  page.on('requestfailed', r => failedRequests.push(r.url()));
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(/\{initialRuntime:([A-Za-z_$][\w$]*)/,
      '{initialRuntime:globalThis.__goopContainment=$1');
    body = body.replace(/return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/,
      'return globalThis.__goopCultivation=new $1.CultivationLevelRuntime(');
    const blackout = body.match(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/);
    if (blackout) body = body.replace(blackout[0],
      `class __GoopBlackout extends ${blackout[1]}{constructor(...args){super(...args);globalThis.__goopBlackout=this}}export{__GoopBlackout as BlackoutLevelRuntime};`);
    await route.fulfill({ response, body });
  });
  const samples: unknown[] = [];
  const sample = async (name: string, phase: string) => {
    currentPhase = phase;
    const value = await page.evaluate(({ name, phase }) => {
      const runtime = (window as any)[name], r = runtime.resources;
      const goop = r.goopPresentation ?? r.testScene.goop;
      const bob = r.bobPresentation ?? r.testScene.bob;
      const body = r.goopBody ?? r.pair?.goopBody ?? r.group.goopBody;
      const objects: string[] = [];
      runtime.renderLayer.scene.traverseVisible((o: any) => { if (o.isMesh && o.name.startsWith('Goop-')) objects.push(o.name); });
      const gl = runtime.renderLayer.renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const info = runtime.renderLayer.renderer.info;
      return { phase, goop: goop.diagnostics, bobPosition: bob.root.getObjectByName('player-slime-bob-character').position.toArray(),
        goopPosition: [body.position.x, body.position.y, body.position.z], visibleMeshes: objects,
        programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    }, { name, phase });
    samples.push({ ...value, elapsedMilliseconds: Date.now() - recordingStartedAt });
    console.info(`${phase}: ${value.programs} programs, ${value.geometries} geometries, ${value.textures} textures`);
    return value;
  };
  const frames = async (count = 3) => page.evaluate(async count => {
    for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
  }, count);
  const screenshot = async (name: string) => page.screenshot({ path: resolve(directory, `${name}.png`), timeout: 120_000 });
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => (window as any).__goopContainment?.state === 'running', null, { timeout: 180_000 });
  const firstGoopDraw = await page.evaluate(() => {
    const rt = (window as any).__goopContainment, r = rt.resources;
    if (r.slimeManager.isAvailable('goop')) throw new Error('Goop must start locked');
    // Stage the post-rescue roster for isolated presentation checks. Actual
    // locked-to-release progression remains covered by production smoke.
    const layer = rt.renderLayer, renderer = layer.renderer, gl = renderer.getContext();
    const before = renderer.info.programs.length, inspect = gl.getProgramInfoLog;
    let inspections = 0;
    gl.getProgramInfoLog = function(...args: any[]) { inspections++; return inspect.apply(this, args); };
    try {
      r.slimeManager.unlock('goop');
      r.slimePair.captureCurrentRecoveryState();
      rt.render(1, { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 0, frameDeltaSeconds: 0,
        stepsThisFrame: 0, interpolationAlpha: 1, droppedSimulationTimeSeconds: 0, renderFps: 60 });
      return { newPrograms: renderer.info.programs.length - before, inspections };
    } finally { gl.getProgramInfoLog = inspect; }
  });
  expect(firstGoopDraw).toEqual({ newPrograms: 0, inspections: 0 });
  const initial = await sample('__goopContainment', 'containment-cold');
  expect(initial.goop.asset).toEqual({ bodyTriangles: 26804, eyeTriangles: 6912, drawCalls: 3, geometries: 3, materials: 2 });
  expect(initial.goop.materials.selfLit).toBe(false);
  expect(initial.visibleMeshes).toHaveLength(3);
  await screenshot('containment');

  await page.evaluate(() => {
    const rt = (window as any).__goopContainment;
    rt.switchActiveSlime(rt.resources);
    rt.resources.testScene.goop.onLanding({ x: 0, y: 1, z: 0 }, 10);
  });
  const hiddenHUD = await page.addStyleTag({ content: '.game-hud, .performance-recorder { visibility: hidden !important; }' });
  await page.evaluate(() => {
    const rt = (window as any).__goopContainment;
    rt.resources.goopBody.teleport({ x: 3, y: 0.46, z: -0.8 });
    rt.resources.testScene.goop.setYaw(0);
  });
  for (const [view, yaw] of [['front', Math.PI], ['side', Math.PI / 2], ['back', 0]] as const) {
    await page.evaluate(yaw => {
      const rt = (window as any).__goopContainment;
      rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(rt.resources);
      rt.renderLayer.cameraRig.setGroundOrbitYawRadians(yaw);
    }, yaw);
    await frames(8); await screenshot(`sweep-${view}`);
  }
  await hiddenHUD.evaluate(element => element.remove());
  await page.keyboard.down('w'); await frames(5); await page.keyboard.up('w');
  await page.keyboard.press('Space'); await frames(5);
  await sample('__goopContainment', 'normal-jump');
  await screenshot('normal-jump');
  // Aim is a browser-input assertion: require the canvas to own pointer lock
  // after the camera screenshots before sending the actual mouse gesture.
  if (!await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS')) {
    await page.locator('canvas').click();
    await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS');
  }
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window as any).__goopContainment.resources.acidProjectileSystem.aimReadModel.active);
  await frames();
  expect((await sample('__goopContainment', 'acid-aim')).goop.visible).toBe(false);
  await page.mouse.down({ button: 'left' }); await frames(); await page.mouse.up({ button: 'left' });
  expect(await page.evaluate(() => (window as any).__goopContainment.resources.acidProjectileSystem.getDiagnostics().firedCount)).toBeGreaterThan(0);
  await screenshot('acid-aim');
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => (window as any).__goopContainment.resources.testScene.goop.diagnostics.visible);
  await page.evaluate(() => {
    const rt = (window as any).__goopContainment;
    rt.resources.goopBody.teleport({ x: 2, y: 0.46, z: 5.25 });
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(0);
  });
  await page.waitForFunction(() => (window as any).__goopContainment.resources.testScene.goop.diagnostics.opacity < 1);
  const faded = await sample('__goopContainment', 'camera-proximity');
  expect(faded.goop.opacity).toBeLessThan(1);
  await screenshot('camera-fade');
  const bobBefore = faded.bobPosition;
  expect(await page.evaluate(() => {
    const rt = (window as any).__goopContainment;
    return rt.requestPlayerDeath(() => rt.resources.slimePair.restoreRecoveryState(), rt.resources);
  })).toBe(true);
  await page.waitForFunction(() => !(window as any).__goopContainment.resources.testScene.goop.diagnostics.visible);
  const death = await sample('__goopContainment', 'containment-death');
  death.bobPosition.forEach((coordinate: number, axis: number) => expect(coordinate).toBeCloseTo(bobBefore[axis], 8));
  expect(death.goop.deathActive).toBe(true);
  await screenshot('green-death');
  await expect(page.locator('.death-retry')).toBeVisible({ timeout: 30_000 });
  await page.locator('.death-retry').click(); await frames();
  const retry = await sample('__goopContainment', 'containment-retry');
  expect(retry.goop.visible).toBe(true); expect(retry.goop.opacity).toBe(1);
  expect(retry.programs).toBe(initial.programs);
  await page.evaluate(() => {
    const rt = (window as any).__goopContainment;
    rt.switchActiveSlime(rt.resources);
    rt.requestPlayerDeath(() => rt.resources.slimePair.restoreRecoveryState(), rt.resources);
  });
  await expect(page.locator('.death-retry')).toBeVisible({ timeout: 30_000 });
  await page.locator('.death-retry').click(); await frames();
  const warmRetry = await sample('__goopContainment', 'containment-warm-retry');
  expect([warmRetry.programs, warmRetry.geometries, warmRetry.textures]).toEqual([retry.programs, retry.geometries, retry.textures]);

  // The reveal consumes the original fixed-step release path and positions.
  await page.evaluate(() => {
    const rt = (window as any).__goopContainment, r = rt.resources;
    r.containmentLevel.teleportToRoomForDebug(5);
    r.testScene.roomFive.beginEnding();
  });
  await frames(); await screenshot('contained-reveal');
  const reveal = await sample('__goopContainment', 'containment-reveal');
  expect(reveal.visibleMeshes).toHaveLength(3);
  await page.evaluate(() => {
    const room = (window as any).__goopContainment.resources.testScene.roomFive;
    for (let i = 0; i < 360; i++) room.updateEnding(1 / 60);
  });
  await frames();
  expect(await page.evaluate(() => (window as any).__goopContainment.resources.testScene.roomFive.goopPresentation.diagnostics.visible)).toBe(false);
  await page.evaluate(() => (window as any).__goopContainment.resources.testScene.roomFive.reset());
  await frames();
  expect((await sample('__goopContainment', 'reveal-reset')).visibleMeshes).toHaveLength(3);

  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  await expect(page.locator('[data-action="enter-level"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => (window as any).__goopCultivation?.state === 'running', null, { timeout: 180_000 });
  const cultivation = await sample('__goopCultivation', 'cultivation-cold');
  expect(cultivation.goop.ready).toBe(true); expect(cultivation.visibleMeshes).toHaveLength(3);
  await screenshot('cultivation');
  await page.evaluate(() => {
    const rt = (window as any).__goopCultivation, r = rt.resources;
    const position = r.pair.goopBody.position.clone().set(8, 0.86, 9.1);
    r.authoredPreview.roomFive.root.localToWorld(position);
    r.pair.goopBody.teleport(position);
    r.manager.activate('goop'); rt.retargetCamera(r);
  });
  await page.waitForFunction(() => (window as any).__goopCultivation.resources.goopPresentation.diagnostics.materials.targetBodyReflectionIntensity < 0.2);
  const separateRooms = await sample('__goopCultivation', 'cultivation-independent-dark-room');
  expect(separateRooms.goop.materials.targetBodyReflectionIntensity).toBeCloseTo(0.12);
  expect(await page.evaluate(() => (window as any).__goopCultivation.resources.bobPresentation.diagnostics.materials.targetBodyReflectionIntensity)).toBe(0.38);
  await screenshot('cultivation-dark');
  await page.evaluate(() => {
    const rt = (window as any).__goopCultivation, r = rt.resources;
    r.pair.restoreInitialState(); r.goopPresentation.reset();
    r.manager.activate('goop'); rt.retargetCamera(r);
    rt.requestPlayerDeath(() => r.pair.restoreInitialState(), 'goop');
  });
  await expect(page.locator('.death-retry')).toBeVisible({ timeout: 30_000 });
  await page.locator('.death-retry').click(); await frames();
  expect((await sample('__goopCultivation', 'cultivation-retry')).goop.visible).toBe(true);
  await page.evaluate(() => {
    const rt = (window as any).__goopCultivation;
    rt.resources.manager.unlock('volt');
    rt.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
  });
  await expect(page.locator('[data-action="enter-level"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => (window as any).__goopBlackout?.state === 'running', null, { timeout: 180_000 });
  const blackout = await sample('__goopBlackout', 'blackout-cold');
  expect(blackout.goop.materials.targetBodyReflectionIntensity).toBeLessThanOrEqual(0.12);
  expect(blackout.goop.materials.selfLit).toBe(false);
  await screenshot('blackout-dark');
  const powered = await page.evaluate(() => {
    const rt = (window as any).__goopBlackout, r = rt.resources;
    r.group.voltBody.teleport({ x: 5, y: 0.46, z: 59 });
    r.group.goopBody.teleport({ x: 6.5, y: 0.46, z: 59 });
    // Drive the existing power receiver for a controlled lighting comparison.
    // Electrical acquisition/gameplay remains covered by its reference suites.
    r.maintenanceBay.target.setConnectionState(true);
    const bodies = { bob: r.group.bobBody, goop: r.group.goopBody, volt: r.group.voltBody };
    for (let i = 0; i < 90; i++) r.maintenanceBay.update(1 / 60, bodies);
    rt.syncVisuals(r);
    r.manager.activate('goop'); rt.retargetCamera(r);
    rt.renderLayer.cameraRig.reset();
    return r.maintenanceBay.powered;
  });
  expect(powered).toBe(true); await frames();
  const poweredLighting = await sample('__goopBlackout', 'blackout-powered');
  expect(poweredLighting.goop.materials.targetBodyReflectionIntensity).toBeGreaterThan(0);
  await screenshot('blackout-powered');
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window as any).__goopBlackout.resources.acidProjectileSystem.aimReadModel.active);
  expect((await sample('__goopBlackout', 'blackout-acid-aim')).goop.visible).toBe(false);
  expect(await page.evaluate(() => (window as any).__goopBlackout.resources.voltPresentation.diagnostics.visible)).toBe(true);
  await screenshot('blackout-acid-aim'); await page.mouse.up({ button: 'right' }); await frames();
  await page.evaluate(() => {
    const rt = (window as any).__goopBlackout;
    rt.resources.manager.activate('goop'); rt.retargetCamera(rt.resources);
    rt.requestFailure();
  });
  await expect(page.locator('.death-retry')).toBeVisible({ timeout: 30_000 });
  await page.locator('.death-retry').click(); await frames();
  const blackRetry = await sample('__goopBlackout', 'blackout-retry');
  expect(blackRetry.goop.visible).toBe(true); expect(blackRetry.programs).toBe(blackout.programs);
  await page.evaluate(() => {
    const rt = (window as any).__goopBlackout;
    if (!rt.beginMerge()) throw new Error('merge rejected');
    for (let i = 0; i < 360; i++) rt.fixedUpdate(1 / 60);
  });
  await frames(); expect((await sample('__goopBlackout', 'merged')).goop.visible).toBe(false);
  await screenshot('merged');
  await page.evaluate(() => {
    const rt = (window as any).__goopBlackout;
    rt.resources.phase.restore('boss-defeated'); rt.resources.specimenForm.restore('specimen');
    if (!rt.beginSplit() || !rt.completeSplit()) throw new Error('split rejected');
  });
  await frames(); expect((await sample('__goopBlackout', 'split')).goop.visible).toBe(true);
  await screenshot('split');
  const unload = await page.evaluate(() => {
    const rt = (window as any).__goopBlackout, goop = rt.resources.goopPresentation;
    rt.stop(); rt.unload(); rt.unload();
    return { ready: goop.ready, detached: goop.root.parent === null };
  });
  expect(unload).toEqual({ ready: false, detached: true });
  const cancelledPreparation = await page.evaluate(async () => {
    const rt = (window as any).__goopBlackout;
    rt.load();
    const goop = rt.resources.goopPresentation;
    const pending = rt.preparePresentation();
    rt.unload(); await pending;
    return { ready: goop.ready, detached: goop.root.parent === null, state: rt.state };
  });
  expect(cancelledPreparation).toEqual({ ready: false, detached: true, state: 'unloaded' });
  await writeFile(resolve(directory, 'journeys.json'), JSON.stringify({ samples, unload, cancelledPreparation, errors, webglWarnings, failedRequests }, null, 2));
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  expect(webglWarnings).toEqual([]);
  const video = page.video(); await page.close();
  await video?.saveAs(resolve(directory, 'whole-game.webm'));
});
