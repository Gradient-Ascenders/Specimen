import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {finishOpening} from '../../helpers/OpeningHandoff.ts';
import {analyzeRecording} from '../../../scripts/lib/performance-qualification.mjs';

test('browser-only benchmark export contains complete input/draw evidence and stabilized restart history',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.goto('./?debug=1&benchmark=1',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click({timeout:180000});
  await finishOpening(page);
  await page.waitForTimeout(3500);
  for(let cycle=0;cycle<3;cycle++) {
    await page.keyboard.press('KeyP');
    await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing');
    await page.waitForTimeout(3500);
  }
  await page.keyboard.press('Shift+KeyP');
  for(let repeat=0;repeat<2;repeat++) {
    await page.mouse.move(310+repeat*10,180,{steps:4});
    for(const key of ['w','s','d','a']) {
      await page.keyboard.down(key);await page.waitForTimeout(400);await page.keyboard.up(key);
    }
  }
  await page.keyboard.press('Shift+KeyP');
  const download=page.waitForEvent('download');await page.keyboard.press('Shift+KeyE');
  const file=info.outputPath('benchmark.json');await (await download).saveAs(file);
  const flight=JSON.parse(await readFile(file,'utf8'));
  expect(flight.schemaVersion).toBe(4);expect(flight.retainedFrames.length).toBe(flight.summary.totalFrames);
  expect(flight.configuration.historyCapacityFrames).toBe(8192);
  expect(flight.qualification.bootReadyMs).toBeGreaterThan(0);
  const initial=flight.qualification.lifecycle.find((e:any)=>e.kind==='initial');
  expect(initial.controlAtMs).toBeGreaterThanOrEqual(initial.readyAtMs);
  expect(initial.readyAtMs).toBeGreaterThanOrEqual(initial.requestedAtMs);
  const restarts=flight.qualification.lifecycle.filter((e:any)=>e.kind==='restart');expect(restarts).toHaveLength(3);
  expect(restarts.every((e:any)=>e.resourceSample?.stableForMs>=2000)).toBe(true);
  const report=analyzeRecording(flight);
  // Engineering builds are deliberately unqualified until the source is committed.
  expect(report.reasons).toEqual(flight.build.dirty ? ['Missing clean-build provenance.'] : []);
  const manifest=await (await page.request.get('./build-manifest.json')).json();
  expect(manifest.sha).toBe(flight.build.sha);expect(manifest.builtAt).toBe(flight.build.builtAt);
  expect(manifest.assetHashes['index.html']).toMatch(/^[a-f0-9]{64}$/);
  expect(errors).toEqual([]);
});
