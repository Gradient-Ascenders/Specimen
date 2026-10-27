import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';

for(const end of ['entry','exit'] as const)test(`the authored ${end} containment door seals both faces and follows its original upward slide and occupancy reset`,()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),door=scene.roomOneToTwoPassage[end==='entry'?'entryDoor':'exitDoor'];
  try{
    const collider=door.collisionMesh,geometry=collider.geometry;
    assert.equal(door.statusLight.visible,end==='exit');
    assert.equal(door.root.getObjectByName(`cultivation-room-1-to-2-lab-passage-${end}-status-housing`)!.visible,end==='exit');
    const skin=collider.children.filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&o.userData.blenderBatch);
    assert.ok(skin.length>=3);assert.equal(collider.matrixAutoUpdate,true);
    const metadata=structuredClone(collider.userData),closed=collider.position.clone();
    scene.root.updateWorldMatrix(true,true);
    for(const side of [-1,1])for(const x of [-1.7,0,1.7])for(const y of [-1.9,0,1.9]){
      const from=collider.localToWorld(new THREE.Vector3(x,y,side));
      assert.ok(new THREE.Raycaster(from,new THREE.Vector3(0,0,-side),0,1.2).intersectObjects(skin,false).length,
        'the actual exported front/back surfaces cover the closed leaf');
    }
    const centre=door.root.localToWorld(new THREE.Vector3(0,1,.0));
    door.update(.24,[{id:'goop',position:centre,radiusMetres:.45}]);
    scene.root.updateWorldMatrix(true,true);
    assert.equal(door.state,'opening');assert.ok(collider.position.y>closed.y);
    assert.equal(collider.position.x,closed.x);assert.equal(collider.position.z,closed.z);
    for(const mesh of skin)assert.equal(mesh.parent,collider);
    door.update(1,[{id:'goop',position:centre,radiusMetres:.45}]);
    assert.equal(door.state,'open');assert.ok(collider.position.y-closed.y>4.6);
    door.update(.1,[]);assert.equal(door.state,'closing');
    door.update(.1,[{id:'bob',position:centre,radiusMetres:.45}]);assert.equal(door.state,'open','either persistent body keeps the existing proximity opening');
    scene.reset();assert.equal(door.state,'closed');assert.deepEqual(collider.position,closed);
    door.setLocked(true);door.setLocked(false);assert.equal(door.statusLight.visible,end==='exit');
    assert.equal(collider.geometry,geometry);assert.equal(collider.userData.doorId,metadata.doorId);
    assert.deepEqual(collider.userData.sizeMetres,metadata.sizeMetres);
  }finally{scene.dispose();}
});
