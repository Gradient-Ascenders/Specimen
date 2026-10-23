import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from '../src/levels/CultivationRoomThreeAuthoring.ts';
import { RoomThreeDroneEncounter } from '../src/hazards/RoomThreeDroneEncounter.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { AcidProjectileSystem } from '../src/abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { BobCharacterPresentation } from '../src/render/bob/BobCharacterPresentation.ts';
import { CultivationRoomThreeClearance, ROOM_THREE_CLEARANCE_PLATFORMS } from '../src/cinematics/CultivationRoomThreeClearance.ts';
import { CULTIVATION_ROOM_THREE_MONITOR_SCRIPT as SCRIPT, CULTIVATION_ROOM_THREE_MONITOR_COLOURS as COLOURS,
  CULTIVATION_ROOM_THREE_MONITOR_TRIGGER as TRIGGER } from '../src/render/environment/cultivation/CultivationRoomThreeObservation.ts';
import { paginateMonitorSections } from '../src/render/environment/containment/ContainmentMonitorDialogue.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';
import { CultivationLevelRuntime } from '../src/levels/CultivationLevelRuntime.ts';

const ZERO=new THREE.Vector3();
function fixture(){
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);surfaces.registerAll(scene.collisionMeshes);
  const targets=scene.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces));
  const bob=new KinematicBody({world,surfaces,initialPosition:scene.copyRoomSpawnPosition(3,'bob',new THREE.Vector3())});
  const goop=new KinematicBody({world,surfaces,initialPosition:scene.copyRoomSpawnPosition(3,'goop',new THREE.Vector3())});
  const encounter=new RoomThreeDroneEncounter({config:CULTIVATION_ROOM_THREE_DRONE_AUTHORING,
    supportsById:new Map(targets.map(t=>[t.id,t])),collisionWorld:world,surfaceRegistry:surfaces,bobBody:bob,goopBody:goop,
    radiationSurface:scene.roomThree.radiationHazard,requestDeath(){throw Error('Cinematic must not damage the slimes.');}});
  scene.roomThree.root.add(encounter.root);
  const presentation=new BobCharacterPresentation(.45),camera=new THREE.PerspectiveCamera(50,16/9,.08,150);
  camera.position.set(70,27,210);camera.lookAt(70,25,214);
  const movie=new CultivationRoomThreeClearance({room:scene.roomThree,encounter,bob,presentation,acid:scene.labArt.acid});
  const place=(name:string,at?:{x:number;z:number})=>{
    const collider=[...scene.collisionMeshes,...encounter.groundDrones.map(d=>d.drone.collider)].find(m=>m.name===name)!;assert.ok(collider,name);
    collider.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(collider),centre=bounds.getCenter(new THREE.Vector3());
    if(at){const point=scene.roomThree.root.localToWorld(new THREE.Vector3(at.x,0,at.z));centre.x=point.x;centre.z=point.z;}
    centre.y=bounds.max.y+bob.radiusMetres+.02;bob.teleport(centre);
    for(let i=0;i<12;i++)bob.update(1/60,ZERO);
    assert.equal(bob.grounded,true);assert.equal(bob.supportCollider?.name,name);
  };
  return {scene,world,surfaces,targets,bob,goop,encounter,presentation,camera,movie,place,
    dispose(){movie.dispose();encounter.dispose();presentation.dispose();targets.forEach(t=>t.dispose());world.clear();surfaces.clear();scene.dispose();}};
}

test('developer sentry preview starts the full movie and sounds each shove, topple and real acid contact once',()=>{
  const f=fixture();
  const runtime=Object.create(CultivationLevelRuntime.prototype) as CultivationLevelRuntime;
  const internal=runtime as any;
  const cues:string[]=[],loops:string[]=[],stops:string[]=[];
  const off=[
    gameplayAudioEvents.on('cue',event=>{
      if(event.sound.startsWith('cultivation-sentry-')){
        cues.push(event.sound);
        if(event.sound==='cultivation-sentry-acid-splash-01')
          assert.ok(f.encounter.readModel.groundDisabledCount>0,'A splash follows a real disable, not a guessed timer.');
      }
    }),
    gameplayAudioEvents.on('loop',event=>{if(event.key.startsWith('cultivation-sentry-')){loops.push(event.key);assert.equal(event.sound,'goop-dissolve-loop-01');}}),
    gameplayAudioEvents.on('stop',event=>{if(event.key.startsWith('cultivation-sentry-'))stops.push(event.key);}),
  ];
  let activated='';
  Object.assign(internal,{
    debugAvailable:true,sentryPreviewAvailable:false,lifecycle:{state:'stopped'},
    host:{dataset:{}},input:{resetState(){},releasePointerLock(){}},
    renderLayer:{cameraRig:{camera:f.camera,update(){}}},
    teleportToAuthoredPreviewRoom(room:number){assert.equal(room,3);return true;},
    resetRecoveryCamera(){},retargetCamera(){},
    resources:{authoredPreview:f.scene,roomThreeClearance:f.movie,pair:{bobBody:f.bob},
      manager:{activate(id:string){activated=id;}},movement:new THREE.Vector3(),
      bobPresentation:f.presentation,acidProjectileSystem:{reset(){}}},
  });
  try{
    assert.equal(runtime.previewSentryClearanceForDebug(),false,'Production debug UI cannot enable the preview.');
    internal.sentryPreviewAvailable=true;
    assert.equal(runtime.previewSentryClearanceForDebug(),true);
    assert.equal(activated,'bob');assert.equal(internal.host.dataset.cinematic,'cultivation-clearance');
    assert.deepEqual(f.movie.descent.steps.map(step=>step.landingName),['floor','rebound']);
    while(f.movie.active){
      f.movie.update(1/60);
      const count=cues.length;f.movie.present(f.camera,.5);assert.equal(cues.length,count,'Rendering never repeats audio.');
    }
    for(const sound of ['cultivation-sentry-shove-01','cultivation-sentry-topple-01','cultivation-sentry-acid-splash-01'])
      assert.equal(cues.filter(cue=>cue===sound).length,4,sound);
    assert.equal(loops.length,4);assert.equal(new Set(loops).size,4);
    assert.ok(loops.every(key=>stops.includes(key)),'Completion stops every corrosion loop.');
    stops.length=0;f.movie.reset();
    assert.ok(loops.every(key=>stops.includes(key)),'Reset also releases every corrosion loop.');
    assert.equal(f.encounter.readModel.groundDisabledCount,4);
  }finally{off.forEach(unsubscribe=>unsubscribe());f.dispose();}
});

test('all Room 3 sentries flash bounded protective shields at real acid impacts and keep their resistant gameplay bodies',()=>{
  const f=fixture(),shields=f.encounter.shields,colliders=f.world.colliderCount;
  try{
    const geometries=[shields.shells.geometry,shields.lattice.geometry,shields.rings.geometry];
    assert.equal(shields.shells.count,0);assert.equal(shields.lattice.count,0);assert.equal(shields.rings.count,0);
    assert.equal(shields.impact('unrelated-room-drone',ZERO),false);
    for(const lifecycle of [...f.encounter.ceilingDrones,...f.encounter.groundDrones]){
      const point=lifecycle.drone.root.getWorldPosition(new THREE.Vector3());
      assert.equal(shields.impact(lifecycle.drone.collider.name,point),true);
      assert.equal(lifecycle.drone.collider.userData.soluble,false);
    }
    assert.equal(shields.activeCount,7);assert.equal(shields.shells.count,7);assert.equal(f.world.colliderCount,colliders);
    shields.root.traverse(node=>assert.ok(!(node instanceof THREE.Light)));
    shields.update(.8);assert.equal(shields.shells.count,0);assert.equal(shields.activeCount,0);
    assert.deepEqual([shields.shells.geometry,shields.lattice.geometry,shields.rings.geometry],geometries);
    // Exercise the swept-projectile path, not just a manually activated effect.
    const target=f.encounter.groundDrones[3].drone;
    const point=target.root.getWorldPosition(new THREE.Vector3());f.goop.teleport(point.clone().add(new THREE.Vector3(0,0,-5)));
    const dissolve=new DissolveSystem(f.targets),acid=new AcidProjectileSystem({slimeManager:{activeSlimeId:'goop',activeBody:f.goop,canActiveUseAbility:()=>true},
      collisionWorld:f.world,dissolveSystem:dissolve,aimRayProvider:{copyAimRay(o,d){o.copy(f.goop.position);d.set(0,0,1);}}});
    const hits:string[]=[];const off=acid.events.on('worldImpact',hit=>{hits.push(hit.objectName);shields.impact(hit.objectName,hit.point);});
    try{
      for(let i=0;i<100&&hits.length===0;i++)acid.update(.01,{aimHeld:true,firePressed:i===0,gameplayInputEnabled:true,pointerLocked:true});
      assert.deepEqual(hits,[target.collider.name]);assert.equal(shields.activeCount,1);assert.equal(dissolve.activeBurnCount,0);
      assert.equal(f.encounter.readModel.groundDisabledCount,0);
    }finally{off();acid.dispose();dissolve.dispose();}
    f.encounter.reset();assert.equal(shields.activeCount,0);assert.equal(shields.shells.count,0);
  }finally{f.dispose();}
});

for(const platform of ROOM_THREE_CLEARANCE_PLATFORMS)test(`Room 3 clearance starts only on landing at ${platform}, sinks all four and returns Bob safely`,()=>{
  const f=fixture();
  try{
    f.place('cultivation-room-3-bob-cross-room-b');assert.equal(f.movie.tryBegin(f.camera),false,'Earlier platforms never start it.');
    f.place('cultivation-room-3-bob-final-wall-exit');assert.equal(f.movie.tryBegin(f.camera),false,'The third-last platform no longer starts it.');
    f.place(platform);const trigger=f.bob.position;
    f.bob.syncKinematicPose(trigger);assert.equal(f.movie.tryBegin(f.camera),false,'Airborne proximity is not a landing.');
    f.place(platform);f.presentation.setYaw(0); // Begin looking back toward the camera, opposite the leap.
    assert.equal(f.movie.tryBegin(f.camera),true);assert.equal(f.movie.tryBegin(f.camera),false);
    assert.deepEqual(ROOM_THREE_CLEARANCE_PLATFORMS,['cultivation-room-3-bob-last-island','cultivation-room-3-bob-drop-launch']);
    assert.deepEqual(f.movie.descent.steps.map(step=>step.landingName),['floor','rebound']);
    f.scene.root.traverse(node=>assert.ok(!node.name.startsWith('cultivation-room-3-bob-descent-'),'No added descent ledges or brackets remain.'));
    const colliders=[...f.scene.collisionMeshes.filter(mesh=>mesh.name.startsWith('cultivation-room-3-')),
      ...f.encounter.ceilingDrones.map(drone=>drone.drone.collider),...f.encounter.groundDrones.map(drone=>drone.drone.collider)].map(mesh=>{
      mesh.geometry.computeBoundingBox();mesh.updateWorldMatrix(true,false);
      return {name:mesh.name,bounds:mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)};
    });
    const sample=new THREE.Vector3();
    for(const step of f.movie.descent.steps){
      for(let t=step.walkStart;t<=step.end;t+=1/120){
        f.movie.descent.sample(t,sample);f.scene.roomThree.root.localToWorld(sample);
        for(const collider of colliders)assert.ok(collider.bounds.distanceToPoint(sample)>=f.bob.radiusMetres-.015,
          `${step.landingName} clips ${collider.name} at ${t}: ${sample.toArray()}`);
      }
    }
    const [leap,rebound]=f.movie.descent.steps;
    assert.ok(leap.from.y-leap.to.y>20,'Leap directly from the top to the safe bank.');
    assert.deepEqual(rebound.from.toArray(),leap.to.toArray());assert.deepEqual(rebound.to.toArray(),leap.to.toArray());
    assert.ok(rebound.start-leap.end>=.17,'The first impact gets a floor-contact squash before rebounding.');
    f.movie.descent.sample((rebound.start+rebound.end)/2,sample);
    assert.ok(sample.y-rebound.to.y>.3&&sample.y-rebound.to.y<.5,'A small elastic rebound, not another high jump.');
    const launchSpeeds:number[]=[],landingSpeeds:number[]=[];
    const onLaunch=f.presentation.onLaunch.bind(f.presentation),onLanding=f.presentation.onLanding.bind(f.presentation);
    f.presentation.onLaunch=launch=>{launchSpeeds.push(launch.speedMetresPerSecond);onLaunch(launch);};
    f.presentation.onLanding=(normal,speed)=>{landingSpeeds.push(speed);onLanding(normal,speed);};
    const geometry=f.movie.bubbles.geometry,material=f.movie.bubbles.material;
    const jumpHeading=leap.to.clone().sub(leap.from);jumpHeading.y=0;
    jumpHeading.transformDirection(f.scene.roomThree.root.matrixWorld);
    const facing=new THREE.Vector3(),rotation=new THREE.Quaternion();
    let previousYaw=f.presentation.diagnostics.facingYawRadians,checkedFacing=false;
    let landed=false,disabled=0,maxBubbles=0;
    const cameraStart=f.camera.position.clone(),orientationStart=f.camera.quaternion.clone();
    const before=new THREE.Vector3().copy(f.bob.position);
    for(let i=0;i<Math.ceil(f.movie.durationSeconds*60)+1;i++){
      f.movie.update(1/60);
      const yaw=f.presentation.diagnostics.facingYawRadians,turn=Math.atan2(Math.sin(yaw-previousYaw),Math.cos(yaw-previousYaw));
      assert.ok(Math.abs(turn)<=THREE.MathUtils.degToRad(540)/60+1e-8,'Facing turns smoothly, without snapping.');previousYaw=yaw;
      if(f.movie.seconds>=leap.chargeStart&&f.movie.seconds<=rebound.end){
        f.presentation.present(1);f.presentation.mesh.getWorldQuaternion(rotation);
        facing.set(0,0,-1).applyQuaternion(rotation);
        assert.ok(facing.dot(jumpHeading)>.999,`Bob must face the landing throughout charge, leap and rebound at ${f.movie.seconds}: ${facing.toArray()}`);
        checkedFacing=true;
      }
      const step=new THREE.Vector3().copy(f.bob.position).distanceTo(before);assert.ok(step<.65,`No pose jumps: ${step}`);before.copy(f.bob.position);
      const count=f.encounter.readModel.groundDisabledCount;assert.ok(count>=disabled);disabled=count;
      maxBubbles=Math.max(maxBubbles,f.movie.bubbles.count);assert.ok(f.movie.bubbles.count<=48);
      const seconds=f.movie.seconds;
      for(const alpha of [0,.5,1]){
        f.camera.position.copy(cameraStart);f.camera.quaternion.copy(orientationStart);f.movie.present(f.camera,alpha);
        assert.ok([...f.camera.position.toArray(),...f.camera.quaternion.toArray()].every(Number.isFinite));
      }
      assert.equal(f.movie.seconds,seconds,'Rendering never advances the movie.');
      if(seconds>=f.movie.descent.landSeconds)landed=true;
      for(const ground of f.encounter.groundDrones){
        if((ground.readModel.state==='tipping'&&ground.drone.root.position.y<1.09)||ground.readModel.state==='permanentlyDisabled'){
          const hull=new THREE.Box3().setFromObject(ground.drone.presentation.root);
          const edge=f.scene.roomThree.root.localToWorld(new THREE.Vector3(0,0,66)).z;
          assert.ok(hull.max.z<edge-.05,`The entire hull must clear the bank before lowering: ${hull.max.z} vs ${edge}`);
        }
      }
    }
    assert.equal(landed,true);assert.equal(checkedFacing,true);assert.equal(f.movie.complete,true);assert.equal(f.movie.active,false);
    assert.equal(launchSpeeds.length,2);assert.equal(landingSpeeds.length,2,'Both contacts use Bob’s normal landing animation.');
    assert.ok(launchSpeeds[1]<launchSpeeds[0]);assert.ok(landingSpeeds[0]>landingSpeeds[1]);
    assert.equal(f.encounter.readModel.allGroundDronesDisabled,true);assert.equal(disabled,4);assert.ok(maxBubbles>0);
    for(const ground of f.encounter.groundDrones){
      assert.equal(ground.readModel.state,'permanentlyDisabled');assert.ok(ground.drone.root.position.y<-2.5);
      assert.equal(ground.drone.presentation.root.visible,false);
    }
    assert.equal(f.movie.bubbles.geometry,geometry);assert.equal(f.movie.bubbles.material,material);
    assert.equal(f.bob.grounded,true);assert.equal(f.scene.roomThree.radiationHazard.intersectsWorldSphere(f.bob.position,f.bob.radiusMetres),false);
    assert.equal(f.encounter.projectiles.liveCount,0);assert.equal(f.movie.tryBegin(f.camera),false);
    f.encounter.reset();f.movie.reset();assert.ok(f.encounter.groundDrones.every(d=>d.readModel.state==='active'&&d.drone.presentation.root.visible));
    f.place(platform);assert.equal(f.movie.tryBegin(f.camera),true,'A full puzzle reset can replay it.');
  }finally{f.dispose();}
});

const bottomLandings=[
  ...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.groundDrones.map(ground=>({name:ground.drone.id+'-body',at:undefined as {x:number;z:number}|undefined})),
  {name:'cultivation-room-3-final-safe-floor',at:{x:-6,z:66.65}},
  {name:'cultivation-room-3-final-safe-floor',at:{x:0,z:70.8}},
  {name:'cultivation-room-3-final-safe-floor',at:{x:8.6,z:70.8}},
  {name:'cultivation-room-3-final-safe-floor',at:{x:-22.8,z:70.8}},
  {name:'cultivation-room-3-final-safe-floor',at:{x:22.8,z:66.8}},
];
for(const landing of bottomLandings)test(`a skipped upper route rejoins from the real bottom landing at ${landing.name} ${JSON.stringify(landing.at??'roof')}`,()=>{
  const f=fixture();
  try{
    f.place(landing.name,landing.at);const initial=f.bob.position.clone();
    f.bob.syncKinematicPose(initial);assert.equal(f.movie.tryBegin(f.camera),false,'Airborne proximity is not a bottom landing.');
    f.place(landing.name,landing.at);initial.copy(f.bob.position);
    assert.equal(f.movie.tryBegin(f.camera),true);assert.deepEqual(f.bob.position.toArray(),initial.toArray(),'Triggering never teleports Bob.');
    const colliders=[...f.scene.roomThree.collisionMeshes,...f.encounter.groundDrones.map(d=>d.drone.collider)].map(mesh=>{
      mesh.geometry.computeBoundingBox();mesh.updateWorldMatrix(true,false);
      return {name:mesh.name,bounds:mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)};
    });
    const sample=new THREE.Vector3();
    for(let t=0;t<f.movie.firstPushMoveSeconds;t+=1/120){
      f.movie.descent.sample(t,sample);f.scene.roomThree.root.localToWorld(sample);
      assert.ok(sample.y<5.2,'The bottom entry never sends Bob upstairs.');
      for(const collider of colliders)assert.ok(collider.bounds.distanceToPoint(sample)>=f.bob.radiusMetres-.015,
        `Bottom entry clips ${collider.name} at ${t}: ${sample.toArray()}`);
      assert.equal(f.scene.roomThree.radiationHazard.intersectsWorldSphere(sample,f.bob.radiusMetres),false);
    }
    const previous=initial.clone();
    for(let i=0;i<Math.ceil(f.movie.durationSeconds*60)+1;i++){
      f.movie.update(1/60);assert.ok(previous.distanceTo(f.bob.position)<.4,'Bottom entry moves continuously.');previous.copy(f.bob.position);
    }
    assert.equal(f.movie.complete,true);assert.equal(f.encounter.readModel.groundDisabledCount,4);assert.equal(f.bob.grounded,true);
    f.movie.reset();assert.equal(f.movie.tryBegin(f.camera),false,'An already-cleared row does not replay.');
    f.encounter.reset();f.place(ROOM_THREE_CLEARANCE_PLATFORMS[0]);assert.equal(f.movie.tryBegin(f.camera),true);
    assert.deepEqual(f.movie.descent.steps.map(step=>step.landingName),['floor','rebound'],'Reset restores the normal upper entrance.');
  }finally{f.dispose();}
});

test('the bottom fallback is Bob-only and does not rescue unrelated platforms or acid landings',()=>{
  const f=fixture();
  try{
    f.goop.teleport(f.scene.roomThree.root.localToWorld(new THREE.Vector3(0,.81,70.8)));
    for(const name of ['cultivation-room-3-bob-cross-room-b','cultivation-room-3-bob-final-wall-exit']){
      f.place(name);assert.equal(f.movie.tryBegin(f.camera),false);
    }
    f.place('cultivation-room-3-radioactive-floor',{x:0,z:62});assert.equal(f.movie.tryBegin(f.camera),false);
  }finally{f.dispose();}
});

test('real long falls that skip both upper triggers start clearance on the first roof or bank landing',()=>{
  const f=fixture();
  try{
    const destinations=[...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.groundDrones.map(ground=>({
      x:ground.drone.initialPosition.x,z:ground.drone.initialPosition.z,support:ground.drone.id+'-body',
    })),{x:0,z:70.8,support:'cultivation-room-3-final-safe-floor'}];
    for(const destination of destinations){
      f.movie.reset();f.encounter.reset();
      f.bob.teleport(f.scene.roomThree.root.localToWorld(new THREE.Vector3(destination.x,27,destination.z)));
      let started=false,airborne=0;
      for(let i=0;i<240&&!started;i++){
        started=f.movie.tryBegin(f.camera);
        if(!started){assert.equal(f.bob.grounded,false,'The cutscene must start at the first landing.');airborne++;f.bob.update(1/60,ZERO);}
      }
      assert.equal(started,true);assert.ok(airborne>30,'Exercise a real high-speed fall, not a staged grounded pose.');
      assert.equal(f.bob.supportCollider?.name,destination.support);assert.ok(f.bob.position.y<2.5);
    }
  }finally{f.dispose();}
});

test('the terminal is inside the left boarding alcove before the lift, while CCTV stays above Room 3’s exit',()=>{
  const f=fixture(),o=f.scene.roomThreeObservation,m=o.monitor;
  try{
    assert.deepEqual(SCRIPT,['They’re making their way toward Volt’s chamber','It’s a high-security lockdown zone','They won’t get far']);
    assert.deepEqual(COLOURS,['red','green','green']);
    assert.ok(m.root.position.x>4.5);assert.equal(m.root.rotation.y,-Math.PI/2);
    assert.equal(o.elevatorRoot.parent?.name,'room-4-boarding-floor');
    m.root.updateWorldMatrix(true,true);
    const screenBounds=new THREE.Box3().setFromObject(m.root);
    const localBounds=screenBounds.clone().applyMatrix4(f.scene.roomFour.root.matrixWorld.clone().invert());
    assert.ok(localBounds.min.z>.3&&localBounds.max.z<5,'The whole monitor clears both the entrance and elevator platform.');
    assert.ok(o.cameras.cameras[0].root.position.y>6.55);assert.equal(o.cameras.cameras[0].root.position.x,0);
    const near=o.elevatorRoot.localToWorld(new THREE.Vector3().copy(TRIGGER.centre));
    f.scene.updatePresentationVisibility(near,near);
    const entry=f.scene.roomThree.root.localToWorld(new THREE.Vector3(0,1,69.8));
    f.scene.update(.01,3,[{id:'bob',position:entry,radiusMetres:.45}],undefined,undefined,entry);
    assert.equal(m.hasActivated,false,'The monitor no longer triggers outside Room 3’s door.');
    o.update(.01,f.bob.position,near);o.update(m.dialogue.durationSeconds,f.bob.position,near);
    assert.equal(m.dialogue.readModel.complete,true);assert.equal(m.dialogue.readModel.text,paginateMonitorSections(SCRIPT).at(-1)!.text);
    const version=m.texture.version;f.scene.reset({preserveCompletedDialogue:true});o.update(120,f.bob.position,near);
    assert.equal(m.texture.version,version);f.scene.reset();assert.equal(m.hasActivated,false);
    const before=m.root.getWorldPosition(new THREE.Vector3());
    const floor=o.elevatorRoot.parent!;floor.position.y+=12;floor.updateMatrixWorld(true);
    assert.ok(Math.abs(m.root.getWorldPosition(new THREE.Vector3()).y-before.y-12)<1e-8,'The monitor leaves with the boarding alcove, not the lift.');
  }finally{f.dispose();}
});
