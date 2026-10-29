import { expect, test } from '@playwright/test';
import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';
import { assertPlaying, restartFromPause } from '../../helpers/ProductionJourney.ts';

test('production starts and restarts with Minimum graphics at a nested path', async ({ page, baseURL }) => {
  const failures = watchBrowserErrors(page, { webgl: true, requests: true, deploymentBase: baseURL! });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('Specimen');
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-title-backdrop', 'ready');
  // The default/Standard rendering journeys run nightly. Exercise the same
  // production lifecycle with bounded GPU work on each PR's software renderer.
  await title.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="graphics-profile"]').selectOption('minimum');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await title.locator('[data-action="start"]').click();
  await finishOpening(page);
  await assertPlaying(page);
  await expect(page.locator('#app')).not.toHaveAttribute('data-title-backdrop', /.+/);
  await page.keyboard.press('KeyW', { delay: 150 });
  await restartFromPause(page);
  expect(failures, 'Production console/network errors').toEqual([]);
});
