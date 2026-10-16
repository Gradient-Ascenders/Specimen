import { expect, test } from '@playwright/test';
import { SOUND_BANKS } from '../../src/audio/SoundCatalog.ts';

test('audio banks decode beneath nested base and gameplay owns charge, movement, pause and reset audio', async ({ page }) => {
  const errors: string[] = [], audioRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (request.url().endsWith('.ogg')) audioRequests.push(request.url()); });
  // Expose the existing runtime to observe actual Web Audio resources, without
  // replacing gameplay or audio code. Plain production smoke remains separate.
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern,
      '(globalThis.__audioRuntime=$1,$1.prepareLightingPrograms()).then(') });
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 180_000 });
  // Audio/input checks advance gameplay manually. Stop costly software-rendered
  // frames before waiting on asynchronous decoding, not after that wait.
  await page.evaluate(() => (window as any).__audioRuntime.renderLayer.setAnimationLoop(null));
  await expect.poll(() => page.evaluate(() => {
    const { loaded, failed, pending } = (window as any).__audioRuntime.audio.diagnostics;
    return { loaded, failed, pending };
  }), { timeout: 60_000 }).toEqual({ loaded: SOUND_BANKS.containment.length, failed: [], pending: 0 });
  expect(new Set(audioRequests).size).toBe(SOUND_BANKS.containment.length);
  expect(audioRequests.some(url => url.includes('/volt/') || url.includes('/turrets/'))).toBe(false);
  expect(audioRequests.every(url => new URL(url).pathname.startsWith('/group-folder/assets/audio/'))).toBe(true);
  // Start is the trusted gesture that unlocks audio and requests pointer lock.
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas'));
  await page.waitForFunction(() => (window as any).__audioRuntime.audio.diagnostics.contextState === 'running');
  // Unlock must not silently expand the bank. Later factories warm their
  // cumulative banks before entry; verify actual browser OGG decoding too.
  expect(new Set(audioRequests).size).toBe(SOUND_BANKS.containment.length);
  await page.evaluate(async banks => {
    const audio = (window as any).__audioRuntime.audio;
    await audio.preload(banks.cultivation);
    if (audio.diagnostics.loaded !== banks.cultivation.length) throw new Error('Cultivation bank missing');
    await audio.preload(banks.blackout);
  }, SOUND_BANKS);
  expect(new Set(audioRequests).size).toBe(54);
  await page.evaluate(() => {
    const runtime=(window as any).__audioRuntime;
    runtime.resources.body.teleport({x:3,y:0.46,z:0});
  });
  const step=async(count:number)=>page.evaluate(count=>{
    const runtime=(window as any).__audioRuntime;
    for(let i=0;i<count;i++) runtime.fixedUpdate(1/60);
    return { ...runtime.audio.diagnostics, keys:[...runtime.audio.loops.keys()] };
  },count);
  await page.keyboard.down('KeyW');
  const moving=await step(8);
  expect(moving.keys).toContain('character:movement');
  await page.keyboard.up('KeyW'); await step(40);
  await page.keyboard.down('Space');
  const charging=await step(12);
  expect(charging.keys).toContain('character:charge');
  await page.keyboard.up('Space');
  const jumped=await step(1);
  expect(jumped.keys).not.toContain('character:charge');
  expect(jumped.played).toBeGreaterThan(charging.played);
  await step(150);
  await page.keyboard.down('Space'); await step(8);
  await page.keyboard.press('Tab');
  const switched=await step(1);
  expect(switched.keys).not.toContain('character:charge');
  await page.keyboard.up('Space');
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.waitForFunction(() => (window as any).__audioRuntime.audio.diagnostics.contextState === 'suspended');
  await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
  await page.locator('[data-setting="volume"]').press('Home');
  await page.locator('[data-setting="effects-volume"]').press('Home');
  for (let i=0;i<7;i++) await page.locator('[data-setting="effects-volume"]').press('ArrowRight');
  const volume=await page.evaluate(()=>(window as any).__audioRuntime.audio.diagnostics);
  expect(volume.masterVolume).toBe(0); expect(volume.effectsVolume).toBe(0.35);
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
  await page.waitForFunction(() => (window as any).__audioRuntime.audio.diagnostics.contextState === 'running');
  const reset=await step(1);
  expect(reset.keys).not.toContain('character:charge');
  expect(reset.keys.some(key=>key.startsWith('acid:') || key.startsWith('dissolve:'))).toBe(false);
  await page.evaluate(() => (window as any).__audioRuntime.unload());
  const unloaded=await page.evaluate(()=>(window as any).__audioRuntime.audio.diagnostics);
  expect(unloaded.loops).toBe(0); expect(unloaded.voices).toBe(0);
  expect(unloaded.failed).toEqual([]); expect(errors).toEqual([]);
});
