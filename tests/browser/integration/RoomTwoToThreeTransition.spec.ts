import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';

test('Bob walks from the Room 2 balcony into Room 3 without a step, fall or jump', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors = watchBrowserErrors(page);


  await exposeGame(page, { runtime: '__transitionRuntime' });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ timeout: 120_000 });
  await finishOpening(page);
  await page.evaluate(() => {
    const rt = (window as any).__transitionRuntime, r = rt.resources;
    // Stage at the end of Room 2. The crossing itself uses normal keyboard
    // input, the live animation loop, and the unmodified fixed-step simulation.
    r.containmentLevel.teleportToRoomForDebug(2);
    r.body.teleport({ x: 0, y: 11.36, z: 46.5 });
    rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(r);
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
    const samples: { y: number; grounded: boolean; support: string }[] = [];
    const update = rt.fixedUpdate.bind(rt);
    (window as any).__crossingSamples = samples;
    rt.fixedUpdate = (dt: number) => {
      update(dt);
      if (r.body.position.z >= 47 && r.body.position.z <= 52 && samples.length < 1000) {
        samples.push({ y: r.body.position.y, grounded: r.body.grounded, support: r.body.supportColliderName });
      }
      if (r.body.position.z >= 51.5) {
        (window as any).__crossingDone = true;
        rt.stop();
      }
    };
  });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => (window as any).__crossingDone, null, { timeout: 60_000 });
  await page.keyboard.up('KeyW');
  const result = await page.evaluate(() => {
    const rt = (window as any).__transitionRuntime, r = rt.resources;
    return { samples: (window as any).__crossingSamples as { y: number; grounded: boolean; support: string }[],
      room: r.containmentLevel.activeRoomId, checkpoint: r.containmentLevel.activeCheckpointId,
      support: r.body.supportColliderName, glError: rt.renderLayer.renderer.getContext().getError() };
  });
  expect(result.samples.length).toBeGreaterThan(5);
  expect(result.samples.every(sample => sample.grounded && Math.abs(sample.y - 11.36) < 0.001)).toBe(true);
  expect(new Set(result.samples.map(sample => sample.support))).toEqual(new Set(['room-2-exit-balcony', 'room-3-entry-platform']));
  expect(result.room).toBe(3);
  expect(result.checkpoint).toBe('containment-room-3-entry');
  expect(result.support).toBe('room-3-entry-platform');
  expect(result.glError).toBe(0);
  const screenshot = await page.evaluate(() => {
    const layer = (window as any).__transitionRuntime.renderLayer;
    layer.setAnimationLoop(null);
    const camera = layer.cameraRig.camera;
    camera.position.set(2, 13, 45); camera.lookAt(0, 10.9, 49);
    camera.updateMatrixWorld(true);
    layer.renderer.render(layer.scene, camera);
    // Read in the same task as the draw: WebGL does not preserve the buffer
    // after presentation, and the test has stopped continuous rendering.
    return layer.canvas.toDataURL('image/png') as string;
  });
  await writeFile(info.outputPath('aligned-room-2-to-3-seam.png'), Buffer.from(screenshot.split(',')[1], 'base64'));
  expect(errors).toEqual([]);
});
