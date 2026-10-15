import { expect, test } from '@playwright/test';

test('optional LOD failures preserve Level 1 startup and Cultivation/Blackout preparation', async ({ page }) => {
  const failures: string[] = [];
  const detailRequests = { goop: 0, volt: 0 };
  const characterAssets = new Set<string>();
  const isDetail = (url: string) => /\/(goop|volt)-lod-[^/?]+\.bin(?:\?|$)/.test(url);
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    // The injected HTTP failure has an expected browser network diagnostic.
    if (isDetail(message.location().url) && message.text().startsWith('Failed to load resource:')) return;
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) failures.push(message.text());
  });
  page.on('requestfailed', request => failures.push(`Failed request: ${request.url()}`));
  page.on('response', response => {
    if (response.status() >= 400 && !isDetail(response.url())) failures.push(`HTTP ${response.status()}: ${response.url()}`);
    const character = /\/(goop|volt)-[^/]+\.glb$/.exec(new URL(response.url()).pathname)?.[1];
    if (character && response.ok()) characterAssets.add(character);
  });
  // Exercise the shipped loaders and preparation paths, without replacing
  // any GLB, runtime or renderer. Only the optional LOD responses are broken.
  await page.route(/\/(goop|volt)-lod-[^/?]+\.bin(?:\?|$)/, async route => {
    const character = route.request().url().includes('/goop-lod-') ? 'goop' : 'volt';
    detailRequests[character]++;
    await route.fulfill({ status: character === 'goop' ? 503 : 200,
      contentType: 'application/octet-stream', body: 'invalid optional detail bank' });
  });
  const assertPlaying = async () => {
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing', { timeout: 120_000 });
    await expect(page.locator('#app')).toHaveAttribute('data-game-state', 'playing');
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  };
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title.locator('[data-action="start"]')).toBeVisible({ timeout: 120_000 });
  expect(detailRequests.goop).toBeGreaterThan(0);
  expect(detailRequests.volt).toBe(0);
  expect(characterAssets.has('goop')).toBe(true);
  await title.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await title.locator('[data-action="start"]').click();
  await assertPlaying();
  for (const level of [2, 3]) {
    const previous = { ...detailRequests };
    await page.keyboard.press('Digit0', { delay: 100 });
    const enter = page.locator('[data-action="enter-level"]');
    await expect(enter).toBeVisible({ timeout: 120_000 });
    await expect(enter).toContainText(`Enter Level ${level}`);
    await enter.click();
    await assertPlaying();
    expect(detailRequests.goop).toBeGreaterThan(previous.goop);
    expect(detailRequests.volt).toBeGreaterThan(previous.volt);
    expect([...characterAssets].sort()).toEqual(['goop', 'volt']);
  }
  await page.keyboard.press('KeyP');
  await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
  await assertPlaying();
  expect(failures).toEqual([]);
});
