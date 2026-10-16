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
  dist:{type:'string',default:'dist'},
} });
if (!/^[\w-]+$/.test(values.label) || !['minimum','standard'].includes(values.profile)) throw Error('Invalid label/profile');
const runs = Number(values.runs); if (!Number.isInteger(runs) || runs < 1) throw Error('Invalid runs');
const output = path.resolve('artifacts/shader-preparation', values.label); await mkdir(output,{recursive:true});
const hashes = {};
for (const file of await readdir(path.join(values.dist,'assets'))) if (file.endsWith('.js')) hashes[file] = createHash('sha256').update(await readFile(path.join(values.dist,'assets',file))).digest('hex');
const report = { recordedAt:new Date().toISOString(), protocol:{...values, viewport:[960,600],dpr:1,
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
    await page.addInitScript(() => {
      const capture = globalThis.__shaderCapture = {phases:[],compiles:[],draws:[],gl:[],sources:[],frames:[],waits:[],gpu:[]};
      let phase='boot', owner='boot'; const sources = new WeakMap();
      for (const method of ['shaderSource','getProgramInfoLog','getShaderInfoLog','bufferData','texImage2D','texStorage2D','renderbufferStorage','renderbufferStorageMultisample']) {
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
            const entry={owner,start:performance.now(),status:timer?'pending':'unsupported'};
            capture.gpu.push(entry);
            const query=timer?gl.createQuery():undefined;
            if(query) gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
            try{return live.apply(this,args);}finally{if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push({query,entry});}}
          };
          const compile=renderer.compileAsync;
          renderer.compileAsync=function(...args) {
            const entry={owner,phase,start:performance.now(),objects:args[0].children.length,before:this.info.programs.length};
            capture.compiles.push(entry);
            const result=compile.apply(this,args); entry.submitMs=performance.now()-entry.start;
            return result.then(value=>{entry.elapsedMs=performance.now()-entry.start;entry.after=this.info.programs.length;return value;});
          };
          const draw=renderer.render;
          renderer.render=function(...args) {
            const previous=phase; phase=args[0]===globalThis.__shaderSession?.runtime.renderLayer.scene?'live':'primer';
            const entry={owner,phase,start:performance.now(),before:this.info.programs.length};
            try {return draw.apply(this,args);} finally {entry.ms=performance.now()-entry.start;entry.after=this.info.programs.length;capture.draws.push(entry);phase=previous;}
          };
        }
        for (const method of ['load','prepareLightingPrograms','preparePresentation']) if (r[method]) {
          const original=r[method];r[method]=function(...args) {
            owner=name;const entry={owner,method,start:performance.now()};capture.phases.push(entry);
            const result=original.apply(this,args); if(result?.then) return result.finally(()=>entry.ms=performance.now()-entry.start);
            entry.ms=performance.now()-entry.start;return result;
          };
        }
        const render=r.render;let waiting;
        r.render=function(alpha,stats) {
          owner=name;const start=performance.now(),before=renderer.info.programs.length;
          try{return render.call(this,alpha,stats);} finally {
            const pending=!!this.preparationQueue?.diagnostics.pending;
            if(pending && waiting===undefined) waiting=start;
            if(!pending && waiting!==undefined){capture.waits.push({owner,start:waiting,ms:performance.now()-waiting});waiting=undefined;}
            capture.frames.push({owner,start,ms:performance.now()-start,deltaMs:stats.rawFrameDeltaSeconds*1000,state:this.state,pending,
              programs:renderer.info.programs.length,newPrograms:renderer.info.programs.length-before,
              focused:document.hasFocus(),visible:document.visibilityState});
          }
        };
        return r;
      };
      globalThis.__makeRuntime=(C,options)=>globalThis.__attachRuntime(new C(options));
    });
    await page.route('**/assets/*.js',async route=>{
      const response=await route.fetch();let body=await response.text();
      body=body.replace(/([\w$]+)=new ([\w$]+)\(\{initialRuntime:([\w$]+)/,'$1=globalThis.__shaderSession=new $2({initialRuntime:globalThis.__attachRuntime($3,"one")');
      body=body.replace(/return new ([\w$]+)\.CultivationLevelRuntime\(/,'return globalThis.__makeRuntime($1.CultivationLevelRuntime,');
      body=body.replace(/return new ([\w$]+)\.BlackoutLevelRuntime\(/,'return globalThis.__makeRuntime($1.BlackoutLevelRuntime,');
      await route.fulfill({response,body});
    });
    for (const cache of ['fresh-browser','warm-browser']) {
      const errors=[]; const onError=e=>errors.push(e.message); const onConsole=m=>{if(m.type()==='error') errors.push(m.text());};
      page.on('pageerror',onError);page.on('console',onConsole);
      const row={pair,cache,browser:browser.version(),errors};report.runs.push(row);
      console.log(values.label,pair,cache,'boot');
      await page.goto(values.url,{waitUntil:'domcontentloaded'});
      await page.locator('[data-flow-panel="title"] [data-action="start"]').waitFor({state:'visible'});
      if(values.profile==='standard') {
        await page.locator('[data-flow-panel="title"] [data-action="settings"]').click();
        await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
        await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
      }
      row.startAt=await page.evaluate(()=>performance.now());
      await page.locator('[data-flow-panel="title"] [data-action="start"]').click();
      await page.waitForFunction(()=>globalThis.__shaderSession.runtime.state==='running'&&globalThis.__shaderSession.runtime.input.enabled);
      row.navigationToControlMs=await page.evaluate(()=>performance.now()); row.startToControlMs=row.navigationToControlMs-row.startAt;
      row.levelTwoTransitionAt=await page.evaluate(()=>{const t=performance.now();globalThis.__shaderSession.runtime.resources.containmentLevel.completeForDebug();return t;});
      await page.locator('[data-action="enter-level"]').waitFor({state:'visible'});
      row.levelTwoEnterAt=await page.evaluate(()=>performance.now());
      await page.locator('[data-action="enter-level"]').click();
      await page.waitForFunction(()=>globalThis.__shaderSession.runtime.resources?.authoredPreview&&globalThis.__shaderSession.runtime.state==='running'&&globalThis.__shaderSession.runtime.input.enabled);
      row.levelTwoReadyMs=await page.evaluate(()=>performance.now());row.levelTwoEnterToControlMs=row.levelTwoReadyMs-row.levelTwoEnterAt;row.levelTwoLoadMs=row.levelTwoReadyMs-row.levelTwoTransitionAt;
      row.environment=await page.evaluate(()=>{
        const r=__shaderSession.runtime,gl=r.renderLayer.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {userAgent:navigator.userAgent,gpu:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),extensions:gl.getSupportedExtensions(),
          graphics:r.renderLayer.getGraphicsDiagnostics(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,shaderErrors:r.renderLayer.renderer.debug.checkShaderErrors};
      });
      row.rooms=[];
      for(const room of [1,2,3,4,5,1]) {
        const requested=await page.evaluate(room=>{const r=__shaderSession.runtime;r.stop();r.teleportToAuthoredPreviewRoom(room);return performance.now();},room);
        await page.waitForFunction(t=>{const r=__shaderSession.runtime;return !r.preparationQueue.diagnostics.pending && __shaderCapture.frames.at(-1)?.start>t;},requested);
        row.rooms.push({room,waitMs:await page.evaluate(t=>performance.now()-t,requested)});
      }
      // Real bounded input at a safe entry, distinct from stopped room inspection.
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
      row.bodyAfter=await page.evaluate(()=>({...__shaderSession.runtime.resources.pair.activeBody.position}));
      row.capture=await page.evaluate(()=>{
        const r=__shaderSession.runtime;return {...__shaderCapture,queue:r.preparationQueue.diagnostics,
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
