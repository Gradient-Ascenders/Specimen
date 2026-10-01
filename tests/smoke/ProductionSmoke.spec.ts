import { expect, test, type Page } from '@playwright/test';

// No route interception or runtime injection: these are the shipped files.
const watchProductionRequests = (page: Page, baseURL: string): Set<string> => {
  const failures = new Set<string>();
  const base = new URL(baseURL);
  page.on('pageerror', (error) => failures.add(`Uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || /GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) {
      failures.add(`Console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => failures.add(`Failed request: ${request.url()}`));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.add(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      failures.add(`Request escaped the deployment directory: ${request.url()}`);
    }
  });
  return failures;
};

const assertPlaying = async (page: Page): Promise<void> => {
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#app')).toHaveAttribute('data-game-state', 'playing');
  await expect(page.locator('canvas')).toHaveCount(1);
  // Ensure the new level has presented frames before taking a checkpoint.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

const restartFromPause = async (page: Page): Promise<void> => {
  await page.keyboard.press('KeyP');
  const pause = page.locator('[data-flow-panel="paused"]');
  await expect(pause).toBeVisible();
  await pause.locator('[data-action="restart"]').click();
  await assertPlaying(page);
  await page.keyboard.press('KeyP');
  await expect(pause.locator('[data-restart-status]')).toHaveText('Trial restored.');
  await pause.locator('[data-action="resume"]').click();
  await assertPlaying(page);
};

test('plain production boots, shows credits, starts, and restarts at a nested path', async ({
  page, baseURL,
}) => {
  const failures = watchProductionRequests(page, baseURL!);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('Specimen');
  const title = page.locator('[data-flow-panel="title"]');
  await expect(title).toBeVisible({ timeout: 120_000 });
  await title.locator('[data-action="credits"]').click();
  const credits = page.locator('[data-flow-panel="credits"]');
  await expect(credits).toBeVisible();
  await expect(credits.locator('.credits-ledger')).toContainText('Three.js');
  await credits.locator('[data-action="back"]').click();
  await title.locator('[data-action="start"]').click();
  await assertPlaying(page);
  await page.keyboard.press('KeyW', { delay: 150 });
  await restartFromPause(page);
  expect([...failures], 'Production console/network errors').toEqual([]);
});

test('production loads Cultivation and Blackout and restarts each at a nested path', async ({
  page, baseURL,
}) => {
  const failures = watchProductionRequests(page, baseURL!);
  await page.goto('./?debug=1', { waitUntil: 'domcontentloaded' });
  const start = page.locator('[data-flow-panel="title"] [data-action="start"]');
  await expect(start).toBeVisible({ timeout: 120_000 });
  await start.click();
  await assertPlaying(page);

  // Existing debug shortcuts advance progression; this does not solve puzzles.
  // Keep diagnostics hidden and use the normal transition/enter UI.
  for (const level of [2, 3]) {
    await page.keyboard.press('Digit0', { delay: 100 });
    const enterLevel = page.locator('[data-action="enter-level"]');
    await expect(enterLevel).toBeVisible({ timeout: 120_000 });
    await expect(enterLevel).toContainText(`Enter Level ${level}`);
    await enterLevel.click();
    await assertPlaying(page);
    await restartFromPause(page);
  }
  await expect(page.locator('[data-slime-id="volt"]')).toHaveAttribute('data-state', 'active');
  expect([...failures], 'Production transition console/network errors').toEqual([]);
});
