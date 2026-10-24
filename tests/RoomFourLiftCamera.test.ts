import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {RoomFourGreybox} from '../src/levels/RoomFourGreybox.ts';
import {CollisionLayer,CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {CameraRig} from '../src/render/CameraRig.ts';
import {ContainmentArtResources} from '../src/render/environment/containment/ContainmentArtResources.ts';

const STEP=1/60;

test('the lift camera keeps the player visible and its near plane inside the shaft at every roof edge and orbit heading',()=>{
  const resources=new ContainmentArtResources(),room=new RoomFourGreybox(()=>{},resources),world=new CollisionWorld();
  world.registerAll(room.collisionMeshes);
  world.registerAll(room.cameraObstructionMeshes,CollisionLayer.CameraObstruction);
  const target={position:new THREE.Vector3(),previousPosition:new THREE.Vector3(),velocity:new THREE.Vector3(),
    gameplayUp:new THREE.Vector3(0,1,0),grounded:true,attached:false};
  const projected=new THREE.Vector3(),nearCorner=new THREE.Vector3(),lastCamera=new THREE.Vector3();
  try{
    for(const total of [0,25,44,48,49])for(let heading=0;heading<8;heading++){
      room.reset();room.elevator.begin();if(total)room.elevator.update(total,[]);
      const roof=room.elevatorPlatform.position.y+.25;
      target.position.set(9,roof+.46,85.5);target.previousPosition.copy(target.position);
      const rig=new CameraRig();rig.resize(1268,776);rig.setGroundOrbitYawRadians(heading*Math.PI/4);
      rig.setFollowTarget(target,world);
      rig.setContextualCamera(room.resolveLiftCamera({position:target.position,radiusMetres:.45}));
      for(let frame=0;frame<180;frame++)rig.update(1,STEP);
      lastCamera.copy(rig.camera.position);
      // Walk the perimeter at approximately normal movement speed, then return
      // to the centre. The upper poses stand on/above the real landing surface.
      for(const [x,z] of [[5.2,81.7],[12.8,81.7],[12.8,89.3],[5.2,89.3],[9,85.5]]){
        const from=target.position.clone();
        for(let frame=1;frame<=90;frame++){
          target.previousPosition.copy(target.position);
          target.position.set(THREE.MathUtils.lerp(from.x,x,frame/90),from.y,THREE.MathUtils.lerp(from.z,z,frame/90));
          target.velocity.subVectors(target.position,target.previousPosition).divideScalar(STEP);
          const authoritativePosition=target.position.toArray(),authoritativeVelocity=target.velocity.toArray();
          const before=rig.getDiagnostics();
          rig.setContextualCamera(room.resolveLiftCamera({position:target.position,radiusMetres:.45}));
          rig.update(1,STEP);
          assert.deepEqual(target.position.toArray(),authoritativePosition);
          assert.deepEqual(target.velocity.toArray(),authoritativeVelocity);
          projected.copy(target.position).project(rig.camera);
          const state=`${total}s, heading ${heading}, player ${target.position.toArray()}`;
          assert.ok(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95&&projected.z<1,`Player left the view: ${state}`);
          assert.ok(rig.getDiagnostics().focusPosition.y>roof+.22,`Focus sank into the deck: ${state}`);
          assert.ok(rig.currentFollowDistanceMetres>1,`Collapsed boom: ${state}`);
          const after=rig.getDiagnostics();
          if(total>=48)assert.ok(after.currentDistanceMetres>2.5,`Preserve a useful view at docking: ${state}`);
          // Solid machinery may still require an immediate collision retreat.
          // The shaft boundary itself should move continuously during walking.
          if([before,after].every(d=>!d.obstructed||d.obstructionName==='contextual-camera-bounds'))
            assert.ok(rig.camera.position.distanceTo(lastCamera)<.2+Math.abs(after.currentDistanceMetres-before.currentDistanceMetres),
              `Camera jumped at an edge: ${state}`);
          lastCamera.copy(rig.camera.position);
          // Test the actual near-plane corners, rather than just the eye point.
          for(const nx of [-1,1])for(const ny of [-1,1]){
            nearCorner.set(nx,ny,-1).unproject(rig.camera);
            assert.ok(nearCorner.x>2.7&&nearCorner.x<15.3&&nearCorner.z>79.7&&nearCorner.z<91.3&&
              nearCorner.y<78.75&&nearCorner.y>roof,`Near plane escaped the shaft: ${state}`);
          }
        }
      }
    }
  }finally{world.clear();room.dispose();resources.dispose();}
});
