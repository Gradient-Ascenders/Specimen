import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';

test('Room 5 decks, shadows and riders share smooth poses on 30/60/144 FPS schedules, through pause, recovery and reload', async ({ page }, info) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors = watchBrowserErrors(page);


  await exposeGame(page, { session: '__movingSession', runtime: '__movingRuntime' });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  await page.evaluate(() => {
    const layer = (window as any).__movingRuntime.renderLayer;
    layer.setAnimationLoop(null);
    // Bound software-rasterizer cost while exercising every real render pose.
    // Captures below still use the normal gameplay resolution.
    layer.setPresentationResolution(320 * 180);
  });
  const evidence: unknown[] = [];
  // Measure both decks at each cadence; ride one per case. The fast Node
  // regression exhaustively rides each deck at 30, 60 and 90 FPS schedules.
  for (const { fps, rider } of [{ fps: 30, rider: 0 }, { fps: 60, rider: 1 }, { fps: 144, rider: 0 }]) {
    const result = await page.evaluate(async ({ fps, rider }) => {
      const rt = (window as any).__movingRuntime, session = (window as any).__movingSession, r = rt.resources;
      r.containmentLevel.teleportToRoomForDebug(5);
      const room = r.testScene.roomFive;
      // Isolate carrying from intended laser damage. No production hazard or
      // motion code is replaced. Each case resets through the real checkpoint.
      room.lasers.hazards.forEach((hazard: any) => hazard.setCircuitGateEnabled(false));
      const platforms = [room.movingPlatformOne, room.movingPlatformTwo];
      const carrier = platforms[rider];
      r.body.teleport({ x: carrier.position.x, y: carrier.position.y + carrier.size.y / 2 + .46, z: carrier.position.z });
      rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(r);
      rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
      const dressings = platforms.map((platform: any, index: number) =>
        platform.root.getObjectByName(`room-5-moving-platform-${index + 1}-production-dressing`));
      const rig = r.testScene.lighting, sources = rig.shadowLights;
      const sphere = rig.shadowSphere.clone(); sphere.radius = 4;
      const prepare = rig.prepareShadowFrame;
      let lastPresented = dressings.map((group: any) => group.getWorldPosition(group.position.clone()));
      let shadowUpdatePasses = 0, maxShadowUpdatePasses = 0, maxBoosterError = 0, noPhysicsFrames = 0;
      rig.prepareShadowFrame = function (participants: any) {
        prepare.call(this, participants);
        const presented = dressings.map((group: any) => group.getWorldPosition(group.position.clone()));
        sources.forEach((light: any) => {
          const origin = light.getWorldPosition(platforms[0].root.position.clone());
          const intersects = (point: any) => {
            sphere.center.copy(point);
            return origin.distanceTo(point) <= light.distance + 4 &&
              (!light.isSpotLight || light.shadow.getFrustum().intersectsSphere(sphere));
          };
          if (presented.some((point: any, index: number) => point.distanceTo(lastPresented[index]) > 1e-9 &&
            (intersects(point) || intersects(lastPresented[index])))) {
            if (!light.shadow.autoUpdate && !light.shadow.needsUpdate && light.shadow.map) throw new Error(`Stale moving shadow: ${light.name}`);
          }
        });
        lastPresented = presented;
        const passes = rig.diagnostics.shadowUpdatePassCount;
        shadowUpdatePasses += passes; maxShadowUpdatePasses = Math.max(maxShadowUpdatePasses, passes);
      };
      let accumulator = .003, maxVisualError = 0, maxRiderSlip = 0, maxAuthorityChange = 0;
      let maxCameraStep = 0, maxMotionExcess = 0;
      let previousCamera: any, previousDecks: any;
      const positions = [], turns = [0, 0];
      const targets = platforms.map((platform: any) => platform.target);
      const stats = { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 0, frameDeltaSeconds: 0,
        stepsThisFrame: 0, interpolationAlpha: 0, droppedSimulationTimeSeconds: 0, renderFps: fps };
      let png = '';
      for (let frame = 0; frame < fps * 7.2; frame++) {
        // Controlled browser render cadence with modest frame-time variation.
        // Keep real fixed updates, rendering, collision queries and camera code.
        const frameDt = [.8, 1.12, .96, 1.12][frame % 4] / fps;
        accumulator += frameDt;
        let steps = 0;
        while (accumulator + 1e-10 >= 1 / 60) {
          session.fixedUpdate(1 / 60); accumulator -= 1 / 60;
          steps++;
          platforms.forEach((platform: any, index: number) => {
            if (targets[index] !== platform.target) { targets[index] = platform.target; turns[index]++; }
          });
        }
        if (steps === 0) noPhysicsFrames++;
        const alpha = accumulator * 60;
        stats.frameDeltaSeconds = stats.rawFrameDeltaSeconds = frameDt;
        stats.interpolationAlpha = alpha;
        const authority = platforms.map((platform: any) => platform.root.position.clone());
        const capture = frame === fps * 2;
        if (capture) rt.renderLayer.setPresentationResolution(undefined);
        session.render(alpha, stats);
        const decks = dressings.map((group: any) => group.getWorldPosition(r.body.position.clone()));
        platforms.forEach((platform: any, index: number) => {
          const expected = authority[index].clone().copy(platform.previousPosition).lerp(platform.position, alpha);
          maxVisualError = Math.max(maxVisualError, decks[index].distanceTo(expected));
          maxAuthorityChange = Math.max(maxAuthorityChange, platform.root.position.distanceTo(authority[index]));
          const booster = dressings[index].getObjectByName(`containment-moving-${index + 1}-booster-batch`);
          maxBoosterError = Math.max(maxBoosterError, booster.getWorldPosition(r.body.position.clone()).distanceTo(decks[index]));
          if (previousDecks) maxMotionExcess = Math.max(maxMotionExcess,
            decks[index].distanceTo(previousDecks[index]) - platform.startPosition.distanceTo(platform.endPosition) / 3.2 * frameDt);
        });
        const relative = r.testScene.bob.mesh.getWorldPosition(r.body.position.clone()).sub(decks[rider]);
        maxRiderSlip = Math.max(maxRiderSlip, Math.hypot(relative.x, relative.z));
        if (!r.body.grounded || r.body.supportCollider !== carrier.collisionMesh) throw new Error(`Rider lost support at ${fps} FPS, frame ${frame}`);
        const camera = rt.renderLayer.cameraRig.camera.position.clone();
        if (frame > 10) maxCameraStep = Math.max(maxCameraStep, camera.distanceTo(previousCamera));
        previousCamera = camera; previousDecks = decks;
        if (frame % 6 === 0) positions.push(decks.map((deck: any) => deck.toArray()));
        if (capture) {
          png = rt.renderLayer.canvas.toDataURL('image/png');
          rt.renderLayer.setPresentationResolution(320 * 180);
        }
        // Yield actual rendered frames to the browser/compositor for inspection.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (fps === 30) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      rig.prepareShadowFrame = prepare;
      (window as any).__movingStats = stats;
      return { png, fps, rider, maxVisualError, maxRiderSlip, maxAuthorityChange, maxCameraStep, maxMotionExcess,
        turns, positions, shadowUpdatePasses, maxShadowUpdatePasses, noPhysicsFrames, maxBoosterError,
        glError: rt.renderLayer.renderer.getContext().getError() };
    }, { fps, rider });
    const { png, ...measurements } = result;
    await writeFile(info.outputPath(`riding-${rider + 1}-${fps}fps.png`), Buffer.from(png.split(',')[1], 'base64'));
    await writeFile(info.outputPath(`riding-${rider + 1}-${fps}fps.json`), JSON.stringify(measurements, null, 2));
    expect(result.maxVisualError).toBeLessThan(1e-8);
    expect(result.maxRiderSlip).toBeLessThan(.0001);
    expect(result.maxAuthorityChange).toBe(0);
    expect(result.maxBoosterError).toBe(0);
    expect(result.maxShadowUpdatePasses).toBeLessThanOrEqual(5);
    if (fps === 144) expect(result.noPhysicsFrames).toBeGreaterThan(0);
    expect(result.maxMotionExcess).toBeLessThan(1e-8);
    expect(result.maxCameraStep).toBeLessThan(.3);
    expect(result.turns.every(count => count >= 2)).toBe(true);
    expect(result.glError).toBe(0);
    evidence.push(measurements);

    if (fps === 30 && rider === 0) {
      await page.keyboard.press('KeyP');
      await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
      const pauseError = await page.evaluate(() => {
        const rt = (window as any).__movingRuntime, session = (window as any).__movingSession;
        const room = rt.resources.testScene.roomFive;
        const group = room.movingPlatformOne.root.getObjectByName('room-5-moving-platform-1-production-dressing');
        const before = group.getWorldPosition(group.position.clone());
        for (const alpha of [.1, .8, .25]) session.render(alpha, (window as any).__movingStats);
        return group.getWorldPosition(group.position.clone()).distanceTo(before);
      });
      expect(pauseError).toBe(0);
      await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
      await page.locator('canvas[data-gameplay-canvas]').click();
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
    }
    {
      await page.keyboard.down('KeyD');
      const left = await page.evaluate(rider => {
        const rt = (window as any).__movingRuntime, r = rt.resources;
        const platform = [r.testScene.roomFive.movingPlatformOne, r.testScene.roomFive.movingPlatformTwo][rider];
        for (let step = 0; step < 40; step++) rt.fixedUpdate(1 / 60);
        return !r.body.isSupportedBy(platform.collisionMesh);
      }, rider);
      await page.keyboard.up('KeyD');
      expect(left).toBe(true);
      const landed = await page.evaluate(rider => {
        const rt = (window as any).__movingRuntime, r = rt.resources;
        const platform = [r.testScene.roomFive.movingPlatformOne, r.testScene.roomFive.movingPlatformTwo][rider];
        r.body.teleport({ x: platform.position.x, y: platform.position.y + platform.size.y / 2 + .61, z: platform.position.z });
        for (let step = 0; step < 20; step++) rt.fixedUpdate(1 / 60);
        return r.body.grounded && r.body.supportCollider === platform.collisionMesh;
      }, rider);
      expect(landed).toBe(true);
    }
  }
  const resets = await page.evaluate(async () => {
    const rt = (window as any).__movingRuntime;
    const check = () => {
      const room = rt.resources.testScene.roomFive;
      return [room.movingPlatformOne, room.movingPlatformTwo].every((platform: any, index: number) =>
        platform.root.position.distanceTo(platform.previousPosition) === 0 &&
        platform.root.getObjectByName(`room-5-moving-platform-${index + 1}-production-dressing`).position.lengthSq() === 0);
    };
    rt.resources.containmentLevel.recoverActiveCheckpoint();
    const recovery = check();
    rt.restartLevel();
    const restart = check();
    rt.unload(); rt.load(); await rt.prepareGraphics(); rt.start();
    const reload = check();
    return { recovery, restart, reload };
  });
  expect(resets).toEqual({ recovery: true, restart: true, reload: true });
  await writeFile(info.outputPath('motion-evidence.json'), JSON.stringify({ evidence, resets }, null, 2));
  expect(errors).toEqual([]);
});
