import { DIAGNOSTIC_OPTIONS, diagnosticOptions, launchDiagnosticBrowser } from '../lib/diagnostics.mjs';
import { parseArgs } from 'node:util';
/** Native hardware first-load comparison. One fresh browser per level; Medium
 * 1920x1080. OS/driver caches remain uncontrolled. PERF_PROFILE=1 exposes runtime
 * owners for diagnosis; use the default unmodified bundle for final timings. */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {GRAPHICS_PROFILES} from '../../src/render/GraphicsProfiles.ts';

const { values } = parseArgs({ options: DIAGNOSTIC_OPTIONS });
const diagnostic = diagnosticOptions(values, { url: process.env.PERF_BASE, output: process.env.PERF_OUTPUT ?? 'artifacts/first-loading', channel: 'chrome', headed: true });
const base = diagnostic.url, output = diagnostic.output;
const profile = process.env.PERF_PROFILE === '1';
await mkdir(output, {recursive:true});
const cdp = diagnostic.cdp;
let browser;
const report = {at:new Date().toISOString(), profile, externalBrowser:!!cdp,
  protocol:'Fresh browser/profile per level unless an external CDP endpoint is supplied; Medium, 1920x1080 DPR1; native GPU. Shader disk cache disabled for owned browsers. Immediate opening skip for Containment. Request-to-ready excludes arrival cinematics and user wait at Enter. OS/driver caches uncontrolled.',
  build:await (await fetch(new URL('build-manifest.json', base))).json(), runs:[]};
const save = () => writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
try {
  for (const level of (process.env.PERF_LEVELS ?? '1,2,3').split(',').map(Number)) {
    browser = await launchDiagnosticBrowser(diagnostic, {
      args:['--disable-gpu-shader-disk-cache','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
    report.browser = browser.version();
    const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const page = await context.newPage(); page.setDefaultTimeout(300_000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if(m.type()==='error') errors.push(m.text());});
    page.on('response', r => {if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.addInitScript(({settings,profile}) => {
      localStorage.setItem('specimen.graphics-preferences.v1', JSON.stringify({mode:'manual',settings}));
      const p = window.__loading = {phases:[],compiles:[],draws:[],links:[],runtimes:{},selectedAt:0,readyAt:0,controlAt:0};
      document.addEventListener('click', e => {
        const button = e.target.closest?.('button');
        if(button?.getAttribute('aria-label')?.match(/^Level [123] /) || button?.textContent?.match(/^\s*Level [123]\s/)) p.selectedAt=performance.now();
        if(button?.dataset.action==='skip-opening') p.skipAt=performance.now();
      },true);
      const watch = new MutationObserver(() => {
        const state = document.querySelector('.game-flow')?.dataset.state;
        const ready = document.querySelector('[data-action="enter-level"]');
        if(!p.readyAt && ((state==='transitioning' && ready && !ready.hidden) || state==='playing')) p.readyAt=performance.now();
        if(!p.controlAt && document.querySelector('#app')?.dataset.gameState==='playing')p.controlAt=performance.now();
      });
      watch.observe(document,{subtree:true,attributes:true,childList:true});
      if(!profile)return;
      const wrap=(o,key,name)=>{
        const original=o?.[key];if(typeof original!=='function')return;
        o[key]=function(...args){const row={name,start:performance.now()};p.phases.push(row);
          try {const result=original.apply(this,args);if(result?.then)return result.finally(()=>row.ms=performance.now()-row.start);row.ms=performance.now()-row.start;return result;}
          catch(e){row.error=String(e);throw e;}
        };
      };
      window.__attachLoading=(r,name)=>{
        p.runtimes[name]=r;
        for(const method of ['load','prepareGraphics','prepareLightingPrograms','runLightingPrewarm','prepareCharacterModels','preparePresentation','prepareRenderResources'])wrap(r,method,name+'.'+method);
        const renderer=r.renderLayer.renderer;
        if(!renderer.__loadingProfile){
          renderer.__loadingProfile=true;
          const gl=renderer.getContext(),links=new Map();p.programLinks=links;
          const link=gl.linkProgram;gl.linkProgram=function(program){const row={start:performance.now()};links.set(program,row);p.links.push(row);return link.call(this,program);};
          p.polls={count:0,ms:0};
          const parameter=gl.getProgramParameter;gl.getProgramParameter=function(program,key){const start=performance.now(),result=parameter.call(this,program,key),row=links.get(program);if(key===0x91b1){p.polls.count++;p.polls.ms+=performance.now()-start;}if(row&&!row.readyAt&&key===0x91b1&&result){row.readyAt=performance.now();row.ms=row.readyAt-row.start;}return result;};
          for(const key of ['compile','compileAsync']){
            const original=renderer[key];renderer[key]=function(...args){const row={key,start:performance.now(),before:this.info.programs.length,objects:args[0].children.length};p.compiles.push(row);
              const result=original.apply(this,args);row.submitMs=performance.now()-row.start;row.after=this.info.programs.length;
              if(result?.then)return result.finally(()=>row.ms=performance.now()-row.start);row.ms=row.submitMs;return result;};
          }
          const original=renderer.render;renderer.render=function(...args){const row={start:performance.now(),before:this.info.programs.length};
            try{return original.apply(this,args);}finally{row.ms=performance.now()-row.start;row.after=this.info.programs.length;if(row.ms>2)p.draws.push(row);}};
        }
        return r;
      };
    }, {settings:GRAPHICS_PROFILES.standard.settings,profile});
    if(profile)await page.route('**/assets/index-*.js',async route=>{
      const response=await route.fetch();let body=await response.text();
      const replacements=[[/\{initialRuntime:([\w$]+)/,'{initialRuntime:globalThis.__attachLoading($1,"one")'],
        [/new ([\w$]+)\.CultivationLevelRuntime\((\{[^;]*?\})\)/,'globalThis.__attachLoading(new $1.CultivationLevelRuntime($2),"two")'],
        [/new ([\w$]+)\.BlackoutLevelRuntime\((\{[^;]*?\})\)/,'globalThis.__attachLoading(new $1.BlackoutLevelRuntime($2),"three")']];
      for(const [pattern,replacement]of replacements){assert.match(body,pattern);body=body.replace(pattern,replacement);}
      await route.fulfill({response,body});
    });
    try {
      await page.goto(base,{waitUntil:'domcontentloaded'});await page.bringToFront();
      await page.locator('[data-action="level-select"]').click();
      const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas[data-gameplay-canvas]').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;});
      assert.ok(gpu&&!/swiftshader|llvmpipe|software|warp/i.test(gpu),`Native hardware required: ${gpu}`);
      await page.evaluate(()=>window.__loading.selectedAt=performance.now());
      await page.getByRole('button',{name:`Level ${level} ${['Containment','Cultivation','Blackout'][level-1]}`,exact:true}).click();
      if(level===1){await page.locator('[data-action="skip-opening"]').click();await page.waitForFunction(()=>document.querySelector('.game-flow')?.dataset.state==='playing');}
      else await page.getByRole('button',{name:`Enter Level ${level}`,exact:true}).waitFor({state:'visible'});
      const row=await page.evaluate(({level,gpu})=>{
        const p=window.__loading,r=p.runtimes[['one','two','three'][level-1]],renderer=r?.renderLayer.renderer;
        const gl=document.querySelector('canvas[data-gameplay-canvas]').getContext('webgl2');
        return {level,gpu,selectedAt:p.selectedAt,readyAt:p.readyAt,loadingMs:p.readyAt-p.selectedAt,
          drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],glError:gl.getError(),focused:document.hasFocus(),visibility:document.visibilityState,
          preferences:JSON.parse(localStorage.getItem('specimen.graphics-preferences.v1')),phases:p.phases,compiles:p.compiles,draws:p.draws,
          queue:r?.preparationQueue?.diagnostics,prewarm:r?.lightingPrewarmProfile,presentation:r?.programPreparation?.diagnostics,
          programs:renderer?.info.programs.length,resources:renderer?.info.memory,polls:p.polls,
          shaderLinks:renderer?.info.programs.map(program=>({...p.programLinks.get(program.program),name:program.name,key:program.cacheKey,
            vertex:gl.getShaderSource(program.vertexShader),fragment:gl.getShaderSource(program.fragmentShader)}))};
      },{level,gpu});
      row.errors=errors;report.runs.push(row);await save();
      console.log(`Level ${level}: ${(row.loadingMs/1000).toFixed(3)}s; ${gpu}`);
      assert.deepEqual(row.drawingBuffer,[1920,1080]);assert.equal(row.glError,0);assert.deepEqual(errors,[]);
      assert.deepEqual(row.preferences.settings,GRAPHICS_PROFILES.standard.settings);
      if(level!==1)await page.getByRole('button',{name:`Enter Level ${level}`,exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#app')?.dataset.gameState==='playing');
      await page.screenshot({path:resolve(output,`level-${level}.png`)});
    } finally {
      await context.close();
      if(cdp && process.env.PERF_CLOSE_BROWSER==='1'){
        const session=await browser.newBrowserCDPSession();await session.send('Browser.close').catch(()=>{});
      }else await browser.close();
      browser=undefined;
    }
  }
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;console.error(error);}
finally{
  await save();
  await browser?.close();
}
assert.deepEqual(await (await fetch(new URL('build-manifest.json',base))).json(),report.build,'Build changed during comparison');
