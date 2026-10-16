import { expect, test } from './fixtures.ts';
import { writeFile } from 'node:fs/promises';

test('active levels prepare direct transmission-scale switches before the resumed draw', async ({page}, info) => {
  test.setTimeout(900_000);
  await page.setViewportSize({width:960,height:600});
  const errors:string[]=[], evidence:any[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text()))errors.push(m.text());});
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text(),pattern=/([\w$]+)=new ([\w$]+)\(\{initialRuntime:/;
    expect(body).toMatch(pattern);
    await route.fulfill({response,body:body.replace(pattern,'$1=globalThis.__transmissionSession=new $2({initialRuntime:')});
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click({timeout:180_000});
  await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
  await expect(page.locator('[data-graphics-preparation]')).toBeHidden({timeout:240_000});
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="title"] [data-action="start"]').click();
  for(const level of [1,2,3]) {
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing',{timeout:240_000});
    await page.waitForFunction(()=>(window as any).__transmissionSession.runtime.input.enabled);
    for(const mode of ['physical','reduced-transmission','physical','reduced-transmission']) {
      await page.evaluate(async mode=>{
        const session=(window as any).__transmissionSession,rt=session.runtime,layer=rt.renderLayer,renderer=layer.renderer,gl=renderer.getContext();
        const rows:any[]=[],storage:any[]=[],inspections:any[]=[],gates:any[]=[],originals=new Map<string,any>();
        const originalDraw=layer.render,compile=renderer.compileAsync,prepare=rt.prepareGraphics;
        const queue=rt.preparationQueue,depthGroups=rt.depthPrewarmGroups?.length;
        let live=false,compiles=0,shaderPasses=0,last=performance.now(),requestedAt=0;
        for(const method of ['getProgramInfoLog','getShaderInfoLog','texImage2D','texStorage2D','renderbufferStorage','renderbufferStorageMultisample']) {
          const original=gl[method];originals.set(method,original);
          gl[method]=function(...args:any[]){const start=performance.now();try{return original.apply(this,args);}finally{
            const row={method,ms:performance.now()-start,live};
            if(method.includes('InfoLog'))inspections.push(row);else storage.push(row);
          }};
        }
        renderer.compileAsync=function(...args:any[]){compiles++;return compile.apply(this,args);};
        rt.prepareGraphics=function(...args:any[]){shaderPasses++;return prepare.apply(this,args);};
        const unsubscribe=session.events.on('graphicsPreparationChanged',(state:any)=>gates.push({...state,at:performance.now()}));
        layer.render=function(...args:any[]){
          const start=performance.now(),before=renderer.info.programs.length,active=rt.state==='running';live=active;
          try{return originalDraw.apply(this,args);}finally{live=false;if(active) {
            rows.push({at:start,intervalMs:start-last,cpuMs:performance.now()-start,newPrograms:renderer.info.programs.length-before,
              storage:storage.filter(x=>x.live),inspections:inspections.filter(x=>x.live),error:gl.getError()});
            storage.splice(0,storage.length,...storage.filter(x=>!x.live));inspections.splice(0,inspections.length,...inspections.filter(x=>!x.live));
            last=start;
          }}
        };
        rt.__transmissionProbe={rows,finish:()=>{
          layer.render=originalDraw;renderer.compileAsync=compile;rt.prepareGraphics=prepare;unsubscribe();
          for(const [method,original] of originals)gl[method]=original;
          const debug=gl.getExtension('WEBGL_debug_renderer_info');
          return {mode,rows,requestToFirstDrawMs:rows[0]?.at-requestedAt,preparationStorage:storage,preparationInspections:inspections,gates,compiles,shaderPasses,
            queueUnchanged:queue===rt.preparationQueue,depthGroupsUnchanged:depthGroups===rt.depthPrewarmGroups?.length,
            resources:{...renderer.info.memory},programs:renderer.info.programs.length,
            graphics:layer.getGraphicsDiagnostics(),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
        }};
        // Establish actual preceding draw timestamps before measuring the first
        // resumed interval, rather than timing it from the evaluation request.
        await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
        rows.length=0;storage.length=0;inspections.length=0;gates.length=0;compiles=0;shaderPasses=0;
        requestedAt=performance.now();
        // Use the same session boundary as the settings UI, while actually
        // running. No paused/menu draw can consume the allocation first.
        session.applyGraphicsSettings('transmissive-gel',()=>layer.setGraphicsSettings({...layer.graphicsSettings,gelRenderingMode:mode}),
          `transmission:${mode==='physical'?1:.5}`);
      },mode);
      await page.waitForFunction(()=>(window as any).__transmissionSession.runtime.__transmissionProbe.rows.length>=12,null,{timeout:240_000});
      evidence.push({level,...await page.evaluate(()=>(window as any).__transmissionSession.runtime.__transmissionProbe.finish())});
      await writeFile(info.outputPath('transmission-switches.json'),JSON.stringify({evidence,errors},null,2));
    }
    if(level<3) {
      await page.evaluate(level=>{
        const rt=(window as any).__transmissionSession.runtime;
        if(level===1)rt.resources.containmentLevel.completeForDebug();
        else {rt.teleportToAuthoredPreviewRoom(5);const r=rt.resources,c=r.authoredPreview.roomFive.controller;
          c.reset('controls');c.update(1.5,false,false,false,true);c.update(4,false,false,false,false);rt.updateRoomFive(1/60,r);}
      },level);
      await page.locator('[data-action="enter-level"]').click({timeout:240_000});
    }
  }
  const file=info.outputPath('transmission-switches.json');await writeFile(file,JSON.stringify({evidence,errors},null,2));
  await info.attach('transmission-switches',{path:file,contentType:'application/json'});
  for(const sample of evidence) {
    // Cultivation's existing speculative queue may advance independently of
    // this switch. It must remain the same queue, with no full preparation pass.
    if(sample.level!==2)expect(sample.compiles).toBe(0);
    expect(sample.shaderPasses).toBe(0);
    expect(sample.queueUnchanged).toBe(true);expect(sample.depthGroupsUnchanged).toBe(true);
    for(const frame of sample.rows){expect(frame.newPrograms).toBe(0);expect(frame.inspections).toEqual([]);expect(frame.storage).toEqual([]);expect(frame.error).toBe(0);}
    expect(sample.graphics.transmissionResolutionScale).toBe(sample.mode==='physical'?1:.5);
  }
  expect(errors).toEqual([]);
});
