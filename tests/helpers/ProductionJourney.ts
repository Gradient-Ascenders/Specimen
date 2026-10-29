import { expect, type Page } from '@playwright/test';

export const assertPlaying = async (page: Page): Promise<void> => {
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#app')).toHaveAttribute('data-game-state', 'playing');
  await expect(page.locator('canvas')).toHaveCount(1);
  // Ensure the new level has presented frames before taking a checkpoint.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

export const restartFromPause = async (page: Page): Promise<void> => {
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
