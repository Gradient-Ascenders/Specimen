import { mkdir } from 'node:fs/promises';
import { test, expect } from '../../helpers/MenuFixtures.ts';

test('level selector supports keyboard navigation, cancel, and compact screens', async ({ menuPage: page, menuRequests }) => {
  const previewRequests = () => menuRequests.filter(url => url.includes('/assets/ui/level-previews/'));
  const title = page.locator('[data-flow-panel="title"]');
  const selector = page.locator('[data-flow-panel="levelSelect"]');
  const button = title.getByRole('button', { name: 'Select level' });
  await expect(button).toBeVisible({ timeout: 120_000 });
  expect(previewRequests()).toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(0);
  await mkdir('artifacts/evidence/level-selector', { recursive: true });
  await page.screenshot({ path: 'artifacts/evidence/level-selector/main-menu.png' });
  await button.click();
  await expect(selector.getByRole('button', { name: 'Level 1 Containment' })).toBeFocused();
  await expect.poll(() => previewRequests().length).toBe(3);
  await expect.poll(() => selector.locator('img[data-level-preview]').evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(selector.getByRole('button', { name: 'Level 2 Cultivation' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await expect(selector.getByRole('button', { name: 'Level 2 Cultivation' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  await button.click();
  await page.screenshot({ path: 'artifacts/evidence/level-selector/compact.png' });
  const panel = await selector.locator('.level-select-panel').boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(360);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'artifacts/evidence/level-selector/desktop.png' });
  await selector.getByRole('button', { name: 'Back' }).click();
  await expect(button).toBeFocused();
});
