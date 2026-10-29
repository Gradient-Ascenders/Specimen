import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { ENDING_TIMING as T, endingGoopHitTime } from '../../src/cinematics/BossDefeatTimeline.ts';

const endingMusic = (page: Page) => page.evaluate(() => ((window as any).__endingMusicPlayers as HTMLAudioElement[])
  .filter(p => p.src.includes('blackout-first-sunlight-ending.ogg'))
  .map(p => ({ time: p.currentTime, paused: p.paused, loop: p.loop, rate: p.playbackRate, volume: p.volume, error: p.error?.message })));

const endingEffects = (page: Page) => page.evaluate(() => {
  const audio = (window as any).__endingSession.runtime.audio;
  return { ...audio.diagnostics, keys: [...audio.loops.keys()] as string[],
    sounds: [...audio.voices].map((voice: any) => voice.sound) as string[] };
});

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
  await page.addInitScript(() => {
    const Original = window.Audio;
    (window as any).__endingMusicPlayers = []; (window as any).__endingMusicLoads = []; (window as any).__endingMusicRequests = []; (window as any).__endingNativePlayed = [];
    window.Audio = new Proxy(Original, { construct(target, args) {
      const player = Reflect.construct(target, args) as HTMLAudioElement;
      (window as any).__endingMusicPlayers.push(player);
      player.addEventListener('loadstart', () => (window as any).__endingMusicLoads.push(player.src));
      player.addEventListener('playing', () => (window as any).__endingNativePlayed.push(player.src));
      const play = player.play.bind(player);
      player.play = () => {
        (window as any).__endingMusicRequests.push({ src: player.src, time: player.currentTime,
          overlap: (window as any).__endingMusicPlayers.filter((p: HTMLAudioElement) => p !== player && !p.paused).map((p: HTMLAudioElement) => p.src) });
        return play();
      };
      return player;
    } });
  });
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
  expect(await endingMusic(page), 'GPU rehearsal must not acquire the ending recording').toHaveLength(0);
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
  // Keep the live clock moving while native metadata/decoding settles;
  // deliberately freezing it would correctly invoke the 250ms stall pause.
  await expect.poll(async () => {
    await page.evaluate(() => (window as any).__endingSession.runtime.fixedUpdate(1 / 60));
    return page.evaluate(() => (window as any).__endingNativePlayed.some((src: string) => src.includes('10-blackout')));
  }, { intervals: [50], timeout: 20_000 }).toBe(true);
  const request = await page.evaluate(() => (window as any).__endingMusicRequests.find((p: any) => p.src.includes('10-blackout')));
  expect(request.time).toBe(0); expect(request.overlap).toEqual([]);
  expect((await endingMusic(page))[0]).toMatchObject({ loop: false, rate: 1, error: undefined });
  const unfocused = await page.context().newPage(); await unfocused.goto('about:blank'); await unfocused.bringToFront();
  await expect.poll(async () => (await endingMusic(page))[0]?.paused).toBe(true);
  await page.bringToFront(); await unfocused.close();
  await expect.poll(async () => {
    await page.evaluate(() => (window as any).__endingSession.runtime.fixedUpdate(1 / 60));
    return (await endingMusic(page))[0]?.paused;
  }, { intervals: [50] }).toBe(false);
  const skipToCredits = process.env.SPECIMEN_ENDING_SKIP_TO_CREDITS === '1';
  if (skipToCredits) {
    await advance(page, 16);
    expect((await endingEffects(page)).keys).toContain('ending:specimen-beam');
    await page.getByRole('button', { name: 'Skip cutscene · Enter', exact: true }).click();
    const skipped = await page.evaluate(() => {
      const r = (window as any).__endingSession.runtime;
      r.fixedUpdate(1 / 60); r.render(1, { frameDeltaSeconds: 1 / 60 });
      const movie = r.resources.defeatFinale;
      return { seconds: movie.seconds, active: movie.active, complete: movie.complete,
        skippedCredits: movie.skippedCredits, phase: r.phase };
    });
    expect(skipped).toEqual({ seconds: T.credits, active: true, complete: false, skippedCredits: false, phase: 'boss-defeated' });
    await expect(page.locator('.ending-credits')).toBeVisible();
    await expect(page.locator('[data-flow-panel="credits"]')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Return to title · Enter', exact: true })).toBeVisible();
    expect((await endingEffects(page)).keys).toEqual([]);
    expect((await endingEffects(page)).sounds).toEqual([]);
  }
  const samples = [[2, '01-broken-boss'], [6, '02-specimen-charge'], [10, '03-boss-charge'],
    [12.5, '03b-boss-beam-launch'], [T.specimenFire - .05, '03c-specimen-before-launch'], [T.specimenFire + .08, '03d-specimen-beam-launch'], [16, '04-balanced-beams'],
    [18, '05-specimen-strain'], [20, '06-boss-strain'], [23, '07-wide-deadlock'], [29, '08-collision-orbit'],
    [31.15, '09-explosion'], [31.95, '10-smoke-and-unmerge'], [32.8, '11-separation'], [35, '11b-broken-boss-falls'], [37, '11c-wreck-in-the-shaft'],
    [41.5, '12-regroup'], [48, '13-urgent-warning'], [T.drones + .6, '14a-first-bay-launch'],
    [T.drones + 2.6, '14b-clear-of-bay'], [T.drones + 4, '14-drones-emerging'], [T.drones + 6.8, '14c-last-bay-launch'],
    [T.sacrifice + .8, '15-goop-decides'], [T.insist + .8, '16-go-now'], [T.leave + 2, '17-escape'],
    [T.lookBack + .3, '18a-bob-brakes'], [T.lookBack + 1.2, '18b-bob-turns'], [T.lookBack + 2.3, '18c-bob-looks-back'],
    [T.goodbye + .7, '19-goodbye'], [endingGoopHitTime(2) + .08, '19b-goop-takes-a-hit'], [T.runAgain + 4, '20-catching-up'],
    [T.destruction + .65, '21a-collapse-explosions'], [T.destruction + 3, '21b-heavy-collapse'], [T.destruction + 7, '21c-smoke-and-girders'], [T.black + 2, '22-silence'],
    [T.daylight + 5, '23-first-sunlight'], [T.sky - 3, '24-the-outside-world'], [T.sky + 5, '25-open-sky'], [T.credits + 5, '26-credits']] as const;
  const metrics: unknown[] = [];
  for (const [t, name] of samples.filter(([t]) => (!skipToCredits || t >= T.credits + 5)
    && (process.env.SPECIMEN_ENDING_REFRAME !== '1' || t >= T.destruction))) {
    await advance(page, t);
    if (t === 16) {
      const effects = await endingEffects(page);
      expect(effects.failed).toEqual([]);
      expect(effects.keys).toEqual(expect.arrayContaining(['ending:boss-beam', 'ending:specimen-beam', 'ending:collision']));
      expect(effects.sounds).toContain('ending-specimen-beam-loop-01');
    }
    if (t === 31.15) {
      const effects = await endingEffects(page);
      expect(effects.keys).toContain('ending:collapse');
      expect(effects.keys).not.toContain('ending:boss-beam'); expect(effects.keys).not.toContain('ending:specimen-beam');
    }
    if (t === T.black + 2) {
      const effects = await endingEffects(page);
      expect(effects.keys).toEqual([]); expect(effects.sounds).toEqual([]);
    }
    if (t === T.daylight + 5) expect((await endingEffects(page)).keys).toEqual(['ending:outside']);
    if (t === T.credits + 5) expect((await endingEffects(page)).keys).toEqual([]);
    if ([2, T.black + 2, T.daylight + 5, T.credits + 5].includes(t)) {
      await expect.poll(async () => (await endingMusic(page))[0]?.time).toBeGreaterThan(t - .4);
      expect(await page.evaluate(() => (window as any).__endingMusicLoads.filter((src: string) => src.includes('10-blackout')).length)).toBe(1);
    }
    const frame = await page.evaluate(() => {
      const r = (window as any).__endingSession.runtime, l = r.renderLayer;
      r.render(1, { frameDeltaSeconds: 1 / 60 });
      const ray = new (l.cameraRig.camera.position.constructor)(); l.cameraRig.camera.getWorldDirection(ray);
      return { png: l.canvas.toDataURL('image/png'), metrics: { ...r.resources.defeatFinale.diagnostics,
        effectsDensity: l.graphicsConfiguration.effectsDensity,
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
      expect(frame.metrics.effects.smoke).toBeGreaterThan(120 * frame.metrics.effectsDensity); expect(frame.metrics.effects.explosions).toBeGreaterThan(0);
    }
    metrics.push(frame.metrics); await writeFile(info.outputPath(`${name}.png`), Buffer.from(frame.png.split(',')[1]!, 'base64'));
    if (t === T.black + 2) expect(await page.locator('.ending-flash').evaluate(e => getComputedStyle(e).opacity)).toBe('1');
    if (t === T.credits + 5) {
      await expect(page.locator('.ending-credits')).toBeVisible();
      await expect(page.locator('.ending-credits')).toContainText('Kevin Ebrahim');
      await expect(page.locator('.ending-credits')).toContainText('Uzair Mahomed');
      await expect(page.locator('.ending-credits')).toContainText('Thank you for playing');
      await expect(page.locator('.ending-credits p').filter({ hasText: /^Claimed by the Void — vitalezzz$/ })).toHaveCount(1);
      await expect(page.locator('.ending-credits p').filter({ hasText: /^Exploration Theme — Cleyton Kauffman$/ })).toHaveCount(1);
    }
    if (t === T.sacrifice + .8) {
      await page.keyboard.press('p'); await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'paused');
      await expect.poll(async () => (await endingMusic(page))[0]?.paused).toBe(true);
      await expect.poll(async () => (await endingEffects(page)).contextState).toBe('suspended');
      const frozen = await page.evaluate(() => (window as any).__endingSession.runtime.resources.defeatFinale.seconds);
      await advance(page, T.sacrifice + 1.8); expect(await page.evaluate(() => (window as any).__endingSession.runtime.resources.defeatFinale.seconds)).toBe(frozen);
      await page.locator('[data-action="resume"]').click();
      await page.evaluate(() => (window as any).__endingSession.runtime.renderLayer.setAnimationLoop(null));
    }
  }
  if (process.env.SPECIMEN_ENDING_SKIP_CREDITS === '1') {
    const origin = await page.evaluate(() => performance.timeOrigin);
    await page.evaluate(() => {
      const flow = document.querySelector('.game-flow')!, credits = document.querySelector<HTMLElement>('[data-flow-panel="credits"]')!;
      (window as any).__endingReturnStates = [];
      (window as any).__endingReturnCreditsShown = false;
      new MutationObserver(records => {
        for (const record of records) {
          if (record.target === flow && record.attributeName === 'data-state')
            (window as any).__endingReturnStates.push(record.oldValue, flow.getAttribute('data-state'));
          if (record.target === credits && record.attributeName === 'hidden' && (record.oldValue === null || !credits.hidden))
            (window as any).__endingReturnCreditsShown = true;
        }
      }).observe(flow, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ['data-state', 'hidden'] });
    });
    expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);
    const button = page.getByRole('button', { name: 'Return to title · Enter', exact: true }); await expect(button).toBeVisible();
    const bounds = await button.boundingBox(); expect(bounds).not.toBeNull();
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    const fading = await page.evaluate(() => {
      const r = (window as any).__endingSession.runtime;
      r.fixedUpdate(1 / 60);
      return { active: r.resources.defeatFinale.active,
        opacity: Number(document.querySelector<HTMLElement>('#app')!.style.getPropertyValue('--ending-menu-opacity')) };
    });
    expect(fading.active).toBe(true); expect(fading.opacity).toBeGreaterThan(0); expect(fading.opacity).toBeLessThan(1);
    const covered = await page.evaluate(() => {
      const r = (window as any).__endingSession.runtime;
      for (let i = 0; i < 30 && r.resources.defeatFinale.active; i++) r.fixedUpdate(1 / 60);
      return getComputedStyle(document.querySelector('#app')!, '::after').opacity;
    });
    expect(covered).toBe('1');
    await expect(page.locator('[data-flow-panel="title"]')).toBeVisible({ timeout: 180_000 });
    await expect(page.locator('#app')).not.toHaveAttribute('data-ending-menu-fade', 'true');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    await expect(page.locator('#app')).not.toHaveAttribute('data-cinematic', 'boss-defeat');
    const returnFlow = await page.evaluate(() => ({ states: (window as any).__endingReturnStates as string[],
      creditsShown: (window as any).__endingReturnCreditsShown as boolean }));
    expect(returnFlow.states).not.toContain('credits');
    expect(returnFlow.creditsShown).toBe(false);
    await page.screenshot({ path: info.outputPath('return-to-menu.png') });
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
  expect((await endingMusic(page)).every(p => p.paused)).toBe(true);
  expect(failures).toEqual([]);
  await writeFile(info.outputPath('ending-evidence.json'), JSON.stringify({ trigger, metrics, ending, failures }, null, 2));
});
