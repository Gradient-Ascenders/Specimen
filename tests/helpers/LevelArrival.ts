import { expect, type Page } from '@playwright/test';

/** Observed integration fixtures must finish the real arrival before testing
 * controls. Advance fixed updates without paying for each software-WebGL draw;
 * do not cancel the cinematic or alter its input/roster ownership. */
export async function finishLevelArrival(page: Page, sessionKey: string): Promise<void> {
  await page.evaluate(key => {
    const runtime = (window as any)[key].runtime;
    const arrival = runtime.ventArrival ?? runtime.resources?.ventArrival;
    for (let frame = 0; arrival?.active && frame < 1800; frame++) runtime.fixedUpdate(1 / 60);
    if (arrival?.active) throw new Error('Level arrival did not hand control back after 30 simulation seconds');
  }, sessionKey);
  await expect.poll(() => page.evaluate(key => {
    const runtime = (window as any)[key].runtime;
    return runtime.input.enabled && !(runtime.ventArrival ?? runtime.resources?.ventArrival)?.active;
  }, sessionKey), { message: 'The real arrival must release gameplay controls' }).toBe(true);
}
