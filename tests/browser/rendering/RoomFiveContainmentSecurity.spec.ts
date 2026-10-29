import { exposeGame } from '../../helpers/GameRuntime.ts';
import { expect, test } from '@playwright/test';

test('Goop’s critical container is readable in-game and keeps its roof playable', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  // Expose only the served test copy of the runtime; no shipped debug API.

  await exposeGame(page, { runtime: '__goopSecurityRuntime' });

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="skip-opening"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  await page.keyboard.press('F1');
  await page.evaluate(() => {
    const rt = (window as any).__goopSecurityRuntime, r = rt.resources;
    r.containmentLevel.teleportToRoomForDebug(5);
    r.body.teleport({ x: .084, y: 77.397, z: 102.793 });
    const rig = rt.renderLayer.cameraRig;
    rig.reset(); rt.retargetCameraToActiveSlime(r);
    rig.setGroundOrbitYawRadians(Math.PI);
    rig.queueLookInput(0, (-.08 - Math.PI / 10) / .002);
  });
  await page.waitForFunction(() => (window as any).__goopSecurityRuntime.resources.body.grounded);
  await page.evaluate(async () => {
    const rt = (window as any).__goopSecurityRuntime;
    rt.stop();
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
  });
  const baseline = await page.evaluate(() => {
    const rt = (window as any).__goopSecurityRuntime, security = rt.resources.testScene.roomFive.art.security;
    const uv = security.signs.geometry.getAttribute('uv'), normals = security.signs.geometry.getAttribute('normal');
    let nonFrontLabelVertices = 0, redReleasePixels = 0;
    for (let i = 0; i < uv.count; i++) {
      if (uv.getY(i) < 448 / 512 && normals.getZ(i) > -.999) nonFrontLabelVertices++;
    }
    const pixels = security.texture.image.data;
    for (let y = 384; y < 448; y++) for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      if (pixels[i] > pixels[i + 1] + 60 && pixels[i] > pixels[i + 2] + 60) redReleasePixels++;
    }
    return { programs: rt.renderLayer.renderer.info.programs.length, texture: security.texture.uuid,
      geometry: security.signs.geometry.uuid, material: security.signs.material.uuid,
      label: security.texture.userData.labelLines, draws: security.root.children.length,
      nonFrontLabelVertices, redReleasePixels };
  });
  expect(baseline.label).toEqual(['SPECIMEN: GOOP', 'DANGER THREAT: CRITICAL']);
  expect(baseline.draws).toBe(3);
  expect(baseline.nonFrontLabelVertices).toBe(0); expect(baseline.redReleasePixels).toBe(0);
  await page.screenshot({ path: info.outputPath('goop-container-player-approach.png'), timeout: 60_000 });

  // Inspect the real running scene with a camera-only art target. Gameplay and
  // geometry are untouched; the first capture above uses the ordinary player rig.
  for (const [name, yaw] of [['front', Math.PI], ['three-quarter', Math.PI + .65], ['rear', 0]] as const) {
    await page.evaluate(yaw => {
      const rt = (window as any).__goopSecurityRuntime, rig = rt.renderLayer.cameraRig;
      const point = { x: 0, y: 76.4, z: 110 };
      rig.reset(); rig.setFollowTarget({ position: point, previousPosition: point,
        velocity: { x: 0, y: 0, z: 0 }, gameplayUp: { x: 0, y: 1, z: 0 }, grounded: true, attached: false }, undefined);
      rig.setFollowDistanceMetres(7); rig.setGroundOrbitYawRadians(yaw);
      rig.queueLookInput(0, (.08 - Math.PI / 10) / .002);
    }, yaw);
    await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame); });
    const rendered = await page.evaluate(() => {
      const rt = (window as any).__goopSecurityRuntime, security = rt.resources.testScene.roomFive.art.security;
      const clip = rt.resources.body.position.clone().set(0, 78.02, 110).project(rt.renderLayer.cameraRig.camera);
      return { programs: rt.renderLayer.renderer.info.programs.length, texture: security.texture.uuid,
        geometry: security.signs.geometry.uuid, material: security.signs.material.uuid,
        glError: rt.renderLayer.renderer.getContext().getError(), clip: clip.toArray() };
    });
    expect(rendered.texture).toBe(baseline.texture); expect(rendered.geometry).toBe(baseline.geometry);
    expect(rendered.material).toBe(baseline.material); expect(rendered.programs).toBe(baseline.programs);
    expect(rendered.glError).toBe(0);
    expect(Math.abs(rendered.clip[0])).toBeLessThan(.8); expect(Math.abs(rendered.clip[1])).toBeLessThan(.8);
    expect(rendered.clip[2]).toBeGreaterThan(-1); expect(rendered.clip[2]).toBeLessThan(1);
    await page.screenshot({ path: info.outputPath(`goop-container-${name}.png`), timeout: 60_000 });
  }

  await page.evaluate(() => {
    const rt = (window as any).__goopSecurityRuntime, r = rt.resources;
    rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(r);
    r.body.teleport({ x: 0, y: 79.4, z: 110 }); rt.start();
  });
  await page.waitForFunction(() => {
    const body = (window as any).__goopSecurityRuntime.resources.body;
    return body.grounded && body.supportColliderName === 'room-5-containment-glass';
  });
  const landed = await page.evaluate(() => {
    const rt = (window as any).__goopSecurityRuntime, body = rt.resources.body;
    return { clearance: body.position.y - body.radiusMetres - 78.675,
      allowedClearance: body.config.skinWidthMetres + body.config.groundProbeDistanceMetres,
      glError: rt.renderLayer.renderer.getContext().getError() };
  });
  // The ordinary ground probe may report support just before the skin settles.
  expect(landed.clearance).toBeGreaterThanOrEqual(0);
  expect(landed.clearance).toBeLessThanOrEqual(landed.allowedClearance + .005);
  expect(landed.glError).toBe(0);
  expect(errors).toEqual([]);
});
