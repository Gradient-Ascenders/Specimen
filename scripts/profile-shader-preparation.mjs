/** #191 production diagnostic; bundle edits expose owners only. No renderer patch.
 * node scripts/profile-shader-preparation.mjs --label before --runs 2 --channel msedge
 * Warm means a second navigation in the SAME context; driver cache is uncontrolled.
 * Timer/inspection instrumentation is identical before/after; not Wits qualification.
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import path from 'node:path';
const { values } = parseArgs({ options: {
  label: { type:'string', default:'candidate' }, runs: { type:'string', default:'2' },
  channel: { type:'string', default:'msedge' }, profile:{type:'string',default:'minimum'},
  headed:{type:'boolean',default:false}, url:{type:'string',default:'http://127.0.0.1:4191/'},
  trace:{type:'boolean',default:false},
  opening:{type:'string',default:'natural'},
  suppressSpeculation:{type:'boolean',default:false},
  backgroundBatch:{type:'string',default:'unchanged'},
  sweep:{type:'boolean',default:false},
  dist:{type:'string',default:'dist'},
} });
if (!/^[\w-]+$/.test(values.label) || !['minimum','standard'].includes(values.profile)) throw Error('Invalid label/profile');
if(!['natural','skip'].includes(values.opening))throw Error('Invalid opening route');
const startupRoute=`opening-${values.opening}-v1`;
const runs = Number(values.runs); if (!Number.isInteger(runs) || runs < 1) throw Error('Invalid runs');
const backgroundBatch=values.backgroundBatch==='unchanged'?undefined:Number(values.backgroundBatch);
if(backgroundBatch!==undefined&&(!Number.isInteger(backgroundBatch)||backgroundBatch<1||backgroundBatch>8))throw Error('Invalid diagnostic batch size');
const output = path.resolve('artifacts/shader-preparation', values.label); await mkdir(output,{recursive:true});
const hashes = {};
for (const file of await readdir(path.join(values.dist,'assets'))) if (file.endsWith('.js')) hashes[file] = createHash('sha256').update(await readFile(path.join(values.dist,'assets',file))).digest('hex');
const report = { schema:2, recordedAt:new Date().toISOString(), protocol:{...values, requestedStartupRoute:startupRoute, viewport:[960,600],dpr:1,
  route:'ordinary production; controller-staged completion/room entries; bounded real input; not full puzzle playthrough',
  cache:'fresh browser per pair; warm navigation in same context; HTTP routing disables HTTP cache; OS/driver cache uncontrolled'}, hashes, runs:[] };
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--outDir',values.dist,'--host','127.0.0.1','--port','4191','--strictPort'],{stdio:'ignore',windowsHide:true});
let browser;
try {
  for (let n=0;n<100;n++) { try { if ((await fetch(values.url)).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  for (let pair=0;pair<runs;pair++) {
    browser = await chromium.launch({channel:values.channel,headless:!values.headed,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
    const context = await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1});
    const page = await context.newPage(); page.setDefaultTimeout(300_000);
    await page.addInitScript(diagnosticGL => {
      const capture = globalThis.__shaderCapture = {phases:[],compiles:[],draws:[],gl:[],sources:[],frames:[],waits:[],gpu:[]};
      let phase='boot', owner='boot'; const sources = new WeakMap();
      for (const method of ['shaderSource','getProgramInfoLog','getShaderInfoLog','bufferData','bufferSubData','texImage2D','texSubImage2D','texImage3D','texSubImage3D','texStorage2D','texStorage3D','renderbufferStorage','renderbufferStorageMultisample', ...diagnosticGL ? ['drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced','useProgram','getProgramParameter'] : []]) {
        const original = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function(...args) {
          const start=performance.now();
          try { if(method==='shaderSource') { sources.set(args[0],args[1]); capture.sources.push({owner,phase,source:args[1]}); } return original.apply(this,args); }
          finally { capture.gl.push({owner,phase,method,start,ms:performance.now()-start}); }
        };
      }
      globalThis.__attachRuntime = (r,name) => {
        name ??= r.authoredRoomOne ? 'three' : 'two'; owner=name;
        const layer=r.renderLayer, renderer=layer.renderer;
        renderer.__shaderCaptureRuntime=r;
        if(!renderer.__shaderCapture) {
          renderer.__shaderCapture=true;
          const gl=renderer.getContext(), timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
          const pending=[];
          const live=layer.render;
          layer.render=function(...args) {
            while(pending.length && gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)) {
              const {query,entry}=pending.shift();
              entry.status=gl.getParameter(timer.GPU_DISJOINT_EXT)?'disjoint':'valid';
              if(entry.status==='valid') entry.ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
              gl.deleteQuery(query);
            }
            const entry={owner,start:performance.now(),status:timer?'pending':'unsupported',programsBefore:renderer.info.programs.length};
            capture.gpu.push(entry);
            const query=timer?gl.createQuery():undefined;
            if(query) gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
            const previousPhase=phase;phase='gameplay-live';
            try{return live.apply(this,args);}finally{entry.newPrograms=renderer.info.programs.length-entry.programsBefore;phase=previousPhase;if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push({query,entry});}}
          };
          const compile=renderer.compileAsync;
          renderer.compileAsync=function(...args) {
            const config=this.__shaderCaptureRuntime.preparationQueue?.active;
            const entry={owner,phase,start:performance.now(),objects:args[0].children.length,before:this.info.programs.length,
              configuration:config?{z:config.z,dark:config.dark,visible:config.visible,lightingKey:config.lightingKey}:undefined};
            capture.compiles.push(entry);
            const result=compile.apply(this,args); entry.submitMs=performance.now()-entry.start;
            return result.then(value=>{entry.elapsedMs=performance.now()-entry.start;entry.after=this.info.programs.length;return value;});
          };
          const draw=renderer.render;
          renderer.render=function(...args) {
            const cinematic=document.querySelector('.game-flow')?.getAttribute('data-state')==='opening' &&
              args[0]!==this.__shaderCaptureRuntime.renderLayer.scene && !this.getScissorTest();
            const previous=phase; phase=phase==='gameplay-live'?'gameplay-live':cinematic?'cinematic-live':'primer';
            const entry={owner,phase,start:performance.now(),before:this.info.programs.length};
            try {return draw.apply(this,args);} finally {entry.ms=performance.now()-entry.start;entry.after=this.info.programs.length;capture.draws.push(entry);phase=previous;}
          };
        }
        for (const method of ['load','prepareLightingPrograms','preparePresentation','prepareGraphics']) if (r[method]) {
          const original=r[method];r[method]=function(...args) {
            owner=name;const entry={owner,method,start:performance.now()};capture.phases.push(entry);
            const result=original.apply(this,args); if(result?.then) return result.finally(()=>entry.ms=performance.now()-entry.start);
            entry.ms=performance.now()-entry.start;return result;
          };
        }
        let fixedMs=0;
        const fixed=r.fixedUpdate;
        r.fixedUpdate=function(...args){const start=performance.now();try{return fixed.apply(this,args);}finally{fixedMs+=performance.now()-start;}};
        const render=r.render;let waiting;
        r.render=function(alpha,stats) {
          owner=name;const start=performance.now(),before=renderer.info.programs.length,beforeDraws=capture.gpu.length;
          try{return render.call(this,alpha,stats);} finally {
            const pending=!!this.preparationQueue?.diagnostics.pending;
            if(pending && waiting===undefined) waiting=start;
            if(!pending && waiting!==undefined){capture.waits.push({owner,start:waiting,ms:performance.now()-waiting});waiting=undefined;}
            capture.frames.push({owner,start,ms:performance.now()-start,deltaMs:stats.rawFrameDeltaSeconds*1000,state:this.state,pending,
              drawn:capture.gpu.length>beforeDraws,fixedMs,droppedSimulationTimeSeconds:stats.droppedSimulationTimeSeconds,
              input:this.input.enabled,gameplay:this.resources?.deathSequence?.state,
              position:this.resources?.pair?.activeBody?{...this.resources.pair.activeBody.position}:undefined,
              programs:renderer.info.programs.length,newPrograms:renderer.info.programs.length-before,
              focused:document.hasFocus(),visible:document.visibilityState});
            fixedMs=0;
          }
        };
        return r;
      };
      globalThis.__makeRuntime=(C,options)=>globalThis.__attachRuntime(new C(options));
    },values.trace);
    await page.route('**/assets/*.js',async route=>{
      const response=await route.fetch();let body=await response.text();
      if(backgroundBatch!==undefined && /\/CultivationLevelRuntime-[^/]+\.js$/.test(route.request().url())) {
        const pattern=/(\.slice\([\w$]+,[\w$]+\+\(this\.priority===[\w$]+\?32:)[18](\)\))/g;
        const matches=[...body.matchAll(pattern)];
        if(matches.length!==1)throw Error('Expected one diagnostic background batch site');
        body=body.replace(pattern,(_all,prefix,suffix)=>prefix+backgroundBatch+suffix);
      }
      body=body.replace(/([\w$]+)=new ([\w$]+)\(\{initialRuntime:([\w$]+)/,'$1=globalThis.__shaderSession=new $2({initialRuntime:globalThis.__attachRuntime($3,"one")');
      body=body.replace(/return new ([\w$]+)\.CultivationLevelRuntime\(/,'return globalThis.__makeRuntime($1.CultivationLevelRuntime,');
      body=body.replace(/return new ([\w$]+)\.BlackoutLevelRuntime\(/,'return globalThis.__makeRuntime($1.BlackoutLevelRuntime,');
      await route.fulfill({response,body});
    });
    for (const cache of ['fresh-browser','warm-browser']) {
      const errors=[]; const onError=e=>errors.push(e.message); const onConsole=m=>{if(m.type()==='error') errors.push(m.text());};
      page.on('pageerror',onError);page.on('console',onConsole);
      const row={pair,cache,startupRoute,browser:browser.version(),errors};report.runs.push(row);
      console.log(values.label,pair,cache,'boot');
      await page.goto(values.url,{waitUntil:'domcontentloaded'});
      await page.locator('[data-flow-panel="title"] [data-action="start"]').waitFor({state:'visible'});
      row.titleReadyAt=await page.evaluate(()=>performance.now());
      if(values.profile==='standard') {
        await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
        row.settingsRequestedAt=await page.evaluate(()=>performance.now());
        await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
        await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
      }
      await page.evaluate(()=>{
        const host=document.querySelector('#app'),flow=document.querySelector('.game-flow');
        globalThis.__openingTimings=[];
        new MutationObserver(()=>__openingTimings.push({at:performance.now(),flow:flow.dataset.state,
          state:host.dataset.openingState,stage:host.dataset.openingStage})).observe(host,{attributes:true,subtree:true,attributeFilter:['data-state','data-opening-state','data-opening-stage']});
      });
      row.startAt=await page.evaluate(()=>performance.now());
      await page.locator('[data-flow-panel="title"] [data-action="start"]').click();
      const hasOpening=await page.locator('.game-flow').getAttribute('data-state')==='opening';
      row.startupRoute=hasOpening?startupRoute:'pre-cinematic-v1';
      if(values.opening==='skip'&&hasOpening)await page.locator('[data-action="skip-opening"]').click();
      await page.waitForFunction(()=>globalThis.__shaderSession.runtime.state==='running'&&globalThis.__shaderSession.runtime.input.enabled);
      await page.waitForFunction(t=>__shaderCapture.frames.some(f=>f.owner==='one'&&f.state==='running'&&f.drawn&&f.start>=t),row.startAt);
      row.navigationToControlMs=await page.evaluate(()=>performance.now()); row.startToControlMs=row.navigationToControlMs-row.startAt;
      row.opening=await page.evaluate(()=>{const timeline=__openingTimings;
        const start=timeline.find(x=>x.flow==='opening')?.at, handoff=timeline.find(x=>x.flow==='playing')?.at;
        return {timeline,startAt:start,handoffAt:handoff,elapsedMs:handoff-start,
          scope:'Opening wall time includes overlapping Level 1 preparation; it is separate from Level 2 waiting.'};});
      row.levelOnePreparation=await page.evaluate(()=>{
        const rt=__shaderSession.runtime;
        return {profile:rt.lightingPrewarmProfile,verification:rt.levelOnePrewarmVerification,
          programs:rt.renderLayer.renderer.info.programs.length,resources:{...rt.renderLayer.renderer.info.memory}};
      });
      row.levelTwoTransitionAt=await page.evaluate(()=>{const t=performance.now();globalThis.__shaderSession.runtime.resources.containmentLevel.completeForDebug();return t;});
      await page.locator('[data-action="enter-level"]').waitFor({state:'visible'});
      row.levelTwoEnterAt=await page.evaluate(()=>performance.now());
      await page.locator('[data-action="enter-level"]').click();
      await page.waitForFunction(()=>globalThis.__shaderSession.runtime.resources?.authoredPreview&&globalThis.__shaderSession.runtime.state==='running'&&globalThis.__shaderSession.runtime.input.enabled);
      await page.waitForFunction(t=>__shaderCapture.frames.some(f=>f.owner==='two'&&f.state==='running'&&f.drawn&&f.start>=t),row.levelTwoEnterAt);
      row.levelTwoReadyMs=await page.evaluate(()=>performance.now());row.levelTwoEnterToControlMs=row.levelTwoReadyMs-row.levelTwoEnterAt;row.levelTwoLoadMs=row.levelTwoReadyMs-row.levelTwoTransitionAt;
      row.environment=await page.evaluate(()=>{
        const r=__shaderSession.runtime,gl=r.renderLayer.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {userAgent:navigator.userAgent,gpu:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),extensions:gl.getSupportedExtensions(),
          graphics:r.renderLayer.getGraphicsDiagnostics(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,shaderErrors:r.renderLayer.renderer.debug.checkShaderErrors};
      });
      if(values.sweep) row.sweep=await page.evaluate(async()=>{
        const rt=__shaderSession.runtime,r=rt.resources,rig=rt.renderLayer.cameraRig,preview=r.authoredPreview;
        rt.stop();
        const render=rt.render,update=rig.update;
        // Own render-only frames for this conservative visibility stress. Body
        // positions use the authoritative teleport API; no puzzle/simulation or
        // gameplay FPS claim is made. The loop cannot skip a pending doorway.
        rt.render=()=>{};
        const origin={...r.pair.activeBody.position},rootZ=preview.root.position.z;
        let z=origin.z-rootZ,last=performance.now(),waiting,waits=[],visited=[],lastSignature;
        const started=last,initialCompleted=rt.preparationQueue.diagnostics.completed;
        rig.update=()=>{
          rig.camera.position.set(origin.x+8,origin.y+7,rootZ+z+12);
          rig.camera.lookAt(origin.x,origin.y,rootZ+z);
          rig.camera.updateMatrixWorld();
        };
        try {
          while(z<270) {
            await new Promise(requestAnimationFrame);
            const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
            if(now-started>180_000)throw Error('Visibility sweep timed out');
            for(const [body,offset] of [[r.pair.bobBody,0],[r.pair.goopBody,-12]])
              body.teleport({x:origin.x,y:origin.y,z:rootZ+z+offset});
            render.call(rt,1,{fixedDeltaSeconds:1/60,rawFrameDeltaSeconds:dt,frameDeltaSeconds:dt,
              stepsThisFrame:0,interpolationAlpha:1,droppedSimulationTimeSeconds:0,renderFps:1/dt});
            const signature=rt.lightLayoutKey;
            if(signature!==lastSignature){visited.push({z,elapsedMs:performance.now()-started,signature,
              pending:rt.preparationQueue.diagnostics.pending,completed:rt.preparationQueue.diagnostics.completed});lastSignature=signature;}
            if(rt.preparationQueue.diagnostics.pending) {
              waiting??={z,start:now};
            } else {
              if(waiting){waits.push({...waiting,ms:performance.now()-waiting.start});waiting=undefined;}
              z+=5.5*dt;
            }
          }
          return {scope:'render-only visibility sweep at 5.5m/s, camera12m ahead, inactive body12m behind; puzzles/physics paused; not a legal playthrough or gameplay FPS',
            elapsedMs:performance.now()-started,waits,visited,totalWaitMs:waits.reduce((s,w)=>s+w.ms,0),
            initialCompleted,completed:rt.preparationQueue.diagnostics.completed,total:rt.preparationQueue.diagnostics.total};
        } finally {rig.update=update;rt.render=render;rt.teleportToAuthoredPreviewRoom(1);}
      });
      row.rooms=[];
      for(const room of [1,2,3,4,5,1]) {
        const requested=await page.evaluate(room=>{const r=__shaderSession.runtime;r.stop();r.teleportToAuthoredPreviewRoom(room);return performance.now();},room);
        await page.waitForFunction(t=>{const r=__shaderSession.runtime;return !r.preparationQueue.diagnostics.pending && __shaderCapture.frames.at(-1)?.start>t;},requested);
        row.rooms.push({room,waitMs:await page.evaluate(t=>performance.now()-t,requested)});
      }
      // Real bounded input at a safe entry, distinct from stopped room inspection.
      if(values.suppressSpeculation) await page.evaluate(async()=>{
        const queue=__shaderSession.runtime.preparationQueue;
        // Diagnostic ablation only. Required foreground preparation is unchanged.
        while(queue.busy) await new Promise(requestAnimationFrame);
        const tick=queue.tick;
        queue.tick=function(frameMs,foreground=false){if(foreground)return tick.call(this,frameMs,true);};
      });
      const diagnostic = values.trace ? await context.newCDPSession(page) : undefined;
      if (diagnostic) {
        await diagnostic.send('Profiler.enable');
        await diagnostic.send('Profiler.setSamplingInterval',{interval:1000});
        await diagnostic.send('Profiler.start');
        await diagnostic.send('Tracing.start',{categories:'devtools.timeline,v8,gpu,disabled-by-default-gpu.service',transferMode:'ReturnAsStream'});
      }
      await page.evaluate(()=>__shaderSession.runtime.start());
      await page.locator('[data-gameplay-canvas]').click({position:{x:480,y:300}});
      row.gameplayStartAt=await page.evaluate(()=>performance.now());
      row.bodyBefore=await page.evaluate(()=>({...__shaderSession.runtime.resources.pair.activeBody.position}));
      for(let n=0;n<5;n++) {
        await page.keyboard.down('KeyD');await page.waitForTimeout(350);await page.keyboard.up('KeyD');
        await page.keyboard.down('KeyA');await page.waitForTimeout(350);await page.keyboard.up('KeyA');
      }
      await page.keyboard.press('Space');await page.mouse.move(490,303);await page.waitForTimeout(350);
      row.gameplayEndAt=await page.evaluate(()=>performance.now());
      if (diagnostic) {
        const {profile}=await diagnostic.send('Profiler.stop');
        await writeFile(path.join(output,`${pair}-${cache}.cpuprofile`),JSON.stringify(profile));
        const complete=new Promise(resolve=>diagnostic.once('Tracing.tracingComplete',resolve));
        await diagnostic.send('Tracing.end');
        const {stream}=await complete;let data='';
        while(true){const chunk=await diagnostic.send('IO.read',{handle:stream});data+=chunk.data;if(chunk.eof)break;}
        await diagnostic.send('IO.close',{handle:stream});
        await writeFile(path.join(output,`${pair}-${cache}.trace.json`),data);
        await diagnostic.detach();
      }
      row.bodyAfter=await page.evaluate(()=>({...__shaderSession.runtime.resources.pair.activeBody.position}));
      row.capture=await page.evaluate(()=>{
        const r=__shaderSession.runtime,materials=new Map();
        r.renderLayer.scene.traverse(o=>{
          if(!o.isMesh)return;
          for(const material of Array.isArray(o.material)?o.material:[o.material]) {
            let entry=materials.get(material.uuid);
            if(!entry){entry={uuid:material.uuid,name:material.name,type:material.type,hookKey:material.customProgramCacheKey(),
              transmission:material.transmission??0,transparent:material.transparent,side:material.side,visible:material.visible,
              maps:['map','normalMap','roughnessMap','alphaMap','emissiveMap','envMap'].filter(k=>material[k]).map(k=>({slot:k,channel:material[k].channel})),objects:[]};materials.set(material.uuid,entry);}
            entry.objects.push({name:o.name,type:o.type,receiveShadow:o.receiveShadow,castShadow:o.castShadow,
              attributes:Object.keys(o.geometry.attributes),morphs:o.geometry.morphAttributes.position?.length??0});
          }
        });
        return {...__shaderCapture,materials:[...materials.values()],queue:r.preparationQueue.diagnostics,
          programs:r.renderLayer.renderer.info.programs.map(p=>({id:p.id,key:p.cacheKey,name:p.name})),resources:{...r.renderLayer.renderer.info.memory},glError:r.renderLayer.renderer.getContext().getError()};
      });
      for(const shader of row.capture.sources) {shader.sha256=createHash('sha256').update(shader.source).digest('hex');}
      await page.screenshot({path:path.join(output,`${pair}-${cache}.png`)});
      await writeFile(path.join(output,'raw.json'),JSON.stringify(report,null,2));
      console.log(values.label,pair,cache,'L2 ms',row.levelTwoLoadMs,'programs',row.capture.programs.length,'errors',errors.length);
      page.off('pageerror',onError);page.off('console',onConsole);
    }
    await browser.close();browser=undefined;
  }
} finally {await writeFile(path.join(output,'raw.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
