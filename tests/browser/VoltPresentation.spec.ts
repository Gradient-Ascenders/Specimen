import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './fixtures.ts';
import { openAdvancedGraphics } from '../helpers/MenuNavigation.ts';

// Match the existing production-bundle exposure convention. No game globals
// or alternative gameplay controllers are shipped for this fixture.
test.use({ video: 'on', actionTimeout: 60_000 });
for (const preset of ['normal', 'performance'] as const) {
test(`${preset} graphics retains Volt release, controls and warmed lifecycle through Blackout`, async ({ page }) => {
  test.setTimeout(1_800_000);
  const gelMode = process.env.SPECIMEN_GEL_RENDERING_MODE;
  const directory = resolve(gelMode ? `artifacts/evidence/issue-188/${gelMode}-journey/${preset}` : `artifacts/evidence/volt/${preset}`);
  await mkdir(directory, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [], samples: unknown[] = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  page.on('console', e => { if (e.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL|sampler.*mismatch/i.test(e.text())) errors.push(e.text()); });
  page.on('requestfailed', request => failedRequests.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch(); let body = await response.text();
    body = body.replace(/return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/,
      'return globalThis.__voltCultivation=new $1.CultivationLevelRuntime(');
    const blackout = body.match(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/);
    if (blackout) body = body.replace(blackout[0],
      `class __VoltBlackout extends ${blackout[1]}{constructor(...args){super(...args);globalThis.__voltBlackout=this}}export{__VoltBlackout as BlackoutLevelRuntime};`);
    await route.fulfill({ response, body });
  });
  const frames = async (count = 5) => page.evaluate(async count => {
    for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
  }, count);
  const sample = async (runtime: string, phase: string) => {
    const value = await page.evaluate(({ runtime, phase }) => {
      const rt = (window as any)[runtime], r = rt.resources, info = rt.renderLayer.renderer.info;
      const names: string[] = [];
      rt.renderLayer.scene.traverseVisible((o: any) => { if (o.isMesh && o.name.startsWith('Volt-')) names.push(o.name); });
      const gl = rt.renderLayer.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { phase, gelMode: rt.renderLayer.gelRendering.value, gelMaterials: rt.renderLayer.gelRendering.materialCount,
        bodyTransmission: [r.bobPresentation, r.goopPresentation, r.voltPresentation,
          r.authoredPreview?.roomFive.captiveVoltPresentation].filter(Boolean)
          .map(p => ({ ready: p.ready, transmission: p.diagnostics.materials?.transmission })),
        volt: r.voltPresentation.diagnostics,
        captive: r.authoredPreview?.roomFive.captiveVoltPresentation.diagnostics,
        light: r.voltLight ? { visible: r.voltLight.visible, intensity: r.voltLight.intensity, distance: r.voltLight.distance, decay: r.voltLight.decay } : undefined,
        active: r.manager.activeSlimeId, names, programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), glError: gl.getError() };
    }, { runtime, phase });
    if (gelMode) {
      expect(value.gelMode).toBe(gelMode);
      if (gelMode === 'minimum') expect(value.bodyTransmission.every(body => !body.ready || body.transmission === 0)).toBe(true);
    }
    samples.push(value); await writeFile(resolve(directory, 'samples.json'), JSON.stringify(samples, null, 2)); console.info(`${phase}: ${value.programs} programs, ${value.geometries} geometries, ${value.textures} textures`);
    expect(value.glError, `GL state at ${phase}`).toBe(0); return value;
  };
  const capture = async (name: string) => page.screenshot({ path: resolve(directory, `${name}.png`), timeout: 120_000 });
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '.game-hud, .performance-recorder, .security-network-status { visibility: hidden !important; }' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await openAdvancedGraphics(page);
  await page.locator('[data-setting="graphics-preset"]').selectOption(preset);
  if (preset === 'performance') await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  if (gelMode) {
    await page.locator('[data-setting="gel-rendering"]').selectOption(gelMode);
  }
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  // The title previews Volt; the containment gameplay roster remains locked.
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(e => /volt-[^/]+\.glb/.test(e.name)))).toBe(true);
  await page.keyboard.press('Digit0');
  await expect(page.locator('[data-action="enter-level"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => (window as any).__voltCultivation?.state === 'running', null, { timeout: 180_000 });
  const cold = await sample('__voltCultivation', 'cultivation-cold');
  expect(cold.volt.ready).toBe(true); expect(cold.captive.ready).toBe(true); expect(cold.volt.requestedVisible).toBe(false);
  await page.evaluate(() => (window as any).__voltCultivation.teleportToAuthoredPreviewRoom(5));
  await frames();
  await page.evaluate(() => {
    const rt = (window as any).__voltCultivation, r = rt.resources;
    rt.stop();
    const position = r.authoredPreview.roomFive.pod.getWorldPosition(r.renderedVoltPosition);
    const anchor = { position, previousPosition: position, velocity: r.noMovement,
      gameplayUp: r.pair.bobBody.gameplayUp, grounded: true, attached: false };
    rt.renderLayer.cameraRig.setFollowTarget(anchor, r.collisionWorld);
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
  });
  await frames(8); await capture('captive-pod');
  await page.evaluate(() => {
    const rt = (window as any).__voltCultivation; rt.start(); rt.retargetCamera(rt.resources);
  });
  const captive = await sample('__voltCultivation', 'captive');
  expect(captive.names).toHaveLength(3); expect(captive.captive.meshes.every((mesh: any) => !mesh.castShadow)).toBe(true);
  await page.evaluate(() => {
    const rt = (window as any).__voltCultivation, r = rt.resources;
    rt.requestPlayerDeath(() => rt.resetAndRecoverAuthoredPreviewRoom(r), 'bob');
  });
  await expect(page.locator('.death-retry')).toBeVisible({ timeout: 120_000 });
  await page.locator('.death-retry').click(); await frames();
  expect((await sample('__voltCultivation', 'checkpoint-before-rescue')).volt.requestedVisible).toBe(false);
  // Stage the existing controls checkpoint; the real occupant test holds the
  // lever for 1.5 s and the controller drives the complete four-second release.
  // Delay only the completion notification so its registered instance can be
  // inspected/recovered before the ordinary level handoff.
  await page.evaluate(() => {
    const rt = (window as any).__voltCultivation, r = rt.resources, room = r.authoredPreview.roomFive;
    const emit = rt.events.emit.bind(rt.events);
    rt.__handoff = emit; rt.events.emit = (name: string, payload: unknown) => {
      if (name === 'completed') rt.__completed = payload; else emit(name, payload);
    };
    room.restoreCheckpoint('controls'); rt.roomFiveCheckpoint = 'controls';
    room.copyCheckpointSpawn('goop', r.pair.goopBody.position); r.pair.goopBody.teleport(r.pair.goopBody.position);
    r.pair.bobBody.teleport(room.root.localToWorld(r.pair.bobBody.position.clone().set(0, 29.66, 28)));
    r.manager.activate('bob'); rt.retargetCamera(r); room.controller.security.select('green');
  });
  await page.waitForFunction(() => (window as any).__voltCultivation.resources.authoredPreview.roomFive.controller.releasing, null, { timeout: 120_000 });
  await frames(); await capture('pod-moving');
  expect((await sample('__voltCultivation', 'pod-moving')).captive.visible).toBe(true);
  await page.waitForFunction(() => !!(window as any).__voltCultivation.__completed, null, { timeout: 120_000 });
  await frames();
  const rescued = await sample('__voltCultivation', 'rescued');
  expect(rescued.captive.visible).toBe(false); expect(rescued.volt.visible).toBe(true); expect(rescued.names).toHaveLength(3);
  await page.evaluate(() => {
    const rt = (window as any).__voltCultivation, r = rt.resources;
    r.manager.activate('volt'); rt.authoredPreviewRecoveryActiveSlimeId = 'volt';
    rt.requestPlayerDeath(() => rt.resetAndRecoverAuthoredPreviewRoom(r), 'volt');
  });
  await expect(page.locator('.death-retry')).toBeVisible({ timeout: 120_000 });
  await page.locator('.death-retry').click(); await frames();
  const recovered = await sample('__voltCultivation', 'checkpoint-after-rescue');
  expect(recovered.volt.deathActive).toBe(false); expect(recovered.volt.opacity).toBe(1); expect(recovered.active).toBe('volt');
  await page.evaluate(() => {
    const rt = (window as any).__voltCultivation;
    rt.__handoff('completed', rt.__completed);
  });
  await expect(page.locator('[data-action="enter-level"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => (window as any).__voltBlackout?.state === 'running', null, { timeout: 180_000 });
  const blackout = await sample('__voltBlackout', 'blackout-cold');
  expect(blackout.active).toBe('volt'); expect(blackout.names).toHaveLength(3);
  expect(blackout.volt.asset).toEqual({ triangles: 38208, drawCalls: 3, geometries: 3, materials: 2 });
  expect(blackout.light).toEqual({ visible: true, intensity: 16, distance: 8, decay: 2 });
  // Gameplay exposure and the existing follow distances, from each side.
  for (const [name, distance, yaw] of [['front', 3.5, Math.PI], ['side', 5.2, Math.PI / 2], ['back', 7, 0]] as const) {
    await page.evaluate(({ distance, yaw }) => {
      const rt = (window as any).__voltBlackout; rt.renderLayer.cameraRig.setFollowDistanceMetres(distance);
      rt.renderLayer.cameraRig.setGroundOrbitYawRadians(yaw);
    }, { distance, yaw });
    await frames(12); await capture(`blackout-${name}`); await sample('__voltBlackout', `${name}-${distance}m`);
  }
  await page.evaluate(() => {
    const rt = (window as any).__voltBlackout; rt.renderLayer.cameraRig.reset(); rt.renderLayer.cameraRig.setGroundOrbitYawRadians(0);
  });
  await page.keyboard.down('w'); await frames(20); await page.keyboard.up('w');
  await page.keyboard.press('Space'); await frames(5); await sample('__voltBlackout', 'normal-jump'); await frames(60);
  // Real camera aim, with the navigation light retained through the fade.
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window as any).__voltBlackout.resources.electricalSystem.readModel.aimActive);
  await frames(12); const aim = await sample('__voltBlackout', 'electrical-aim');
  expect(aim.volt.visible).toBe(false); expect(aim.light.visible).toBe(true); await capture('electrical-aim');
  await page.mouse.up({ button: 'right' });
  // Aim exit restores opacity when the existing camera-proximity fade allows
  // it; open-space staging avoids the drone/entry-wall obstruction.
  await page.evaluate(() => {
    const rt = (window as any).__voltBlackout;
    rt.resources.group.voltBody.teleport({ x: 0, y: 0.46, z: 4 });
    rt.renderLayer.cameraRig.setFollowDistanceMetres(5.2); rt.renderLayer.cameraRig.reset();
  });
  await page.waitForFunction(() => (window as any).__voltBlackout.resources.voltPresentation.diagnostics.opacity === 1);
  expect((await sample('__voltBlackout', 'aim-release')).volt.opacity).toBe(1);
  await page.evaluate(() => {
    const rt = (window as any).__voltBlackout, r = rt.resources, rig = rt.renderLayer.cameraRig;
    r.group.voltBody.teleport({ x: -9, y: 0.46, z: 51.5 }); rig.reset();
    const original = rig.copyAimRay.bind(rig); rt.__restoreAimRay = () => { rig.copyAimRay = original; };
    // Controlled centre ray into the real conducting target: acquisition,
    // range, beam/socket origins and retained tether remain production code.
    rig.copyAimRay = (origin: any, direction: any) => {
      origin.copy(r.group.voltBody.position);
      r.maintenanceBay.target.copySocketWorldPosition(direction).sub(origin).normalize();
    };
  });
  await page.mouse.down({ button: 'right' }); await frames();
  await page.mouse.down({ button: 'left' }); await frames(); await page.mouse.up({ button: 'left' });
  await page.waitForFunction(() => (window as any).__voltBlackout.voltElectricalReadModel.connectedTargetId === 'maintenance-bay-circuit');
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => (window as any).__voltBlackout.__restoreAimRay()); await frames(15);
  await sample('__voltBlackout', 'powered-tether'); await capture('powered-gold');
  for (const id of ['bob', 'goop', 'volt']) {
    await page.keyboard.press('Tab'); await frames(); expect((await sample('__voltBlackout', `switch-${id}`)).active).toBe(id);
    expect(await page.evaluate(() => (window as any).__voltBlackout.voltElectricalReadModel.connectedTargetId)).toBe('maintenance-bay-circuit');
  }
  await page.keyboard.press('KeyP');
  const paused = await sample('__voltBlackout', 'paused'); await frames(20);
  expect((await sample('__voltBlackout', 'still-paused')).volt.weights).toEqual(paused.volt.weights);
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click(); await frames();
  // Existing drone authority owns mount, startup, transport and dismount.
  await page.evaluate(() => {
    const rt = (window as any).__voltBlackout, r = rt.resources;
    r.group.voltBody.teleport(r.maintenanceDroneFixture.mountAnchor.getWorldPosition(r.renderedVoltPosition));
    rt.renderLayer.cameraRig.reset();
  });
  await frames(); await page.keyboard.press('KeyM');
  await page.waitForFunction(() => (window as any).__voltBlackout.maintenanceDroneReadModel.state === 'mounted', null, { timeout: 120_000 });
  await page.keyboard.down('Space'); await frames(20); await page.keyboard.up('Space');
  const carrier = await sample('__voltBlackout', 'drone-flight');
  expect(await page.evaluate(() => (window as any).__voltBlackout.voltElectricalReadModel.connectedTargetId)).toBeUndefined();
  expect(carrier.volt.weights.Squash + carrier.volt.weights.Stretch).toBe(0); await capture('drone-flight');
  await page.keyboard.press('Tab', { delay: 150 });
  await page.waitForFunction(() => (window as any).__voltBlackout.resources.manager.activeSlimeId === 'bob');
  expect(await page.evaluate(() => (window as any).__voltBlackout.maintenanceDroneReadModel.state)).toBe('parked-hover');
  // Input latches each action until a fixed update; two taps in one step coalesce.
  for (const id of ['goop', 'volt']) {
    await page.keyboard.press('Tab', { delay: 150 });
    await page.waitForFunction(id => (window as any).__voltBlackout.resources.manager.activeSlimeId === id, id);
  }
  await page.keyboard.press('KeyM', { delay: 150 });
  await page.waitForFunction(() => !(window as any).__voltBlackout.maintenanceDroneReadModel.mounted);
  expect(await page.evaluate(() => (window as any).__voltBlackout.maintenanceDroneReadModel.mounted)).toBe(false);
  // Stage the existing low vent, with its collision geometry and authority intact.
  await page.evaluate(() => {
    const rt = (window as any).__voltBlackout, r = rt.resources;
    r.group.voltBody.teleport({ x: -6, y: 0.46, z: 55 }); r.voltPresentation.reset();
    rt.renderLayer.cameraRig.reset(); rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
  });
  await page.keyboard.down('w'); await frames(35); await page.keyboard.up('w'); await sample('__voltBlackout', 'low-vent'); await capture('low-vent');
  await page.evaluate(() => (window as any).__voltBlackout.recoverActiveCheckpoint()); await frames();
  const warm = await sample('__voltBlackout', 'before-death');
  let retryProgramCount = warm.programs;
  let firstDeathProgramGrowth = 0;
  for (const pass of [1, 2]) {
    await page.keyboard.press('F1');
    if (pass === 1) await expect(page.locator('#app')).toHaveAttribute('data-clean-gameplay', 'true');
    else await expect(page.locator('#app')).not.toHaveAttribute('data-clean-gameplay');
    await page.evaluate(() => (window as any).__voltBlackout.requestFailure());
    await frames(2);
    const dying = await sample('__voltBlackout', `dying-${pass}`);
    expect(dying.light.intensity).toBe(0);
    expect(dying.programs).toBe(warm.programs);
    await expect(page.locator('.death-retry')).toBeVisible({ timeout: 120_000 });
    await page.locator('.death-retry').click(); await frames();
    const retry = await sample('__voltBlackout', `death-retry-${pass}`);
    expect(retry.volt.visible).toBe(true); expect(retry.volt.deathActive).toBe(false); expect(retry.volt.opacity).toBe(1);
    // Minimum mode has a distinct first-use death/light configuration. Record
    // its compilation cost, then require an exactly stable repeated cycle.
    // Keep the existing physical-path zero-growth assertion intact.
    if (gelMode === 'minimum' && pass === 1) {
      firstDeathProgramGrowth = retry.programs - warm.programs;
      retryProgramCount = retry.programs;
      console.info(`Minimum first-death program growth: ${firstDeathProgramGrowth}`);
    }
    expect([retry.programs, retry.geometries, retry.textures]).toEqual([retryProgramCount, warm.geometries, warm.textures]);
  }
  await page.evaluate(() => {
    const rt = (window as any).__voltBlackout;
    if (!rt.beginMerge()) throw new Error('merge rejected');
    for (let i = 0; i < 360; i++) rt.fixedUpdate(1 / 60);
  });
  await frames(); const merged = await sample('__voltBlackout', 'merged');
  expect(merged.volt.visible).toBe(false); expect(merged.light.visible).toBe(false);
  await page.evaluate(() => {
    const rt = (window as any).__voltBlackout;
    rt.resources.phase.restore('boss-defeated'); rt.resources.specimenForm.restore('specimen');
    if (!rt.beginSplit() || !rt.completeSplit()) throw new Error('split rejected');
  });
  await frames(); const split = await sample('__voltBlackout', 'split');
  expect(split.volt.visible).toBe(true); expect(split.light.visible).toBe(true); expect(split.volt.opacity).toBe(1);
  await page.evaluate(() => (window as any).__voltBlackout.restartLevel()); await frames();
  expect((await sample('__voltBlackout', 'restart')).active).toBe('volt');
  // Diagnostic original-light-removal controls run only after gameplay/cache
  // assertions. They intentionally compile the old smaller light signature.
  const lightEquivalence = await page.evaluate(async () => {
    const rt = (window as any).__voltBlackout, layer = rt.renderLayer, renderer = layer.renderer;
    rt.stop(); renderer.setAnimationLoop(null);
    const light = rt.resources.voltLight, gl = renderer.getContext();
    const saved = { preset: layer.graphicsPreset, cap: layer.pixelRatioCap, visible: light.visible, intensity: light.intensity };
    const check = (stage: string) => {
      const error = gl.getError();
      if (error) throw new Error(`GL error ${error} at ${stage}`);
    };
    check('control entry');
    const stats = { fixedDeltaSeconds:1/60, frameDeltaSeconds:0, rawFrameDeltaSeconds:0,
      stepsThisFrame:0, interpolationAlpha:1, droppedSimulationTimeSeconds:0, renderFps:0 };
    const draw = () => {
      rt.render(1, stats);
      check('control render');
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      check('control readback');
      return pixels;
    };
    const difference = (a: Uint8Array, b: Uint8Array) => {
      let maximum = 0, changed = 0, lit = 0, low = 255, high = 0;
      for (let i=0;i<a.length;i+=4) {
        let d = 0;
        for(let c=0;c<3;c++) { d=Math.max(d,Math.abs(a[i+c]-b[i+c]));low=Math.min(low,a[i+c]);high=Math.max(high,a[i+c]); }
        if(d)changed++;maximum=Math.max(maximum,d);if(Math.max(a[i],a[i+1],a[i+2])>32)lit++;
      }
      return {maximum,changed,lit,range:high-low,pixels:a.length/4};
    };
    const result = [];
    try {
      for (const preset of ['normal','performance']) {
        layer.setGraphicsSettings(preset, preset === 'performance' ? 0.75 : 2);
        // Match menu application: resize first, then render on the next browser frame.
        await new Promise(requestAnimationFrame);
        check(`${preset} resize`);
        light.intensity = 0; light.visible = true;
        draw(); const reference = draw();
        light.visible = false;
        await renderer.compileAsync(layer.scene, layer.cameraRig.camera);
        const original = draw();
        light.visible = true;
        const restored = draw();
        result.push({preset,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
          original:difference(reference,original),restored:difference(reference,restored),error:gl.getError()});
      }
    } finally {light.visible=saved.visible;light.intensity=saved.intensity;layer.setGraphicsSettings(saved.preset,saved.cap);}
    return result;
  });
  console.info('zero-radiance light equivalence', lightEquivalence);
  for (const control of lightEquivalence) {
    expect(control.original.lit).toBeGreaterThan(control.original.pixels * 0.01);
    expect(control.original.range).toBeGreaterThan(32);
    expect(control.original.maximum).toBe(0);
    expect(control.restored.maximum).toBe(0);
    expect(control.error).toBe(0);
  }
  const lifecycle = await page.evaluate(async () => {
    const rt = (window as any).__voltBlackout;
    rt.stop(); rt.unload(); rt.load();
    const failed = rt.resources.voltPresentation, prepare = failed.prepare.bind(failed);
    failed.prepare = () => prepare(async () => { throw new Error('injected Volt asset failure'); });
    let rejected = false;
    try { await rt.preparePresentation(); } catch { rejected = true; }
    const failure = { rejected, state: rt.state, detached: failed.root.parent === null };
    rt.load(); await rt.preparePresentation(); const retry = rt.resources.voltPresentation.ready;
    rt.unload(); rt.load(); const late = rt.resources.voltPresentation, pending = rt.preparePresentation();
    rt.unload(); await pending;
    return { failure, retry, late: { ready: late.ready, detached: late.root.parent === null, state: rt.state },
      gelMaterials: rt.renderLayer.gelRendering.materialCount };
  });
  expect(lifecycle).toEqual({ failure: { rejected: true, state: 'unloaded', detached: true }, retry: true,
    late: { ready: false, detached: true, state: 'unloaded' }, gelMaterials: 0 });
  await writeFile(resolve(directory, 'journeys.json'), JSON.stringify({ samples, firstDeathProgramGrowth, lightEquivalence, lifecycle, errors, failedRequests }, null, 2));
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  const video = page.video(); await page.close(); await video?.saveAs(resolve(directory, 'journey.webm'));
});
}
