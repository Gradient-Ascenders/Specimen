import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {CollisionHit,CollisionLayer,CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {KinematicBody} from '../src/physics/KinematicBody.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';

const STEP=1/60;

test('observation furniture blocks real movement and Bob can jump onto the worktop',()=>{
  const scene=new ContainmentLevelScene(()=>{}),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);surfaces.registerAll(scene.collisionMeshes);
  const body=new KinematicBody({world,surfaces,initialPosition:new THREE.Vector3(-10.7,97.96,129.1)});
  const left=new THREE.Vector3(-1,0,0),still=new THREE.Vector3();
  try{
    for(let frame=0;frame<120;frame++)body.update(STEP,left);
    assert.ok(body.position.x>-11.35,'The chair must block walking through its seat/back.');

    body.teleport(new THREE.Vector3(-10.8,97.96,128.25));
    for(let frame=0;frame<10;frame++)body.update(STEP,still);
    for(let frame=0;frame<24;frame++)body.update(STEP,left,{pressed:frame===0,held:true,released:false});
    body.update(STEP,left,{pressed:false,held:false,released:true});
    let landed=false;
    for(let frame=0;frame<240;frame++){
      body.update(STEP,body.position.x> -12.75?left:still);
      if(body.grounded&&body.supportColliderName==='room-5-prop-operator-worktop'&&body.position.x< -12.65){
        landed=true;break;
      }
    }
    assert.equal(landed,true,'A charged jump must land on the solid tabletop.');
    // Ground support may retain the normal 8 cm probe gap plus the skin.
    assert.ok(body.position.y-body.radiusMetres>=98.43&&body.position.y-body.radiusMetres<=98.53);

    // Support comes from the actual solid props; these are not top-only
    // platforms that still allow the player to pass through their sides.
    for(const [name,at,top] of [
      ['equipment-cabinet',[-6.75,100.6,130.8],99.33],
      ['operator-chair-back',[-11.65,100.1,129.1],98.64],
    ] as const){
      body.teleport(new THREE.Vector3(...at));
      for(let frame=0;frame<120;frame++)body.update(STEP,still);
      assert.equal(body.supportColliderName,`room-5-prop-${name}`);
      assert.ok(Math.abs(body.position.y-body.radiusMetres-top)<.09);
    }
  }finally{scene.dispose();world.clear();surfaces.clear();}
});

test('solid props leave the release-button approach and the scripted Goop escape corridor clear',()=>{
  const scene=new ContainmentLevelScene(()=>{}),world=new CollisionWorld(),hit=new CollisionHit();
  world.registerAll(scene.collisionMeshes);
  try{
    assert.equal(world.sweepSphere(new THREE.Vector3(-10,97.96,127),new THREE.Vector3(0,0,3.5),.45,hit,CollisionLayer.Movement),false);
    // The last short approach still reaches the original interaction collider.
    assert.equal(world.sweepSphere(new THREE.Vector3(-10,97.96,130.4),new THREE.Vector3(0,0,.3),.45,hit,CollisionLayer.Movement),true);
    assert.equal(hit.object?.name,scene.roomFive.releaseButton.name);
    assert.equal(world.sweepSphere(new THREE.Vector3(-3.6,75.21,106),new THREE.Vector3(0,0,8.5),.45,hit,CollisionLayer.Movement),false);
  }finally{scene.dispose();world.clear();}
});
