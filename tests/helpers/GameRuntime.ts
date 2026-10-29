import type { Page, Route } from '@playwright/test';

import { observeGameSource, type Observers } from '../../scripts/lib/game-observers.ts';
export { observeGameSource } from '../../scripts/lib/game-observers.ts';

/** Test-only observation of the shipped entry point; never replaces game owners. */
export async function exposeGame(page: Page, observers: Observers): Promise<void> {
  const observe = async (route: Route): Promise<void> => {
    const response = await route.fetch();
    await route.fulfill({ response, body: observeGameSource(await response.text(), observers) });
  };
  await page.route('**/assets/index-*.js', observe);
  await page.route('**/src/main.ts*', observe);
}
