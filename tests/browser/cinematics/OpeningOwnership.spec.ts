import { expect, test } from '../../helpers/BrowserFixtures.ts';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';

// Also runnable against the dev server via SPECIMEN_PRODUCTION_URL.
for (const query of ['', '?debug=1']) {
  test(`Start owns the opening and Escape skips safely ${query || 'ordinary entry'}`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`./${query}`, { waitUntil: 'domcontentloaded' });
    const flow = page.locator('.game-flow');
    await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
    await page.locator('[data-action="start"]').click();
    await expect(flow).toHaveAttribute('data-state', 'opening');
    await expect(page.locator('.opening-screen')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.opening-screen')).toHaveCSS('background-image', 'none');
    await expect(page.locator('.game-hud')).toBeHidden();
    await page.keyboard.press('Escape');
    await finishOpening(page, false);
    await expect(flow).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('#app')).toHaveAttribute('data-level-one-prewarm', /roomStepsCompleted/);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
