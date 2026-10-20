import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationVentArrival, CULTIVATION_VENT_ARRIVAL as A } from '../src/cinematics/CultivationVentArrival.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { PersistentSlimePair } from '../src/slimes/PersistentSlimePair.ts';
import { SlimeManager } from '../src/slimes/SlimeManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import type { MovementEvents } from '../src/physics/MovementEvents.ts';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BobCharacterPresentation } from '../src/render/bob/BobCharacterPresentation.ts';
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';

for(const active of ['bob','goop'] as const)test(`both real bodies fall through the authored vent and land safely when controlling ${active}; floor recovery stays unchanged`,()=>{
  const preview=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(preview.collisionMeshes);
  const b=preview.copyRoomSpawnPosition(1,'bob',new THREE.Vector3()),g=preview.copyRoomSpawnPosition(1,'goop',new THREE.Vector3());
  const bobEvents=new EventBus<MovementEvents>(),goopEvents=new EventBus<MovementEvents>();
  const bob=new KinematicBody({world,surfaces,initialPosition:b,events:bobEvents}),goop=new KinematicBody({world,surfaces,initialPosition:g,events:goopEvents,config:{adhesionEnabled:false,reboundEnabled:false,chargedJumpEnabled:false}});
  const manager=new SlimeManager();manager.registerBody('bob',bob);manager.registerBody('goop',goop);manager.unlock('bob');manager.unlock('goop');manager.activate(active);
  const pair=new PersistentSlimePair({manager,bobBody:bob,goopBody:goop,bobSpawnPosition:b,goopSpawnPosition:g,initialActiveSlimeId:active});
  const arrival=new CultivationVentArrival(),zero=new THREE.Vector3(),camera=new THREE.PerspectiveCamera(48,16/9,.1,200);
  const landings={bob:0,goop:0};bobEvents.on('landed',()=>landings.bob++);goopEvents.on('landed',()=>landings.goop++);
  try{
    arrival.begin(preview.roomOne.root,bob,goop);
    assert.equal(arrival.active,true);assert.equal(manager.activeSlimeId,active);
    assert.equal(bob.position.y,A.bob.y);assert.equal(goop.position.y,A.goop.y);
    const initialBob=bob.position.y,initialGoop=goop.position.y;
    let completions=0,frames=0;
    for(let step=1;step<300&&arrival.active;step++){
      bob.update(1/60,zero);goop.update(1/60,zero);
      if(arrival.update(1/60,bob,goop))completions++;
      camera.position.set(53,3,-1);camera.lookAt(53,1,4);camera.updateMatrixWorld(true);
      arrival.present(camera,1,bob.position,goop.position);
      assert.ok(camera.position.y<19.7&&camera.position.z<12.8,'The camera stays below the ceiling and clear of the suspended platform.');
      if(step<90)for(const body of [bob,goop]){
        const p=new THREE.Vector3().copy(body.position).project(camera);
        assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,'Both falling actors stay framed.');
      }
      assert.ok(bob.position.y>.64&&goop.position.y>.64,'Neither body falls through the safe entry floor.');
      if(step===1){assert.ok(bob.position.y<initialBob&&goop.position.y<initialGoop);}
      frames=step;
    }
    assert.equal(completions,1);assert.equal(arrival.active,false);assert.ok(frames>120&&frames<240);
    assert.ok(landings.bob>0&&landings.goop>0,'Normal physics emits both landing reactions/audio events.');
    assert.ok(bob.grounded&&goop.grounded);assert.equal(preview.resolveRoomId(bob.position),1);
    assert.equal(preview.goopSpeech.activeConversation,undefined,'Gravity alone is not player movement.');
    pair.restoreRecoveryState();assert.deepEqual(new THREE.Vector3().copy(bob.position).toArray(),b.toArray());
    assert.deepEqual(new THREE.Vector3().copy(goop.position).toArray(),g.toArray());
    assert.equal(arrival.update(1,bob,goop),false,'No second completion or automatic replay after a checkpoint recovery.');
    arrival.begin(preview.roomOne.root,bob,goop);arrival.cancel();assert.equal(arrival.active,false);
  }finally{manager.dispose();preview.dispose();world.clear();bobEvents.clear();goopEvents.clear();}
});

test('vent arrival camera freezes on pause, restores the follow pose continuously, and allocates no scene resources',()=>{
  const root=new THREE.Group(),bob={teleport(){},applyKnockback(){},grounded:true} as unknown as KinematicBody;
  const goop=bob,arrival=new CultivationVentArrival(),camera=new THREE.PerspectiveCamera(48,16/9,.1,200),p={x:-10,y:.66,z:4};
  root.position.x=64;arrival.begin(root,bob,goop);
  arrival.update(A.minimumSeconds,bob,goop);assert.equal(arrival.active,true);
  const followPosition=new THREE.Vector3(53,3,-1),followOrientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.3,0));
  const render=()=>{camera.position.copy(followPosition);camera.quaternion.copy(followOrientation);camera.updateMatrixWorld(true);arrival.present(camera,1,{...p,x:53},{...p,x:55});};
  render();const position=camera.position.clone(),orientation=camera.quaternion.clone();render();
  assert.deepEqual(camera.position,position);assert.deepEqual(camera.quaternion.toArray(),orientation.toArray());
  assert.equal(arrival.seconds,A.minimumSeconds,'Rendering does not advance the movie.');
  arrival.update(A.cameraReturnSeconds-.0001,bob,goop);render();
  assert.ok(camera.position.distanceTo(followPosition)<1e-5);assert.ok(Math.abs(camera.quaternion.dot(followOrientation))>1-1e-8);
  assert.equal(arrival.update(.0002,bob,goop),true);assert.equal(root.children.length,0);
  arrival.begin(root,bob,goop);for(const dt of [-1,NaN,Infinity])assert.throws(()=>arrival.update(dt,bob,goop),/timestep/);
});

test('the loaded Bob and Goop models use their airborne and landing poses throughout the physical vent drop',async()=>{
  const preview=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(preview.collisionMeshes);surfaces.registerAll(preview.collisionMeshes);
  const events=[new EventBus<MovementEvents>(),new EventBus<MovementEvents>()],zero=new THREE.Vector3();
  const bodies=[new KinematicBody({world,surfaces,initialPosition:zero,events:events[0]}),
    new KinematicBody({world,surfaces,initialPosition:zero,events:events[1],config:{adhesionEnabled:false,reboundEnabled:false,chargedJumpEnabled:false}})];
  const bob=new BobCharacterPresentation(),goop=new GoopCharacterPresentation(),arrival=new CultivationVentArrival();
  try{
    const bytes=await readFile(new URL('../assets/characters/bob/bob-authored.glb',import.meta.url));
    await bob.prepare(async()=>(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
    await goop.prepare(loadGoop);
    events[0].on('landed',e=>bob.onLanding(bodies[0].groundNormal,e.impactSpeedMetresPerSecond));
    events[1].on('landed',e=>goop.onLanding(bodies[1].groundNormal,e.impactSpeedMetresPerSecond));
    const actors=[bob,goop],landedPose=[false,false];
    arrival.begin(preview.roomOne.root,bodies[0],bodies[1]);
    for(let step=0;step<180;step++){
      for(let i=0;i<2;i++){
        const body=bodies[i],actor=actors[i];body.update(1/60,zero);actor.setPosition(body.position);
        actor.update(1/60,{velocityWorld:body.velocity,locomotionPositionWorld:body.position,movementIntentWorld:zero,
          maximumLocomotionSpeedMetresPerSecond:5.5,surfaceNormalWorld:body.groundNormal,gameplayUpWorld:body.gameplayUp,
          grounded:body.grounded,attached:body.attached,chargingJump:body.chargingJump,jumpCharge:body.chargeFraction,
          contactCount:body.contactsThisStep,contactNormalWorld:body.lastContactNormal,
          contactSpeedMetresPerSecond:body.lastContactImpactSpeedMetresPerSecond,contactName:body.lastContactName,
          contactSurfaceTag:body.lastContactSurfaceTag,landedThisStep:body.landedThisStep});
        actor.present();actor.root.updateMatrixWorld(true);
        assert.equal(Boolean(actor.diagnostics.grounded),body.grounded);
        landedPose[i] ||= actor.diagnostics.squash>.15;
        const mesh=actor.root.getObjectByName(i===0?'Bob-Body':'Goop-Body') as THREE.Mesh;
        assert.equal(mesh.visible,true);assert.equal((mesh.material as THREE.Material).opacity,1);
        assert.ok(mesh.matrixWorld.elements.every(Number.isFinite));
        assert.ok(mesh.getVertexPosition(100,new THREE.Vector3()).toArray().every(Number.isFinite));
      }
      arrival.update(1/60,bodies[0],bodies[1]);
    }
    assert.deepEqual(landedPose,[true,true]);assert.equal(arrival.active,false);
  }finally{bob.dispose();goop.dispose();preview.dispose();world.clear();surfaces.clear();events.forEach(e=>e.clear());}
});
