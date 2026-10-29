import { test as base, expect } from '@playwright/test';

/** Optional isolated physical browser; default CI still launches Chromium. */
export const test = process.env.SPECIMEN_BROWSER_CDP_URL ? base.extend({
  browser: [async ({ playwright }, use) => {
    const browser = await playwright.chromium.connectOverCDP(process.env.SPECIMEN_BROWSER_CDP_URL!);
    try { await use(browser); }
    finally {
      // Disconnect; the caller owns the native browser process/profile.
      await browser.close();
    }
  }, { scope: 'worker' }],
}) : base;
export { expect };
