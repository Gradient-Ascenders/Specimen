import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createAuthoredDissolveTarget} from '../src/abilities/DissolveTarget.ts';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {ColliderTransformMode,CollisionHit,CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {KinematicBody} from '../src/physics/KinematicBody.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';

test('Room 2 suspension beams block both slimes through release and reset',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry(),room=scene.roomTwo;
  world.registerAll(scene.collisionMeshes,undefined,ColliderTransformMode.Static);
  for(const mesh of scene.dynamicCollisionMeshes)world.setTransformMode(mesh,ColliderTransformMode.Dynamic);
  surfaces.registerAll(scene.collisionMeshes);
  const targets=room.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces)!);
  room.bindDissolveTargets(targets);
  const hit=new CollisionHit(),direction=new THREE.Vector3(2,0,0);
  const beams=room.blockDrops.map(drop=>room.root.getObjectByName(`${drop.id}-non-soluble-rope`) as THREE.Mesh);
  const cross=(beam:THREE.Mesh,y:number)=>{
    const origin=beam.getWorldPosition(new THREE.Vector3());origin.x-=1;origin.y=y;
    return world.sweepSphere(origin,direction,.2,hit)&&hit.object===beam;
  };
  try{
    for(const [i,beam] of beams.entries()){
      assert.ok(scene.collisionMeshes.includes(beam));assert.ok(scene.dynamicCollisionMeshes.includes(beam));
      assert.equal(surfaces.get(beam).adhesive,false);
      assert.ok(cross(beam,beam.getWorldPosition(new THREE.Vector3()).y));
      const landed=room.blockDrops[i].mesh.userData.landingPosition as number[];
      assert.equal(cross(beam,landed[1]+1.2),false,'no stale collision below the suspended platform');
    }
    for(const target of targets)target.advance(target.dissolveDurationSeconds);
    for(const dt of [.25,.45,.5]){
      room.update(dt,[]);
      for(const beam of beams)assert.ok(cross(beam,beam.getWorldPosition(new THREE.Vector3()).y));
    }
    for(const [i,beam] of beams.entries())for(const slime of ['bob','goop']){
      const deck=room.blockDrops[i].mesh,centre=deck.getWorldPosition(new THREE.Vector3());
      const body=new KinematicBody({world,surfaces,initialPosition:centre.clone().add(new THREE.Vector3(-1.1,.76,0)),
        config:{adhesionEnabled:slime==='bob',reboundEnabled:false,chargedJumpEnabled:slime==='bob'}});
      assert.equal(body.supportCollider,deck);
      for(let tick=0;tick<60;tick++)body.update(1/60,new THREE.Vector3(1,0,0));
      assert.ok(body.position.x<centre.x-.54,`${slime} must stop at ${beam.name}`);
      assert.equal(body.supportCollider,deck,'walking into the beam keeps the body on its platform');
    }
    for(const target of targets)target.reset();scene.reset();
    for(const [i,beam] of beams.entries()){
      assert.ok(cross(beam,beam.getWorldPosition(new THREE.Vector3()).y));
      const landed=room.blockDrops[i].mesh.userData.landingPosition as number[];
      assert.equal(cross(beam,landed[1]+1.2),false,'reset removes the extended lower collision');
    }
  }finally{for(const target of targets)target.dispose();scene.dispose();world.clear();surfaces.clear();}
});
