import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';

const layout=JSON.parse(readFileSync(new URL('../assets/environments/cultivation/authoring-layout.json',import.meta.url),'utf8'))['room-3'];

test('extraction equipment keeps opaque cover from both routes and all details inside its original collider envelopes',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),root=scene.roomThree.root;
  try{
    const coverMeshes:THREE.Mesh[]=[];
    root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.blenderBatch&&o.name.includes('_cover_'))coverMeshes.push(o);});
    assert.ok(coverMeshes.length>0);
    root.visible=true;scene.root.updateWorldMatrix(true,true);
    const inverse=root.matrixWorld.clone().invert();
    const envelopes=layout.extractionCovers.map((s:{position:number[];size:number[]})=>new THREE.Box3(
      new THREE.Vector3(...s.position).addScaledVector(new THREE.Vector3(...s.size),-.5),
      new THREE.Vector3(...s.position).addScaledVector(new THREE.Vector3(...s.size),.5)));
    const tolerantEnvelopes=envelopes.map((box:THREE.Box3)=>box.clone().expandByScalar(.00002));
    for(const mesh of coverMeshes){
      assert.equal(mesh.userData.shadowProxyReceiver,true);
      assert.equal((mesh.material as THREE.Material).side,THREE.FrontSide);
      const positions=mesh.geometry.getAttribute('position'),frame=inverse.clone().multiply(mesh.matrixWorld);
      for(let i=0;i<positions.count;i++){
        const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(frame);
        assert.ok(tolerantEnvelopes.some((box:THREE.Box3)=>box.containsPoint(p)),
          `cover detail outside original cover at ${p.toArray()}`);
      }
    }
    for(const [index,box] of envelopes.entries()){
      const centre=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
      for(const axis of [0,2])for(const side of [-1,1])for(const u of [-.42,0,.42])for(const v of [.10,.5,.90]){
        const across=axis===0?2:0,point=centre.clone();
        point.setComponent(axis,centre.getComponent(axis)+side*(size.getComponent(axis)/2+.1));
        point.setComponent(across,centre.getComponent(across)+size.getComponent(across)*u);point.y=box.min.y+size.y*v;
        const direction=new THREE.Vector3().setComponent(axis,-side);
        const ray=new THREE.Raycaster(root.localToWorld(point),direction,0,size.getComponent(axis)+.2);
        const hit=ray.intersectObjects(coverMeshes,false)[0];
        assert.ok(hit,`cover ${index}: missing opaque face ${axis}/${side}/${u}/${v}`);
        assert.ok(box.clone().expandByScalar(.00002).containsPoint(root.worldToLocal(hit.point.clone())));
      }
    }
    let hullTriangles=0;
    scene.coverArt.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.shadowHull)
      hullTriangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});
    assert.equal(hullTriangles,8*12,'the original eight box silhouettes remain in the batched shadow hulls');
  }finally{scene.dispose();}
});

test('approved descending walls use biofilm while metal baffles and landing shelves retain their adhesive surfaces',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
  try{
    const adhesive=scene.roomThree.collisionMeshes.filter(o=>o.userData.surfaceTag==='sticky');
    assert.ok(adhesive.length>=10);
    for(const owner of adhesive){
      const biofilm=owner.name.startsWith('cultivation-room-3-entry-sticky-transfer')||
        owner.name.startsWith('cultivation-room-3-central-sticky-transfer')||
        (owner.name.startsWith('cultivation-room-3-high-sticky-transfer')&&!owner.name.endsWith('-opening-floor'));
      const materials:THREE.Material[]=[];
      owner.traverse(o=>{if(o instanceof THREE.Mesh)materials.push(...(Array.isArray(o.material)?o.material:[o.material]));});
      if(biofilm)assert.ok(materials.some(m=>m.userData.cultivationBiofilm),owner.name);
      else assert.ok(materials.every(m=>!m.userData.cultivationBiofilm),owner.name);
      assert.equal(owner.userData.surfaceTag,'sticky');
    }
    assert.equal(scene.roomThree.wallDrops.length,5);
    for(const name of ['entry','central','high'])for(const side of [-1,1]){
      const guide=scene.roomThree.root.getObjectByName(`cultivation-room-3-${name}-sticky-transfer-laser-guide-${side}`) as THREE.Mesh;
      assert.ok(!((guide.material as THREE.Material).visible),'side guide drawing is retired');
    }
    assert.equal(layout.extractionPlatforms.length,13);
    assert.equal(scene.coverArt.textures.length,2,'only the retained drone wear maps are prepared');
  }finally{scene.dispose();}
});
