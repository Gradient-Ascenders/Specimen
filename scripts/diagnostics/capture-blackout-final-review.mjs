/** #162: matched, API-staged production game views. Never shipped with the game. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const stage = process.argv[2] ?? 'baseline';
const output = path.resolve(`artifacts/issue-162/final-review/${stage}`);
const url = process.env.SPECIMEN_CAPTURE_URL ?? 'http://127.0.0.1:4173/group-folder/';
await mkdir(output, { recursive: true });
const writeEvidence = async (filename, data) => {
  for (let attempt = 0; ; attempt++) {
    try { await writeFile(filename, JSON.stringify(data, null, 2) + '\n'); return; }
    catch (error) {
      if (attempt >= 5 || !['UNKNOWN', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      await delay(200);
    }
  }
};
const browser = await chromium.launch({ channel: process.env.SPECIMEN_BROWSER_CHANNEL ?? 'chrome', args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(240_000);
const errors = [], failures = [], captures = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', r => failures.push(`${r.url()} ${r.failure()?.errorText}`));
// The existing shadow-evidence script uses the same response-only runtime access.
await page.route('**/assets/*.js', async route => {
  const response = await route.fetch();
  const body = (await response.text())
    .replace(/([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/, '(globalThis.__containment=$1,$1.prepareLightingPrograms()).then(')
    .replace(/return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/, 'return globalThis.__cultivation=new $1.CultivationLevelRuntime(')
    .replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/, 'class __ExposedBlackout extends $1{constructor(...args){super(...args);globalThis.__blackout=this}}export{__ExposedBlackout as BlackoutLevelRuntime};');
  await route.fulfill({ response, body });
});
try {
  console.log(`Capturing ${stage}: production level transitions`);
  await page.goto(`${url}?debug=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => globalThis.__containment?.state === 'running');
  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__cultivation?.state === 'running');
  await page.evaluate(() => {
    const r = globalThis.__cultivation; r.resources.manager.unlock('volt');
    r.events.emit('completed', { levelId: 'level-2', nextLevelId: 'level-3' });
  });
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__blackout?.state === 'running');
  const environment = await page.evaluate(() => {
    const r = globalThis.__blackout; r.stop(); r.__savedRender = r.render.bind(r); r.render = () => {};
    const renderer = r.renderLayer.renderer, gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    document.querySelector('.performance-recorder')?.remove();
    return { userAgent: navigator.userAgent, exposure: renderer.toneMappingExposure,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimerAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
  });
  const gameplay = [], flight = [];
  const advance = async frames => page.evaluate(count => {
    const r = globalThis.__blackout;
    for (let i = 0; i < count; i++) { r.__savedFixedUpdate(1 / 60); r.__savedRender(1, { frameDeltaSeconds: 1 / 60 }); }
  }, frames);
  const key = async (name, frames) => { await page.keyboard.down(name); await advance(frames); await page.keyboard.up(name); };
  const record = async (scenario, name) => {
    const state = await page.evaluate(() => {
      const r = globalThis.__blackout, s = r.resources, camera = r.renderLayer.cameraRig.camera;
      const platform = s.scene.maintenanceBay.root.getObjectByName('bob-route-platform-17');
      const corners = [[-5.5,.15,13.5],[-.5,.15,13.5],[-.5,.15,20.5],[-5.5,.15,20.5]].map(p => {
        const v = platform.position.clone().set(...p).project(camera);
        return [(v.x+1)*640,(1-v.y)*400,v.z];
      });
      const spot = s.scene.root.getObjectByName('blackout-maintenance-searchlight');
      return { bob:s.group.bobBody.position.toArray(), grounded:s.group.bobBody.grounded,
        camera:camera.position.toArray(), quaternion:camera.quaternion.toArray(), active:s.manager.activeSlimeId,
        drone:s.maintenanceDrone.readModel, corners, light: spot ? {intensity:spot.intensity, distance:spot.distance, angle:spot.angle, penumbra:spot.penumbra, castShadow:spot.castShadow} : null,
        memory:{...r.renderLayer.renderer.info.memory}, render:{...r.renderLayer.renderer.info.render}, kit:s.scene.maintenanceBay.surfaceMaterials.diagnostics };
    });
    await page.locator('canvas').screenshot({path:path.join(output,`${scenario}-${name}.png`)});
    gameplay.push({scenario,name,...state});
    console.log(`${scenario}/${name}: Bob ${state.bob}, drone ${JSON.stringify(state.drone.position)}`);
  };
  for (const scenario of ['center','leading','dark']) {
    await page.evaluate(scenario => {
      const r=globalThis.__blackout;
      if(r.__savedFixedUpdate)r.fixedUpdate=r.__savedFixedUpdate;
      r.restartLevel();r.stop();const s=r.resources;
      s.group.bobBody.teleport(s.group.bobBody.position.clone().set(-3,.46,7.5));
      if(scenario!=='dark') {
        s.maintenanceDrone.restore({...s.maintenanceDrone.capture(),position:[-3,6.61,17],stableState:'parked-hover',startupCompleted:true,tutorialCompleted:true,voltMounted:true});
        s.maintenanceDrone.reconcileAfterBodyRecovery('volt',s.group.voltBody);
      } else s.group.voltBody.teleport(s.group.voltBody.position.clone().set(-15.6,.46,5));
      r.renderLayer.cameraRig.reset();r.renderLayer.cameraRig.setGroundOrbitYawRadians(Math.PI);
      r.start();r.__savedFixedUpdate=r.fixedUpdate.bind(r);r.fixedUpdate=()=>{};
    },scenario);
    if(scenario==='leading') {
      // Starting checkpoint is staged over the center; all repositioning uses Input.
      await key('s',40);await advance(25);
      const model=await page.evaluate(()=>globalThis.__blackout.resources.maintenanceDrone.readModel);
      flight.push({key:'s',heldSteps:40,brakeSteps:25,...model});
      assert.ok(model.position.z>=13 && model.position.z<14.2,'normal drone controls move the beam to the leading edge');
    }
    await key('Tab',1);await advance(8);await record(scenario,'20-approach');
    await key('w',15);await record(scenario,'21-bank-edge');
    await key('Space',42);await page.keyboard.down('w');await advance(20);await record(scenario,'22-jumping');
    await advance(45);await page.keyboard.up('w');await advance(20);await record(scenario,'23-landing');
    assert.equal(gameplay.at(-1).active,'bob');assert.equal(gameplay.at(-1).grounded,true);
    assert.ok(gameplay.at(-1).bob[2]>=13.5);
  }
  await writeEvidence(path.join(output,'measurements.json'),{stage,environment,kind:'Staged checkpoint setup; drone repositioning and Bob traversal use keyboard Input and fixed simulation with native follow camera',flight,gameplay,errors,failures});
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
} finally {await context.close();await browser.close();}
