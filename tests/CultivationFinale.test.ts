import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {RoomFiveDroneEncounter} from '../src/hazards/RoomFiveDroneEncounter.ts';
import {CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {KinematicBody} from '../src/physics/KinematicBody.ts';
import {BobCharacterPresentation} from '../src/render/bob/BobCharacterPresentation.ts';
import {GoopCharacterPresentation} from '../src/render/goop/GoopCharacterPresentation.ts';
import {VoltCharacterPresentation} from '../src/render/volt/VoltCharacterPresentation.ts';
import {CultivationFinale} from '../src/cinematics/CultivationFinale.ts';
import {VOLT_FINALE as T,VOLT_FINALE_SHOTS,VOLT_FINALE_PROJECTILES,VOLT_FINALE_KILLS,sampleVoltFinaleActor,sampleVoltFinaleDrone,sampleVoltFinaleRideFrame,voltFinaleDroneVisible,voltFinaleShot,voltFinaleFallTime,voltFinaleLandTime,voltFinaleGrateAngle,voltFinaleVentJumpTime} from '../src/cinematics/CultivationFinaleTimeline.ts';
import {voltFinaleTime as at} from '../src/cinematics/CultivationFinaleTiming.ts';
import {VOLT_FINALE_VENT as V,VOLT_FINALE_RIDER_OFFSETS,VOLT_FINALE_CELL as CELL} from '../src/cinematics/CultivationFinaleLayout.ts';
import {VOLT_FINALE_DIALOGUE,voltFinaleScan,voltFinaleScanStage} from '../src/cinematics/CultivationFinaleOverlay.ts';
import {auditOpaqueSurfaces} from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import {gameplayAudioEvents} from '../src/audio/GameplayAudioEvents.ts';
import {loadVolt} from './fixtures/VoltAssetFixture.ts';

function setup(){
  const preview=new LevelTwoPreviewScene(()=>{},cultivationAssets),scene=new THREE.Scene();scene.add(preview.root);
  const world=new CollisionWorld(),surfaces=new SurfaceRegistry();world.registerAll(preview.collisionMeshes);surfaces.registerAll(preview.collisionMeshes);
  const body=()=>new KinematicBody({world,surfaces,initialPosition:new THREE.Vector3(0,30,270)});
  const bob=body(),goop=body(),volt=body();
  const bobPresentation=new BobCharacterPresentation(),goopPresentation=new GoopCharacterPresentation(),voltPresentation=new VoltCharacterPresentation();
  scene.add(bobPresentation.root,goopPresentation.root,voltPresentation.root);
  const encounter=new RoomFiveDroneEncounter(preview.roomFive,world,surfaces,bob,goop,()=>true);
  const movie=new CultivationFinale({room:preview.roomFive,encounter,bob,goop,volt,bobPresentation,goopPresentation,voltPresentation,
    set:preview.voltFinaleSet,acid:preview.labArt.acid,scene,host:{} as HTMLElement});
  const camera=new THREE.PerspectiveCamera(55,16/9,.1,100);
  return{preview,scene,world,encounter,bob,goop,volt,bobPresentation,goopPresentation,voltPresentation,movie,camera,
    dispose(){movie.dispose();encounter.dispose();bobPresentation.dispose();goopPresentation.dispose();voltPresentation.dispose();preview.dispose();}};
}

test('Volt finale has contiguous authored shots, readable threat directives and the requested dialogue',()=>{
  assert.equal(VOLT_FINALE_SHOTS[0].start,0);assert.equal(VOLT_FINALE_SHOTS.at(-1)!.end,T.duration);
  VOLT_FINALE_SHOTS.forEach((shot,i)=>{assert.ok(shot.end>shot.start);if(i)assert.equal(shot.start,VOLT_FINALE_SHOTS[i-1].end);});
  assert.equal(voltFinaleScan(T.scanVolt+1),'volt');assert.equal(voltFinaleScanStage(T.critical+.2),'threat');
  assert.equal(voltFinaleScanStage(T.terminateVolt+.5),'terminate');
  assert.equal(voltFinaleScan(T.catastrophic+.1),'bob');assert.equal(voltFinaleScanStage(T.terminateBob+.5),'terminate');
  assert.equal(voltFinaleScan(T.powerOff),undefined,'no later acid-drone scan or attack HUD');
  assert.deepEqual(VOLT_FINALE_DIALOGUE.map(line=>[line.speaker,line.text]),[['goop',"Now we're even"],['volt','Get on'],['goop','Follow me, I know the way out']]);
  assert.ok(T.followMe>T.ventCamera+1.5&&T.ductRun>=T.followMe+3,'a quiet recovery beat precedes Goop\'s direction, then they walk');
  assert.ok(T.terminateVolt+2.5<T.coverRun&&T.terminateBob+3<T.voltJump,'directives remain readable before the action resumes');
});

test('escape alarm follows the movie clock, softens under dialogue, and stops on skip and reset',()=>{
  const s=setup(),loops:{key:string;volumeScale?:number}[]=[],stops:string[]=[],cues:string[]=[];
  const offs=[gameplayAudioEvents.on('loop',e=>loops.push(e)),gameplayAudioEvents.on('stop',e=>stops.push(e.key)),
    gameplayAudioEvents.on('cue',e=>cues.push(e.sound))];
  try{
    s.movie.begin(s.camera,true);s.movie.update(T.open+.01);
    assert.deepEqual(loops.at(-1),{key:'cultivation-finale-alarm',sound:'world-containment-alarm-loop-01',volumeScale:.6});
    const count=loops.length;s.movie.present(s.camera,1);s.movie.present(s.camera,1);assert.equal(loops.length,count,'rendering cannot emit audio');
    s.movie.update(T.even+.1-s.movie.seconds);assert.equal(loops.at(-1)!.volumeScale,.3);
    assert.ok(cues.includes('world-button-press-01'));assert.ok(cues.includes('world-vent-break-01'));
    const beforeSkip=cues.length;s.movie.requestSkip();s.movie.update(1/60);
    assert.equal(stops.at(-1),'cultivation-finale-alarm');assert.equal(cues.length,beforeSkip,'skipping never replays the remaining cues');
    s.movie.reset();assert.equal(stops.at(-1),'cultivation-finale-alarm');
  }finally{offs.forEach(off=>off());s.dispose();}
});

test('actor routes stay continuous; boarding and deliberate vent jumps use shared craft positions',()=>{
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(const id of ['bob','goop','volt'] as const){
    sampleVoltFinaleActor(id,0,a);
    for(let frame=1;frame<=T.duration*120;frame++){
      const t=frame/120;sampleVoltFinaleActor(id,t,b);
      assert.ok(b.toArray().every(Number.isFinite),`${id} ${t}`);
      const fallAge=Math.max(0,t-voltFinaleFallTime(id)),maximumSpeed=fallAge?Math.max(15,5+12*fallAge):60;
      assert.ok(a.distanceTo(b)<maximumSpeed/120+.01,`${id} teleports ${a.distanceTo(b)}m at ${t}`);a.copy(b);
    }
  }
  const frame=new THREE.Quaternion(),expected=new THREE.Vector3();
  for(const time of [42,50,60,78,89,91].map(at)){
    sampleVoltFinaleActor('volt',time,a);sampleVoltFinaleDrone(1,time,b);
    sampleVoltFinaleRideFrame(time,frame);
    expected.fromArray(VOLT_FINALE_RIDER_OFFSETS.volt).applyQuaternion(frame).add(b);
    assert.ok(a.distanceTo(expected)<1e-8,'Volt stays attached to the rotating deck');
    if(time>T.boarded){
      sampleVoltFinaleActor('bob',time,a);expected.fromArray(VOLT_FINALE_RIDER_OFFSETS.bob).applyQuaternion(frame).add(b);
      assert.ok(a.distanceTo(expected)<1e-8);
    }
  }
  assert.equal(voltFinaleDroneVisible(2,T.firstKill+.1),false);assert.equal(voltFinaleDroneVisible(3,T.secondKill+.1),false);
  assert.equal(voltFinaleDroneVisible(4,T.ambushKill+.1),false);assert.equal(voltFinaleDroneVisible(1,T.rideAcidHit+1.2),false);
  assert.ok(!VOLT_FINALE_PROJECTILES.some(shot=>shot.kill===1||shot.time>T.getOn),'there is no last shot or explosion of the ridden drone');
  sampleVoltFinaleActor('goop',T.drop+2,a);assert.ok(a.y<V.y-10,'all three are committed to the basement shaft');
});

test('live finale borrows the real actors/cover/drones, freezes normal combat, and reuses its effects through reset',()=>{
  const s=setup(),r=s.preview.roomFive,geometry=r.releaseCover.geometry;
  const roots=[s.bobPresentation.root,s.goopPresentation.root,s.voltPresentation.root];
  const parents=roots.map(root=>root.parent),coverPosition=r.releaseCover.position.clone();
  const matrix=s.preview.voltFinaleSet.fragments.instanceMatrix,material=s.preview.voltFinaleSet.fragments.material;
  const colliders=s.world.colliderCount,cameraFov=s.camera.fov;
  const cues:string[]=[],unsubscribe=gameplayAudioEvents.on('cue',cue=>cues.push(cue.sound));
  let launches=0,landings=0;
  const launch=s.bobPresentation.onLaunch.bind(s.bobPresentation),land=s.bobPresentation.onLanding.bind(s.bobPresentation);
  s.bobPresentation.onLaunch=event=>{launches++;launch(event);};s.bobPresentation.onLanding=(normal,speed)=>{landings++;land(normal,speed);};
  try{
    assert.equal(s.movie.begin(s.camera),false,'normal play cannot trigger before the button releases Volt');
    assert.equal(s.movie.begin(s.camera,true),true);assert.equal(s.movie.begin(s.camera,true),false);
    assert.equal(r.releaseCover.geometry,geometry);assert.notEqual(r.releaseCover.parent,r.root);
    const clock=s.encounter.patrols[0].elapsed;s.encounter.update(1);assert.equal(s.encounter.patrols[0].elapsed,clock);
    let completions=0;
    for(let step=0;step<T.duration*60+2;step++){
      if(s.movie.update(1/60))completions++;
      if(step%12===0)s.movie.present(s.camera,1);
    }
    assert.equal(completions,1);assert.equal(s.movie.complete,true);
    assert.equal(launches,3);assert.equal(landings,3,'cover hop, boarding and the deliberate jump into the vent each animate once');
    assert.ok(cues.includes('volt-circuit-connect-01'));assert.ok(cues.includes('goop-shoot-01'));assert.ok(cues.includes('world-drone-dissolve-01'));
    assert.equal(s.preview.voltFinaleSet.fragments.instanceMatrix,matrix);assert.equal(s.preview.voltFinaleSet.fragments.material,material);
    assert.equal(s.world.colliderCount,colliders,'the trigger does not cook geometry or add colliders');
    assert.equal(r.controller.complete,false,'only the runtime may complete/unlock the next level');
    s.movie.reset();assert.equal(s.movie.complete,false);assert.equal(s.camera.fov,cameraFov);
    roots.forEach((root,i)=>assert.equal(root.parent,parents[i]));
    assert.equal(r.releaseCover.parent,r.root);assert.deepEqual(r.releaseCover.position,coverPosition);
    assert.equal(r.releaseCover.geometry,geometry);assert.equal(s.preview.voltFinaleSet.effects.visible,false);
    assert.equal(s.movie.begin(s.camera,true),true,'restart reuses the same prepared resources');
    s.movie.requestSkip();assert.equal(s.movie.update(1/60),true);
  }finally{unsubscribe();s.dispose();}
});

test('cover lands on the vulnerable real drone before they fall into acid; glass opens with no duplicate Volt',()=>{
  const s=setup();try{
    s.movie.begin(s.camera,true);s.movie.update(T.coverImpact);s.movie.present(s.camera,1);
    s.preview.root.updateWorldMatrix(true,true);
    const cover=new THREE.Box3().setFromObject(s.preview.roomFive.releaseCover,true);
    const drone=new THREE.Box3().setFromObject(s.encounter.drones[0].root.getObjectByName('room-5-red-security-0-flying-shell')!,true);
    assert.ok(cover.min.y>=drone.max.y-.005,`no antenna protrudes: panel underside ${cover.min.y}, drone top ${drone.max.y}`);
    assert.ok(cover.min.y-drone.max.y<.08,'cover rests on the full silhouette rather than floating above it');
    const relative=cover.min.y-drone.min.y;
    for(const time of [T.coverImpact+1,T.coverImpact+2,T.coverImpact+3]){
      s.movie.update(time-s.movie.seconds);s.movie.present(s.camera,1);s.preview.root.updateWorldMatrix(true,true);
      cover.setFromObject(s.preview.roomFive.releaseCover,true);
      drone.setFromObject(s.encounter.drones[0].root.getObjectByName('room-5-red-security-0-flying-shell')!,true);
      assert.ok(Math.abs(cover.min.y-drone.min.y-relative)<1e-6,'panel remains on the same deck, not on a second fall curve');
      assert.ok(cover.min.y>=drone.max.y-.005&&cover.min.y-drone.max.y<.08,'clear deck contact persists throughout the plunge');
    }
    assert.equal(s.preview.roomFive.captiveVolt.visible,false);assert.equal(s.voltPresentation.root.visible,true);
    s.movie.update(Math.max(T.acidHit+.15,s.movie.seconds+.05)-s.movie.seconds);s.movie.present(s.camera,1);
    const point=s.encounter.drones[0].root.getWorldPosition(new THREE.Vector3());s.preview.roomFive.root.worldToLocal(point);
    assert.ok(point.y<.3&&point.z<59,'wreck sinks in exposed acid, not the reunion floor');
  }finally{s.dispose();}
});

test('the tipping cover never cuts through the scout silhouette before contact',()=>{
  const s=setup(),point=new THREE.Vector3(),inverse=new THREE.Matrix4();try{
    s.movie.begin(s.camera,true);s.movie.update(T.coverHit-.05);
    const collider=s.preview.roomFive.releaseCoverCollider as THREE.Mesh<THREE.BoxGeometry>;
    const {width,height,depth}=collider.geometry.parameters;
    const shell=s.encounter.drones[0].root.getObjectByName(`${s.encounter.drones[0].id}-flying-shell`)!;
    for(let time=T.coverHit;time<T.coverImpact;time+=1/60){
      s.movie.update(time-s.movie.seconds);s.movie.present(s.camera,1);s.preview.root.updateWorldMatrix(true,true);
      inverse.copy(collider.matrixWorld).invert();
      let penetrating=false,detail='';
      shell.traverse(node=>{
        if(!(node instanceof THREE.Mesh))return;
        const vertices=node.geometry.getAttribute('position');
        for(let i=0;i<vertices.count;i++){
          point.fromBufferAttribute(vertices,i).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
          if(Math.abs(point.x)<width/2-.01&&Math.abs(point.y)<height/2-.01&&Math.abs(point.z)<depth/2-.01){penetrating=true;detail=`${node.name}: ${point.toArray()}`;break;}
        }
      });
      assert.equal(penetrating,false,`panel cuts through the hull/antenna while tipping at ${time}, ${detail}`);
    }
  }finally{s.dispose();}
});

test('the shoulder close-up stays on Bob\'s side of the cover with an unobstructed sightline',()=>{
  const s=setup();try{
    const shot=VOLT_FINALE_SHOTS.find(shot=>shot.id==='bob-cover-shoulder')!;
    s.movie.begin(s.camera,true);s.movie.update((shot.start+shot.end)/2);s.movie.present(s.camera,1);
    s.preview.root.updateWorldMatrix(true,true);
    const target=s.bob.position.clone();target.y+=.25;
    const direction=target.clone().sub(s.camera.position),ray=new THREE.Raycaster(s.camera.position,direction.clone().normalize(),.06,direction.length()-.3);
    assert.equal(ray.intersectObject(s.preview.roomFive.releaseCover,true).length,0,'the panel cannot fill the lens and hide Bob\'s push');
    target.project(s.camera);assert.ok(Math.abs(target.x)<.8&&Math.abs(target.y)<.7);
  }finally{s.dispose();}
});

test('vent mouth and basement/exit route art have no coplanar conflicts and the down-shaft is a real hole',()=>{
  const s=setup();try{
    s.preview.voltFinaleSet.annex.visible=true;
    assert.deepEqual(auditOpaqueSurfaces(s.preview.voltFinaleSet.annex).conflicts,[]);
    assert.deepEqual(auditOpaqueSurfaces(s.preview.voltFinaleSet.mouth).conflicts,[]);
    s.preview.voltFinaleSet.present(T.ductSilence);s.preview.root.updateWorldMatrix(true,true);
    const ray=new THREE.Raycaster(s.preview.roomFive.root.localToWorld(new THREE.Vector3(V.dropX,V.y+1.5,V.z)),new THREE.Vector3(0,-1,0),0,10);
    assert.equal(ray.intersectObject(s.preview.voltFinaleSet.annex,true).length,0,'no floor plane covers the vertical opening');
  }finally{s.dispose();}
});

test('release has a readable opening, slower alert coverage and continuously moving background craft',()=>{
  assert.ok(T.cellOpen-T.open>=4.5);
  assert.ok(T.scanVolt-T.open>=14,'opening and alert have time to read before the scan');
  assert.ok(T.alarmEnd-T.open>=10);
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(const index of [2,3,5,6,7,8])for(const time of [5,15,32,38,71,78,95].map(at)){
    sampleVoltFinaleDrone(index,time,a);sampleVoltFinaleDrone(index,time+.3,b);
    assert.ok(a.distanceTo(b)>.001,`drone ${index} freezes at ${time}`);
  }
  sampleVoltFinaleActor('volt',T.voltJump,a);sampleVoltFinaleActor('volt',T.hijack,b);
  assert.ok(Math.abs(b.y-a.y)<1.3&&a.distanceTo(b)<4.5,'Volt boards from the raised cell lip with a short normal jump');
  assert.ok(T.hijack-T.voltJump<1.1);
  sampleVoltFinaleActor('goop',T.even,a);
  assert.ok(a.y>25&&Math.abs(a.y-CELL.y)<4,'Goop is in the high vent near the cell, not the sewer');
  sampleVoltFinaleDrone(1,T.scanBob,a);sampleVoltFinaleActor('bob',T.scanBob,b);
  assert.ok(Math.abs((b.y+.25)-(a.y+.12))<.25,'Bob is scanned at a normal eye-level angle');
  sampleVoltFinaleDrone(4,T.ambushNotice,a);sampleVoltFinaleActor('bob',T.ambushNotice,b);
  assert.ok(a.distanceTo(b)>7,'ambusher is still visibly separated when Bob notices');
  assert.ok(T.goopShot-T.ambushNotice<.5,'Bob reacts at the last second');
});

test('all nine alert flights curve around the raised cell from actual patrol positions',()=>{
  for(const patrolTime of [0,5.4]){
    const s=setup(),hits:string[]=[];try{
      if(patrolTime)s.encounter.update(patrolTime);
      s.movie.begin(s.camera,true);s.preview.root.updateWorldMatrix(true,true);
      const cage=new THREE.Box3().setFromObject(s.preview.roomFive.pod,true);
      const shells=s.encounter.drones.map(drone=>drone.root.getObjectByName(`${drone.id}-flying-shell`)!);
      const previous=s.encounter.drones.map(drone=>drone.root.position.clone());
      for(let time=1/30;time<T.alerted+1;time+=1/30){
        s.movie.update(time-s.movie.seconds);s.movie.present(s.camera,1);s.preview.root.updateWorldMatrix(true,true);
        for(let index=0;index<shells.length;index++){
          const position=s.encounter.drones[index].root.position;
          assert.ok(position.distanceTo(previous[index])<.55,`alert drone ${index} snaps at ${time}`);previous[index].copy(position);
          if(cage.intersectsBox(new THREE.Box3().setFromObject(shells[index],true))&&!hits.some(hit=>hit.startsWith(`${index}:`)))hits.push(`${index}: ${time}`);
        }
      }
      assert.deepEqual(hits,[],`patrol phase ${patrolTime}: drone enters the full cell envelope`);
    }finally{s.dispose();}
  }
});

test('fight, return and boarding flight clear Volt cell, platforms, power feeds and suspension cables',()=>{
  const s=setup();try{
    const room=s.preview.roomFive;
    s.preview.root.updateWorldMatrix(true,true);
    const wall=room.collisionMeshes.filter(mesh=>mesh.name.startsWith('room-5-chamber-east'));
    const aperture=new THREE.Raycaster(room.root.localToWorld(new THREE.Vector3(18,V.y+1.4,V.z)),new THREE.Vector3(1,0,0),0,6);
    assert.equal(aperture.intersectObjects(wall,false).length,0,'wall is split around the high opening');
    s.movie.begin(s.camera,true);
    s.movie.update(T.hijack);s.movie.present(s.camera,1);
    const obstacles:{name:string;bounds:THREE.Box3}[]=[];
    room.root.updateWorldMatrix(true,true);
    room.root.traverse(node=>{
      if(node instanceof THREE.Mesh&&(/^room-5-safe-\d+-(floor|suspension)/.test(node.name)||/^room-5-pod-(base|cap|glass|cable)/.test(node.name)||/^room-5-chamber-(roof|west|east|back|front)/.test(node.name)||node.name==='room-5-release-quiet-walk'))
        obstacles.push({name:node.name,bounds:new THREE.Box3().setFromObject(node,true)});
    });
    const craft=s.encounter.drones[1].root.getObjectByName(`${s.encounter.drones[1].id}-flying-shell`)!;
    for(let time=T.hijack;time<T.powerOff;time+=1/30){
      if(time>s.movie.seconds)s.movie.update(time-s.movie.seconds);s.movie.present(s.camera,1);
      room.root.updateWorldMatrix(true,true);
      const bounds=new THREE.Box3().setFromObject(craft,true);
      bounds.max.y+=1.5; // Include Volt's crest, not only the bare hull.
      const hit=obstacles.find(obstacle=>obstacle.bounds.intersectsBox(bounds));
      assert.ok(!hit,`craft clips ${hit?.name} at ${time}`);
    }
  }finally{s.dispose();}
});

test('Bob faces his cover hop; all three recover and run before the floor gives way',()=>{
  const s=setup(),a=new THREE.Vector3(),b=new THREE.Vector3();try{
    s.movie.begin(s.camera,true);
    while(s.movie.seconds<T.coverRun+.5)s.movie.update(1/60);
    const yaw=s.bobPresentation.diagnostics.facingYawRadians;
    assert.ok(-Math.cos(yaw)>.98,'Bob faces +Z before the cover hop, not backwards');
    while(s.movie.seconds<T.coverHit)s.movie.update(1/60);
    s.movie.present(s.camera,1);assert.ok(s.movie.actors[0].pose.position.y>30,'small cover hop clears the deck');
    s.preview.root.updateWorldMatrix(true,true);
    const collider=s.preview.roomFive.releaseCoverCollider;
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(collider.getWorldQuaternion(new THREE.Quaternion()));
    const contact=collider.getWorldPosition(new THREE.Vector3()).sub(s.bob.position).dot(normal);
    assert.ok(Math.abs(contact)<.58,'the forward hop actually contacts the cover before it tips');
    while(s.movie.seconds<T.ventCamera+.5)s.movie.update(1/60);
    for(let time=T.ventCamera+.5;time<T.ductSilence;time+=1/30){
      if(time>s.movie.seconds)s.movie.update(time-s.movie.seconds);s.movie.present(s.camera,1);
      for(const actor of s.movie.actors){
        assert.ok(Math.abs(actor.pose.rotation.x)<.1&&Math.abs(actor.pose.rotation.z)<.1,'the slimes fly forward instead of pinballing');
        if(time>=voltFinaleLandTime(actor.id)&&time<T.grateWarning){
          assert.ok(Math.abs(actor.pose.position.y-(V.y+.46))<.01,'grounded travel stays on the rattling duct floor');
          assert.equal(actor.state.grounded,true,'normal locomotion animation resumes after landing');
        }
      }
      if(time<T.drop){
        sampleVoltFinaleActor('bob',time,a);sampleVoltFinaleActor('volt',time,b);
        assert.ok(a.distanceTo(b)>1,'Bob and Volt have separate tracks, not overlapping centres');
      }
    }
  }finally{s.dispose();}
});

test('every flying opponent is destroyed before pickup; the abandoned ride powers down only after both dismount',()=>{
  assert.deepEqual(VOLT_FINALE_KILLS.map(kill=>kill.index).sort(),[2,3,4,5,6,7,8]);
  for(const kill of VOLT_FINALE_KILLS){
    assert.ok(kill.time<T.getOn);
    assert.ok(VOLT_FINALE_PROJECTILES.some(shot=>shot.kill===kill.index&&Math.abs(shot.time+shot.duration-kill.time)<1e-8));
    assert.equal(voltFinaleDroneVisible(kill.index,T.getOn),false);
  }
  assert.equal(voltFinaleDroneVisible(0,T.getOn),true);assert.equal(voltFinaleDroneVisible(1,T.getOn),true);
  assert.ok(!VOLT_FINALE_PROJECTILES.some(shot=>shot.time>T.getOn),'no craft fires after pickup');
  assert.equal(voltFinaleShot(T.powerOff+.2).id,'drone-powers-down');
  assert.equal(voltFinaleShot(T.rideAcidHit+.2).id,'abandoned-drone-acid');
  assert.ok(T.powerOff>voltFinaleLandTime('bob')&&T.powerOff>voltFinaleLandTime('volt'));
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  sampleVoltFinaleDrone(1,T.powerOff,a);sampleVoltFinaleDrone(1,T.rideFall,b);
  assert.ok(a.distanceTo(b)<1e-8,'the empty drone holds for a readable power-down beat');
  sampleVoltFinaleDrone(1,T.rideAcidHit,b);assert.ok(b.y<.2&&a.y-b.y>25,'it falls all the way to the acid');
  const s=setup();try{
    s.movie.begin(s.camera,true);s.movie.update(T.rideFall);s.movie.present(s.camera,1);
    assert.equal(s.preview.roomFive.releaseCover.parent!.visible,false,'no cover remains for the later exterior shot');
    assert.equal(s.preview.roomFive.releaseCover.visible,false,'the borrowed render assembly is explicitly hidden too');
    const eye=s.encounter.drones[1].root.getObjectByName(`${s.encounter.drones[1].id}-flying-shell`)!;
    let litEye=false;eye.traverse(node=>{if(node instanceof THREE.Mesh&&node.material instanceof THREE.MeshBasicMaterial&&node.geometry instanceof THREE.SphereGeometry&&node.material.color.getHex()!==0)litEye=true;});
    assert.equal(litEye,false,'the abandoned drone\'s eye is visibly off');
    s.movie.update(T.rideAcidHit+.15-s.movie.seconds);s.movie.present(s.camera,1);
    sampleVoltFinaleDrone(1,T.rideAcidHit,b);s.preview.roomFive.root.localToWorld(b);
    assert.equal(s.preview.roomFive.isAcidAt(b),true,'the hull reaches exposed acid, not the lower reunion floor');
    assert.equal(s.preview.voltFinaleSet.rings.count,2,'the intact falling hull makes its own acid splash');
    assert.equal(s.encounter.drones[1].root.visible,true,'the hull remains visible while it sinks, not an explosion/despawn');
  }finally{s.dispose();}
});

test('the authored camera keeps the destruction beats in shot',()=>{
  const s=setup(),point=new THREE.Vector3(),offscreen:string[]=[];try{
    s.movie.begin(s.camera,true);
    for(const kill of [...VOLT_FINALE_KILLS].sort((a,b)=>a.time-b.time)){
      s.movie.update(kill.time-s.movie.seconds);s.movie.present(s.camera,1);
      sampleVoltFinaleDrone(kill.index,kill.time,point);s.preview.roomFive.root.localToWorld(point);point.project(s.camera);
      if(Math.abs(point.x)>=1||Math.abs(point.y)>=.85||point.z>=1)offscreen.push(`drone ${kill.index}: ${point.toArray()}`);
    }
    assert.deepEqual(offscreen,[]);
  }finally{s.dispose();}
});

test('dead patrol colliders cannot squash Volt\'s crest during arrival, and reset restores their query state',async()=>{
  const s=setup();try{
    s.voltPresentation.setCollisionWorld(s.world);await s.voltPresentation.prepare(loadVolt);
    const visibility=s.encounter.drones.map(drone=>drone.collider.visible);
    s.movie.begin(s.camera,true);
    assert.ok(s.encounter.drones.every(drone=>!drone.collider.visible),'scripted craft do not remain as invisible movement/headroom obstacles');
    s.movie.update(T.escape);s.movie.present(s.camera,1);
    while(s.movie.seconds<T.voltVentJump){
      s.movie.update(1/60);s.movie.present(s.camera,1);
      assert.equal(s.voltPresentation.diagnostics.headroom.compression,0,`unexpected crest compression at ${s.movie.seconds}`);
    }
    s.movie.reset();assert.deepEqual(s.encounter.drones.map(drone=>drone.collider.visible),visibility);
  }finally{s.dispose();}
});

test('vent dismounts use forward-facing jump/landing animation before the power shuts off',()=>{
  const s=setup(),forward=new THREE.Vector3(),orientation=new THREE.Quaternion();try{
    s.movie.begin(s.camera,true);s.movie.update(T.bobVentJump-.5);s.movie.present(s.camera,1);
    while(s.movie.seconds<T.powerOff){
      s.movie.update(1/120);s.movie.present(s.camera,1);
      for(const actor of s.movie.actors){
        if(actor.id==='goop')continue;
        const start=voltFinaleVentJumpTime(actor.id),land=voltFinaleLandTime(actor.id),t=s.movie.seconds;
        if(t>=start&&t<land){
          assert.equal(actor.state.grounded,false);
          assert.ok(actor.local.x>17&&actor.local.x<24,'a short jump across the vent lip, not an explosion down the duct');
          actor.presentation.root.updateWorldMatrix(true,true);
          const name=actor.id==='bob'?'player-slime-bob-character':'player-slime-volt-character';
          const character=actor.presentation.root.getObjectByName(name);
          assert.ok(character,`missing facing node for ${actor.id}`);
          forward.set(0,0,-1).applyQuaternion(character!.getWorldQuaternion(orientation));
          assert.ok(forward.x>.98,`${actor.id} faces into the vent during the dismount`);
        }else if(t>=land)assert.equal(actor.state.grounded,true);
      }
    }
  }finally{s.dispose();}
});

test('the inspection-vent peek keeps a near-level continuous camera through the grille',()=>{
  const s=setup(),direction=new THREE.Vector3(),previous=new THREE.Quaternion();try{
    s.movie.begin(s.camera,true);s.movie.update(T.grilleReveal);s.movie.present(s.camera,1);previous.copy(s.camera.quaternion);
    for(let t=T.grilleReveal+1/120;t<T.duration;t+=1/120){
      s.movie.update(t-s.movie.seconds);s.movie.present(s.camera,1);s.camera.getWorldDirection(direction);
      assert.ok(Math.abs(direction.y)<.04,`the vent peek must not tilt upwards at ${t}: ${direction.y}`);
      assert.ok(previous.angleTo(s.camera.quaternion)<.01,`camera flips/changes angle at ${t}`);
      previous.copy(s.camera.quaternion);
    }
  }finally{s.dispose();}
});

test('interpolated vent launch frames do not apply the carrier yaw twice',()=>{
  const s=setup(),forward=new THREE.Vector3(),orientation=new THREE.Quaternion();try{
    s.movie.begin(s.camera,true);
    for(const id of ['bob','volt'] as const){
      const start=voltFinaleVentJumpTime(id);
      s.movie.update(start-.012-s.movie.seconds);s.movie.present(s.camera,1);
      s.movie.update(.024);
      for(const alpha of [0,.25,.5,.75,1]){
        s.movie.present(s.camera,alpha);
        const actor=s.movie.actors.find(actor=>actor.id===id)!;
        actor.presentation.root.updateWorldMatrix(true,true);
        const facing=actor.presentation.root.getObjectByName(`player-slime-${id}-character`)!;
        forward.set(0,0,-1).applyQuaternion(facing.getWorldQuaternion(orientation));
        assert.ok(forward.x>.98,`${id} turns backwards at launch alpha=${alpha}`);
      }
    }
  }finally{s.dispose();}
});

test('Goop leads a shorter walk, the normal floor fails before the inspection grille ahead',()=>{
  assert.ok(V.dropX-V.x>15&&V.dropX-V.x<30);assert.ok(T.ductLand-T.voltVentJump<1.5);
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  sampleVoltFinaleActor('bob',T.ventCamera,a);sampleVoltFinaleActor('bob',T.ductRun,b);
  assert.ok(a.x-V.x<6&&a.distanceTo(b)<1e-8,'they stop and recover a few metres inside, not fifty metres down the airway');
  sampleVoltFinaleActor('bob',T.ductRun+2,a);sampleVoltFinaleActor('bob',T.ductRun+2.5,b);
  assert.ok(b.x-a.x>1&&b.x-a.x<3,'ordinary grounded walking, not a sprint through the duct');
  assert.ok(T.ductShake>T.ductRun&&T.ductShake<T.grateWarning,'the duct starts shaking during the walk');
  assert.ok(T.grateBreak-T.grateWarning>1.5,'the floor shudders and they brake before it fails');
  assert.equal(voltFinaleGrateAngle(0,T.ductRun),0);
  assert.ok(voltFinaleGrateAngle(0,T.brake)<-.05&&voltFinaleGrateAngle(1,T.ductSilence)>1.4);
  assert.ok(V.branchX<V.dropX&&V.dropX+2<V.inspectionX&&V.inspectionX<V.dropX+9,'the room-view grille is visible a short distance ahead of the failed floor');
  const s=setup();try{
    const annex=s.preview.voltFinaleSet.annex;
    assert.equal(annex.getObjectByName('volt-finale-basement-route-label'),undefined);
    assert.equal(annex.getObjectByName('volt-finale-exit-route-label'),undefined);
    assert.ok(annex.getObjectByName('volt-finale-loose-inspection-grille'));
    assert.ok(annex.getObjectByName('volt-finale-inspection-room-exit-direction'));
    assert.ok(annex.getObjectByName('volt-finale-inspection-room-basement-direction'));
    for(const name of ['volt-finale-inspection-room-exit-direction','volt-finale-inspection-room-basement-direction']){
      const sign=annex.getObjectByName(name) as THREE.Mesh;
      sign.geometry.computeBoundingBox();const size=sign.geometry.boundingBox!.getSize(new THREE.Vector3());
      assert.ok(size.y<.28,'mall-style wayfinding uses realistic small lettering');
      if(name.includes('basement'))assert.ok(size.y>.23,'Basement lettering is large enough to resolve clearly');
    }
    assert.ok(annex.getObjectByName('volt-finale-inspection-room-lab-furniture'));
    assert.ok(annex.getObjectByName('volt-finale-inspection-room-observation-glass'));
    const exitSign=annex.getObjectByName('volt-finale-inspection-room-exit-direction') as THREE.Mesh;
    const basementSign=annex.getObjectByName('volt-finale-inspection-room-basement-direction') as THREE.Mesh;
    exitSign.geometry.computeBoundingBox();basementSign.geometry.computeBoundingBox();
    assert.ok(exitSign.geometry.boundingBox!.min.x>V.inspectionX-.5&&exitSign.geometry.boundingBox!.max.x>V.inspectionX+1,'Exit arrow is on the right');
    assert.ok(basementSign.geometry.boundingBox!.min.x<V.inspectionX-1&&basementSign.geometry.boundingBox!.max.x<V.inspectionX+1,'Basement arrow is on the lower left');
    const shell=annex.getObjectByName('volt-finale-inspection-room-shell') as THREE.Mesh,p=shell.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)if(p.getY(i)<-1)assert.ok(p.getX(i)<V.inspectionX-8,'the descending stairs follow the new left-hand Basement direction');
    annex.visible=true;s.preview.root.updateWorldMatrix(true,true);
    const floorRay=new THREE.Raycaster(s.preview.roomFive.root.localToWorld(new THREE.Vector3(V.dropX-.5,V.y+1,V.z)),new THREE.Vector3(0,-1,0),0,2);
    assert.ok(floorRay.intersectObjects(s.preview.voltFinaleSet.ductGrates,true).length>0,'solid metal covers the shaft before the collapse');
    const sideShot=VOLT_FINALE_SHOTS.find(shot=>shot.id==='past-goop-side-tunnel')!;
    const origin=s.preview.roomFive.root.localToWorld(new THREE.Vector3(...sideShot.eye));
    const target=s.preview.roomFive.root.localToWorld(new THREE.Vector3(...sideShot.target as [number,number,number]));
    const direction=target.clone().sub(origin),ray=new THREE.Raycaster(origin,direction.clone().normalize(),.06,direction.length()-.05);
    assert.equal(ray.intersectObject(annex,true).length,0,'the branch establishing shot looks through its opening, not into its jamb');
    const under=s.preview.roomFive.root.localToWorld(new THREE.Vector3(V.inspectionX,V.y+.7,60.4));
    ray.set(under,new THREE.Vector3(0,0,-1));ray.far=1.5;
    assert.equal(ray.intersectObject(annex,true).length,0,'the peek passes below the lifted grille instead of through it');
  }finally{s.dispose();}
});

test('escape craft faces its travel, settles upright near Goop, and breakaway roots reset after use',()=>{
  const q=new THREE.Quaternion(),a=new THREE.Vector3(),b=new THREE.Vector3(),forward=new THREE.Vector3();
  for(let time=at(83);time<at(90.4);time+=.1){
    sampleVoltFinaleDrone(1,time,a);sampleVoltFinaleDrone(1,time+.02,b);b.sub(a).setY(0).normalize();
    sampleVoltFinaleRideFrame(time,q);forward.set(0,0,-1).applyQuaternion(q).setY(0).normalize();
    assert.ok(forward.dot(b)>.96,'escape heading follows the flight path instead of sideways skating');
  }
  for(const time of [T.ventArrive,T.bobVentJump,T.powerOff]){
    sampleVoltFinaleRideFrame(time,q);forward.set(0,1,0).applyQuaternion(q);
    assert.ok(forward.y>.999,'Volt is upright while waiting at the vent');
  }
  const previous=new THREE.Quaternion();sampleVoltFinaleRideFrame(T.escape,previous);
  for(let time=T.escape+1/240;time<T.powerOff;time+=1/240){
    sampleVoltFinaleRideFrame(time,q);
    assert.ok(previous.angleTo(q)*240<4,`no angular jitter/whip at ${time}`);previous.copy(q);
  }
  const s=setup();try{
    const set=s.preview.voltFinaleSet;
    set.present(T.grateBreak+.4);s.preview.root.updateWorldMatrix(true,true);
    assert.ok(set.ductGrates.every(hinge=>hinge.matrixAutoUpdate),'hinges are excluded from static transform freezing');
    assert.ok(set.ductGrates[0].rotation.z<-.7&&set.ductGrates[1].rotation.z>.7);
    set.reset();assert.ok(set.ductGrates.every(hinge=>hinge.rotation.z===0));
  }finally{s.dispose();}
});
