import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';
import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';

test('level selection preserves every roster, menu return and fresh story in one session', async ({ page }) => {
  // Preserve each former level case's budget while sharing title/setup work.
  test.setTimeout(900_000);
  const errors = watchBrowserErrors(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  await title.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('[data-setting="graphics-profile"]').selectOption('minimum');
  await page.locator('[data-flow-panel="settings"]').getByRole('button', { name: 'Back', exact: true }).click();
  for (const [number, name] of [[1, 'Containment'], [2, 'Cultivation'], [3, 'Blackout']] as const) {
    await test.step(`selecting ${name} starts Level ${number} with its playable roster`, async () => {
      await title.getByRole('button', { name: 'Select level' }).click();
      await page.locator('[data-flow-panel="levelSelect"]').getByRole('button', { name: `Level ${number} ${name}` }).click();
      if (number === 1) {
        await finishOpening(page, false);
      } else {
        const transition = page.locator('[data-flow-panel="transitioning"]');
        await expect(transition).toBeVisible();
        await expect(page.locator('[data-flow-panel="opening"]')).toBeHidden();
        const enter = transition.getByRole('button', { name: `Enter Level ${number}` });
        await expect(enter).toBeVisible({ timeout: 180_000 });
        await enter.click();
      }
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
      await expect(page.locator('#app')).toHaveAttribute('data-game-state', 'playing');
      await expect(page.locator('canvas')).toHaveCount(1);
      await expect(page.locator('li[data-slime-id="bob"]')).toHaveAttribute('data-state', number === 3 ? 'switchable' : 'active');
      if (number >= 2) await expect(page.locator('li[data-slime-id="goop"]')).toHaveAttribute('data-state', 'switchable');
      // Blackout's authored arrival hands control to Volt.
      if (number === 3) await expect(page.locator('li[data-slime-id="volt"]')).toHaveAttribute('data-state', 'active');
      await page.evaluate(() => { (window as Window & { menuReturnCheck?: boolean }).menuReturnCheck = true; });
      await page.keyboard.press('KeyP');
      const pause = page.locator('[data-flow-panel="paused"]');
      await expect(pause).toBeVisible();
      await pause.locator('.pause-rail').evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
      });
      await expect(pause.getByRole('button', { name: 'Return to menu', exact: true })).toBeInViewport({ ratio: 1 });
      await mkdir('artifacts/evidence/level-selector', { recursive: true });
      await page.screenshot({ path: `artifacts/evidence/level-selector/pause-level-${number}.png` });
      await pause.getByRole('button', { name: 'Return to menu', exact: true }).click();
      await expect(title).toBeVisible({ timeout: 120_000 });
      await expect(title.getByRole('button', { name: 'Start trial' })).toBeFocused();
      await expect(page.locator('#app')).toHaveAttribute('data-title-backdrop', 'ready');
      expect(await page.evaluate(() => (window as Window & { menuReturnCheck?: boolean }).menuReturnCheck)).toBe(true);
      await title.getByRole('button', { name: 'Select level' }).click();
      await expect(page.locator('[data-flow-panel="levelSelect"]')).toBeVisible();
      await page.keyboard.press('Escape');
      if (number === 3) {
        // A later level disposed the original Containment runtime; the title
        // must create a new one that can play the story and return again.
        await title.getByRole('button', { name: 'Start trial' }).click();
        await finishOpening(page, false);
        await expect(page.locator('li[data-slime-id="bob"]')).toHaveAttribute('data-state', 'active');
        await page.keyboard.press('KeyP');
        await pause.getByRole('button', { name: 'Return to menu', exact: true }).click();
        await expect(title).toBeVisible({ timeout: 120_000 });
      }
      expect(errors).toEqual([]);
    }, { timeout: 300_000 });
  }
});
