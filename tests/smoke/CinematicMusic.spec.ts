import { expect, test, type Page } from '@playwright/test';
import { finishOpening } from '../helpers/OpeningHandoff.ts';
import { VOLT_FINALE } from '../../src/cinematics/CultivationFinaleTimeline.ts';

async function observeMusic(page: Page) {
  await page.addInitScript(() => {
    const Original = window.Audio;
    (window as any).__musicPlayers = [];
    window.Audio = new Proxy(Original, {
      construct(target, args) {
        const player = Reflect.construct(target, args);
        (window as any).__musicPlayers.push(player);
        return player;
      },
    });
  });
}
const snapshot = (page: Page) => page.evaluate(() => ((window as any).__musicPlayers as HTMLAudioElement[])
  .map(p => ({ src: p.src, paused: p.paused, loop: p.loop, rate: p.playbackRate, time: p.currentTime, volume: p.volume, error: p.error?.message })));

for (const mode of ['live', 'video']) {
  test(`${mode} opening owns one streamed soundtrack, then skip restores level music under a nested base`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await observeMusic(page);
    await page.goto(`./?opening=${mode === 'video' ? 'mp4' : 'live'}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-flow-panel="title"]')).toBeVisible({ timeout: 180_000 });
    await page.locator('[data-action="start"]').click();
    await expect.poll(async () => (await snapshot(page)).some(p => p.src.includes('04-opening') && !p.paused && p.time > .1), { timeout: 120_000 }).toBe(true);
    let state = await snapshot(page);
    expect(state).toHaveLength(2);
    expect(state.filter(p => !p.paused)).toHaveLength(1);
    expect(state.find(p => p.src.includes('04-opening'))).toMatchObject({ loop: false, error: undefined });
    expect(state.every(p => !p.src || new URL(p.src).pathname.startsWith('/group-folder/assets/audio/music/'))).toBe(true);
    if (mode === 'video') {
      const video = page.locator('video.opening-video');
      await expect(video).toHaveJSProperty('muted', true);
      await video.evaluate((v: HTMLVideoElement) => v.pause());
      await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused).length).toBe(0);
      await video.evaluate(async (v: HTMLVideoElement) => { v.currentTime = 5; await v.play(); });
      await expect.poll(async () => page.evaluate(() => {
        const video = document.querySelector('video')!;
        const music = ((window as any).__musicPlayers as HTMLAudioElement[]).find(p => p.src.includes('04-opening'))!;
        return !music.paused && Math.abs(video.currentTime - music.currentTime) < .5;
      })).toBe(true);
    }
    await finishOpening(page, false);
    await expect.poll(async () => (await snapshot(page)).some(p => p.src.includes('01-containment') && !p.paused), { timeout: 15_000 }).toBe(true);
    state = await snapshot(page);
    expect(state.filter(p => !p.paused)).toHaveLength(1);
    expect(state.find(p => p.src.includes('04-opening'))?.paused ?? true).toBe(true);
    await page.keyboard.press('KeyP');
    await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused).length).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('cinematic recordings decode at the nested URL and credits use the existing music rows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const files = ['04-opening-tension.ogg', '05-containment-escape-high-tech-lab.ogg', '06-cultivation-volt-rescue-digital-slash.ogg',
    '08-blackout-elevator-quiet-ascent.ogg', '09-blackout-research-the-specimen.ogg'];
  const decoded = await page.evaluate(async files => {
    const context = new AudioContext();
    try {
      return await Promise.all(files.map(async file => {
        const url = new URL('assets/audio/music/' + file, location.href);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        let blackoutPeak = 0;
        if (file.startsWith('09-')) for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const samples = buffer.getChannelData(channel);
          for (let frame = Math.ceil(124 * buffer.sampleRate); frame < 133 * buffer.sampleRate; frame++)
            blackoutPeak = Math.max(blackoutPeak, Math.abs(samples[frame]!));
        }
        return { path: url.pathname, duration: buffer.duration, channels: buffer.numberOfChannels, rate: buffer.sampleRate, blackoutPeak };
      }));
    } finally { await context.close(); }
  }, files);
  for (let index = 0; index < decoded.length; index++) {
    expect(decoded[index]!.path).toBe('/group-folder/assets/audio/music/' + files[index]);
    expect(decoded[index]!.channels).toBe(2);
    expect(decoded[index]!.duration).toBeCloseTo([99.1, 152.92, 129.023, 85.068, 277][index]!, 0);
  }
  expect(decoded[2]!.duration).toBeGreaterThanOrEqual(VOLT_FINALE.duration);
  expect(decoded[4]!.blackoutPeak).toBe(0);
  await expect(page.locator('[data-flow-panel="title"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-flow-panel="title"] [data-action="credits"]').click();
  for (const [title, creator] of [['Tension', 'Tsorthan Grove'], ['High Tech Lab', 'remaxim']]) {
    const row = page.locator('.credits-entry').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}$`) }) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.credits-creator')).toHaveText(creator!);
    await expect(row.locator('.credits-licence a')).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    await expect(row.locator('.credits-use')).toContainText('converted to OGG');
    await expect(row.locator('h3 a')).toHaveAttribute('href', /^https:\/\//);
  }
  const voltCredit = page.locator('.credits-entry').filter({ has: page.locator('h3', { hasText: /^Digital Slash$/ }) });
  await expect(voltCredit).toHaveCount(1);
  await expect(voltCredit.locator('.credits-creator')).toHaveText('PetterTheSturgeon');
  await expect(voltCredit.locator('h3 a')).toHaveAttribute('href', 'https://opengameart.org/content/digital-slash');
  await expect(voltCredit.locator('.credits-licence a')).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/3.0/');
  await expect(voltCredit.locator('.credits-use')).toContainText('plays from file 0:00');
  await expect(voltCredit.locator('.credits-use')).toContainText('edited for use in Specimen, including trimming and a repeated musical section');
  await expect(page.locator('.credits-entry').filter({ has: page.locator('h3', { hasText: /^The Way Out$/ }) })).toHaveCount(0);
  for (const [title, creator, slug, licence] of [
    ['Soundscape - Synthwave Horror J60 - Loop', 'Tri-Tachyon (Ellary)', 'soundscape-synthwave-horror-j60-loop', 'licenses/by/4.0/'],
    ['Sci-Fi Textures', 'Marcelo Fernandez', 'sci-fi-textures', 'licenses/by/3.0/'],
    ['Article 160 Section 2', 'Zander Noriega', 'article-160-section-2', 'licenses/by/3.0/'],
    ['Inevitable', 'vitalezzz', 'inevitable', 'publicdomain/zero/1.0/'],
    ['Derelict Spaceship', 'vitalezzz', 'derelict-spaceship', 'publicdomain/zero/1.0/'],
  ]) {
    const row = page.locator('.credits-entry').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}$`) }) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.credits-creator')).toHaveText(creator!);
    await expect(row.locator('h3 a')).toHaveAttribute('href', `https://opengameart.org/content/${slug}`);
    await expect(row.locator('.credits-licence a')).toHaveAttribute('href', `https://creativecommons.org/${licence}`);
  }
  await expect(page.locator('.credits-use').filter({ hasText: 'Music by Tri-Tachyon - https://soundcloud.com/tri-tachyon/albums' })).toHaveCount(1);
  await expect(page.locator('.credits-entry').filter({ has: page.locator('h3', { hasText: /^Perpetual Tension$/ }) })).toHaveCount(0);
  await expect(page.locator('.credits-use').filter({ hasText: 'extended/repeated buildup in Act III' })).toHaveCount(1);
  await page.locator('.credits-entry').filter({ has: page.locator('h3', { hasText: /^High Tech Lab$/ }) }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('cinematic-music-credits.png') });
  expect(errors).toEqual([]);
});


test('real finales own streamed music across pause, skip and level handoffs; vent arrival has no unique track', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await observeMusic(page);
  // Observe the shipped owner, using the same completion contracts as the
  // existing ProductionParity regression, without replacing gameplay/audio.
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern, '$1=globalThis.__musicSession=new $2({initialRuntime:') });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 180_000 });
  await page.locator('[data-action="start"]').click(); await finishOpening(page, false);
  await page.evaluate(() => (window as any).__musicSession.runtime.resources.containmentLevel.teleportToRoomForDebug(5));
  await expect.poll(() => page.evaluate(() => [...(window as any).__musicSession.runtime.audio.loops.values()]
    .some((loop: any) => loop.sound === 'world-platform-hover-loop-01')), { timeout: 30_000 }).toBe(true);
  const traversalSounds = await page.evaluate(() => [...(window as any).__musicSession.runtime.audio.loops.values()]
    .map((loop: any) => loop.sound));
  expect(traversalSounds).not.toContain('world-machinery-loop-01');
  expect(traversalSounds).toContain('world-laser-loop-01');
  expect((await snapshot(page)).filter(p => !p.paused).every(p => p.src.includes('01-containment'))).toBe(true);
  await page.evaluate(() => {
    const rt = (window as any).__musicSession.runtime;
    if (!rt.resources.containmentLevel.beginEndingForDebug()) throw new Error('Containment ending did not start');
  });
  await expect.poll(async () => (await snapshot(page)).some(p => p.src.includes('05-containment') && !p.paused), { timeout: 180_000 }).toBe(true);
  let state = await snapshot(page);
  expect(state.filter(p => !p.paused)).toHaveLength(1);
  expect(state.find(p => p.src.includes('05-containment'))!.loop).toBe(false);
  expect(state.find(p => p.src.includes('05-containment'))!.volume).toBeCloseTo(.28 * .6, 2);
  const goopMix = await page.evaluate(() => {
    const rt = (window as any).__musicSession.runtime, r = rt.resources;
    const time = 18; // Three seconds after the drone reveal: sustained reference alarm.
    rt.finale.fixedUpdate(time);
    r.containmentLevel.update(Math.max(0, time - r.testScene.roomFive.endingSeconds));
    rt.renderFinale(r);
    return { alarm: rt.audio.loops.get('containment-finale-alarm')?.volumeScale,
      master: rt.audio.diagnostics.masterVolume, effects: rt.audio.diagnostics.effectsVolume };
  });
  expect(goopMix).toEqual({ alarm: .35, master: 1, effects: .8 });
  const finaleSounds = await page.evaluate(() => [...(window as any).__musicSession.runtime.audio.loops.values()]
    .map((loop: any) => loop.sound));
  expect(finaleSounds).not.toContain('world-machinery-loop-01');
  expect(finaleSounds).toContain('world-drone-flight-loop-01');
  expect(finaleSounds).toContain('world-containment-alarm-loop-01');
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).filter(p => !p.paused).length).toBe(0);
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
  await expect.poll(async () => (await snapshot(page)).some(p => p.src.includes('05-containment') && !p.paused)).toBe(true);
  await page.evaluate(() => (window as any).__musicSession.runtime.skipFinale());
  await expect(page.locator('[data-action="enter-level"]')).toBeVisible({ timeout: 240_000 });
  // GPU preparation can paint Enter before the queued final fade ticks run.
  await expect.poll(async () => (await snapshot(page)).every(p => p.paused)).toBe(true);
  expect(await page.evaluate(() => [...(window as any).__musicSession.runtime.audio.loops.keys()]
    .some((key: any) => key.startsWith('containment-finale-')))).toBe(false);
  await page.locator('[data-action="enter-level"]').click();
  await expect.poll(async () => (await snapshot(page)).some(p => p.src.includes('02-cultivation') && !p.paused), { timeout: 30_000 }).toBe(true);
  await page.waitForFunction(() => !(window as any).__musicSession.runtime.ventArrival.active, undefined, { timeout: 90_000 });
  expect((await snapshot(page)).some(p => p.src.includes('06-cultivation'))).toBe(false);
  await page.evaluate(() => {
    const rt = (window as any).__musicSession.runtime;
    rt.teleportToAuthoredPreviewRoom(5);
    const r = rt.resources, controller = r.authoredPreview.roomFive.controller;
    controller.reset('controls'); controller.update(1.5, false, false, false, true);
    controller.update(4, false, false, false, false); rt.updateRoomFive(1 / 60, r);
    if (!r.roomFiveFinale.active) throw new Error('Volt release did not start');
  });
  // Capture ownership atomically: an intentional stationary-clock pause can
  // occur between two protocol calls while a software-rendered frame stalls.
  await expect.poll(async () => {
    state = await snapshot(page);
    return state.filter(p => !p.paused).map(p => p.src);
  }, { timeout: 30_000 }).toEqual([expect.stringContaining('06-cultivation-volt-rescue-digital-slash.ogg')]);
  expect(state.find(p => p.src.includes('06-cultivation'))!.src).toContain('06-cultivation-volt-rescue-digital-slash.ogg');
  expect(state.find(p => p.src.includes('06-cultivation'))!.time).toBeLessThan(10);
  expect(state.find(p => p.src.includes('06-cultivation'))!).toMatchObject({ loop: false, rate: 1, error: undefined });
  await expect.poll(async () => (await snapshot(page)).find(p => p.src.includes('06-cultivation'))!.volume).toBeCloseTo(.49, 4);
  const voltMix = await page.evaluate(timing => {
    const rt = (window as any).__musicSession.runtime, movie = rt.resources.roomFiveFinale;
    movie.update(Math.max(.001, timing.open + .1 - movie.seconds));
    const normal = rt.audio.loops.get('cultivation-finale-alarm')?.volumeScale;
    movie.update(timing.even + .1 - movie.seconds);
    movie.present(rt.renderLayer.cameraRig.camera, 1);
    return { normal, dialogue: rt.audio.loops.get('cultivation-finale-alarm')?.volumeScale,
      master: rt.audio.diagnostics.masterVolume, effects: rt.audio.diagnostics.effectsVolume };
  }, VOLT_FINALE);
  expect(voltMix).toEqual({ normal: .25, dialogue: .125, master: 1, effects: .8 });
  await test.info().attach('cinematic-mix-comparison', { contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ goop: { ...goopMix, music: .168 }, volt: { ...voltMix, music: .49 } }, null, 2)) });
  // Exercise the actual controls while Volt's soundtrack owns the music route.
  await page.keyboard.press('KeyP');
  await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  const setVolume = async (setting: string, value: string) => page.locator(`[data-setting="${setting}"]`).evaluate((element, value) => {
    (element as HTMLInputElement).value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await setVolume('effects-volume', '0');
  await expect.poll(async () => (await snapshot(page)).find(p => p.src.includes('06-cultivation'))!.volume).toBeCloseTo(.49, 4);
  await setVolume('music-volume', '50');
  await expect.poll(async () => (await snapshot(page)).find(p => p.src.includes('06-cultivation'))!.volume).toBeCloseTo(.245, 4);
  await setVolume('volume', '50');
  await expect.poll(async () => (await snapshot(page)).find(p => p.src.includes('06-cultivation'))!.volume).toBeCloseTo(.1225, 4);
  await setVolume('effects-volume', '80'); await setVolume('music-volume', '100'); await setVolume('volume', '100');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
  await expect.poll(async () => (await snapshot(page)).some(p => p.src.includes('06-cultivation') && !p.paused)).toBe(true);
  await page.evaluate(() => {
    const rt = (window as any).__musicSession.runtime;
    rt.resources.roomFiveFinale.requestSkip(); rt.fixedUpdate(1 / 60);
  });
  await expect(page.locator('[data-action="enter-level"]')).toBeVisible({ timeout: 240_000 });
  await expect.poll(async () => (await snapshot(page)).every(p => p.paused)).toBe(true);
  await page.locator('[data-action="enter-level"]').click();
  await expect.poll(async () => (await snapshot(page)).some(p => p.src.includes('03-blackout') && !p.paused), { timeout: 30_000 }).toBe(true);
  expect((await snapshot(page)).filter(p => !p.paused)).toHaveLength(1);
  expect(errors).toEqual([]);
});
