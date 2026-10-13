import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './fixtures.ts';

test.use({ viewport: { width: 960, height: 600 } });

test('Goop elastically leans, reverses, jumps and lands through production controls', async ({ page }) => {
  test.setTimeout(600_000);
  const directory = resolve('artifacts/evidence/goop/motion');
  await mkdir(directory, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  page.on('requestfailed', request => failedRequests.push(request.url()));
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern,
      '(globalThis.__goopMotionRuntime=$1,$1.prepareLightingPrograms()).then(') });
  });
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => (window as any).__goopMotionRuntime?.state === 'running');
  await page.addStyleTag({ content: '.game-hud, .performance-recorder { visibility: hidden !important; }' });
  await page.evaluate(() => {
    const rt = (window as any).__goopMotionRuntime, r = rt.resources;
    // Advance the real controller in deterministic fixed steps so software
    // rendering cannot skip over a short landing or reversal pose.
    rt.renderLayer.setAnimationLoop(null);
    rt.switchActiveSlime(r);
    r.goopBody.teleport({ x: 3, y: 0.46, z: 0 });
    r.testScene.goop.reset();
    rt.renderLayer.cameraRig.reset(); rt.retargetCameraToActiveSlime(r);
  });
  const observations: Record<string, any> = {};
  const step = async (count: number, stopOnLanding = false) => page.evaluate(({ count, stopOnLanding }) => {
    const rt = (window as any).__goopMotionRuntime, r = rt.resources;
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(0);
    for (let frame = 0; frame < count; frame++) {
      rt.fixedUpdate(1 / 60);
      if (stopOnLanding && r.goopBody.landedThisStep) break;
    }
    const stats = { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 60,
      frameDeltaSeconds: 1 / 60, stepsThisFrame: count, interpolationAlpha: 1,
      droppedSimulationTimeSeconds: 0, renderFps: 60 };
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI / 2);
    rt.render(1, stats);
    const goop = r.testScene.goop, body = goop.root.getObjectByName('Goop-Body');
    const neutralSole = r.goopBody.position.clone().set(0, -0.45, 0);
    const sole = body.localToWorld(neutralSole);
    return { ...goop.diagnostics, soleY: sole.y, bodyY: r.goopBody.position.y,
      velocityY: r.goopBody.velocity.y, landed: r.goopBody.landedThisStep,
      programs: rt.renderLayer.renderer.info.programs.length,
      bodyPosition: r.goopBody.position.toArray() };
  }, { count, stopOnLanding });
  const capture = async (name: string, count: number, stopOnLanding = false) => {
    const state = await step(count, stopOnLanding);
    observations[name] = state;
    await page.screenshot({ path: resolve(directory, `${name}.png`), timeout: 120_000 });
    return state;
  };
  const neutral = await capture('neutral', 30);
  expect(neutral.locomotionStrength).toBe(0);
  await page.keyboard.down('w');
  const forward = await capture('forward', 40);
  expect(forward.signedLean).toBeGreaterThan(0.9);
  expect(forward.soleY).toBeCloseTo(forward.bodyY - 0.45, 8);
  await page.keyboard.up('w'); await page.keyboard.down('s');
  // Braking precedes reverse travel. Find the counterlean during the hold.
  const reverse = await page.evaluate(() => {
    const rt = (window as any).__goopMotionRuntime, r = rt.resources;
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(0);
    for (let frame = 0; frame < 40; frame++) {
      rt.fixedUpdate(1 / 60);
      if (r.testScene.goop.diagnostics.reversing && r.testScene.goop.diagnostics.signedLean < 0) return true;
    }
    return false;
  });
  expect(reverse).toBe(true);
  const counterlean = await capture('counterlean', 0);
  expect(counterlean.reversing).toBe(true); expect(counterlean.signedLean).toBeLessThan(0);
  const reversed = await capture('reversed', 40);
  expect(reversed.reversing).toBe(false); expect(reversed.signedLean).toBeGreaterThan(0.9);
  await page.keyboard.up('s');
  const settled = await capture('stopped', 120);
  expect(settled.locomotionStrength).toBe(0);
  await page.keyboard.down('Space');
  const takeoff = await capture('takeoff', 5);
  await page.keyboard.up('Space');
  expect(takeoff.grounded).toBe(false); expect(takeoff.stretch).toBeGreaterThan(0.15);
  const falling = await capture('falling', 20);
  expect(falling.grounded).toBe(false); expect(falling.velocityY).toBeLessThan(0);
  expect(falling.stretch).toBeGreaterThan(0.07);
  const landing = await capture('landing', 60, true);
  expect(landing.landed).toBe(true); expect(landing.squash).toBeGreaterThan(0.15);
  expect(landing.soleY).toBeCloseTo(landing.bodyY - 0.45, 8);
  const recovery = await capture('recovery', 17);
  expect(recovery.stretch).toBeGreaterThan(0);
  const landed = await capture('settled', 15);
  expect(landed.squash).toBe(0); expect(landed.stretch).toBe(0);
  expect(landed.programs).toBe(neutral.programs);
  await page.evaluate(() => {
    const rt = (window as any).__goopMotionRuntime, r = rt.resources;
    r.goopBody.teleport({ x: 3, y: 0.46, z: 0 }); r.testScene.goop.reset();
    rt.renderLayer.cameraRig.setGroundOrbitYawRadians(0);
  });
  await page.keyboard.down('w');
  observations.steering = await page.evaluate(() => {
    const rt = (window as any).__goopMotionRuntime, r = rt.resources, goop = r.testScene.goop;
    for (let frame = 0; frame < 24; frame++) rt.fixedUpdate(1 / 60);
    const character = goop.root.getObjectByName('player-slime-goop-character');
    goop.present(); let previousYaw = character.rotation.y;
    const samples = [], steps = [];
    const stats = { fixedDeltaSeconds: 1 / 60, rawFrameDeltaSeconds: 1 / 180,
      frameDeltaSeconds: 1 / 180, stepsThisFrame: 0, interpolationAlpha: 1,
      droppedSimulationTimeSeconds: 0, renderFps: 180 };
    for (let frame = 1; frame <= 30; frame++) {
      rt.renderLayer.cameraRig.setGroundOrbitYawRadians(frame * Math.PI / 180);
      const before = goop.diagnostics.facingYawRadians;
      rt.fixedUpdate(1 / 60);
      steps.push(goop.diagnostics.facingYawRadians - before);
      // Exercise real runtime rendering between 60 Hz controller updates.
      for (const alpha of [1 / 3, 2 / 3, 1]) {
        rt.render(alpha, stats);
        const yaw = character.rotation.y;
        samples.push(yaw - previousYaw); previousYaw = yaw;
      }
    }
    return { steps, samples, programs: rt.renderLayer.renderer.info.programs.length };
  });
  await page.keyboard.up('w');
  for (const step of observations.steering.steps) {
    expect(step).toBeGreaterThan(0); expect(step).toBeLessThan(1.1 * Math.PI / 180);
  }
  for (const sample of observations.steering.samples) {
    expect(sample).toBeGreaterThan(0); expect(sample).toBeLessThan(0.4 * Math.PI / 180);
  }
  expect(observations.steering.programs).toBe(neutral.programs);
  await page.screenshot({ path: resolve(directory, 'steering.png'), timeout: 120_000 });
  await writeFile(resolve(directory, 'observations.json'), JSON.stringify({ observations, errors, failedRequests }, null, 2));
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
});
