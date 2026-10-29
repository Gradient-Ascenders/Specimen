import { DIAGNOSTIC_OPTIONS, diagnosticOptions, launchDiagnosticBrowser } from '../lib/diagnostics.mjs';
/** #189: matched production render attribution, NOT a gameplay/FPS qualification.
 * Serve baseline/candidate dist separately; use the same browser/GPU/settings.
 * --cdp can drive an isolated native browser from Windows Node under WSL.
 * No game implementation is replaced: the bundle injection exposes the session.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values } = parseArgs({ options: {
  ...DIAGNOSTIC_OPTIONS,
  label: { type: 'string', default: 'candidate' },
  samples: { type: 'string', default: '20' },
  pose: { type: 'string' }, probe: { type: 'boolean', default: false },
} });
const diagnostic = diagnosticOptions(values, { output: `artifacts/light-budget/${values.label}` });
Object.assign(values, diagnostic);
assert.match(values.label, /^[a-zA-Z0-9_-]+$/);
const samples = Number(values.samples);
assert.ok(Number.isInteger(samples) && samples >= 8);
const output = diagnostic.output;
await mkdir(output, { recursive: true });
const report = { label: values.label, url: values.url, recordedAt: new Date().toISOString(),
  protocol: { content: 'authored Cultivation, production ?debug=1 (#197 unresolved)', viewport: [960,600], dpr: 1,
    scope: 'frozen full WebGL render, including transmission; ABBA updating/cached/cached/updating shadows; no sustained gameplay claim',
    probe:values.probe, onlyPose:values.pose??null, samples },
  assets: {}, loading: {}, poses: [], lifecycle: [], errors: [] };
const browser = await launchDiagnosticBrowser(diagnostic);
const context = await browser.newContext({ viewport: {width:960, height:600}, deviceScaleFactor:1 });
try {
  const page = await context.newPage(); page.setDefaultTimeout(240_000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.errors.push(`${request.failure()?.errorText}: ${request.url()}`));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()}: ${response.url()}`); });
  let injected = false;
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch(), body = await response.text();
    report.assets[route.request().url()] = createHash('sha256').update(body).digest('hex');
    const pattern = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    if (/\/index-[^/]+\.js$/.test(route.request().url())) {
      assert.match(body, pattern); injected = true;
      await route.fulfill({response, body: body.replace(pattern, '$1=globalThis.__lightingSession=new $2({initialRuntime:')});
    } else await route.fulfill({response,body});
  });
  const boot = performance.now();
  await page.goto(`${values.url}?debug=1`, {waitUntil:'domcontentloaded'});
  await page.locator('[data-action="start"]').click();
  report.loading.levelOneReadyMs = performance.now() - boot;
  assert.ok(injected);
  await page.keyboard.press('F2');
  await page.locator('[data-action="complete-level"]').click();
  const loading = performance.now();
  await page.locator('[data-action="enter-level"]').click();
  await page.waitForFunction(() => globalThis.__lightingSession.runtime.resources?.authoredPreview &&
    globalThis.__lightingSession.runtime.state === 'running');
  report.loading.levelTwoReadyMs = performance.now() - loading;
  report.environment = await page.evaluate(async () => {
    const r = globalThis.__lightingSession.runtime, gl = r.renderLayer.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    r.renderLayer.setAnimationLoop(null); r.stop();
    while(r.preparationQueue.busy) await new Promise(resolve=>setTimeout(resolve,16));
    return {userAgent:navigator.userAgent, gpu, timer:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
      software:/SwiftShader|llvmpipe|software/i.test(gpu), buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
      maxTextureImageUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      queue:{...r.preparationQueue.diagnostics}};
  });
  console.log(values.label, report.environment.gpu, report.loading);
  const poses = [
    {name:'room1-bob', room:1, character:'bob'},
    {name:'room3-bob', room:3, character:'bob'},
    {name:'lift-bob', room:4, character:'bob'},
    {name:'sewer-goop', room:5, character:'goop', local:[44,-10.54,122], eye:[44,-7,116.5]},
    {name:'route-bob', room:5, character:'bob', local:[-12.5,18.36,54], eye:[-4.5,22,42]},
    {name:'route-volt', room:5, character:'volt', local:[-12.5,18.36,54], eye:[-4.5,22,42]},
  ];
  for (const pose of poses.filter(pose=>!values.pose||pose.name===values.pose)) {
    const result = await page.evaluate(async ({pose,samples,probe}) => {
      const r = globalThis.__lightingSession.runtime, res = r.resources, layer = r.renderLayer;
      const renderer = layer.renderer, scene = layer.scene, camera = layer.cameraRig.camera;
      const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      r.teleportToAuthoredPreviewRoom(pose.room);
      // Use the real registration helper; merely unlocking Volt leaves no
      // registered body and can silently measure Bob twice.
      if (pose.character === 'volt') r.registerRescuedVolt(res);
      if (!res.manager.activate(pose.character) || res.manager.activeSlimeId !== pose.character) throw new Error('Requested actor was not activated');
      r.retargetCamera(res);
      const actor = res.manager.activeBody;
      if (pose.local) actor.teleport(res.authoredPreview.roomFive.root.localToWorld(actor.position.clone().set(...pose.local)));
      res.roomFiveEncounter.update(1/60);
      // Settle the real lighting transition before freezing render time. A
      // zero-delta render alone would retain the previous bright room's blend.
      res.scene.setDarkRoomLighting(pose.room===5,10,pose.room<=3);
      const stats = {fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:0,frameDeltaSeconds:0,stepsThisFrame:0,
        interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
      const tick = r.preparationQueue.tick; r.preparationQueue.tick = () => {};
      try { r.render(1,stats); } finally { r.preparationQueue.tick = tick; }
      if (pose.eye) {
        camera.position.copy(res.authoredPreview.roomFive.root.localToWorld(actor.position.clone().set(...pose.eye)));
        camera.lookAt(actor.position); camera.updateMatrixWorld(true);
      }
      res.authoredPreview.updatePresentationVisibility(camera.position, actor.position);
      const booster=scene.getObjectByName('room-5-platform-boosters'),calls={};
      if(probe)booster?.traverse(object=>{if(object.isMesh){const before=object.onBeforeRender;object.onBeforeRender=function(...args){calls[object.uuid]=(calls[object.uuid]??0)+1;before.apply(this,args);};}});
      let lastCounts, refreshed = false;
      const draw = () => {
        const action = () => {
          if (!refreshed) {renderer.compile(r.preparationLightState,camera,scene);refreshed=true;}
          lastCounts = {points:0,spots:0,pointShadows:0,spotShadows:0,radiant:0};
          scene.traverseVisible(light => {
            if (!light.isLight || !light.layers.test(camera.layers)) return;
            if (light.isPointLight) {lastCounts.points++; if(light.castShadow)lastCounts.pointShadows++;}
            if (light.isSpotLight) {lastCounts.spots++; if(light.castShadow)lastCounts.spotShadows++;}
            if (light.intensity > 0 && light.color.r + light.color.g + light.color.b > 0) lastCounts.radiant++;
          });
          r.cameraShadowCulling?.prepare(camera);
          try {layer.render();} finally {r.cameraShadowCulling?.restore();}
        };
        if (r.lightLayout.withLayout) r.lightLayout.withLayout(scene,camera,actor.position,action);
        else {r.lightLayout.sync(scene); action();}
      };
      const wait = () => new Promise(resolve => setTimeout(resolve, 0));
      const summary = values => {
        const sorted=[...values].sort((a,b)=>a-b);
        return values.length ? {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,
          p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]} : null;
      };
      const modes = [];
      const beforeWarm = renderer.info.programs.length, warm = performance.now();
      for (let i=0;i<5;i++) {draw(); await wait();}
      gl.finish();
      const warmupMs = performance.now()-warm, warmedPrograms = renderer.info.programs.length;
      const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate;
      try {
        for (const cached of [false,true,true,false]) {
          const cpu=[], queries=[];
          renderer.shadowMap.autoUpdate = !cached; renderer.shadowMap.needsUpdate = false;
          for (let i=0;i<samples;i++) {
            const query = timer ? gl.createQuery() : null;
            if(query) {if(gl.getQuery(timer.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw new Error('Another timer owns the query scope');gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}
            const start=performance.now(); draw(); cpu.push(performance.now()-start);
            if(query) {gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);}
            gl.flush(); await wait();
          }
          const deadline=performance.now()+30_000;
          while(queries.some(query=>!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)) && performance.now()<deadline) await wait();
          const disjoint=timer ? !!gl.getParameter(timer.GPU_DISJOINT_EXT) : false;
          const incomplete=queries.filter(query=>!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)).length;
          const gpu=disjoint ? [] : queries.filter(query=>gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)).map(query=>gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
          queries.forEach(query=>gl.deleteQuery(query));
          modes.push({cachedShadows:cached,counts:lastCounts,disjoint,incomplete,cpu:summary(cpu),gpu:summary(gpu),raw:{cpu,gpu}});
        }
      } finally {renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;}
      draw();
      const image=renderer.domElement.toDataURL('image/png').split(',')[1];
      const boosterDiagnostics=[];
      if(probe)booster?.traverse(object=>{if(object.isMesh)boosterDiagnostics.push({name:object.name,material:object.material.type,
        drawCalls:calls[object.uuid]??0,visible:object.visible,mask:object.layers.mask,count:object.count,
        world:object.matrixWorld.toArray(),bounds:object.boundingSphere?.toArray?.()??{center:object.boundingSphere?.center.toArray(),radius:object.boundingSphere?.radius},
        instance:Array.from(object.instanceMatrix?.array.slice(0,16)??[]),opacity:object.material.opacity,
        time:renderer.properties.get(object.material).uniforms?.uBoosterTime?.value});});
      const probeImages={};
      if(probe&&booster){
        booster.traverse(object=>{if(object.isMesh)object.frustumCulled=false;});draw();
        probeImages.noCull=renderer.domElement.toDataURL('image/png').split(',')[1];
        booster.traverse(object=>{if(object.isMesh){if(object.instanceMatrix)object.instanceMatrix.needsUpdate=true;object.material.needsUpdate=true;}});draw();
        probeImages.reupload=renderer.domElement.toDataURL('image/png').split(',')[1];
      }
      const states=[];
      if(pose.room===5) for(const power of ['red','blue','green','released','reset','red','blue','green','reset']) {
        if(power==='released')res.authoredPreview.roomFive.controller.security.release();
        else if(power==='reset')res.authoredPreview.roomFive.controller.security.reset();
        else res.authoredPreview.roomFive.controller.security.select(power);
        res.roomFiveEncounter.update(1/60);draw();
        let maps=0;scene.traverse(light=>{if(light.isLight&&light.shadow?.map)maps++;});
        states.push({power,counts:lastCounts,programs:renderer.info.programs.length,maps});
      }
      const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`GL error ${error}`);
      return {camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),actor:actor.position.toArray(),
        character:res.manager.activeSlimeId,darkBlend:res.scene.root.userData.darkRoomBlend,
        warmupMs,beforeWarm,warmedPrograms,programsAfter:renderer.info.programs.length,
        budget:r.lightLayout.diagnostics,modes,states,image,boosterDiagnostics,probeImages};
    }, {pose,samples,probe:values.probe});
    await writeFile(path.join(output, `${pose.name}.png`), Buffer.from(result.image,'base64')); delete result.image;
    for(const [name,image]of Object.entries(result.probeImages))await writeFile(path.join(output,`${pose.name}-${name}.png`),Buffer.from(image,'base64'));
    delete result.probeImages;
    report.poses.push({name:pose.name,...result});
    for(const mode of result.modes) {assert.equal(mode.disjoint,false);assert.equal(mode.incomplete,0);}
    console.log(pose.name, result.modes.map(mode=>({cached:mode.cachedShadows,counts:mode.counts,gpu:mode.gpu?.p50})), 'programs',result.programsAfter);
  }
  report.lifecycle = await page.evaluate(() => {
    const r=globalThis.__lightingSession.runtime, renderer=r.renderLayer.renderer, rows=[];
    for(let i=0;i<3;i++) {r.restartLevel();rows.push({programs:renderer.info.programs.length,...renderer.info.memory});}
    const entries=[];r.renderLayer.scene.traverse(light=>{if(light.isLight&&light.shadow?.map)entries.push({light,map:light.shadow.map,disposed:0});});
    for(const entry of entries)entry.map.addEventListener('dispose',()=>entry.disposed++);
    r.unload();
    return {restarts:rows,mapsAtUnload:entries.length,allMapsReleasedOnce:entries.every(entry=>entry.disposed===1&&entry.light.shadow.map===null)};
  });
  assert.equal(report.lifecycle.allMapsReleasedOnce,true);
  assert.deepEqual(report.errors,[]);
} finally {
  await writeFile(path.join(output,'raw.json'),JSON.stringify(report,null,2));
  await context.close(); await browser.close();
}
console.log(`Saved ${output}`);
