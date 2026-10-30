import { test, expect } from '../../helpers/MenuFixtures.ts';

test('settings keyboard/gamepad controls, persistence, reset and structured credits', async ({ menuPage: page, menuRequests }) => {
  const title = page.locator('[data-flow-panel="title"]');
  await title.locator('[data-action="settings"]').click();
  const settings = page.locator('[data-flow-panel="settings"]');
  await expect(settings.locator('[data-setting="graphics-profile"]')).toHaveValue('standard');
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
  await expect(settings.locator('[data-setting="graphics-profile"]')).toHaveValue('standard');
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

test('auto-detect keeps progress steady and releases the button after completion or failure', async ({menuPage:page}) => {
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  const button = page.locator('[data-action="calibrate-graphics"]');
  const feedback = page.locator('[data-settings-feedback]');
  const footer = page.locator('.settings-footer');
  await page.locator('.settings-panel').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
  const before = await footer.boundingBox();
  await page.evaluate(() => {
    const fixture = (window as any).__menuFixture;
    fixture.ui.actions.recalibrateGraphics = (progress: (message:string)=>void) => {
      progress('Preparing Medium test…');
      fixture.progressDetection = progress;
      return new Promise<string>(resolve => { fixture.finishDetection = resolve; });
    };
  });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(feedback).toHaveText('Checking graphics…');
  await page.evaluate(() => {
    const fixture = (window as any).__menuFixture;
    for (const message of ['Checking Medium…','Preparing High test…','Checking High…','Finishing graphics check…'])
      fixture.progressDetection(message);
  });
  await expect(feedback).toHaveText('Checking graphics…');
  expect(await footer.boundingBox()).toEqual(before);
  const icon = button.locator('.ui-icon');
  await expect(icon).toHaveCSS('animation-name', 'graphics-detect-spin');
  await page.evaluate(() => (window as any).__menuFixture.settings.setReduceMenuMotion(true));
  await expect(icon).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => (window as any).__menuFixture.settings.setReduceMenuMotion(false));
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(icon).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('.settings-panel').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
  await page.evaluate(() => (window as any).__menuFixture.finishDetection('Already using the recommended Medium settings.'));
  await expect(feedback).toHaveText('Already using the recommended Medium settings.');
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute('aria-busy');
  expect(await footer.boundingBox()).toEqual(before);
  await page.evaluate(() => {
    (window as any).__menuFixture.ui.actions.recalibrateGraphics = async () => { throw Error('unavailable'); };
  });
  await button.click();
  await expect(feedback).toHaveText('Could not check graphics. Your settings are kept.');
  await expect(button).toBeEnabled();
  await expect(page.locator('[data-setting="graphics-profile"]')).toHaveValue('standard');
});

test('High and Ultra expose their budgets and restore custom shadow filtering', async ({menuPage:page}) => {
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  const profile = page.locator('[data-setting="graphics-profile"]');
  for (const [id, budget, gel, filtering] of [
    ['high', '2073600', 'balanced-transmission', 'standard'],
    ['ultra', '3686400', 'physical', 'soft'],
  ]) {
    await profile.selectOption(id);
    await expect(page.locator('[data-setting="pixel-budget"]')).toHaveValue(budget);
    await expect(page.locator('[data-setting="gel-rendering"]')).toHaveValue(gel);
    await expect(page.locator('[data-setting="shadow-filtering"]')).toHaveValue(filtering);
    await expect(page.locator('[data-setting="shadow-quality"]')).toHaveValue('2048');
  }
  await page.reload();
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await expect(profile).toHaveValue('ultra');
  await page.locator('[data-setting="shadow-filtering"]').selectOption('standard');
  await expect(profile).toHaveValue('custom');
  await page.reload();
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await expect(profile).toHaveValue('custom');
  await expect(page.locator('[data-setting="shadow-filtering"]')).toHaveValue('standard');
  await expect(page.locator('[data-setting="pixel-budget"]')).toHaveValue('3686400');
});

test('visible setting help cannot block Reset beneath the popover', async ({menuPage: page}) => {
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
  await page.locator('[data-section="accessibility"]').click();
  const motion = page.locator('[data-setting="reduce-menu-motion"]');
  await motion.check();
  await page.mouse.move(0, 0);
  await motion.hover();
  const help = page.locator('#setting-help');
  await expect(help).toBeVisible();
  await expect(help).toContainText('Keeps the title scene still');
  const reset = page.locator('[data-action="reset-settings"]');
  // Reproduce the CI overlap deterministically, regardless of viewport/font metrics.
  const bounds = (await reset.boundingBox())!;
  await help.evaluate((element, bounds) => {
    Object.assign(element.style, {left: `${bounds.x}px`, top: `${bounds.y}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`, transform: 'none'});
  }, bounds);
  await reset.click();
  await expect(motion).not.toBeChecked();
  await expect(page.locator('[data-settings-feedback]')).toContainText('Default settings restored');
  await expect(help).toBeHidden();
});
