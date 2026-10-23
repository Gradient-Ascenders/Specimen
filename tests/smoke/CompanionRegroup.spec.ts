import { expect, test, type Page } from '@playwright/test';

async function openLevel(page: Page, level: number, name: string) {
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({response, body: source.replace(pattern, '$1=globalThis.__companionSession=new $2({initialRuntime:')});
  });
  await page.goto('./', {waitUntil: 'domcontentloaded'});
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({timeout: 180_000});
  await title.getByRole('button', {name: 'Select level'}).click();
  await page.getByRole('button', {name: `Level ${level} ${name}`, exact: true}).click();
  await page.getByRole('button', {name: `Enter Level ${level}`, exact: true}).click({timeout: 180_000});
  await page.waitForFunction(() => {
    const rt = (window as any).__companionSession.runtime;
    return rt.input.enabled && !rt.ventArrival?.active && !rt.resources.ventArrival?.active && !rt.preparationQueue?.diagnostics.pending;
  }, null, {timeout: 180_000});
  await page.locator('canvas[data-gameplay-canvas]').click();
  await page.evaluate(() => (window as any).__companionSession.runtime.renderLayer.setAnimationLoop(null));
}

test('Level 2 companion catches up through production physics, yields to Tab, pauses and resets on retry', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openLevel(page, 2, 'Cultivation');
  const staged = await page.evaluate(() => {
    const rt = (window as any).__companionSession.runtime;
    rt.teleportToAuthoredPreviewRoom(2);
    const r = rt.resources;
    r.manager.activate('bob');
    r.pair.bobBody.teleport(r.pair.bobBody.position.clone().set(64, .66, 82));
    r.pair.goopBody.teleport(r.pair.goopBody.position.clone().set(55, .66, 5.5));
    const bob = r.pair.bobBody.position.clone();
    const goop = r.pair.goopBody.position.clone();
    for (let i = 0; i < 240; i++) rt.fixedUpdate(1 / 60);
    return {goopMotion: r.pair.goopBody.position.distanceTo(goop),
      bobMotion: r.pair.bobBody.position.distanceTo(bob), status: rt.getSlimeHUDSnapshot().passiveInteractions};
  });
  expect(staged.goopMotion).toBeGreaterThan(5);
  expect(staged.bobMotion).toBeLessThan(.01);
  expect(staged.status).toContainEqual({slimeId: 'goop', label: 'Catching up', kind: 'companion'});
  await page.keyboard.down('Tab');
  const switched = await page.evaluate(() => {
    const rt = (window as any).__companionSession.runtime;
    rt.fixedUpdate(1 / 60);
    return {active: rt.resources.manager.activeSlimeId, intent: rt.companions.movement.goop.lengthSq(), status: rt.getSlimeHUDSnapshot().passiveInteractions};
  });
  await page.keyboard.up('Tab');
  expect(switched).toEqual({active: 'goop', intent: 0, status: []});
  await page.keyboard.down('Tab');
  await page.evaluate(() => (window as any).__companionSession.runtime.fixedUpdate(1 / 60));
  await page.keyboard.up('Tab');
  const finished = await page.evaluate(() => {
    const rt = (window as any).__companionSession.runtime, r = rt.resources;
    rt.stop();
    const paused = r.pair.goopBody.position.clone();
    rt.fixedUpdate(1);
    const pauseMotion = r.pair.goopBody.position.distanceTo(paused);
    rt.start();
    for (let i = 0; i < 1800; i++) rt.fixedUpdate(1 / 60);
    const arrived = r.pair.goopBody.position.z;
    rt.resetAndRecoverAuthoredPreviewRoom(r);
    const reset = {movement: rt.companions.movement.goop.lengthSq(), jump: rt.companions.jump.goop.pressed,
      status: rt.getSlimeHUDSnapshot().passiveInteractions};
    return {pauseMotion, arrived, reset, playing: r.deathSequence.isPlaying};
  });
  expect(finished.pauseMotion).toBe(0);
  expect(finished.arrived).toBeGreaterThan(80);
  expect(finished.playing).toBe(true);
  expect(finished.reset).toEqual({movement: 0, jump: false, status: []});
  expect(errors).toEqual([]);
});

test('Level 3 companion finishes the safe main corridor while the active character stays put', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openLevel(page, 3, 'Blackout');
  const result = await page.evaluate(() => {
    const rt = (window as any).__companionSession.runtime;
    rt.teleportToAuthoredRoom(1);
    const r = rt.resources;
    r.manager.activate('bob');
    r.group.bobBody.teleport(r.group.bobBody.position.clone().set(6, .86, 84));
    r.group.goopBody.teleport(r.group.goopBody.position.clone().set(6, .46, 60));
    r.group.voltBody.teleport(r.group.voltBody.position.clone().set(-16, 2.96, 85));
    const bob = r.group.bobBody.position.clone();
    let caughtUp = false;
    for (let i = 0; i < 600; i++) {
      rt.fixedUpdate(1 / 60);
      caughtUp ||= rt.getSlimeHUDSnapshot().passiveInteractions.some((entry: any) => entry.slimeId === 'goop' && entry.label === 'Catching up');
    }
    return {z: r.group.goopBody.position.z, grounded: r.group.goopBody.grounded,
      bobMotion: r.group.bobBody.position.distanceTo(bob), caughtUp, playing: r.deathSequence.isPlaying,
      movementIntent: r.goopPresentationState.movementIntentWorld.toArray()};
  });
  expect(result.z).toBeGreaterThan(81);
  expect(result.grounded).toBe(true);
  expect(result.bobMotion).toBeLessThan(.01);
  expect(result.caughtUp).toBe(true);
  expect(result.playing).toBe(true);
  expect(result.movementIntent).toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
});
