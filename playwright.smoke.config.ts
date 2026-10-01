import { defineConfig } from '@playwright/test';

const productionUrl = 'http://127.0.0.1:4173/group-folder/';

export default defineConfig({
  testDir: './tests/smoke',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  reporter: [['line'], ['html', { open: 'never' }]],
  outputDir: 'test-results/smoke',
  use: {
    baseURL: productionUrl,
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 1,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        // Exercise a consistent CPU renderer on local and GPU-less CI runners.
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node scripts/serve-production-smoke.mjs',
    url: productionUrl,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
