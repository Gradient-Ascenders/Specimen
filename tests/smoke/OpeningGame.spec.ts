import { expect, test } from '@playwright/test';

test('plain production plays Bob awakening while Level 1 loads, then hands off once ready', async ({ page }) => {
  test.setTimeout(360_000);
  const errors: string[] = [], stages = new Set<string>();
  let goopRequests = 0;
  let releaseGoop!: () => void;
  const goopGate = new Promise<void>(resolve => { releaseGoop = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  // Delay a real Level 1 asset, not runtime code, to exercise the readiness gate.
  await page.route(/\/goop-[^/]+\.glb$/, async route => {
    goopRequests++;
    await goopGate;
    await route.continue();
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const host = page.locator('#app'), flow = page.locator('.game-flow');
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  expect(goopRequests).toBe(0);
  await page.locator('[data-action="start"]').click();
  await expect(flow).toHaveAttribute('data-state', 'opening');
  await expect(page.locator('.opening-screen')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.opening-screen')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.game-hud')).toBeHidden();
  await expect(page.locator('[data-action="skip-opening"]')).toBeVisible();
  await page.keyboard.press('KeyP');
  await page.keyboard.press('F1');
  await expect(flow).toHaveAttribute('data-state', 'opening');
  await expect(host).not.toHaveAttribute('data-clean-gameplay');
  await expect.poll(() => goopRequests).toBeGreaterThan(0);
  // Capture the real staged sequence without skipping, seeking or replacing it.
  await expect.poll(async () => {
    const stage = await host.getAttribute('data-opening-stage');
    if (stage) stages.add(stage);
    return stage;
  }, { timeout: 180_000, intervals: [100, 200, 300] }).toBe('complete');
  expect([...stages]).toEqual(expect.arrayContaining(['laboratory', 'experiments', 'bob-door', 'entering',
    'cracking', 'falling', 'breaking', 'forming', 'complete']));
  await expect(flow).toHaveAttribute('data-state', 'opening');
  await expect(page.locator('[data-opening-status]')).toHaveText('Preparing Level 1…');
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height)).toBeLessThanOrEqual(1280 * 720);
  releaseGoop();
  await expect(flow).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  await expect(host).toHaveAttribute('data-level-one-prewarm', /roomStepsCompleted/);
  await expect(host).not.toHaveAttribute('data-opening-state');
  await expect(host).not.toHaveAttribute('data-title-backdrop');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.locator('[data-action="restart"]').click();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  await expect(host).not.toHaveAttribute('data-opening-stage');
  expect(errors).toEqual([]);
});
