import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';
import {CollisionWorld,CollisionHit,CollisionLayer} from '../src/physics/CollisionWorld.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {LevelTwoRoomThreeGreybox} from '../src/levels/LevelTwoRoomThreeGreybox.ts';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {COVER_EQUIPMENT} from '../src/render/environment/cultivation/CultivationCoverEquipmentArt.ts';

test('the production Blender equipment preserves all eight cover colliders, sightlines and shadow hulls',()=>{
 const baseline=new LevelTwoRoomThreeGreybox(()=>{}),scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
 const room=scene.roomThree,art=scene.coverArt;
 scene.root.updateWorldMatrix(true,true);
 baseline.root.position.copy(room.root.getWorldPosition(new THREE.Vector3()));baseline.root.updateWorldMatrix(true,true);
 try{
  assert.equal(COVER_EQUIPMENT.length,8);
  assert.equal(new Set(COVER_EQUIPMENT.map(item=>item.identity)).size,8);
  assert.equal(room.collisionMeshes.filter(mesh=>mesh.userData.coverRole).length,8);
  for(const item of COVER_EQUIPMENT){
   const before=baseline.root.getObjectByName(item.name) as THREE.Mesh,after=room.root.getObjectByName(item.name) as THREE.Mesh;
   assert.deepEqual(after.userData,before.userData);
   assert.deepEqual(after.position.toArray(),before.position.toArray());
   assert.deepEqual(Array.from(after.geometry.getAttribute('position').array),Array.from(before.geometry.getAttribute('position').array));
   assert.deepEqual(new THREE.Box3().setFromObject(after),new THREE.Box3().setFromObject(before));
   const oldWorld=new CollisionWorld(),newWorld=new CollisionWorld();oldWorld.register(before);newWorld.register(after);
   try{
    for(const axis of ['x','z'] as const)for(const mask of [CollisionLayer.LineOfSight,CollisionLayer.Movement]){
     const origin=before.getWorldPosition(new THREE.Vector3());origin.y=.46;
     origin[axis]-=10;const displacement=new THREE.Vector3();displacement[axis]=20;
     const oldHit=new CollisionHit(),newHit=new CollisionHit(),radius=mask===CollisionLayer.LineOfSight?.001:.46;
     assert.equal(oldWorld.sweepSphere(origin,displacement,radius,oldHit,mask),true);
     assert.equal(newWorld.sweepSphere(origin,displacement,radius,newHit,mask),true);
     assert.equal(newHit.fraction,oldHit.fraction);
     assert.ok(newHit.object===after,'the same gameplay collider owns the contact');
    }
   }finally{oldWorld.clear();newWorld.clear();}
   assert.equal((after.material as THREE.Material).visible,false);
   const size=art.propBounds.get(item.name)!.getSize(new THREE.Vector3());
   assert.ok(size.x>=item.size[0]-1e-6&&size.y>=item.size[1]-1e-6,'metric envelopes tolerate only Float32 rounding');
  }
  const batches=room.root.children.filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&o.userData.blenderBatch&&o.name.includes('_cover_'));
  assert.ok(batches.length>6&&batches.length<=24,'cover detail retains room/cell batching');
  assert.ok(new Set(batches.map(o=>o.material)).size<batches.length,'spatial batches borrow shared finishes');
  assert.equal(art.diagnostics.propCount,8);assert.equal(art.diagnostics.newTextures,2);
  let hullTriangles=0;
  art.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.shadowHull){
   assert.equal(o.castShadow,true);assert.equal((o.material as THREE.Material).colorWrite,false);
   hullTriangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;
  }});
  assert.equal(hullTriangles,8*12,'the original stable cover envelopes remain the shadow casters');
  let disposedTextures=0,disposedMaterial=0;
  for(const texture of art.textures)texture.addEventListener('dispose',()=>disposedTextures++);
  art.material.addEventListener('dispose',()=>disposedMaterial++);
  scene.reset();scene.dispose();scene.dispose();
  assert.equal(disposedTextures,2);assert.equal(disposedMaterial,1);
 }finally{scene.dispose();baseline.dispose();}
});
