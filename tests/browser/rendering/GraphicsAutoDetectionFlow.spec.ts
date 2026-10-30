import { test, expect } from '../../helpers/BrowserFixtures.ts';
import { exposeGame } from '../../helpers/GameRuntime.ts';
import { watchBrowserErrors } from '../../helpers/BrowserErrors.ts';
import { GRAPHICS_PROFILES } from '../../../src/render/GraphicsProfiles.ts';

test('title auto-detection keeps failed results, avoids full warm-up and respects a later manual choice', async ({page},info) => {
  test.setTimeout(180_000);
  const errors = watchBrowserErrors(page,{webgl:true});
  await page.addInitScript(settings => localStorage.setItem('specimen.graphics-preferences.v1',
    JSON.stringify({mode:'automatic',settings})),GRAPHICS_PROFILES.minimum.settings);
  await exposeGame(page,{runtime:'__detectionRuntime'});
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click({timeout:60_000});
  const preset = page.locator('[data-setting="graphics-profile"]');
  const button = page.locator('[data-action="calibrate-graphics"]');
  await expect(preset).toHaveValue('standard');
  await page.evaluate(() => {
    const rt = (window as any).__detectionRuntime;
    if(rt.state!=='unloaded') throw Error('Fresh settings unexpectedly loaded the level');
    rt.__fullPreparations=0;
    const prepare=rt.prepareGraphics;
    rt.prepareGraphics=function(...args:any[]){rt.__fullPreparations++;return prepare.apply(this,args);};
    const detect=rt.calibrateInitialGraphics;
    rt.calibrateInitialGraphics=async function(...args:any[]){
      const start=performance.now(), phases: {phase: string; profile: string; elapsedMs: number}[] = [];
      const progress = args[1];
      args[1] = (phase: string, profile: string) => {
        phases.push({phase, profile, elapsedMs: performance.now() - start});
        progress(phase, profile);
      };
      const timings: Record<string, number[]> = {};
      const restore: (() => void)[] = [];
      for (const [owner, key] of [[rt, 'prepareCharacterModels'], [rt.renderLayer.renderer, 'compileAsync']] as const) {
        const original = owner[key];
        owner[key] = async function(...args: any[]) {
          const began = performance.now();
          try { return await original.apply(this, args); }
          finally { (timings[key] ??= []).push(performance.now() - began); }
        };
        restore.push(() => { owner[key] = original; });
      }
      for (const [owner, key] of [[rt, 'prepareContainmentShadows'], [rt.renderLayer, 'render'],
        [rt.renderLayer, 'setGraphicsSettings']] as const) {
        const original = owner[key];
        owner[key] = function(...args: any[]) {
          const began = performance.now();
          try { return original.apply(this, args); }
          finally { (timings[key] ??= []).push(performance.now() - began); }
        };
        restore.push(() => { owner[key] = original; });
      }
      try {
        const result=await detect.apply(this,args);
        rt.__detection={result,elapsedMs:performance.now()-start, phases, timings};
        return result;
      } finally { for (const reset of restore) reset(); }
    };
  });
  const buttonStarted = Date.now();
  await button.click();
  await expect(button).toBeEnabled({timeout:120_000});
  const evidence = await page.evaluate(() => {
    const rt=(window as any).__detectionRuntime;
    return {detection:rt.__detection,fullPreparations:rt.__fullPreparations,graphics:rt.renderLayer.graphicsConfiguration,
      glError:rt.renderLayer.renderer.getContext().getError()};
  });
  await info.attach('auto-detection-software-renderer.json',{body:JSON.stringify({...evidence, buttonElapsedMs: Date.now() - buttonStarted},null,2),contentType:'application/json'});
  expect(evidence.detection).toBeDefined();expect(evidence.fullPreparations).toBe(0);expect(evidence.glError).toBe(0);
  if(evidence.detection.result.status==='complete') await expect(preset).toHaveValue(evidence.detection.result.profile);
  else {
    await expect(preset).toHaveValue('standard');
    await expect(page.locator('[data-settings-feedback]')).toContainText('settings are kept');
  }
  // A controlled pending result exercises the real entry-point cancellation
  // and persistence path without paying for another cold graphics measurement.
  await page.evaluate(() => {
    const rt=(window as any).__detectionRuntime;
    rt.calibrateInitialGraphics=() => new Promise(resolve=>{rt.__finishDetection=resolve;});
  });
  await button.click();
  await page.waitForFunction(() => !!(window as any).__detectionRuntime.__finishDetection);
  await preset.selectOption('high');
  await page.evaluate(() => (window as any).__detectionRuntime.__finishDetection({status:'complete',profile:'minimum',measurements:{}}));
  await expect(button).toBeEnabled();await expect(preset).toHaveValue('high');
  await expect(page.locator('[data-settings-feedback]')).toContainText('settings are kept');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('specimen.graphics-preferences.v1')!));
  expect(saved.mode).toBe('manual');expect(saved.settings.graphicsProfile).toBe('high');
  // Controlled recommendations verify both new tiers through the actual button,
  // settings application, result copy and persisted automatic preferences.
  for (const [profile, budget] of [['ultra', 3686400], ['high', 2073600]] as const) {
    await page.evaluate(profile => {
      (window as any).__detectionRuntime.calibrateInitialGraphics = async () =>
        ({ status: 'complete', profile, measurements: {} });
    }, profile);
    await button.click();await expect(button).toBeEnabled();
    await expect(preset).toHaveValue(profile);
    await expect(page.locator('[data-settings-feedback]')).toContainText(profile === 'ultra' ? 'Ultra' : 'High');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('specimen.graphics-preferences.v1')!));
    expect(saved.mode).toBe('automatic');expect(saved.settings.graphicsProfile).toBe(profile);
    expect(saved.settings.pixelBudget).toBe(budget);
    expect(await page.evaluate(() => (window as any).__detectionRuntime.renderLayer.renderer.getContext().getError())).toBe(0);
  }
  expect(errors).toEqual([]);
});
