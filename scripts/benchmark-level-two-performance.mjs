import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GRAPHICS_PROFILES} from '../src/render/GraphicsProfiles.ts';
// Real hardware only: connect to Chrome started with --remote-debugging-port.
const base=process.env.PERF_BASE??'http://127.0.0.1:4173/group-folder/';
const label=process.env.PERF_LABEL??new Date().toISOString().replaceAll(':','-'),out=`artifacts/level-two-performance/${label}`;
const shaderSalt=Number(process.env.PERF_SHADER_SALT??0);
if(!Number.isInteger(shaderSalt)||shaderSalt<0||shaderSalt>1_000_000)throw Error('PERF_SHADER_SALT must be an integer from 0 to 1000000 (0 disables the diagnostic).');
await mkdir(out,{recursive:true});
const endpoint=process.env.SPECIMEN_CDP_URL;
if(!endpoint)throw Error('Set SPECIMEN_CDP_URL to your hardware-accelerated Chrome debug endpoint (HTTP or WebSocket).');
let socket=endpoint;
if(!endpoint.startsWith('ws')){
 const url=new URL(endpoint),version=await(await fetch(new URL('/json/version',url))).json();
 const target=new URL(version.webSocketDebuggerUrl);target.host=url.host;socket=target.href;
}
const browser=await chromium.connectOverCDP(socket);
const report={label,shaderSalt,build:JSON.parse(await readFile((process.env.PERF_DIST??'dist')+'/build-manifest.json','utf8')),protocol:'Medium 1920x1080 DPR1; fresh contexts and routed module disable HTTP cache; shared uncontrolled driver cache. Optional source-salted fragment shaders exercise uncached variants; they do not reset the driver. Live initial gameplay plus separately labelled staged render-only views. Actual renderer is recorded; results qualify only the measured machine and route.',runs:[],errors:[]};
const summary=rows=>{const values=rows.filter(Number.isFinite).sort((a,b)=>a-b);return {n:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],max:values.at(-1)};};
try{
 for(let run=0;run<Number(process.env.PERF_REPEATS??2);run++){
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(240_000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text()))report.errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(({settings,shaderSalt})=>{
   // Diagnostic contexts only: negligible output offset changes compiler input
   // without deleting a user's browser/driver cache. Use a new salt per probe.
   if(shaderSalt){
    const source=WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource=function(shader,text){
     if(this.getShaderParameter(shader,this.SHADER_TYPE)===this.FRAGMENT_SHADER&&text.includes('gl_FragColor'))text=text.replace(/}\s*$/,'gl_FragColor.r += '+shaderSalt+'e-24;\n}');
     return source.call(this,shader,text);
    };
   }
   localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
   const p=window.__cvPerf={phases:[],longTasks:[],rows:[],firstControl:0,requestedAt:0,sample:false,queries:[],label:'live',queryEvery:4};
   new PerformanceObserver(list=>{for(const e of list.getEntries())if(p.longTasks.length<256)p.longTasks.push({at:e.startTime,ms:e.duration});}).observe({entryTypes:['longtask']});
   const phase=(object,key,name)=>{const original=object[key];if(!original)return;object[key]=function(...args){const start=performance.now();try{const result=original.apply(this,args);if(result?.then)return result.then(value=>{p.phases.push({name,ms:performance.now()-start});return value;});p.phases.push({name,ms:performance.now()-start});return result;}catch(error){p.phases.push({name,ms:performance.now()-start,error:String(error)});throw error;}};};
   let runtime;
   Object.defineProperty(window,'__cv',{get:()=>runtime,set:r=>{
    runtime=r;const load=r.load;r.load=function(...args){const start=performance.now(),result=load.apply(this,args);p.phases.push({name:'construct',ms:performance.now()-start});
     const res=r.resources;phase(res.lightingPass,'prepare','lighting');phase(res.bobReflectionEnvironment,'prepare','radiance');
     for(const [key,name]of [['bobPresentation','bob'],['goopPresentation','goop'],['voltPresentation','volt']])phase(res[key],'prepare',name);
     return result;
    };
    phase(r,'preparePresentation','presentation');phase(r,'prepareRenderResources','live-resources');
    const renderer=r.renderLayer.renderer,gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');p.timer=!!ext;
    const debug=gl.getExtension('WEBGL_debug_renderer_info');p.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    let current,frame=0;
    for(const [name,index,instances] of [['drawElements',1,-1],['drawArrays',2,-1],['drawElementsInstanced',1,4],['drawArraysInstanced',2,3]]){
     const fn=gl[name];gl[name]=function(...args){if(current){current.calls++;if(args[0]===gl.TRIANGLES)current.triangles+=args[index]/3*(instances<0?1:args[instances]);}return fn.apply(this,args);};
    }
    for(const name of ['bufferData','texImage2D','texImage3D','texStorage2D','texStorage3D','compressedTexImage2D']){
     const fn=gl[name];gl[name]=function(...args){if(current)current.uploads++;return fn.apply(this,args);};
    }
    const render=r.render;r.render=function(...args){
     const active=r.state==='running'&&r.input.enabled&&!r.ventArrival.active;
     if(active&&!p.firstControl)p.firstControl=performance.now();
     if(!p.sample||p.rows.length>6000)return render.apply(this,args);
     const row={label:p.label,cpuMs:0,calls:0,triangles:0,uploads:0,intervalMs:args[1].rawFrameDeltaSeconds*1000,newPrograms:0,gpuMs:null};
     const before=renderer.info.programs.length,start=performance.now();let query;
     if(ext&&frame++%p.queryEvery===0){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
     current=row;try{return render.apply(this,args);}finally{current=undefined;row.cpuMs=performance.now()-start;row.newPrograms=renderer.info.programs.length-before;
      if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);p.queries.push({query,row});}p.rows.push(row);
     }
    };
   }});
  },{settings:GRAPHICS_PROFILES.standard.settings,shaderSalt:shaderSalt?shaderSalt+run:0});
  await page.route('**/assets/index-*.js',async route=>{const response=await route.fetch(),body=await response.text(),pattern=/return new ([\w$]+)\.CultivationLevelRuntime\(/;expect(body).toMatch(pattern);await route.fulfill({response,body:body.replace(pattern,'return globalThis.__cv=new $1.CultivationLevelRuntime(')});});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="level-select"]').click();
  await page.evaluate(()=>window.__cvPerf.requestedAt=performance.now());
  await page.getByRole('button',{name:'Level 2 Cultivation',exact:true}).click();
  await page.getByRole('button',{name:'Enter Level 2',exact:true}).waitFor({state:'visible',timeout:240_000});
  const ready=await page.evaluate(()=>({at:performance.now(),queue:structuredClone(window.__cv.preparationQueue.diagnostics),phases:window.__cvPerf.phases,requested:window.__cvPerf.requestedAt}));
  console.log(`${label} ${run}: ready in ${((ready.at-ready.requested)/1000).toFixed(2)}s`);
  await page.getByRole('button',{name:'Enter Level 2',exact:true}).click();
  await page.waitForFunction(()=>window.__cvPerf.firstControl>0,{timeout:240_000});
  await page.evaluate(()=>window.__cvPerf.sample=true);
  for(let i=0;i<(process.env.PERF_LOAD_ONLY?1:run===0?6:2);i++){
   await page.keyboard.down('KeyA');await page.waitForTimeout(150);await page.keyboard.up('KeyA');
   await page.keyboard.down('KeyD');await page.waitForTimeout(150);await page.keyboard.up('KeyD');
   await page.waitForTimeout(300);
  }
  await page.evaluate(()=>window.__cvPerf.sample=false);
  const result={run,requestToReadyMs:ready.at-ready.requested,phases:ready.phases,queue:ready.queue,poses:[],live:null};
  if(run===0&&!process.env.PERF_LOAD_ONLY){
   await page.evaluate(()=>{window.__cv.renderLayer.setAnimationLoop(null);window.__cv.stop();});
   const poses=[['room-1',1,'roomOne',[-11,.66,5.5],[-11,3.2,5.5],[0,8,28]],['room-2',2,'roomTwo',[0,.66,3],[8,5,4],[-5,13,28]],['room-3',3,'roomThree',[0,.66,3],[1,5,3],[0,13,46]],['room-4',4,'roomFour',[0,.66,4],[0,4,2],[0,4,13]],['room-5',5,'roomFive',[-12,10.66,23],[-12,13,20],[0,26,50]],['sewer',5,'roomFive',[40,-9,30],[40,-8,24],[40,-9,85]]];
   for(const [name,room,owner,body,eye,target]of poses){
    if(process.env.PERF_VIEWS&&!process.env.PERF_VIEWS.split(',').includes(name))continue;
    const pose=await page.evaluate(async({name,room,owner,body,eye,target,referenceScale})=>{
     const r=window.__cv,res=r.resources,layer=r.renderLayer,p=res.authoredPreview,frame=()=>new Promise(requestAnimationFrame);
     r.teleportToAuthoredPreviewRoom(room);const root=p[owner].root;
     const at=root.localToWorld(res.pair.bobBody.position.clone().fromArray(body));res.pair.bobBody.teleport(at);res.pair.goopBody.teleport(at.clone().add({x:1,y:0,z:0}));
     const camera=layer.cameraRig.camera,originalUpdate=layer.cameraRig.update;
     const position=root.localToWorld(at.clone().fromArray(eye)),look=root.localToWorld(at.clone().fromArray(target));
     layer.cameraRig.update=()=>{camera.position.copy(position);camera.lookAt(look);camera.updateMatrixWorld(true);};
     const stats={rawFrameDeltaSeconds:1/60,frameDeltaSeconds:1/60,stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:60};
     const draw=()=>r.render(1,stats);
     window.__cvPerf.label=name+':arrival';window.__cvPerf.sample=true;
     const started=performance.now();for(let i=0;i<600;i++){await frame();draw();if(!r.preparationQueue.diagnostics.pending&&i>18)break;}
     window.__cvPerf.sample=false;
     const variants=['arrival'];
     const cullPrepare=p.roomFiveCulling?.prepare,cullRestore=p.roomFiveCulling?.restore;
     const scale=layer.renderer.transmissionResolutionScale;
     for(const variant of referenceScale>0?['baseline','reference-capture','baseline']:['baseline','unculled','baseline']){
      layer.renderer.transmissionResolutionScale=variant==='reference-capture'?referenceScale:scale;
      if(p.roomFiveCulling){p.roomFiveCulling.prepare=variant==='unculled'?()=>{}:cullPrepare;p.roomFiveCulling.restore=variant==='unculled'?()=>{}:cullRestore;}
      for(let i=0;i<8;i++){await frame();draw();}
      window.__cvPerf.label=name+':'+variant;window.__cvPerf.queryEvery=1;window.__cvPerf.sample=true;
      for(let i=0;i<32;i++){await frame();draw();}
      window.__cvPerf.sample=false;variants.push(variant);
     }
     layer.renderer.transmissionResolutionScale=scale;
     if(p.roomFiveCulling){p.roomFiveCulling.prepare=cullPrepare;p.roomFiveCulling.restore=cullRestore;}
     const pixelChecks=[],captureImages={};if(p.roomFiveCulling&&room===5){
      const gl=layer.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,zero={...stats,rawFrameDeltaSeconds:0,frameDeltaSeconds:0};
      const pixels=()=>{r.render(1,zero);const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
      const enabled=pixels();p.roomFiveCulling.prepare=()=>{};p.roomFiveCulling.restore=()=>{};const disabled=pixels();
      let components=0,total=0,max=0;for(let i=0;i<enabled.length;i++){const delta=Math.abs(enabled[i]-disabled[i]);if(delta>2)components++;total+=delta;max=Math.max(max,delta);}
      pixelChecks.push({componentsAbove2:components,meanDelta:total/enabled.length,maxDelta:max});p.roomFiveCulling.prepare=cullPrepare;p.roomFiveCulling.restore=cullRestore;
      if(referenceScale>0){
       pixels();captureImages.balanced=layer.renderer.domElement.toDataURL('image/png');
       layer.renderer.transmissionResolutionScale=referenceScale;const reference=pixels();captureImages.reference=layer.renderer.domElement.toDataURL('image/png');
       let changed=0,delta=0,peak=0;for(let i=0;i<enabled.length;i++){const d=Math.abs(enabled[i]-reference[i]);if(d>2)changed++;delta+=d;peak=Math.max(peak,d);}
       pixelChecks.push({captureComparison:true,componentsAbove2:changed,meanDelta:delta/enabled.length,maxDelta:peak});
       layer.renderer.transmissionResolutionScale=scale;pixels();
      }
     }
     const counts={};layer.scene.traverseVisible(o=>{counts[o.type]=(counts[o.type]??0)+1;});
     layer.cameraRig.update=originalUpdate;
     return {name,variants,counts,pixelChecks,captureImages,captureScale:scale,referenceScale,culling:p.roomFiveCulling?.diagnostics,transitionMs:performance.now()-started,error:layer.renderer.getContext().getError()};
    },{name,room,owner,body,eye,target,referenceScale:Number(process.env.PERF_REFERENCE_TRANSMISSION_SCALE??0)});
    for(const [kind,url]of Object.entries(pose.captureImages))await writeFile(`${out}/${name}-${kind}.png`,Buffer.from(url.split(',')[1],'base64'));
    delete pose.captureImages;
    result.poses.push(pose);await page.screenshot({path:`${out}/${name}.png`});console.log(label,'POSE',name);
   }
  }
  const data=await page.evaluate(async()=>{
   const r=window.__cv,p=window.__cvPerf,gl=r.renderLayer.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
   for(let i=0;i<120&&p.queries.some(({query})=>!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE));i++)await new Promise(requestAnimationFrame);
   const disjoint=timer&&gl.getParameter(timer.GPU_DISJOINT_EXT);
   for(const {query,row}of p.queries){if(!disjoint&&gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))row.gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);}
   return {gpu:p.gpu,firstControlMs:p.firstControl-p.requestedAt,rows:p.rows,longTasks:p.longTasks,disjoint,error:gl.getError(),queue:r.preparationQueue.diagnostics,resources:r.renderLayer.getGraphicsDiagnostics(),art:r.resources.authoredPreview.blenderArt.diagnostics};
  });
  result.data=data;const live=data.rows.filter(row=>row.label==='live');result.live={cpu:summary(live.map(r=>r.cpuMs)),cadence:summary(live.map(r=>r.intervalMs)),gpu:summary(live.map(r=>r.gpuMs)),uploads:live.filter(r=>r.uploads).length,newPrograms:live.reduce((n,r)=>n+r.newPrograms,0)};
  expect(data.error).toBe(0);expect(result.live.uploads).toBe(0);expect(result.live.newPrograms).toBe(0);
  for(const pose of result.poses){pose.samples={};for(const variant of new Set(pose.variants)){const rows=data.rows.filter(r=>r.label===pose.name+':'+variant);pose.samples[variant]={cpu:summary(rows.map(r=>r.cpuMs)),gpu:summary(rows.map(r=>r.gpuMs)),calls:summary(rows.map(r=>r.calls)),triangles:summary(rows.map(r=>r.triangles)),uploads:rows.filter(r=>r.uploads).length,newPrograms:rows.reduce((n,r)=>n+r.newPrograms,0)};}}
  report.runs.push(result);await writeFile(`${out}/results.json`,JSON.stringify(report,null,2));
  console.log(`${label} ${run}: ${result.live.cpu.n} live frames; ${result.live.uploads} allocation frames, ${result.live.newPrograms} new programs; report: ${out}/results.json`);
  await context.close();
 }
 expect(report.errors).toEqual([]);
}finally{await writeFile(`${out}/results.json`,JSON.stringify(report,null,2));await browser.close();}
