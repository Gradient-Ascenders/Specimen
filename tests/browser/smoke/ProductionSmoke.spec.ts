import { assertPlaying, restartFromPause } from '../../helpers/ProductionJourney.ts';
import { expect, test } from '@playwright/test';
import { SOUND_BANKS, SOUND_DEFINITIONS } from '../../../src/audio/SoundCatalog.ts';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';
import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';

test('plain production boots, shows credits, starts, and restarts at a nested path', { tag: '@extended' }, async ({
  page, baseURL,
}) => {
  const failures = watchBrowserErrors(page, { webgl: true, requests: true, deploymentBase: baseURL! });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('Specimen');
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-title-backdrop', 'ready');
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height))
    .toBeLessThanOrEqual(1280 * 720);
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) =>
    [canvas.width, canvas.height])).toEqual([640, 360]);
  // Keep actual renderer/settings integration here; pure menu behavior is isolated.
  await title.locator('[data-action="settings"]').click();
  const settings = page.locator('[data-flow-panel="settings"]');
  await settings.locator('[data-section="accessibility"]').click();
  await settings.locator('[data-setting="reduce-menu-motion"]').check();
  await expect(page.locator('#app')).toHaveAttribute('data-title-motion', 'still');
  await settings.locator('[data-action="reset-settings"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-title-motion', 'orbiting');
  await settings.locator('[data-section="display"]').click();
  await settings.locator('[data-setting="show-fps"]').check();
  await settings.locator('[data-action="back"]').click();
  await title.locator('[data-action="credits"]').click();
  await expect(page.locator('.credits-ledger')).toContainText('Three.js');
  await page.locator('[data-flow-panel="credits"] [data-action="back"]').click();
  await title.locator('[data-action="start"]').click();
  await finishOpening(page);
  await assertPlaying(page);
  await expect(page.locator('[data-fps-counter]')).toBeVisible();
  await expect(page.locator('[data-fps-counter]')).toHaveText(/^\d+ FPS$/);
  await expect(page.locator('#app')).not.toHaveAttribute('data-title-backdrop', /.+/);
  await page.keyboard.press('KeyW', { delay: 150 });
  await restartFromPause(page);
  expect([...failures], 'Production console/network errors').toEqual([]);
});

test('Performance production loads Cultivation and Blackout and restarts each at a nested path', { tag: '@extended' }, async ({
  page, baseURL,
}) => {
  const failures = watchBrowserErrors(page, { webgl: true, requests: true, deploymentBase: baseURL! });
  const voltAssets = new Set<string>();
  const cultivationAssets = new Set<string>();
  const audioAssets = new Set<string>();
  // Cue aliases may share a recording. Compare unique network assets, just
  // like audioAssets, while still requiring the complete bank with no extras.
  const effectUrlsFor = (bank: readonly (keyof typeof SOUND_DEFINITIONS)[]) => [...new Set(bank
    .map(id => new URL(SOUND_DEFINITIONS[id].path, baseURL!).href))].sort();
  const soundEffectUrls = new Set(effectUrlsFor(SOUND_BANKS.blackout));
  const detailAssets = new Set<string>();
  page.on('response', response => {
    if (/\/volt-[^/]+\.glb$/.test(new URL(response.url()).pathname) && response.ok()) voltAssets.add(response.url());
    if (/\/authored-assets-[^/]+\.bin$/.test(new URL(response.url()).pathname) && response.ok()) cultivationAssets.add(response.url());
    // Use the catalog so every effects folder counts, while streamed music does not.
    if (soundEffectUrls.has(response.url()) && response.ok()) audioAssets.add(response.url());
    if (/\/(goop|volt|specimen)-lod-[^/]+\.bin$/.test(new URL(response.url()).pathname) && response.ok()) detailAssets.add(response.url());
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const start = page.locator('[data-flow-panel="title"] [data-action="start"]');
  await expect(start).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-section="graphics"]').click();
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await start.click();
  await finishOpening(page);
  await assertPlaying(page);
  expect([...voltAssets], 'Containment must not load Volt').toEqual([]);
  expect(cultivationAssets.size, 'Containment must not load the Cultivation bake').toBe(0);
  await expect.poll(() => [...audioAssets].sort(), {
    message: 'Containment must preload exactly its declared effects bank',
  }).toEqual(effectUrlsFor(SOUND_BANKS.containment));
  // The Level 1 finale needs drone gunfire, but no Volt recordings or later
  // character/geometry assets may be pulled into the first level.
  expect([...audioAssets].some(url => url.includes('/volt/'))).toBe(false);
  expect(detailAssets.size).toBe(1);
  expect([...detailAssets][0]).toContain('/group-folder/assets/goop-lod-');

  // Existing debug shortcuts advance progression; this does not solve puzzles.
  // Keep diagnostics hidden and use the normal transition/enter UI.
  for (const level of [2, 3]) {
    await page.keyboard.press('Digit0', { delay: 100 });
    const enterLevel = page.locator('[data-action="enter-level"]');
    await expect(enterLevel).toBeVisible({ timeout: 120_000 });
    await expect(enterLevel).toContainText(`Enter Level ${level}`);
    await enterLevel.click();
    await assertPlaying(page);
    await expect.poll(() => [...audioAssets].sort(), {
      message: `Level ${level} must preload exactly its declared effects bank`,
    }).toEqual(effectUrlsFor(level === 2 ? SOUND_BANKS.cultivation : SOUND_BANKS.blackout));
    expect(detailAssets.size).toBe(level===2?2:3);
    if (level === 2) {
      expect(cultivationAssets.size, 'Cultivation must load its baked assets before playing').toBe(1);
      expect([...cultivationAssets][0]).toContain('/group-folder/assets/authored-assets-');
    }
    await restartFromPause(page);
  }
  await expect(page.locator('li[data-slime-id="volt"]')).toHaveAttribute('data-state', 'active');
  expect(voltAssets.size, 'The shipped authored Volt GLB must load').toBe(1);
  expect([...voltAssets][0]).toContain('/group-folder/assets/volt-');
  expect([...failures], 'Production transition console/network errors').toEqual([]);
});
