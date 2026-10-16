import { expect, test, type Page } from '@playwright/test';
import { finishOpening } from '../helpers/OpeningHandoff.ts';

// No route interception or runtime injection: these are the shipped files.
const watchProductionRequests = (page: Page, baseURL: string): Set<string> => {
  const failures = new Set<string>();
  const base = new URL(baseURL);
  page.on('pageerror', (error) => failures.add(`Uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) {
      failures.add(`Console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    // Pausing a streamed track on menu/level transition intentionally cancels
    // its pending HTTP range request. Keep every other network error visible.
    const url = new URL(request.url());
    if (/\/assets\/audio\/music\/[^/]+\.ogg$/.test(url.pathname) &&
        request.failure()?.errorText === 'net::ERR_ABORTED') return;
    failures.add(`Failed request: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.add(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      failures.add(`Request escaped the deployment directory: ${request.url()}`);
    }
  });
  return failures;
};

const assertPlaying = async (page: Page): Promise<void> => {
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#app')).toHaveAttribute('data-game-state', 'playing');
  await expect(page.locator('canvas')).toHaveCount(1);
  // Ensure the new level has presented frames before taking a checkpoint.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

const restartFromPause = async (page: Page): Promise<void> => {
  await page.keyboard.press('KeyP');
  const pause = page.locator('[data-flow-panel="paused"]');
  await expect(pause).toBeVisible();
  await pause.locator('[data-action="restart"]').click();
  await assertPlaying(page);
  await page.keyboard.press('KeyP');
  await expect(pause.locator('[data-restart-status]')).toHaveText('Trial restored.');
  await pause.locator('[data-action="resume"]').click();
  await assertPlaying(page);
};

test('plain production boots, shows credits, starts, and restarts at a nested path', async ({
  page, baseURL,
}) => {
  const failures = watchProductionRequests(page, baseURL!);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('Specimen');
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-title-backdrop', 'ready');
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height))
    .toBeLessThanOrEqual(1280 * 720);
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) =>
    [canvas.width, canvas.height])).toEqual([640, 360]);
  await title.locator('[data-action="settings"]').click();
  const settings = page.locator('[data-flow-panel="settings"]');
  expect(await settings.locator('legend').allTextContents()).toEqual(['Graphics', 'Display', 'Audio', 'Controls', 'Accessibility']);
  await expect(settings.locator('[data-setting="graphics-profile"]')).toBeFocused();
  await settings.locator('[data-section="accessibility"]').click();
  await settings.locator('[data-setting="reduce-menu-motion"]').check();
  await expect(page.locator('#app')).toHaveAttribute('data-title-motion', 'still');
  await settings.locator('[data-section="audio"]').click();
  await expect(settings.locator('[data-setting="volume"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(settings.locator('[data-setting-output="volume"]')).toHaveText('95%');
  await page.keyboard.press('ArrowDown');
  await expect(settings.locator('[data-setting="effects-volume"]')).toBeFocused();
  await settings.locator('[data-section="controls"]').click();
  // Supply a standard virtual controller; the shipped UI still reads and handles it.
  await page.evaluate(() => {
    const pad = { connected: true, mapping: 'standard', axes: [0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
    (window as any).__settingsPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => {
      const button = (window as any).__settingsPadButton;
      for (let index = 0; index < pad.buttons.length; index++) pad.buttons[index].pressed = index === button;
      delete (window as any).__settingsPadButton;
      return [pad];
    } });
    window.dispatchEvent(new Event('gamepadconnected'));
    return new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.evaluate(() => { (window as any).__settingsPadButton = 15; });
  await expect(settings.locator('[data-setting-output="sensitivity"]')).toHaveText('1.1×');
  await page.evaluate(() => {
    delete (navigator as any).getGamepads;
    delete (window as any).__settingsPad;
    window.dispatchEvent(new Event('gamepaddisconnected'));
  });
  await settings.locator('[data-setting="show-fps"]').check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('specimen.presentation-preferences.v1')!).showFPS)).toBe(true);
  await settings.locator('[data-action="reset-settings"]').click();
  await expect(settings.locator('[data-setting="show-fps"]')).not.toBeChecked();
  await expect(settings.locator('[data-setting-output="sensitivity"]')).toHaveText('1.0×');
  await expect(settings.locator('[data-settings-feedback]')).toContainText('Default settings restored');
  await expect(page.locator('#app')).toHaveAttribute('data-title-motion', 'orbiting');
  await settings.locator('[data-setting="show-fps"]').check();
  await settings.locator('[data-action="back"]').click();
  await title.locator('[data-action="credits"]').click();
  const credits = page.locator('[data-flow-panel="credits"]');
  await expect(credits).toBeVisible();
  await expect(credits.locator('.credits-ledger')).toContainText('Three.js');
  await expect(credits.locator('.lab-menu-panel')).toBeVisible();
  await expect(credits.locator('.credits-footer [data-action="back"]')).toBeInViewport();
  await expect(credits.locator('.credits-ledger a').first()).toHaveAttribute('href', /^https?:\/\//);
  await credits.locator('[data-action="back"]').click();
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

test('Performance production loads Cultivation and Blackout and restarts each at a nested path', async ({
  page, baseURL,
}) => {
  const failures = watchProductionRequests(page, baseURL!);
  const voltAssets = new Set<string>();
  const cultivationAssets = new Set<string>();
  const audioAssets = new Set<string>();
  const detailAssets = new Set<string>();
  page.on('response', response => {
    if (/\/volt-[^/]+\.glb$/.test(new URL(response.url()).pathname) && response.ok()) voltAssets.add(response.url());
    if (/\/authored-assets-[^/]+\.bin$/.test(new URL(response.url()).pathname) && response.ok()) cultivationAssets.add(response.url());
    // Only sound-effects bank requests count toward the 34/41/54 clip budgets.
    // The independently streamed level music is not part of those banks.
    if (/\/assets\/audio\/(?:bob|goop|volt|turrets)\/.*\.ogg$/.test(new URL(response.url()).pathname) && response.ok()) audioAssets.add(response.url());
    if (/\/(goop|volt)-lod-[^/]+\.bin$/.test(new URL(response.url()).pathname) && response.ok()) detailAssets.add(response.url());
  });
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const start = page.locator('[data-flow-panel="title"] [data-action="start"]');
  await expect(start).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await start.click();
  await finishOpening(page);
  await assertPlaying(page);
  expect([...voltAssets], 'Containment must not load Volt').toEqual([]);
  expect(cultivationAssets.size, 'Containment must not load the Cultivation bake').toBe(0);
  await expect.poll(() => audioAssets.size).toBe(34);
  expect([...audioAssets].some(url => url.includes('/volt/') || url.includes('/turrets/'))).toBe(false);
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
    await expect.poll(() => audioAssets.size).toBe(level === 2 ? 41 : 54);
    expect(detailAssets.size).toBe(2);
    if (level === 2) {
      expect(cultivationAssets.size, 'Cultivation must load its baked assets before playing').toBe(1);
      expect([...cultivationAssets][0]).toContain('/group-folder/assets/authored-assets-');
    }
    await restartFromPause(page);
  }
  await expect(page.locator('[data-slime-id="volt"]')).toHaveAttribute('data-state', 'active');
  expect(voltAssets.size, 'The shipped authored Volt GLB must load').toBe(1);
  expect([...voltAssets][0]).toContain('/group-folder/assets/volt-');
  expect([...failures], 'Production transition console/network errors').toEqual([]);
});
