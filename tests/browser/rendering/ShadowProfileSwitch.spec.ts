import { exposeGame } from '../../helpers/GameRuntime.ts';
import { finishOpening } from '../../helpers/OpeningHandoff.ts';
import { expect, test } from '../../helpers/BrowserFixtures.ts';
import { writeFile } from 'node:fs/promises';

test('same-shader profile changes prepare resized shadow targets before ordinary draws', async ({page},info)=>{
  test.setTimeout(900_000);
  const errors:string[]=[],evidence:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(message.text()))errors.push(message.text());});
  await exposeGame(page, { session: '__shadowSession' });
  await page.goto('./',{waitUntil:'domcontentloaded'});
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click({timeout:180_000});
  await page.locator('[data-setting="gel-rendering"]').selectOption('physical');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-flow-panel="title"] [data-action="start"]').click();
  await finishOpening(page);
  for(const level of [1,2,3]){
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing',{timeout:240_000});
    await page.evaluate(()=>{
      const session=(window as any).__shadowSession,rt=session.runtime,layer=rt.renderLayer,renderer=layer.renderer,gl=renderer.getContext();
      const probe: { draws: { calls: string[]; growth: number; error: number; running: boolean }[]; gates: unknown[]; fullPasses: number; disposals: string[]; oldMaps: string[]; originals: Map<string, any>; armed: boolean; finish?: () => unknown } = rt.__shadowProbe={draws:[],gates:[],fullPasses:0,disposals:[],oldMaps:[],originals:new Map(),armed:false};
      layer.scene.traverse((object:any)=>{if(object.shadow)for(const map of [object.shadow.map,object.shadow.mapPass])if(map&&!probe.oldMaps.includes(map.uuid)){probe.oldMaps.push(map.uuid);map.addEventListener('dispose',()=>probe.disposals.push(map.uuid));}});
      let current:any;
      for(const name of ['texImage2D','texStorage2D','renderbufferStorage','renderbufferStorageMultisample','getProgramInfoLog','getShaderInfoLog']){
        const original=gl[name];probe.originals.set(name,original);gl[name]=function(...args:any[]){if(current)current.calls.push(name);return original.apply(this,args);};
      }
      const render=layer.render,prepare=rt.prepareGraphics;
      rt.prepareGraphics=function(...args:any[]){probe.fullPasses++;return prepare.apply(this,args);};
      layer.render=function(...args:any[]){
        const row=probe.armed&&layer.graphicsSettings.graphicsProfile==='standard'&&!session.graphicsPreparation.pending?{calls:[],growth:0,error:0,running:rt.state==='running'}:undefined;
        const before=renderer.info.programs.length;current=row;
        try{return render.apply(this,args);}finally{current=undefined;if(row){row.growth=renderer.info.programs.length-before;row.error=gl.getError();probe.draws.push(row);}}
      };
      const unsubscribe=session.events.on('graphicsPreparationChanged',(state:any)=>probe.gates.push({...state}));
      probe.finish=()=>{layer.render=render;rt.prepareGraphics=prepare;unsubscribe();for(const [name,original]of probe.originals)gl[name]=original;return {draws:probe.draws,gates:probe.gates,fullPasses:probe.fullPasses,disposals:probe.disposals,oldMaps:probe.oldMaps};};
    });
    await page.keyboard.press('KeyP');
    await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
    await page.evaluate(()=>(window as any).__shadowSession.runtime.__shadowProbe.armed=true);
    // Minimum + Physical and Standard + Balanced share shader source, but
    // their shadow-map caps differ. Use the real production settings boundary.
    await page.locator('[data-setting="graphics-profile"]').selectOption('standard');
    await expect(page.locator('[data-graphics-preparation]')).toBeHidden({timeout:240_000});
    await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
    await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
    await page.waitForFunction(()=>(window as any).__shadowSession.runtime.__shadowProbe.draws.filter((draw:any)=>draw.running).length>=12);
    const sample={level,...await page.evaluate(()=>(window as any).__shadowSession.runtime.__shadowProbe.finish())};
    evidence.push(sample);await writeFile(info.outputPath('shadow-profile-switches.json'),JSON.stringify({evidence,errors},null,2));
    expect(sample.fullPasses).toBe(1);
    expect(sample.gates.map((gate:any)=>gate.pending)).toEqual([true,false]);
    expect(sample.gates.every((gate:any)=>!gate.failed)).toBe(true);
    expect(new Set(sample.disposals).size).toBe(sample.disposals.length);
    for(const draw of sample.draws){expect(draw.calls).toEqual([]);expect(draw.growth).toBe(0);expect(draw.error).toBe(0);}
    if(level<3){
      await page.keyboard.press('KeyP');await page.locator('[data-flow-panel="paused"] [data-action="settings"]').click();
      await page.locator('[data-setting="graphics-profile"]').selectOption('minimum');
      await expect(page.locator('[data-graphics-preparation]')).toBeHidden({timeout:240_000});
      await page.locator('[data-setting="gel-rendering"]').selectOption('physical');
      await expect(page.locator('[data-graphics-preparation]')).toBeHidden({timeout:240_000});
      await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();await page.locator('[data-flow-panel="paused"] [data-action="resume"]').click();
      await page.evaluate(level=>{const rt=(window as any).__shadowSession.runtime;if(level===1)rt.resources.containmentLevel.completeForDebug();else{rt.teleportToAuthoredPreviewRoom(5);const r=rt.resources,c=r.authoredPreview.roomFive.controller;c.reset('controls');c.update(1.5,false,false,false,true);c.update(4,false,false,false,false);rt.updateRoomFive(1/60,r);}},level);
      await page.locator('[data-action="enter-level"]').click({timeout:240_000});
    }
  }
  await info.attach('shadow-profile-switches',{path:info.outputPath('shadow-profile-switches.json'),contentType:'application/json'});
  expect(errors).toEqual([]);
});
