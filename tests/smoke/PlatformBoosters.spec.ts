import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { finishOpening } from '../helpers/OpeningHandoff.ts';

async function observeSession(page: Page): Promise<void> {
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__boosterSession=new $2({initialRuntime:') });
  });
}

test('facility boosters: representative placement, visual and rendering budget evidence', async ({ page }, info) => {
  test.setTimeout(900_000);
  const phase = process.env.SPECIMEN_BOOSTER_BASELINE === '1' ? 'before' : 'after';
  const errors: string[] = [], evidence: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await observeSession(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  for (const level of [1, 2]) {
    const cases = level === 1 ? [
      [2, 'room-2-platform-a-height-lesson'], [2, 'room-2-top-of-sticky-wall-ledge'], [2, 'room-2-exit-balcony'],
      [3, 'room-3-entry-platform'], [3, 'room-3-platform-a-bounce'], [3, 'room-3-platform-b-gap'],
      [5, 'room-5-lower-platform-c'], [5, 'room-5-moving-platform-1'], [5, 'room-5-moving-platform-2'],
    ] as const : [
      [2, 'cultivation-room-2-button-rest-ledge'], [3, 'cultivation-room-3-bob-entry'],
      [3, 'cultivation-room-3-bob-first-wall-exit'], [3, 'cultivation-room-3-bob-west-wall-exit'],
      [3, 'cultivation-room-3-bob-final-wall-exit'], [5, 'room-5-route-0-jump-1'],
    ] as const;
    for (const [room, name] of cases) {
      await page.evaluate(({ level, room }) => {
        const rt = (window as any).__boosterSession.runtime;
        rt.stop();
        if (level === 1) rt.resources.containmentLevel.teleportToRoomForDebug(room);
        else rt.teleportToAuthoredPreviewRoom(room);
      }, { level, room });
      if (level === 2) await page.waitForFunction(room => {
        const rt = (window as any).__boosterSession.runtime;
        return !rt.preparationQueue.diagnostics.pending &&
          rt.resources.authoredPreview[['roomOne', 'roomTwo', 'roomThree', 'roomFour', 'roomFive'][room - 1]].root.visible;
      }, room, { timeout: 180_000 });
      const capture = await page.evaluate(async ({ level, room, name }) => {
        const rt = (window as any).__boosterSession.runtime, r = rt.resources, layer = rt.renderLayer;
        const source = level === 1 ? r.testScene : r.authoredPreview;
        const owner = level === 1 ? source : source[['roomOne', 'roomTwo', 'roomThree', 'roomFour', 'roomFive'][room - 1]];
        const platform = owner.collisionMeshes.find((mesh: any) => mesh.name === name || mesh.name === `${name}-moving-platform-surface`);
        if (!platform) throw new Error(`Missing representative platform: ${name}`);
        const point = platform.getWorldPosition(platform.position.clone());
        const camera = layer.cameraRig.camera;
        // View wall/transition ledges from inside their room, avoiding the
        // sticky wall and adjacent Room 3 entrance deck as foreground occluders.
        const side = level === 1 && (room === 3 || name === 'room-2-top-of-sticky-wall-ledge' || name === 'room-2-exit-balcony') ? -1 : 1;
        camera.position.set(point.x + side * 4, point.y - (name === 'room-2-platform-a-height-lesson' ? .9 : 1.4), point.z + side * 5);
        camera.lookAt(point.x, point.y - .7, point.z); camera.updateMatrixWorld(true);
        const boosters = level === 1 ? source.platformBoosters : r.roomFiveEncounter.platformBoosters;
        if (boosters) { boosters.reset(); for (let i = 0; i < 90; i++) boosters.update(1 / 60, point); }
        layer.setPresentationResolution(undefined); layer.render();
        const png = layer.canvas.toDataURL('image/png');
        layer.setPresentationResolution(320 * 180);
        const gl = layer.renderer.getContext();
        const measure = () => {
          // Warm both signatures before sampling. Stay in one browser task so
          // the application's camera/workload loop cannot change the view.
          for (let i = 0; i < 2; i++) { layer.render(); gl.finish(); }
          const timings = [];
          for (let i = 0; i < 6; i++) {
            const start = performance.now(); layer.render(); gl.finish(); timings.push(performance.now() - start);
          }
          return { timings, drawCalls: layer.renderer.info.render.calls, triangles: layer.renderer.info.render.triangles };
        };
        const toggles: any[] = [];
        if (level === 1) {
          layer.scene.traverse((object: any) => {
            if (object.userData.platformBoosterIds || object.name.endsWith('-booster-mount') ||
              object.name.startsWith('containment-platform-booster-spill-')) toggles.push(object);
          });
        } else if (room === 2 || room === 3) {
          const batch = owner.root.getObjectByName(`cultivation-room-${room}-booster-batch`);
          if (batch) toggles.push(batch);
          layer.scene.traverse((object: any) => {
            if (object.name.startsWith('room-5-platform-booster-spill-')) toggles.push(object);
          });
        }
        const visibility = toggles.map(object => object.visible);
        toggles.forEach(object => object.visible = false);
        const effectsDisabled = measure();
        toggles.forEach((object, index) => object.visible = visibility[index]);
        const effectsEnabled = measure();
        const snapshot = layer.getDiagnostics();
        let points = 0, shadowPoints = 0;
        layer.scene.traverse((object: any) => { if (object.isPointLight) { points++; if (object.castShadow) shadowPoints++; } });
        return { png, level, room, name, ...snapshot, points, shadowPoints, effectsDisabled, effectsEnabled,
          boosterCount: boosters?.platformCount ?? null, glError: gl.getError() };
      }, { level, room, name });
      const { png, ...measurements } = capture;
      await writeFile(info.outputPath(`${phase}-${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
      evidence.push(measurements);
      expect(capture.glError).toBe(0);
      if (phase === 'after') {
        expect(capture.boosterCount).toBe(level === 1 ? 25 : 35);
        const addedDraws = capture.effectsEnabled.drawCalls - capture.effectsDisabled.drawCalls;
        expect(addedDraws).toBeGreaterThanOrEqual(0);
        expect(addedDraws).toBeLessThanOrEqual(level === 1 ? 22 : 4);
        if (level === 2 && room === 5) expect(addedDraws).toBe(0);
        else expect(addedDraws).toBeGreaterThan(0);
      }
    }
    if (level === 1) {
      await page.evaluate(() => {
        const rt = (window as any).__boosterSession.runtime;
        rt.renderLayer.setPresentationResolution(undefined); rt.start(); rt.resources.containmentLevel.completeForDebug();
      });
      await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 240_000 });
    }
  }
  // Use the supported rescue-film skip/handoff and verify that teardown leaves
  // no facility booster batches in Blackout's different platform design.
  await page.evaluate(() => {
    const rt = (window as any).__boosterSession.runtime;
    rt.renderLayer.setPresentationResolution(undefined); rt.start(); rt.teleportToAuthoredPreviewRoom(5);
    const r = rt.resources, controller = r.authoredPreview.roomFive.controller;
    controller.reset('controls'); controller.update(1.5, false, false, false, true);
    controller.update(4, false, false, false, false); rt.updateRoomFive(1 / 60, r);
    if (!r.roomFiveFinale.active) throw new Error('Rescue finale did not start');
    r.roomFiveFinale.requestSkip(); rt.fixedUpdate(1 / 60);
  });
  await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 240_000 });
  const blackout = await page.evaluate(() => {
    const layer = (window as any).__boosterSession.runtime.renderLayer;
    let boosterBatches = 0;
    layer.scene.traverse((object: any) => { if (object.userData.platformBoosterIds) boosterBatches++; });
    return { level: 3, boosterBatches, ...layer.getDiagnostics(), glError: layer.renderer.getContext().getError() };
  });
  expect(blackout.boosterBatches).toBe(0); expect(blackout.glError).toBe(0); evidence.push(blackout);
  expect(errors).toEqual([]);
  await writeFile(`test-results/boosters-${phase}.json`, JSON.stringify({ evidence, errors }, null, 2));
});

test('Room 3 entry floats without support remnants and still supports Bob', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await observeSession(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  const proof = await page.evaluate(() => {
    const session = (window as any).__boosterSession, rt = session.runtime, r = rt.resources, layer = rt.renderLayer;
    layer.setAnimationLoop(null);
    r.containmentLevel.teleportToRoomForDebug(3);
    const scene = r.testScene, platform = scene.collisionMeshes.find((mesh: any) => mesh.name === 'room-3-entry-platform');
    const before = platform.position.toArray(), point = platform.getWorldPosition(platform.position.clone());
    r.body.teleport({ x: point.x, y: point.y + platform.geometry.parameters.height / 2 + .46, z: point.z - .8 });
    for (let step = 0; step < 60; step++) session.fixedUpdate(1 / 60);
    const names: string[] = [], batches: any[] = [];
    scene.root.traverse((object: any) => {
      names.push(object.name, ...(object.userData.staticBatchSourceNames ?? []));
      if (object.userData.platformBoosterIds) batches.push(object);
    });
    const ids = batches.flatMap(batch => batch.userData.platformBoosterIds);
    const camera = layer.cameraRig.camera;
    scene.platformBoosters.reset();
    for (let i = 0; i < 90; i++) scene.platformBoosters.update(1 / 60, point);
    layer.setPresentationResolution(undefined);
    const captures = [-1, 1].map(side => {
      camera.position.set(point.x + side * 5, point.y - 1.8, point.z - side * 6);
      camera.lookAt(point.x, point.y - .8, point.z); camera.updateMatrixWorld(true);
      layer.render();
      return layer.canvas.toDataURL('image/png');
    });
    return { captures, before, after: platform.position.toArray(), supported: r.body.isSupportedBy(platform),
      entryEngines: ids.filter((id: string) => id === platform.name).length, batches: batches.length,
      supportRemnants: names.filter(name => /^room-3-entry-platform-actuator-(column|base-socket|upper-collar)$/.test(name)),
      glError: layer.renderer.getContext().getError() };
  });
  for (const [index, png] of proof.captures.entries()) {
    await writeFile(info.outputPath(`entry-angle-${index + 1}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  const { captures, ...measurements } = proof;
  await writeFile(info.outputPath('entry-proof.json'), JSON.stringify(measurements, null, 2));
  expect(proof.after).toEqual(proof.before); expect(proof.supported).toBe(true);
  expect(proof.entryEngines).toBe(1); expect(proof.batches).toBe(5); expect(proof.supportRemnants).toEqual([]);
  expect(proof.glError).toBe(0); expect(errors).toEqual([]);
});

test('both Room 5 booster assemblies stay attached through actual fixed updates, fractional renders and reset', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await observeSession(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  const proof = await page.evaluate(() => {
    const session = (window as any).__boosterSession, rt = session.runtime, r = rt.resources;
    rt.renderLayer.setAnimationLoop(null); rt.renderLayer.setPresentationResolution(320 * 180);
    r.containmentLevel.teleportToRoomForDebug(5);
    const room = r.testScene.roomFive, platforms = [room.movingPlatformOne, room.movingPlatformTwo];
    room.lasers.hazards.forEach((hazard: any) => hazard.setCircuitGateEnabled(false));
    const carrier = platforms[0];
    r.body.teleport({ x: carrier.position.x, y: carrier.position.y + carrier.size.y / 2 + .46, z: carrier.position.z });
    const stats = { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 30, frameDeltaSeconds: 1 / 30,
      stepsThisFrame: 2, interpolationAlpha: .37, droppedSimulationTimeSeconds: 0, renderFps: 30 };
    let maxAttachmentError = 0, maxAuthorityChange = 0;
    const initialClock = r.testScene.platformBoosters.clock.value;
    for (let step = 0; step < 390; step++) {
      session.fixedUpdate(1 / 60);
      if (step % 12 !== 0) continue;
      const before = platforms.map((platform: any) => platform.position.clone());
      session.render(.37, stats);
      platforms.forEach((platform: any, index: number) => {
        const dressing = platform.root.getObjectByName(`room-5-moving-platform-${index + 1}-production-dressing`);
        const batch = dressing.getObjectByName(`containment-moving-${index + 1}-booster-batch`);
        maxAttachmentError = Math.max(maxAttachmentError,
          dressing.getWorldPosition(dressing.position.clone()).distanceTo(batch.getWorldPosition(batch.position.clone())));
        maxAuthorityChange = Math.max(maxAuthorityChange, platform.position.distanceTo(before[index]));
      });
    }
    const riderSupported = r.body.isSupportedBy(carrier.collisionMesh);
    const animated = r.testScene.platformBoosters.clock.value > initialClock;
    const png = rt.renderLayer.canvas.toDataURL('image/png');
    r.containmentLevel.recoverActiveCheckpoint(); session.render(.8, stats);
    const reset = platforms.every((platform: any, index: number) => platform.position.distanceTo(platform.previousPosition) === 0 &&
      platform.root.getObjectByName(`room-5-moving-platform-${index + 1}-production-dressing`).position.lengthSq() === 0);
    return { png, maxAttachmentError, maxAuthorityChange, riderSupported, animated, reset,
      glError: rt.renderLayer.renderer.getContext().getError() };
  });
  const { png, ...measurements } = proof;
  await writeFile(info.outputPath('moving-booster-ride.png'), Buffer.from(png.split(',')[1], 'base64'));
  await writeFile(info.outputPath('moving-booster-proof.json'), JSON.stringify(measurements, null, 2));
  expect(proof.maxAttachmentError).toBeLessThan(1e-8); expect(proof.maxAuthorityChange).toBe(0);
  expect(proof.riderSupported).toBe(true); expect(proof.animated).toBe(true); expect(proof.reset).toBe(true);
  expect(proof.glError).toBe(0); expect(errors).toEqual([]);
});
