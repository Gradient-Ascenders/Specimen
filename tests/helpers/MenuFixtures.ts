import { createServer } from 'vite';
import { test as base, expect } from './BrowserFixtures.ts';
import type { Page } from '@playwright/test';
import { watchBrowserErrors } from './BrowserErrors.ts';

export const test = base.extend<{ menuPage: Page; menuRequests: string[] }, { menuOrigin: string }>({
  menuOrigin: [async ({}, use) => {
    const server = await createServer({
      configFile: false,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === 'string') throw new Error('Menu fixture did not open a local port');
      await use(`http://127.0.0.1:${address.port}`);
    } finally { await server.close(); }
  }, { scope: 'worker' }],
  menuRequests: async ({ page }, use) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await use(requests);
  },
  menuPage: async ({ page, menuOrigin, menuRequests }, use) => {
    const errors = watchBrowserErrors(page);
    await page.goto(`${menuOrigin}/tests/fixtures/menu.html`);
    await expect(page.locator('[data-flow-panel="title"]')).toBeVisible();
    try { await use(page); }
    finally {
      await page.evaluate(() => (window as any).__menuFixture.dispose());
      expect(errors, 'Menu fixture console/network errors').toEqual([]);
    }
  },
});
export { expect };
