import { defineConfig } from '@playwright/test';
import config from './playwright.config.ts';

/** Requires a build made with --mode opening-backup; never runs on an ordinary build. */
export default defineConfig({
  ...config,
  grep: /@opening-backup/,
  grepInvert: undefined,
  projects: [{
    name: 'opening-backup',
    testMatch: ['**/cinematics/OpeningMovie.spec.ts', '**/media/CinematicMusic.spec.ts'],
  }],
});
