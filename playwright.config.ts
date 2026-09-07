import { defineConfig } from '@playwright/test';

const productionUrl = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: productionUrl,
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 1,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
        },
      },
    },
  ],
  webServer: {
    command:
      'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: productionUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
