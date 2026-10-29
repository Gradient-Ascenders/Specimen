import { expect, test, type Page } from '@playwright/test';
import { isExpectedMusicCancellation } from '../helpers/ExpectedMusicCancellation.ts';

const file = 'blackout-boss-a-flawless-getaway.ogg';
const snapshot = (page: Page) => page.evaluate(() => ((window as any).__bossMusicPlayers as HTMLAudioElement[])
  .map(p => ({ src: p.src, current: p === (window as any).__bossMusicCurrent, time: p.currentTime, duration: p.duration, paused: p.paused,
    loop: p.loop, rate: p.playbackRate, volume: p.volume, error: p.error?.message,
    loads: (p as any).__bossLoads ?? 0 })));

async function step(page: Page, count: number) {
  await page.evaluate(count => {
    const r = (window as any).__bossMusicSession.runtime;
    for (let i = 0; i < count; i++) r.fixedUpdate(1 / 60);
  }, count);
}
async function press(page: Page, code: string) {
  await page.evaluate(code => {
    for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  }, code);
}
async function coreHit(page: Page) {
  await page.evaluate(() => {
    const r = (window as any).__bossMusicSession.runtime, f = r.resources.finalBoss;
    const result = f.controller.applyImpact({ projectileId: 999, targetId: 'extermination-core', kind: 'direct',
      fullyCharged: true, chargeAmount: 1, damageUnits: 999, point: f.presentation.coreWorld, direction: f.presentation.coreWorld });
    if (!result.accepted) throw new Error('Core fixture hit was rejected');
    r.fixedUpdate(1 / 60);
  });
}

test('boss music loops beyond a full cycle, spans phases, and cleans up death, retry, restart and victory', async ({ page, baseURL }, info) => {
  test.setTimeout(720_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => { if (!isExpectedMusicCancellation(request, baseURL!)) errors.push(`${request.failure()?.errorText} ${request.url()}`); });
  await page.addInitScript(() => {
    const Original = window.Audio;
    (window as any).__bossMusicPlayers = [];
    (window as any).__bossMusicWraps = [];
    window.Audio = new Proxy(Original, { construct(target, args) {
      const player = Reflect.construct(target, args) as HTMLAudioElement;
      const play = player.play.bind(player);
      player.play = () => {
        if (player.src.includes('07-blackout')) (window as any).__bossMusicCurrent = player;
        return play();
      };
      let last = 0, lastWall = 0;
      player.addEventListener('loadstart', () => {
        last = 0; lastWall = performance.now();
        if (player.src.includes('07-blackout')) (player as any).__bossLoads = ((player as any).__bossLoads ?? 0) + 1;
      });
      player.addEventListener('timeupdate', () => {
        if (!player.src.includes('07-blackout') || !player.loop) return;
        const now = performance.now(), time = player.currentTime;
        if (last > player.duration - 1 && time < 1) (window as any).__bossMusicWraps.push({ previous: last, time, duration: player.duration, wallGap: now - lastWall });
        last = time; lastWall = now;
      });
      (window as any).__bossMusicPlayers.push(player);
      return player;
    } });
  });
  // Observe the shipped owner. Staging uses existing public/debug contracts,
  // as in FinalBoss.spec; no production combat or music code is replaced.
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__bossMusicSession=new $2({initialRuntime:') });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 180_000 });
  await title.locator('[data-action="credits"]').click();
  const credit = page.locator('.credits-entry').filter({ has: page.locator('h3', { hasText: /^A Flawless Getaway$/ }) });
  await expect(credit.locator('.credits-creator')).toHaveText('vitalezzz');
  await expect(credit.locator('.credits-licence a')).toHaveAttribute('href', 'https://creativecommons.org/publicdomain/zero/1.0/');
  await expect(credit.locator('.credits-use')).toContainText('Vitalezzz - A Flawless Getaway');
  await page.locator('[data-flow-panel="credits"] [data-action="back"]').click();
  const asset = await page.evaluate(async file => {
    const url = new URL('assets/audio/music/' + file, location.href), response = await fetch(url);
    if (!response.ok) throw new Error('Boss asset HTTP ' + response.status);
    const context = new AudioContext({ sampleRate: 44100 });
    try { const audio = await context.decodeAudioData(await response.arrayBuffer());
      return { path: url.pathname, channels: audio.numberOfChannels, rate: audio.sampleRate, duration: audio.duration };
    } finally { await context.close(); }
  }, file);
  expect(asset).toMatchObject({ path: '/group-folder/assets/audio/music/' + file, channels: 2, rate: 44100 });
  expect(asset.duration).toBeCloseTo(169.838, 2);
  await title.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await title.locator('[data-action="level-select"]').click();
  await page.locator('[data-flow-panel="levelSelect"]').getByRole('button', { name: 'Level 3 Blackout' }).click();
  await page.locator('[data-action="enter-level"]').click({ timeout: 240_000 });
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  console.log('Boss music: entered Blackout; staging combat through existing debug contracts.');
  await page.evaluate(() => (window as any).__bossMusicSession.runtime.renderLayer.setAnimationLoop(null));
  await step(page, 900);
  expect((await snapshot(page)).some(p => p.src.includes(file))).toBe(false);
  await press(page, 'Digit4'); await step(page, 1);
  expect(await page.evaluate(() => (window as any).__bossMusicSession.runtime.finalBossReadModel.state)).toBe('intro');
  expect((await snapshot(page)).some(p => p.src.includes(file) && !p.paused)).toBe(false);
  await press(page, 'Enter'); await step(page, 1);
  let playing = await snapshot(page);
  await expect.poll(async () => { playing = await snapshot(page); return playing.filter(p => !p.paused).map(p => p.src); })
    .toEqual([expect.stringContaining(file)]);
  expect(playing.find(p => p.current)!).toMatchObject({ loop: true, rate: 1, error: undefined });
  expect(playing.find(p => p.current)!.time).toBeLessThan(3);
  expect(playing.find(p => p.current)!.volume).toBeCloseTo(.28, 5);
  const beginWall = Date.now();
  // Exercise the real settings while this combat attempt owns music.
  await page.keyboard.press('KeyP');
  await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  const setVolume = async (setting: string, value: string) => page.locator(`[data-setting="${setting}"]`).evaluate((element, value) => {
    (element as HTMLInputElement).value = value; element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  // Both reusable elements can retain the boss URL after retries; identify
  // the one handed to native play(), including while that attempt is paused.
  const boss = async () => (await snapshot(page)).find(p => p.current)!;
  const paused = await boss(); expect(paused.paused).toBe(true);
  await setVolume('effects-volume', '0'); expect((await boss()).volume).toBeCloseTo(.28, 5);
  await setVolume('music-volume', '0'); expect((await boss()).volume).toBe(0);
  await setVolume('music-volume', '50'); await setVolume('volume', '50'); expect((await boss()).volume).toBeCloseTo(.07, 5);
  await setVolume('effects-volume', '80'); await setVolume('music-volume', '100'); await setVolume('volume', '100');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
  expect((await boss()).time).toBeGreaterThanOrEqual(paused.time);
  // Legal controller/target fixtures cross the mandatory defensive waves.
  // This is lifecycle validation, not an unassisted human-input combat win.
  await page.evaluate(() => (window as any).__bossMusicSession.runtime.finalBossReadModel.invulnerability = 1e6);
  for (let wave = 0; wave < 3; wave++) {
    await coreHit(page);
    await page.evaluate(() => {
      const r = (window as any).__bossMusicSession.runtime, f = r.resources.finalBoss;
      f.update(1.5);
      for (const root of f.squad.root.children) if (root.visible) {
        const target = r.resources.combatTargets.getRegistrationForMesh(root.children[0])!.target;
        target.applyImpact({ projectileId: 999, targetId: target.id, kind: 'direct', fullyCharged: true,
          chargeAmount: 1, damageUnits: 999, point: root.position, direction: root.position });
      }
      r.fixedUpdate(1 / 60);
    });
  }
  const beforePhase = await boss();
  await coreHit(page);
  expect(await page.evaluate(() => (window as any).__bossMusicSession.runtime.finalBossReadModel.state)).toBe('transition');
  await press(page, 'Enter'); await step(page, 1);
  expect(await page.evaluate(() => (window as any).__bossMusicSession.runtime.finalBossReadModel.phase)).toBe(2);
  expect((await boss()).loads).toBe(beforePhase.loads);
  expect((await boss()).time).toBeGreaterThanOrEqual(beforePhase.time);
  console.log('Boss music: Phase 2 continuity verified; waiting for a full native loop at 1x.');
  // Advance real combat at 60 fixed steps per wall second while native media
  // plays at 1x. No seeking, accelerated audio or manual loop restart is used.
  await page.evaluate(() => {
    const r = (window as any).__bossMusicSession.runtime;
    (window as any).__bossMusicCombatTimer = setInterval(() => { for (let i = 0; i < 60; i++) r.fixedUpdate(1 / 60); }, 1000);
  });
  await page.waitForFunction(() => (window as any).__bossMusicWraps.length > 0, undefined, { timeout: 200_000, polling: 250 });
  await page.evaluate(() => clearInterval((window as any).__bossMusicCombatTimer));
  const boundary = await page.evaluate(() => (window as any).__bossMusicWraps[0]);
  expect(Date.now() - beginWall).toBeGreaterThan(168_000);
  expect(boundary.previous).toBeGreaterThan(asset.duration - 1); expect(boundary.time).toBeLessThan(1);
  expect(boundary.wallGap).toBeLessThan(1000);
  expect((await boss()).loads).toBe(beforePhase.loads); expect((await boss()).paused).toBe(false);
  expect((await snapshot(page)).filter(p => !p.paused)).toHaveLength(1);
  console.log('Boss music: full native loop observed.', JSON.stringify(boundary));
  await info.attach('native-loop-boundary', { contentType: 'application/json', body: Buffer.from(JSON.stringify({ asset, boundary, elapsedMs: Date.now() - beginWall })) });
  for (let retry = 0; retry < 2; retry++) {
    expect(await page.evaluate(() => (window as any).__bossMusicSession.runtime.requestFailure())).toBe(true);
    expect((await boss()).paused).toBe(true);
    await step(page, 80); await page.locator('.death-retry').click(); await step(page, 1);
    await expect.poll(async () => (await boss()).paused).toBe(false);
    expect((await boss()).time).toBeLessThan(3); expect((await boss()).volume).toBeCloseTo(.28, 5);
    expect((await snapshot(page)).filter(p => !p.paused)).toHaveLength(1);
  }
  console.log('Boss music: repeated death and CP9 retry verified.');
  await page.keyboard.press('KeyP'); await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  expect((await snapshot(page)).some(p => p.src.includes(file) && !p.paused)).toBe(false);
  await step(page, 900); await press(page, 'Digit4'); await step(page, 1); await press(page, 'Enter'); await step(page, 1);
  // Start directly at CP9 using the encounter's existing retry contract.
  await page.evaluate(() => { const f = (window as any).__bossMusicSession.runtime.resources.finalBoss; f.reset(); f.startPhaseTwo(); });
  await expect.poll(async () => (await boss()).paused).toBe(false);
  for (let hit = 0; hit < 10; hit++) {
    if (await page.evaluate(() => (window as any).__bossMusicSession.runtime.finalBossReadModel.health <= 0)) break;
    await coreHit(page);
  }
  expect(await page.evaluate(() => (window as any).__bossMusicSession.runtime.finalBossReadModel.state)).toBe('defeated');
  const defeatWall = Date.now();
  await expect.poll(async () => (await boss()).volume).toBeLessThan(.2);
  expect((await boss()).volume).toBeGreaterThan(0);
  await expect.poll(async () => (await boss()).paused, { timeout: 4000 }).toBe(true);
  expect(Date.now() - defeatWall).toBeGreaterThan(2300);
  await press(page, 'Enter'); await step(page, 120); await press(page, 'Enter'); await step(page, 1);
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'credits');
  expect((await snapshot(page)).every(p => p.paused)).toBe(true);
  expect(await page.evaluate(() => (window as any).__bossMusicPlayers.length)).toBe(2);
  expect(errors).toEqual([]);
});
