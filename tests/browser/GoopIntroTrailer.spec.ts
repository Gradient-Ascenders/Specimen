import { test, expect } from './fixtures.ts';
import { GOOP_INTRO_DURATION_SECONDS } from '../../src/trailer/GoopIntroTimeline.ts';

test('Goop introduction is capture-ready, replayable and independent of gameplay', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 960, height: 540 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', message => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) errors.push(message.text());
  });
  await page.goto('./?trailer=goop');
  const play = page.locator('[data-trailer-action="play"]');
  await expect(play).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-trailer-shot', 'goop');
  await expect(page.locator('.game-flow, .game-hud, .performance-recorder')).toHaveCount(0);
  await expect(page.locator('.trailer-shot-links a[href="?trailer=opening"]')).toBeVisible();
  await play.click();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyH');
  const checkpoints = [
    [0.8, 'patrol', 'follow-bob', 'walking'], [1.55, 'patrol', 'follow-bob', 'before-surprise'],
    [2.4, 'aiming', 'drone-reveal', 'look-up'],
    [3.04, 'rescue', 'drone-reveal', 'drone-fires'], [3.14, 'rescue', 'bob-reverse', 'bob-reaction'],
    [3.43, 'rescue', 'bob-reverse', 'goop-enters'], [3.65, 'rescue', 'bob-reverse', 'push'],
    [4, 'counterattack', 'bob-reverse', 'shield'], [5.12, 'counterattack', 'bob-reverse', 'goop-fires'],
    [5.65, 'counterattack', 'drone-impact', 'incoming-acid'], [5.84, 'destruction', 'drone-impact', 'acid-hit'],
    [6.35, 'destruction', 'drone-impact', 'tumbling-wreck'],
    [6.7, 'destruction', 'drone-impact', 'falling-wreck'],
    [7.05, 'destruction', 'drone-impact', 'bouncing-wreck'],
    [8.4, 'destruction', 'drone-impact', 'settled-wreck'], [10, 'heroes', 'heroes', 'heroes'],
    [GOOP_INTRO_DURATION_SECONDS, 'complete', 'heroes', 'complete'],
  ] as const;
  for (const [time, stage, cameraShot, name] of checkpoints) {
    await page.locator('[data-trailer-seek]').evaluate((input, value) => {
      (input as HTMLInputElement).value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, time);
    await expect(page.locator('#app')).toHaveAttribute('data-trailer-stage', stage);
    await expect(page.locator('#app')).toHaveAttribute('data-trailer-camera-shot', cameraShot);
    await page.locator('[data-trailer-action="hide"]').click();
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('KeyH');
  }
  await page.locator('[data-trailer-action="replay"]').click();
  await expect(page.locator('.opening-trailer')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.opening-trailer-controls')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-trailer-stage', 'patrol');
  await expect(page.locator('.opening-trailer')).toHaveAttribute('data-state', 'complete', { timeout: 60_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-trailer-seconds', GOOP_INTRO_DURATION_SECONDS.toFixed(3));
  expect(errors).toEqual([]);
});
