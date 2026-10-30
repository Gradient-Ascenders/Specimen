import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {exposeGame} from '../../tests/helpers/GameRuntime.ts';
import {finishLevelArrival} from '../../tests/helpers/LevelArrival.ts';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';
import {installTextureOwnershipTrace} from './trace-texture-ownership.mjs';
const cycles=Number(process.argv[2]??10),output=resolve(process.argv[3]??'artifacts/loading-phase-3/texture-cycles');assert(Number.isInteger(cycles)&&cycles>0);await mkdir(output,{recursive:true});
const profile=process.argv[4]??'standard';assert(GRAPHICS_PROFILES[profile]);
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
const context=await browser.newContext({viewport:{width:640,height:360}}),page=await context.newPage();page.setDefaultTimeout(300000);
const report={build:await(await fetch('http://127.0.0.1:4173/build-manifest.json')).json(),browser:browser.version(),profile,protocol:`${cycles} real load/restart/death/retry/menu cycles, native ${profile} 640x360; settle 1 second with title rendering; no forced GC`,cycles:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.addInitScript(installTextureOwnershipTrace);
await page.addInitScript(settings=>localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings})),GRAPHICS_PROFILES[profile].settings);
await exposeGame(page,{session:'__loadingSession'});
await page.route('**/assets/BlackoutLevelRuntime-*.js',async route=>{const response=await route.fetch(),body=await response.text();assert.equal(body.split('preparePresentation(){').length,2);await route.fulfill({response,body:body.replace('preparePresentation(){','preparePresentation(){globalThis.__textureOwnership.tagRuntime(this);')});});
const save=()=>writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));
const sample=label=>page.evaluate(label=>{const layer=window.__loadingSession.runtime.renderLayer,renderer=layer.renderer;return {label,camera:layer.cameraRig.camera.uuid,drawingBuffer:[renderer.domElement.width,renderer.domElement.height],transmissionScale:renderer.transmissionResolutionScale,memory:{...renderer.info.memory,programs:renderer.info.programs.length},...window.__textureOwnership.snapshot()};},label);
try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="level-select"]').waitFor();
  report.gpu=await page.evaluate(()=>{const renderer=window.__loadingSession.runtime.renderLayer.renderer;window.__textureOwnership.attach(renderer);const gl=renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);});
  assert(!/swiftshader|llvmpipe|software|warp/i.test(report.gpu));report.initial=await sample('initial title');
  for(let cycle=1;cycle<=cycles;cycle++){
    await page.locator('[data-flow-panel="title"] [data-action="level-select"]').click();await page.getByRole('button',{name:'Level 3 Blackout',exact:true}).click();await page.locator('[data-action="enter-level"]').waitFor({state:'visible'});
    const row={cycle,prepared:await sample('prepared before Enter')};
    await page.locator('[data-action="enter-level"]').click();await finishLevelArrival(page,'__loadingSession');await page.waitForTimeout(1000);
    row.gameplay=await sample('gameplay');
    await page.keyboard.press('KeyP');await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();await finishLevelArrival(page,'__loadingSession');
    assert(await page.evaluate(()=>window.__loadingSession.runtime.requestFailure()));
    await page.evaluate(()=>{const r=window.__loadingSession.runtime;for(let i=0;i<360;i++)r.fixedUpdate(1/60);});await page.locator('.death-retry').click();await page.waitForFunction(()=>window.__loadingSession.runtime.resources.deathSequence.state==='playing');
    if(await page.locator('.game-flow').getAttribute('data-state')==='playing')await page.keyboard.press('KeyP');
    await page.locator('[data-flow-panel="paused"]').getByRole('button',{name:'Return to menu',exact:true}).click();await page.locator('[data-flow-panel="title"]').waitFor();await page.waitForTimeout(1000);
    row.menu=await sample('menu');report.cycles.push(row);await save();console.log('Cycle',cycle,row.gameplay.memory,row.menu.memory);
  }
  assert.deepEqual(report.errors,[]);
}catch(e){report.failure=String(e.stack??e);process.exitCode=1;}finally{await save();await browser.close();}
