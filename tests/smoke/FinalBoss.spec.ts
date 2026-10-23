import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { finishOpening } from '../helpers/OpeningHandoff.ts';
import { FINAL_ARENA, FINAL_BOSS_TUNING, FINAL_SPECIMEN_START_PITCH } from '../../src/boss/FinalBossConfig.ts';

async function key(page:Page,code:string,down:boolean) {
  await page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true,cancelable:true})),{code,down});
}
async function press(page:Page,code:string) {await key(page,code,true);await key(page,code,false);}
async function mouse(page:Page,button:0|2,down:boolean) {
  await page.evaluate(({button,down})=>window.dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,bubbles:true,cancelable:true})),{button,down});
}
async function step(page:Page,count:number,traceDodge=false) {
  return page.evaluate(({count,traceDodge})=>{
    const r=(window as any).__bossSession.runtime,layer=r.renderLayer;
    const samples:Array<{roll:number;offset:number;active:boolean}>=[];
    for(let i=0;i<count;i++) {
      r.fixedUpdate(1/60);layer.cameraRig.update(1,1/60);
      if(traceDodge){const f=r.resources.finalBoss;samples.push({roll:f.presentation.rollRig.rotation.z,offset:f.evasion.offset.length(),active:f.evasion.active});}
    }
    const draw=layer.render;layer.render=()=>{};try{r.render(1,{frameDeltaSeconds:1/60});}finally{layer.render=draw;}
    return samples;
  },{count,traceDodge});
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
      bossProjectileCapacity:r.resources.finalBoss.projectiles.capacity,attack:r.finalBossReadModel.attack,stage:r.finalBossReadModel.stage,
      beamDirections:r.finalBossReadModel.beamDirections,beamLaps:r.finalBossReadModel.beamLapsCompleted,
      smoke:r.resources.finalBoss.presentation.smoke.count,advancedDrones:r.resources.finalBoss.reinforcements.activeCount,
      advancedShots:r.resources.finalBoss.reinforcements.liveProjectileCount,packs:r.resources.finalBoss.healthPacks.activeCount,
      brokenCover:r.resources.scene.finalArena.cover.filter((m:any)=>!m.visible).length,
      checkpoint:r.activeCheckpoint.checkpointId,
      drones:r.resources.finalBoss.squad.activeCount,camera:l.cameraRig.getDiagnostics(),glError:l.renderer.getContext().getError()}};
  });
  await writeFile(path,Buffer.from(result.png.split(',')[1]!,'base64'));
  await writeFile(path.replace(/\.png$/,'.json'),JSON.stringify(result.metrics,null,2));
}
async function model(page:Page) {return page.evaluate(()=>{
  const r=(window as any).__bossSession.runtime,m=r.finalBossReadModel;
  return {state:m.state,phase:m.phase,stage:m.stage,attack:m.attack,health:m.health,playerHealth:m.playerHealth,open:m.weakPointOpen,elapsed:m.elapsed,
    shield:m.shieldActive,regenerating:m.regenerating,remaining:m.defendersRemaining,serial:m.attackSerial,
    laps:m.beamLapsCompleted,beamDirections:m.beamDirections,aimActive:r.specimenAttackReadModel.aimActive,
    beamRetargeting:m.beamRetargeting,beamTurning:m.beamTurning,beamSegment:m.beamSegment,beamAngle:m.beamRotationRadians,
    beamVisible:r.resources.finalBoss.presentation.beam.visible,beamRadius:r.resources.finalBoss.presentation.beam.scale.x,
    reinforcementIndex:m.reinforcementIndex,advanced:r.resources.finalBoss.reinforcements.activeCount,
    packs:r.resources.finalBoss.healthPacks.activeCount,dodge:r.resources.finalBoss.evasion.offset.length(),
    checkpoint:r.activeCheckpoint.checkpointId,
    charging:r.specimenAttackReadModel.charging,projectiles:r.specimenAttackReadModel.liveProjectileCount,
    position:{...r.resources.specimenBody.position},drones:r.resources.finalBoss.squad.activeCount};
});}
async function aim(page:Page,minion:number|'orb'=-1) {
  // Settle the real shoulder camera rather than aiming from its old orbit pose.
  for(let i=0;i<8;i++) {
    await page.evaluate(index=>{
      const r=(window as any).__bossSession.runtime,rig=r.renderLayer.cameraRig,b=r.resources.specimenBody.position;
      const t=index==='orb'?r.resources.finalBoss.projectiles.shots.find((s:any)=>s.active&&s.kind==='orb'&&s.id===(window as any).__bossCounterOrbId).position:
        index<0?r.resources.finalBoss.presentation.coreWorld:r.resources.finalBoss.squad.root.children[index].position;
      rig.setGroundOrbitYawRadians(Math.atan2(b.x-t.x,b.z-t.z));
      const o=rig.camera.position,pitch=-Math.atan2(t.y-o.y,Math.hypot(t.x-o.x,t.z-o.z));
      rig.setGroundOrbitPitchRadians(pitch);
    },minion);await step(page,2);
  }
}

// Later phase/ending fixtures deliberately use the public controller, not a
// fake autoplay victory. Real pointer-lock input/projectiles are checked first.
async function advanceAuthority(page:Page,condition:'opening'|'gun-blast'|'laser-shots'|'laser-beam'|'ram',fresh=false,stage:'telegraph'|'active'='active') {
  await page.evaluate(({condition,fresh,stage})=>{
    const r=(window as any).__bossSession.runtime,c=r.resources.finalBoss.controller;
    for(let i=0;i<60000;i++) {
      const m=c.readModel;
      if(condition==='opening'?m.weakPointOpen:m.attack===condition&&m.stage===stage&&(!fresh||m.elapsed<.02))return;
      if(m.shieldActive)throw new Error('Clear the defensive squad before advancing the normal-attack fixture');
      c.update(1/60,r.resources.specimenBody.position);
    }
    throw new Error(`Boss fixture did not reach ${condition}`);
  },{condition,fresh,stage});
}

async function clearSquadFixture(page:Page) {
  await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime,f=r.resources.finalBoss;
    for(const root of f.squad.root.children) {
      if(!root.visible)continue;
      const mesh=root.children[0],target=r.resources.combatTargets.getRegistrationForMesh(mesh)?.target;
      if(!target)throw new Error('Missing deployed drone combat target');
      target.applyImpact({projectileId:999,targetId:target.id,kind:'direct',fullyCharged:true,chargeAmount:1,damageUnits:999,point:root.position,direction:root.position});
    }
  });
  await step(page,1);
}

async function inspectAttack(page:Page,path:string) {
  await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime,l=r.renderLayer,c=l.cameraRig.camera,p=r.resources.finalBoss.presentation,m=p.machine;
    l.renderer.setDrawingBufferSize(1280,720,1);c.aspect=16/9;
    const offset=c.position.clone().set(36,22,-64).applyQuaternion(m.quaternion);
    c.position.copy(m.position).add(offset);c.fov=61;c.lookAt(p.coreWorld);c.updateProjectionMatrix();c.updateMatrixWorld(true);
  });
  await capture(page,path);
}
async function fixtureCoreHit(page:Page) {
  await advanceAuthority(page,'opening');
  await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime,c=r.resources.finalBoss.controller,p=r.resources.finalBoss.presentation.coreWorld;
    c.applyImpact({projectileId:999,targetId:'extermination-core',kind:'direct',fullyCharged:true,chargeAmount:1,damageUnits:999,point:p,direction:p});
  });await step(page,1);
}

test('production boss renders both phases, health drops, advanced reinforcements and controlled phase-to-credits fixtures',async({page},info)=>{
  test.setTimeout(420_000);
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
  await page.evaluate(centreZ=>{
    const camera=(window as any).__bossSession.runtime.renderLayer.cameraRig.camera;
    camera.position.set(-74,62,centreZ-58);camera.fov=76;camera.lookAt(0,9,centreZ+14);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  },FINAL_ARENA.centreZ);
  await capture(page,info.outputPath('lab-ring-overview.png'));await step(page,1);
  // The runtime failure/retry flow must preserve the merged checkpoint and reset all threats.
  await page.evaluate(()=>(window as any).__bossSession.runtime.requestFailure());await step(page,80);
  await page.locator('.death-retry').click();await step(page,1);
  await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas[data-gameplay-canvas]'));
  expect((await model(page)).health).toBe(FINAL_BOSS_TUNING.health);expect((await model(page)).phase).toBe(1);
  expect((await model(page)).playerHealth).toBe(100);expect((await model(page)).drones).toBe(0);
  // Isolate core-damage validation from survivability and counterable orbs.
  // The following idle-death section restores damage and tests it separately.
  await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime;
    r.resources.finalBoss.controller.readModel.invulnerability=1e6;
    (window as any).__bossShotEvidence=[];
    for(const name of ['impact','projectileFired'])r.resources.specimenAttack.events.on(name,(e:any)=>(window as any).__bossShotEvidence.push({event:name,...e}));
  });
  await advanceAuthority(page,'gun-blast',true);
  await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.projectiles.clear());await step(page,30);
  await mouse(page,2,true);await mouse(page,0,true);await step(page,90);
  for(let i=0;i<180&&!(await model(page)).open;i++)await step(page,3);
  expect((await model(page)).open).toBe(true);expect((await model(page)).charging).toBe(true);
  await aim(page);await mouse(page,0,false);await step(page,1);
  // Phase one must take the full-charge hit, without attempting an evasive roll.
  await step(page,50);expect((await model(page)).dodge).toBe(0);
  for(let i=0;i<32&&(await model(page)).projectiles>0;i++)await step(page,5);
  await writeFile(info.outputPath('charged-shot-evidence.json'),JSON.stringify(await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime;
    return {events:(window as any).__bossShotEvidence,body:{...r.resources.specimenBody.position},core:{...r.resources.finalBoss.presentation.coreWorld},camera:r.renderLayer.cameraRig.getDiagnostics(),attack:r.finalBossReadModel};
  }),null,2));
  expect((await model(page)).health).toBe(FINAL_BOSS_TUNING.health-18);
  await capture(page,info.outputPath('boss-phase-one-full-charge-hit.png'));await mouse(page,2,false);
  // Exercise LMB charging from the normal shoulder view, without RMB, while
  // isolating this weapon-input check from orb interception. Gun rounds
  // must not intercept either this partial shot or the preceding charged one.
  await advanceAuthority(page,'gun-blast',true);
  await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.projectiles.clear());
  await step(page,20);await aim(page);
  const beforeHipFire=(await model(page)).health;
  // Keep this partial release below the first shield crossing after the prior
  // full hit: 182 HP minus about 10.2 damage stays above the 170 HP gate.
  await mouse(page,0,true);await step(page,30);
  expect((await model(page)).aimActive).toBe(false);expect((await model(page)).charging).toBe(true);
  await expect(page.locator('.specimen-combat-crosshair')).toBeVisible();
  await aim(page);await mouse(page,0,false);await step(page,1);
  for(let i=0;i<32&&(await model(page)).projectiles>0;i++)await step(page,5);
  // aim() advances sixteen held frames too, so assert the actual monotonic
  // partial-charge damage rather than calling it a fixed 50% release.
  expect(beforeHipFire-(await model(page)).health).toBeGreaterThan(2);
  expect(beforeHipFire-(await model(page)).health).toBeLessThan(18);
  expect((await model(page)).shield).toBe(false);
  await capture(page,info.outputPath('boss-hip-fire-partial-hit.png'));
  // Public authority selects a fresh real eye volley; actual pointer input
  // then aims at and shoots down its straight moving orb, not a fake target.
  await advanceAuthority(page,'laser-shots',true);
  await page.evaluate(()=>{
    const f=(window as any).__bossSession.runtime.resources.finalBoss;f.projectiles.clear();
    (window as any).__bossCounters=[];
    f.projectiles.events.on('impact',(e:any)=>{if(e.intercepted)(window as any).__bossCounters.push({kind:e.kind,id:e.id});});
  });await step(page,17);
  // Counter the centre member of the authored spread. Outer members now move
  // laterally, so firing at their old position is not an interception solution.
  const orbId=await page.evaluate(()=>{
    const shots=(window as any).__bossSession.runtime.resources.finalBoss.projectiles.shots.filter((s:any)=>s.active&&s.kind==='orb').sort((a:any,b:any)=>a.id-b.id);
    return (window as any).__bossCounterOrbId=shots[1]?.id;
  });
  expect(orbId).toBeGreaterThan(0);await aim(page,'orb');
  await capture(page,info.outputPath('boss-straight-orb-approach.png'));
  await mouse(page,0,true);await mouse(page,0,false);await step(page,40);
  const counters=await page.evaluate(()=>(window as any).__bossCounters);
  expect(counters.filter((e:any)=>e.id===orbId)).toEqual([{kind:'orb',id:orbId}]);
  expect(await page.evaluate(id=>(window as any).__bossSession.runtime.resources.finalBoss.projectiles.shots.some((s:any)=>s.active&&s.id===id),orbId)).toBe(false);
  await writeFile(info.outputPath('orb-counter-evidence.json'),JSON.stringify({orbId,counters},null,2));
  await capture(page,info.outputPath('boss-orb-countered.png'));
  // Actual player input, not a recovered airborne pose, verifies the boosted jump.
  const beforeJump=(await model(page)).position.y;
  await key(page,'Space',true);await step(page,22);await key(page,'Space',false);
  let apex=beforeJump;
  for(let i=0;i<90;i++){await step(page,2);apex=Math.max(apex,(await model(page)).position.y);}
  expect(apex-beforeJump).toBeGreaterThan(10);expect(apex-beforeJump).toBeLessThan(12);
  expect((await model(page)).drones).toBe(0);
  // An idle player should not survive the new sustained attacks. Verify the
  // actual damage/death flow, then return to a clean full-health checkpoint.
  await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.controller.readModel.invulnerability=0);
  for(let i=0;i<150&&(await model(page)).state!=='suspended';i++)await step(page,60);
  expect((await model(page)).playerHealth).toBe(0);await step(page,80);
  await page.locator('.death-retry').click();await step(page,1);
  expect((await model(page)).playerHealth).toBe(100);expect((await model(page)).drones).toBe(0);

  // Presentation fixtures below isolate animations/lifecycle, not a human win.
  // Real damage, input and recovery have already run above; protect this viewer.
  await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.controller.readModel.invulnerability=1e6);
  for(const attack of ['gun-blast','laser-shots','laser-beam'] as const) {
    await advanceAuthority(page,attack);await step(page,24);
    expect((await model(page)).attack).toBe(attack);
    if(attack==='laser-beam')expect(await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.presentation.eyeMuzzle.y)).toBeCloseTo(FINAL_BOSS_TUNING.beamHeight);
    await inspectAttack(page,info.outputPath(`boss-${attack}.png`));
    if(attack==='laser-shots') {
      await step(page,108);await inspectAttack(page,info.outputPath('boss-laser-orb-volley.png'));
    }
  }
  // Three mandatory first crossings. Health heals, pause freezes healing, no
  // timeout releases the shield, and the real target adapters break it only on
  // the last destruction. Adapter damage here is an explicit lifecycle fixture.
  for(let wave=1;wave<=3;wave++) {
    await fixtureCoreHit(page);expect((await model(page)).shield).toBe(true);
    await step(page,530);expect((await model(page)).drones).toBe([11,13,18][wave-1]);
    const health=(await model(page)).health;await step(page,120);
    expect((await model(page)).health).toBeGreaterThan(health);
    await inspectAttack(page,info.outputPath(`boss-defensive-wave-${wave}.png`));
    if(wave===1) {
      await press(page,'KeyP');const paused=await model(page);await step(page,120);
      expect((await model(page)).health).toBe(paused.health);expect((await model(page)).remaining).toBe(paused.remaining);
      await page.locator('[data-action="resume"]').click();
    }
    await clearSquadFixture(page);expect((await model(page)).shield).toBe(false);expect((await model(page)).drones).toBe(0);
    if(wave===1) {
      expect((await model(page)).packs).toBe(3);
      // A controlled pickup pose verifies the real world drop/health authority;
      // it is not claimed as a WASD-only navigation playthrough.
      const restore=await page.evaluate(()=>{
        const r=(window as any).__bossSession.runtime,f=r.resources.finalBoss,b=r.resources.specimenBody,old={...b.position};
        const pack=f.healthPacks.packs.find((p:any)=>p.active);
        f.controller.readModel.invulnerability=0;f.controller.damagePlayer(40,-6789);f.controller.readModel.invulnerability=1e6;
        b.recoverAt(b.position.clone().set(pack.position.x,2.07,pack.position.z));return old;
      });await step(page,120);expect((await model(page)).playerHealth).toBe(85);expect((await model(page)).packs).toBe(2);
      await capture(page,info.outputPath('boss-health-pack-pickup.png'));
      await page.evaluate(old=>{const b=(window as any).__bossSession.runtime.resources.specimenBody;b.recoverAt(b.position.clone().copy(old));},restore);await step(page,1);
    }
  }

  // Public-authority fixtures exercise phase-two presentation and the ending
  // separately; these are not presented as a human-input win of the hard fight.
  await fixtureCoreHit(page);expect((await model(page)).state).toBe('transition');
  await capture(page,info.outputPath('boss-phase-transition.png'));
  await press(page,'Enter');await step(page,1);expect((await model(page)).phase).toBe(2);expect((await model(page)).health).toBe(FINAL_BOSS_TUNING.phaseTwoHealth);
  expect((await model(page)).checkpoint).toBe('cp9');
  // Dirty the attempt, then use the real death/Retry UI. The new checkpoint
  // restores phase two, not phase one or an interrupted live attack.
  await fixtureCoreHit(page);await step(page,2);expect((await model(page)).advanced).toBe(8);
  await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime,f=r.resources.finalBoss,a=r.resources.scene.finalArena,c=a.cover[0];
    a.breakCoverAlong(c.position,c.position,1);f.healthPacks.drop(r.resources.specimenBody.position);
    f.controller.readModel.invulnerability=0;f.controller.damagePlayer(999,-9090);r.requestFailure();
  });await step(page,80);await page.locator('.death-retry').click();await step(page,1);
  await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas[data-gameplay-canvas]'));
  const retry=await model(page);
  expect(retry.checkpoint).toBe('cp9');expect(retry.phase).toBe(2);expect(retry.state).toBe('combat');expect(retry.health).toBe(100);expect(retry.playerHealth).toBe(100);
  expect(retry.shield).toBe(false);expect(retry.drones).toBe(0);expect(retry.advanced).toBe(0);expect(retry.packs).toBe(0);expect(retry.reinforcementIndex).toBe(0);
  expect(await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime,f=r.resources.finalBoss,a=r.resources.scene.finalArena;
    return {projectiles:f.projectiles.liveCount,hostile:f.reinforcements.liveProjectileCount,cover:a.cover.every((m:any)=>m.visible),bossPhase:r.activeCheckpoint.room.local.bossPhase};
  })).toEqual({projectiles:0,hostile:0,cover:true,bossPhase:2});
  await writeFile(info.outputPath('phase-two-checkpoint-retry.json'),JSON.stringify(retry,null,2));
  await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.controller.readModel.invulnerability=1e6);
  await step(page,15);await capture(page,info.outputPath('boss-phase-two-checkpoint-retry.png'));
  await page.evaluate(pitch=>{
    const r=(window as any).__bossSession.runtime,rig=r.renderLayer.cameraRig;
    rig.setGroundOrbitYawRadians(Math.PI);rig.setGroundOrbitPitchRadians(pitch);
  },FINAL_SPECIMEN_START_PITCH);await step(page,15);
  await capture(page,info.outputPath('boss-phase-two.png'));
  expect(await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.presentation.smoke.count)).toBeGreaterThan(0);
  // Actual uncharged hip-fire input now deals exactly two damage. The RAM
  // counter below can then deal a full 18 without crossing the 70 HP wave gate.
  await advanceAuthority(page,'gun-blast',true);
  await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.projectiles.clear());await step(page,30);await aim(page);
  const beforeTap=(await model(page)).health;await mouse(page,0,true);await mouse(page,0,false);await step(page,1);
  for(let i=0;i<40&&(await model(page)).projectiles>0;i++)await step(page,5);
  expect(beforeTap-(await model(page)).health).toBe(2);await capture(page,info.outputPath('boss-phase-two-uncharged-hit.png'));
  // Identical real charge/aim/release input is dodged only after phase two begins.
  await advanceAuthority(page,'gun-blast',true);
  await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.projectiles.clear());await step(page,30);
  const beforeDodge=(await model(page)).health;
  await mouse(page,2,true);await mouse(page,0,true);await step(page,90);await aim(page);await mouse(page,0,false);
  const rollTrace=await step(page,30,true);expect(rollTrace.every(s=>!s.active)).toBe(true);
  for(let i=0;i<30&&(await model(page)).dodge<20;i++)rollTrace.push(...await step(page,3,true));
  expect((await model(page)).dodge).toBeGreaterThan(20);await capture(page,info.outputPath('boss-phase-two-full-charge-evaded.png'));
  for(let i=0;i<32&&(await model(page)).projectiles>0;i++)rollTrace.push(...await step(page,5,true));
  rollTrace.push(...await step(page,120,true));
  let previousRoll=0,rollTravel=0,reachedPeak=false,returnSamples=0;
  for(const s of rollTrace) {
    rollTravel+=Math.abs(Math.atan2(Math.sin(s.roll-previousRoll),Math.cos(s.roll-previousRoll)));previousRoll=s.roll;
    if(s.offset>33.9)reachedPeak=true;
    if(reachedPeak&&s.active&&s.offset<33.5){expect(s.roll).toBe(0);returnSamples++;}
  }
  expect(rollTravel).toBeCloseTo(Math.PI*2,6);expect(returnSamples).toBeGreaterThan(10);
  expect(rollTrace.at(-1)!.roll).toBe(0);expect(rollTrace.at(-1)!.active).toBe(false);
  await writeFile(info.outputPath('single-roll-evidence.json'),JSON.stringify({rollTravel,returnSamples,samples:rollTrace},null,2));
  expect((await model(page)).health).toBe(beforeDodge);await mouse(page,2,false);
  expect((await model(page)).drones).toBe(0);
  expect(await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.squad.liveProjectileCount)).toBe(0);
  // The removed platforms must not survive as invisible movement colliders.
  expect(await page.evaluate(()=>{
    const a=(window as any).__bossSession.runtime.resources.scene.finalArena;
    return {count:a.platforms.length,colliders:a.collisionMeshes.filter((m:any)=>m.userData.orbitPlatform!==undefined).length};
  })).toEqual({count:0,colliders:0});
  // Controlled late-windup movement puts the player just clockwise from the
  // warning ray. The real authority/rendered attack must choose negative yaw
  // rather than retain the formerly hard-coded positive first circle.
  await advanceAuthority(page,'laser-beam',true,'telegraph');await step(page,50);
  await page.evaluate(centre=>{
    const r=(window as any).__bossSession.runtime,m=r.finalBossReadModel,b=r.resources.specimenBody;
    const origin=Math.atan2(-m.lockedTarget.x,centre-m.lockedTarget.z),yaw=origin-.2,radius=Math.hypot(b.position.x,b.position.z-centre);
    b.recoverAt(b.position.clone().set(-Math.sin(yaw)*radius,b.position.y,centre-Math.cos(yaw)*radius));
  },FINAL_ARENA.centreZ);
  for(let i=0;i<100&&(await model(page)).stage==='telegraph';i++)await step(page,1);
  expect((await model(page)).stage).toBe('active');expect((await model(page)).beamDirections).toEqual([-1,1,-1,1,-1,1,-1]);
  await step(page,20);const firstBeamAngle=(await model(page)).beamAngle;
  expect(firstBeamAngle).toBeLessThan(0);expect(Math.abs(firstBeamAngle+.2)).toBeLessThan(.2);
  await capture(page,info.outputPath('boss-phase-two-beam-toward-player.png'));
  const sweep=await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.presentation.eyeMuzzle.y);
  expect(sweep).toBeCloseTo(FINAL_BOSS_TUNING.beamHeight);
  for(let i=0;i<100&&(await model(page)).laps<1;i++)await step(page,5);
  expect((await model(page)).attack).toBe('laser-beam');expect((await model(page)).laps).toBe(1);
  expect((await model(page)).beamDirections).toEqual([-1,1,-1,1,-1,1,-1]);
  await step(page,59);await capture(page,info.outputPath('boss-phase-two-half-sweep.png'));
  expect(await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.presentation.eyeMuzzle.y)).toBeCloseTo(sweep);
  const beamTrace=[];let previousBeamAngle=(await model(page)).beamAngle;
  for(let i=0;i<220&&(await model(page)).stage==='active';i++){
    await step(page,10);const m=await model(page);beamTrace.push(m);
    expect(Math.abs(m.beamAngle-previousBeamAngle)).toBeLessThanOrEqual(Math.PI*2/FINAL_BOSS_TUNING.beamLapSeconds*FINAL_BOSS_TUNING.phaseTwoBeamSpeedMultiplier/6+1e-6);previousBeamAngle=m.beamAngle;
    if(m.stage==='active'){expect(m.beamVisible).toBe(true);expect(m.beamRadius).toBe(FINAL_BOSS_TUNING.beamRadius);expect(m.beamRetargeting).toBe(false);}
  }
  expect((await model(page)).laps).toBe(6);expect((await model(page)).stage).toBe('recovery');
  await writeFile(info.outputPath('continuous-beam-evidence.json'),JSON.stringify(beamTrace,null,2));
  await advanceAuthority(page,'laser-shots',true);await step(page,34);
  await inspectAttack(page,info.outputPath('boss-phase-two-orb-spread.png'));
  // Wind up RAM using actual fixed updates; do not skip its lowering/target
  // warning, since those are necessary for a legal physical charge.
  await advanceAuthority(page,'ram',true,'telegraph');
  const chargeCover=await page.evaluate(()=>{
    const r=(window as any).__bossSession.runtime,a=r.resources.scene.finalArena,b=r.resources.specimenBody,m=a.cover.find((m:any)=>m.visible);
    const centre=a.root.getObjectByName('distant-shaft-bottom').position.z;
    const dx=m.position.x,dz=m.position.z-centre,radial=Math.hypot(dx,dz),old={...b.position};
    b.recoverAt(b.position.clone().set(dx/radial*94,2.07,centre+dz/radial*94));
    return {name:m.name,old};
  });
  await step(page,2);const beforeRamCounter=(await model(page)).health;
  // Charge a real shot and jump above the cover instead of firing through it.
  // The committed RAM must not evade the incoming fully charged eye hit.
  await mouse(page,2,true);await mouse(page,0,true);await key(page,'Space',true);await step(page,22);await key(page,'Space',false);
  await step(page,68);expect((await model(page)).stage).toBe('telegraph');
  await inspectAttack(page,info.outputPath('boss-ram-windup.png'));await aim(page);await mouse(page,0,false);
  const ramTrace=await step(page,70,true);expect(ramTrace.every(s=>!s.active&&s.offset===0)).toBe(true);
  await page.evaluate(centre=>{
    const r=(window as any).__bossSession.runtime,l=r.renderLayer,p=r.resources.finalBoss.presentation,c=l.cameraRig.camera;
    c.position.set(p.machine.position.x*.45+28,28,centre+(p.machine.position.z-centre)*.45);c.fov=65;c.lookAt(p.coreWorld);c.updateProjectionMatrix();c.updateMatrixWorld(true);
  },FINAL_ARENA.centreZ);await capture(page,info.outputPath('boss-ram-charge.png'));
  // Controlled contact poses isolate the new solid-model hit authority. Use
  // the apex measured from real Space input earlier, not a higher fake jump.
  const modelContact=await page.evaluate(apexY=>{
    const r=(window as any).__bossSession.runtime,f=r.resources.finalBoss,p=f.presentation,b=r.resources.specimenBody;
    const fan=p.machine.getObjectByName('armoured-ducted-fan');let mesh:any;
    fan.traverse((o:any)=>{if(!mesh&&o.isMesh&&o.userData.contactSolid!==false&&o.material.visible)mesh=o;});
    const a=mesh.geometry.attributes.position,index=mesh.geometry.index,point=b.position.clone().set(0,0,0),vertex=point.clone();
    for(let i=0;i<3;i++)point.add(vertex.fromBufferAttribute(a,index?index.getX(i):i));point.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld);
    const above=fan.getWorldPosition(point.clone()).setY(apexY);p.ramHull.capturePreviousPose();
    const clearAbove=!p.ramHull.intersectsPlayer(above,above,b.radiusMetres),solidContact=p.ramHull.intersectsPlayer(point,point,b.radiusMetres);
    const old={...b.position},health=f.controller.readModel.playerHealth;f.controller.readModel.invulnerability=0;b.recoverAt(point);
    return {clearAbove,solidContact,apexY,old,health,point:{...point},distanceFromEye:point.distanceTo(p.eyeMuzzle)};
  },apex);
  expect(modelContact.clearAbove).toBe(true);expect(modelContact.solidContact).toBe(true);expect(modelContact.distanceFromEye).toBeGreaterThan(10);
  await step(page,1);expect(modelContact.health-(await model(page)).playerHealth).toBe(FINAL_BOSS_TUNING.ramDamage);
  await capture(page,info.outputPath('boss-ram-solid-model-contact.png'));
  await writeFile(info.outputPath('ram-model-contact-evidence.json'),JSON.stringify({...modelContact,damage:modelContact.health-(await model(page)).playerHealth},null,2));
  await page.evaluate(old=>{
    const r=(window as any).__bossSession.runtime,f=r.resources.finalBoss;f.controller.healPlayer(1);f.controller.readModel.invulnerability=1e6;
    const b=r.resources.specimenBody;b.recoverAt(b.position.clone().copy(old));
  },modelContact.old);
  for(let i=0;i<100&&(await model(page)).stage==='active';i++)await step(page,1);
  expect(await page.evaluate(()=>(window as any).__bossSession.runtime.resources.finalBoss.presentation.ramImpact.visible)).toBe(true);
  expect(beforeRamCounter-(await model(page)).health).toBe(18);await mouse(page,2,false);
  await writeFile(info.outputPath('ram-charged-counter-evidence.json'),JSON.stringify({before:beforeRamCounter,after:(await model(page)).health,samples:ramTrace},null,2));
  await page.evaluate(centre=>{
    const r=(window as any).__bossSession.runtime,l=r.renderLayer,p=r.resources.finalBoss.presentation,c=l.cameraRig.camera;
    c.position.set(p.machine.position.x*.45+28,28,centre+(p.machine.position.z-centre)*.45);c.fov=65;c.lookAt(p.coreWorld);c.updateProjectionMatrix();c.updateMatrixWorld(true);
  },FINAL_ARENA.centreZ);await capture(page,info.outputPath('boss-ram-wall-impact.png'));
  expect(await page.evaluate(name=>(window as any).__bossSession.runtime.resources.scene.finalArena.cover.find((m:any)=>m.name===name).visible,chargeCover.name)).toBe(false);
  await page.evaluate(old=>{const b=(window as any).__bossSession.runtime.resources.specimenBody;b.recoverAt(b.position.clone().copy(old));},chargeCover.old);await step(page,90);
  // Native-HD front inspection: four separated graphite segments around the
  // blue reactor, then the same real geometry opening to expose its amber core.
  const inspectCore=async(name:string,yaw=0)=>{
    await page.evaluate(yaw=>{
      const r=(window as any).__bossSession.runtime,l=r.renderLayer,camera=l.cameraRig.camera,p=r.resources.finalBoss.presentation,m=p.machine;
      l.renderer.setDrawingBufferSize(1024,768,1);camera.aspect=4/3;
      const offset=camera.position.clone().set(Math.sin(yaw)*29,1,-Math.cos(yaw)*29).applyQuaternion(m.quaternion);
      camera.position.copy(m.position).add(offset);camera.fov=55;camera.lookAt(p.coreWorld);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    },yaw);
    await capture(page,info.outputPath(name));
  };
  await inspectCore('boss-iris-open-front.png');
  await inspectCore('boss-iris-open-oblique.png',.32);
  await advanceAuthority(page,'opening');await step(page,16);await inspectCore('boss-iris-open.png');
  await page.evaluate(centreZ=>{
    const camera=(window as any).__bossSession.runtime.renderLayer.cameraRig.camera;
    camera.position.set(8,6,centreZ-61);camera.fov=72;camera.lookAt(0,-150,centreZ-8);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  },FINAL_ARENA.centreZ);
  await capture(page,info.outputPath('lab-abyss-depth.png'));
  // Late reinforcement thresholds never shield or interrupt the boss, and
  // survivors remain present as each independent eight-drone wing arrives.
  for(const [i,hp] of FINAL_BOSS_TUNING.reinforcementHealth.entries()) {
    await fixtureCoreHit(page);expect((await model(page)).health).toBe(hp);expect((await model(page)).shield).toBe(false);
    await step(page,200);expect((await model(page)).advanced).toBe((i+1)*8);
    await inspectAttack(page,info.outputPath(`boss-advanced-wing-${i+1}.png`));
  }
  await page.evaluate(()=>{const l=(window as any).__bossSession.runtime.renderLayer;l.renderer.setDrawingBufferSize(360,203,1);});
  await step(page,1);
  await fixtureCoreHit(page);expect((await model(page)).health).toBe(0);
  expect((await model(page)).advanced).toBe(0);expect((await model(page)).packs).toBe(0);
  await step(page,210);await capture(page,info.outputPath('boss-defeated.png'));
  await press(page,'Enter');await step(page,120);await capture(page,info.outputPath('boss-escape.png'));
  await press(page,'Enter');await step(page,1);
  await expect(page.locator('.game-flow')).toHaveAttribute('data-state','credits');
  expect(failures).toEqual([]);
});
