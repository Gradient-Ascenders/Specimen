import { test as base, expect } from './BrowserFixtures.ts';
import { MUSIC_PATHS, type MusicTrack } from '../../src/audio/BackgroundMusic.ts';

/** Select players by the production catalog rather than historical track numbers. */
export const MUSIC_FILES = Object.fromEntries(Object.entries(MUSIC_PATHS)
  .map(([track, file]) => [track, file.slice(file.lastIndexOf('/') + 1)])) as Record<MusicTrack, string>;

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(files => { (window as any).__testMusicFiles = files; }, MUSIC_FILES);
    await use(page);
  },
});
export { expect };
