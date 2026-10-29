import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';
import { FORMER_TRAVERSAL_SUPPORTS } from '../../helpers/FormerTraversalSupports.ts';

async function observeSession(page: Page): Promise<void> {
  await exposeGame(page, { session: '__boosterSession' });
}

test('former traversal support volumes stay clear in the live Cultivation collision world', async ({ page }, info) => {
  test.setTimeout(600_000);
  const errors = watchBrowserErrors(page);


  await observeSession(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  await page.evaluate(() => {
    const rt = (window as any).__boosterSession.runtime;
    rt.resources.containmentLevel.completeForDebug();
  });
  await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 240_000 });
  await page.evaluate(() => (window as any).__boosterSession.runtime.teleportToAuthoredPreviewRoom(3));
  await page.waitForFunction(() => {
    const rt = (window as any).__boosterSession.runtime;
    return !rt.preparationQueue.diagnostics.pending && rt.resources.authoredPreview.roomThree.root.visible;
  }, undefined, { timeout: 180_000 });
  // Pause the outer game loop to isolate real Bob physics from drone damage
  // and recovery. Keep the actual runtime collision registry and body intact.
  const proof = await page.evaluate(formerSupports => {
    const rt = (window as any).__boosterSession.runtime, r = rt.resources, layer = rt.renderLayer;
    layer.setAnimationLoop(null); rt.stop();
    const room = r.authoredPreview.roomThree, body = r.pair.bobBody, world = r.collisionWorld;
    room.root.updateWorldMatrix(true, true);
    const direction = body.movementHit.point.clone().set(1, 0, 0);
    const Hit = body.movementHit.constructor;
    const cases = formerSupports.map(({ id, platformId, position }) => {
      if (room.root.getObjectByName(id) || r.authoredPreview.collisionMeshes.some((mesh: any) => mesh.name === id)) {
        throw new Error(`Retired support remains: ${id}`);
      }
      const platform = room.collisionMeshes.find((mesh: any) => mesh.name === platformId);
      const height = platform.geometry.parameters.height, underside = platform.position.y - height / 2;
      let queries = 0;
      for (const y of [position[1], underside - 1.5]) {
        const centre = room.root.localToWorld(platform.position.clone().set(position[0], y, position[2]));
        for (const axis of [direction, direction.clone().set(0, 0, 1)]) {
          const origin = centre.clone().addScaledVector(axis, -2), displacement = axis.clone().multiplyScalar(4);
          for (const mask of [1, 2, 4, 8]) {
            const hit = new Hit();
            if (world.sweepSphere(origin, displacement, body.radiusMetres, hit, mask)) {
              throw new Error(`${id} query layer ${mask} obstructed by ${hit.object?.name}`);
            }
            queries++;
          }
          if (world.raycast(origin, axis, 4, new Hit())) throw new Error(`${id} still blocks sight`);
          queries++;
        }
      }
      const start = room.root.localToWorld(platform.position.clone().set(position[0] - 2, underside - 1.5, position[2]));
      body.teleport(start);
      for (let step = 0; step < 60; step++) body.update(1 / 60, direction);
      const crossedMetres = body.position.x - start.x;
      if (crossedMetres <= 4) throw new Error(`Bob snagged in ${id}: ${crossedMetres}`);
      const top = platform.getWorldPosition(platform.position.clone()); top.y += height / 2 + .46;
      body.teleport(top);
      for (let step = 0; step < 12; step++) {
        body.update(1 / 60, direction);
        if (!body.isSupportedBy(platform)) throw new Error(`Bob lost support on ${platformId}`);
      }
      r.bobPresentation.setPosition(body.position); r.bobPresentation.present(1);
      const point = platform.getWorldPosition(platform.position.clone()), camera = layer.cameraRig.camera;
      camera.position.set(point.x + 4, point.y - 1.4, point.z + 5);
      camera.lookAt(point.x, point.y - .7, point.z); camera.updateMatrixWorld(true);
      const boosters = r.roomFiveEncounter.platformBoosters;
      for (let frame = 0; frame < 90; frame++) boosters.update(1 / 60, point);
      layer.setPresentationResolution(undefined); layer.render();
      const png = layer.canvas.toDataURL('image/png');
      return { id, platformId, queries, crossedMetres, deckSupported: true, png };
    });
    return { cases, boosterCount: r.roomFiveEncounter.platformBoosters.platformCount,
      glError: layer.renderer.getContext().getError() };
  }, FORMER_TRAVERSAL_SUPPORTS);
  for (const { png, platformId } of proof.cases) {
    await writeFile(info.outputPath(`${platformId}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  const walks = [];
  for (const { platformId } of FORMER_TRAVERSAL_SUPPORTS) {
    const start = await page.evaluate(id => {
      const rt = (window as any).__boosterSession.runtime, r = rt.resources;
      const platform = r.authoredPreview.roomThree.collisionMeshes.find((mesh: any) => mesh.name === id);
      const top = platform.getWorldPosition(platform.position.clone()); top.y += platform.geometry.parameters.height / 2 + .46;
      r.pair.bobBody.teleport(top); rt.start();
      return top.toArray();
    }, platformId);
    await page.keyboard.down('KeyW');
    const walk = await page.evaluate(id => {
      const session = (window as any).__boosterSession, rt = session.runtime, r = rt.resources;
      const platform = r.authoredPreview.roomThree.collisionMeshes.find((mesh: any) => mesh.name === id);
      // Normal input and the full fixed-update path: drones, hazards,
      // checkpoints and puzzle controllers are enabled for these deck walks.
      for (let step = 0; step < 12; step++) {
        session.fixedUpdate(1 / 60);
        if (!r.pair.bobBody.isSupportedBy(platform)) throw new Error(`Gameplay lost support on ${id}`);
      }
      const result = { platformId: id, end: [r.pair.bobBody.position.x, r.pair.bobBody.position.y, r.pair.bobBody.position.z],
        playing: r.deathSequence.isPlaying, activeSlime: r.pair.activeSlimeId };
      rt.stop(); return result;
    }, platformId);
    await page.keyboard.up('KeyW');
    expect(walk.playing).toBe(true); expect(walk.activeSlime).toBe('bob');
    expect(Math.hypot(walk.end[0] - start[0], walk.end[2] - start[2])).toBeGreaterThan(.05);
    walks.push({ ...walk, start });
  }
  expect(proof.cases).toHaveLength(3); expect(proof.boosterCount).toBe(35);
  expect(proof.glError).toBe(0); expect(errors).toEqual([]);
  await writeFile(info.outputPath('support-collision-proof.json'), JSON.stringify({
    ...proof, cases: proof.cases.map(({ png, ...result }) => result), walks, errors,
  }, null, 2));
});

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
        expect(addedDraws).toBeLessThanOrEqual(level === 1 ? 23 : 4);
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

test('Room 3 entry floats with localized spill and still supports Bob', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors = watchBrowserErrors(page);


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
    const lamps: any[] = [];
    scene.root.traverse((object: any) => {
      if (object.name.startsWith('containment-platform-booster-spill-')) lamps.push(object);
    });
    const entryLamp = lamps.find(light => Math.abs(light.position.z - point.z) < 1e-6);
    const range = entryLamp.distance, intensity = entryLamp.intensity;
    camera.position.set(point.x + 5, point.y + 3.35, point.z + 8);
    camera.lookAt(point.x, point.y + .35, point.z - 1.1); camera.updateMatrixWorld(true);
    const gl = layer.renderer.getContext();
    const wallPixel = point.clone().set(2, 11.3, 49.201).project(camera);
    const sampleWall = () => {
      const pixels = new Uint8Array(5 * 5 * 4);
      gl.readPixels(Math.round((wallPixel.x + 1) * gl.drawingBufferWidth / 2) - 2,
        Math.round((wallPixel.y + 1) * gl.drawingBufferHeight / 2) - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const red = pixels.reduce((sum, value, index) => sum + (index % 4 === 0 ? value : 0), 0) / 25;
      return red;
    };
    // Reproduce the old range and compare the same wall patch in one frame/task.
    entryLamp.distance = 6; layer.render();
    const oldWallRed = sampleWall(); captures.push(layer.canvas.toDataURL('image/png'));
    entryLamp.distance = range; layer.render();
    const fixedWallRed = sampleWall(); captures.push(layer.canvas.toDataURL('image/png'));
    entryLamp.intensity = 0; layer.render();
    const unlitWallRed = sampleWall();
    entryLamp.intensity = intensity;
    const neighbour = scene.collisionMeshes.find((mesh: any) => mesh.name === 'room-3-platform-a-bounce');
    const neighbourPoint = neighbour.getWorldPosition(neighbour.position.clone());
    for (let i = 0; i < 120; i++) scene.platformBoosters.update(1 / 60, neighbourPoint);
    camera.position.set(neighbourPoint.x - 4, neighbourPoint.y - 1.4, neighbourPoint.z - 5);
    camera.lookAt(neighbourPoint.x, neighbourPoint.y - .7, neighbourPoint.z); camera.updateMatrixWorld(true);
    layer.render(); captures.push(layer.canvas.toDataURL('image/png'));
    return { captures, before, after: platform.position.toArray(), supported: r.body.isSupportedBy(platform),
      spill: { range, intensity, oldWallRed, fixedWallRed, unlitWallRed,
        lightCount: lamps.length, shadows: lamps.some(light => light.castShadow) },
      entryEngines: ids.filter((id: string) => id === platform.name).length, batches: batches.length,
      supportRemnants: names.filter(name => /^room-3-entry-platform-actuator-(column|base-socket|upper-collar)$/.test(name)),
      glError: gl.getError() };
  });
  for (const [index, png] of proof.captures.entries()) {
    const label = ['entry-angle-1', 'entry-angle-2', 'entry-old-spill', 'entry-fixed-spill', 'neighbour'][index];
    await writeFile(info.outputPath(`${label}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  const { captures, ...measurements } = proof;
  await writeFile(info.outputPath('entry-proof.json'), JSON.stringify(measurements, null, 2));
  expect(proof.after).toEqual(proof.before); expect(proof.supported).toBe(true);
  expect(proof.entryEngines).toBe(1); expect(proof.batches).toBe(5); expect(proof.supportRemnants).toEqual([]);
  expect(proof.spill.intensity).toBeGreaterThan(5); expect(proof.spill.lightCount).toBe(2); expect(proof.spill.shadows).toBe(false);
  expect(proof.spill.range).toBe(1.4);
  expect(proof.spill.oldWallRed).toBeGreaterThan(proof.spill.unlitWallRed + 1);
  expect(Math.abs(proof.spill.fixedWallRed - proof.spill.unlitWallRed)).toBeLessThanOrEqual(1);
  expect(proof.glError).toBe(0); expect(errors).toEqual([]);
});

test('entry doorway light-source isolation prevents the exit balcony leaking across the full wall', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 800, height: 600 });
  const errors = watchBrowserErrors(page);


  await observeSession(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  const proof = await page.evaluate(() => {
    const session = (window as any).__boosterSession, rt = session.runtime, r = rt.resources, layer = rt.renderLayer;
    layer.setAnimationLoop(null); r.containmentLevel.teleportToRoomForDebug(3);
    r.body.teleport({ x: .6, y: 11.36, z: 49.8 });
    for (let i = 0; i < 60; i++) session.fixedUpdate(1 / 60);
    session.render(1, { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60, frameDeltaSeconds: 1 / 60,
      stepsThisFrame: 1, interpolationAlpha: 1, droppedSimulationTimeSeconds: 0, renderFps: 60 });
    const boosters = r.testScene.platformBoosters;
    boosters.reset(); for (let i = 0; i < 120; i++) boosters.update(1 / 60, r.body.position);
    const ids = boosters.batches.flatMap((batch: any) => batch.root.userData.platformBoosterIds);
    const offender = boosters.jets[ids.indexOf('room-2-exit-balcony')];
    const excluded = !offender.spillEnabled;
    const glow = r.testScene.root.getObjectByName('containment-room-2-platform-booster-surface-glow');
    const settle = () => { boosters.reset(); for (let i = 0; i < 120; i++) boosters.update(1 / 60, r.body.position); };
    const camera = layer.cameraRig.camera, captures: { name: string; png: string }[] = [];
    const comparisons: any[] = [], candidates: any[] = [];
    layer.setPresentationResolution(undefined);
    for (const [view, position, target] of [
      ['room2-doorway', [-4, 13.5, 44.5], [.7, 11.4, 49.3]],
      ['screenshot-close', [1, 12.4, 47], [-1.2, 11.5, 49.2]],
      ['room3-doorway', [-5, 12.8, 57], [0, 11.2, 49.1]],
    ] as const) {
      camera.position.set(...position); camera.lookAt(...target); camera.updateMatrixWorld(true);
      const gl = layer.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      // Cover the visible wall panels and doorway posts across the whole view,
      // excluding the open doorway. Project rays onto the authored wall plane.
      const mask: number[] = [], ray = r.body.position.clone();
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        ray.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, .5).unproject(camera).sub(camera.position);
        const t = (49.14 - camera.position.z) / ray.z;
        const wx = camera.position.x + ray.x * t, wy = camera.position.y + ray.y * t;
        if (t > 0 && Math.abs(wx) < 16 && wy >= 10.85 && wy <= 20 && (Math.abs(wx) >= 1.25 || wy >= 14.2)) mask.push((y * width + x) * 4);
      }
      const compare = (a: Uint8Array, b: Uint8Array) => {
        let changed = 0, maximum = 0;
        for (const offset of mask) {
          const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(a[offset + channel] - b[offset + channel])));
          if (delta > 2) changed++; maximum = Math.max(maximum, delta);
        }
        return { changed, maximum, wallPixels: mask.length };
      };
      const capture = (name: string) => {
        layer.render(); captures.push({ name: `${view}-${name}`, png: layer.canvas.toDataURL('image/png') });
        const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return pixels;
      };
      // Replay 2c7c96b's actual two-source assignment with unchanged geometry,
      // camera, exposure and clock. Isolate each contribution before testing fix.
      offender.spillEnabled = true; glow.visible = false; settle();
      const lamps = boosters.lamps.map((slot: any) => ({ light: slot.light, platform: ids[slot.jet], intensity: slot.light.intensity }));
      candidates.push({ view, sources: lamps.map((slot: any) => ({ platform: slot.platform,
        position: slot.light.position.toArray(), range: slot.light.distance, intensity: slot.intensity })) });
      const before = capture('before');
      let withoutOffender!: Uint8Array;
      for (const slot of lamps) {
        slot.light.intensity = 0;
        const pixels = capture(`without-${slot.platform}`);
        if (slot.platform === 'room-2-exit-balcony') withoutOffender = pixels;
        slot.light.intensity = slot.intensity;
      }
      for (const slot of lamps) slot.light.intensity = 0;
      const withoutPool = capture('without-pool');
      offender.spillEnabled = false; glow.visible = true; settle();
      const after = capture('after'), powers = boosters.lamps.map((slot: any) => slot.light.intensity);
      boosters.lamps.forEach((slot: any) => slot.light.intensity = 0);
      const afterWithoutPool = capture('after-without-pool');
      boosters.lamps.forEach((slot: any, i: number) => slot.light.intensity = powers[i]);
      comparisons.push({ view, offenderContribution: compare(before, withoutOffender),
        otherOldSource: compare(withoutOffender, withoutPool), finalWallSpill: compare(after, afterWithoutPool) });
    }
    const point = r.testScene.collisionMeshes.find((mesh: any) => mesh.name === 'room-2-exit-balcony').position;
    camera.position.set(point.x - 5, point.y - 1.8, point.z - 5);
    camera.lookAt(point.x, point.y - .8, point.z); camera.updateMatrixWorld(true);
    layer.render(); captures.push({ name: 'exit-underside-after', png: layer.canvas.toDataURL('image/png') });
    const drawsWithGlow = layer.renderer.info.render.calls;
    glow.visible = false; layer.render(); const drawsWithoutGlow = layer.renderer.info.render.calls; glow.visible = true;
    for (const [id, label] of [['room-3-entry-platform', 'entry-underside-after'], ['room-3-platform-a-bounce', 'neighbour-after']]) {
      const p = r.testScene.collisionMeshes.find((mesh: any) => mesh.name === id).position;
      boosters.reset(); for (let i = 0; i < 120; i++) boosters.update(1 / 60, p);
      camera.position.set(p.x - 5, p.y - 1.8, p.z + 6);
      camera.lookAt(p.x, p.y - .8, p.z); camera.updateMatrixWorld(true);
      layer.render(); captures.push({ name: label, png: layer.canvas.toDataURL('image/png') });
    }
    return { captures, candidates, comparisons, excluded, glowCount: glow.count, additionalGlowDraws: drawsWithGlow - drawsWithoutGlow,
      observer: r.body.position.toArray(), exposure: layer.renderer.toneMappingExposure,
      glError: layer.renderer.getContext().getError() };
  });
  for (const { name, png } of proof.captures) await writeFile(info.outputPath(`${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  const { captures, ...measurements } = proof;
  await writeFile(info.outputPath('source-isolation.json'), JSON.stringify({ ...measurements, errors }, null, 2));
  expect(proof.excluded).toBe(true); expect(proof.glowCount).toBe(1);
  expect(proof.additionalGlowDraws).toBe(1);
  for (const comparison of proof.comparisons) {
    expect(comparison.finalWallSpill.wallPixels).toBeGreaterThan(10_000);
    expect(comparison.finalWallSpill.changed).toBe(0);
  }
  const screenshotSide = proof.comparisons.find(item => item.view === 'room2-doorway');
  expect(screenshotSide.offenderContribution.changed).toBeGreaterThan(100);
  expect(screenshotSide.otherOldSource.changed).toBe(0);
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
