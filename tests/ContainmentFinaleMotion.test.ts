import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OBB} from 'three/addons/math/OBB.js';
import {FINALE_BOB_JUMPS,FINALE_JUMP_GRAVITY,FINALE_PLATFORM_LAUNCH,finaleJumpVelocity} from '../src/cinematics/ContainmentFinaleBobMotion.ts';
import {CONTAINMENT_FINALE_TIMING as T,FINALE_BOB_START,sampleContainmentFinale} from '../src/cinematics/ContainmentFinaleTimeline.ts';
import {ContainmentFinalePresentation} from '../src/cinematics/ContainmentFinalePresentation.ts';
import type {ContainmentFinaleOverlay} from '../src/cinematics/ContainmentFinaleOverlay.ts';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {ContainmentLevelController} from '../src/levels/ContainmentLevelController.ts';
import {CollisionWorld} from '../src/physics/CollisionWorld.ts';
import type {KinematicBody} from '../src/physics/KinematicBody.ts';
import {loadGoop} from './fixtures/GoopAssetFixture.ts';
import { finaleTime as F, FINALE_WARNING_EXTENSION_SECONDS } from '../src/cinematics/ContainmentFinaleTiming.ts';

test('Bob’s waiting beat follows the moving drone before cutting back to his launch',()=>{
  const frames=[43.1,44.5,46.1].map(t=>sampleContainmentFinale(F(t)));
  for(const frame of frames){
    assert.equal(frame.shot,'drone-lines-up');assert.equal(frame.bobAirborne,false);
    assert.deepEqual(frame.cameraTarget,frame.drone);
  }
  assert.ok(new THREE.Vector3().fromArray(frames[0].drone).distanceTo(new THREE.Vector3().fromArray(frames.at(-1)!.drone))>5);
  assert.equal(sampleContainmentFinale(F(46.5)).shot,'platform-launch');
});
import { FINALE_GOOP_DODGES } from '../src/cinematics/ContainmentFinaleCombat.ts';

test('Bob jumps with gravity, charges on support, lands on real supports, and never teleports between phases',()=>{
  for(const jump of FINALE_BOB_JUMPS){
    const middle=(jump.start+jump.end)/2,h=.001;
    const p=sampleContainmentFinale(middle).bob,before=sampleContainmentFinale(middle-h).bob,after=sampleContainmentFinale(middle+h).bob;
    assert.ok(Math.abs((after[1]-2*p[1]+before[1])/(h*h)+FINALE_JUMP_GRAVITY)<1e-5,jump.id);
    const velocity=finaleJumpVelocity(jump,middle);
    for(const axis of [0,1,2]) assert.ok(Math.abs((after[axis]-before[axis])/(2*h)-velocity[axis])<1e-6,jump.id);
    assert.equal(sampleContainmentFinale(middle).bobAirborne,true);
    if(jump.chargeStart<jump.start){const frame=sampleContainmentFinale((jump.chargeStart+jump.start)/2);assert.equal(frame.bobCharging,true);assert.ok(frame.bobCharge>0);assert.equal(frame.bobAirborne,false);}
    for(const t of [jump.start,jump.end]) assert.ok(new THREE.Vector3().fromArray(sampleContainmentFinale(t-.00001).bob)
      .distanceTo(new THREE.Vector3().fromArray(sampleContainmentFinale(t+.00001).bob))<.001,jump.id+' has a position discontinuity');
  }
  for(const t of [F(72.2),F(74.3)]){
    const h=.001,a=sampleContainmentFinale(t-h).bob,b=sampleContainmentFinale(t).bob,c=sampleContainmentFinale(t+h).bob;
    assert.ok(Math.hypot((c[0]-a[0])/(2*h),(c[2]-a[2])/(2*h))>1,'No stop at intermediate running waypoints.');
    for(const axis of [0,2]) assert.ok(Math.abs((c[axis]-b[axis])/h-(b[axis]-a[axis])/h)<.01);
  }
});

test('the drone establishes the platform opening before Bob reacts; scan results are revealed only after completion',()=>{
  const wall=sampleContainmentFinale(F(35));
  assert.equal(wall.shot,'drone-near-platform');assert.ok(wall.seconds<T.bobNotices);
  assert.ok(Math.hypot(wall.drone[0]+6,wall.drone[2]-124.7)<6);
  assert.equal(sampleContainmentFinale(T.scanBobComplete-.001).scanStage,'scanning');
  assert.equal(sampleContainmentFinale(T.scanBobComplete).scanStage,'threat');
  assert.equal(sampleContainmentFinale(T.scanGoopComplete-.001).scanStage,'scanning');
  assert.equal(sampleContainmentFinale(T.scanGoopComplete).scanStage,'threat');
  assert.equal(sampleContainmentFinale(T.terminate).scanStage,'terminate');
  assert.ok(T.terminate-T.scanGoopComplete>=.9);assert.ok(T.combat-T.terminate>=.8);
});

test('outgoing jumps clear the platform edges before descending through their height',()=>{
  for(const [id,minX,maxX,minZ,maxZ,top] of [
    ['drone-jump',-12,-7,119.5,123.5,95.75],['floor-jump',-3.18,1.82,113.402,117.902,81.082],
  ] as const){
    const jump=FINALE_BOB_JUMPS.find(j=>j.id===id)!;
    for(let t=jump.start;t<jump.end;t+=.005){
      const p=sampleContainmentFinale(t).bob;
      if(p[0]+.6>minX&&p[0]-.6<maxX&&p[2]+.6>minZ&&p[2]-.6<maxZ)
        assert.ok(p[1]-.45>=top-.002,id+' must not fall through the departure platform.');
    }
  }
});

test('the drone jump starts on the real platform with no wall-adhesion phase or hidden wall jump',()=>{
  assert.equal(FINALE_BOB_JUMPS.some(jump=>jump.wallLanding||jump.id==='wall-jump'),false);
  const jump=FINALE_BOB_JUMPS.find(jump=>jump.id==='drone-jump')!;
  assert.deepEqual(jump.from,FINALE_PLATFORM_LAUNCH);
  for(let t=F(39.25);t<jump.start;t+=.005){
    const f=sampleContainmentFinale(t),p=f.bob;
    assert.equal(f.bobAttached,false);assert.equal(f.bobAirborne,false);
    assert.ok(Math.abs(p[1]-96.21)<1e-10);
    assert.ok(p[0]-.45>=-12&&p[0]+.45<=-7&&p[2]-.45>=119.5&&p[2]+.45<=123.5);
  }
  assert.ok(Math.hypot(jump.to[0]-jump.from[0],jump.to[2]-jump.from[2])<5);
});

test('the debug preview shuts down the real room and finishes with exactly one Level 2 completion',()=>{
  const world=new ContainmentLevelScene(()=>{}),collisions=new CollisionWorld();
  const body={position:new THREE.Vector3(),radiusMetres:.45,recoverAt(p:THREE.Vector3){this.position.copy(p);},clearMotionState(){}};
  const controller=new ContainmentLevelController({scene:world,collisionWorld:collisions,body:body as unknown as KinematicBody,requestDeath:()=>false});
  let completions=0;controller.events.on('completed',e=>{assert.equal(e.nextLevelId,'level-2');completions++;});
  try{
    assert.equal(controller.beginEndingForDebug(),true);assert.equal(controller.state,'completing');assert.equal(controller.activeRoomId,5);
    assert.deepEqual(body.position.toArray(),FINALE_BOB_START);assert.equal(controller.beginEndingForDebug(),false);
    assert.deepEqual(world.lightingDiagnostics.visibleRoomIds,[5],'The preview must not retain lights from the entry/checkpoint room.');
    assert.ok(world.roomFive.lasers.hazards.every(h=>!h.enabled));
    assert.equal(world.root.getObjectByName('room-5-soluble-composite-door-corrosion-marker'),undefined);
    controller.update(T.end);controller.skipEnding();controller.update(T.end);assert.equal(completions,1);
  }finally{controller.dispose();collisions.clear();world.dispose();}
});

test('real Bob has platform charge, launch and landing poses; paused rendering does not advance acting; Goop expressions reset',async()=>{
  const world=new ContainmentLevelScene(()=>{}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();scene.add(world.root);
  const bytes=await readFile(new URL('../assets/characters/bob/bob-authored.glb',import.meta.url));
  await world.bob.prepare(async()=> (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
  await world.roomFive.goopPresentation.prepare(loadGoop);
  const overlay={render(){},hide(){}} as unknown as ContainmentFinaleOverlay;
  const film=new ContainmentFinalePresentation({scene,world,camera,overlay,cue(){},openDoor(){}});
  const body=world.bob.root.getObjectByName('Bob-Body') as THREE.Mesh;
  const eye=world.roomFive.goopPresentation.root.getObjectByName('Goop-Eye-Left') as THREE.Mesh;
  const goopBody=world.roomFive.goopPresentation.root.getObjectByName('Goop-Body') as THREE.Mesh;
  const hatchParts:{mesh:THREE.Mesh;instance?:number;bounds:THREE.Box3}[]=[];
  world.roomFive.art.panelPivots.front.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    object.geometry.computeBoundingBox();
    if(object instanceof THREE.InstancedMesh)for(let i=0;i<object.count;i++)hatchParts.push({mesh:object,instance:i,bounds:object.geometry.boundingBox!});
    else hatchParts.push({mesh:object,bounds:object.geometry.boundingBox!});
  });
  const hatchTransform=new THREE.Matrix4(),hatchInstance=new THREE.Matrix4(),hatchBox=new OBB(),goopEnvelope=new THREE.Box3();
  const morph=(name:string)=>body.morphTargetInfluences![body.morphTargetDictionary![name]];
  try{
    for(const job of film.preparationJobs())await job.run();film.begin(new THREE.Vector3().fromArray(FINALE_BOB_START));
    for(let step=1;step<=Math.ceil(T.safeLanding*60)+12;step++){
      const t=step/60;film.fixedUpdate(t);film.render(t);
      if(t<12){
        scene.updateMatrixWorld(true);
        goopEnvelope.setFromObject(goopBody,true).expandByScalar(.12); // Full mesh, plus GPU gel displacement.
        for(const part of hatchParts){
          hatchTransform.copy(part.mesh.matrixWorld);
          if(part.instance!==undefined){(part.mesh as THREE.InstancedMesh).getMatrixAt(part.instance,hatchInstance);hatchTransform.multiply(hatchInstance);}
          hatchBox.fromBox3(part.bounds).applyMatrix4(hatchTransform);
          assert.equal(hatchBox.intersectsBox3(goopEnvelope),false,`The opening hatch must clear Goop’s full authored body at ${t.toFixed(3)} (${part.mesh.name}).`);
        }
      }
      for(const jump of FINALE_GOOP_DODGES){
        if(step===Math.round((jump.start+.08)*60)){
          assert.equal(world.roomFive.goopPresentation.diagnostics.grounded,false);
          assert.ok(world.roomFive.goopPresentation.diagnostics.stretch>.1,'Goop uses his real launch/airborne gel response.');
        }
        if(step===Math.round((jump.end+.08)*60))assert.ok(world.roomFive.goopPresentation.diagnostics.squash>.1,
          'Each Goop dodge lands with an authored gel compression.');
      }
      const beat=step-Math.round(FINALE_WARNING_EXTENSION_SECONDS*60);
      if(beat===2274)assert.ok(morph('squash')>.2,'Charge compresses Bob before takeoff.');
      if(beat===2283)assert.ok(morph('launch')>.3,'The ledge jump uses the authored launch morph.');
      if(beat===2300)assert.ok(morph('airborne')>.8);
      if(beat===2360)assert.ok(morph('squash')>.1,'The first platform receives an actual landing reaction.');
      if(beat===2670){assert.equal(sampleContainmentFinale(t).bobAttached,false);assert.equal(world.bob.diagnostics.grounded,1);}
      if(beat===2890)assert.ok(morph('squash')>.1,'The drone deck receives a landing.');
      if(beat===3450)assert.ok(morph('airborne')>.8,'Bob animates his descent after drone destruction.');
      if(beat===3510)assert.ok(morph('squash')>.1,'The rest platform absorbs a hard landing.');
      if(beat===3600)assert.ok(morph('airborne')>.8,'Bob actively jumps from the rest platform, rather than sliding off.');
    }
    film.render(F(65));assert.ok(eye.scale.y<1,'Goop has a softer relieved expression during the quiet beat.');
    const frozen=Array.from(body.morphTargetInfluences!);film.render(F(65));assert.deepEqual(body.morphTargetInfluences,frozen);
    for(let step=Math.round(F(65)*60)+1;step<=Math.round(F(79)*60);step++){
      const t=step/60;film.fixedUpdate(t);film.render(t);
      const beat=step-Math.round(FINALE_WARNING_EXTENSION_SECONDS*60);
      if(beat===4120){
        const frame=sampleContainmentFinale(t),towardCover=new THREE.Vector3(3.6,0,124.72-114.5).normalize();
        const facing=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),world.roomFive.goopPresentation.diagnostics.facingYawRadians);
        assert.equal(frame.shot,'goop-spots-vent');assert.ok(facing.dot(towardCover)>.9,'Goop must look at the actual cover before deciding to shoot.');
      }
      if(beat===4380||beat===4590){
        for(const p of [world.bob,world.roomFive.goopPresentation]){
          assert.ok(Math.cos(p.diagnostics.facingYawRadians)<-.9,'Running actors face forward, not back toward the pursuing drones.');
        }
      }
    }
    const lastShot=film.visuals.shots.find(shot=>shot.ductNearMiss)!;
    const shotStart=new THREE.Vector3().fromArray(lastShot.from),shotEnd=new THREE.Vector3().fromArray(lastShot.to);
    const direction=shotEnd.clone().sub(shotStart).normalize(),side=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();
    const shotRay=new THREE.Raycaster(),point=new THREE.Vector3(),offset=new THREE.Vector3();
    for(let i=0;i<=80;i++){
      const u=i/80,t=lastShot.t+lastShot.duration*u;film.fixedUpdate(t);film.render(t);scene.updateMatrixWorld(true);
      point.copy(shotStart).lerp(shotEnd,u).addScaledVector(direction,-.52);
      for(const [horizontal,vertical]of [[0,0],[.065,0],[-.065,0],[0,.065],[0,-.065]]){
        offset.copy(point).addScaledVector(side,horizontal);offset.y+=vertical;shotRay.set(offset,direction);shotRay.near=0;shotRay.far=1.04;
        assert.equal(shotRay.intersectObjects([world.bob.root,world.roomFive.goopPresentation.root],true).length,0,
          'The entire final tracer clears the real animated slime meshes, including Bob’s antenna.');
      }
    }
    film.reset();assert.equal(eye.scale.y,1);assert.equal(eye.position.y,0);
  }finally{film.dispose();world.dispose();}
});
