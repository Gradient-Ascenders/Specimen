import { expect, test, type Page } from '@playwright/test';
import { isExpectedMusicCancellation } from '../helpers/ExpectedMusicCancellation.ts';

const snapshot = (page: Page) => page.evaluate(() => ((window as any).__blackoutMusicPlayers as HTMLAudioElement[])
  .map(p => ({ src: p.src, paused: p.paused, loop: p.loop, time: p.currentTime, volume: p.volume, error: p.error?.message })));

async function advance(page: Page, resource: string, seconds: number) {
  await page.evaluate(({ resource, seconds }) => {
    const r = (window as any).__blackoutMusicSession.runtime, movie = r.resources[resource];
    for (let i = 0; i < 18000 && movie.active && movie.seconds < seconds; i++) r.fixedUpdate(1 / 60);
    r.render(1, { frameDeltaSeconds: 1 / 60 });
  }, { resource, seconds });
}

async function expectMusic(page: Page, prefix: string) {
  await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused).map(p => p.src))
    .toEqual([expect.stringContaining(prefix)]);
  const player = (await snapshot(page)).find(p => !p.paused && p.src.includes(prefix))!;
  expect(player).toMatchObject({ loop: false, error: undefined });
}

test('Blackout cinematic music follows both live clocks, pause, skip, recovery and the combat handoff', async ({ page, baseURL }, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  page.on('requestfailed', request => { if (!isExpectedMusicCancellation(request, baseURL!)) errors.push(`${request.failure()?.errorText}: ${request.url()}`); });
  await page.addInitScript(() => {
    const Original = window.Audio;
    (window as any).__blackoutMusicPlayers = [];
    window.Audio = new Proxy(Original, { construct(target, args) {
      const player = Reflect.construct(target, args);
      (window as any).__blackoutMusicPlayers.push(player);
      return player;
    } });
  });
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__blackoutMusicSession=new $2({initialRuntime:') });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 180_000 });
  await title.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="graphics-profile"]').selectOption('minimum');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await title.locator('[data-action="level-select"]').click();
  await page.getByRole('button', { name: 'Level 3 Blackout', exact: true }).click();
  await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
  await page.evaluate(() => {
    const r = (window as any).__blackoutMusicSession.runtime;
    r.renderLayer.setAnimationLoop(null);
    for (let i = 0; i < 600; i++) r.fixedUpdate(1 / 60);
    r.activateCheckpoint('cp3'); r.recoverActiveCheckpoint();
    const g = r.resources.group, p = g.bobBody.position.clone();
    g.bobBody.teleport(p.set(-1.5, .86, 175.2)); g.goopBody.teleport(p.set(1.5, .86, 175.2)); g.voltBody.teleport(p.set(0, .86, 180.7));
    r.fixedUpdate(1 / 60);
    (window as any).__blackoutMusicTick = setInterval(() => r.fixedUpdate(1 / 60), 16);
  });
  await expect(page.locator('#app')).toHaveAttribute('data-cinematic', 'blackout-elevator');
  await expectMusic(page, '08-blackout-elevator');
  await advance(page, 'elevatorAscent', 20);
  await expect.poll(async () => (await snapshot(page)).find(p => !p.paused && p.src.includes('08-'))?.time).toBeGreaterThan(19);
  await page.keyboard.press('p');
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'paused');
  await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused).length).toBe(0);
  await page.locator('[data-action="resume"]').click();
  await expectMusic(page, '08-blackout-elevator');
  await advance(page, 'elevatorAscent', 100);
  await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused && p.src.includes('08-')).length).toBe(0);
  await page.evaluate(() => {
    const r = (window as any).__blackoutMusicSession.runtime;
    r.activateCheckpoint('cp6'); r.recoverActiveCheckpoint();
    r.resources.group.activeBody.teleport(r.resources.group.activeBody.position.clone().setZ(188.15));
    r.fixedUpdate(1 / 60);
  });
  await expectMusic(page, '09-blackout-research');
  for (const seconds of [66, 125, 134, 194.8, 195.2, 208, 222, 230, 236, 262]) {
    await advance(page, 'researchFinale', seconds);
    await expect.poll(async () => (await snapshot(page)).find(p => !p.paused && p.src.includes('09-'))?.time).toBeGreaterThan(seconds - .4);
  }
  await page.screenshot({ path: info.outputPath('research-arena-music.png') });
  await page.keyboard.press('p');
  await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused).length).toBe(0);
  await page.locator('[data-action="resume"]').click();
  await expectMusic(page, '09-blackout-research');
  // Recovery resets the live film and its token, allowing a fresh start at zero.
  await page.evaluate(() => {
    const r = (window as any).__blackoutMusicSession.runtime;
    r.recoverActiveCheckpoint();
    r.resources.group.activeBody.teleport(r.resources.group.activeBody.position.clone().setZ(188.15)); r.fixedUpdate(1 / 60);
  });
  await expectMusic(page, '09-blackout-research');
  await expect.poll(async () => (await snapshot(page)).find(p => !p.paused && p.src.includes('09-'))?.time).toBeLessThan(5);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused && p.src.includes('09-')).length).toBe(0);
  // Start another real attempt and finish naturally, then let actual combat own music.
  await page.evaluate(() => {
    const r = (window as any).__blackoutMusicSession.runtime;
    r.activateCheckpoint('cp6'); r.recoverActiveCheckpoint();
    r.resources.group.activeBody.teleport(r.resources.group.activeBody.position.clone().setZ(188.15)); r.fixedUpdate(1 / 60);
  });
  await expectMusic(page, '09-blackout-research');
  await advance(page, 'researchFinale', 277);
  await page.evaluate(() => {
    for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code: 'Enter', bubbles: true }));
  });
  await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused).map(p => p.src))
    .toEqual([expect.stringContaining('07-blackout-boss')]);
  expect((await snapshot(page)).find(p => p.src.includes('07-'))!.loop).toBe(true);
  expect(await page.evaluate(() => (window as any).__blackoutMusicPlayers.length)).toBe(2);
  await page.evaluate(() => clearInterval((window as any).__blackoutMusicTick));
  expect(errors).toEqual([]);
});
