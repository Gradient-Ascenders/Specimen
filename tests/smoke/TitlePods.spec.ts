import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('title previews Goop, Bob and Volt in matching pods without unlocking the gameplay roster', async ({ page }) => {
  const errors: string[] = [];
  const models = new Set<string>();
  let voltDetailRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/\/volt-lod-[^/]+\.bin$/.test(request.url())) voltDetailRequests++; });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    const model = /\/(bob-authored|goop|volt)-[^/]+\.glb$/.exec(new URL(response.url()).pathname)?.[1];
    if (model && response.ok()) models.add(model);
  });
  const directory = resolve('artifacts/evidence/title-pods');
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  expect([...models].sort()).toEqual(['bob-authored', 'goop', 'volt']);
  expect(voltDetailRequests).toBe(0);
  await expect(title.locator('.title-specimen-caption')).toContainText('Goop · Bob · Volt');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 375, height: 900 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: resolve(directory, `title-${viewport.width}x${viewport.height}.png`), animations: 'disabled' });
    await expect(title.locator('[data-action="start"]')).toBeInViewport({ ratio: 1 });
  }
  await title.locator('[data-action="start"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.game-hud [data-slime-id="bob"]')).toHaveAttribute('data-state', 'active');
  await expect(page.locator('.game-hud [data-slime-id="volt"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
