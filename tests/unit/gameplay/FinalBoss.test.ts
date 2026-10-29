import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FinalBossController, finalBossAttackTiming } from '../../../src/boss/FinalBossController.ts';
import { ExterminationArena } from '../../../src/boss/ExterminationArena.ts';
import { FINAL_ARENA, FINAL_ARENA_RING, FINAL_ARENA_ORBIT, FINAL_BOSS_TUNING, FINAL_BOSS_CHECKPOINT, FINAL_MERGE_ANCHOR, FINAL_SPECIMEN_MOVEMENT, FINAL_SPECIMEN_RADIUS, FINAL_SPECIMEN_WEAPON, finalArenaSupportY, finalArenaY, finalArenaZ } from '../../../src/boss/FinalBossConfig.ts';
import { SentinelDroneSquad } from '../../../src/boss/attacks/SentinelDroneAttack.ts';
import { CollisionWorld, CollisionHit, ColliderTransformMode } from '../../../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';
import { KinematicBody, DEFAULT_KINEMATIC_BODY_CONFIG } from '../../../src/physics/KinematicBody.ts';
import type { CombatImpact } from '../../../src/combat/CombatTargetRegistry.ts';
import { CombatTargetRegistry } from '../../../src/combat/CombatTargetRegistry.ts';
import { SpecimenProjectileSystem, type SpecimenAttackControls } from '../../../src/combat/SpecimenProjectileSystem.ts';
import { FixtureCombatTarget } from '../../../src/combat/CombatTargetAdapters.ts';

const target=new THREE.Vector3(0,2.07,finalArenaZ(197));
const impact=(damageUnits=12):CombatImpact=>({projectileId:1,targetId:'extermination-core',kind:'direct',chargeAmount:1,fullyCharged:true,damageUnits,point:target,direction:target});

test('full charges take 0.75 seconds and accepted charged hits freeze the boss for exactly half a second', () => {
  assert.equal(FINAL_SPECIMEN_WEAPON.fullChargeSeconds, .75); assert.equal(FINAL_SPECIMEN_WEAPON.minimumDamageUnits, 1);
  const b = new FinalBossController({ random: () => 0 }); b.start(true); b.update(.2, target);
  const clock = b.time, elapsed = b.readModel.elapsed;
  assert.equal(b.applyImpact(impact(18)).accepted, true); assert.equal(b.readModel.stunRemaining, .5);
  b.update(.2, target); assert.equal(b.time, clock); assert.equal(b.readModel.elapsed, elapsed);
  assert.equal(b.applyImpact({ ...impact(1), fullyCharged: false, chargeAmount: 0 }).accepted, true);
  assert.ok(Math.abs(b.readModel.stunRemaining - .3) < 1e-9);
  b.update(.3, target); assert.equal(b.readModel.stunRemaining, 0); assert.equal(b.time, clock);
  b.update(.05, target); assert.ok(Math.abs(b.time - clock - .05) < 1e-9);
  assert.ok(Math.abs(b.readModel.elapsed - elapsed - .05) < 1e-9);
  b.reset(); assert.equal(b.readModel.stunRemaining, 0); b.dispose();
});

test('checking whether an attack could hurt the player does not consume health, grace or its attack serial',()=>{
  const b=new FinalBossController();b.start(true);
  try {
    assert.equal(b.canDamagePlayer(7,42),true);assert.equal(b.canDamagePlayer(7,42),true);
    assert.equal(b.readModel.playerHealth,100);assert.equal(b.readModel.invulnerability,0);
    assert.equal(b.damagePlayer(7,42),true);assert.equal(b.canDamagePlayer(7,-1),false);
    b.update(.46,target);assert.equal(b.canDamagePlayer(7,42),false,'an already consumed major attack is not a perfect dodge');
    assert.equal(b.canDamagePlayer(7,-1),true);
    b.suspend();assert.equal(b.canDamagePlayer(7,-1),false);
  }finally{b.dispose();}
});
function until(b:FinalBossController,predicate:()=>boolean,steps=12000):void {
  for(let i=0;i<steps&&!predicate();i++)b.update(1/60,target);
  assert.ok(predicate(),JSON.stringify(b.readModel));
}
function clearDefense(b:FinalBossController):void {
  until(b,()=>b.readModel.stage==='active');
  const count=b.readModel.defendersRemaining;
  for(let i=0;i<count;i++)b.droneDestroyed();
  assert.equal(b.readModel.shieldActive,false);
}
function phaseTwo(b:FinalBossController):void {
  for(let i=0;i<3;i++){b.applyImpact(impact(999));clearDefense(b);}
  b.applyImpact(impact(999));b.update(1/60,target);assert.equal(b.readModel.state,'transition');b.skipCinematic(target);
}

test('boss is vulnerable outside its defensive shield, and complete damage gates preserve the legal two-phase ending',()=>{
  const b=new FinalBossController({random:()=>0});assert.equal(b.start(),true);assert.equal(b.start(),false);
  assert.equal(b.applyImpact(impact()).accepted,false);b.skipCinematic(target);
  assert.equal(b.readModel.weakPointOpen,true);b.applyImpact({...impact(3),fullyCharged:false});assert.equal(b.readModel.health,FINAL_BOSS_TUNING.health-3);
  phaseTwo(b);assert.equal(b.readModel.health,FINAL_BOSS_TUNING.phaseTwoHealth);assert.equal(b.readModel.phase,2);
  assert.equal(b.consumeTransition(),true);assert.equal(b.consumeTransition(),false);
  for(const health of FINAL_BOSS_TUNING.reinforcementHealth){b.applyImpact(impact(999));assert.equal(b.readModel.health,health);assert.equal(b.readModel.shieldActive,false);}
  b.applyImpact(impact(999));assert.equal(b.readModel.health,0);assert.equal(b.damagePlayer(100),false);
  b.update(1/60,target);assert.equal(b.readModel.state,'defeated');assert.equal(b.consumeDefeat(),true);assert.equal(b.consumeDefeat(),false);
  b.skipCinematic(target);assert.equal(b.readModel.state,'escape');b.skipCinematic(target);assert.equal(b.readModel.state,'complete');b.dispose();
});

test('85/70/55 crossings synchronously protect against overkill, heal slowly, and fire once even after healing above a threshold',()=>{
  const b=new FinalBossController({random:()=>.5});b.start(true);
  for(const [i,threshold] of FINAL_BOSS_TUNING.defenseThresholds.entries()) {
    b.applyImpact(impact(999));assert.equal(b.readModel.health,[425,350,275][i]);
    assert.equal(b.readModel.shieldActive,true);assert.equal(b.readModel.defenseThreshold,threshold);
    assert.equal(b.readModel.summonCount,[11,13,18][i]);assert.equal(b.applyImpact(impact(999)).accepted,false);
    until(b,()=>b.readModel.stage==='active');const hp=b.readModel.health;b.update(2,target);
    assert.ok(Math.abs(b.readModel.health-hp-5)<.05);assert.equal(b.skipCinematic(target),false);
    b.update(FINAL_BOSS_TUNING.health/FINAL_BOSS_TUNING.healPerSecond,target);assert.equal(b.readModel.health,FINAL_BOSS_TUNING.health);assert.equal(b.readModel.shieldActive,true,'shield must never time out');
    const n=b.readModel.defendersRemaining;
    for(let j=0;j<n-1;j++)b.droneDestroyed();assert.equal(b.readModel.shieldActive,true);
    b.droneDestroyed();assert.equal(b.readModel.shieldActive,false);assert.equal(b.readModel.regenerating,false);
    b.applyImpact(impact((1-threshold)*FINAL_BOSS_TUNING.health+1));
    assert.equal(b.readModel.defenseIndex,i+1,'crossing a healed threshold must not trigger it twice');
  }
  b.suspend();const time=b.time,hp=b.readModel.health;b.update(2,target);assert.equal(b.time,time);assert.equal(b.readModel.health,hp);
  b.reset();b.start(true);b.applyImpact(impact(999));assert.equal(b.readModel.summonCount,11);b.dispose();
});

test('normal move choice is uniform over the initial three, then the two alternatives, with no repeats across defenses',()=>{
  for(const [value,wanted] of [[0,'gun-blast'],[.34,'laser-shots'],[.99,'laser-beam']] as const) {
    const b=new FinalBossController({random:()=>value});b.start(true);assert.equal(b.readModel.attack,wanted);b.dispose();
  }
  let seed=8123;
  const b=new FinalBossController({random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
  b.start(true);const counts:Record<string,number>={};let last=b.readModel.attack;
  for(let i=0;i<9000;i++) {
    const [warn,active,recover]=finalBossAttackTiming(last,1);b.update(warn+active+recover+.000001,target);
    const current=b.readModel.attack;assert.notEqual(current,last);counts[current]=(counts[current]??0)+1;last=current;
  }
  for(const n of Object.values(counts))assert.ok(n>2700&&n<3300,JSON.stringify(counts));
  const normal=b.readModel.attack;b.applyImpact(impact(999));clearDefense(b);
  b.update(1.21,target);assert.notEqual(b.readModel.attack,normal);b.dispose();
});

test('damage grace allows repeated low-damage rounds, but a beam execution cannot re-hit after a drone shot',()=>{
  const b=new FinalBossController({random:()=>0});b.start(true);
  assert.equal(b.damagePlayer(7,-1),true);assert.equal(b.damagePlayer(7,-2),false);b.update(.46,target);assert.equal(b.damagePlayer(7,-2),true);
  b.update(.46,target);assert.equal(b.damagePlayer(40,42),true);b.update(.46,target);assert.equal(b.damagePlayer(8,-3),true);
  b.update(.46,target);assert.equal(b.damagePlayer(40,42),false);assert.equal(b.readModel.playerHealth,38);b.dispose();
});

for(const random of [.01,.49,.99]) {
  test(`all three beam circles alternate direction regardless of subsequent RNG ${random}`,()=>{
    const wanted=[1,-1,1];const values=[.99];let index=0;
    const b=new FinalBossController({random:()=>values[index++]??random});b.start(true);
    assert.equal(b.readModel.attack,'laser-beam');assert.deepEqual(b.readModel.beamDirections,wanted);
    assert.equal(index,1,'turnarounds must not depend on random coin flips');
    b.update(finalBossAttackTiming('laser-beam',1)[0],target);
    let angle=0;
    for(let lap=0;lap<3;lap++) {
      b.update(FINAL_BOSS_TUNING.beamLapSeconds+FINAL_BOSS_TUNING.beamTurnSeconds,target);angle+=wanted[lap]!*Math.PI*2;
      assert.equal(b.readModel.beamLapsCompleted,lap+1);assert.ok(Math.abs(b.readModel.beamRotationRadians-angle)<1e-8);
      assert.equal(b.readModel.stage,lap===2?'recovery':'active');
    }
    assert.ok(Math.abs(finalBossAttackTiming('laser-beam',1)[1]-16.4)<1e-8);
    b.reset();assert.equal(b.readModel.beamLapsCompleted,0);assert.equal(b.readModel.beamRotationRadians,0);assert.deepEqual(b.readModel.beamDirections,wanted);b.dispose();
  });
}

test('pause, skips and resets clear shield/threshold ownership and dispose idempotently',()=>{
  const b=new FinalBossController();b.start();b.update(3,target);b.suspend();const t=b.time;b.update(10,target);assert.equal(b.time,t);
  b.reset();b.start(true);b.applyImpact(impact(999));assert.equal(b.readModel.defenseIndex,1);b.reset();
  assert.equal(b.readModel.defenseIndex,0);assert.equal(b.readModel.shieldActive,false);assert.equal(b.readModel.defendersRemaining,0);
  b.dispose();b.dispose();assert.equal(b.start(),false);
});

function arenaFixture(orbitingPlatforms=false) {
  const arena=new ExterminationArena({orbitingPlatforms}),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(arena.collisionMeshes);surfaces.registerAll(arena.collisionMeshes);
  for(const p of arena.platforms)world.setTransformMode(p.collider,ColliderTransformMode.Dynamic);
  const body=new KinematicBody({world,surfaces,initialPosition:FINAL_MERGE_ANCHOR,config:FINAL_SPECIMEN_MOVEMENT});
  return {arena,world,surfaces,body,dispose:()=>{arena.dispose();world.clear();surfaces.clear();}};
}
test('large form checkpoint fits the real arena and movement is scoped above Bob tuning',()=>{
  const f=arenaFixture();try {
    const hit=new CollisionHit();
    for(const [x,y,z] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]])assert.equal(f.world.sweepSphere(FINAL_MERGE_ANCHOR,new THREE.Vector3(x,y,z).multiplyScalar(.02),FINAL_SPECIMEN_RADIUS,hit),false);
    for(let i=0;i<30;i++)f.body.update(1/60,new THREE.Vector3());
    assert.equal(f.body.grounded,true);assert.ok(Math.abs(f.body.position.y-FINAL_SPECIMEN_RADIUS-.41)<.02);
    assert.equal(FINAL_BOSS_CHECKPOINT.specimenClearanceRadius,FINAL_SPECIMEN_RADIUS);
    assert.ok(FINAL_SPECIMEN_MOVEMENT.maxSpeedMetresPerSecond>DEFAULT_KINEMATIC_BODY_CONFIG.maxSpeedMetresPerSecond*2);
    assert.equal(FINAL_SPECIMEN_MOVEMENT.maxSpeedMetresPerSecond,DEFAULT_KINEMATIC_BODY_CONFIG.maxSpeedMetresPerSecond*3);
    assert.equal(FINAL_SPECIMEN_MOVEMENT.minimumJumpSpeedMetresPerSecond,DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond);
  } finally {f.dispose();}
});

test('the specimen uses normal gravity and retains the charged height required for boss attacks',()=>{
  const f=arenaFixture(),zero=new THREE.Vector3();try {
    for(let i=0;i<22;i++)f.body.update(1/60,zero,{pressed:i===0,held:true,released:false,cancelled:false});
    assert.equal(f.body.chargeFraction,1);assert.equal(f.body.maximumJumpChargeSeconds,.35);assert.equal(DEFAULT_KINEMATIC_BODY_CONFIG.maximumJumpChargeSeconds,.7);
    f.body.update(1/60,zero,{pressed:false,held:false,released:true,cancelled:false});
    let peak=0;
    for(let i=0;i<180;i++){f.body.update(1/60,zero);peak=Math.max(peak,f.body.position.y-FINAL_SPECIMEN_RADIUS-FINAL_ARENA.floorY);}
    assert.ok(peak>10.5&&peak<11.5,`jump apex ${peak}`);
    assert.ok(peak>FINAL_BOSS_TUNING.beamHeight+FINAL_BOSS_TUNING.beamRadius+.4,'full charge clears the beam with margin');
    assert.equal(FINAL_SPECIMEN_MOVEMENT.gravityMetresPerSecondSquared,DEFAULT_KINEMATIC_BODY_CONFIG.gravityMetresPerSecondSquared);
    assert.equal(DEFAULT_KINEMATIC_BODY_CONFIG.maximumJumpSpeedMetresPerSecond,9.84);
  }finally{f.dispose();}
});

test('one continuous wide annulus supports the entire circumference, with no solid floor in the abyss',()=>{
  const f=arenaFixture();try {
    const hit=new CollisionHit();
    assert.equal(f.arena.platforms.length,0);assert.equal(f.arena.root.getObjectByName('orbit-platform-collider-0'),undefined);
    assert.equal(f.arena.ringDecks.length,FINAL_ARENA_RING.segments);
    assert.equal(f.world.sweepSphere(new THREE.Vector3(55,30,FINAL_ARENA.centreZ),new THREE.Vector3(0,-100,0),.5,hit),false,'no disabled lift collider may remain above the abyss');
    assert.equal(f.arena.root.getObjectByName('arena-foundation'),undefined);
    assert.equal(f.arena.root.getObjectByName('tower-tier-1-deck-0-0'),undefined);
    for(let i=0;i<192;i++) {
      const a=i*Math.PI/96,r=70;
      assert.equal(f.world.sweepSphere(new THREE.Vector3(Math.cos(a)*r,3,FINAL_ARENA.centreZ+Math.sin(a)*r),new THREE.Vector3(0,-4,0),.5,hit),true);
      assert.equal(hit.object?.userData.annularDeck,true);
    }
    for(const r of [0,20,42])for(let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      assert.equal(f.world.sweepSphere(new THREE.Vector3(Math.cos(a)*r,1,FINAL_ARENA.centreZ+Math.sin(a)*r),new THREE.Vector3(0,-510,0),FINAL_SPECIMEN_RADIUS,hit),false);
    }
    f.body.recoverAt(new THREE.Vector3(0,FINAL_MERGE_ANCHOR.y,FINAL_ARENA.centreZ-70));
    const direction=new THREE.Vector3();let travel=0,lastAngle=-Math.PI/2;
    for(let i=0;i<2200;i++) {
      const angle=Math.atan2(f.body.position.z-FINAL_ARENA.centreZ,f.body.position.x);
      const radial=Math.hypot(f.body.position.x,f.body.position.z-FINAL_ARENA.centreZ);
      direction.set(-Math.sin(angle)-Math.cos(angle)*(radial-70)*.3,0,Math.cos(angle)-Math.sin(angle)*(radial-70)*.3).normalize();
      f.body.update(1/60,direction);
      travel+=Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle));lastAngle=angle;
      assert.ok(f.body.position.y>2,'annulus has an invisible seam or missing sector');
    }
    assert.ok(travel>Math.PI*2,'the real body must complete a full circuit');
    // Walk off the unguarded edge and keep falling well below ordinary OOB.
    f.body.recoverAt(new THREE.Vector3(0,2.07,FINAL_ARENA.centreZ-65));
    for(let i=0;i<220;i++)f.body.update(1/60,new THREE.Vector3(0,0,1));
    assert.ok(f.body.position.y<-75,'there must be no invisible pit floor');
  }finally{f.dispose();}
});

test('four square lifts orbit at equal spacing, interpolate without moving colliders, and reset without duplication',()=>{
  const f=arenaFixture(true),zero=new THREE.Vector3();try {
    assert.equal(f.arena.platforms.length,4,'the temporarily removed platforms remain fully available as an opt-in');
    const originals=f.arena.platforms.map(p=>p.current.clone());
    const verify=()=>{
      for(let i=0;i<4;i++) {
        const p=f.arena.platforms[i]!,next=f.arena.platforms[(i+1)%4]!;
        assert.ok(Math.abs(Math.hypot(p.current.x,p.current.z-FINAL_ARENA.centreZ)-FINAL_ARENA_ORBIT.radius)<1e-8);
        assert.ok(Math.abs(p.current.distanceTo(next.current)-FINAL_ARENA_ORBIT.radius*Math.SQRT2)<1e-8);
        assert.equal((p.collider.geometry as THREE.BoxGeometry).parameters.width,FINAL_ARENA_ORBIT.size);
      }
    };
    verify();
    const firstAngle=Math.atan2(originals[0]!.z-FINAL_ARENA.centreZ,originals[0]!.x);
    for(let i=0;i<60;i++){f.body.update(1/60,zero);f.arena.advancePlatforms(1/60,f.body);}
    const movedAngle=Math.atan2(f.arena.platforms[0]!.current.z-FINAL_ARENA.centreZ,f.arena.platforms[0]!.current.x)-firstAngle;
    assert.ok(Math.abs(movedAngle-.255)<1e-8,'orbit must be 3x the former .085 rad/s');
    for(let i=0;i<1500;i++){f.body.update(1/60,zero);f.arena.advancePlatforms(1/60,f.body);if(i%60===0)verify();}
    const p=f.arena.platforms[0]!,pose=p.collider.position.clone();f.arena.presentPlatforms(.3);
    assert.deepEqual(p.collider.position,pose);assert.ok(p.visual.position.distanceTo(p.previous)>0);assert.ok(p.visual.position.distanceTo(p.current)>0);
    const count=f.arena.collisionMeshes.length;
    for(let i=0;i<3;i++){f.arena.reset();verify();assert.equal(f.arena.collisionMeshes.length,count);f.arena.platforms.forEach((p,n)=>assert.deepEqual(p.current,originals[n]));}
  }finally{f.dispose();}
});

test('a real charged jump boards a moving lift; its rider is carried through the high part of the cycle',()=>{
  const f=arenaFixture(true),zero=new THREE.Vector3(),direction=new THREE.Vector3();try {
    const platform=f.arena.platforms[0]!;
    // Intercept the faster carrier ahead of its orbit instead of trying to
    // chase a 14 m/s lift from directly behind with 13.2 m/s ground movement.
    const landingAngle=-Math.PI/2+FINAL_ARENA_ORBIT.angularSpeed*(43/60+1.45);
    const landing=new THREE.Vector3(Math.cos(landingAngle)*FINAL_ARENA_ORBIT.radius,0,FINAL_ARENA.centreZ+Math.sin(landingAngle)*FINAL_ARENA_ORBIT.radius);
    f.body.recoverAt(new THREE.Vector3(Math.cos(landingAngle)*65,2.07,FINAL_ARENA.centreZ+Math.sin(landingAngle)*65));
    for(let i=0;i<43;i++){f.body.update(1/60,zero,{pressed:i===0,held:true,released:false,cancelled:false});f.arena.advancePlatforms(1/60,f.body);}
    f.body.update(1/60,zero,{pressed:false,held:false,released:true,cancelled:false});f.arena.advancePlatforms(1/60,f.body);
    let boarded=false;
    for(let i=0;i<180;i++) {
      direction.set(landing.x-f.body.position.x,0,landing.z-f.body.position.z);
      direction.multiplyScalar(1/Math.max(3,direction.length()));f.body.update(1/60,direction);f.arena.advancePlatforms(1/60,f.body);
      if(f.body.isSupportedBy(platform.collider)){boarded=true;break;}
    }
    assert.ok(boarded,JSON.stringify({body:f.body.position,platform:platform.current}));
    for(let i=0;i<12;i++){f.body.update(1/60,zero);f.arena.advancePlatforms(1/60,f.body);}
    const offset=(f.body.position as THREE.Vector3).clone().sub(platform.current);
    for(let i=0;i<900;i++) {
      f.body.update(1/60,zero);f.arena.advancePlatforms(1/60,f.body);
      assert.ok(f.body.isSupportedBy(platform.collider),'rider lost support during orbit');
      assert.ok((f.body.position as THREE.Vector3).clone().sub(platform.current).distanceTo(offset)<.08,'carrier drift');
    }
    assert.ok(f.body.position.y>24,'the lift must carry the specimen to its high position');
  }finally{f.dispose();}
});

test('lab cover stops rays, reset clears hazards, and the entry cannot be vaulted',()=>{
  const f=arenaFixture();try {
    const hit=new CollisionHit(),block=f.arena.cover[0]!;
    const direction=new THREE.Vector3(0,0,1).applyQuaternion(block.quaternion);
    assert.equal(f.world.sweepSphere(block.position.clone().addScaledVector(direction,-6),direction.clone().multiplyScalar(12),.2,hit),true);
    assert.equal(hit.object,block);
    const count=f.arena.collisionMeshes.length;
    f.arena.setDamaged(true);f.arena.setSector(0,'active');f.arena.setDoors(true,true);f.arena.reset();
    assert.equal(f.arena.collisionMeshes.length,count);assert.equal(f.arena.armourFragments.some(m=>m.visible),false);
    assert.ok(f.arena.sectors.every(m=>m.material.uniforms.uActive!.value===0));
    assert.equal(f.arena.exitDoor.position.y,5.4);
    assert.equal(f.world.sweepSphere(new THREE.Vector3(0,11,FINAL_MERGE_ANCHOR.z),new THREE.Vector3(0,0,-40),FINAL_SPECIMEN_RADIUS,hit),true);
    assert.equal(hit.object?.name,'arena-entry-header');
  }finally{f.dispose();}
});

test('reinforced eight-drone squad fires frequent bounded salvos, survives a tap and dies to full charge',()=>{
  const world=new CollisionWorld(),registry=new CombatTargetRegistry(world);
  const squad=new SentinelDroneSquad({collisionWorld:world,targetRegistry:registry,
    anchors:Array.from({length:8},(_,i)=>new THREE.Vector3((i-3.5)*3,14,0)),maximumDrones:8,
    droneHealthUnits:FINAL_BOSS_TUNING.droneHealth,fireIntervalSeconds:FINAL_BOSS_TUNING.phaseOneDroneFireSeconds,
    projectileSpeedMetresPerSecond:FINAL_BOSS_TUNING.droneProjectileSpeed,projectileRangeMetres:160,projectileLifetimeSeconds:6,
    projectileCapacity:FINAL_BOSS_TUNING.hostileProjectileCapacity,fireStaggerSeconds:.09});
  try {
    let fired=0;squad.events.on('projectileFired',()=>fired++);squad.deploy(8);
    const targetBody={position:new THREE.Vector3(0,2,60),previousPosition:new THREE.Vector3(0,2,60),radiusMetres:1.65};
    for(let i=0;i<90;i++)squad.update(1/60,targetBody,()=>true);
    assert.ok(fired>=6,`first staggered salvo: ${fired}`);assert.equal(squad.activeCount,8);
    const firstShot=squad.projectileStates.find(s=>s.active)!;assert.ok(firstShot.position.z>10&&firstShot.position.z<15,'28 m/s minion rounds actually travel');
    const collider=squad.root.children[0]!.children[0] as THREE.Mesh;
    const combatTarget=registry.getRegistrationForMesh(collider)!.target;
    for(let tap=0;tap<3;tap++)assert.equal(combatTarget.applyImpact({...impact(2),fullyCharged:false,chargeAmount:0,targetId:combatTarget.id}).destroyed,tap===2);
    const second=registry.getRegistrationForMesh(squad.root.children[1]!.children[0] as THREE.Mesh)!.target;
    assert.equal(second.applyImpact({...impact(12),targetId:second.id}).destroyed,true);
    const before=fired;squad.setFireIntervalSeconds(FINAL_BOSS_TUNING.phaseTwoDroneFireSeconds);
    for(let i=0;i<120;i++)squad.update(1/60,targetBody,()=>true);
    assert.ok(fired-before>=12);assert.equal(squad.poolCapacity,FINAL_BOSS_TUNING.hostileProjectileCapacity);assert.ok(squad.liveProjectileCount<=FINAL_BOSS_TUNING.hostileProjectileCapacity);
    assert.throws(()=>squad.setFireIntervalSeconds(0));assert.throws(()=>squad.setFireIntervalSeconds(NaN));
    squad.reset();assert.equal(squad.activeCount,0);assert.equal(squad.liveProjectileCount,0);
  } finally {squad.dispose();registry.dispose();world.clear();}
});

const controls=(overrides:Partial<SpecimenAttackControls>={}):SpecimenAttackControls=>({active:true,aimHeld:true,fireHeld:false,firePressed:false,fireReleased:false,gameplayInputEnabled:true,pointerLocked:true,cancelled:false,...overrides});
test('partial charges deal one damage without destroying a group, while full charge clears an occluded-safe cluster',()=>{
  for(const charged of [false,true]) {
    const world=new CollisionWorld(),registry=new CombatTargetRegistry(world),body={position:new THREE.Vector3(0,2,0),radiusMetres:1.65};
    const meshes:THREE.Mesh[]=[],targets:FixtureCombatTarget[]=[];
    for(const [i,x] of [[0,0],[1,2],[2,-2]]) {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8));mesh.position.set(x,2,10);meshes.push(mesh);
      const target=new FixtureCombatTarget({id:`minion-${i}`,hitMeshes:[mesh],healthUnits:3});targets.push(target);registry.register(target,{registerCollision:true});
    }
    const weapon=new SpecimenProjectileSystem({collisionWorld:world,targetRegistry:registry,body,config:FINAL_SPECIMEN_WEAPON,
      aimRayProvider:{copyAimRay:(o,d)=>{o.copy(body.position);d.set(0,0,1);}}});
    try {
      weapon.update(charged?1.5:.6,controls({firePressed:true,fireHeld:true}));weapon.update(1/60,controls({fireReleased:true}));
      for(let i=0;i<40;i++)weapon.update(1/60,controls());
      assert.equal(targets[0]!.destroyed,charged);assert.equal(targets[1]!.destroyed,charged);assert.equal(targets[2]!.destroyed,charged);
      if(!charged)assert.equal(targets[0]!.healthUnits,2);
      assert.equal(weapon.projectileStates.length,32);weapon.reset();assert.equal(weapon.readModel.liveProjectileCount,0);
    } finally {weapon.dispose();registry.dispose();for(const m of meshes){m.geometry.dispose();(m.material as THREE.Material).dispose();}}
  }
});
