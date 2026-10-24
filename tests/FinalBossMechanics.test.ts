import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { FinalBossEncounter } from '../src/boss/FinalBossEncounter.ts';
import { FinalBossPresentation } from '../src/boss/FinalBossPresentation.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_ARENA_ORBIT, FINAL_BOSS_TUNING as T, FINAL_DRONE_FLIGHT, FINAL_MERGE_ANCHOR, FINAL_SPECIMEN_MOVEMENT, FINAL_SPECIMEN_WEAPON } from '../src/boss/FinalBossConfig.ts';
import { finalBossAttackTiming } from '../src/boss/FinalBossController.ts';
import { ExterminatorProjectiles } from '../src/boss/attacks/ExterminatorProjectiles.ts';
import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import { SpecimenProjectileSystem, type SpecimenAttackControls } from '../src/combat/SpecimenProjectileSystem.ts';
import { CollisionWorld, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SpecimenDash, SPECIMEN_DASH } from '../src/combat/SpecimenDash.ts';
import { bossMusicEvents, type BossMusic } from '../src/audio/BossMusic.ts';

const controls=(o:Partial<SpecimenAttackControls>={}):SpecimenAttackControls=>({active:true,aimHeld:false,fireHeld:false,firePressed:false,fireReleased:false,gameplayInputEnabled:true,pointerLocked:true,...o});
const hit=(damageUnits=999)=>({projectileId:1,targetId:'core',kind:'direct' as const,chargeAmount:1,fullyCharged:true,damageUnits,point:new THREE.Vector3(),direction:new THREE.Vector3()});
class Element {
  dataset:Record<string,string>={};hidden=false;className='';textContent='';value=0;max=0;onclick:unknown;
  ownerDocument={createElement:()=>new Element()};append(..._children:Element[]):void{}setAttribute(_a:string,_b:string):void{}remove():void{}
}
function fixture(random=()=>0,invincible=true,orbitingPlatforms=false) {
  const arena=new ExterminationArena({orbitingPlatforms}),world=new CollisionWorld(),surfaces=new SurfaceRegistry(),targets=new CombatTargetRegistry(world);
  world.registerAll(arena.collisionMeshes);surfaces.registerAll(arena.collisionMeshes);
  const body=new KinematicBody({world,surfaces,initialPosition:FINAL_MERGE_ANCHOR,config:FINAL_SPECIMEN_MOVEMENT});
  const aimDirection=new THREE.Vector3(0,0,1);
  const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);d.copy(aimDirection);}}});
  const dash=new SpecimenDash();let damageReactions=0,dodges=0;dash.events.on('dodged',()=>dodges++);
  const presentation=new FinalBossPresentation(),boss=new FinalBossEncounter({arena,world,targets,body,weapon,presentation,random,host:new Element() as unknown as HTMLElement,
    isPlayerInvulnerable:()=>dash.readModel.active,onPlayerDamaged:()=>damageReactions++,onPlayerDodged:()=>{dash.confirmDodge();},requestFailure:()=>{boss.suspend();return true;}});
  boss.start(true);if(invincible)boss.controller.damagePlayer=()=>false;
  const move=new THREE.Vector3();
  const tick=(n=1,running=false)=>{for(let i=0;i<n;i++){
    if(running){const a=Math.atan2(body.position.z-FINAL_ARENA.centreZ,body.position.x),r=Math.hypot(body.position.x,body.position.z-FINAL_ARENA.centreZ);move.set(-Math.sin(a)-Math.cos(a)*(r-82)*.3,0,Math.cos(a)-Math.sin(a)*(r-82)*.3).normalize();}else move.set(0,0,0);
    body.update(1/60,move);boss.advancePlatforms(1/60);weapon.update(1/60,controls());boss.update(1/60);
  }};
  const killSquad=()=>{for(const root of boss.squad.root.children)if(root.visible){const target=targets.getRegistrationForMesh(root.children[0] as THREE.Mesh)!.target;target.applyImpact({...hit(),targetId:target.id});}};
  return {arena,world,targets,body,weapon,aimDirection,presentation,boss,dash,get damageReactions(){return damageReactions;},get dodges(){return dodges;},tick,killSquad,dispose:()=>{boss.dispose();weapon.dispose();targets.dispose();arena.dispose();world.clear();surfaces.clear();}};
}

for(const end of ['elapsed','cancelled','reset'] as const)test(`dash I-frames reject real orb damage and end immediately when ${end}`,()=>{
  const f=fixture(()=>0,false),movement=new THREE.Vector3(1,0,0),up=new THREE.Vector3(0,1,0);
  const input={enabled:true,pressed:true,cancelled:false,movement,forward:movement,up};
  const orb=()=>{
    const target=new THREE.Vector3().copy(f.body.position),origin=target.clone();origin.y+=4;
    assert.equal(f.boss.projectiles.fireOrb(origin,target),true);
    f.boss.projectiles.update(.04,f.body);
  };
  try {
    f.dash.update(1/60,input);assert.equal(f.dash.readModel.active,true);
    orb();orb();assert.equal(f.boss.controller.readModel.playerHealth,100);assert.equal(f.dodges,1,'overlapping attacks give one cue for this dash');
    assert.equal(f.boss.controller.readModel.invulnerability,0,'a dodged orb cannot start damage grace');
    assert.equal(f.damageReactions,0);assert.equal(f.boss.projectiles.liveCount,0,'dodged projectiles resolve normally');
    input.pressed=false;
    if(end==='elapsed')f.dash.update(SPECIMEN_DASH.durationSeconds,input);
    else if(end==='cancelled')f.dash.update(1/60,{...input,cancelled:true});
    else f.dash.reset();
    assert.equal(f.dash.readModel.active,false);
    if(end!=='reset')assert.ok(f.dash.readModel.cooldownRemainingSeconds>0,'cooldown does not extend I-frames');
    orb();assert.equal(f.boss.controller.readModel.playerHealth,100-T.orbDamage);
    assert.equal(f.damageReactions,1);
  }finally{f.dispose();}
});

test('ordinary damage grace does not award a perfect dodge',()=>{
  const f=fixture(()=>0,false);
  try {
    assert.equal(f.boss.controller.damagePlayer(5,-1),true);
    const forward=new THREE.Vector3(0,0,-1);
    f.dash.update(1/60,{enabled:true,pressed:true,cancelled:false,movement:forward,forward,up:new THREE.Vector3(0,1,0)});
    const origin=f.body.position.clone().add(new THREE.Vector3(0,4,0));
    f.boss.projectiles.fireOrb(origin,f.body.position);f.boss.projectiles.update(.04,f.body);
    assert.equal(f.dodges,0);assert.equal(f.boss.controller.readModel.playerHealth,95);
  }finally{f.dispose();}
});

test('powerful accepted core impacts shudder the render without moving any combat anchor',()=>{
  const f=fixture();
  try {
    f.tick();
    const core=f.targets.getRegistrationForMesh(f.presentation.core)!.target;
    const anchor=f.presentation.coreWorld.clone(),muzzle=f.presentation.eyeMuzzle.clone();
    assert.equal(core.applyImpact({...hit(1),fullyCharged:false,chargeAmount:0}).accepted,true);
    assert.equal(f.presentation.hitReactionStrength,0);
    assert.equal(core.applyImpact(hit(1)).accepted,true);assert.equal(f.presentation.hitReactionStrength,1);
    f.presentation.refreshWorldAnchors();
    assert.ok(f.presentation.coreWorld.distanceTo(anchor)<1e-9);assert.ok(f.presentation.eyeMuzzle.distanceTo(muzzle)<1e-9);
    f.tick(24);assert.equal(f.presentation.hitReactionStrength,0,'reaction decays without stunning the boss');
    assert.equal(core.applyImpact({...hit(1),fullyCharged:false,overcharged:true}).accepted,true);assert.equal(f.presentation.hitReactionStrength,1);
    f.boss.reset();assert.equal(f.presentation.hitReactionStrength,0);
    assert.equal(core.applyImpact(hit(1)).accepted,false);assert.equal(f.presentation.hitReactionStrength,0,'rejected hits cannot shudder');
  }finally{f.dispose();}
});

test('RAM marks its full forward lane and laser direction warnings follow live reversals and clear on suspension',()=>{
  const f=fixture(()=>.99);
  try {
    f.boss.reset();assert.equal(f.boss.controller.startPhaseTwo(f.body.position),true);f.tick();const p=f.presentation;
    assert.equal(f.boss.controller.readModel.attack,'ram');assert.equal(p.ramWarning.visible,true);
    const toPlayer=f.body.position.clone().sub(p.machine.position).setY(0).length();
    assert.ok(p.ramWarning.scale.z>toPlayer,'the warning extends beyond the player to the charge destination');
    assert.ok(p.ramWarning.scale.x>=p.ramHull.widthMetres);
    f.boss.suspend();assert.equal(p.ramWarning.visible,false);assert.equal(p.beamWarning.visible,false);
  }finally{f.dispose();}
  const beam=fixture(()=>.7);
  try {
    beam.tick();const p=beam.presentation,m=beam.boss.controller.readModel;
    assert.equal(m.attack,'laser-beam');assert.equal(p.beamWarning.visible,true);assert.equal(p.beamWarning.count,5);
    const checkArrows=()=>{
      const matrix=new THREE.Matrix4(),radial=new THREE.Vector3(),forward=new THREE.Vector3(),tangent=new THREE.Vector3();
      for(let i=0;i<p.beamWarning.count;i++) {
        p.beamWarning.getMatrixAt(i,matrix);radial.setFromMatrixPosition(matrix);
        const radius=Math.hypot(radial.x,radial.z-FINAL_ARENA.centreZ);
        assert.ok(radius>FINAL_ARENA_RING.innerRadius&&radius<FINAL_ARENA_RING.outerRadius,'direction arrows sit on the playable walkway');
        radial.sub(p.machine.position).setY(0).normalize();tangent.set(radial.z,0,-radial.x).multiplyScalar(p.beamWarning.userData.direction);
        forward.set(0,0,-1).transformDirection(matrix);assert.ok(forward.dot(tangent)>.999,'arrowheads point along the indicated sweep');
      }
    };
    checkArrows();
    while(m.stage==='telegraph')beam.tick();
    const first=m.beamDirection;assert.equal(p.beamWarning.userData.direction,first);
    for(let i=0;i<1200&&m.beamDirection===first;i++)beam.tick();
    assert.notEqual(m.beamDirection,first);assert.equal(p.beamWarning.userData.direction,m.beamDirection);
    checkArrows();
    beam.boss.suspend();assert.equal(p.beamWarning.visible,false);
    beam.boss.reset();assert.equal(p.beamWarning.visible,false);
  }finally{beam.dispose();}
});

test('Gun Blast produces simultaneous triples from both animated cannon emitters, at a bounded fast cadence',()=>{
  const f=fixture();try {
    const shots:{x:number;z:number}[]=[];f.boss.projectiles.events.on('fired',e=>{if(e.kind==='gun')shots.push({x:e.position.x,z:e.position.z});});
    f.tick(66);assert.ok(shots.length===0||shots.length===3);f.tick();assert.equal(shots.length,3);
    assert.ok(shots[0]!.x<0&&shots[1]!.x>0,'both physical guns must fire');
    f.tick(30);assert.equal(shots.length,12);assert.ok(f.boss.projectiles.liveCount<=T.gunCapacity);
    assert.equal(T.gunSpeed,164);assert.ok(T.gunDamage<T.orbDamage);
  }finally{f.dispose();}
});

test('phase-one Laser Shots repeats three-orb spreads five times over its unchanged active duration',()=>{
  const f=fixture(()=>.4);try {
    const shots:{time:number;direction:THREE.Vector3}[]=[];
    f.boss.projectiles.events.on('fired',e=>{if(e.kind==='orb')shots.push({time:f.boss.controller.readModel.elapsed,direction:f.boss.projectiles.shots.find(s=>s.active&&s.id===e.id)!.direction.clone()});});
    f.tick(315,true);assert.equal(shots.length,15);assert.equal(finalBossAttackTiming('laser-shots',1)[1],3.65);
    for(let burst=0;burst<5;burst++) {
      const a=shots[burst*3]!,b=shots[burst*3+1]!,c=shots[burst*3+2]!;
      assert.ok(Math.abs(a.time-burst*.8)<.02);assert.ok(Math.abs(c.time-a.time-.26)<.02);
      assert.ok(a.direction.angleTo(b.direction)>.08&&b.direction.angleTo(c.direction)>.08);
    }
    assert.ok(T.orbSpeed<T.gunSpeed);assert.ok(T.orbRadius>T.gunRadius*4);
    assert.equal(T.orbSpeed,126/2);assert.equal(T.orbDamage,20);
  }finally{f.dispose();}
});

test('an idle lift rider is led by the eye orbs rather than being automatically safe from their aim',()=>{
  const f=fixture(()=>.4,false,true);try {
    const p=f.arena.platforms[0]!;f.body.recoverAt(p.current.clone().add(new THREE.Vector3(0,2.07,0)));
    f.tick(240);assert.ok(f.body.isSupportedBy(p.collider));assert.ok(f.boss.controller.readModel.playerHealth<100,'orbital prediction never reached the idle rider');
  }finally{f.dispose();}
});

for(const [attack,random] of [['gun-blast',()=>0],['laser-shots',()=>.4]] as const) {
  test(`${attack} can hit an idle rider during the high part of the real platform orbit`,()=>{
    const f=fixture(random,false,true);try {
      f.arena.advancePlatforms(16,f.body);
      const p=f.arena.platforms[0]!;f.body.recoverAt(p.current.clone().add(new THREE.Vector3(0,FINAL_ARENA_ORBIT.thickness/2+f.body.radiusMetres+.01,0)));
      f.tick(240);
      assert.ok(f.body.isSupportedBy(p.collider));
      assert.ok(f.boss.controller.readModel.playerHealth<100,`${attack} should aim at the exposed upper body instead of the platform edge`);
    }finally{f.dispose();}
  });
}

test('charged shots clear shallow downward deck angles but actual shots into the deck still stop',()=>{
  for(const [heading,pitch,blocked] of [[0,20,false],[Math.PI/2,20,false],[Math.PI,20,false],[Math.PI*1.5,20,false],[Math.PI/4,10,false],[0,60,true]] as const) {
    const arena=new ExterminationArena({orbitingPlatforms:true}),world=new CollisionWorld(),targets=new CombatTargetRegistry(world),p=arena.platforms[0]!;
    world.register(p.collider);
    const body={position:p.current.clone().add(new THREE.Vector3(0,.4+1.65+.01,0)),radiusMetres:1.65};
    const radians=pitch*Math.PI/180,direction=new THREE.Vector3(Math.sin(heading)*Math.cos(radians),-Math.sin(radians),Math.cos(heading)*Math.cos(radians));
    const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,
      aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);o.y+=.75;d.copy(direction);}}});
    let impacts=0;weapon.events.on('impact',()=>impacts++);
    try {
      weapon.update(1/60,controls({aimHeld:true,firePressed:true,fireHeld:true}));
      for(let i=0;i<91;i++)weapon.update(1/60,controls({aimHeld:true,fireHeld:true}));
      weapon.update(1/60,controls({aimHeld:true,fireReleased:true}));
      weapon.update(.2,controls({aimHeld:true}));
      assert.equal(impacts,blocked?1:0,`heading=${heading}, pitch=${pitch}`);
      assert.equal(weapon.readModel.liveProjectileCount,blocked?0:1);
    }finally{weapon.dispose();targets.dispose();world.clear();arena.dispose();}
  }
});

test('the beam lowers its eye and completes exactly three real rendered circles',()=>{
  const f=fixture(()=>.99);try {
    for(let i=0;i<180&&f.boss.controller.readModel.stage!=='active';i++)f.tick();
    assert.ok(Math.abs(f.presentation.coreWorld.y-T.beamHeight)<.001);
    const start=f.presentation.machine.rotation.y;let last=start,turn=0,frames=0;
    while(f.boss.controller.readModel.attack==='laser-beam'&&f.boss.controller.readModel.stage==='active') {
      assert.equal(f.presentation.beam.visible,true);assert.ok(Math.abs(f.boss.beamStart.y-T.beamHeight)<.001);
      assert.ok(f.boss.beamEnd.distanceTo(f.boss.beamStart)<200,'actual walls must clip the beam');
      const y=f.presentation.machine.rotation.y;turn+=Math.abs(y-last);last=y;frames++;f.tick();
    }
    assert.ok(frames>=982&&frames<=985);assert.ok(turn>Math.PI*6-.03&&turn<=Math.PI*6);
    assert.equal(f.boss.controller.readModel.beamLapsCompleted,3);
    assert.equal(T.beamRadius,2.7);assert.equal(f.presentation.beam.scale.x,T.beamRadius);
    assert.ok(f.boss.beamEnd.distanceTo(f.boss.beamStart)>80,'the thicker beam must reach the playable ring, not stop at its inner floor lip');
    assert.equal(f.presentation.beam.visible,false);
  }finally{f.dispose();}
});

test('reversing beam sweeps travel three full circles without angle snaps at either turnaround',()=>{
  const random=[.99,0,0];let index=0;
  const f=fixture(()=>random[index++]??.9);try {
    for(let i=0;i<180&&f.boss.controller.readModel.stage!=='active';i++)f.tick();
    let previous=f.presentation.machine.rotation.y,travel=0;
    while(f.boss.controller.readModel.attack==='laser-beam'&&f.boss.controller.readModel.stage==='active') {
      const current=f.presentation.machine.rotation.y,delta=current-previous;
      assert.ok(Math.abs(delta)<.04,'lap reversal must not snap the visible boss angle');travel+=Math.abs(delta);previous=current;f.tick();
    }
    assert.ok(Math.abs(travel-Math.PI*6)<.03);assert.deepEqual(f.boss.controller.readModel.beamDirections,[1,-1,1]);
  }finally{f.dispose();}
});

test('production hip-fire damage increases through tap, quarter, half and full charge',()=>{
  const f=fixture(),damage:number[]=[],splash:number[]=[];
  f.weapon.events.on('projectileFired',e=>{damage.push(e.damageUnits);splash.push(e.splashRadiusMetres);});
  try {
    for(const seconds of [0,.375,.75,1.5]) {
      f.weapon.reset();f.weapon.update(seconds||.001,controls({firePressed:true,fireHeld:seconds>0,fireReleased:seconds===0}));
      if(seconds>0)f.weapon.update(.001,controls({fireReleased:true}));
    }
    assert.deepEqual(damage,[2,6,10,18]);assert.deepEqual(splash,[0,0,0,14]);
    assert.equal(f.weapon.readModel.aimActive,false);
  }finally{f.dispose();}
});

test('a fully charged impact really destroys multiple members of an authored guardian group',()=>{
  const f=fixture();let destroyed=0;
  f.weapon.events.on('targetImpact',e=>{if(e.destroyed&&e.impact.targetId.startsWith('extermination-minion'))destroyed++;});
  try {
    f.boss.controller.applyImpact(hit());f.tick(82+480);
    const target=f.boss.squad.root.children[2]!;
    f.aimDirection.subVectors(target.position,f.body.position).normalize();
    f.weapon.update(1.5,controls({firePressed:true,fireHeld:true}));f.weapon.update(.001,controls({fireReleased:true}));f.tick(180);
    assert.ok(destroyed>=3,`full charge should clear multiple group members, destroyed=${destroyed}`);
  }finally{f.dispose();}
});

test('mobile attacker envelopes cover visible wing grazes without scaling models or guardians',()=>{
  const f=fixture();try {
    f.boss.controller.applyImpact(hit());f.tick(82+480);
    const attacker=f.boss.squad.root.children[8]!,guard=f.boss.squad.root.children[0]!;
    const proxy=attacker.children[0] as THREE.Mesh,normal=guard.children[0] as THREE.Mesh,hitResult=new CollisionHit();
    assert.equal(proxy.scale.x,2);assert.equal(normal.scale.x,1);assert.equal(attacker.children[1]!.scale.x,1);
    const origin=attacker.position.clone().add(new THREE.Vector3(1.45,8,0));
    assert.equal(f.world.sweepSphere(origin,new THREE.Vector3(0,-10,0),.18,hitResult,CollisionLayer.Projectile),true);
    assert.equal(hitResult.object,proxy,'a wing-edge shot should count, not pass through the visual drone');
    f.boss.reset();assert.equal(proxy.scale.x,1,'retry clears role-specific padding before the next wave');
  }finally{f.dispose();}
});

test('guardian projectiles move at triple speed while pursuing drones retain their existing shot speed',()=>{
  const f=fixture(),pending:{id:number;origin:THREE.Vector3;guard:boolean}[]=[];let guardSeen=false,pursuerSeen=false;
  f.boss.squad.events.on('projectileFired',e=>{
    const index=Number(e.droneId.split('-').at(-1))-1;
    pending.push({id:e.projectileId,origin:f.boss.squad.root.children[index]!.position.clone(),guard:index<8});
  });
  try {
    f.boss.controller.applyImpact(hit());f.tick(82);
    for(let i=0;i<300&&!(guardSeen&&pursuerSeen);i++) {
      pending.length=0;f.tick();
      for(const shot of pending) {
        const state=f.boss.squad.projectileStates.find(s=>s.id===shot.id&&s.active);if(!state)continue;
        const travelled=new THREE.Vector3().copy(state.position).distanceTo(shot.origin);
        assert.ok(Math.abs(travelled-(shot.guard?84:28)/60)<1e-6);
        if(shot.guard)guardSeen=true;else pursuerSeen=true;
      }
    }
    assert.ok(guardSeen&&pursuerSeen);
  }finally{f.dispose();}
});

test('all three defenses spawn 11/13/18 real drones, block core splash and stop healing only when every drone is destroyed',()=>{
  const f=fixture();try {
    const size=f.targets.size;
    for(const n of [11,13,18]) {
      f.boss.controller.applyImpact(hit());assert.equal(f.boss.controller.readModel.shieldActive,true);f.tick(84);
      assert.equal(f.boss.squad.activeCount,n);assert.equal(f.boss.controller.readModel.defendersRemaining,n);
      assert.equal(f.presentation.shield.visible,true);const hp=f.boss.controller.readModel.health;
      f.tick(180);assert.ok(f.boss.controller.readModel.health>hp+7);
      assert.equal(f.boss.controller.applyImpact({...hit(),kind:'splash'}).accepted,false);
      const ray=new CollisionHit(),origin=new THREE.Vector3(0,35,FINAL_ARENA.centreZ-85),direction=f.presentation.machine.position.clone().sub(origin).normalize();
      assert.equal(f.world.raycast(origin,direction,200,ray,CollisionLayer.Projectile),true);assert.equal(ray.object?.name,f.presentation.shield.name);
      assert.equal(f.boss.controller.skipCinematic(f.body.position),false);
      f.killSquad();assert.equal(f.boss.controller.readModel.shieldActive,false);f.tick();assert.equal(f.presentation.shield.visible,false);
      const after=f.boss.controller.readModel.health;f.tick(30);assert.equal(f.boss.controller.readModel.health,after);assert.equal(f.targets.size,size);
    }
    f.boss.reset();assert.equal(f.boss.controller.readModel.defenseIndex,0);assert.equal(f.boss.projectiles.liveCount,0);assert.equal(f.boss.squad.activeCount,0);assert.equal(f.targets.size,size);
  }finally{f.dispose();}
});

test('defenders hold separated wave-specific groups, at most three pursue, and guards fire at 1.5x cadence',()=>{
  const f=fixture();try {
    const times=new Map<string,number[]>();f.boss.squad.events.on('projectileFired',e=>{
      const list=times.get(e.droneId)??[];list.push(f.boss.controller.time);times.set(e.droneId,list);
    });
    for(const [wave,groups] of [[0,[4,4]],[1,[5,5]],[2,[5,5,5]]] as const) {
      times.clear();f.boss.controller.applyImpact(hit());f.tick(82+720);
      const roots=f.boss.squad.root.children.filter(r=>r.visible),guards=groups.reduce((sum,n)=>sum+n,0);
      assert.equal(roots.length,[11,13,18][wave]);assert.equal(roots.length-guards,3);
      const centres:THREE.Vector3[]=[];let offset=0;
      for(const size of groups) {
        const centre=new THREE.Vector3();
        for(const r of roots.slice(offset,offset+size)) {
          assert.ok(Math.abs(Math.hypot(r.position.x,r.position.z-FINAL_ARENA.centreZ)-36)<1);
          centre.add(r.position);
        }
        centres.push(centre.multiplyScalar(1/size));offset+=size;
      }
      for(let i=1;i<centres.length;i++)assert.ok(centres[i]!.distanceTo(centres[i-1]!)>25,'defensive groups must not merge into one clump');
      for(const r of roots.slice(guards))assert.ok(r.position.distanceTo(f.body.position)<18);
      const guardShots=times.get('extermination-minion-1')!,attackShots=times.get(`extermination-minion-${guards+1}`)!;
      const interval=(shots:number[])=>shots.at(-1)!-shots.at(-2)!;
      assert.ok(Math.abs(interval(guardShots)-.7)<1/60);assert.ok(Math.abs(interval(attackShots)-1.05)<1/60);
      f.killSquad();f.tick();
    }
  }finally{f.dispose();}
});

test('Gun Blast stays active for three times its former duration, without changing its volley cadence',()=>{
  const f=fixture();try {
    assert.equal(finalBossAttackTiming('gun-blast',1)[1],3.85*3);
    f.tick(66+360);assert.equal(f.boss.controller.readModel.attack,'gun-blast');assert.equal(f.boss.controller.readModel.stage,'active');
    f.tick(330);assert.equal(f.boss.controller.readModel.stage,'active');
    f.tick(4);assert.equal(f.boss.controller.readModel.stage,'recovery');
  }finally{f.dispose();}
});

test('the three pursuers follow a real charged jump without retreating to the boss or snapping on landing',()=>{
  const f=fixture();try {
    f.boss.controller.applyImpact(hit());f.tick(82+480);
    const attackers=f.boss.squad.root.children.filter(r=>r.visible).slice(8),previous=attackers.map(r=>r.position.clone());
    const velocities=attackers.map(()=>new THREE.Vector3()),zero=new THREE.Vector3();let apex=f.body.position.y;
    for(let i=0;i<300;i++) {
      f.body.update(1/60,zero,{pressed:i===0,held:i<43,released:i===43});
      f.boss.advancePlatforms(1/60);f.boss.update(1/60);apex=Math.max(apex,f.body.position.y);
      attackers.forEach((root,index)=>{
        const delta=root.position.clone().sub(previous[index]!);
        assert.ok(delta.length()<=FINAL_DRONE_FLIGHT.maximumSpeed/60+.003,'pursuit must have bounded travel per step');
        assert.ok(Math.hypot(root.position.x,root.position.z-FINAL_ARENA.centreZ)>62,'jumping must not send pursuers to a central hub');
        const velocity=delta.multiplyScalar(60);
        if(i>0)assert.ok(velocity.distanceTo(velocities[index]!)<=FINAL_DRONE_FLIGHT.maximumAcceleration/60+.01,'jump/landing must not instantly change pursuit velocity');
        velocities[index]!.copy(velocity);previous[index]!.copy(root.position);
      });
    }
    assert.ok(apex-FINAL_MERGE_ANCHOR.y>10.5);assert.equal(f.body.grounded,true);
  }finally{f.dispose();}
});

test('minion interpolation smooths only visible models and cannot change authoritative positions or colliders',()=>{
  const f=fixture();try {
    f.boss.controller.applyImpact(hit());f.tick(82+480);
    const root=f.boss.squad.root.children[8]!,collider=root.children[0] as THREE.Mesh;
    const position=root.position.clone(),matrix=collider.matrixWorld.clone();
    f.boss.present(.25);
    assert.deepEqual(root.position,position);collider.updateWorldMatrix(true,false);assert.deepEqual(collider.matrixWorld,matrix);
    const visual=root.children[1]!;assert.ok(visual.position.length()>0&&visual.position.length()<FINAL_DRONE_FLIGHT.maximumSpeed/60);
    f.boss.present(1);assert.equal(visual.position.length(),0);
  }finally{f.dispose();}
});

test('gun rounds pass through player fire; a normal tap still destroys a straight orb instead',()=>{
  const world=new CollisionWorld(),targets=new CombatTargetRegistry(world),body={position:new THREE.Vector3(0,2,0),radiusMetres:1.65};
  const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);d.set(0,0,1);}}});
  const pool=new ExterminatorProjectiles({world,targets,weapon,onPlayerHit:()=>{}});
  let interceptions=0;pool.events.on('impact',e=>{if(e.intercepted){assert.equal(e.kind,'orb');interceptions++;}});
  try {
    const origin=new THREE.Vector3(0,2.75,30);pool.fireGunVolley(origin,origin,body.position.clone().setY(2.75),0);
    assert.equal(targets.registeredTargets.filter(r=>r.target.isCombatActive()).length,0);
    weapon.update(1/60,controls({firePressed:true,fireReleased:true}));
    for(let i=0;i<9;i++){weapon.update(1/60,controls());pool.update(1/60,{...body,previousPosition:body.position});}
    assert.equal(interceptions,0);assert.equal(pool.liveCount,3);assert.equal(weapon.readModel.liveProjectileCount,1,'player shots must pass through incoming gun rounds');
    pool.clear();weapon.reset();pool.fireOrb(origin,body.position);
    const registration=targets.registeredTargets.find(r=>r.target.isCombatActive())!;
    assert.ok(registration.target.id.startsWith('exterminator-counterable-orb-'));
    assert.equal(registration.target.hitMeshes[0]!.userData.collisionSphereRadius,T.orbRadius);
    weapon.update(1/60,controls({firePressed:true,fireReleased:true}));
    for(let i=0;i<20;i++){weapon.update(1/60,controls());pool.update(1/60,{...body,previousPosition:body.position});}
    assert.equal(interceptions,1);assert.equal(pool.liveCount,0);assert.equal(weapon.readModel.liveProjectileCount,0);
    assert.equal(registration.target.applyImpact(hit()).accepted,false,'a destroyed orb cannot intercept or explode twice');
  }finally{pool.dispose();weapon.dispose();targets.dispose();world.clear();}
});

test('orbs and gun rounds keep their launch headings despite horizontal and vertical player movement',()=>{
  const world=new CollisionWorld(),targets=new CombatTargetRegistry(world),body={position:new THREE.Vector3(40,10,90),radiusMetres:1.65};
  const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);d.set(0,0,1);}}});
  let hits=0;const pool=new ExterminatorProjectiles({world,targets,weapon,onPlayerHit:()=>hits++});
  try {
    pool.fireOrb(new THREE.Vector3(0,10.75,0),new THREE.Vector3(0,10.75,100));
    pool.fireGunVolley(new THREE.Vector3(0,50,0),new THREE.Vector3(2,50,0),new THREE.Vector3(0,50,100),0);
    const orb=pool.shots.find(s=>s.active&&s.kind==='orb')!,gun=pool.shots.find(s=>s.active&&s.kind==='gun')!,gunHeading=gun.direction.clone(),orbHeading=orb.direction.clone();
    for(const position of [new THREE.Vector3(40,10,90),new THREE.Vector3(-40,30,100)]) {
      body.position.copy(position);
      for(let i=0;i<30;i++) {
        const previous=orb.position.clone(),heading=orb.direction.clone();
        pool.update(1/60,{...body,previousPosition:body.position});
        assert.ok(orb.active);assert.ok(Math.abs(orb.position.distanceTo(previous)-63/60)<1e-8);
        assert.deepEqual(orb.direction,heading);assert.deepEqual(orb.direction,orbHeading,'orbs must not home any more');
        assert.deepEqual(gun.direction,gunHeading);
      }
    }
    assert.deepEqual(orb.direction,new THREE.Vector3(0,0,1));assert.equal(hits,0);
    const pose=orb.position.clone();pool.present(.5);assert.deepEqual(orb.position,pose,'render interpolation must not change shot authority');
    const probe=pose.clone().add(new THREE.Vector3(0,0,-10)),sweep=new THREE.Vector3(0,0,20),collision=new CollisionHit();
    assert.equal(world.sweepSphere(probe,sweep,.1,collision,CollisionLayer.Projectile),true);
    pool.clear();assert.equal(targets.registeredTargets.filter(r=>r.target.isCombatActive()).length,0);
    assert.equal(world.sweepSphere(probe,sweep,.1,collision,CollisionLayer.Projectile),false,'cleared orbs must leave no invisible interceptors');
    assert.equal(pool.fireOrb(new THREE.Vector3(0,10.75,0),new THREE.Vector3(0,10.75,100)),true);
    assert.deepEqual(pool.shots.find(s=>s.active)!.direction,new THREE.Vector3(0,0,1),'reused slots must restore the launch heading');
  }finally{pool.dispose();weapon.dispose();targets.dispose();world.clear();}
});

test('a charged blast can clear several orb targets but cannot destroy gun rounds',()=>{
  const world=new CollisionWorld(),targets=new CombatTargetRegistry(world),body={position:new THREE.Vector3(0,2,0),radiusMetres:1.65};
  const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);o.y+=.75;d.set(0,0,1);}}});
  const pool=new ExterminatorProjectiles({world,targets,weapon,onPlayerHit:()=>{}});let intercepted=0;
  pool.events.on('impact',e=>{if(e.intercepted){assert.equal(e.kind,'orb');intercepted++;}});
  try {
    for(const x of [0,-5,5])pool.fireOrb(new THREE.Vector3(x,2.75,20),body.position);
    pool.fireGunVolley(new THREE.Vector3(3,2.75,20),new THREE.Vector3(-3,2.75,20),body.position,0);
    weapon.update(1.5,controls({firePressed:true,fireHeld:true}));weapon.update(.001,controls({fireReleased:true}));
    for(let i=0;i<30;i++)weapon.update(1/60,controls());
    assert.equal(intercepted,3);assert.equal(pool.shots.filter(s=>s.active&&s.kind==='orb').length,0);
    assert.equal(pool.shots.filter(s=>s.active&&s.kind==='gun').length,3);
  }finally{pool.dispose();weapon.dispose();targets.dispose();world.clear();}
});

test('fast shots use relative player sweeps, real cover, bounded capacities and clean reset/disposal',()=>{
  const world=new CollisionWorld(),targets=new CombatTargetRegistry(world),body={position:new THREE.Vector3(0,2,0),radiusMetres:1.65};
  const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);d.set(0,0,1);}}});
  let damage=0;const pool=new ExterminatorProjectiles({world,targets,weapon,onPlayerHit:d=>{damage+=d;}});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(30,8,1));wall.position.set(0,2,6);world.register(wall);
  try {
    pool.fireOrb(new THREE.Vector3(0,2,12),body.position);pool.update(.5,{...body,previousPosition:body.position});assert.equal(damage,0);assert.equal(pool.liveCount,0);
    world.unregister(wall);pool.fireOrb(new THREE.Vector3(0,2,12),body.position);pool.update(.5,{...body,previousPosition:body.position});assert.equal(damage,T.orbDamage);
    for(let i=0;i<40;i++)pool.fireOrb(new THREE.Vector3(0,20,12),new THREE.Vector3(0,20,100));
    assert.equal(pool.liveCount,T.orbCapacity);assert.equal(targets.registeredTargets.filter(r=>r.target.isCombatActive()).length,T.orbCapacity);
    for(let i=0;i<80;i++)pool.fireGunVolley(new THREE.Vector3(0,20,12),new THREE.Vector3(2,20,12),new THREE.Vector3(0,20,100),i);
    assert.equal(pool.liveCount,T.gunCapacity+T.orbCapacity);pool.clear();assert.equal(pool.liveCount,0);pool.dispose();pool.dispose();assert.equal(targets.size,0);
  }finally{pool.dispose();weapon.dispose();targets.dispose();world.clear();wall.geometry.dispose();(wall.material as THREE.Material).dispose();}
});

test('crossing projectiles intercept between frames, but earlier cover contact wins',()=>{
  for(const covered of [false,true]) {
    const world=new CollisionWorld(),targets=new CombatTargetRegistry(world),body={position:new THREE.Vector3(0,2,0),radiusMetres:1.65};
    const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);d.set(0,0,1);}}});
    const pool=new ExterminatorProjectiles({world,targets,weapon,onPlayerHit:()=>{}});
    const wall=new THREE.Mesh(new THREE.BoxGeometry(.2,4,4));let interceptions=0;
    pool.events.on('impact',e=>{if(e.intercepted)interceptions++;});
    try {
      weapon.update(.01,controls({aimHeld:true,firePressed:true,fireReleased:true}));
      const friendly=weapon.projectileStates.find(s=>s.active)!;
      const z=friendly.position.z+50*.1*.5,origin=new THREE.Vector3(-T.orbSpeed*.1*.5,friendly.position.y,z);
      pool.fireOrb(origin,new THREE.Vector3(100,friendly.position.y,z));
      if(covered){wall.position.set(-2,friendly.position.y,z);world.register(wall);}
      weapon.update(.1,controls({aimHeld:true}));
      assert.equal(weapon.readModel.liveProjectileCount,1,'the old enemy proxy lies outside the friendly path');
      // A distant target keeps the player out of this projectile-pair fixture.
      const target=new THREE.Vector3(100,friendly.position.y-.75,z);
      pool.update(.1,{position:target,previousPosition:target,radiusMetres:body.radiusMetres});
      assert.equal(interceptions,covered?0:1);
      assert.equal(weapon.readModel.liveProjectileCount,covered?1:0);
    }finally{pool.dispose();weapon.dispose();targets.dispose();world.clear();wall.geometry.dispose();(wall.material as THREE.Material).dispose();}
  }
});

test('opt-in spherical shields match their visible boundary, not an invisible bounding cube; box queries stay unchanged',()=>{
  for(const broadphaseEnabled of [true,false]) {
    const world=new CollisionWorld({broadphaseEnabled}),sphere=new THREE.Mesh(new THREE.SphereGeometry(1,16,12));
    sphere.scale.setScalar(28);sphere.userData.collisionSphereRadius=1;world.register(sphere,CollisionLayer.Projectile);
    const ray=new CollisionHit(),forward=new THREE.Vector3(0,0,1);
    assert.equal(world.raycast(new THREE.Vector3(27,27,-60),forward,120,ray,CollisionLayer.Projectile),false,'must not block the empty corners of its bounding box');
    assert.equal(world.raycast(new THREE.Vector3(0,0,-60),forward,120,ray,CollisionLayer.Projectile),true);assert.ok(Math.abs(ray.point.z+28)<1e-6);
    assert.equal(world.sweepSphere(new THREE.Vector3(0,0,-60),forward.clone().multiplyScalar(120),1,ray,CollisionLayer.Projectile),true);assert.ok(Math.abs(ray.point.z+29)<1e-6);
    sphere.visible=false;const box=new THREE.Mesh(new THREE.BoxGeometry(56,56,56));world.register(box,CollisionLayer.Projectile);
    assert.equal(world.raycast(new THREE.Vector3(27,27,-60),forward,120,ray,CollisionLayer.Projectile),true);assert.equal(ray.object?.uuid,box.uuid);
    world.clear();sphere.geometry.dispose();(sphere.material as THREE.Material).dispose();box.geometry.dispose();(box.material as THREE.Material).dispose();
  }
});


test('boss music begins at combat, spans both phases, fades on defeat and releases each retry attempt',()=>{
  const starts:BossMusic[]=[],defeats:BossMusic[]=[],stops:BossMusic[]=[];
  const off=[bossMusicEvents.on('started',cue=>starts.push(cue)),bossMusicEvents.on('defeated',cue=>defeats.push(cue)),bossMusicEvents.on('stopped',cue=>stops.push(cue))];
  const f=fixture();
  try {
    f.boss.reset();starts.length=stops.length=0;
    assert.equal(f.boss.start(),true);f.boss.update(8);assert.equal(starts.length,0,'the boss introduction retains normal music');
    f.boss.update(1);assert.equal(starts.length,1);const first=starts[0]!;
    for(let wave=0;wave<T.defenseThresholds.length;wave++) {
      assert.equal(f.boss.controller.applyImpact(hit()).accepted,true);
      f.tick(83);f.killSquad();f.tick();
    }
    assert.equal(f.boss.controller.applyImpact(hit()).accepted,true);f.tick();
    assert.equal(f.boss.controller.readModel.state,'transition');assert.equal(starts.length,1);
    f.boss.update(1/60,true);assert.equal(f.boss.controller.readModel.phase,2);assert.equal(starts.length,1,'Phase 2 keeps the original music owner');
    for(let hits=0;hits<10&&f.boss.controller.readModel.health>0;hits++) {f.boss.controller.applyImpact(hit());f.tick();}
    assert.equal(f.boss.controller.readModel.state,'defeated');assert.deepEqual(defeats,[first]);
    f.boss.reset();assert.deepEqual(stops,[first],'reset cancels a pending victory fade');
    assert.equal(f.boss.startPhaseTwo(),true);assert.equal(starts.length,2);assert.notEqual(starts[1],first);
    f.boss.suspend();assert.equal(stops.at(-1),starts[1]);
    f.boss.reset();f.boss.start(true);assert.equal(starts.length,3);
    f.boss.dispose();assert.equal(stops.at(-1),starts[2]);
  }finally{f.dispose();off.forEach(unsubscribe=>unsubscribe());}
});
