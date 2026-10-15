import { expect, test } from './fixtures.ts';

test.use({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1.25 });

for (const query of ['', '?debug=1']) {
  test(`graphics presets restore Normal pixels and survive play/pause ${query || 'production'}`, async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.route('**/assets/index-*.js', async route => {
      const response = await route.fetch(), source = await response.text();
      const pattern = /([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/;
      expect(source).toMatch(pattern);
      await route.fulfill({ response, body: source.replace(pattern,
        '(globalThis.__graphicsRuntime=$1,$1.prepareLightingPrograms()).then(') });
    });
    await page.goto(`/${query}`, { waitUntil: 'domcontentloaded' });
    const title = page.locator('[data-flow-panel="title"]');
    await expect(title).toBeVisible({ timeout: 180_000 });
    await title.locator('[data-action="settings"]').click();
    const preset = page.locator('[data-setting="graphics-preset"]');
    const resolution = page.locator('[data-setting="render-resolution"]');
    const gel = page.locator('[data-setting="gel-rendering"]');
    await expect(preset).toHaveValue('normal');
    await expect(gel).toHaveValue('physical');
    await resolution.selectOption('1.5');
    const sample = () => page.evaluate(() => {
      const r = (window as any).__graphicsRuntime, layer = r.renderLayer, renderer = layer.renderer;
      layer.render();
      const gl = renderer.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const reference: Uint8Array = r.__graphicsPixels ??= pixels;
      let difference = 0, lit = 0, minimum = 255, maximum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 32) lit++;
        for (let c = 0; c < 3; c++) {
          minimum = Math.min(minimum, pixels[i + c]); maximum = Math.max(maximum, pixels[i + c]);
          if (pixels.length === reference.length) difference = Math.max(difference, Math.abs(pixels[i + c] - reference[i + c]));
        }
      }
      const materials: Record<string, unknown> = {};
      layer.scene.traverse((object: any) => {
        for (const m of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
          materials[m.uuid] = [m.transmission, m.opacity, m.transparent, m.roughness];
        }
      });
      return { difference, lit, range: maximum - minimum, materials, scale: renderer.transmissionResolutionScale,
        buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], programs: renderer.info.programs.length, error: gl.getError() };
    });
    const normal = await sample();
    expect(normal.buffer).toEqual([1200, 750]);
    expect(normal.scale).toBe(1);
    expect(normal.lit).toBeGreaterThan(1200 * 750 * 0.01);
    expect(normal.range).toBeGreaterThan(32);
    await preset.selectOption('performance');
    await gel.selectOption('reduced-transmission');
    expect((await sample()).scale).toBe(0.5);
    await gel.selectOption('physical');
    expect((await sample()).scale).toBe(0.5);
    await expect(resolution).toBeEnabled();
    await expect(resolution.locator('option[value="1.5"]')).toBeDisabled();
    await expect(resolution).toHaveValue('1');
    const performance = await sample();
    expect(performance.buffer).toEqual([960, 600]);
    expect(performance.scale).toBe(0.5);
    expect(performance.programs).toBe(normal.programs);
    expect(performance.materials).toEqual(normal.materials);
    await preset.selectOption('normal');
    await expect(resolution).toBeEnabled();
    await expect(resolution).toHaveValue('1.5');
    const restored = await sample();
    expect(restored.buffer).toEqual(normal.buffer);
    expect(restored.programs).toBe(normal.programs);
    expect(restored.difference, 'Normal output after restoring the preset').toBeLessThanOrEqual(1);
    expect([normal.error, performance.error, restored.error]).toEqual([0, 0, 0]);
    await preset.selectOption('performance');
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await title.locator('[data-action="start"]').click();
    await page.locator('canvas').click();
    await page.keyboard.press('KeyW', { delay: 250 });
    await page.keyboard.press('Space', { delay: 150 });
    await page.keyboard.press('F1');
    await expect(page.locator('#app')).toHaveAttribute('data-clean-gameplay', 'true');
    await expect(page.locator('.game-hud')).toBeHidden();
    const position = () => page.evaluate(() => ({ ...(window as any).__graphicsRuntime.resources.slimeManager.activeBody.position }));
    const beforeMovement = await position();
    await page.keyboard.down('KeyW');
    await page.keyboard.press('F1');
    await expect(page.locator('.game-hud')).toBeVisible();
    await page.keyboard.press('F1');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyW');
    expect(await position()).not.toEqual(beforeMovement);
    await expect(page.locator('.game-hud')).toBeHidden();
    await page.keyboard.press('KeyP');
    await expect(page.locator('#app')).not.toHaveAttribute('data-clean-gameplay');
    await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
    await expect(preset).toHaveValue('performance');
    await resolution.selectOption('0.75');
    const low = await sample();
    expect(low.buffer).toEqual([720, 450]);
    expect(low.scale).toBe(0.5);
    expect(low.programs).toBe(normal.programs);
    await page.setViewportSize({ width: 880, height: 550 });
    expect((await sample()).buffer).toEqual([660, 412]);
    await preset.selectOption('normal');
    await expect(resolution).toHaveValue('0.75');
    await resolution.selectOption('1.5');
    expect((await sample()).buffer).toEqual([1100, 687]);
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
    await expect(page.locator('#app')).toHaveAttribute('data-clean-gameplay', 'true');
    await expect(page.locator('.game-hud')).toBeHidden();
    const cleanNormal = await sample();
    expect(cleanNormal.scale).toBe(1);
    expect(cleanNormal.programs).toBe(normal.programs);
    expect(cleanNormal.error).toBe(0);
    await page.keyboard.press('F1');
    await expect(page.locator('.game-hud')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
