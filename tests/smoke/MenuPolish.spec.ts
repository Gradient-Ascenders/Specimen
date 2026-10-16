import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { confirmRestart, openAdvancedGraphics } from '../helpers/MenuNavigation.ts';

test('menus retain readable layouts, keyboard navigation, settings and deliberate restarts', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  const titleCharacters = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('response', response => {
    const character = /\/(bob-authored|goop|volt)-[^/]+\.glb$/.exec(new URL(response.url()).pathname)?.[1];
    if (character && response.ok()) titleCharacters.add(character);
  });
  const directory = resolve('artifacts/evidence/menu-polish');
  await mkdir(directory, { recursive: true });
  const capture = (name: string) => page.screenshot({ path: resolve(directory, name), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const title = page.locator('[data-flow-panel="title"]');
  const settings = page.locator('[data-flow-panel="settings"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  // Global shortcuts and delegated menu listeners must tolerate non-element
  // targets, including the Window-dispatched keys used by gameplay controls.
  await page.evaluate(() => {
    const flow = document.querySelector('.game-flow')!;
    const text = document.createTextNode('');
    flow.append(text);
    for (const target of [window, document, text]) {
      target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
      target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    flow.querySelector('[data-action="start"]')!.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, relatedTarget: window }));
    text.remove();
  });
  expect(errors).toEqual([]);
  expect([...titleCharacters].sort()).toEqual(['bob-authored', 'goop', 'volt']);
  const canvasSize = () => page.locator('canvas').evaluate(canvas => [canvas.width, canvas.height]);
  await expect.poll(canvasSize).toEqual([1440, 900]);
  await capture('title-desktop.png');
  await title.locator('[data-action="settings"]').click();
  const controls = page.getByRole('tab', { name: 'Controls', exact: true });
  await expect(controls).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Audio', exact: true })).toBeFocused();
  await expect(page.locator('#settings-audio')).toBeVisible();
  await page.locator('[data-setting="volume"]').fill('65');
  await page.keyboard.press('Tab');
  await openAdvancedGraphics(page);
  await expect(page.locator('[data-graphics-diagnostics]')).toBeHidden();
  await page.locator('[data-setting="render-scale"]').selectOption('0.5');
  await page.locator('.graphics-diagnostics > summary').click();
  await expect(page.locator('[data-graphics-diagnostics]')).not.toBeEmpty();
  await capture('settings-desktop.png');

  for (const viewport of [{ width: 320, height: 900 }, { width: 640, height: 360 }, { width: 375, height: 667 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.locator('.settings-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const back = settings.locator('[data-action="back"]');
    await expect(back).toBeInViewport({ ratio: 1 });
    expect(await settings.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const density = page.locator('[data-setting="render-resolution"]');
    expect(await density.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await capture(`settings-${viewport.width}x${viewport.height}.png`);
    await back.click();
    await expect(title.locator('[data-action="settings"]')).toBeFocused();
    await expect(title.locator('[data-action="start"]')).toBeInViewport({ ratio: 1 });
    expect(await title.locator('.title-composition').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await capture(`title-${viewport.width}x${viewport.height}.png`);
    await title.locator('[data-action="credits"]').click();
    const credits = page.locator('[data-flow-panel="credits"]');
    await expect(credits.locator('[data-action="back"]')).toBeInViewport({ ratio: 1 });
    await expect(credits.locator('.credits-ledger')).toContainText('Three.js');
    await capture(`credits-${viewport.width}x${viewport.height}.png`);
    await page.keyboard.press('Escape');
    await expect(title.locator('[data-action="credits"]')).toBeFocused();
    await title.locator('[data-action="settings"]').click();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.settings-category:visible')).toHaveCSS('animation-name', 'none');
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  await expect(page.locator('[data-setting="volume"]')).toHaveValue('65');
  await settings.locator('[data-action="back"]').click();
  await title.locator('[data-action="start"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await expect.poll(canvasSize).toEqual([720, 450]);
  await page.keyboard.press('KeyP');
  const pause = page.locator('[data-flow-panel="paused"]');
  await expect(pause.locator('[data-pause-level]')).toHaveText('Containment · 01');
  await expect(pause.locator('[data-pause-objective]')).toHaveText(await page.locator('[data-current-objective]').textContent() ?? '');
  await capture('pause-desktop.png');
  await pause.locator('[data-action="restart"]').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-action="cancel-restart"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-action="confirm-restart"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-action="cancel-restart"]')).toBeFocused();
  await page.keyboard.press('KeyP');
  await expect(dialog).toBeVisible();
  await capture('restart-confirmation.png');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(pause.locator('[data-action="restart"]')).toBeFocused();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'paused');
  await pause.locator('[data-action="restart"]').click();
  await confirmRestart(page);
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('KeyP');
  await pause.locator('[data-action="settings"]').click();
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  await expect(page.locator('[data-setting="volume"]')).toHaveValue('65');
  expect(errors).toEqual([]);
});
