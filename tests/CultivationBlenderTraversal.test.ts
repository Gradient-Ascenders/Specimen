import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {CollisionWorld,ColliderTransformMode} from '../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {KinematicBody} from '../src/physics/KinematicBody.ts';
import {createAuthoredDissolveTarget} from '../src/abilities/DissolveTarget.ts';
import {DissolveSystem} from '../src/abilities/DissolveSystem.ts';
import {AcidProjectileSystem} from '../src/abilities/AcidProjectileSystem.ts';
import {GOOP_ACID_SPEED_MULTIPLIER} from '../src/slimes/SlimeRoster.ts';
import {ROOM_FIVE_JUMPS} from '../src/levels/RoomFiveParkour.ts';
import {ROOM_FIVE_SAFE_STATIONS,ROOM_FIVE_ROUTE_NETWORKS} from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';

test('Room 2 final brace accepts centre and near-centre shots from the Goop floor route',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),room=scene.roomTwo;
  const world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  scene.root.updateWorldMatrix(true,true);
  world.registerAll(scene.collisionMeshes,undefined,ColliderTransformMode.Static);
  for(const mesh of scene.dynamicCollisionMeshes)world.setTransformMode(mesh,ColliderTransformMode.Dynamic);
  surfaces.registerAll(scene.collisionMeshes);
  const targets=scene.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces));
  const burns=new DissolveSystem(targets);scene.bindDissolveTargets(targets);
  const drop=room.blockDrops[2]!,target=targets.find(t=>t.id===drop.solubleTargetId)!;
  const body={position:new THREE.Vector3(),radiusMetres:.45},point=new THREE.Vector3();
  const acid=new AcidProjectileSystem({slimeManager:{activeSlimeId:'goop',activeBody:body,canActiveUseAbility:()=>true},
    collisionWorld:world,dissolveSystem:burns,aimRayProvider:{copyAimRay(origin,ray){origin.copy(body.position);ray.copy(point).sub(origin).normalize();}}});
  try{
    for(const z of [18,25])for(const xOffset of [-.4,0,.4]){
      acid.reset();burns.reset();for(const t of targets)t.reset();room.reset();
      body.position.copy(room.root.localToWorld(new THREE.Vector3(3,.66,z)));
      target.mesh.getWorldPosition(point);point.x+=xOffset;
      acid.update(1/60,{gameplayInputEnabled:true,pointerLocked:true,aimHeld:true,firePressed:false});
      assert.equal(acid.aimReadModel.targetedSolubleId,target.id,`brace must be exposed from z=${z}, offset=${xOffset}`);
      for(let i=0;i<300;i++){
        acid.update(1/60,{gameplayInputEnabled:true,pointerLocked:true,aimHeld:true,firePressed:i===0});
        burns.update(1/60);room.update(1/60,[]);
        if(drop.state==='landed')break;
      }
      assert.equal(drop.state,'landed',`one shot must release the platform from z=${z}, offset=${xOffset}`);
      assert.ok(room.blockDrops.slice(0,2).every(d=>d.state==='suspended'));
    }
    room.reset();target.reset();
    assert.equal(drop.state,'suspended');assert.equal(target.completed,false);
  }finally{acid.dispose();burns.dispose();for(const t of targets)t.dispose();scene.dispose();world.clear();surfaces.clear();}
});

test('Goop releases all three nursery cradles and Bob crosses them through the real doorway, with the inactive partner retained',()=>{
  const failures:unknown[]=[],scene=new LevelTwoPreviewScene(f=>failures.push(f),cultivationAssets),room=scene.roomOne;
  const world=new CollisionWorld(),surfaces=new SurfaceRegistry();scene.root.updateWorldMatrix(true,true);
  world.registerAll(scene.collisionMeshes,undefined,ColliderTransformMode.Static);
  for(const mesh of scene.dynamicCollisionMeshes)world.setTransformMode(mesh,ColliderTransformMode.Dynamic);
  surfaces.registerAll(scene.collisionMeshes);
  const bob=new KinematicBody({world,surfaces,initialPosition:room.root.localToWorld(new THREE.Vector3(-11,.66,5.5))});
  const goop=new KinematicBody({world,surfaces,initialPosition:room.root.localToWorld(new THREE.Vector3(-9,.66,5.5)),
    config:{adhesionEnabled:false,reboundEnabled:false,chargedJumpEnabled:false,acidSpeedMultiplier:GOOP_ACID_SPEED_MULTIPLIER}});
  const targets=scene.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces)),burns=new DissolveSystem(targets);
  scene.bindDissolveTargets(targets);
  const point=new THREE.Vector3(),zero=new THREE.Vector3(),direction=new THREE.Vector3();
  const acid=new AcidProjectileSystem({slimeManager:{activeSlimeId:'goop',activeBody:goop,canActiveUseAbility:()=>true},
    collisionWorld:world,dissolveSystem:burns,aimRayProvider:{copyAimRay(origin,ray){origin.copy(goop.position);ray.copy(point).sub(origin).normalize();}}});
  const local=(body:KinematicBody)=>room.root.worldToLocal(new THREE.Vector3().copy(body.position));
  const step=(body:KinematicBody,movement=zero,jump={pressed:false,held:false,released:false})=>{
    bob.update(1/60,body===bob?movement:zero,body===bob?jump:undefined);goop.update(1/60,body===goop?movement:zero,body===goop?jump:undefined);
    burns.update(1/60);room.update(1/60);
    const occupants=[{id:'bob' as const,position:bob.position,radiusMetres:bob.radiusMetres},
      {id:'goop' as const,position:goop.position,radiusMetres:goop.radiusMetres}];
    room.radiationHazard.update(occupants);scene.roomOneToTwoPassage.update(1/60,occupants);
  };
  const walk=(body:KinematicBody,x:number,z:number)=>{
    let arrived=false;
    for(let i=0;i<1800;i++){
      const p=local(body);direction.set(x-p.x,0,z-p.z);
      const distance=direction.length(),speed=Math.hypot(body.velocity.x,body.velocity.z);
      if(distance<.12&&speed<.3){arrived=true;break;}
      const towards=direction.x*body.velocity.x+direction.z*body.velocity.z;
      step(body,towards>0&&distance<speed*speed/72+.07?zero:direction.normalize());
    }
    assert.ok(arrived,`walk ${x},${z}: ${local(body).toArray()}`);
    for(let i=0;i<20;i++)step(body);
  };
  const jump=(x:number,z:number,support:string)=>{
    const p=local(bob),heading=new THREE.Vector3(x-p.x,0,z-p.z).normalize();
    for(let i=0;i<50;i++)step(bob,i>=38?heading:zero,{pressed:i===5,held:i>=5,released:false});
    let landed=false;
    for(let i=0;i<150;i++){
      const p=local(bob);direction.set(x-p.x,0,z-p.z);
      if(direction.length()>.15)direction.normalize();else direction.set(0,0,0);
      step(bob,direction,{pressed:false,held:false,released:i===0});
      if(bob.grounded&&bob.supportColliderName===support){landed=true;break;}
    }
    assert.ok(landed,`${support}: ${local(bob).toArray()}, ${bob.supportColliderName}`);
    walk(bob,x,z);
  };
  try{
    for(const drop of room.platformDrops){
      const target=targets.find(target=>target.id===drop.solubleTargetId)!;
      target.mesh.geometry.computeBoundingBox();
      const bounds=target.mesh.geometry.boundingBox!;
      point.set((bounds.min.x+bounds.max.x)/2,bounds.max.y-.12,(bounds.min.z+bounds.max.z)/2);
      target.mesh.localToWorld(point); // Aim above the suspended cradle's silhouette.
      for(let i=0;i<480;i++){
        acid.update(1/60,{gameplayInputEnabled:true,pointerLocked:true,aimHeld:true,firePressed:i===0});step(goop);
        if(drop.state==='landed')break;
      }
      assert.equal(drop.state,'landed',drop.id);
    }
    walk(goop,8,5.5);walk(goop,8,42.2);
    for(let i=0;i<90;i++){
      step(goop,direction.set(0,0,1),{pressed:i===0,held:false,released:i===1});
      if(goop.grounded&&goop.supportColliderName==='cultivation-room-1-far-floor')break;
    }
    assert.equal(goop.supportColliderName,'cultivation-room-1-far-floor');
    walk(goop,8,46);walk(goop,0,46);walk(goop,0,54);walk(goop,0,81);
    walk(bob,-3,8.5);jump(-3,15.5,room.platformDrops[0].mesh.name);
    walk(bob,-1.9,17.6);jump(2,25,room.platformDrops[1].mesh.name);
    walk(bob,1.37,27.1);jump(-1,35,room.platformDrops[2].mesh.name);
    walk(bob,-1,37.1);jump(0,44.5,'cultivation-room-1-far-floor');walk(bob,0,54);walk(bob,0,81);
    assert.ok(local(bob).z>78&&local(goop).z>78,'both bodies pass the full decontamination corridor into Room 2');
    assert.deepEqual(failures,[]);assert.equal(acid.getDiagnostics().solubleImpactCount,3);
    scene.reset();assert.ok(room.platformDrops.every(drop=>drop.state==='suspended'));
  }finally{acid.dispose();burns.dispose();for(const target of targets)target.dispose();scene.dispose();world.clear();surfaces.clear();}
});

// This is a continuous physical route through the assembled production scene.
// Combat/detection clocks have their independent encounter tests; this fixture
// checks that installed presentation children do not change locomotion, real
// projectile contacts, release ownership, the inactive partner or scene reset.
test('the integrated Room 5 split, parkour, controls and rescue work without teleporting between route beats',()=>{
  const failures:unknown[]=[],scene=new LevelTwoPreviewScene(f=>failures.push(f),cultivationAssets);
  const room=scene.roomFive,world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  scene.root.updateWorldMatrix(true,true);
  world.registerAll(scene.collisionMeshes,undefined,ColliderTransformMode.Static);
  for(const mesh of scene.dynamicCollisionMeshes)world.setTransformMode(mesh,ColliderTransformMode.Dynamic);
  surfaces.registerAll(scene.collisionMeshes);
  const bob=new KinematicBody({world,surfaces,initialPosition:room.root.localToWorld(new THREE.Vector3(-.3,.66,4))});
  const goop=new KinematicBody({world,surfaces,initialPosition:room.root.localToWorld(new THREE.Vector3(.3,.66,4)),
    config:{adhesionEnabled:false,reboundEnabled:false,chargedJumpEnabled:false,acidSpeedMultiplier:GOOP_ACID_SPEED_MULTIPLIER}});
  const targets=scene.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces));
  const burns=new DissolveSystem(targets);scene.bindDissolveTargets(targets);room.bindBurns(burns);
  const point=new THREE.Vector3(),zero=new THREE.Vector3(),direction=new THREE.Vector3();
  const acid=new AcidProjectileSystem({slimeManager:{activeSlimeId:'goop',activeBody:goop,canActiveUseAbility:()=>true},
    collisionWorld:world,dissolveSystem:burns,aimRayProvider:{copyAimRay(origin,ray){origin.copy(goop.position);ray.copy(point).sub(origin).normalize();}}});
  const local=(body:KinematicBody)=>room.root.worldToLocal(new THREE.Vector3().copy(body.position));
  const step=(body:KinematicBody,movement:THREE.Vector3=zero,jump={pressed:false,held:false,released:false})=>{
    bob.update(1/60,body===bob?movement:zero,body===bob?jump:undefined);
    goop.update(1/60,body===goop?movement:zero);
    burns.update(1/60);
    room.update(1/60,[{id:'bob',position:bob.position,radiusMetres:bob.radiusMetres,attached:bob.attached,supportCollider:bob.supportCollider},
      {id:'goop',position:goop.position,radiusMetres:goop.radiusMetres,attached:goop.attached,supportCollider:goop.supportCollider}]);
  };
  const walk=(body:KinematicBody,x:number,z:number,limit=1800)=>{
    let arrived=false;
    for(let i=0;i<limit;i++){
      const p=local(body);direction.set(x-p.x,0,z-p.z);
      const distance=direction.length(),speed=Math.hypot(body.velocity.x,body.velocity.z);
      if(distance<.12&&speed<.3){arrived=true;break;}
      const towards=direction.x*body.velocity.x+direction.z*body.velocity.z;
      step(body,towards>0&&distance<speed*speed/72+.07?zero:direction.normalize());
    }
    assert.ok(arrived,`walk ${x},${z}: ${local(body).toArray()}, ${body.supportColliderName}`);
    for(let i=0;i<20;i++)step(body);
  };
  const shoot=(mesh:THREE.Mesh)=>{
    for(let i=0;i<90;i++){
      mesh.getWorldPosition(point);
      acid.update(1/60,{gameplayInputEnabled:true,pointerLocked:true,aimHeld:true,firePressed:i===0});
      step(goop);
    }
  };
  const jumpTo=(x:number,z:number,support:string)=>{
    // Covered stations require an approach around the mitred baffle's end.
    // Search input trajectories on disposable physics bodies; the real pair
    // still walks and jumps every beat continuously, without pose writes.
    let plan:{from:THREE.Vector3;aim:THREE.Vector3;heading:THREE.Vector3;turn:number}|undefined;
    if(support.startsWith('room-5-safe-')){
      const start=local(bob),oldSupport=bob.supportColliderName;
      search:for(const offset of [[0,0],[-.6,0],[.6,0],[0,-.6],[0,.6],[-.6,-.6],[-.6,.6],[.6,-.6],[.6,.6]]){
        const from=start.clone().add(new THREE.Vector3(offset[0],0,offset[1]));
        for(const aimOffset of [[0,0],[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]]){
          const aim=new THREE.Vector3(x+aimOffset[0],0,z+aimOffset[1]);
          for(const angle of [0,-Math.PI/3,Math.PI/3,-Math.PI/2,Math.PI/2,-Math.PI/6,Math.PI/6])for(const turn of [0,14,22,30,38]){
            const heading=aim.clone().sub(from).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),angle);
            const probe=new KinematicBody({world,surfaces,initialPosition:room.root.localToWorld(from.clone())});
            for(let i=0;i<5;i++)probe.update(1/60,zero);
            if(!probe.grounded||probe.supportColliderName!==oldSupport)continue;
            for(let i=0;i<50;i++)probe.update(1/60,i>=44?heading:zero,{pressed:i===5,held:i>=5,released:false});
            for(let i=0;i<120;i++){
              const p=local(probe),move=i<turn?heading:aim.clone().sub(p).setY(0);
              if(move.length()>.15)move.normalize();else move.set(0,0,0);
              probe.update(1/60,move,{pressed:false,held:false,released:i===0});
              if(probe.grounded&&probe.supportColliderName.startsWith(support)){
                plan={from,aim,heading,turn};break search;
              }
              if(p.y<start.y-1)break;
            }
          }
        }
      }
      assert.ok(plan,`no cover approach found for ${support}`);
      walk(bob,plan.from.x,plan.from.z,240);
    }
    for(let i=0;i<50;i++)step(bob,plan&&i>=44?plan.heading:zero,{pressed:i===5,held:i>=5,released:false});
    let landed=false;
    for(let i=0;i<150;i++){
      const p=local(bob);
      if(plan&&i<plan.turn)direction.copy(plan.heading);
      else direction.set((plan?.aim.x??x)-p.x,0,(plan?.aim.z??z)-p.z);
      if(direction.length()>.15)direction.normalize();else direction.set(0,0,0);
      step(bob,direction,{pressed:false,held:false,released:i===0});
      if(bob.grounded&&bob.supportColliderName.startsWith(support)){landed=true;break;}
    }
    assert.ok(landed,`${support}: ${local(bob).toArray()}, ${bob.supportColliderName}`);
    walk(bob,x,z,240);
  };
  try{
    walk(bob,0,9.1);walk(bob,-12,9.1);walk(bob,-12,16);
    for(let i=0;i<60;i++)step(bob,direction.set(0,0,1));
    assert.equal(bob.attached,true);
    for(let i=0;i<240;i++){
      step(bob,bob.attached?direction.set(0,1,0):direction.set(0,0,1));
      if(bob.grounded&&local(bob).z>22)break;
    }
    assert.ok(local(bob).y>10&&local(bob).z>22,'Bob reaches the first covered station by the actual shaft');
    walk(bob,-12,23);
    walk(goop,0,9.1);walk(goop,40,9.1);walk(goop,40,20);
    for(let i=0;i<180;i++)step(goop);
    assert.ok(local(goop).y<-11,'the real missing floor reaches the sewer');
    walk(goop,39.2,20);walk(goop,39.2,65);
    for(let i=0;i<3;i++)shoot(room.brokenCore);
    assert.equal(room.controller.brokenDroneState,'destroyed');
    walk(goop,39.2,124);walk(goop,44,124);
    assert.equal(room.controller.checkpoint,'controls');
    for(let section=0;section<6;section++){
      const network=ROOM_FIVE_ROUTE_NETWORKS[section],index=['red','blue','green'].indexOf(network);
      walk(goop,44,118+index*4);shoot(room.controls.get(network)!);
      assert.equal(room.controller.security.disabledNetwork,network);
      const station=ROOM_FIVE_SAFE_STATIONS[section],jumps=ROOM_FIVE_JUMPS[section],to=jumps[0];
      const from=new THREE.Vector3(...station);
      const along=new THREE.Vector3(to[0]-from.x,0,to[2]-from.z).normalize();
      let runup=1.9/Math.max(Math.abs(along.x),Math.abs(along.z));
      for(const collider of room.collisionMeshes){
        if(!collider.name.startsWith(`room-5-safe-${section}-network-`)||!collider.name.endsWith('-collision'))continue;
        const normal=new THREE.Vector3(0,0,1).applyQuaternion(collider.getWorldQuaternion(new THREE.Quaternion()));
        const centre=room.root.worldToLocal(collider.getWorldPosition(new THREE.Vector3()));
        const approach=normal.dot(along);
        if(approach>0)runup=Math.min(runup,(normal.dot(centre.sub(from))-.125-.5)/approach);
      }
      from.addScaledVector(along,runup*.96);
      walk(bob,from.x,from.z);
      for(const [i,jump]of jumps.entries())jumpTo(jump[0],jump[2],`room-5-route-${section}-jump-${i+1}`);
      const next=ROOM_FIVE_SAFE_STATIONS[section+1];jumpTo(next[0],next[2],`room-5-safe-${section+1}-floor`);
    }
    const parkedGoop=goop.position.clone();
    walk(bob,0,34);walk(bob,0,30);walk(bob,0,27.7);
    for(let i=0;i<360;i++)step(bob);
    assert.equal(room.controller.rescued,true,'the real held-button volume releases Volt');
    // Rescue hands off to the upper-vent cinematic. The old service return
    // is sealed; the inactive companion remains at the sewer controls.
    assert.ok(goop.position.distanceTo(parkedGoop)<.01,'rescue preserves the independently parked companion');
    assert.deepEqual(failures,[],'the inactive partner remains on its protected safe surface');
    assert.ok(acid.getDiagnostics().solubleImpactCount>=9,'all three core hits and six network changes used real shots');
    scene.reset();
    assert.equal(room.controller.checkpoint,'split');assert.equal(room.controller.security.shutdown,false);
    assert.equal(scene.roomFour.controller.readModel.state,'waitingForSlimes');
    assert.ok(scene.roomOne.platformDrops.every(drop=>drop.state==='suspended'));
    assert.ok(scene.roomTwo.blockDrops.every(drop=>drop.state==='suspended'));
    assert.ok(scene.roomThree.wallDrops.every(drop=>drop.state==='suspended'));
    assert.equal(scene.voltFinaleSet.annex.visible,false);
  }finally{acid.dispose();burns.dispose();for(const target of targets)target.dispose();scene.dispose();world.clear();surfaces.clear();}
});
