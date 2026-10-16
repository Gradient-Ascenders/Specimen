import { expect, test } from '@playwright/test';

test('immediate opening Skip completes full preparation once without duplicate Goop downloads', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  let goopRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  page.on('request', request => { if (/\/goop-[^/]+\.glb$/.test(request.url())) goopRequests++; });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-opening-mode', 'live');
  await expect(page.locator('video')).toHaveCount(0);
  await page.locator('[data-action="skip-opening"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 120_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-level-one-prewarm', /roomStepsCompleted/);
  await expect(page.locator('#app')).not.toHaveAttribute('data-opening-state');
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(goopRequests).toBe(1);
  expect(errors).toEqual([]);
});

test('default live opening does only light asset preparation and cannot run Level 1 GPU warm-up', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  let goopDownloads = 0, movieRequests = 0;
  page.on('request', request => { if (/\/opening-[^/]+\.mp4$/.test(request.url())) movieRequests++; });
  page.on('requestfinished', request => { if (/\/goop-[^/]+\.glb$/.test(request.url())) goopDownloads++; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    const probe = { canvasFrames: 0, hiddenCanvasClears: 0, exposedHiddenClears: 0,
      warmupDrawsAfterReveal: 0, uncoveredPreparationFrames: 0 };
    (window as any).__openingClearProbe = probe;
    const original = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function(mask: number) {
      const stage = document.querySelector('#app')?.getAttribute('data-opening-stage');
      const viewport = this.getParameter(this.VIEWPORT) as Int32Array;
      if ((stage === 'laboratory' || stage === 'experiments') &&
        (viewport[0] < 0 || viewport[1] < 0 || viewport[2] <= 1 || viewport[3] <= 1)) probe.warmupDrawsAfterReveal++;
      if (document.querySelector('#app')?.hasAttribute('data-opening-state') &&
        this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) === null) {
        if (document.querySelector('#app')?.getAttribute('data-opening-state') === 'preparing') {
          const fade = document.querySelector('.opening-fade');
          if (!fade || getComputedStyle(fade).opacity !== '1') probe.uncoveredPreparationFrames++;
        }
        const scissor = this.getParameter(this.SCISSOR_BOX) as Int32Array;
        if (viewport[0] < 0 || viewport[1] < 0 || viewport[2] <= 1 || viewport[3] <= 1 || scissor[0] < 0 || scissor[1] < 0) {
          probe.hiddenCanvasClears++;
          if (!this.isEnabled(this.SCISSOR_TEST) ||
            (scissor[0] < this.drawingBufferWidth && scissor[1] < this.drawingBufferHeight &&
              scissor[0] + scissor[2] > 0 && scissor[1] + scissor[3] > 0)) probe.exposedHiddenClears++;
        } else probe.canvasFrames++;
      }
      return original.call(this, mask);
    };
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-opening-mode', 'live');
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('#app')).toHaveAttribute('data-opening-stage', 'experiments', { timeout: 120_000 });
  // Small downloads/idle index data are allowed, but no Level 1 GPU work starts.
  await expect.poll(() => goopDownloads).toBe(1);
  // Continue beyond the first label close-up, not just the start of its pan.
  await expect.poll(() => page.evaluate(() => (window as any).__openingClearProbe.canvasFrames),
    { timeout: 15_000 }).toBeGreaterThan(160);
  await expect(page.locator('#app')).not.toHaveAttribute('data-level-one-prewarm');
  const probe = await page.evaluate(() => (window as any).__openingClearProbe);
  expect(probe.canvasFrames).toBeGreaterThan(0);
  expect(probe.hiddenCanvasClears, 'all background draws need a dedicated framebuffer, not default-canvas clipping').toBe(0);
  expect(probe.exposedHiddenClears, 'preparation must not clear any visible canvas pixels').toBe(0);
  expect(probe.warmupDrawsAfterReveal, 'cold Level 1 jobs cannot interrupt the first door pan').toBe(0);
  expect(probe.uncoveredPreparationFrames, 'the real first-view prime must stay behind the fully opaque initial fade').toBe(0);
  expect(movieRequests, 'Default playback must not even download the MP4 backup').toBe(0);
  expect(errors).toEqual([]);
});

test('default live opening streams bytes during the awakening and finishes Level 1 under the final fade', async ({ page }, info) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
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
  await expect(host).toHaveAttribute('data-opening-mode', 'live');
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('.opening-screen')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.opening-screen')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.game-hud')).toBeHidden();
  await expect(page.locator('[data-action="skip-opening"]')).toBeVisible();
  await page.keyboard.press('KeyP');
  await page.keyboard.press('F1');
  await expect(flow).toHaveAttribute('data-state', 'opening');
  await expect(host).not.toHaveAttribute('data-clean-gameplay');
  await expect.poll(() => goopRequests).toBeGreaterThan(0);
  await page.evaluate(() => {
    const host = document.querySelector('#app')!;
    const stages = (window as any).__openingStages = new Set<string>();
    new MutationObserver(records => {
      for (const record of records) if (record.oldValue) stages.add(record.oldValue);
      const stage = host.getAttribute('data-opening-stage');
      if (stage) stages.add(stage);
    }).observe(host, { attributes: true, attributeFilter: ['data-opening-stage'], attributeOldValue: true });
  });
  const capturedStages = new Set<string>();
  const captureStage = async () => {
    const stage = await host.getAttribute('data-opening-stage');
    if (stage && !capturedStages.has(stage) &&
      ['laboratory', 'experiments', 'cracking', 'forming', 'complete'].includes(stage)) {
      capturedStages.add(stage);
      await page.screenshot({ path: info.outputPath(`opening-${stage}.png`) });
    }
    return stage;
  };
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height)).toBeLessThanOrEqual(1280 * 720);
  await expect.poll(captureStage, { timeout: 180_000, intervals: [100, 200, 300] }).toBe('experiments');
  await expect(host).toHaveAttribute('data-opening-state', 'playing');
  await expect(host).not.toHaveAttribute('data-level-one-prewarm');
  // Capture the real staged sequence without skipping, seeking or replacing it.
  // Keep the download delayed for the entire movie: it must not hold the tour.
  await expect.poll(captureStage, { timeout: 180_000, intervals: [100, 200, 300] }).toBe('complete');
  await expect(host).toHaveAttribute('data-opening-state', 'waiting');
  await expect(flow).toHaveAttribute('data-state', 'opening');
  await expect(page.locator('.opening-fade')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-opening-status]')).toHaveText('Preparing Level 1…');
  expect(goopRequests).toBe(1);
  releaseGoop();
  await expect(flow).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  expect(goopRequests, 'The real level must reuse its speculative download for both Goop instances').toBe(1);
  const stages = await page.evaluate(() => [...(window as any).__openingStages]);
  expect(stages).toEqual(expect.arrayContaining(['laboratory', 'experiments', 'bob-door', 'entering',
    'cracking', 'falling', 'breaking', 'forming', 'complete']));
  await expect(host).toHaveAttribute('data-level-one-prewarm', /roomStepsCompleted/);
  await expect(host).not.toHaveAttribute('data-opening-state');
  await expect(host).not.toHaveAttribute('data-opening-mode');
  await expect(host).not.toHaveAttribute('data-title-backdrop');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('opening-gameplay-handoff.png') });
  await page.keyboard.press('KeyP');
  await expect(page.locator('[data-flow-panel="paused"]')).toBeVisible();
  await page.locator('[data-action="restart"]').click();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  await expect(host).not.toHaveAttribute('data-opening-stage');
  expect(errors).toEqual([]);
});
