import {expect,test} from './fixtures.ts';
import {writeFile} from 'node:fs/promises';
for(const [profile,skip] of [['minimum',false],['standard',false],['standard',true]] as const) {
 test(`opening prepares visible frames and gameplay handoff (${profile}, ${skip?'skip':'natural'})`,async({page},info)=>{
  test.setTimeout(600_000);await page.setViewportSize({width:1280,height:800});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text()))errors.push(m.text());});
  await page.route('**/assets/index-*.js',async route=>{const response=await route.fetch(),body=await response.text(),pattern=/([\w$]+)=new ([\w$]+)\(\{initialRuntime:/;expect(body).toMatch(pattern);await route.fulfill({response,body:body.replace(pattern,'$1=globalThis.__openingSession=new $2({initialRuntime:')});});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-flow-panel="title"] [data-action="settings"]').click({timeout:180_000});
  await page.locator('[data-setting="graphics-profile"]').selectOption(profile);
  // Use a gameplay buffer different from the cinematic's 720p presentation.
  await page.locator('[data-setting="render-scale"]').selectOption('0.75');
  await expect(page.locator('[data-graphics-preparation]')).toBeHidden({timeout:240_000});
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.evaluate(()=>{
   const rt=(window as any).__openingSession.runtime,layer=rt.renderLayer,renderer=layer.renderer,gl=renderer.getContext();
   const evidence=(window as any).__openingEvidence={requestedAt:performance.now(),cinematic:[],gameplay:[],stages:[]};
   let current:any;const originals=new Map<string,any>();
   for(const method of ['getProgramInfoLog','getShaderInfoLog','texImage2D','texStorage2D','renderbufferStorage','renderbufferStorageMultisample']){const original=gl[method];originals.set(method,original);gl[method]=function(...args:any[]){if(current)current.calls.push(method);return original.apply(this,args);};}
   const draw=renderer.render;
   renderer.render=function(scene:any,...args:any[]){
    const flow=document.querySelector('.game-flow')?.getAttribute('data-state'),host=document.querySelector('#app') as HTMLElement;
    const cinematic=flow==='opening'&&host.dataset.openingState==='playing'&&scene!==layer.scene&&!renderer.getRenderTarget();
    const gameplay=flow==='playing'&&scene===layer.scene&&rt.state==='running';
    const previous=current,start=performance.now(),before=renderer.info.programs.length;
    const row=(cinematic||gameplay)?{at:start,stage:host.dataset.openingStage,calls:[],newPrograms:0,cpuMs:0,error:0}:undefined;
    current=row;try{return draw.call(this,scene,...args);}finally{if(row){row.newPrograms=renderer.info.programs.length-before;row.cpuMs=performance.now()-start;row.error=gl.getError();evidence[gameplay?'gameplay':'cinematic'].push(row);}current=previous;}
   };
   const observer=new MutationObserver(()=>{const host=document.querySelector('#app') as HTMLElement;const stage=host.dataset.openingStage;if(stage&&!evidence.stages.includes(stage))evidence.stages.push(stage);});observer.observe(document.querySelector('#app')!,{attributes:true});
  });
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state','opening');
  if(skip)await page.keyboard.press('Escape');
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing',{timeout:360_000});
  await page.waitForFunction(()=>(window as any).__openingEvidence.gameplay.length>=12);
  const result=await page.evaluate(()=>({... (window as any).__openingEvidence,graphics:(window as any).__openingSession.runtime.renderLayer.getGraphicsDiagnostics()}));
  await writeFile(info.outputPath('opening-readiness.json'),JSON.stringify({profile,skip,errors,...result},null,2));
  await page.screenshot({path:info.outputPath('first-gameplay.png')});
  expect(result.gameplay.length).toBeGreaterThanOrEqual(12);
  for(const row of result.gameplay){expect(row.newPrograms).toBe(0);expect(row.calls).toEqual([]);expect(row.error).toBe(0);}
  // The complete attribute is set and removed within the synchronous handoff;
  // the delayed-asset smoke test separately verifies its retained waiting state.
  if(!skip){expect(result.cinematic.length).toBeGreaterThan(10);expect(result.stages).toEqual(expect.arrayContaining(['laboratory','experiments','cracking','forming']));for(const row of result.cinematic){expect(row.newPrograms).toBe(0);expect(row.calls).toEqual([]);expect(row.error).toBe(0);}}
  expect(errors).toEqual([]);
 });
}
