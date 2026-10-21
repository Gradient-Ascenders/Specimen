import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { finishOpening } from '../helpers/OpeningHandoff.ts';

async function key(page:Page,code:string,down:boolean) {
  await page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true,cancelable:true})),{code,down});
}
async function press(page:Page,code:string) {await key(page,code,true);await key(page,code,false);}
async function mouse(page:Page,button:0|2,down:boolean) {
  await page.evaluate(({button,down})=>window.dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,bubbles:true,cancelable:true})),{button,down});
}
async function step(page:Page,count:number) {
  await page.evaluate(count=>{
    const r=(window as any).__bossSession.runtime,layer=r.renderLayer;
    for(let i=0;i<count;i++) {r.fixedUpdate(1/60);layer.cameraRig.update(1,1/60);}
    const draw=layer.render;layer.render=()=>{};try{r.render(1,{frameDeltaSeconds:1/60});}finally{layer.render=draw;}
  },count);
}
async function capture(page:Page,path:string) {
  const result=await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime,l=r.renderLayer,start=performance.now();l.render();const submitted=performance.now();
    const png=l.renderer.domElement.toDataURL('image/png');
    return {png,metrics:{state:r.finalBossReadModel.state,phase:r.finalBossReadModel.phase,health:r.finalBossReadModel.health,
      calls:l.renderer.info.render.calls,triangles:l.renderer.info.render.triangles,geometries:l.renderer.info.memory.geometries,
      textures:l.renderer.info.memory.textures,programs:l.renderer.info.programs.length,
      renderSubmissionMs:submitted-start,readbackMs:performance.now()-submitted,
      projectileCapacity:r.resources.specimenAttack.projectileStates.length,hostileCapacity:r.resources.finalBoss.squad.poolCapacity,
      drones:r.resources.finalBoss.squad.activeCount,glError:l.renderer.getContext().getError()}};
  });
  await writeFile(path,Buffer.from(result.png.split(',')[1]!,'base64'));
  await writeFile(path.replace(/\.png$/,'.json'),JSON.stringify(result.metrics,null,2));
}
async function model(page:Page) {return page.evaluate(()=>{
  const r=(window as any).__bossSession.runtime,m=r.finalBossReadModel;
  return {state:m.state,phase:m.phase,stage:m.stage,attack:m.attack,health:m.health,playerHealth:m.playerHealth,open:m.weakPointOpen,elapsed:m.elapsed,
    remaining:m.vulnerabilityRemaining,charging:r.specimenAttackReadModel.charging,position:{...r.resources.specimenBody.position},drones:r.resources.finalBoss.squad.activeCount};
});}
async function aim(page:Page,minion=-1) {
  await page.evaluate(index=>{
    const r=(window as any).__bossSession.runtime,rig=r.renderLayer.cameraRig,b=r.resources.specimenBody.position;
    const t=index<0?r.resources.finalBoss.presentation.coreWorld:r.resources.finalBoss.squad.root.children[index].position;
    rig.setGroundOrbitYawRadians(Math.atan2(b.x-t.x,b.z-t.z));
    const o=rig.camera.position,pitch=-Math.atan2(t.y-o.y,Math.hypot(t.x-o.x,t.z-o.z));
    rig.queueLookInput(0,(pitch-rig.getDiagnostics().pitchRadians)/.002);
  },minion);await step(page,3);
}

test('production final boss renders, fights through both phases, retries cleanly and reaches the existing ending',async({page},info)=>{
  test.setTimeout(300_000);
  const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||/GL_INVALID_|CONTEXT_LOST_WEBGL/.test(m.text()))failures.push(m.text());});
  await page.route('**/assets/index-*.js',async route=>{
    const response=await route.fetch(),body=await response.text();
    const pattern=/([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\(\{initialRuntime:/;
    expect(body).toMatch(pattern);await route.fulfill({response,body:body.replace(pattern,'$1=globalThis.__bossSession=new $2({initialRuntime:')});
  });
  await page.goto('./?debug=1',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="settings"]').first().click({timeout:120_000});
  await page.locator('[data-setting="graphics-preset"]').selectOption('performance');
  await page.locator('[data-setting="render-resolution"]').selectOption('0.75');
  await page.locator('[data-flow-panel="settings"] [data-action="back"]').click();
  await page.locator('[data-action="start"]').click({timeout:120_000});await finishOpening(page,false);
  for(const level of [2,3]) {
    await press(page,'Digit0');const enter=page.locator('[data-action="enter-level"]');
    await expect(enter).toContainText(`Enter Level ${level}`,{timeout:120_000});await expect(enter).toBeVisible({timeout:180_000});await enter.click();
    await expect(page.locator('.game-flow')).toHaveAttribute('data-state','playing');
  }
  await page.evaluate(()=>(window as any).__bossSession.runtime.renderLayer.setAnimationLoop(null));
  await step(page,900); // Let the real three-slime arrival hand input back first.
  await press(page,'Digit4');await step(page,1);
  expect((await model(page)).state).toBe('intro');await step(page,240);
  await capture(page,info.outputPath('boss-deployment.png'));
  await press(page,'KeyP');const paused=await model(page);await step(page,120);expect((await model(page)).elapsed).toBe(paused.elapsed);
  await page.locator('[data-action="resume"]').click();
  await press(page,'Enter');await step(page,60);expect((await model(page)).state).toBe('combat');
  await capture(page,info.outputPath('boss-combat.png'));
  // The runtime failure/retry flow must preserve the merged checkpoint and reset all threats.
  await page.evaluate(()=>(window as any).__bossSession.runtime.requestFailure());await step(page,80);
  await page.locator('.death-retry').click();await step(page,1);
  await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas[data-gameplay-canvas]'));
  expect((await model(page)).health).toBe(180);expect((await model(page)).phase).toBe(1);
  expect((await model(page)).playerHealth).toBe(100);expect((await model(page)).drones).toBe(0);
  await mouse(page,2,true);
  await step(page,15);
  let windows=0;
  // Use real pointer-lock Input, charge/release, swept projectiles and boss damage.
  // Small strafes during committed strikes are enough to leave the locked line.
  for(let i=0;i<180;i++) {
    const m=await model(page);
    if(m.state==='transition') {
      await capture(page,info.outputPath('boss-phase-transition.png'));await press(page,'Enter');await step(page,1);await mouse(page,2,true);continue;
    }
    if(['defeated','escape','complete'].includes(m.state))break;
    expect(m.playerHealth,JSON.stringify(m)).toBeGreaterThan(0);
    if(m.open&&m.remaining>2) {
      windows++;await aim(page);await mouse(page,0,true);await step(page,90);await mouse(page,0,false);await step(page,55);
    } else if(m.open) {await step(page,Math.ceil(m.remaining*60)+1);
    } else if(['strike','devastation'].includes(m.attack)&&m.stage==='telegraph') {
      const dodge=m.position.x<0?'KeyA':'KeyD';await aim(page);await key(page,dodge,true);await step(page,40);await key(page,dodge,false);await step(page,80);
    } else if(m.attack==='sectors'&&m.stage==='telegraph') {
      // The front third is unlit in this authored pattern.
      await step(page,60);
    } else if(m.attack==='shockwave'&&m.stage==='active'&&m.elapsed<.6) {
      await key(page,'Space',true);await step(page,30);await key(page,'Space',false);await step(page,80);
    } else if(m.attack==='summon'&&m.stage==='active'&&m.drones>0) {
      await aim(page,1);await mouse(page,0,true);await step(page,90);await mouse(page,0,false);await step(page,55);
    } else {await step(page,30);}
  }
  const result=await model(page);expect(result.health,JSON.stringify({result,windows})).toBe(0);
  await capture(page,info.outputPath('boss-defeated.png'));
  await press(page,'Enter');await step(page,1);await capture(page,info.outputPath('boss-escape.png'));
  await press(page,'Enter');await step(page,1);
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state','credits');
  expect(failures).toEqual([]);
});
