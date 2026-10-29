import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test('opt-in production MP4 backup plays the whole intro while Level 1 finishes its full GPU warm-up', { tag: '@opening-backup' }, async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  let movieRequests = 0, goopRequests = 0;
  page.on('request', request => {
    if (/\/opening-[^/]+\.mp4$/.test(request.url())) movieRequests++;
    if (/\/goop-[^/]+\.glb$/.test(request.url())) goopRequests++;
  });
  await page.addInitScript(() => {
    const probe = { canvasClearsDuringVideo: 0, readyAt: -1, readyDuration: 0,
      totalFrames: 0, droppedFrames: 0, stages: [] as string[] };
    (window as any).__movieProbe = probe;
    // Capture before the presentation's target listener releases the decoder.
    document.addEventListener('ended', event => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      const quality = event.target.getVideoPlaybackQuality();
      probe.totalFrames = quality.totalVideoFrames; probe.droppedFrames = quality.droppedVideoFrames;
    }, true);
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function(mask: number) {
      const host = document.querySelector('#app');
      if (host?.getAttribute('data-opening-mode') === 'video' &&
        host?.getAttribute('data-opening-state') === 'playing' &&
        this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) === null) probe.canvasClearsDuringVideo++;
      return clear.call(this, mask);
    };
    document.addEventListener('DOMContentLoaded', () => {
      const host = document.querySelector('#app')!;
      new MutationObserver(() => {
        const stage = host.getAttribute('data-opening-stage');
        if (stage && !probe.stages.includes(stage)) probe.stages.push(stage);
        const video = document.querySelector<HTMLVideoElement>('.opening-video');
        if (host.hasAttribute('data-level-one-prewarm') && video && probe.readyAt < 0) {
          probe.readyAt = video.currentTime; probe.readyDuration = video.duration;
        }
        if (video) {
          const quality = video.getVideoPlaybackQuality();
          probe.totalFrames = quality.totalVideoFrames; probe.droppedFrames = quality.droppedVideoFrames;
        }
      }).observe(host, { attributes: true, attributeFilter: ['data-opening-stage', 'data-level-one-prewarm'] });
    });
  });
  await page.goto('./?opening=mp4', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  expect(movieRequests).toBe(0);
  await page.locator('[data-action="start"]').click();
  const flow = page.locator('.game-flow'), host = page.locator('#app'), video = page.locator('video.opening-video');
  await expect(host).toHaveAttribute('data-opening-mode', 'video');
  await expect(host).toHaveAttribute('data-opening-state', 'playing', { timeout: 60_000 });
  const media = await video.evaluate((element: HTMLVideoElement) => ({
    width: element.videoWidth, height: element.videoHeight, duration: element.duration,
    muted: element.muted, controls: element.controls, src: element.currentSrc,
  }));
  expect(media).toMatchObject({ width: 1920, height: 1080, muted: true, controls: false });
  expect(media.duration).toBeCloseTo(53.233333, 2);
  expect(new URL(media.src).pathname).toMatch(/^\/group-folder\/assets\/opening-[^/]+\.mp4$/);
  const range = await page.request.get(media.src, { headers: { Range: 'bytes=0-15' } });
  expect(range.status()).toBe(206);
  expect(range.headers()['content-type']).toBe('video/mp4');
  expect(range.headers()['content-range']).toMatch(/^bytes 0-15\/\d+$/);
  expect((await range.body()).length).toBe(16);
  await expect(page.locator('.game-hud')).toBeHidden();
  await page.keyboard.press('KeyP'); await page.keyboard.press('F1');
  await expect(flow).toHaveAttribute('data-state', 'opening');
  await expect(host).not.toHaveAttribute('data-clean-gameplay');
  await expect(host).toHaveAttribute('data-opening-stage', 'experiments', { timeout: 60_000 });
  await page.screenshot({ path: test.info().outputPath('native-opening-laboratory.png') });
  // A real, unaccelerated full movie. Gameplay must be ready while it plays,
  // but readiness must not prematurely finish the film.
  await expect(host).toHaveAttribute('data-level-one-prewarm', /roomStepsCompleted/, { timeout: 180_000 });
  expect(JSON.parse((await host.getAttribute('data-level-one-prewarm'))!)).toMatchObject({
    roomStepsCompleted: 9, measuredResourceCount: 23, measuredProgramDelta: 0, burstProgramDelta: 0,
  });
  await expect(flow).toHaveAttribute('data-state', 'opening');
  await expect(host).toHaveAttribute('data-opening-stage', 'forming', { timeout: 120_000 });
  await page.screenshot({ path: test.info().outputPath('native-opening-bob.png') });
  await expect(flow).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  await expect(video).toHaveCount(0);
  const probe = await page.evaluate(() => (window as any).__movieProbe);
  console.log('Native opening playback/preparation:', JSON.stringify(probe));
  expect(probe.readyAt).toBeGreaterThan(0);
  expect(probe.readyAt).toBeLessThan(probe.readyDuration - 1);
  expect(probe.canvasClearsDuringVideo).toBe(0, 'The visible cinematic must not use WebGL/video textures.');
  expect(probe.totalFrames).toBeGreaterThan(1500);
  expect(probe.stages).toEqual(expect.arrayContaining(['experiments', 'bob-door', 'entering', 'cracking', 'falling', 'breaking', 'forming']));
  expect(goopRequests).toBe(1);
  expect(movieRequests).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('KeyP');
  await page.locator('[data-action="restart"]').click();
  await expect(flow).toHaveAttribute('data-state', 'playing');
  await expect(host).not.toHaveAttribute('data-opening-mode');
  expect(errors).toEqual([]);
});

test('MP4 ending holds black for a delayed real Level 1 asset, then hands off without downloading twice', { tag: '@opening-backup' }, async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  let requests = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/goop-[^/]+\.glb$/, async route => { requests++; await gate; await route.continue(); });
  await page.goto('./?opening=mp4', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-opening-state', 'playing', { timeout: 60_000 });
  await expect.poll(() => requests).toBe(1);
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(1);
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = video.duration - .1; });
  await expect(page.locator('#app')).toHaveAttribute('data-opening-state', 'waiting');
  await expect(page.locator('.opening-fade')).toHaveCSS('opacity', '1');
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'opening');
  await expect(page.locator('[data-opening-status]')).toHaveText('Preparing Level 1…');
  release();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  expect(requests).toBe(1); expect(errors).toEqual([]);
});

test('a failed video can retry native playback or Skip to the same prepared level', { tag: '@opening-backup' }, async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  let invalid = true;
  await page.route(/\/opening-[^/]+\.mp4$/, async route => {
    if (invalid) await route.fulfill({ contentType: 'video/mp4', body: 'invalid-video' });
    else await route.continue();
  });
  await page.goto('./?opening=mp4', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-opening-state', 'failed', { timeout: 60_000 });
  invalid = false;
  await page.locator('[data-action="retry-opening"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-opening-state', 'playing', { timeout: 60_000 });
  await page.locator('[data-action="skip-opening"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 180_000 });
  await expect(page.locator('video')).toHaveCount(0);
  expect(errors).toEqual([]);
});
