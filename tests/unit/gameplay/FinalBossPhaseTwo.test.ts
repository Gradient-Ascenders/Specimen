import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FinalBossController, finalBossAttackTiming, type FinalBossNormalAttack } from '../../../src/boss/FinalBossController.ts';
import { FinalBossEncounter } from '../../../src/boss/FinalBossEncounter.ts';
import { FinalBossPresentation } from '../../../src/boss/FinalBossPresentation.ts';
import { ExterminationArena } from '../../../src/boss/ExterminationArena.ts';
import { ExterminatorEvasion } from '../../../src/boss/ExterminatorEvasion.ts';
import { ExterminatorBeamSweep, BEAM_ANGULAR_SPEED, beamAngularSpeed, beamArcDuration, beamArcDistance, initialBeamDirection } from '../../../src/boss/ExterminatorBeamSweep.ts';
import { FINAL_ARENA, FINAL_BOSS_TUNING as T, FINAL_MERGE_ANCHOR, FINAL_SPECIMEN_MOVEMENT, FINAL_SPECIMEN_WEAPON } from '../../../src/boss/FinalBossConfig.ts';
import { CombatTargetRegistry } from '../../../src/combat/CombatTargetRegistry.ts';
import { SpecimenProjectileSystem, type SpecimenAttackControls } from '../../../src/combat/SpecimenProjectileSystem.ts';
import { CollisionWorld, CollisionHit, CollisionLayer } from '../../../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../../../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';

const controls=(o:Partial<SpecimenAttackControls>={}):SpecimenAttackControls=>({active:true,aimHeld:false,fireHeld:false,firePressed:false,fireReleased:false,gameplayInputEnabled:true,pointerLocked:true,...o});
const hit=(damageUnits=999)=>({projectileId:1,targetId:'core',kind:'direct' as const,chargeAmount:0,fullyCharged:false,damageUnits,point:new THREE.Vector3(),direction:new THREE.Vector3()});
const target=FINAL_MERGE_ANCHOR.clone();
const targetAtYaw=(yaw:number)=>new THREE.Vector3(-82.5*Math.sin(yaw),FINAL_MERGE_ANCHOR.y,FINAL_ARENA.centreZ-82.5*Math.cos(yaw));
function enterPhaseTwo(c:FinalBossController):void {
  c.start(true);
  for(let wave=0;wave<3;wave++) {
    c.applyImpact(hit());c.update(1.35,target);for(let i=0,n=c.readModel.defendersRemaining;i<n;i++)c.droneDestroyed();c.update(1.21,target);
  }
  c.applyImpact(hit());c.update(1/60,target);assert.equal(c.readModel.state,'transition');c.skipCinematic(target);
}
function choose(c:FinalBossController,attack:FinalBossNormalAttack):void {
  for(let i=0;i<10000;i++) {
    const m=c.readModel;if(m.attack===attack&&m.stage==='telegraph'&&m.elapsed<.02)return;
    c.update(1/60,target);
  }assert.fail(`did not select ${attack}`);
}
class Element {
  dataset:Record<string,string>={};hidden=false;className='';textContent='';value=0;max=0;onclick:unknown;
  ownerDocument={createElement:()=>new Element()};append(..._children:Element[]):void{}setAttribute(_a:string,_b:string):void{}remove():void{}
}
function fixture(invincible=true,random=()=>0) {
  const arena=new ExterminationArena(),world=new CollisionWorld(),surfaces=new SurfaceRegistry(),targets=new CombatTargetRegistry(world);
  world.registerAll(arena.collisionMeshes);surfaces.registerAll(arena.collisionMeshes);
  const body=new KinematicBody({world,surfaces,initialPosition:FINAL_MERGE_ANCHOR,config:FINAL_SPECIMEN_MOVEMENT}),aim=new THREE.Vector3(0,0,1);
  const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:targets,body,config:FINAL_SPECIMEN_WEAPON,aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);o.y+=.75;d.copy(aim);}}});
  const presentation=new FinalBossPresentation(),boss=new FinalBossEncounter({arena,world,targets,body,weapon,presentation,random,host:new Element() as unknown as HTMLElement,requestFailure:()=>{boss.suspend();return true;}});
  boss.start(true);if(invincible)boss.controller.damagePlayer=()=>false;
  const zero=new THREE.Vector3();
  const tick=(n=1)=>{for(let i=0;i<n;i++){body.update(1/60,zero);weapon.update(1/60,controls());boss.update(1/60);}};
  const killSquad=()=>{for(const root of boss.squad.root.children)if(root.visible)targets.getRegistrationForMesh(root.children[0] as THREE.Mesh)!.target.applyImpact(hit());};
  const phaseTwo=()=>{
    for(let i=0;i<3;i++){boss.controller.applyImpact(hit());tick(82);killSquad();tick(73);}
    boss.controller.applyImpact(hit());tick();assert.equal(boss.controller.readModel.state,'transition');boss.controller.skipCinematic(body.position);tick();
  };
  const aimCore=()=>aim.subVectors(presentation.coreWorld,body.position.clone().add(new THREE.Vector3(0,.75,0))).normalize();
  return {arena,world,targets,body,weapon,presentation,boss,tick,killSquad,phaseTwo,aimCore,dispose:()=>{boss.dispose();weapon.dispose();targets.dispose();arena.dispose();world.clear();surfaces.clear();}};
}

test('phase two starts at exactly 375/750 HP; reinforcement crossings are once-only without shield/healing or attack interruption',()=>{
  const c=new FinalBossController({random:()=>0});c.start(true);
  try {
    for(let i=0;i<3;i++){c.applyImpact(hit());c.update(1.35,target);for(let j=0,n=c.readModel.defendersRemaining;j<n;j++)c.droneDestroyed();c.update(1.21,target);}
    assert.equal(c.readModel.maximumHealth,750);assert.equal(T.phaseTwoHealth,c.readModel.maximumHealth/2);
    c.applyImpact(hit(c.readModel.health-376));c.update(1/60,target);assert.equal(c.readModel.health,376);assert.equal(c.readModel.phase,1);assert.equal(c.readModel.state,'combat');
    c.applyImpact(hit(1));assert.equal(c.applyImpact(hit()).accepted,false,'the halfway crossing must close damage synchronously');
    c.update(1/60,target);assert.equal(c.readModel.health,375);assert.equal(c.readModel.state,'transition');c.skipCinematic(target);
    const serial=c.readModel.attackSerial;
    for(const [i,hp] of [262.5,187.5,75].entries()) {
      c.applyImpact(hit());assert.equal(c.readModel.health,hp);assert.equal(c.readModel.reinforcementIndex,i+1);
      assert.equal(c.readModel.attackSerial,serial);assert.equal(c.readModel.shieldActive,false);assert.equal(c.readModel.weakPointOpen,true);
      c.update(.1,target);assert.equal(c.readModel.health,hp);assert.equal(c.readModel.regenerating,false);
    }
    c.applyImpact(hit());c.update(1/60,target);assert.equal(c.readModel.state,'defeated');
    c.reset();assert.equal(c.readModel.reinforcementIndex,0);
  }finally{c.dispose();}
});

test('the 750 HP boss shields exactly at 637.5, 525 and 412.5 HP, all before the 375 HP phase transition',()=>{
  const c=new FinalBossController({random:()=>0});c.start(true);
  try {
    assert.equal(c.readModel.health,750);
    for(const [i,hp] of [637.5,525,412.5].entries()) {
      c.applyImpact(hit(c.readModel.health-hp-1));c.update(1/60,target);
      assert.equal(c.readModel.health,hp+1);assert.equal(c.readModel.shieldActive,false);assert.equal(c.readModel.defenseIndex,i);
      c.applyImpact(hit(1));assert.equal(c.readModel.health,hp);assert.equal(c.readModel.shieldActive,true);assert.equal(c.readModel.defenseIndex,i+1);
      c.update(1.35,target);for(let j=0,n=c.readModel.defendersRemaining;j<n;j++)c.droneDestroyed();c.update(1.21,target);
    }
    c.applyImpact(hit());c.update(1/60,target);assert.equal(c.readModel.health,375);assert.equal(c.readModel.state,'transition');
    c.skipCinematic(target);assert.equal(c.readModel.phase,2);assert.equal(c.readModel.shieldActive,false);
  }finally{c.dispose();}
});

test('phase-two checkpoint entry starts fresh combat at 375 HP without an intro, shield replay or duplicate transition event',()=>{
  const c=new FinalBossController({random:()=>.999});
  try {
    assert.equal(c.startPhaseTwo(target),true);const m=c.readModel;
    assert.equal(m.state,'combat');assert.equal(m.phase,2);assert.equal(m.health,375);assert.equal(m.maximumHealth,750);
    assert.equal(m.playerHealth,100);assert.equal(m.defenseIndex,3);assert.equal(m.shieldActive,false);assert.equal(m.regenerating,false);
    assert.equal(m.reinforcementIndex,0);assert.equal(m.defendersRemaining,0);assert.equal(m.stage,'telegraph');assert.equal(m.attack,'ram');
    assert.equal(c.cinematic,false);assert.equal(c.consumeTransition(),false);assert.equal(c.startPhaseTwo(target),false);assert.equal(c.start(true),false);
    assert.equal(c.damagePlayer(45,-1),true);c.applyImpact(hit());assert.equal(m.health,262.5);assert.equal(m.reinforcementIndex,1);
    c.suspend();assert.equal(c.startPhaseTwo(target),false);c.reset();assert.equal(c.startPhaseTwo(target),true);
    assert.equal(m.health,375);assert.equal(m.playerHealth,100);assert.equal(m.invulnerability,0);assert.equal(m.reinforcementIndex,0);assert.equal(c.consumeTransition(),false);
  }finally{c.dispose();}
  assert.equal(c.startPhaseTwo(target),false);
});

test('phase-two normal attacks include RAM with no consecutive repeats, and gun timings stay unchanged',()=>{
  let seed=417;const c=new FinalBossController({random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
  try {
    enterPhaseTwo(c);const counts:Record<string,number>={};
    for(let i=0;i<4000;i++) {
      const previous=c.readModel.attack,[a,b,d]=finalBossAttackTiming(previous,2);c.update(a+b+d+.000001,target);
      const current=c.readModel.attack;assert.notEqual(current,previous);assert.notEqual(current,'summon-defend');counts[current]=(counts[current]??0)+1;
    }
    assert.deepEqual(Object.keys(counts).sort(),['gun-blast','laser-beam','laser-shots','ram']);
    for(const n of Object.values(counts))assert.ok(n>850&&n<1150,JSON.stringify(counts));
    assert.deepEqual(finalBossAttackTiming('gun-blast',1),finalBossAttackTiming('gun-blast',2));
  }finally{c.dispose();}
});

test('the first beam turn takes the shortest signed angle toward the player, including wraparound and deterministic ties',()=>{
  for(const [origin,offset,wanted] of [[0,.3,1],[0,-.3,-1],[Math.PI-.1,.3,1],[-Math.PI+.1,-.3,-1],[0,0,1],[0,Math.PI,1],[0,-Math.PI,1]] as const)
    assert.equal(initialBeamDirection(origin,targetAtYaw(origin+offset)),wanted,`origin ${origin}, offset ${offset}`);
});

for(const phase of [1,2] as const)for(const direction of [1,-1] as const)test(`phase ${phase} chooses initial beam direction ${direction} from the player at firing time, then reverses without another choice`,()=>{
  let rolls=0;const c=new FinalBossController({random:()=>{rolls++;return phase===1?.99:.6;}}),origin=Math.PI-.1;
  try {
    if(phase===1){c.start();c.skipCinematic(targetAtYaw(origin));}else c.startPhaseTwo(targetAtYaw(origin));
    assert.equal(c.readModel.attack,'laser-beam');const [warning]=finalBossAttackTiming('laser-beam',phase);
    c.update(warning-.01,targetAtYaw(origin-direction*.3));
    c.update(.01,targetAtYaw(origin+direction*.3));
    const m=c.readModel;assert.equal(m.stage,'active');assert.equal(m.beamDirection,direction);
    assert.deepEqual(m.beamDirections,Array.from({length:phase===1?3:7},(_,i)=>i%2===0?direction:-direction));
    assert.equal(rolls,1,'the initial direction and later reversals must not consume RNG');
    c.update(.25,targetAtYaw(origin-direction*.3));
    assert.ok(Math.abs(m.beamRotationRadians-direction*beamArcDistance(Math.PI*2,.25,phase))<1e-8,'later movement must not flip an active sweep');
    c.update(beamArcDuration(Math.PI*2,phase)-.25,targetAtYaw(origin));
    assert.equal(m.beamLapsCompleted,1);assert.equal(m.beamDirection,-direction);
    assert.ok(Math.abs(m.beamRotationRadians-direction*Math.PI*2)<1e-8);
  }finally{c.dispose();}
});

test('a negative first circle mirrors the complete phase-two entry and all five half-sweeps without angle snaps',()=>{
  const sweep=new ExterminatorBeamSweep(),origin=-Math.PI+.1,centre=origin-.4,player=targetAtYaw(centre),opposite=targetAtYaw(centre+Math.PI);
  sweep.reset(2,origin,-1);sweep.advance(beamArcDuration(Math.PI*2,2),player);
  assert.equal(sweep.direction,1);assert.equal(sweep.lapsCompleted,1);
  const from=-Math.PI*2,upper=centre-origin+Math.PI/2,entry=((upper-from)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
  let previous=sweep.angle;
  const advance=(seconds:number)=>{
    for(let remaining=seconds;remaining>1e-8;){const dt=Math.min(1/120,remaining);sweep.advance(dt,opposite);remaining-=dt;
      assert.ok(Math.abs(sweep.angle-previous)<=beamAngularSpeed(2)*dt+1e-8);previous=sweep.angle;}
  };
  advance(beamArcDuration(entry,2));
  for(let half=0;half<5;half++) {
    assert.equal(sweep.direction,half%2===0?-1:1);advance(beamArcDuration(Math.PI,2)/2);
    assert.ok(Math.abs(Math.atan2(Math.sin(origin+sweep.angle-centre),Math.cos(origin+sweep.angle-centre)))<1e-8,'every mirrored half must still pass through the captured player bearing');
    advance(beamArcDuration(Math.PI,2)/2);
  }
  assert.equal(sweep.finished,true);assert.equal(sweep.lapsCompleted,6);
});

for(const phase of [1,2] as const)for(const direction of [1,-1] as const)test(`phase ${phase} rendered beam turns ${direction} toward the player's real ring position`,()=>{
  const f=fixture(true,()=>phase===1?.99:.6);
  try {
    if(phase===2)f.phaseTwo();choose(f.boss.controller,'laser-beam');
    const m=f.boss.controller.readModel,origin=Math.atan2(-m.lockedTarget.x,FINAL_ARENA.centreZ-m.lockedTarget.z);
    f.tick(12);f.body.recoverAt(targetAtYaw(origin+direction*.2));
    for(let i=0;i<180&&m.stage==='telegraph';i++)f.tick();
    assert.equal(m.stage,'active');assert.equal(m.beamDirections[0],direction);const before=Math.abs(origin-(origin+direction*.2));
    f.tick(20);assert.equal(f.presentation.beam.visible,true);assert.equal(f.presentation.beam.scale.x,T.beamRadius);
    const beam=f.presentation.copyBeamDirection(new THREE.Vector3()),yaw=Math.atan2(-beam.x,-beam.z),toPlayer=Math.atan2(-f.body.position.x,FINAL_ARENA.centreZ-f.body.position.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(toPlayer-yaw),Math.cos(toPlayer-yaw)))<before,'the visible damaging ray must approach the player, not rotate away');
    assert.ok(m.beamRotationRadians*direction>0);assert.ok(Math.abs(f.presentation.machine.rotation.y-origin-m.beamRotationRadians)<1e-8);
  }finally{f.dispose();}
});

test('phase-two beam stays on and alternates five player-centred half sweeps at 1.5x phase-one cruise speed',()=>{
  const c=new FinalBossController({random:()=>.5});
  try {
    enterPhaseTwo(c);choose(c,'laser-beam');const origin=Math.atan2(-c.readModel.lockedTarget.x,FINAL_ARENA.centreZ-c.readModel.lockedTarget.z);
    assert.deepEqual(c.readModel.beamDirections,[1,-1,1,-1,1,-1,1]);c.update(finalBossAttackTiming('laser-beam',2)[0],target);
    const current=new THREE.Vector3(70,2,FINAL_ARENA.centreZ),yaw=Math.atan2(-current.x,FINAL_ARENA.centreZ-current.z);
    c.update(beamArcDuration(Math.PI*2,2),current);assert.equal(c.readModel.beamLapsCompleted,1);assert.equal(c.readModel.beamDirection,-1);
    const lower=yaw-origin-Math.PI/2,entry=((Math.PI*2-lower)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),movingTarget=new THREE.Vector3(-70,12,FINAL_ARENA.centreZ);
    let previous=c.readModel.beamRotationRadians;
    const advanceSmooth=(duration:number)=>{
      for(let remaining=duration;remaining>1e-8;) {
        const dt=Math.min(1/120,remaining);c.update(dt,movingTarget);remaining-=dt;
        const m=c.readModel,delta=Math.abs(m.beamRotationRadians-previous);previous=m.beamRotationRadians;
        assert.ok(delta<=beamAngularSpeed(2)*dt+1e-7,'no fast realignment or angle snaps');assert.equal(m.beamRetargeting,false);
        assert.equal(m.beamTargetYaw,yaw,'the half-circle centre must not chase the moving player');
      }
    };
    advanceSmooth(beamArcDuration(entry,2));
    for(let i=0;i<T.phaseTwoBeamHalves;i++) {
      assert.equal(c.readModel.beamDirection,i%2===0?1:-1);
      advanceSmooth(beamArcDuration(Math.PI,2)/2);
      const midpoint=origin+c.readModel.beamRotationRadians;
      assert.ok(Math.abs(Math.atan2(Math.sin(midpoint-yaw),Math.cos(midpoint-yaw)))<1e-7);
      advanceSmooth(beamArcDuration(Math.PI,2)/2);
    }
    assert.equal(c.readModel.beamLapsCompleted,6);assert.equal(c.readModel.stage,'recovery');
  }finally{c.dispose();}
});

test('phase-two beam cruise is 1.5x faster without shortening 0.8-second turns or changing phase one',()=>{
  assert.equal(T.beamTurnSeconds,.8);
  assert.equal(beamAngularSpeed(1),BEAM_ANGULAR_SPEED);assert.equal(beamAngularSpeed(2)/beamAngularSpeed(1),1.5);
  for(const phase of [1,2] as const)for(const arc of [Math.PI,Math.PI*2]) {
    const speed=beamAngularSpeed(phase),end=beamArcDuration(arc,phase),epsilon=1e-5;
    assert.ok(beamArcDistance(arc,epsilon,phase)/epsilon<.00001);
    assert.ok((arc-beamArcDistance(arc,end-epsilon,phase))/epsilon<.00001);
    assert.ok(Math.abs((beamArcDistance(arc,1+epsilon,phase)-beamArcDistance(arc,1,phase))/epsilon-speed)<1e-6);
    assert.ok(Math.abs(end-arc/speed-.8)<1e-8,'turn easing must stay at .8 s, not be sped up with cruise');
  }
  for(const phase of [1,2] as const) {
    const sweep=new ExterminatorBeamSweep();sweep.reset(phase,0);let previous=0,iterations=0;
    while(!sweep.finished&&iterations++<6000){sweep.advance(1/120,target);assert.ok(Math.abs(sweep.angle-previous)<=beamAngularSpeed(phase)/120+1e-8);previous=sweep.angle;}
    assert.equal(sweep.finished,true);assert.equal(sweep.lapsCompleted,phase===1?3:6);
  }
});

test('only attacker kills drop persistent health packs, actual pickup restores 25% max HP and never overheals',()=>{
  const f=fixture(false);
  try {
    assert.equal(f.boss.controller.damagePlayer(50,-1),true);f.boss.controller.applyImpact(hit());f.tick(82);
    const roots=f.boss.squad.root.children;
    f.targets.getRegistrationForMesh(roots[0]!.children[0] as THREE.Mesh)!.target.applyImpact(hit());assert.equal(f.boss.healthPacks.activeCount,0);
    f.targets.getRegistrationForMesh(roots[8]!.children[0] as THREE.Mesh)!.target.applyImpact(hit());assert.equal(f.boss.healthPacks.activeCount,1);
    f.boss.squad.clear();const pack=f.boss.healthPacks.packs.find(p=>p.active)!;
    f.body.recoverAt(new THREE.Vector3(pack.position.x,FINAL_MERGE_ANCHOR.y,pack.position.z));f.tick(180);
    assert.equal(f.boss.healthPacks.activeCount,0);assert.equal(f.boss.controller.readModel.playerHealth,75);f.tick(60);assert.equal(f.boss.controller.readModel.playerHealth,75);
    assert.equal(f.boss.controller.healPlayer(),true);assert.equal(f.boss.controller.readModel.playerHealth,100);assert.equal(f.boss.controller.healPlayer(),false);
    f.boss.healthPacks.drop(f.body.position);f.tick(20);assert.equal(f.boss.healthPacks.activeCount,1,'full health must not waste a pack');
    f.boss.reset();assert.equal(f.boss.healthPacks.activeCount,0);
  }finally{f.dispose();}
});

test('all three advanced wings can coexist while the boss attacks: six clean large guardians and two attackers per wave',()=>{
  const f=fixture();
  try {
    f.phaseTwo();const serial=f.boss.controller.readModel.attackSerial;
    for(let i=0;i<3;i++) {
      f.boss.controller.applyImpact(hit());f.tick();assert.equal(f.boss.reinforcements.activeCount,(i+1)*8);
      assert.equal(f.boss.controller.readModel.shieldActive,false);assert.equal(f.boss.controller.readModel.attackSerial,serial);
      const wing=f.boss.reinforcements.wings[i]!;assert.equal(wing.flight.guardianCount,6);assert.equal(wing.squad.root.children.filter((_,j)=>!wing.flight.isGuardian(j)).length,2);
      const root=wing.squad.root.children[0]!,collider=root.children[0] as THREE.Mesh;
      assert.equal((collider.geometry as THREE.BoxGeometry).parameters.width,1.8*T.advancedScale*T.minionScale);
      assert.equal(wing.visuals[0]!.advanced,true);
      assert.equal(wing.visuals[0]!.root.scale.x,T.advancedScale*T.minionScale);
    }
    f.tick(300);assert.ok(f.presentation.smoke.count>0&&f.presentation.smoke.count<=48);
    assert.ok(f.boss.reinforcements.liveProjectileCount<=3*T.advancedProjectileCapacity);
    const wing=f.boss.reinforcements.wings[0]!,roots=wing.squad.root.children;
    const first=f.targets.getRegistrationForMesh(roots[0]!.children[0] as THREE.Mesh)!.target;
    for(let tap=0;tap<3;tap++)assert.equal(first.applyImpact(hit(2)).destroyed,tap===2);
    const second=f.targets.getRegistrationForMesh(roots[1]!.children[0] as THREE.Mesh)!.target;
    assert.equal(second.applyImpact({...hit(18),fullyCharged:true,chargeAmount:1}).destroyed,true);
    const packs=f.boss.healthPacks.activeCount;
    f.targets.getRegistrationForMesh(roots[6]!.children[0] as THREE.Mesh)!.target.applyImpact(hit());assert.equal(f.boss.healthPacks.activeCount,packs+1);
    const p=roots[7]!.position.clone();f.boss.present(.3);assert.deepEqual(roots[7]!.position,p);
    f.boss.reset();assert.equal(f.boss.reinforcements.activeCount,0);assert.equal(f.boss.reinforcements.liveProjectileCount,0);assert.equal(f.presentation.smoke.count,0);
  }finally{f.dispose();}
});

test('advanced guardian and attacker weapons match their phase-one firing cadence',()=>{
  const f=fixture();
  try {
    f.phaseTwo();f.boss.controller.applyImpact(hit());f.tick();const wing=f.boss.reinforcements.wings[0]!,counts=new Map<string,number>();
    wing.squad.events.on('projectileFired',e=>counts.set(e.droneId,(counts.get(e.droneId)??0)+1));f.tick(180);counts.clear();f.tick(420);
    assert.equal(T.advancedAttackSpeed,1);
    assert.equal(counts.get('advanced-wing-1-1'),10);assert.ok([6,7].includes(counts.get('advanced-wing-1-7')!));
  }finally{f.dispose();}
});

for(const roll of [0,.5,.999])test(`phase-two eye burst always fires five rapidly spread straight orbs (RNG ${roll})`,()=>{
  let next:number[]=[];const f=fixture(true,()=>next.shift()??0);
  try {
    f.phaseTwo();const m=f.boss.controller.readModel;
    if(m.attack==='laser-shots'){const [a,b,c]=finalBossAttackTiming(m.attack,2);f.boss.controller.update(a+b+c,target);}
    const choices=(['gun-blast','laser-shots','laser-beam','ram'] as const).filter(a=>a!==f.boss.controller.readModel.attack),index=choices.indexOf('laser-shots');
    next=[(index+.01)/choices.length];const [a,b,c]=finalBossAttackTiming(f.boss.controller.readModel.attack,2);f.boss.controller.update(a+b+c+.000001,target);next=[roll];
    assert.equal(m.attack,'laser-shots');assert.equal(m.orbCount,5);
    const headings:THREE.Vector3[]=[],times:number[]=[];
    f.boss.projectiles.events.on('fired',e=>{if(e.kind==='orb'){headings.push(f.boss.projectiles.shots.find(s=>s.active&&s.id===e.id)!.direction.clone());times.push(m.elapsed);}});
    f.tick(91);assert.equal(headings.length,5);
    for(let i=1;i<headings.length;i++){assert.ok(times[i]!-times[i-1]!<.15);assert.ok(headings[i]!.angleTo(headings[i-1]!)>.08);}
  }finally{f.dispose();}
});

test('RAM physically crosses the charge path, breaks complete cover assemblies and hits for high damage; retry restores cover',()=>{
  const f=fixture(false,()=>.999);
  try {
    f.phaseTwo();assert.equal(f.boss.controller.readModel.attack,'ram');
    const cover=f.arena.cover[0]!,radial=cover.position.clone().setY(0).sub(new THREE.Vector3(0,0,FINAL_ARENA.centreZ)).normalize();
    f.body.recoverAt(new THREE.Vector3(radial.x*82,FINAL_MERGE_ANCHOR.y,FINAL_ARENA.centreZ+radial.z*82));
    const start=f.presentation.machine.position.clone();let moved=0,impacts=0,shake=0;
    const showImpact=f.presentation.showRamImpact.bind(f.presentation);f.presentation.showRamImpact=(at,normal)=>{impacts++;showImpact(at,normal);};
    f.tick(60);assert.equal(f.boss.controller.readModel.stage,'telegraph');assert.equal(f.presentation.ramWarning.visible,true);
    assert.ok(f.presentation.machine.position.distanceTo(start)>4,'windup should visibly retreat before the charge');
    let wallImpact=false;
    for(let i=0;i<155;i++){
      f.tick();moved=Math.max(moved,start.distanceTo(f.presentation.machine.position));wallImpact ||= f.presentation.ramImpact.visible;
      const camera=new THREE.PerspectiveCamera();f.boss.presentCamera(camera);shake=Math.max(shake,camera.position.length());
    }
    assert.ok(wallImpact,'wall collision must produce a shockwave');
    assert.equal(impacts,1,'wall contact should stop the charge and deliver one impact, not jitter into the wall');assert.ok(shake>.65);
    assert.ok(moved>55);assert.equal(cover.visible,false);assert.equal(f.arena.coverAssemblies[0]!.visible,false);assert.equal(f.boss.controller.readModel.playerHealth,100-T.ramDamage);
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(cover.quaternion),probe=new CollisionHit();
    assert.equal(f.world.sweepSphere(cover.position.clone().addScaledVector(forward,-5),forward.multiplyScalar(10),.2,probe),false,'destroyed cover must not leave a collision wall');
    f.boss.reset();assert.equal(cover.visible,true);assert.equal(f.arena.coverAssemblies[0]!.visible,true);assert.equal(f.presentation.ramImpact.visible,false);
  }finally{f.dispose();}
});

for(const phase of [1,2])test(`phase ${phase} takes full-charge and partial core hits without any evasive roll`,()=>{
  const f=fixture();
  try {
    if(phase===2)f.phaseTwo();const health=f.boss.controller.readModel.health;
    f.tick(90);f.aimCore();f.weapon.update(1.5,controls({firePressed:true,fireHeld:true}));f.aimCore();f.weapon.update(.001,controls({fireReleased:true}));
    let offset=0,roll=0;
    for(let i=0;i<180;i++){f.tick();offset=Math.max(offset,f.presentation.evasionOffset.length());roll=Math.max(roll,Math.abs(f.presentation.evasionRoll));}
    assert.equal(offset,0);assert.equal(roll,0);assert.equal(f.boss.controller.readModel.health,health-18);
    const beforePartial=f.boss.controller.readModel.health;
    f.aimCore();f.weapon.update(.375,controls({firePressed:true,fireHeld:true}));f.aimCore();f.weapon.update(.001,controls({fireReleased:true}));f.tick(120);
    assert.ok(f.boss.controller.readModel.health<beforePartial,'partial shots must not be dodged or made invulnerable');
    f.boss.reset();assert.equal(f.presentation.evasionOffset.length(),0);assert.equal(f.presentation.evasionRoll,0);
  }finally{f.dispose();}
});

for(const stage of ['telegraph','active','recovery'] as const)test(`RAM ${stage} commits to its move instead of rolling away from a real full-charge eye hit`,()=>{
  const f=fixture(true,()=>.999);
  try {
    f.phaseTwo();const m=f.boss.controller.readModel;
    for(let i=0;i<400&&m.stage!==stage;i++)f.tick();
    assert.equal(m.attack,'ram');assert.equal(m.stage,stage);
    // Isolate each counter window with a close eye-level firing pose. The
    // actual weapon still travels through the registered eye/armour colliders.
    const forward=f.presentation.copyBeamDirection(new THREE.Vector3());
    f.body.recoverAt(f.presentation.coreWorld.clone().addScaledVector(forward,6).setY(f.presentation.coreWorld.y-.75));
    f.aimCore();f.weapon.update(1.5,controls({firePressed:true,fireHeld:true}));f.aimCore();f.weapon.update(.001,controls({fireReleased:true}));
    const before=m.health;
    for(let i=0;i<12;i++){f.tick();assert.equal(f.presentation.evasionOffset.length(),0);assert.equal(f.presentation.evasionRoll,0);}
    assert.equal(m.health,before-18,'committing to RAM should allow the full charged damage, not merely hide the roll');
  }finally{f.dispose();}
});

test('each dodge makes exactly one early roll in either direction, with no extra flips during the return or after it',()=>{
  const world=new CollisionWorld(),eye=new THREE.Mesh(new THREE.SphereGeometry(4)),machine=new THREE.Group();machine.position.z=FINAL_ARENA.centreZ;
  eye.position.copy(machine.position);world.register(eye,CollisionLayer.Projectile);
  const dodge=new ExterminatorEvasion({world,eye,machine}),core=eye.position;
  const shot={id:1,active:true,position:core.clone().add(new THREE.Vector3(0,0,-12)),previousPosition:core.clone(),direction:new THREE.Vector3(0,0,1),chargeAmount:1,fullyCharged:true,radiusMetres:.7};
  for(const id of [1,2]) {
    shot.id=id;let previous=0,travel=0,signed=0,reachedPeak=false,returnSamples=0;
    for(let i=0;i<240;i++) {
      dodge.update(1/120,true,core,[shot]);
      const delta=Math.atan2(Math.sin(dodge.roll-previous),Math.cos(dodge.roll-previous));travel+=Math.abs(delta);signed+=delta;previous=dodge.roll;
      if((i+1)/120>=T.dodgeRollSeconds)assert.equal(dodge.roll,0,'the hull must settle upright as soon as its single roll finishes');
      if(dodge.offset.length()>33.9)reachedPeak=true;
      if(reachedPeak&&dodge.active&&dodge.offset.length()<33.5){assert.equal(dodge.roll,0);returnSamples++;}
    }
    assert.ok(Math.abs(travel-Math.PI*2)<1e-8,`one complete roll, not ${travel/Math.PI/2}`);
    assert.ok(id===1?signed<0:signed>0,'successive dodges must each make one roll, even when their direction changes');
    assert.ok(returnSamples>20);assert.equal(dodge.active,false);assert.equal(dodge.offset.length(),0);
  }
  world.clear();eye.geometry.dispose();(eye.material as THREE.Material).dispose();
});

test('rolls wait for an imminent unblocked eye impact and ignore partial charges, armour, cover and near misses',()=>{
  const world=new CollisionWorld(),eye=new THREE.Mesh(new THREE.SphereGeometry(4)),machine=new THREE.Group();machine.position.z=FINAL_ARENA.centreZ;
  eye.position.copy(machine.position);world.register(eye,CollisionLayer.Projectile);const dodge=new ExterminatorEvasion({world,eye,machine});
  const shot={id:1,active:true,position:eye.position.clone().add(new THREE.Vector3(0,0,-32)),previousPosition:eye.position.clone(),direction:new THREE.Vector3(0,0,1),chargeAmount:1,fullyCharged:true,radiusMetres:.7};
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(20,20,.5));blocker.position.copy(eye.position).add(new THREE.Vector3(0,0,-6));
  try {
    dodge.update(1/60,true,eye.position,[shot]);assert.equal(dodge.active,false,'32m away is too early');
    shot.position.z=eye.position.z-12;shot.fullyCharged=false;dodge.update(1/60,true,eye.position,[shot]);assert.equal(dodge.active,false);
    shot.fullyCharged=true;shot.position.x=6;dodge.update(1/60,true,eye.position,[shot]);assert.equal(dodge.active,false,'near misses are not imminent hits');
    shot.position.x=0;world.register(blocker,CollisionLayer.Projectile);dodge.update(1/60,true,eye.position,[shot]);assert.equal(dodge.active,false,'the first projectile contact is cover, not the eye');
    world.unregister(blocker);dodge.update(1/60,false,eye.position,[shot]);assert.equal(dodge.active,false);
    dodge.update(1/60,true,eye.position,[shot]);assert.equal(dodge.active,true);
    dodge.reset();assert.equal(dodge.roll,0);assert.equal(dodge.offset.length(),0);
  }finally{world.clear();for(const m of [eye,blocker]){m.geometry.dispose();(m.material as THREE.Material).dispose();}}
});
