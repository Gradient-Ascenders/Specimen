import { finishOpening } from '../helpers/OpeningHandoff.ts';
import { finishLevelArrival } from '../helpers/LevelArrival.ts';
import { expect, test } from './fixtures.ts';
import { writeFile } from 'node:fs/promises';

test('Standard prepares the retained transmission target at the first gameplay capture scale', async ({page}, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({width:960,height:600});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();
    const pattern=/([\w$]+)=new ([\w$]+)\(\{initialRuntime:/;
    expect(body).toMatch(pattern);
    await route.fulfill({response,body:body.replace(pattern,'$1=globalThis.__targetSession=new $2({initialRuntime:')});
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click({timeout:180_000});
  await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
  await expect(page.locator('[data-graphics-preparation]')).toBeHidden({timeout:180_000});
  await page.evaluate(()=>{
    const rt=(window as any).__targetSession.runtime,layer=rt.renderLayer,renderer=layer.renderer,gl=renderer.getContext();
    const draw=layer.render,originals=new Map<string,any>(),storage:string[]=[];
    let live=false,inspections=0;
    for(const method of ['getProgramInfoLog','texImage2D','texStorage2D','renderbufferStorage','renderbufferStorageMultisample']) {
      const original=gl[method];originals.set(method,original);
      gl[method]=function(...args:any[]){if(live){if(method==='getProgramInfoLog')inspections++;else storage.push(method);}return original.apply(this,args);};
    }
    layer.render=function(...args:any[]){
      const before=renderer.info.programs.length;live=true;
      try{return draw.apply(this,args);}
      finally{
        live=false;
        rt.__firstTargetDraw={storage,inspections,newPrograms:renderer.info.programs.length-before,
          buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],scale:renderer.transmissionResolutionScale,error:gl.getError()};
        layer.render=draw;for(const [method,original] of originals)gl[method]=original;
      }
    };
  });
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="title"] [data-action="start"]').click();
  await finishOpening(page);
  await page.waitForFunction(()=>(window as any).__targetSession.runtime.__firstTargetDraw);
  const sample=await page.evaluate(()=>(window as any).__targetSession.runtime.__firstTargetDraw);
  await info.attach('first-target-draw',{body:JSON.stringify(sample,null,2),contentType:'application/json'});
  expect(sample).toEqual({storage:[],inspections:0,newPrograms:0,buffer:[960,600],scale:.75,error:0});
  expect(errors).toEqual([]);
});

test('all levels retain first-use coverage through graphics cycles, fades, switching and restart', async ({page}, info) => {
  test.setTimeout(900_000);
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text())) errors.push(m.text());});
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();
    const pattern=/([\w$]+)=new ([\w$]+)\(\{initialRuntime:/;
    expect(body).toMatch(pattern);
    await route.fulfill({response,body:body.replace(pattern,'$1=globalThis.__settingsSession=new $2({initialRuntime:')});
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-flow-panel="title"] [data-action="start"]').click({timeout:180_000});
  await finishOpening(page);
  const evidence:unknown[]=[];
  for(const level of [1,2,3]) {
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing',{timeout:180_000});
    await page.evaluate(()=>{
      const rt=(window as any).__settingsSession.runtime,layer=rt.renderLayer,renderer=layer.renderer,gl=renderer.getContext();
      rt.__cold=[];rt.__inspections=[];rt.__depthPlateau=[];rt.__resourceSamples=[];
      // Restore on each level; the renderer persists across level owners.
      if((window as any).__restoreProbe) (window as any).__restoreProbe();
      let live=false;const render=layer.render.bind(layer),inspect=gl.getProgramInfoLog.bind(gl);
      const originalLayer=layer.render,originalInspect=gl.getProgramInfoLog;
      layer.render=()=>{const before=renderer.info.programs.length;live=true;try{return render();}finally{
        live=false;if(renderer.info.programs.length>before) rt.__cold.push(renderer.info.programs.slice(before).map((p:any)=>p.cacheKey));}};
      gl.getProgramInfoLog=(program:any)=>{if(live)rt.__inspections.push(renderer.info.programs.find((p:any)=>p.program===program)?.cacheKey);return inspect(program);};
      (window as any).__restoreProbe=()=>{layer.render=originalLayer;gl.getProgramInfoLog=originalInspect;};
    });
    // Arrival keeps Input available for pause, but still gates switching.
    if(level>1) await finishLevelArrival(page,'__settingsSession');
    for(const mode of ['reduced-transmission','minimum','physical','minimum'] as const) {
      await page.keyboard.press('KeyP');
      await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
      await page.locator('[data-setting="gel-rendering"]').selectOption(mode);
      await expect(page.locator('[data-graphics-preparation]')).toBeHidden({timeout:240_000});
      await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
      await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
      await page.waitForFunction(()=>(window as any).__settingsSession.runtime.input.enabled);
      await page.keyboard.press('KeyD',{delay:100});await page.keyboard.press('Space',{delay:100});
      if(level>1) {
        const active=await page.evaluate(()=>(window as any).__settingsSession.runtime.captureProgressionSnapshot().activeSlimeId);
        await page.keyboard.press('Tab',{delay:80});
        await page.waitForFunction(previous=>(window as any).__settingsSession.runtime.captureProgressionSnapshot().activeSlimeId!==previous,active,{timeout:30_000});
      }
      await page.keyboard.press('F1');await page.keyboard.press('F1');
      await page.waitForTimeout(200);
      await page.screenshot({path:info.outputPath(`level-${level}-${mode}-${evidence.length}.png`)});
      evidence.push(await page.evaluate(({level,mode})=>{
        const rt=(window as any).__settingsSession.runtime,renderer=rt.renderLayer.renderer;
        const sample={level,mode,cold:rt.__cold,inspections:rt.__inspections,
          depthGroups:rt.depthPrewarmGroups?.length,resources:{...renderer.info.memory},programs:renderer.info.programs.length,
          graphics:rt.renderLayer.getGraphicsDiagnostics(),gl:renderer.getContext().getError()};
        rt.__resourceSamples.push(sample);return sample;
      },{level,mode}));
      expect((evidence.at(-1) as any).cold).toEqual([]);
      expect((evidence.at(-1) as any).inspections).toEqual([]);
      expect((evidence.at(-1) as any).gl).toBe(0);
    }
    for(let restart=0;restart<3;restart++) {
      await page.keyboard.press('KeyP');
      await page.locator('[data-flow-panel="paused"] [data-action="restart"]').click();
      await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing');
      if(level>1) await finishLevelArrival(page,'__settingsSession');
      await page.waitForTimeout(100);
      const result=await page.evaluate(()=>{
        const rt=(window as any).__settingsSession.runtime;return {cold:rt.__cold,inspections:rt.__inspections,depthGroups:rt.depthPrewarmGroups?.length};
      });
      expect(result.cold).toEqual([]);expect(result.inspections).toEqual([]);
      if(level===1) expect(result.depthGroups).toBe((evidence[0] as any).depthGroups);
    }
    if(level<3) {
      await page.evaluate(level=>{
        const rt=(window as any).__settingsSession.runtime;
        if(level===1)rt.resources.containmentLevel.completeForDebug();
        else {rt.teleportToAuthoredPreviewRoom(5);const r=rt.resources,c=r.authoredPreview.roomFive.controller;
          c.reset('controls');c.update(1.5,false,false,false,true);c.update(4,false,false,false,false);rt.updateRoomFive(1/60,r);
          if(!r.roomFiveFinale.active) throw new Error('Volt release did not start its finale');
          r.roomFiveFinale.requestSkip();rt.fixedUpdate(1/60);}
      },level);
      await page.locator('[data-action="enter-level"]').click({timeout:240_000});
    }
  }
  const evidencePath=info.outputPath('graphics-cycles.json');
  await writeFile(evidencePath,JSON.stringify(evidence,null,2));
  await info.attach('graphics-cycles',{path:evidencePath,contentType:'application/json'});
  expect(errors).toEqual([]);
});
