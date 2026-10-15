import { test, expect } from './fixtures.ts';
import { OPENING_TRAILER_DURATION_SECONDS, OPENING_TRAILER_TIMING } from '../../src/trailer/OpeningTrailerTimeline.ts';

test('opening trailer is capture-ready, scrubbable and replayable without gameplay UI', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', message => {
    if (message.type() === 'error' || /Geometry buffers too small|GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) {
      failures.push(message.text());
    }
  });
  await page.goto('./?trailer=opening');
  const play = page.locator('[data-trailer-action="play"]');
  await expect(play).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('.game-flow, .game-hud, .performance-recorder')).toHaveCount(0);
  await play.click();
  await expect(page.locator('.opening-trailer-controls')).toBeHidden();
  // Move keyboard focus off the button before using recording shortcuts.
  await page.locator('canvas').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyH');
  await expect(page.locator('.opening-trailer-controls')).toBeVisible();

  const checkpoints = [
    [0, 'outside', 'outside'], [4.81, 'entering', 'entry-flicker'],
    [5.4, 'dark-room', 'dark-room'], [5.63, 'dark-room', 'dark-flicker'],
    [8.1, 'reveal', 'reveal'], [13.8, 'cracking', 'cracking'],
    [15.4, 'emerging', 'split'], [15.8, 'emerging', 'partial-reveal'], [16.6, 'emerging', 'shell-clear'],
    [17.3, 'emerging', 'settling'], [18.9, 'emerging', 'emerging'],
    [OPENING_TRAILER_DURATION_SECONDS, 'complete', 'complete'],
  ] as const;
  for (const [seconds, stage, name] of checkpoints) {
    await page.locator('[data-trailer-seek]').evaluate((input, value) => {
      (input as HTMLInputElement).value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, seconds);
    await expect(page.locator('#app')).toHaveAttribute('data-trailer-stage', stage);
    await page.locator('[data-trailer-action="hide"]').click();
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
    await page.locator('canvas').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('KeyH');
  }

  await page.locator('[data-trailer-action="replay"]').click();
  await expect(page.locator('.opening-trailer')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#app')).toHaveAttribute('data-trailer-stage', 'outside');
  await expect(page.locator('.opening-trailer-controls')).toBeHidden();
  // Also play through normally; seeking alone cannot validate the frame clock.
  await expect(page.locator('.opening-trailer')).toHaveAttribute('data-state', 'complete', { timeout: 60_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-trailer-seconds', OPENING_TRAILER_DURATION_SECONDS.toFixed(3));
  expect(OPENING_TRAILER_TIMING.emergeStart).toBeGreaterThan(OPENING_TRAILER_TIMING.shellStart);
  expect(OPENING_TRAILER_TIMING.emergeStart).toBeLessThan(OPENING_TRAILER_TIMING.shellClear);
  expect(failures).toEqual([]);
});
