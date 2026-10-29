import { test, expect } from '../../helpers/MenuFixtures.ts';

test('settings keyboard/gamepad controls, persistence, reset and structured credits', async ({ menuPage: page, menuRequests }) => {
  const title = page.locator('[data-flow-panel="title"]');
  await title.locator('[data-action="settings"]').click();
  const settings = page.locator('[data-flow-panel="settings"]');
  expect(await settings.locator('legend').allTextContents()).toEqual(['Graphics', 'Display', 'Audio', 'Controls', 'Accessibility']);
  await expect(settings.locator('[data-section="graphics"]')).toBeFocused();
  await settings.locator('[data-section="accessibility"]').click();
  await settings.locator('[data-setting="reduce-menu-motion"]').check();
  await settings.locator('[data-section="audio"]').click();
  await page.keyboard.press('Tab');
  await expect(settings.locator('[data-setting="volume"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(settings.locator('[data-setting-output="volume"]')).toHaveText('95%');
  await page.keyboard.press('ArrowDown');
  await expect(settings.locator('[data-setting="music-volume"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(settings.locator('[data-setting="effects-volume"]')).toBeFocused();
  await settings.locator('[data-section="controls"]').click();
  await page.keyboard.press('Tab');
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
  await settings.locator('[data-section="display"]').click();
  await settings.locator('[data-setting="show-fps"]').check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('specimen.presentation-preferences.v1')!).showFPS)).toBe(true);
  await settings.locator('[data-action="reset-settings"]').click();
  await expect(settings.locator('[data-setting="show-fps"]')).not.toBeChecked();
  await expect(settings.locator('[data-setting-output="sensitivity"]')).toHaveText('1.0×');
  await expect(settings.locator('[data-settings-feedback]')).toContainText('Default settings restored');
  await settings.locator('[data-setting="show-fps"]').check();
  await settings.locator('[data-action="back"]').click();
  await title.locator('[data-action="credits"]').click();
  const credits = page.locator('[data-flow-panel="credits"]');
  await expect(credits).toBeVisible();
  await expect(credits.locator('.credits-ledger')).toContainText('Three.js');
  // Music must render as structured credit entries, not raw Markdown paragraphs.
  await expect(credits.locator('.credits-ledger .credits-entry h3').filter({ hasText: /^(Osmotic Memory|Thought Loop|Unsolved Investigation|Searching)$/ })).toHaveCount(4);
  await expect(credits.locator('.credits-ledger .credits-entry').filter({ hasText: 'GloryToTheMachine' })).toHaveCount(1);
  await expect(credits.locator('.lab-menu-panel')).toBeVisible();
  await expect(credits.locator('.credits-footer [data-action="back"]')).toBeInViewport();
  await expect(credits.locator('.credits-ledger a').first()).toHaveAttribute('href', /^https?:\/\//);
  await credits.locator('[data-action="back"]').click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(menuRequests.filter(url => /\.(?:glb|bin|mp4)(?:\?|$)/.test(url))).toEqual([]);
});
