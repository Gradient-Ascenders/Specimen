/** Before/after native captures of actual authored research/ending frames. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { exposeGame } from '../../tests/helpers/GameRuntime.ts';
import { finishLevelArrival } from '../../tests/helpers/LevelArrival.ts';
import { GRAPHICS_PROFILES } from '../../src/render/GraphicsProfiles.ts';
import { RESEARCH_TIMING as R } from '../../src/cinematics/BlackoutResearchTimeline.ts';
import { ENDING_TIMING as E } from '../../src/cinematics/BossDefeatTimeline.ts';
const output=resolve(process.argv[2]),profile=process.argv[3]??'standard';
const url=process.argv[4]??'http://127.0.0.1:4173/';
const deterministicBoss=process.argv[5]==='--deterministic-boss';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false}),page=await browser.newPage({viewport:{width:960,height:540}});
const report={build:await(await fetch(new URL('build-manifest.json',url))).json(),profile,deterministicBoss,frames:[],errors:[]};
page.setDefaultTimeout(300_000);
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()}: ${r.url()}`);});
try{
  await page.addInitScript(settings=>localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings})),GRAPHICS_PROFILES[profile].settings);
  await exposeGame(page,{session:'__views'});await page.goto(new URL('?debug=1',url).href,{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="level-select"]').click();await page.getByRole('button',{name:'Level 3 Blackout',exact:true}).click();await page.locator('[data-action="enter-level"]').click();await finishLevelArrival(page,'__views');
  report.gpu=await page.evaluate(()=>{const r=window.__views.runtime,g=r.renderLayer.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');r.renderLayer.setAnimationLoop(null);return g.getParameter(e.UNMASKED_RENDERER_WEBGL);});
  // Match the gameplay attack state when comparing the first post-movie frame.
  // This is a fixture-only choice of the controller's existing random source.
  if(deterministicBoss)await page.evaluate(()=>{window.__views.runtime.resources.finalBoss.controller.random=()=>.1;});
  assert(!/swiftshader|llvmpipe|software|warp/i.test(report.gpu));
  const capture=async(name)=>{const frame=await page.evaluate(async()=>{
    const r=window.__views.runtime,l=r.renderLayer,c=l.cameraRig.camera,g=l.renderer.getContext();r.render(1,{frameDeltaSeconds:1/60});
    const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return {png:l.canvas.toDataURL('image/png'),camera:{position:c.position.toArray(),quaternion:c.quaternion.toArray(),projection:c.projectionMatrix.toArray(),layers:c.layers.mask},
      phase:r.phase,research:r.resources.researchFinale.diagnostics,ending:r.resources.defeatFinale.diagnostics,
      boss:{state:r.finalBossReadModel.state,stage:r.finalBossReadModel.stage,attack:r.finalBossReadModel.attack,elapsed:r.finalBossReadModel.elapsed},
      memory:{...l.renderer.info.memory},glError:g.getError(),
      programs:await Promise.all(l.renderer.info.programs.map(async p=>({key:await hash(p.cacheKey),vertex:await hash(g.getShaderSource(p.vertexShader)),fragment:await hash(g.getShaderSource(p.fragmentShader))})))};
  });await writeFile(resolve(output,name+'.png'),Buffer.from(frame.png.split(',')[1],'base64'));delete frame.png;report.frames.push({name,...frame});assert.equal(frame.glError,0);};
  await capture('gameplay');
  await page.evaluate(()=>{const r=window.__views.runtime;r.activateCheckpoint('cp6');r.recoverActiveCheckpoint();r.resources.group.activeBody.teleport(r.resources.group.activeBody.position.clone().setZ(188.15));r.fixedUpdate(1/60);r.render(1,{frameDeltaSeconds:1/60});});
  assert.equal(await page.locator('#app').getAttribute('data-cinematic'),'blackout-research');
  for(const [t,name]of [[3,'research-gallery'],[124.2,'research-blackout'],[147.2,'research-chase'],[209.2,'research-fusion'],[237,'research-arena'],[R.glass+.05,'research-glass'],[R.duration+.1,'research-boss-handoff']]){
    await page.evaluate(t=>{const r=window.__views.runtime,m=r.resources.researchFinale;for(let i=0;i<20000&&m.active&&m.seconds<t;i++)r.fixedUpdate(1/60);},t);await capture(name);
  }
  await page.evaluate(()=>{const r=window.__views.runtime;r.activateCheckpoint('cp8');r.recoverActiveCheckpoint();const boss=r.resources.finalBoss;boss.reset();boss.startPhaseTwo();for(let i=0;i<4;i++)boss.controller.applyImpact({projectileId:90000+i,targetId:'extermination-core',kind:'direct',fullyCharged:true,chargeAmount:1,damageUnits:10000,point:boss.presentation.coreWorld.clone(),direction:boss.presentation.coreWorld.clone().set(0,0,1)});r.fixedUpdate(1/60);});
  assert.equal(await page.locator('#app').getAttribute('data-cinematic'),'boss-defeat');
  for(const [t,name]of [[2,'ending-broken-boss'],[16,'ending-balanced-beams'],[31.15,'ending-explosion'],[41.5,'ending-regroup'],[E.destruction+.65,'ending-collapse'],[E.daylight+5,'ending-daylight'],[E.credits+5,'ending-credits']]){
    await page.evaluate(t=>{const r=window.__views.runtime,m=r.resources.defeatFinale;for(let i=0;i<20000&&m.active&&m.seconds<t;i++)r.fixedUpdate(1/60);},t);await capture(name);
  }
  assert.deepEqual(report.errors,[]);
}catch(e){report.failure=String(e.stack??e);process.exitCode=1;}finally{await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));await browser.close();}
