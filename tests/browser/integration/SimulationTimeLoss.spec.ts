import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { expect, test } from '@playwright/test';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';
import { observeGameSource } from '../../helpers/GameRuntime.ts';

test('production loop bounds a stalled charge and recovers with independent Web Audio time', async ({page}) => {
  const errors = watchBrowserErrors(page);


  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch();
    let source = observeGameSource(await response.text(), { runtime: '__stallRuntime' });
    expect(source).toMatch(/([\w$]+)=new ([\w$]+)\(\{fixedUpdate:/);
    source = source.replace(/([\w$]+)=new ([\w$]+)\(\{fixedUpdate:/,
      '$1=globalThis.__stallLoop=new $2({fixedUpdate:');
    await route.fulfill({response, body:source});
  });
  await page.goto('./?debug=1', {waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:180000});
  await finishOpening(page);
  await page.evaluate(() => {
    const w = window as any, rt = w.__stallRuntime;
    rt.renderLayer.setAnimationLoop(null);
    rt.resources.body.teleport({x:3,y:.46,z:0});
    w.__stallLoop.pause(); w.__stallLoop.resume(); w.__stallLoop.tick(0);
  });
  await page.waitForFunction(() => (window as any).__stallRuntime.audio.diagnostics.contextState === 'running');
  await page.waitForFunction(() => (window as any).__stallRuntime.audio.diagnostics.pending === 0);
  await page.keyboard.down('Space'); await page.keyboard.down('KeyW');
  const stalled = await page.evaluate(() => {
    const w = window as any, rt = w.__stallRuntime, loop = w.__stallLoop;
    const audioStart = rt.audio.context.currentTime;
    const start = performance.now();
    while (performance.now() - start < 500) { /* Controlled main-thread stall, not a performance sample. */ }
    loop.tick(1000);
    return {steps:loop.stats.stepsThisFrame, dropped:loop.stats.droppedSimulationTimeSeconds,
      alpha:loop.stats.interpolationAlpha, charge:rt.resources.body.chargeSeconds,
      audioElapsed:rt.audio.context.currentTime-audioStart, played:rt.audio.diagnostics.played,
      keys:[...rt.audio.loops.keys()]};
  });
  expect(stalled.steps).toBe(6); expect(stalled.dropped).toBeCloseTo(.9);
  expect(stalled.alpha).toBeGreaterThanOrEqual(0); expect(stalled.alpha).toBeLessThanOrEqual(1);
  expect(stalled.charge).toBeCloseTo(.1); expect(stalled.audioElapsed).toBeGreaterThan(.35);
  // Bob's shipped palette deliberately has no charge loop; launch emits a one-shot.
  expect(stalled.keys).not.toContain('character:charge');
  await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
  const recovered = await page.evaluate(() => {
    const w = window as any, rt = w.__stallRuntime, loop = w.__stallLoop;
    loop.tick(1000+1000/60);
    return {steps:loop.stats.stepsThisFrame, dropped:loop.stats.droppedSimulationTimeSeconds,
      charging:rt.resources.body.chargingJump, velocity:rt.resources.body.velocity.y,
      played:rt.audio.diagnostics.played, keys:[...rt.audio.loops.keys()]};
  });
  expect(recovered.steps).toBe(1); expect(recovered.dropped).toBe(0);
  expect(recovered.charging).toBe(false); expect(recovered.velocity).toBeGreaterThan(0);
  expect(recovered.keys).not.toContain('character:charge');
  expect(recovered.played).toBeGreaterThan(stalled.played);
  await page.keyboard.press('KeyP');
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state','paused');
  const frozen = await page.evaluate(() => {
    const w=window as any, body=w.__stallRuntime.resources.body;
    const before=body.position.toArray();w.__stallLoop.tick(2016.667);
    return {before,after:body.position.toArray(),audio:w.__stallRuntime.audio.diagnostics.contextState};
  });
  expect(frozen.after).toEqual(frozen.before);
  await page.waitForFunction(() => (window as any).__stallRuntime.audio.diagnostics.contextState === 'suspended');
  await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing');
  expect(await page.evaluate(() => {
    const w=window as any;w.__stallLoop.tick(2033.334);
    return w.__stallRuntime.state === 'running' && !w.__stallRuntime.resources.body.chargingJump;
  })).toBe(true);
  expect(errors).toEqual([]);
});
