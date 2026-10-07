/** #173: production loading, matched render-only ABBA, continuous frames and lifecycle.
 * Menu handoffs below use existing debug completion APIs; they are not full traversal. */
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from '@playwright/test';

const output = path.resolve(process.env.GAME_SHADOW_OUTPUT ?? 'artifacts/evidence/shadows/full-game');
const url = process.env.GAME_SHADOW_URL ?? 'http://127.0.0.1:4183/';
const dpr = Number(process.env.GAME_SHADOW_DPR ?? 1);
const server = process.env.GAME_SHADOW_URL ? undefined : spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4183', '--strictPort'], {stdio: 'ignore'});
const provenance = process.env.GAME_SHADOW_PROVENANCE ? JSON.parse(await readFile(process.env.GAME_SHADOW_PROVENANCE, 'utf8')) : {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  dirtyPaths: execFileSync('git', ['status', '--short'], {encoding:'utf8'}).trim().split('\n'),
};
const report = {recordedAt: new Date().toISOString(), ...provenance, assets: {}, loading: [], checkpoints: [], lifecycle: [], errors: [], failures: []};
let browser, context;
try {
  await mkdir(output, {recursive:true});
  for (const name of await readdir('dist/assets')) if (name.endsWith('.js')) report.assets[name] = createHash('sha256').update(await readFile(path.join('dist/assets',name))).digest('hex');
  for (let i=0;i<100;i++) {try {if((await fetch(url)).ok) break;} catch {} await new Promise(resolve=>setTimeout(resolve,100));}
  browser = process.env.GAME_SHADOW_CDP_URL ? await chromium.connectOverCDP(process.env.GAME_SHADOW_CDP_URL)
    : await chromium.launch({args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
  context = await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:dpr});
  const page = await context.newPage(); page.setDefaultTimeout(240_000);
  page.on('pageerror', error=>report.errors.push(error.message));
  page.on('console', message=>{if(message.type()==='error') report.errors.push(message.text());});
  page.on('requestfailed',request=>report.failures.push({url:request.url(),reason:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400) report.failures.push({url:response.url(),status:response.status()});});
  await page.route('**/assets/*.js', async route=>{
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/([A-Za-z_$][\w$]*)\.prepareLightingPrograms\(\)\.then\(/, '(globalThis.__containment=$1,$1.prepareLightingPrograms()).then(')
      .replace(/return new ([A-Za-z_$][\w$]*)\.CultivationLevelRuntime\(/, 'return globalThis.__cultivation=new $1.CultivationLevelRuntime(')
      .replace(/export\{([A-Za-z_$][\w$]*) as BlackoutLevelRuntime\};/, 'class __ExposedBlackout extends $1{constructor(...args){super(...args);globalThis.__blackout=this}}export{__ExposedBlackout as BlackoutLevelRuntime};');
    await route.fulfill({response,body});
  });
  const started = performance.now();
  await page.goto(`${url}?debug=1`,{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(()=>globalThis.__containment?.state==='running');
  report.loading.push({level:'containment',kind:'navigation plus loading and start',ms:performance.now()-started});
  report.environment = await page.evaluate(()=>{
    const renderer=globalThis.__containment.renderLayer.renderer,gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    return {userAgent:navigator.userAgent,gpu,performanceEvidence: /SwiftShader|llvmpipe|software/i.test(gpu)?'software correctness only':'physical GPU',
      timerAvailable:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,
      drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],exposure:renderer.toneMappingExposure};
  });
  console.log(report.environment);
  const checkpoint=async key=>{
    console.log(`Profiling ${key}`);
    const data=await page.evaluate(async ({name,singleSource})=>{
      const runtime=globalThis[name],layer=runtime.renderLayer,renderer=layer.renderer;
      const gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const originalRender=runtime.render; runtime.stop(); runtime.render=()=>{};
      const sourceStates=[];
      if(singleSource){
        layer.scene.traverse(o=>{if(o.isLight){sourceStates.push([o,o.castShadow]);o.castShadow=o.name===singleSource;}});
      }
      const restoreSources=()=>{for(const [source,castShadow] of sourceStates)source.castShadow=castShadow;};
      const camera=layer.cameraRig.camera;
      const sceneState=()=>({camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),sources:[]});
      const initial=sceneState();
      layer.scene.traverseVisible(o=>{if(o.isLight&&o.castShadow)initial.sources.push({name:o.name,type:o.type,intensity:o.intensity,position:o.getWorldPosition(camera.position.clone()).toArray(),
        target:o.target?.getWorldPosition(camera.position.clone()).toArray(),distance:o.distance,angle:o.angle,mapSize:o.shadow.mapSize.toArray(),autoUpdate:o.shadow.autoUpdate,needsUpdate:o.shadow.needsUpdate});});
      const counts=()=>({programs:renderer.info.programs.length,...renderer.info.memory,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
      const stats=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return{samples:values.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],max:sorted.at(-1)};};
      const frame=()=>new Promise(requestAnimationFrame);
      const blocks=[];
      try {
        if(singleSource&&!sourceStates.some(([o])=>o.name===singleSource))throw new Error(`Missing source: ${singleSource}`);
        for(const enabled of [false,true,true,false]){
          runtime.shadowRequest.update({enabled});
          for(let i=0;i<15;i++){await frame();layer.render();}
          const before=counts(),submission=[],cadence=[],queries=[];let previous=await frame();
          for(let i=0;i<60;i++){
            const now=await frame();cadence.push(now-previous);previous=now;
            const q=timer?gl.createQuery():null;if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);
            const start=performance.now();layer.render();submission.push(performance.now()-start);
            if(q){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(q);}
          }
          for(let i=0;i<120&&queries.some(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE));i++)await frame();
          const disjoint=timer?gl.getParameter(timer.GPU_DISJOINT_EXT):false;
          const incompleteGpuQueries=queries.filter(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)).length;
          const gpu=disjoint?[]:queries.filter(q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)).map(q=>gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
          queries.forEach(q=>gl.deleteQuery(q));
          blocks.push({enabled,kind:'frozen render only',before,after:counts(),disjoint,submittedGpuQueries:queries.length,incompleteGpuQueries,submissionMs:stats(submission),gpuMs:stats(gpu),frameCadenceMs:stats(cadence),raw:{submission,cadence,gpu}});
        }
        restoreSources();runtime.shadowRequest.update({enabled:true});runtime.render=originalRender;runtime.start();
        const continuous=[],cpu=[],queries=[];
        const originalFixed=runtime.fixedUpdate;let simulationMs=0;
        runtime.fixedUpdate=function(...args){const start=performance.now();try{return originalFixed.apply(this,args);}finally{simulationMs+=performance.now()-start;}};
        runtime.render=function(...args){const q=timer?gl.createQuery():null;if(q)gl.beginQuery(timer.TIME_ELAPSED_EXT,q);const start=performance.now();
          try{return originalRender.apply(this,args);}finally{cpu.push(performance.now()-start+simulationMs);simulationMs=0;continuous.push(args[1].rawFrameDeltaSeconds*1000);if(q){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(q);}}};
        try{const deadline=performance.now()+60_000;while(continuous.length<90){if(performance.now()>deadline)throw new Error('Running simulation did not produce 90 frames');await frame();}}finally{runtime.render=originalRender;runtime.fixedUpdate=originalFixed;}
        for(let i=0;i<120&&queries.some(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE));i++)await frame();
        const disjoint=timer?gl.getParameter(timer.GPU_DISJOINT_EXT):false;
        const incompleteGpuQueries=queries.filter(q=>!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)).length;
        const gpu=disjoint?[]:queries.filter(q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)).map(q=>gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);queries.forEach(q=>gl.deleteQuery(q));
        return{kind:singleSource?'isolated source at production spawn; other lights retain radiance but do not cast shadows':'production spawn; no traversal staging',singleSource,state:initial,blocks,continuous:{kind:'running fixed simulation plus presentation; original full light graph at idle spawn',frameCadenceMs:stats(continuous.slice(15)),cpuMs:stats(cpu.slice(15)),gpuMs:stats(gpu.slice(15)),disjoint,submittedGpuQueries:queries.length,incompleteGpuQueries,raw:{cadence:continuous,cpu,gpu}},
          preparation:runtime.lightingPrewarmProfile??runtime.preparationQueue?.diagnostics??runtime.programPreparation?.diagnostics};
      }finally{restoreSources();runtime.render=originalRender;runtime.shadowRequest.update({enabled:true});}
    },{name:key,singleSource:process.env.GAME_SHADOW_SINGLE_SOURCE});
    for(const block of data.blocks)assert.deepEqual(block.before.programs,block.after.programs,`${key}: settled block created programs`);
    report.checkpoints.push({level:key,...data});
    if(!process.env.GAME_SHADOW_SINGLE_SOURCE)await page.locator('canvas').screenshot({path:path.join(output,`${key}-on.png`)});
    if(process.env.GAME_SHADOW_SKIP_LIFECYCLE==='1')return;
    const cycles=await page.evaluate(async name=>{
      const r=globalThis[name],renderer=r.renderLayer.renderer;
      const counts=()=>({programs:renderer.info.programs.length,...renderer.info.memory});
      const restarts=[];for(let i=0;i<3;i++){r.restartLevel();for(let f=0;f<3;f++)await new Promise(requestAnimationFrame);restarts.push(counts());}
      r.stop();const original=r.render;r.render=()=>{};
      const reloads=[];
      try{for(let i=0;i<3;i++){
        const maps=[];r.renderLayer.scene.traverse(o=>{if(o.isLight&&o.shadow?.map)maps.push({light:o,map:o.shadow.map,freed:0});});
        for(const entry of maps)entry.map.addEventListener('dispose',()=>entry.freed++);
        r.unload();const released=maps.every(e=>e.freed===1&&e.light.shadow.map===null);
        r.load();await (name==='__containment'?r.prepareLightingPrograms():r.preparePresentation());
        original.call(r,0,{fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,stepsThisFrame:0,interpolationAlpha:0,droppedSimulationTimeSeconds:0,renderFps:60});
        reloads.push({...counts(),disposedMaps:maps.length,allDisposedOnce:released});
      }}finally{r.render=original;r.start();}
      return{restarts,reloads};
    },key);
    report.lifecycle.push({level:key,...cycles});
    console.log(JSON.stringify({level:key,...cycles}));
    for(const cycle of cycles.reloads)assert.equal(cycle.allDisposedOnce,true);
    // First reload may discard off-mode variants. Subsequent cycles must stabilize.
    for(const metric of ['programs','geometries','textures'])assert.ok(cycles.reloads[2][metric]<=cycles.reloads[1][metric],`${key}: reload ${metric} grew`);
  };
  await checkpoint('__containment');
  if(!process.env.GAME_SHADOW_SINGLE_SOURCE){
  await page.keyboard.press('F2');await page.locator('[data-action="complete-level"]').click();
  const cultivationStarted=performance.now();await page.locator('[data-action="enter-level"]').click();await page.waitForFunction(()=>globalThis.__cultivation?.state==='running');
  report.loading.push({level:'cultivation',kind:'menu handoff from debug completion API',ms:performance.now()-cultivationStarted});
  await checkpoint('__cultivation');
  await page.evaluate(()=>{const r=globalThis.__cultivation;r.resources.manager.unlock('volt');r.events.emit('completed',{levelId:'level-2',nextLevelId:'level-3'});});
  const blackoutStarted=performance.now();await page.locator('[data-action="enter-level"]').click();await page.waitForFunction(()=>globalThis.__blackout?.state==='running');
  report.loading.push({level:'blackout',kind:'menu handoff from completion event API',ms:performance.now()-blackoutStarted});
  await checkpoint('__blackout');
  }
  // The harness intentionally creates off-mode programs that production never
  // requests. Keep and explain the guard warning only when its counts exactly
  // match the warmed comparison variants; unexplained warnings still fail.
  const containment = report.checkpoints.find(c => c.level === '__containment');
  report.expectedComparisonWarnings = report.errors.filter(message => {
    if (!message.startsWith('Cold shader program regression after Level 1 warm-up.')) return false;
    const baseline = Number(message.match(/baselineProgramCount: (\d+)/)?.[1]);
    const observed = Number(message.match(/newProgramCount: (\d+)/)?.[1]);
    const knownCount=containment.singleSource?containment.blocks.some(b=>b.after.programs===observed):containment.blocks.every(b=>b.after.programs===observed);
    return baseline === containment.preparation.programsAfter && knownCount && observed > baseline;
  });
  assert.deepEqual(report.errors.filter(message => !report.expectedComparisonWarnings.includes(message)),[]);
  assert.deepEqual(report.failures,[]);
}finally{
  await writeFile(path.join(output,'measurements.json'),JSON.stringify(report,null,2)+'\n');
  await context?.close();await browser?.close();server?.kill();
}
