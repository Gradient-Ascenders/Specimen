import {expect, test} from '@playwright/test';

for (const preset of ['normal', 'performance'] as const) {
  test(`standard ${preset} opening preparation keeps a complete transmission framebuffer`, async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
    });
    await page.route('**/assets/index-*.js', async route => {
      const response = await route.fetch(), source = await response.text();
      const pattern = /\{initialRuntime:([\w$]+)/;
      expect(source).toMatch(pattern);
      await route.fulfill({response, body: source.replace(pattern,
        '{initialRuntime:globalThis.__openingGraphicsRuntime=$1')});
    });
    await page.goto('./', {waitUntil:'domcontentloaded'});
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
    const graphics = await page.evaluate(() => {
      const renderer = (window as any).__openingGraphicsRuntime.renderLayer.renderer;
      return {error:renderer.getContext().getError(), scale:renderer.transmissionResolutionScale};
    });
    expect(graphics.scale).toBe(preset === 'performance' ? .5 : .75);
    expect(graphics.error).toBe(0);
    expect(errors).toEqual([]);
  });
}
