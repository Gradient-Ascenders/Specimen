/** Exercise the exported asset and capture game-distance/Blackout evidence. */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname,'..');
const output = path.join(root,'artifacts/volt-polish/browser');
const url = process.env.VOLT_PREVIEW_URL ?? 'http://127.0.0.1:4189/tools/volt-preview.html';
const assetHash = createHash('sha256').update(await readFile(path.join(root,'assets/characters/volt/volt.glb'))).digest('hex');
const executable = process.env.VOLT_BROWSER ?? [
  '/home/kevin/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome',
  '/home/kevin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
].find(existsSync);
const browser = await chromium.launch({ executablePath:executable,args:['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport:{width:1280,height:720},deviceScaleFactor:1 });
const errors = [], warnings = [], failures = [], httpErrors = [], samples = [];
page.on('pageerror',error => errors.push(error.message));
page.on('console',message => { if (message.type()==='error') errors.push(message.text()); if (/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text())) warnings.push(message.text()); });
page.on('requestfailed',request => failures.push(request.url()));
page.on('response',response => { if(response.status()>=400) httpErrors.push({url:response.url(),status:response.status()}); });
await mkdir(output,{recursive:true});
try {
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__voltPreview?.snapshot().ready,{},{timeout:120000});
  const frame = () => page.evaluate(async () => { for(let i=0;i<3;i++) await new Promise(requestAnimationFrame); });
  const capture = async name => {
    await frame(); const sample = await page.evaluate(() => window.__voltPreview.snapshot());
    samples.push({name,...sample});
    assert.equal(sample.occluder,null,`${name}: character is hidden by ${sample.occluder}`);
    await page.screenshot({path:path.join(output,`${name}.png`),timeout:60000});
    return sample;
  };
  const neutral = await capture('studio-neutral');
  assert.equal(neutral.fov,48); assert.equal(neutral.exposure,1);
  assert.ok(Math.abs(neutral.aspect-16/9)<0.01);
  assert.equal(neutral.materials,2); assert.equal(neutral.triangles,38208);
  assert.deepEqual(neutral.morphNames,['Squash','Stretch','Blink','CrestFlexLeft','CrestFlexRight']);
  assert.equal(neutral.meshNames.length,3);
  const height = bounds => bounds[4]-bounds[1];
  for (const name of neutral.morphNames) {
    await page.evaluate(name => { window.__voltPreview.reset(); window.__voltPreview.setMorph(name,1); },name);
    const sample = await capture(`morph-${name}`);
    for (const values of Object.values(sample.appliedWeights)) assert.equal(values[name],1);
    assert.ok(Math.abs(sample.bounds[1]-neutral.bounds[1]) < 2e-6,'sole moved');
    if (name==='Squash') assert.ok(Math.abs(height(sample.bounds)/height(neutral.bounds)-0.90)<1e-5);
    if (name==='Stretch') assert.ok(Math.abs(height(sample.bounds)/height(neutral.bounds)-1.09)<1e-5);
    if (name==='Blink') for (let i=0;i<2;i++) assert.ok(Math.abs(height(sample.eyeBounds[i])/height(neutral.eyeBounds[i])-0.13)<1e-5);
  }
  for (const pose of ['Squash','Stretch']) {
    await page.evaluate(pose => { window.__voltPreview.reset(); window.__voltPreview.setMorph(pose,1); window.__voltPreview.setMorph('Blink',1); },pose);
    const sample = await capture(`blend-${pose}-Blink`);
    for (const bounds of sample.eyeBounds) assert.ok(height(bounds)>0.005);
  }
  await page.evaluate(() => { window.__voltPreview.setMorph('Squash',1); window.__voltPreview.setMorph('Stretch',1); });
  assert.equal((await page.evaluate(() => window.__voltPreview.snapshot())).weights.Squash,0);
  await page.evaluate(() => window.__voltPreview.reset());
  const reset = await capture('reset-neutral');
  assert.deepEqual(reset.bounds,neutral.bounds);
  for (const lighting of ['studio','blackout','blackout-powered']) {
    await page.evaluate(lighting => window.__voltPreview.setLighting(lighting),lighting);
    for (const distance of [3.5,5.2,7]) {
      await page.evaluate(distance => window.__voltPreview.setCamera('three-quarter',distance),distance);
      await capture(`${lighting}-${distance.toFixed(1)}m`);
    }
  }
  for (const view of ['front','side','back']) {
    await page.evaluate(view => window.__voltPreview.setCamera(view,5.2),view);
    await capture(`blackout-powered-${view}`);
  }
  await page.locator('#animate').click(); await page.waitForTimeout(900);
  const animated = await capture('animated');
  assert.ok(animated.weights.CrestFlexLeft+animated.weights.CrestFlexRight>0);
  const warmedPrograms = animated.programs;
  await page.locator('#reset').click(); await frame();
  assert.equal((await page.evaluate(() => window.__voltPreview.snapshot())).programs,warmedPrograms);
  const device = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,renderer:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)};
  });
  assert.deepEqual(httpErrors,[]); assert.deepEqual(errors,[]); assert.deepEqual(warnings,[]); assert.deepEqual(failures,[]);
  await writeFile(path.join(output,'validation.json'),JSON.stringify({glb_sha256:assetHash,device,samples,errors,warnings,httpErrors,failedRequests:failures,scope:'Exported morphs and authored Blackout lighting fixture; no production gameplay lifecycle or hardware performance claim'},null,2)+'\n');
  console.log(JSON.stringify({captures:samples.length,device,errors,warnings,httpErrors,failedRequests:failures},null,2));
} finally { await browser.close(); }
