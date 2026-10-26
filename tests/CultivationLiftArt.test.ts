import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';

test('the authored lift depth pointer follows the real descent and reset, with retired dressing excluded',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),room=scene.roomFour;
  try{
    const deck=room.root.getObjectByName('room-4-lift-floor') as THREE.Mesh;
    const geometry=deck.geometry,metadata=JSON.stringify(deck.userData),pointer=scene.elevatorArt.depthPointer;
    assert.equal(pointer.parent,deck);
    assert.ok(pointer.children.some(mesh=>mesh.name.includes('Depth')||mesh.name.includes('depth-pointer')));
    assert.equal(scene.elevatorArt.diagnostics.geometryCount,0,'Superseded procedural dressing is never prepared.');
    assert.equal(room.root.getObjectByName('room-4-art-shaft-0-0'),undefined);
    assert.equal(scene.blenderArt.diagnostics.newTextures,6);
    assert.equal(scene.blenderArt.diagnostics.textureBytes,24*1024*1024);
    const emitters:THREE.Mesh[]=[];
    room.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.endsWith('_LiftLamp'))emitters.push(o);});
    assert.equal(emitters.length,8,'Each original scrolling module retains its six practical strips.');
    const practical=emitters[0].material as THREE.MeshStandardMaterial;
    assert.equal(practical.color.getHex(),0xb7d8cd);assert.equal(practical.emissive.getHex(),0x9dcec1);
    assert.equal(practical.emissiveIntensity,.65);
    assert.ok(emitters.every(mesh=>mesh.material===practical));
    const lights:THREE.Light[]=[];scene.root.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});
    const lighting=JSON.stringify(lights.map(light=>[light.name,light.color.toArray(),light.intensity,light.castShadow]));
    const occupants=['bob','goop'].map((id,i)=>({id,radiusMetres:.45,position:room.root.localToWorld(new THREE.Vector3(i?2:-2,.66,9))}));
    scene.update(1.5,4,[occupants[0]]);
    assert.equal(room.controller.readModel.state,'waitingForSlimes');assert.ok(Math.abs(pointer.position.y)<1e-9);
    scene.update(1.5,4,occupants);scene.update(30,4,occupants);
    assert.equal(room.controller.readModel.state,'waveTwo');
    assert.ok(Math.abs(pointer.position.y+1.8*room.controller.progress)<1e-9);
    assert.ok(pointer.position.y<-.8&&pointer.position.y> -1.0);
    scene.reset();assert.ok(Math.abs(pointer.position.y)<1e-9);assert.equal(room.controller.progress,0);
    assert.equal(deck.geometry,geometry);assert.equal(JSON.stringify(deck.userData),metadata);
    assert.equal(JSON.stringify(lights.map(light=>[light.name,light.color.toArray(),light.intensity,light.castShadow])),lighting);
  }finally{scene.dispose();}
});

test('the lift export seals its deck and shaft while preserving the open lower passage',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),room=scene.roomFour;
  try{
    for(const root of [room.root,scene.roomFourGeometry,scene.roomFourEntranceGeometry])root.visible=true;
    scene.root.updateWorldMatrix(true,true);
    const rendered:THREE.Mesh[]=[];
    room.root.traverseVisible(o=>{
      if(o instanceof THREE.Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.visible&&!m.transparent))rendered.push(o);
    });
    const ray=(point:THREE.Vector3,direction:THREE.Vector3,far:number)=>new THREE.Raycaster(room.root.localToWorld(point),direction,0,far).intersectObjects(rendered,false);
    const deck=room.root.getObjectByName('room-4-lift-floor')!,deckMeshes=rendered.filter(mesh=>mesh.parent===deck);
    for(const x of [-4.8,-2.3,0,2.3,4.8])for(const z of [5.2,7.7,10,12.3,14.8]){
      const hits=new THREE.Raycaster(room.root.localToWorld(new THREE.Vector3(x,1,z)),new THREE.Vector3(0,-1,0),0,2).intersectObjects(deckMeshes,false);
      assert.ok(hits.length>0,'The deck edge and inset plate joints retain opaque backing.');
      assert.ok(hits[0].point.y>=.199&&hits[0].point.y<=.241,'Retain the original deck height, including its recessed plate joints.');
    }
    for(const y of [.5,2,5,10,20,35,43])for(const z of [5.5,7.5,10,13,14.6])for(const side of [-1,1])
      assert.ok(ray(new THREE.Vector3(0,y,z),new THREE.Vector3(side,0,0),6).length>0,'Continuous backing seals the moving shaft bays.');
    room.controller.restoreArrival();room.update(1/60,[]);scene.elevatorArt.update(room.controller.progress);
    room.root.updateWorldMatrix(true,true);
    for(const x of [-.9,0,.9])for(const y of [.5,1.3,2.1])
      assert.equal(ray(new THREE.Vector3(x,y,14),new THREE.Vector3(0,0,1),1.6).length,0,'The fitted landing preserves the original clear vent opening.');
  }finally{scene.dispose();}
});
