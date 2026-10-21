import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FinalBossController } from '../src/boss/FinalBossController.ts';
import { ExterminationArena } from '../src/boss/ExterminationArena.ts';
import { FINAL_BOSS_CHECKPOINT, FINAL_MERGE_ANCHOR, FINAL_SPECIMEN_MOVEMENT, FINAL_SPECIMEN_RADIUS, FINAL_SPECIMEN_WEAPON } from '../src/boss/FinalBossConfig.ts';
import { CollisionWorld, CollisionHit } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody, DEFAULT_KINEMATIC_BODY_CONFIG } from '../src/physics/KinematicBody.ts';
import type { CombatImpact } from '../src/combat/CombatTargetRegistry.ts';
import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import { SpecimenProjectileSystem, type SpecimenAttackControls } from '../src/combat/SpecimenProjectileSystem.ts';
import { FixtureCombatTarget } from '../src/combat/CombatTargetAdapters.ts';

const target=new THREE.Vector3(0,2.07,197);
const impact=(damageUnits=12):CombatImpact=>({projectileId:1,targetId:'extermination-core',kind:'direct',chargeAmount:1,fullyCharged:true,damageUnits,point:target,direction:target});
function until(boss:FinalBossController,predicate:()=>boolean,steps=4000):void {
  for(let i=0;i<steps&&!predicate();i++)boss.update(1/60,target);
  assert.ok(predicate(),JSON.stringify(boss.readModel));
}
function expose(boss:FinalBossController):void {until(boss,()=>boss.readModel.weakPointOpen);}
function phaseTwo(boss:FinalBossController):void {
  expose(boss);boss.applyImpact(impact(999));boss.update(1/60,target);
  assert.equal(boss.readModel.state,'transition');boss.skipCinematic(target);
}

test('final encounter is exactly two phases with gated damage, a half-health boundary and one defeat',()=>{
  const b=new FinalBossController();assert.equal(b.start(),true);assert.equal(b.start(),false);
  assert.equal(b.applyImpact(impact()).accepted,false);b.skipCinematic(target);
  assert.equal(b.readModel.phase,1);assert.equal(b.applyImpact(impact()).accepted,false);
  expose(b);assert.equal(b.applyImpact(impact(999)).accepted,true);assert.equal(b.readModel.health,90);
  assert.equal(b.applyImpact(impact()).accepted,false);assert.equal(b.damagePlayer(100),false);
  b.update(1/60,target);assert.equal(b.readModel.state,'transition');assert.equal(b.applyImpact(impact()).accepted,false);
  b.skipCinematic(target);assert.equal(b.readModel.phase,2);assert.equal(b.consumeTransition(),true);assert.equal(b.consumeTransition(),false);
  expose(b);b.applyImpact(impact(999));assert.equal(b.readModel.health,0);
  assert.equal(b.applyImpact(impact()).accepted,false);assert.equal(b.damagePlayer(100),false);
  b.update(1/60,target);assert.equal(b.readModel.state,'defeated');assert.equal(b.consumeDefeat(),true);assert.equal(b.consumeDefeat(),false);
  b.skipCinematic(target);assert.equal(b.readModel.state,'escape');b.skipCinematic(target);assert.equal(b.readModel.state,'complete');
  assert.equal(b.skipCinematic(target),false);assert.equal(b.readModel.phase,2);b.dispose();
});

test('the warning locks its target and neither execution nor recovery retargets it',()=>{
  const b=new FinalBossController();b.start();b.skipCinematic(target);
  const locked=b.readModel.lockedTarget.clone();b.update(.5,target);
  const changed=new THREE.Vector3(18,7,229);b.update(2,changed);
  assert.equal(b.readModel.stage,'active');assert.deepEqual(b.readModel.lockedTarget,locked);
  b.update(3,changed);assert.deepEqual(b.readModel.lockedTarget,locked);b.dispose();
});

test('both attack scripts telegraph before damage and expose the core for 5.5 seconds',()=>{
  const b=new FinalBossController();b.start(true);
  const first=new Set<string>();
  for(let n=0;n<4;n++) {first.add(b.readModel.attack);expose(b);assert.equal(b.readModel.vulnerabilityRemaining,5.5);b.update(5.5,target);assert.equal(b.readModel.stage,'telegraph');}
  assert.deepEqual([...first].sort(),['strike','summon','sweep']);phaseTwo(b);
  const second=new Set<string>();
  for(let n=0;n<6;n++) {second.add(b.readModel.attack);expose(b);b.update(5.5,target);assert.equal(b.readModel.stage,'telegraph');}
  assert.deepEqual([...second].sort(),['devastation','sectors','shockwave','strike','summon','sweep']);b.dispose();
});

test('floor patterns always leave three alternating broad safe sectors',()=>{
  const b=new FinalBossController();b.start(true);phaseTwo(b);
  for(let n=0;n<12;n++) {
    const selected=b.readModel.selectedSectors;
    assert.equal(new Set(selected).size,3);assert.ok(selected.every(i=>i>=0&&i<6));
    assert.ok([0,1,2,3,4,5].filter(i=>!selected.includes(i)).every(i=>!selected.includes((i+2)%6)));
    expose(b);b.update(5.5,target);
  }
  b.dispose();
});

test('player survives three major hits, invulnerability and per-execution gates prevent rapid drain',()=>{
  const b=new FinalBossController();b.start();assert.equal(b.damagePlayer(28),false);b.skipCinematic(target);
  for(let i=0;i<4;i++) {
    assert.equal(b.damagePlayer(28,i),true);assert.equal(b.damagePlayer(28,i),false);assert.equal(b.damagePlayer(28,100+i),false);
    b.update(1.2,target);assert.equal(b.damagePlayer(28,i),false);
    assert.equal(b.readModel.playerHealth,Math.max(0,100-28*(i+1)));
  }
  b.dispose();
});

test('phase-two group destruction can stagger once, never recursively or indefinitely',()=>{
  const b=new FinalBossController();b.start(true);phaseTwo(b);
  b.droneDestroyed();b.droneDestroyed();b.droneDestroyed();
  assert.equal(b.readModel.staggered,true);assert.equal(b.readModel.vulnerabilityRemaining,5);
  b.update(2,target);for(let i=0;i<100;i++)b.droneDestroyed();assert.equal(b.readModel.vulnerabilityRemaining,3);
  b.suspend();assert.equal(b.readModel.weakPointOpen,false);b.reset();assert.equal(b.readModel.health,180);assert.equal(b.readModel.playerHealth,100);assert.equal(b.readModel.state,'idle');b.dispose();
});

test('cinematic skips settle every phase, suspension freezes time, reset is idempotent',()=>{
  const b=new FinalBossController();b.start();b.update(3,target);const t=b.time;
  b.suspend();b.update(10,target);assert.equal(b.time,t);
  for(let i=0;i<3;i++) {b.reset();assert.equal(b.start(),true);b.skipCinematic(target);phaseTwo(b);expose(b);b.applyImpact(impact(999));b.update(.02,target);b.skipCinematic(target);b.skipCinematic(target);assert.equal(b.readModel.state,'complete');}
  b.dispose();b.dispose();assert.equal(b.start(),false);
});

function arenaFixture() {
  const arena=new ExterminationArena(),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(arena.collisionMeshes);surfaces.registerAll(arena.collisionMeshes);
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
    assert.ok(FINAL_SPECIMEN_MOVEMENT.maximumJumpSpeedMetresPerSecond>DEFAULT_KINEMATIC_BODY_CONFIG.maximumJumpSpeedMetresPerSecond*1.7);
  } finally {f.dispose();}
});

test('both perimeter ramps can be ascended with actual large-form sphere collision',()=>{
  for(const side of [-1,1]) {
    const f=arenaFixture();try {
      f.body.recoverAt(new THREE.Vector3(side*5,2.07,216));
      for(let i=0;i<150&&Math.abs(f.body.position.x)<21;i++)f.body.update(1/60,new THREE.Vector3(side,0,0));
      assert.ok(Math.abs(f.body.position.x)>19,`${side}: ${JSON.stringify(f.body.position)}`);
      assert.ok(f.body.position.y-FINAL_SPECIMEN_RADIUS>3,`${side}: ${JSON.stringify(f.body.position)}`);
    }finally{f.dispose();}
  }
});

test('arena covers really stop rays, reset keeps essential routes and clears every sector',()=>{
  const f=arenaFixture();try {
    const hit=new CollisionHit();assert.equal(f.world.sweepSphere(new THREE.Vector3(-11,3,205),new THREE.Vector3(0,0,15),.2,hit),true);
    assert.equal(hit.object?.name,'arena-cover-0');
    const count=f.arena.collisionMeshes.length;
    f.arena.setDamaged(true);f.arena.setSector(0,'active');f.arena.setDoors(true,true);f.arena.reset();
    assert.equal(f.arena.collisionMeshes.length,count);assert.equal(f.arena.armourFragments.some(m=>m.visible),false);
    assert.ok(f.arena.sectors.every(m=>m.material.uniforms.uActive!.value===0));
    assert.equal(f.arena.exitDoor.position.y,5.4);
  } finally {f.dispose();}
});

const controls=(overrides:Partial<SpecimenAttackControls>={}):SpecimenAttackControls=>({active:true,aimHeld:true,fireHeld:false,firePressed:false,fireReleased:false,gameplayInputEnabled:true,pointerLocked:true,cancelled:false,...overrides});
test('production taps one-shot drones and full charge, not partial charge, destroys an occluded-safe cluster',()=>{
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
      assert.equal(targets[0]!.destroyed,true);assert.equal(targets[1]!.destroyed,charged);assert.equal(targets[2]!.destroyed,charged);
      assert.ok(weapon.projectileStates.length<=12);weapon.reset();assert.equal(weapon.readModel.liveProjectileCount,0);
    } finally {weapon.dispose();registry.dispose();for(const m of meshes){m.geometry.dispose();(m.material as THREE.Material).dispose();}}
  }
});
