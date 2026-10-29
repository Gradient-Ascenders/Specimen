import { exposeGame } from '../../helpers/GameRuntime.ts';
import {expect, test} from '@playwright/test';

for (const preset of ['normal', 'performance'] as const) {
  const entry = preset === 'performance' ? './?opening=mp4' : './';
  test(`standard ${preset} opening preparation keeps a complete transmission framebuffer${preset === 'performance' ? ' when the MP4 backup is omitted' : ''}`, { tag: '@extended' }, async ({page}) => {
    const errors: string[] = [];
    const movieRequests: string[] = [];
    page.on('request', request => { if (/\.mp4(?:\?|$)/.test(request.url())) movieRequests.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
    });
    await exposeGame(page, { runtime: '__openingGraphicsRuntime' });
    await page.goto(entry, {waitUntil:'domcontentloaded'});
    await expect(page.locator('[data-action="start"]')).toBeVisible({timeout:120_000});
    await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
    await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
    if (preset === 'performance') {
      await page.locator('[data-setting="graphics-preset"]').selectOption(preset);
      await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
    }
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await page.locator('[data-action="start"]').click();
    await expect(page.locator('#app')).toHaveAttribute('data-opening-state','playing',{timeout:180_000});
    await expect(page.locator('#app')).toHaveAttribute('data-opening-mode', 'live');
    await expect(page.locator('video')).toHaveCount(0);
    expect(movieRequests).toEqual([]);
    const graphics = await page.evaluate(() => {
      const renderer = (window as any).__openingGraphicsRuntime.renderLayer.renderer;
      return {error:renderer.getContext().getError(), scale:renderer.transmissionResolutionScale};
    });
    expect(graphics.scale).toBe(preset === 'performance' ? .5 : .75);
    expect(graphics.error).toBe(0);
    expect(errors).toEqual([]);
  });
}
