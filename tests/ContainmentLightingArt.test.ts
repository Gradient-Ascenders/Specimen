import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';
import {CONTAINMENT_ROOM_AMBIENCE} from '../src/render/environment/containment/ContainmentLightingRig.ts';
import {loadRoomOneShellFixture} from './helpers/RoomOneShellAsset.ts';
import {loadRoomTwoShellFixture} from './helpers/RoomTwoShellAsset.ts';
import {loadRoomThreeShellFixture} from './helpers/RoomThreeShellAsset.ts';
import {loadRoomFourShellFixture} from './helpers/RoomFourShellAsset.ts';
import {loadRoomFiveShellFixture} from './helpers/RoomFiveShellAsset.ts';
import {loadOpeningLaboratoryFixture} from './helpers/OpeningLaboratoryAsset.ts';

async function prepare(scene:ContainmentLevelScene){
  await scene.teaching.roomOneArt.shell.prepare(loadRoomOneShellFixture);
  await scene.prepareEnvironmentArt(loadRoomTwoShellFixture,loadRoomThreeShellFixture,loadOpeningLaboratoryFixture,loadRoomFourShellFixture,loadRoomFiveShellFixture);
}

test('all five authored rooms get bounded shadow silhouettes without new lights, textures or collision',async()=>{
  const scene=new ContainmentLevelScene(()=>{}),before=captureContainmentCollisionFingerprint(scene.collisionMeshes);
  const lights:THREE.Light[]=[];scene.root.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});
  try{
    await prepare(scene);
    assert.deepEqual(captureContainmentCollisionFingerprint(scene.collisionMeshes),before);
    const after:THREE.Light[]=[];scene.root.traverse(o=>{if(o instanceof THREE.Light)after.push(o);});assert.deepEqual(after,lights);
    const art=scene.lightingArt;
    assert.equal(art.diagnostics.ready,true);assert.equal(art.diagnostics.textureCount,0);
    assert.equal(art.diagnostics.shadowMeshes,15);assert.ok(art.diagnostics.shadowTriangles<=6000);
    assert.ok(art.diagnostics.contactMeshes>=3&&art.diagnostics.contactMeshes<=5);
    for(const mesh of art.renderMeshes){
      assert.equal(mesh.userData.visualOnly,true);assert.ok(!scene.collisionMeshes.includes(mesh));
      if(mesh.castShadow){
        assert.equal(mesh.material.colorWrite,false);assert.equal(mesh.material.depthWrite,false);
        assert.equal(mesh.geometry.index!.count%36,0,'Closed box silhouettes have no transparent-pane shadows.');
      }else{
        assert.equal(mesh.material.transparent,true);assert.equal(mesh.material.depthWrite,false);
        assert.equal(mesh.geometry.getAttribute('color').itemSize,4);
        const p=mesh.geometry.getAttribute('position'),i=mesh.geometry.index!;
        for(let n=0;n<i.count;n+=3){
          const a=new THREE.Vector3().fromBufferAttribute(p,i.getX(n)),b=new THREE.Vector3().fromBufferAttribute(p,i.getX(n+1)),c=new THREE.Vector3().fromBufferAttribute(p,i.getX(n+2));
          assert.ok(b.sub(a).cross(c.sub(a)).y>=0,'Contact shading faces the receiver.');
        }
      }
    }
    const hatch=scene.root.getObjectByName('containment-shadow-R5_Front')!;
    const closed=hatch.getWorldPosition(new THREE.Vector3());scene.roomFive.art.setReleaseProgress(1);scene.root.updateMatrixWorld(true);
    assert.equal(hatch.parent?.name,'R5_Front');assert.ok(hatch.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion())>1);
    assert.ok(hatch.getWorldPosition(new THREE.Vector3()).distanceTo(closed)<1e-6,'The existing hinge owns motion.');
    assert.equal(scene.root.getObjectByName('R3_Batch_Platforms_Alloy')!.castShadow,false);
    assert.equal(scene.root.getObjectByName('containment-shadow-R3_Architecture')!.castShadow,true);
    assert.equal(new THREE.Raycaster(new THREE.Vector3(5.8,3,0),new THREE.Vector3(1,0,0),0,1.1)
      .intersectObject(scene.root.getObjectByName('containment-shadow-R1_Architecture')!,true).length,0,'Keep the observation window transparent to light.');
    assert.equal(new THREE.Raycaster(new THREE.Vector3(0,78.9,110),new THREE.Vector3(0,-1,0),0,.3)
      .intersectObject(scene.root.getObjectByName('containment-shadow-R5_Cell')!,true).length,0,'The glass roof must not become a solid shadow slab.');
    for(const platform of scene.collisionMeshes){
      if(!/^room-[23]-.*platform/.test(platform.name)||platform.userData.sizeMetres?.[1]>.6)continue;
      const p=platform.getWorldPosition(new THREE.Vector3()),top=p.y+platform.userData.sizeMetres[1]/2;
      const proxy=scene.root.getObjectByName(platform.name.startsWith('room-2-')?'containment-shadow-R2_Architecture':'containment-shadow-R3_Architecture')!;
      assert.ok(new THREE.Raycaster(new THREE.Vector3(p.x,top+.04,p.z),new THREE.Vector3(0,-1,0),0,.9)
        .intersectObject(proxy,true).length,`Retain the landing silhouette for ${platform.name}.`);
    }
  }finally{scene.dispose();}
});

test('new lift-door casters invalidate only affected cached maps and stable poses reuse them',async()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    await prepare(scene);const lights:THREE.SpotLight[]=[];
    scene.lighting.root.traverse(o=>{if(o instanceof THREE.SpotLight&&o.castShadow)lights.push(o);});
    for(const light of lights)light.shadow.map=new THREE.WebGLRenderTarget(4,4);
    scene.lighting.prepareShadowFrame([]);for(const light of lights)light.shadow.needsUpdate=false;
    const door=scene.root.getObjectByName('R4_DoorLeft')!;door.position.x+=.4;scene.lighting.prepareShadowFrame([]);
    assert.ok(lights.some(light=>light.shadow.needsUpdate));
    assert.ok(lights.filter(light=>light.name.startsWith('room-1-')).every(light=>!light.shadow.needsUpdate));
    for(const light of lights)light.shadow.needsUpdate=false;
    scene.lighting.prepareShadowFrame([]);assert.ok(lights.every(light=>!light.shadow.needsUpdate));
  }finally{scene.dispose();}
});

test('ambient handoffs retain one source and lighting-art disposal is idempotent',async()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    await prepare(scene);
    const ambient=scene.root.getObjectByName('containment-cold-clinical-foundation') as THREE.HemisphereLight;
    for(const room of [1,2,3,4,5] as const){scene.lighting.setActiveRoom(room);assert.equal(ambient.intensity,CONTAINMENT_ROOM_AMBIENCE[room].intensity);}
    scene.lighting.setTraversalPosition({x:0,y:10,z:27});
    assert.ok(Math.abs(ambient.intensity-(CONTAINMENT_ROOM_AMBIENCE[1].intensity+CONTAINMENT_ROOM_AMBIENCE[2].intensity)/2)<1e-9);
    const meshes=[...scene.lightingArt.renderMeshes],geometry=meshes.map(m=>m.geometry),material=new Set(meshes.map(m=>m.material));
    const counts=geometry.map(()=>0);geometry.forEach((g,i)=>g.addEventListener('dispose',()=>counts[i]++));
    let disposedMaterials=0;for(const m of material)m.addEventListener('dispose',()=>disposedMaterials++);
    scene.lightingArt.dispose();scene.lightingArt.dispose();assert.deepEqual(counts,geometry.map(()=>1));assert.equal(disposedMaterials,2);
    assert.ok(meshes.every(mesh=>mesh.parent===null));
    scene.dispose();assert.deepEqual(counts,geometry.map(()=>1));
  }finally{scene.dispose();}
});
