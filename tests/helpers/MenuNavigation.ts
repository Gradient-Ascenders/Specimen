import type { Page } from '@playwright/test';

export async function openAdvancedGraphics(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Graphics', exact: true }).click();
  const advanced = page.locator('.settings-advanced');
  if (await advanced.getAttribute('open') === null) {
    await advanced.locator(':scope > summary').click();
  }
}

export async function confirmRestart(page: Page): Promise<void> {
  await page.locator('[data-action="confirm-restart"]').click();
}
