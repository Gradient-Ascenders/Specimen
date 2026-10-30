/** Investigation only: observe production loading without changing readiness.
 * --profile exposes runtime owners in HTTP responses (disables HTTP caching).
 * --route progression stages the real completed event; it is not a playthrough.
 * Raw overlapping intervals are deliberately not summed into a loading total.
 */
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import os from 'node:os';
import {DIAGNOSTIC_OPTIONS, diagnosticOptions, launchDiagnosticBrowser} from '../lib/diagnostics.mjs';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';
import {installShaderProgramObserver} from './shader-program-observer.mjs';

const {values} = parseArgs({options: {...DIAGNOSTIC_OPTIONS,
  profile:{type:'boolean',default:false}, route:{type:'string',default:'direct'},
  opening:{type:'string',default:'skip'}, passes:{type:'string',default:'2'}, levels:{type:'string',default:'1,2,3'},
  pairs:{type:'string',default:'1'}, graphics:{type:'string',default:'standard'}, observe:{type:'string',default:'0'},
  'shader-trace':{type:'boolean',default:false},
  'no-parallel':{type:'boolean',default:false},
  'worker-heap':{type:'boolean',default:false},
  'trace-gl-errors':{type:'boolean',default:false},
}});
assert.ok(['direct','progression'].includes(values.route));
assert.ok(['skip','natural'].includes(values.opening));
assert.ok(values.route !== 'progression' || values.profile, 'Staged progression requires owner exposure.');
assert.ok(!values['shader-trace'] || values.profile, 'Shader tracing requires --profile.');
const passes=Number(values.passes), levels=values.levels.split(',').map(Number);
const pairs=Number(values.pairs), observeSeconds=Number(values.observe), settings=GRAPHICS_PROFILES[values.graphics]?.settings;
assert.ok(settings&&Number.isInteger(pairs)&&pairs>=1&&pairs<=5&&Number.isFinite(observeSeconds)&&observeSeconds>=0&&observeSeconds<=30);
assert.ok(Number.isInteger(passes)&&passes>=1&&passes<=5&&levels.every(n=>[1,2,3].includes(n)));
const diagnostic=diagnosticOptions(values,{url:'http://127.0.0.1:4173/',channel:'chrome',headed:true,
  output:'artifacts/level-loading-investigation/capture'});
await mkdir(diagnostic.output,{recursive:true});
const manifest=await (await fetch(new URL('build-manifest.json',diagnostic.url))).json();
const report={schema:3,at:new Date().toISOString(),build:manifest,options:values,
  environment:{os:os.version(),release:os.release(),cpu:os.cpus()[0]?.model,ramBytes:os.totalmem()},
  protocol:{viewport:[1920,1080],dpr:1,settings,
    cache:values.profile?'Response routing disables HTTP cache; second navigation only warms process/driver state.'
      :'Fresh browser/context per selected level, second navigation in same context with normal HTTP cache.',
    route:values.route==='progression'?'Real coordinator triggered by staged completed events, no full puzzle/finale playthrough.':'Ordinary title level selection.',
    timing:'DOM ready is distinct from Enter, first rendered frame, and input-eligible fixed update. Frame marks are CPU render completion, not optical presentation. OS/driver cache uncontrolled.'},runs:[]};
const save=()=>writeFile(resolve(diagnostic.output,'results.json'),JSON.stringify(report,null,2));
let browser;
try {
  for(let pair=1;pair<=pairs;pair++)for(const initialLevel of values.route==='progression'?[1]:levels){
    browser=await launchDiagnosticBrowser(diagnostic,{args:['--enable-precise-memory-info','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
    report.browser=browser.version();
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const page=await context.newPage();page.setDefaultTimeout(300000);
    let workerHeap=[],workerHeapErrors=[];
    const workerSessions=new Map(),heapRequests=new Map();let heapRequest=1;
    const cdp=values['worker-heap']?await browser.newBrowserCDPSession():undefined;
    cdp?.on('Target.receivedMessageFromTarget',event=>{
      const message=JSON.parse(event.message),samples=heapRequests.get(message.id);
      if(samples){heapRequests.delete(message.id);if(message.result)samples.push({at:Date.now(),...message.result});}
    });
    page.on('worker',async worker=>{
      if(!cdp||!worker.url().includes('OpeningShaderWorker'))return;
      try{const {targetInfos}=await cdp.send('Target.getTargets'),target=targetInfos.find(t=>t.type==='worker'&&t.url===worker.url());
        if(!target)throw Error('Worker target unavailable');
        const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false}),samples=workerHeap;
        const poll=()=>{const id=heapRequest++;heapRequests.set(id,samples);void cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method:'Runtime.getHeapUsage'})}).catch(()=>heapRequests.delete(id));};
        const timer=setInterval(poll,1000);workerSessions.set(worker,timer);poll();worker.on('close',()=>{clearInterval(timer);workerSessions.delete(worker);});
      }catch(error){workerHeapErrors.push(String(error));}
    });
    let errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'||/Multiple instances of Three.js/.test(m.text()))errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    if(values['shader-trace'])await page.addInitScript(installShaderProgramObserver);
    if(values['trace-gl-errors'])await page.addInitScript(()=>{
      window.__nativeGlErrors=[];const proto=WebGL2RenderingContext.prototype,getError=proto.getError;
      for(const name of ['createProgram','createShader','shaderSource','compileShader','attachShader','bindAttribLocation','linkProgram','getProgramParameter','deleteProgram','deleteShader','getShaderSource','uniformBlockBinding','getUniformBlockIndex']){
        const original=proto[name];proto[name]=function(...args){const result=original.apply(this,args),code=getError.call(this);
          if(code)window.__nativeGlErrors.push({name,code,at:performance.now(),parameter:typeof args[1]==='number'?args[1]:undefined,stage:document.querySelector('#app')?.dataset.openingStage,stack:new Error().stack});return result;};
      }
    });
    if(values['no-parallel'])await page.addInitScript(()=>{
      const original=WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension=function(name){return name==='KHR_parallel_shader_compile'?null:original.call(this,name);};
    });
    await page.addInitScript(({settings,profile})=>{
      localStorage.setItem('specimen.graphics-preferences.v1',JSON.stringify({mode:'manual',settings}));
      performance.setResourceTimingBufferSize(3000);
      const p=window.__investigation={phases:[],compiles:[],draws:[],gl:[],bodies:[],fetches:[],timeline:[],runtimes:{},marks:{},frames:{},longTasks:[],animationFrames:[],heap:[]};
      const now=()=>performance.now();
      if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{
        p.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})));
      }).observe({type:'longtask',buffered:true});
      let lastHeap=0;
      const heartbeat=()=>{const at=now();p.animationFrames.push(at);
        if(at-lastHeap>500){lastHeap=at;p.heap.push({at,bytes:performance.memory?.usedJSHeapSize});}
        requestAnimationFrame(heartbeat);};requestAnimationFrame(heartbeat);
      let selected=1;
      document.addEventListener('click',event=>{
        const b=event.target.closest?.('button');if(!b)return;
        if(b.dataset.action==='select-level'){selected=Number(b.dataset.level.slice(-1));p.marks[selected]={request:now()};}
        const level=(b.getAttribute('aria-label')??b.textContent).match(/^\s*Level ([123])\s/);
        if(level){selected=Number(level[1]);p.marks[selected]={request:now()};}
        if(b.dataset.action==='start'){selected=1;p.marks[1]={request:now()};}
        if(b.dataset.action==='skip-opening')p.marks[1].skip=now();
        if(b.dataset.action==='enter-level')p.marks[selected].enter=now();
      },true);
      let last='';
      new MutationObserver(()=>{
        const app=document.querySelector('#app'),flow=document.querySelector('.game-flow');
        const state={flow:flow?.dataset.state,game:app?.dataset.gameState,opening:app?.dataset.openingState,
          stage:app?.dataset.openingStage,cinematic:app?.dataset.cinematic,
          ready:document.querySelector('[data-flow-panel="transitioning"]')?.dataset.loadingState};
        const key=JSON.stringify(state);if(key===last)return;last=key;
        const at=now();p.timeline.push({at,...state});
        const m=p.marks[selected];if(!m)return;
        if(!m.ready&&((state.flow==='transitioning'&&state.ready==='ready')||(selected===1&&state.flow==='playing'&&state.game==='playing')))m.ready=at;
        if(!m.playing&&state.flow==='playing'&&state.game==='playing')m.playing=at;
        if(selected===1&&state.stage==='complete'&&!m.cinematicEnd)m.cinematicEnd=at;
      }).observe(document,{subtree:true,attributes:true,childList:true});
      window.__selectInvestigationLevel=level=>{selected=level;p.marks[level]={request:now()};};
      if(!profile)return;
      const wrap=(o,key,label)=>{
        if(!o||typeof o[key]!=='function'||o[key].__observed)return;
        const original=o[key];const replacement=function(...args){
          const row={name:label,start:now()};p.phases.push(row);
          try{const result=original.apply(this,args);if(result?.then)return result.finally(()=>row.ms=now()-row.start);row.ms=now()-row.start;return result;}
          catch(e){row.ms=now()-row.start;row.error=String(e);throw e;}
        };replacement.__observed=true;o[key]=replacement;
      };
      const fetchOriginal=window.fetch;
      window.fetch=async function(...args){const row={url:String(args[0]),start:now()};p.fetches.push(row);
        try{return await fetchOriginal.apply(this,args);}finally{row.ms=now()-row.start;}};
      const read=Response.prototype.arrayBuffer;
      Response.prototype.arrayBuffer=async function(...args){const row={url:this.url||'(constructed/decompression response)',start:now()};p.bodies.push(row);
        try{const value=await read.apply(this,args);row.bytes=value.byteLength;return value;}finally{row.ms=now()-row.start;}};
      for(const key of ['bufferData','bufferSubData','texImage2D','texSubImage2D','compressedTexImage2D','texStorage2D','getProgramInfoLog','getShaderInfoLog','linkProgram','clientWaitSync']){
        const original=WebGL2RenderingContext.prototype[key];
        WebGL2RenderingContext.prototype[key]=function(...args){const start=now();try{return original.apply(this,args);}finally{p.gl.push({key,start,ms:now()-start});}};
      }
      window.__attachInvestigation=(runtime,level)=>{
        p.runtimes[level]=runtime;
        for(const key of ['load','unload','dispose','prepareGraphics','prepareLightingPrograms','runLightingPrewarm','prepareCharacterModels','preparePresentation','prepareRenderResources'])wrap(runtime,key,`${level}.${key}`);
        const preparation=level===1?'prepareGraphics':'preparePresentation';
        const originalPrepare=runtime[preparation];
        runtime[preparation]=function(...args){
          const r=this.resources;
          const objects={...r,sceneRadiance:r?.testScene?.radiance,blenderArt:r?.authoredPreview?.blenderArt,
            finalArena:r?.scene?.finalArena,maintenanceArt:r?.scene?.maintenanceBay,
            ascentArt:r?.scene?.bossStaging?.ascentLift};
          for(const [name,o]of Object.entries(objects))for(const key of ['prepare','preload','prepareArt','prepareEnvironmentArt','primePresentationFrames'])wrap(o,key,`${level}.${name}.${key}`);
          return originalPrepare.apply(this,args);
        };
        const renderer=runtime.renderLayer.renderer;
        if(!p.shaderCapabilities){const gl=renderer.getContext(),c=renderer.capabilities;p.shaderCapabilities={
          precision:c.precision,logarithmicDepthBuffer:!!c.logarithmicDepthBuffer,reversedDepthBuffer:!!c.reversedDepthBuffer,
          clipCull:!!gl.getExtension('WEBGL_clip_cull_distance'),multiDraw:!!gl.getExtension('WEBGL_multi_draw'),
          colorFloat:!!gl.getExtension('EXT_color_buffer_float'),floatLinear:!!gl.getExtension('OES_texture_float_linear')};}
        window.__shaderTrace?.attach(renderer);
        if(!renderer.__observed){renderer.__observed=true;
          for(const key of ['compile','compileAsync']){
            const original=renderer[key];renderer[key]=function(...args){const row={key,start:now(),before:this.info.programs.length};p.compiles.push(row);
              const result=original.apply(this,args);row.submitMs=now()-row.start;row.after=this.info.programs.length;
              if(result?.then)return result.finally(()=>row.ms=now()-row.start);row.ms=row.submitMs;return result;};
          }
          const render=renderer.render;renderer.render=function(...args){const row={start:now(),before:this.info.programs.length};
            try{return render.apply(this,args);}finally{row.ms=now()-row.start;row.after=this.info.programs.length;p.draws.push(row);}};
        }
        const isControl=()=>runtime.state==='running'&&runtime.input.enabled&&!runtime.ventArrival?.active&&!runtime.resources?.ventArrival?.active
          &&!runtime.host.dataset.cinematic&&!runtime.preparationQueue?.diagnostics.pending&&runtime.resources?.deathSequence?.state==='playing';
        const frames=p.frames[level]={samples:[]};
        const fixed=runtime.fixedUpdate;runtime.fixedUpdate=function(...args){const result=fixed.apply(this,args);
          if(isControl()&&!frames.control)frames.control=now();return result;};
        const render=runtime.render;runtime.render=function(...args){const before=renderer.info.render.frame,started=now(),result=render.apply(this,args);
          if(document.querySelector('.game-flow')?.dataset.state==='playing'&&runtime.host.dataset.gameState==='playing'&&renderer.info.render.frame>before){frames.firstVisible??=now();if(isControl()){
            if(!frames.firstControllableFrame){frames.firstControllableFrame=now();frames.firstResources={...renderer.info.memory,programs:renderer.info.programs.length};}
            if(now()-frames.firstControllableFrame<=10000)frames.samples.push({at:now(),cpuMs:now()-started,deltaMs:args[1].rawFrameDeltaSeconds*1000,
              droppedSeconds:args[1].droppedSimulationTimeSeconds,...renderer.info.memory,programs:renderer.info.programs.length});
          }}
          return result;};
        return runtime;
      };
    },{settings,profile:values.profile});
    if(values.profile)await page.route('**/assets/index-*.js',async route=>{
      const response=await route.fetch();let body=await response.text();
      const patches=[
        [/([\w$]+)=new ([\w$]+)\(\{initialRuntime:([\w$]+)/,'$1=globalThis.__investigationSession=new $2({initialRuntime:globalThis.__attachInvestigation($3,1)'],
        [/new ([\w$]+)\.CultivationLevelRuntime\((\{[^;]*?\})\)/,'globalThis.__attachInvestigation(new $1.CultivationLevelRuntime($2),2)'],
        [/new ([\w$]+)\.BlackoutLevelRuntime\((\{[^;]*?\})\)/,'globalThis.__attachInvestigation(new $1.BlackoutLevelRuntime($2),3)'],
      ];
      for(const [pattern,replacement]of patches){assert.equal([...body.matchAll(new RegExp(pattern.source,'g'))].length,1,'Bundle exposure site changed');body=body.replace(pattern,replacement);}
      await route.fulfill({response,body});
    });
    for(let pass=0;pass<passes;pass++){
      errors=[];
      workerHeap=[];workerHeapErrors=[];
      await page.goto(diagnostic.url,{waitUntil:'domcontentloaded'});await page.bringToFront();
      await page.locator('[data-action="level-select"]').waitFor({state:'visible'});
      const environment=await page.evaluate(()=>{const gl=document.querySelector('canvas[data-gameplay-canvas]').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,focused:document.hasFocus(),visibility:document.visibilityState};});
      assert.ok(environment.gpu&&!/swiftshader|llvmpipe|software|warp/i.test(environment.gpu));
      const titleReadyAt=await page.evaluate(()=>performance.now());
      await page.locator('[data-action="level-select"]').click();
      await page.evaluate(level=>window.__selectInvestigationLevel(level),initialLevel);
      await page.getByRole('button',{name:`Level ${initialLevel} ${['Containment','Cultivation','Blackout'][initialLevel-1]}`,exact:true}).click();
      for(const level of values.route==='progression'?[1,2,3]:[initialLevel]){
        console.log(`Pair ${pair}, pass ${pass+1}, Level ${level}: waiting for readiness`);
        if(level===1&&values.opening==='skip')await page.locator('[data-action="skip-opening"]').click();
        if(level!==1){await page.locator('[data-action="enter-level"]').waitFor({state:'visible'});await page.locator('[data-action="enter-level"]').click();}
        await page.waitForFunction(()=>document.querySelector('#app')?.dataset.gameState==='playing'&&document.querySelector('.game-flow')?.dataset.state==='playing');
        if(values.profile)await page.waitForFunction(level=>!!window.__investigation.frames[level]?.firstControllableFrame,level);
        else await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        if(observeSeconds)await page.waitForTimeout(observeSeconds*1000);
        const row=await page.evaluate(async ({level,profile})=>{
          const p=window.__investigation,r=p.runtimes[level],gl=document.querySelector('canvas[data-gameplay-canvas]').getContext('webgl2');
          const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
          const programFingerprints=profile?await Promise.all(r.renderLayer.renderer.info.programs.map(async program=>{
            const vertex=gl.getShaderSource(program.vertexShader),fragment=gl.getShaderSource(program.fragmentShader);
            return {key:await hash(program.cacheKey),vertex:await hash(vertex),fragment:await hash(fragment),vertexBytes:vertex.length,fragmentBytes:fragment.length};
          })):undefined;
          return {level,marks:p.marks[level],frames:p.frames[level],timeline:p.timeline,longTasks:p.longTasks,animationFrames:p.animationFrames,heap:p.heap,
            phases:p.phases,compiles:p.compiles,draws:p.draws,gl:p.gl,fetches:p.fetches,bodies:p.bodies,
            resourceTimings:performance.getEntriesByType('resource').map(e=>e.toJSON()),
            queue:r?.preparationQueue?.diagnostics,blackout:r?.programPreparation?.diagnostics,prewarm:r?.lightingPrewarmProfile,
            verification:JSON.parse(document.querySelector('#app').dataset.levelOnePrewarm??'null'),
            shaderCapabilities:p.shaderCapabilities,nativeGlErrors:window.__nativeGlErrors,openingWarmup:JSON.parse(document.querySelector('#app').dataset.openingWarmup??'null'),shaderTrace:await window.__shaderTrace?.snapshot(),
            programs:r?.renderLayer.renderer.info.programs.length,programFingerprints,memory:r?.renderLayer.renderer.info.memory,
            preferences:JSON.parse(localStorage.getItem('specimen.graphics-preferences.v1')),
            glError:gl.getError(),focused:document.hasFocus(),visibility:document.visibilityState,
            drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],observedAt:performance.now()};
        },{level,profile:values.profile});
        if(row.shaderTrace){
          const catalog=resolve(diagnostic.output,`sources-level-${level}-pair-${pair}-pass-${pass+1}.json`);
          await writeFile(catalog,JSON.stringify(row.shaderTrace.sources));
          delete row.shaderTrace.sources;row.shaderTrace.sourceCatalog=catalog;
        }
        Object.assign(row,{pair,pass:pass+1,environment,titleReadyAt,workerHeap,workerHeapErrors,errors:[...errors]});report.runs.push(row);await save();
        console.log(`Level ${level}: ready ${(row.marks.ready-row.marks.request).toFixed(0)}ms, control ${row.frames?.control? (row.frames.control-row.marks.request).toFixed(0):'unmeasured'}ms; errors ${errors.length}`);
        assert.equal(row.glError,0);assert.deepEqual(errors,[]);assert.ok(row.focused&&row.visibility==='visible');
        assert.deepEqual(row.nativeGlErrors??[],[],'Diagnostic native GL errors must remain visible failures');
        assert.deepEqual(row.preferences.settings,settings);
        if(values.profile){
          const position=()=>page.evaluate(()=>{const r=window.__investigationSession.runtime.resources,b=r.pair?.activeBody??r.group?.activeBody??r.body;return {...b.position};});
          const before=await position();await page.keyboard.down('KeyD');await page.waitForTimeout(250);await page.keyboard.up('KeyD');const after=await position();
          row.inputProbe={before,after,displacement:Math.hypot(after.x-before.x,after.z-before.z)};await save();
        }
        await page.screenshot({path:resolve(diagnostic.output,`level-${level}-pair-${pair}-pass-${pass+1}.png`)});
        if(values.route==='progression'&&level<3)await page.evaluate(level=>{
          window.__selectInvestigationLevel(level+1);
          const r=window.__investigationSession.runtime;
          if(level===1)r.resources.containmentLevel.completeForDebug();
          else {
            r.resources.manager.registerBody('volt',r.resources.voltBody);
            r.resources.manager.unlock('volt');
            r.events.emit('completed',{levelId:'level-2',nextLevelId:'level-3'});
          }
        },level);
      }
    }
    for(const timer of workerSessions.values())clearInterval(timer);
    await context.close();await browser.close();browser=undefined;
  }
  assert.deepEqual(await (await fetch(new URL('build-manifest.json',diagnostic.url))).json(),manifest);
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;console.error(error);}
finally{await save();await browser?.close();}
