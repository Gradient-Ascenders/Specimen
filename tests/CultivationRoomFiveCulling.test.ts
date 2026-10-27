import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {CultivationRoomFiveCulling} from '../src/render/environment/cultivation/CultivationRoomFiveCulling.ts';

test('chamber/sewer render scopes preserve portal views, transforms, lights and original visibility',()=>{
  const root=new THREE.Group();root.position.set(64,0,242);
  const make=(x:number,y:number,z:number,staticBatch=true)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());
    mesh.position.set(x,y,z);mesh.userData.blenderBatch=staticBatch;mesh.updateMatrix();mesh.matrixAutoUpdate=false;root.add(mesh);return mesh;
  };
  const chamber=make(0,20,40),sewer=make(40,-8,40),portal=make(28,0,16),hidden=make(0,20,41),mechanism=make(0,20,42,false);
  hidden.visible=false;const light=new THREE.PointLight();root.add(light);
  const culling=new CultivationRoomFiveCulling(root),camera=new THREE.PerspectiveCamera();
  const skin=new THREE.Group(),lodHidden=new THREE.Object3D();lodHidden.visible=false;skin.add(lodHidden);
  culling.registerChamber(skin);assert.throws(()=>culling.registerChamber(light),/light owners/);
  const position=(x:number,y:number,z:number)=>root.localToWorld(new THREE.Vector3(x,y,z));
  camera.position.copy(position(40,-8,30));culling.prepare(camera,position(40,-9,35));
  assert.equal(chamber.visible,false);assert.equal(sewer.visible,true);assert.equal(hidden.visible,false);
  assert.equal(skin.visible,false);assert.equal(lodHidden.visible,false);
  assert.equal(mechanism.visible,true);assert.equal(light.visible,true);assert.equal(portal.visible,true);
  culling.prepare(camera,position(40,-9,35),false);
  assert.equal(chamber.visible,true);assert.equal(skin.visible,true);assert.equal(culling.diagnostics.culled,0,'cinematic borrowing bypasses sector culling');
  culling.restore();assert.equal(chamber.visible,true);assert.equal(hidden.visible,false);
  assert.equal(skin.visible,true);assert.equal(lodHidden.visible,false);
  camera.position.copy(position(0,13,30));culling.prepare(camera,position(0,10,35));
  assert.equal(sewer.visible,false);assert.equal(chamber.visible,true);
  // Camera and player on opposite sides, at the fork or on the return route
  // must retain both sectors. prepare also repairs a prior interrupted scope.
  culling.prepare(camera,position(40,-9,35));assert.equal(sewer.visible,true);
  for(const p of [[40,-2,18],[30,-8,70],[40,-8,140]]){
    camera.position.copy(position(...p as [number,number,number]));culling.prepare(camera,camera.position);
    assert.equal(chamber.visible,true);assert.equal(sewer.visible,true);assert.equal(culling.diagnostics.sector,'transition');
  }
  culling.restore();assert.equal(hidden.visible,false);assert.equal(root.children.length,6);
  for(const mesh of [chamber,sewer,portal,hidden,mechanism]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}
});
