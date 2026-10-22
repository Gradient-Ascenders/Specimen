import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { finishOpening } from '../helpers/OpeningHandoff.ts';
import { isExpectedMusicCancellation } from '../helpers/ExpectedMusicCancellation.ts';

// Observe the shipped composition root, using the same boundary as ProductionParity.
// No production debug globals or alternative camera/gameplay implementations.
async function observe(page: Page) {
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern,
      '$1=globalThis.__viewSession=new $2({initialRuntime:') });
  });
}

// Keep simulation/input real, but explicitly control cadence instead of relying
// on the software renderer's wall-clock frame rate. Render sparsely for speed.
async function advance(page: Page, ticks = 1, fps = 60) {
  await page.evaluate(({ ticks, fps }) => {
    const rt = (window as any).__viewSession.runtime;
    for (let i = 0; i < ticks; i++) { rt.fixedUpdate(1 / 60); rt.input.endFixedUpdate(); }
    rt.render(.5, { frameDeltaSeconds: 1 / fps, rawFrameDeltaSeconds: 1 / fps });
    // Settle the real rig at the requested cadence between two representative
    // draws; continuous runtime/rider motion is covered by the Node regressions.
    for (let i = 1; i < Math.ceil(fps / 4); i++) rt.renderLayer.cameraRig.update(.5, 1 / fps);
    rt.render(.5, { frameDeltaSeconds: 1 / fps, rawFrameDeltaSeconds: 1 / fps });
  }, { ticks, fps });
}
const state = (page: Page) => page.evaluate(() => {
  const rt = (window as any).__viewSession.runtime, layer = rt.renderLayer;
  return { ...layer.cameraRig.getDiagnostics(), active: rt.getSlimeHUDSnapshot().activeSlimeId,
    phase: rt.phase, drone: rt.maintenanceDroneReadModel, electrical: rt.voltElectricalReadModel,
    glError: layer.renderer.getContext().getError(), camera: layer.cameraRig.camera.uuid,
    memory: layer.renderer.info.memory, calls: layer.renderer.info.render.calls };
});
async function capture(page: Page, name: string) {
  // Read immediately after submission: the production renderer intentionally
  // uses preserveDrawingBuffer=false, so idle canvas screenshots are unreliable.
  const png = await page.evaluate(() => {
    const rt = (window as any).__viewSession.runtime;
    rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
    return rt.renderLayer.canvas.toDataURL('image/png').split(',')[1];
  });
  await writeFile(`artifacts/evidence/camera-view/${name}.png`, Buffer.from(png, 'base64'));
}
async function press(page: Page, key: string) {
  await page.keyboard.down(key); await advance(page); await page.keyboard.up(key); await advance(page);
}

async function openLevel(page: Page, level: number, name: string) {
  await observe(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: `Level ${level} ${name}`, exact: true }).click();
  if (level === 1) await finishOpening(page, false);
  else await page.getByRole('button', { name: `Enter Level ${level}`, exact: true }).click({ timeout: 180_000 });
  await page.waitForFunction(() => {
    const rt = (window as any).__viewSession.runtime;
    return rt.input.enabled && !rt.ventArrival?.active && !rt.resources.ventArrival?.active && !rt.preparationQueue?.diagnostics.pending;
  }, null, { timeout: 180_000 });
  await page.locator('canvas[data-gameplay-canvas]').click();
  await page.evaluate(() => (window as any).__viewSession.runtime.renderLayer.setAnimationLoop(null));
  await mkdir('artifacts/evidence/camera-view', { recursive: true });
}

for (const [level, name] of [[1, 'Containment'], [2, 'Cultivation'], [3, 'Blackout']] as const) {
  test(`manual camera modes in Level ${level}: input, roster, aim and lifecycle`, async ({ page, baseURL }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
    page.on('requestfailed', r => { if (!isExpectedMusicCancellation(r, baseURL!)) errors.push(`${r.failure()?.errorText}: ${r.url()}`); });
    await openLevel(page, level, name);
    await advance(page);
    const evidence: any[] = [await state(page)];
    expect(evidence[0].viewMode).toBe('third-person');
    await mkdir('artifacts/evidence/camera-view', { recursive: true });
    await capture(page, `level-${level}-third-person`);
    await press(page, 'KeyV');
    const first = await state(page); evidence.push(first);
    expect(first.viewMode).toBe('first-person');
    expect(first.firstPersonWeight).toBe(1);
    expect(first.currentDistanceMetres).toBeLessThan(.1);
    expect(first.memory).toEqual(evidence[0].memory);
    const bodyPass = await page.evaluate(() => {
      const rt = (window as any).__viewSession.runtime, r = rt.resources;
      const presentation = rt.getSlimeHUDSnapshot().activeSlimeId === 'volt'
        ? r.voltPresentation : r.bobPresentation ?? r.testScene.bob;
      const mesh = presentation.asset.body, before = mesh.onBeforeRender;
      const shadows = mesh.castShadow, draws: boolean[] = [];
      mesh.onBeforeRender = function (...args: any[]) {
        before.apply(this, args);
        draws.push(!args[4].colorWrite && !args[4].depthWrite);
      };
      rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
      mesh.onBeforeRender = before;
      return { draws, shadowsPreserved: mesh.castShadow === shadows,
        restored: mesh.material.colorWrite && mesh.material.depthWrite, visible: mesh.visible };
    });
    expect(bodyPass.draws.length).toBeGreaterThan(0);
    expect(bodyPass.draws.every(Boolean)).toBe(true);
    expect(bodyPass.visible && bodyPass.shadowsPreserved && bodyPass.restored).toBe(true);
    evidence.push({ bodyPass, ...first });
    // Walk and jump through the actual input/physics path in each mode.
    await page.keyboard.down('KeyW'); await advance(page, 12); await page.keyboard.up('KeyW');
    await press(page, 'Space'); await advance(page, 12);
    await capture(page, `level-${level}-first-person`);
    if (level === 1) await page.evaluate(() => {
      const r = (window as any).__viewSession.runtime.resources;
      r.slimeManager.unlock('goop'); r.goopBody.teleport(r.body.position);
    });
    const roster = level === 3 ? ['bob', 'goop', 'volt'] : ['goop', 'bob'];
    for (const active of roster) {
      await press(page, 'Tab');
      expect((await state(page)).active).toBe(active);
      expect((await state(page)).viewMode).toBe('first-person');
      if (active === 'goop' || active === 'volt') {
        await page.mouse.down({ button: 'right' }); await advance(page);
        await page.mouse.down(); await advance(page); await page.mouse.up();
        evidence.push({ ability: active, ...await state(page) });
        await capture(page, `level-${level}-${active}-aim`);
        await page.mouse.up({ button: 'right' }); await advance(page);
        expect((await state(page)).firstPersonWeight).toBe(1);
      }
    }
    // Toggle back and allow the existing collision recovery to complete.
    await press(page, 'KeyV'); await advance(page, 1, 30); await advance(page, 1, 144);
    const restored = await state(page);
    expect(restored.viewMode).toBe('third-person');
    expect(restored.firstPersonWeight).toBe(0);
    expect(restored.memory).toEqual(first.memory);
    await page.keyboard.down('KeyD'); await advance(page, 12); await page.keyboard.up('KeyD');
    await press(page, 'Space');
    await press(page, 'KeyV');
    await page.evaluate(() => (window as any).__viewSession.runtime.restartLevel());
    await advance(page);
    expect((await state(page)).viewMode).toBe('first-person');
    evidence.push(await state(page));
    expect(evidence.every(s => s.glError === 0)).toBe(true);
    expect(evidence.every(s => s.camera === first.camera)).toBe(true);
    await writeFile(`artifacts/evidence/camera-view/level-${level}.json`, JSON.stringify(evidence, null, 2));
    expect(errors).toEqual([]);
  });
}

for (const [level, name] of [[1, 'Containment'], [2, 'Cultivation'], [3, 'Blackout']] as const) {
  test(`camera journey Level ${level}: authored traversal and special presentations`, async ({ page, baseURL }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
    page.on('requestfailed', r => { if (!isExpectedMusicCancellation(r, baseURL!)) errors.push(`${r.failure()?.errorText}: ${r.url()}`); });
    await openLevel(page, level, name);
    await press(page, 'KeyV');
    const evidence: any[] = [];
    if (level === 1) {
      await page.evaluate(() => {
        const rt = (window as any).__viewSession.runtime, r = rt.resources;
        r.containmentLevel.teleportToRoomForDebug(2);
        r.body.teleport(r.body.position.clone().set(14.17, 6, 43));
        rt.renderLayer.cameraRig.reset();
        rt.renderLayer.cameraRig.setGroundOrbitYawRadians(-Math.PI / 2);
      });
      await page.keyboard.down('KeyW'); await advance(page, 18); await page.keyboard.up('KeyW');
      const attached = await page.evaluate(() => {
        const b = (window as any).__viewSession.runtime.resources.body;
        return { attached: b.attached, up: b.gameplayUp.toArray(), y: b.position.y };
      });
      expect(attached.attached).toBe(true); expect(attached.up[0]).toBeLessThan(-.9);
      evidence.push({ attached, ...await state(page) });
      await capture(page, 'level-1-sticky-wall');
      for (const index of [0, 1]) {
        const ride = await page.evaluate(index => {
          const rt = (window as any).__viewSession.runtime, r = rt.resources;
          r.containmentLevel.teleportToRoomForDebug(5);
          const room = r.testScene.roomFive;
          const platform = index === 0 ? room.movingPlatformOne : room.movingPlatformTwo;
          r.body.teleport(platform.root.position.clone().add(r.body.position.clone().set(0, platform.size.y / 2 + .46, 0)));
          const zero = r.body.position.clone().set(0, 0, 0), start = platform.root.position.clone();
          for (let i = 0; i < 60; i++) { r.body.update(1 / 60, zero); room.updateTraversal(1 / 60, r.body, [r.body]); }
          rt.renderLayer.cameraRig.reset(); rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
          return { grounded: r.body.grounded, carrier: r.body.supportCollider === platform.collisionMesh,
            travel: platform.root.position.distanceTo(start) };
        }, index);
        expect(ride.grounded && ride.carrier).toBe(true); expect(ride.travel).toBeGreaterThan(.5);
        await advance(page, 0); await capture(page, `level-1-moving-platform-${index + 1}`);
        evidence.push({ ride, ...await state(page) });
      }
    } else if (level === 2) {
      for (const room of [2, 4]) {
        await page.evaluate(room => (window as any).__viewSession.runtime.teleportToAuthoredPreviewRoom(room), room);
        await page.waitForFunction(room => {
          const rt = (window as any).__viewSession.runtime;
          rt.render(.5, { frameDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60 });
          return !rt.preparationQueue.diagnostics.pending && rt.resources.authoredPreview[room === 2 ? 'roomTwo' : 'roomFour'].root.visible;
        }, room, { timeout: 180_000, polling: 250 });
        if (room === 4) {
          await page.evaluate(() => {
            const rt = (window as any).__viewSession.runtime, r = rt.resources;
            const floor = r.authoredPreview.roomFour.root.getObjectByName('room-4-lift-floor');
            const point = floor.getWorldPosition(r.pair.bobBody.position.clone()).add(r.pair.bobBody.position.clone().set(0, .86, 0));
            r.pair.bobBody.teleport(point.clone().add(point.clone().set(-1, 0, 0)));
            r.pair.goopBody.teleport(point.clone().add(point.clone().set(1, 0, 0)));
            rt.renderLayer.cameraRig.reset();
          });
          await advance(page, 125);
          expect(await page.evaluate(() => (window as any).__viewSession.runtime.resources.authoredPreview.roomFour.controller.running)).toBe(true);
          expect((await state(page)).profileId).toBe('cultivation-descent');
          expect((await state(page)).firstPersonWeight).toBe(1);
        } else {
          await page.keyboard.down('KeyD'); await advance(page, 10); await page.keyboard.up('KeyD');
        }
        evidence.push(await state(page)); await capture(page, `level-2-room-${room}-first-person`);
        await press(page, 'KeyV'); await capture(page, `level-2-room-${room}-third-person`); await press(page, 'KeyV');
        if (room === 2) {
          await page.evaluate(() => {
            const rt = (window as any).__viewSession.runtime, r = rt.resources;
            let duct: any;
            rt.renderLayer.scene.traverse((o: any) => { if (o.userData.transitionRole === 'ventilation-air-duct') duct = o; });
            const floor = duct.children.find((o: any) => o.name === `${duct.name}-floor`);
            const point = floor.getWorldPosition(r.pair.bobBody.position.clone()); point.y += .58;
            r.pair.bobBody.teleport(point); rt.renderLayer.cameraRig.reset();
            rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
          });
          await page.keyboard.down('KeyW'); await advance(page, 18); await page.keyboard.up('KeyW');
          await capture(page, 'level-2-tight-duct'); evidence.push(await state(page));
          await page.keyboard.down('KeyS'); await advance(page, 18); await page.keyboard.up('KeyS');
          expect((await state(page)).firstPersonWeight).toBe(1);
        }
      }
    } else {
      // Existing production controller contracts stage drone mounting/merge;
      // no collision, shader, visibility, input or camera implementations replaced.
      await press(page, 'KeyM'); await advance(page, 95);
      expect((await state(page)).drone.state).toBe('mounted');
      await page.keyboard.down('Space'); await advance(page, 20); await page.keyboard.up('Space');
      await capture(page, 'level-3-drone-first-person'); evidence.push(await state(page));
      await press(page, 'Tab'); expect((await state(page)).drone.state).toBe('parked-hover');
      expect(await page.evaluate(() => (window as any).__viewSession.runtime.beginMerge())).toBe(true);
      await advance(page, 1); expect((await state(page)).firstPersonWeight).toBe(0);
      await capture(page, 'level-3-merge-authored'); evidence.push(await state(page));
      await advance(page, 359); expect((await state(page)).phase).toBe('specimen');
      expect((await state(page)).firstPersonWeight).toBe(1);
      await page.evaluate(() => (window as any).__viewSession.runtime.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI));
      await capture(page, 'level-3-specimen-first-person');
      await page.mouse.down({ button: 'right' }); await page.mouse.down(); await advance(page);
      await page.mouse.up(); await advance(page);
      expect(await page.evaluate(() => (window as any).__viewSession.runtime.specimenAttackReadModel.aimActive)).toBe(true);
      await capture(page, 'level-3-specimen-aim');
      await page.mouse.up({ button: 'right' }); await advance(page);
      expect((await state(page)).firstPersonWeight).toBe(1);
      await page.evaluate(() => (window as any).__viewSession.runtime.transitionPhase('boss'));
      await advance(page, 30); expect((await state(page)).phase).toBe('boss');
      await capture(page, 'level-3-boss-first-person'); evidence.push(await state(page));
      await page.evaluate(() => { const rt = (window as any).__viewSession.runtime; rt.requestFailure(); });
      await advance(page, 1); expect((await state(page)).firstPersonWeight).toBe(0);
      // Finish the actual death/Retry contract. Direct checkpoint recovery
      // restores bodies but deliberately does not complete a death sequence.
      await advance(page, 180);
      await expect(page.locator('.death-retry')).toBeVisible();
      await page.locator('.death-retry').click();
      await advance(page); expect((await state(page)).viewMode).toBe('first-person');
      // Death releases pointer lock. The existing flow may already have paused
      // when recovery enabled input before that asynchronous event arrived.
      if (await page.locator('.game-flow').getAttribute('data-state') === 'playing') await page.keyboard.press('KeyP');
      const pause = page.locator('[data-flow-panel="paused"]');
      await expect(pause).toBeVisible();
      await pause.locator('.pause-rail').evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
      });
      await pause.getByRole('button', { name: 'Return to menu', exact: true }).click({ timeout: 60_000 });
      await expect(page.locator('[data-flow-panel="title"]')).toBeVisible({ timeout: 180_000 });
      expect((await state(page)).viewMode).toBe('third-person');
    }
    await writeFile(`artifacts/evidence/camera-view/level-${level}-journey.json`, JSON.stringify(evidence, null, 2));
    expect(evidence.every(s => s.glError === 0)).toBe(true);
    expect(errors).toEqual([]);
  });
}
