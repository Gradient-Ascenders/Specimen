import { expect, type Page } from '@playwright/test';

/** Existing gameplay tests skip the real intro, but still await real Level 1 preparation. */
export async function finishOpening(page: Page, capturePointer = true): Promise<void> {
  const flow = page.locator('.game-flow');
  await expect(flow).toHaveAttribute('data-state', /^(opening|playing)$/, { timeout: 180_000 });
  if (await flow.getAttribute('data-state') === 'opening') {
    await page.locator('[data-action="skip-opening"]').click();
    await expect(flow).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  }
  // Automatic/early-skipped completion has no fresh user activation. The real
  // canvas click is the normal game's supported pointer-lock acquisition path.
  if (capturePointer) await page.locator('canvas[data-gameplay-canvas]').click();
}
