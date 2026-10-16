import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('hover and keyboard focus demonstrate each title ability and update its specimen panel', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  // Observe the real presentation and renderer, without adding shipped globals
  // or replacing the input, animation, geometry or material implementations.
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\((?!this\b)([A-Za-z_$][\w$]*)\.gelRendering\)/;
    expect(source).toMatch(pattern);
    await route.fulfill({ response, body: source.replace(pattern,
      '$1=globalThis.__titlePreview=new $2((globalThis.__titlePreviewLayer=$3).gelRendering)') });
  });
  const directory = resolve('artifacts/evidence/title-interactions');
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  const bob = page.locator('[data-title-specimen="bob"]');
  await expect(bob).toBeVisible();
  await page.evaluate(() => (window as any).__titlePreviewLayer.setAnimationLoop(null));
  const snapshot = () => page.evaluate(() => {
    const title = (window as any).__titlePreview, renderer = (window as any).__titlePreviewLayer.renderer;
    return { positions: title.specimens.map((specimen: any) => specimen.position.y),
      regions: title.specimenRegions.map((region: any) => ({ ...region })),
      visible: Object.fromEntries(Object.entries(title.previews.roots).map(([id, root]: any) => [id, root.visible])),
      blackout: title.blackoutAmount, voltLight: title.voltLight.intensity, ambient: title.ambient.intensity,
      programs: renderer.info.programs.length, ...renderer.info.memory };
  });
  const draw = (frames = 5) => page.evaluate(frames => {
    for (let frame = 0; frame < frames; frame++) {
      (window as any).__titlePreview.render((window as any).__titlePreviewLayer, 0.1);
    }
  }, frames);
  const capture = (name: string) => page.screenshot({ path: resolve(directory, `${name}.png`), animations: 'disabled' });
  const baseline = await snapshot();
  const caption = page.locator('.title-specimen-caption');

  await bob.hover();
  await expect(caption).toHaveAttribute('data-specimen', 'bob');
  await expect(caption).toContainText('Charged jump');
  await draw();
  const jump = await snapshot();
  expect(jump.positions[1]).toBeGreaterThan(baseline.positions[1] + 0.6);
  expect(jump.regions).toEqual(baseline.regions);
  await capture('bob-jump');

  await page.locator('[data-title-specimen="goop"]').hover();
  await expect(caption).toHaveAttribute('data-specimen', 'goop');
  await expect(caption).toContainText('Acid projectile');
  await draw(4);
  expect((await snapshot()).visible.goop).toBe(true);
  await capture('goop-acid');

  await page.locator('[data-title-specimen="volt"]').hover();
  await expect(caption).toHaveAttribute('data-specimen', 'volt');
  await expect(caption).toContainText('Light emission');
  await draw();
  expect((await snapshot()).visible.volt).toBe(true);
  await expect(page.locator('.game-flow')).toHaveClass(/is-title-blackout/);
  expect((await snapshot()).blackout).toBeGreaterThan(0.99);
  expect((await snapshot()).voltLight).toBeGreaterThan(11);
  expect((await snapshot()).ambient).toBeLessThan(0.02);
  await draw(30);
  expect((await snapshot()).blackout).toBeGreaterThan(0.99);
  await capture('volt-illumination');
  const active = await snapshot();
  expect(active.programs).toBe(baseline.programs);
  expect(active.geometries).toBe(baseline.geometries);
  expect(active.textures).toBe(baseline.textures);

  await page.mouse.move(10, 10);
  await expect(caption).not.toHaveAttribute('data-specimen');
  await expect(caption).toContainText('Specimen array / 03');
  await draw();
  expect((await snapshot()).blackout).toBeLessThan(0.01);
  await expect(page.locator('.game-flow')).not.toHaveClass(/is-title-blackout/);
  await capture('restored');
  await title.locator('[data-action="start"]').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-title-specimen="volt"]')).toBeFocused();
  await expect(caption).toHaveAttribute('data-specimen', 'volt');
  await title.locator('[data-action="settings"]').click();
  expect(Object.values((await snapshot()).visible)).toEqual([false, false, false]);
  expect((await snapshot()).blackout).toBe(0);
  await page.keyboard.press('Escape');
  await expect(caption).not.toHaveAttribute('data-specimen');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-title-specimen="bob"]').focus();
  await draw();
  const reduced = await snapshot();
  expect(reduced.positions[1]).toBeGreaterThan(baseline.positions[1]);
  expect(reduced.positions[1]).toBeLessThan(baseline.positions[1] + 0.3);
  await title.locator('[data-action="start"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  expect(errors).toEqual([]);
});
