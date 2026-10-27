import {loadRoomFiveShellFixture} from './helpers/RoomFiveShellAsset.ts';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';
import {RoomTwoShell} from '../src/render/environment/containment/RoomTwoShell.ts';
import {ContainmentArtResources} from '../src/render/environment/containment/ContainmentArtResources.ts';
import {RoomOneShell} from '../src/render/environment/containment/RoomOneShell.ts';
import {loadRoomOneShellFixture} from './helpers/RoomOneShellAsset.ts';
import {loadRoomTwoShellFixture} from './helpers/RoomTwoShellAsset.ts';
import {loadRoomThreeShellFixture} from './helpers/RoomThreeShellAsset.ts';
import {loadOpeningLaboratoryFixture} from './helpers/OpeningLaboratoryAsset.ts';
import {loadRoomFourShellFixture} from './helpers/RoomFourShellAsset.ts';

async function prepare(scene:ContainmentLevelScene){
  await scene.teaching.roomOneArt.shell.prepare(loadRoomOneShellFixture);
  await scene.prepareEnvironmentArt(loadRoomTwoShellFixture,loadRoomThreeShellFixture,loadOpeningLaboratoryFixture,loadRoomFourShellFixture,loadRoomFiveShellFixture);
}

test('Room 2 end-wall corners are sealed up to the side backing while both passages remain open',async()=>{
  const root=await loadRoomTwoShellFixture();root.updateMatrixWorld(true);
  try{
    for(const z of [27.2,48.8])for(const side of [-1,1])
      for(const edge of [14.81,14.95,15.04,15.17])for(const y of [.03,1.4,6.3,8,10.2,12.8,14.8,17.95]){
        const direction=z===27.2?-1:1;
        const hits=new THREE.Raycaster(new THREE.Vector3(side*edge,y,z-direction*.1),
          new THREE.Vector3(0,0,direction),0,.18).intersectObject(root,true);
        assert.ok(hits[0],`Open corner at X=${side*edge}, Y=${y}, Z=${z}.`);
        assert.ok(Math.abs(hits[0].point.z-z)<1e-4,'The end wall itself must close the seam.');
      }
    for(const [x,y,z] of [[-8.4,11.5,26.8],[0,12.25,48.4]]){
      assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,1),0,.8)
        .intersectObject(root,true),[],'Keep the original passage open.');
    }
  }finally{
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
});

test('the Blender hall shares finish resources and preserves all collision data, landings and openings',async()=>{
  const scene=new ContainmentLevelScene(()=>{}),shell=scene.teaching.roomTwoArt.shell;
  const collision=captureContainmentCollisionFingerprint(scene.collisionMeshes);
  try{
    assert.deepEqual(scene.teaching.roomTwoArt.renderSources,[scene.teaching.roomTwoArt.root]);
    await prepare(scene);
    assert.deepEqual(scene.teaching.roomTwoArt.renderSources,[shell.root],
      'Production GPU preparation must use the authored hall rather than its retired storyboard.');
    assert.deepEqual(captureContainmentCollisionFingerprint(scene.collisionMeshes),collision);
    assert.equal(shell.diagnostics.meshes,15);assert.ok(shell.diagnostics.triangles<40_000);
    assert.equal(shell.diagnostics.textureCount,0);assert.equal(scene.surveillanceCameras.modelDiagnostics.cameras,6);
    const bytes=await readFile(new URL('../assets/environments/containment-room-two/room-two-hall.glb',import.meta.url));
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.equal(json.images,undefined);assert.equal(json.animations,undefined);assert.equal(json.cameras,undefined);
    shell.root.traverse(object=>{
      assert.ok(!(object instanceof THREE.Light||object instanceof THREE.Camera));
      if(!(object instanceof THREE.Mesh)||object.userData.lightingOnly)return;
      for(const attribute of Object.values(object.geometry.attributes))assert.ok((attribute as THREE.BufferAttribute).array.every(Number.isFinite));
      if(object.name.endsWith('_Sticky'))assert.equal(object.material,scene.artResources.materials.stickyMembrane);
      else assert.equal(object.material,scene.teaching.roomOneArt.shell.borrowFinish(object.name.split('_').at(-1)!));
    });
    for(const collider of scene.collisionMeshes.filter(object=>object.name.startsWith('room-2-')&&/platform|step|ledge|balcony/.test(object.name))){
      collider.geometry.computeBoundingBox();
      const top=collider.position.y+collider.geometry.boundingBox!.max.y;
      for(const dx of [-.15,.15])for(const dz of [-.15,.15]){
        const hits=new THREE.Raycaster(new THREE.Vector3(collider.position.x+dx,top+.1,collider.position.z+dz),new THREE.Vector3(0,-1,0),0,.2).intersectObject(shell.root,true);
        assert.ok(hits[0],`Missing landing: ${collider.name}`);
        assert.ok(Math.abs(hits[0].point.y-top)<1e-5,`Changed landing height: ${collider.name}`);
      }
    }
    for(const [x,y,z] of [[-8.4,11.5,26.8],[0,12.25,48.4]]){
      assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,1),0,.8).intersectObject(shell.root,true),[]);
    }
    const prime=scene.measuredFirstUseGeometryPrimeDiagnostics;
    assert.ok(prime.ownerNames.some(name=>name.startsWith('R2_Batch_')));
    assert.ok(!prime.ownerNames.some(name=>name.startsWith('room-2-')),'Retired Room 2 proxy buffers must not upload.');
    assert.equal(prime.uniqueGeometryCount,prime.resourceCount);
    const root=shell.root.children[0];
    scene.resetTeachingPresentation();await scene.prepareEnvironmentArt(()=>{throw new Error('Must reuse prepared architecture');});
    assert.equal(root,shell.root.children[0]);assert.equal(scene.surveillanceCameras.modelDiagnostics.cameras,6);
  }finally{scene.dispose();}
});

test('unload disposes hall and camera geometry once while leaving borrowed finishes with Room 1',async()=>{
  const scene=new ContainmentLevelScene(()=>{});await prepare(scene);
  const shell=scene.teaching.roomTwoArt.shell,resources=new Set<THREE.BufferGeometry>();
  for(const mesh of shell.renderMeshes)resources.add(mesh.geometry);
  let geometries=0,finishes=0;
  for(const geometry of resources)geometry.addEventListener('dispose',()=>geometries++);
  scene.teaching.roomOneArt.shell.borrowFinish('Ivory').addEventListener('dispose',()=>finishes++);
  shell.dispose();shell.dispose();assert.equal(geometries,resources.size);assert.equal(finishes,0);
  scene.dispose();assert.equal(finishes,1);
});

test('a late hall load is released after unload without adopting geometry or allocating textures',async()=>{
  const room=new RoomOneShell(),materials=new ContainmentArtResources(),shell=new RoomTwoShell();
  await room.prepare(loadRoomOneShellFixture);const source=await loadRoomTwoShellFixture();
  let release!:(root:THREE.Group)=>void,count=0;
  source.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.addEventListener('dispose',()=>count++);});
  const ready=shell.prepare(name=>room.borrowFinish(name),materials.materials,()=>new Promise(resolve=>{release=resolve;}));
  shell.dispose();release(source);await ready;
  assert.equal(count,15);assert.equal(shell.ready,false);
  room.dispose();materials.dispose();
});
