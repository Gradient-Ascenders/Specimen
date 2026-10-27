import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {BlackoutConnectorAtmosphere} from '../src/render/environment/blackout/BlackoutConnectorAtmosphere.ts';
import {BlackoutConnectorCamera} from '../src/levels/BlackoutConnectorCamera.ts';
import {BlackoutMaintenanceBay} from '../src/levels/BlackoutMaintenanceBay.ts';
import {CameraRig} from '../src/render/CameraRig.ts';
import {CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {gameplayAudioEvents} from '../src/audio/GameplayAudioEvents.ts';
import {maintenanceMaps} from './helpers/BlackoutMaintenanceMapData.ts';

test('connector cues require natural crossings, play once, and reset without sounding a teleport',()=>{
  const atmosphere=new BlackoutConnectorAtmosphere(),cues:unknown[]=[];
  const off=gameplayAudioEvents.on('cue',cue=>cues.push(cue));
  try{
    atmosphere.update(.1,{x:6,y:.46,z:60.4});atmosphere.update(.1,{x:6,y:.46,z:60.6});
    assert.ok(atmosphere.lightIntensity(0)<1,'the fitting behind the player fails');
    atmosphere.update(.8,{x:6,y:.46,z:61});assert.equal(cues.length,1);
    atmosphere.update(3,{x:6,y:.46,z:61});assert.ok(atmosphere.lightIntensity(0)>4);
    atmosphere.update(.1,{x:6,y:.46,z:60.4});atmosphere.update(1,{x:6,y:.46,z:60.8});assert.equal(cues.length,1);
    atmosphere.update(.1,{x:-8.7,y:.46,z:61.5});atmosphere.update(.1,{x:-8.9,y:.46,z:61.5});assert.equal(cues.length,2);
    atmosphere.reset();atmosphere.update(.1,{x:6,y:.46,z:55});atmosphere.update(1,{x:6,y:.46,z:68});
    assert.equal(cues.length,2,'recovery cannot trigger a traversal scare');
    assert.ok(atmosphere.lightIntensity(2)<.4,'third fixture stays nearly dead');
  }finally{off();}
});

test('Volt vent camera stays inside flat, turning and rising bores for all orbit headings',()=>{
  const bay=new BlackoutMaintenanceBay(maintenanceMaps),world=new CollisionWorld();world.registerAll(bay.collisionMeshes);
  const target={position:new THREE.Vector3(),previousPosition:new THREE.Vector3(),velocity:new THREE.Vector3(),
    gameplayUp:new THREE.Vector3(0,1,0),grounded:true,attached:false};
  const resolver=new BlackoutConnectorCamera(target),rig=new CameraRig();rig.setFollowTarget(target,world);
  try{
    for(const pose of [[-6,.46,57],[-8,.46,61.5],[-15.8,.46,61.5],[-16,1.7,71],[-16,2.7,78]]){
      target.position.set(...pose as [number,number,number]);target.previousPosition.copy(target.position);
      const context=resolver.resolve(true)!;assert.ok(context);assert.equal(resolver.resolve(false),undefined);
      rig.setContextualCamera(context);
      for(let heading=0;heading<8;heading++){
        rig.setGroundOrbitYawRadians(heading*Math.PI/4);
        for(let i=0;i<45;i++)rig.update(1,1/60);
        const p=rig.camera.position,{min,max}=context.profile.cameraBounds!;
        assert.ok(p.x>=min.x-.01&&p.x<=max.x+.01,`camera x ${p.x} at ${pose}`);
        assert.ok(p.z>=min.z-.01&&p.z<=max.z+.01,`camera z ${p.z} at ${pose}`);
        assert.ok(p.y>0&&p.y<max.y,`camera y ${p.y} at ${pose}`);
        if(p.z>=63){const floor=(p.z-63)*2.58/17;assert.ok(p.y>=floor&&p.y<floor+2.2,'inclined roof/floor stay authoritative');}
      }
    }
    target.position.set(-16,2.96,82);assert.equal(resolver.resolve(true),undefined,'outlet releases the camera');
  }finally{bay.dispose();world.clear();}
});
