import { expect, test } from './fixtures.ts';
import { TITLE_PIXEL_BUDGET } from '../../src/ui/TitleScreenPresentation.ts';

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });

for (const query of ['', '?debug=1']) {
  test(`egg-room title, bounded resizing and gameplay handoff ${query || 'plain entry'}`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) failures.push(message.text());
    });
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(`./${query}`, { waitUntil: 'domcontentloaded' });
    const host = page.locator('#app'), title = page.locator('[data-flow-panel="title"]');
    await expect(title).toBeVisible({ timeout: 180_000 });
    await expect(title).not.toContainText(/Live observation|Containment chamber|Incubation active|Containment\s*·\s*Trial|Press any key/i);
    await expect(title.locator('.menu-index')).toHaveCount(0);
    await expect(title.getByRole('navigation', { name: 'Main menu' }).getByRole('button')).toHaveCount(3);
    await expect(host).toHaveAttribute('data-title-backdrop', 'ready');
    await expect(host).toHaveAttribute('data-title-motion', 'orbiting');
    await expect(page.locator('canvas')).toHaveCount(1);
    for (const viewport of [{ width: 3840, height: 2160 }, { width: 1366, height: 768 },
      { width: 320, height: 900 }, { width: 320, height: 568 }, { width: 844, height: 390 },
      { width: 916, height: 960 }, { width: 960, height: 540 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) =>
        canvas.width * canvas.height)).toBeLessThanOrEqual(TITLE_PIXEL_BUDGET);
      if (viewport.width * viewport.height <= TITLE_PIXEL_BUDGET) {
        await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) =>
          [canvas.width, canvas.height])).toEqual([viewport.width, viewport.height]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(title.getByRole('heading', { name: 'Specimen', exact: true })).toBeInViewport({ ratio: 1 });
      for (const action of ['start', 'settings', 'credits']) {
        await expect(title.locator(`[data-action="${action}"]`)).toBeInViewport({ ratio: 1 });
      }
      if (viewport.width >= 1366) {
        expect(await title.locator('h1').evaluate(heading => parseFloat(getComputedStyle(heading).fontSize)))
          .toBeGreaterThanOrEqual(60);
      }
    }
    await page.screenshot({ path: testInfo.outputPath('egg-room-title.png') });
    await title.locator('[data-action="settings"]').click();
    const settings = page.locator('[data-flow-panel="settings"]');
    await settings.locator('[data-setting="graphics-profile"]').selectOption('standard');
    await settings.locator('[data-setting="render-resolution"]').selectOption('1.5');
    await expect(host).toHaveAttribute('data-title-backdrop', 'ready');
    expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height))
      .toBeLessThanOrEqual(TITLE_PIXEL_BUDGET);
    await settings.locator('[data-action="back"]').click();
    await title.locator('[data-action="start"]').click();
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
    await expect(host).not.toHaveAttribute('data-title-backdrop', /.+/);
    await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]))
      .toEqual([1440, 810]);
    await page.keyboard.press('KeyP');
    await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
    await expect(host).not.toHaveAttribute('data-title-backdrop', /.+/);
    expect(failures).toEqual([]);
  });
}

test('reduced-motion title stays still and responds to a live preference change', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('[data-flow-panel="title"]')).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-title-motion', 'still');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#app')).toHaveAttribute('data-title-motion', 'orbiting');
});
