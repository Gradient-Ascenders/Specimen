import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { ENDING_TIMING as T, endingGoopHitTime } from '../../src/cinematics/BossDefeatTimeline.ts';

async function advance(page: Page, seconds: number) {
  await page.evaluate(t => {
    const r = (window as any).__endingSession.runtime, movie = r.resources.defeatFinale;
    for (let i = 0; i < 15000 && movie.active && movie.seconds < t; i++) r.fixedUpdate(1 / 60);
    r.render(1, { frameDeltaSeconds: 1 / 60 });
  }, seconds);
}

test('boss defeat plays the balanced struggle, unmerge, last stand, daylight and credits exactly once', async ({ page }, info) => {
  test.setTimeout(900_000);
  const failures: string[] = [];
  page.on('pageerror', e => failures.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) failures.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()}: ${r.url()}`); });
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), body = await response.text(), pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(body).toMatch(pattern); await route.fulfill({ response, body: body.replace(pattern, '$1=globalThis.__endingSession=new $2({initialRuntime:') });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]'); await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Settings', exact: true }).click();
  if (process.env.SPECIMEN_ENDING_PRESET) await page.locator('[data-setting="graphics-profile"]').selectOption(process.env.SPECIMEN_ENDING_PRESET);
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"]').getByRole('button', { name: 'Back', exact: true }).click();
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
  await page.getByRole('button', { name: 'Enter Level 3', exact: true }).click({ timeout: 240_000 });
  await page.waitForFunction(() => document.querySelector('.game-flow')?.getAttribute('data-state') === 'playing', null, { timeout: 240_000 });
  const trigger = await page.evaluate(() => {
    const r = (window as any).__endingSession.runtime;
    r.renderLayer.setAnimationLoop(null); for (let i = 0; i < 600; i++) r.fixedUpdate(1 / 60);
    r.activateCheckpoint('cp8'); r.recoverActiveCheckpoint();
    r.resources.finalBoss.reset(); r.resources.finalBoss.startPhaseTwo();
    const boss = r.resources.finalBoss, m = boss.controller.readModel;
    const before = m.health;
    for (let i = 0; i < 4; i++) boss.controller.applyImpact({ projectileId: 90000 + i, targetId: 'extermination-core', kind: 'direct',
      fullyCharged: true, chargeAmount: 1, damageUnits: 10000, point: boss.presentation.coreWorld.clone(), direction: boss.presentation.coreWorld.clone().set(0, 0, 1) });
    r.fixedUpdate(1 / 60); r.renderLayer.renderer.setDrawingBufferSize(960, 540, 1); r.renderLayer.cameraRig.camera.aspect = 16 / 9;
    r.render(1, { frameDeltaSeconds: 1 / 60 });
    return { before, after: m.health, phase: r.phase, active: r.resources.defeatFinale.active, prepared: r.resources.defeatFinale.preparation };
  });
  expect(trigger.before).toBeGreaterThan(0); expect(trigger.after).toBe(0); expect(trigger.active).toBe(true);
  expect(trigger.prepared.complete).toBe(true); expect(trigger.prepared.frames).toBeGreaterThanOrEqual(20);
  await expect(page.locator('#app')).toHaveAttribute('data-cinematic', 'boss-defeat');
  const samples = [[2, '01-broken-boss'], [6, '02-specimen-charge'], [10, '03-boss-charge'],
    [12.5, '03b-boss-beam-launch'], [T.specimenFire - .05, '03c-specimen-before-launch'], [T.specimenFire + .08, '03d-specimen-beam-launch'], [16, '04-balanced-beams'],
    [18, '05-specimen-strain'], [20, '06-boss-strain'], [23, '07-wide-deadlock'], [29, '08-collision-orbit'],
    [31.15, '09-explosion'], [31.95, '10-smoke-and-unmerge'], [32.8, '11-separation'], [35, '11b-broken-boss-falls'], [37, '11c-wreck-in-the-shaft'],
    [41.5, '12-regroup'], [48, '13-urgent-warning'], [T.drones + 4, '14-drones-emerging'],
    [T.sacrifice + .8, '15-goop-decides'], [T.insist + .8, '16-go-now'], [T.leave + 2, '17-escape'],
    [T.lookBack + .3, '18a-bob-brakes'], [T.lookBack + 1.2, '18b-bob-turns'], [T.lookBack + 2.3, '18c-bob-looks-back'],
    [T.goodbye + .7, '19-goodbye'], [endingGoopHitTime(2) + .08, '19b-goop-takes-a-hit'], [T.runAgain + 4, '20-catching-up'],
    [T.destruction + .65, '21a-collapse-explosions'], [T.destruction + 3, '21b-heavy-collapse'], [T.destruction + 7, '21c-smoke-and-girders'], [T.black + 2, '22-silence'],
    [T.daylight + 5, '23-first-sunlight'], [T.sky - 3, '24-the-outside-world'], [T.sky + 5, '25-open-sky'], [T.credits + 5, '26-credits']] as const;
  const metrics: unknown[] = [];
  for (const [t, name] of samples.filter(([t]) => process.env.SPECIMEN_ENDING_REFRAME !== '1' || t >= T.destruction)) {
    await advance(page, t);
    const frame = await page.evaluate(() => {
      const r = (window as any).__endingSession.runtime, l = r.renderLayer;
      r.render(1, { frameDeltaSeconds: 1 / 60 });
      const ray = new (l.cameraRig.camera.position.constructor)(); l.cameraRig.camera.getWorldDirection(ray);
      return { png: l.canvas.toDataURL('image/png'), metrics: { ...r.resources.defeatFinale.diagnostics,
        camera: l.cameraRig.camera.position.toArray(), direction: ray.toArray(), glError: l.renderer.getContext().getError(),
        programs: l.renderer.info.programs.length, calls: l.renderer.info.render.calls, triangles: l.renderer.info.render.triangles } };
    });
    expect(frame.metrics.glError).toBe(0); expect(frame.metrics.bossFinalShotVisible).toBe(false);
    if (t === T.specimenFire - .05) expect(frame.metrics.effects.specimenBeamLaunched).toBe(false);
    if (t === T.specimenFire + .08) { expect(frame.metrics.effects.specimenBeamLaunched).toBe(true); expect(frame.metrics.effects.beamVisible).toBe(false); }
    if (t === 16) { expect(frame.metrics.effects.beamVisible).toBe(true); expect(frame.metrics.effects.equalBeamRadius).toBe(true); }
    if (t === endingGoopHitTime(2) + .08) { expect(frame.metrics.effects.directHits).toBeGreaterThan(0); expect(frame.metrics.effects.incoming).toBeGreaterThan(0); }
    if (t >= T.destruction && t < T.black) {
      expect(frame.metrics.visibleDrones).toBe(0); expect(frame.metrics.actors.find((a: any) => a.id === 'goop').visible).toBe(false);
      expect(frame.metrics.effects.smoke).toBeGreaterThan(120); expect(frame.metrics.effects.explosions).toBeGreaterThan(0);
    }
    metrics.push(frame.metrics); await writeFile(info.outputPath(`${name}.png`), Buffer.from(frame.png.split(',')[1]!, 'base64'));
    if (t === T.black + 2) expect(await page.locator('.ending-flash').evaluate(e => getComputedStyle(e).opacity)).toBe('1');
    if (t === T.credits + 5) {
      await expect(page.locator('.ending-credits')).toBeVisible();
      await expect(page.locator('.ending-credits')).toContainText('Kevin Ebrahim');
      await expect(page.locator('.ending-credits')).toContainText('Uzair Mahomed');
      await expect(page.locator('.ending-credits')).toContainText('Thank you for playing');
    }
    if (t === T.sacrifice + .8) {
      await page.keyboard.press('p'); await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'paused');
      const frozen = await page.evaluate(() => (window as any).__endingSession.runtime.resources.defeatFinale.seconds);
      await advance(page, T.sacrifice + 1.8); expect(await page.evaluate(() => (window as any).__endingSession.runtime.resources.defeatFinale.seconds)).toBe(frozen);
      await page.locator('[data-action="resume"]').click();
      await page.evaluate(() => (window as any).__endingSession.runtime.renderLayer.setAnimationLoop(null));
    }
  }
  if (process.env.SPECIMEN_ENDING_SKIP_CREDITS === '1') {
    const origin = await page.evaluate(() => performance.timeOrigin);
    expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);
    const button = page.getByRole('button', { name: 'Return to title · Enter', exact: true }); await expect(button).toBeVisible();
    const bounds = await button.boundingBox(); expect(bounds).not.toBeNull();
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.evaluate(() => (window as any).__endingSession.runtime.fixedUpdate(1 / 60));
    await page.waitForFunction(previous => performance.timeOrigin > previous, origin, { timeout: 180_000 });
    await expect(page.locator('[data-flow-panel="title"]')).toBeVisible({ timeout: 180_000 });
    await expect(page.locator('#app')).not.toHaveAttribute('data-cinematic', 'boss-defeat');
    expect(failures).toEqual([]);
    await writeFile(info.outputPath('ending-evidence.json'), JSON.stringify({ trigger, metrics, ending: { destination: 'title' }, failures }, null, 2));
    return;
  }
  await advance(page, T.duration + .1);
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'credits');
  const ending = await page.evaluate(() => {
    const r = (window as any).__endingSession.runtime;
    return { phase: r.phase, complete: r.resources.defeatFinale.complete, active: r.resources.defeatFinale.active,
      cinematic: r.host.dataset.cinematic, inputEnabled: r.input.enabled, goopParent: r.resources.goopPresentation.root.parent?.name };
  });
  expect(ending.phase).toBe('complete'); expect(ending.complete).toBe(true); expect(ending.active).toBe(false); expect(ending.inputEnabled).toBe(false);
  expect(ending.cinematic).toBeUndefined();
  expect(failures).toEqual([]);
  await writeFile(info.outputPath('ending-evidence.json'), JSON.stringify({ trigger, metrics, ending, failures }, null, 2));
});
