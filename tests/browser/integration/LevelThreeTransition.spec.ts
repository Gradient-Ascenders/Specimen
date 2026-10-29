import { expect, test } from '@playwright/test';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';

test('Cultivation completion prepares Blackout, supports restart and returns to menu', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchBrowserErrors(page, { webgl: true });
  const duplicateThree: string[] = [];
  page.on('console', message => {
    if (/Multiple instances of Three.js/.test(message.text())) duplicateThree.push(message.text());
  });
  await exposeGame(page, { session: '__levelThreeSession' });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 180_000 });
  await title.getByRole('button', { name: 'Select level' }).click();
  await page.getByRole('button', { name: 'Level 2 Cultivation', exact: true }).click();
  await page.getByRole('button', { name: 'Enter Level 2', exact: true }).click({ timeout: 240_000 });
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  // Exercise the real coordinator completion subscription and progression
  // capture without replaying the whole Cultivation puzzle/cinematic journey.
  await page.evaluate(() => {
    const runtime = (window as any).__levelThreeSession.runtime;
    const resources = runtime.resources;
    // The normal Level 2 finale earns Volt before emitting completion.
    resources.manager.registerBody('volt', resources.voltBody);
    resources.manager.unlock('volt');
    runtime.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
  });
  await page.getByRole('button', { name: 'Enter Level 3', exact: true }).click({ timeout: 300_000 });
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => (window as any).__levelThreeSession.restartLevel());
  await page.waitForFunction(() => {
    const runtime = (window as any).__levelThreeSession.runtime;
    return runtime.input.enabled && !runtime.resources.ventArrival?.active;
  }, null, { timeout: 180_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('blackout-after-restart.png') });
  await page.keyboard.press('KeyP');
  await page.locator('[data-flow-panel="paused"]').getByRole('button', { name: 'Return to menu', exact: true }).click();
  await expect(title).toBeVisible({ timeout: 180_000 });
  expect(errors).toEqual([]);
  expect(duplicateThree).toEqual([]);
});
