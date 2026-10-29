import { defineConfig } from '@playwright/test';

const port = process.env.SPECIMEN_SMOKE_PORT ?? '4173';
const productionUrl = process.env.SPECIMEN_PRODUCTION_URL ?? `http://127.0.0.1:${port}/group-folder/`;
const requestedBrowser = process.env.SPECIMEN_BROWSER_NAME ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(requestedBrowser)) {
  throw new Error(`Unsupported SPECIMEN_BROWSER_NAME: ${requestedBrowser}`);
}
const browserName = requestedBrowser as 'chromium' | 'firefox' | 'webkit';
const browserChannel = browserName === 'chromium' ? process.env.SPECIMEN_BROWSER_CHANNEL : undefined;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  grepInvert: /@opening-backup/,
  reporter: [['line'], ['html', { open: 'never' }]],
  outputDir: 'test-results/browser',
  use: {
    baseURL: productionUrl,
    browserName,
    channel: browserChannel,
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 1,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      firefoxUserPrefs: browserName === 'firefox' && process.env.SPECIMEN_FIREFOX_SOFTWARE_WEBGL === '1'
        ? { 'webgl.force-enabled': true, 'webgl.disabled': false }
        : undefined,
      args: browserName === 'chromium' && !browserChannel ? [
        '--use-gl=angle', '--use-angle=swiftshader',
        '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ] : [],
    },
  },
  projects: [
    { name: 'smoke', testMatch: '**/smoke/**/*.spec.ts' },
    { name: 'ui', testMatch: '**/ui/**/*.spec.ts', timeout: 60_000 },
    { name: 'integration', testMatch: '**/integration/**/*.spec.ts' },
    { name: 'rendering', testMatch: '**/rendering/**/*.spec.ts', timeout: 600_000, retries: process.env.CI ? 1 : 0 },
    { name: 'cinematics', testMatch: '**/cinematics/**/*.spec.ts', timeout: 600_000, retries: process.env.CI ? 1 : 0 },
    { name: 'media', testMatch: '**/media/**/*.spec.ts', timeout: 600_000 },
  ],
  webServer: process.env.SPECIMEN_PRODUCTION_URL ? undefined : {
    command: 'node scripts/build/serve-production-smoke.mjs',
    url: productionUrl,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
