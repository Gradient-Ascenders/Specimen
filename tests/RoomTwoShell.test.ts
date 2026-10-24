import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';
import {RoomTwoShell} from '../src/render/environment/containment/RoomTwoShell.ts';
import {ContainmentArtResources} from '../src/render/environment/containment/ContainmentArtResources.ts';
import {RoomOneShell} from '../src/render/environment/containment/RoomOneShell.ts';
import {auditOpaqueSurfaces,collectOpaqueTriangles,findOpaqueSurfaceOverlaps} from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import {loadRoomOneShellFixture} from './helpers/RoomOneShellAsset.ts';
import {loadRoomTwoShellFixture} from './helpers/RoomTwoShellAsset.ts';
import {loadRoomThreeShellFixture} from './helpers/RoomThreeShellAsset.ts';
import {loadOpeningLaboratoryFixture} from './helpers/OpeningLaboratoryAsset.ts';
import {loadRoomFourShellFixture} from './helpers/RoomFourShellAsset.ts';

async function prepare(scene:ContainmentLevelScene){
  await scene.teaching.roomOneArt.shell.prepare(loadRoomOneShellFixture);
  await scene.prepareEnvironmentArt(loadRoomTwoShellFixture,loadRoomThreeShellFixture,loadOpeningLaboratoryFixture,loadRoomFourShellFixture);
}

test('the Blender hall shares finish resources and preserves all collision data, landings and openings',async()=>{
  const scene=new ContainmentLevelScene(()=>{}),shell=scene.teaching.roomTwoArt.shell;
  const collision=captureContainmentCollisionFingerprint(scene.collisionMeshes);
  try{
    await prepare(scene);
    assert.deepEqual(captureContainmentCollisionFingerprint(scene.collisionMeshes),collision);
    assert.equal(shell.diagnostics.meshes,15);assert.ok(shell.diagnostics.triangles<40_000);
    assert.equal(shell.diagnostics.textureCount,0);assert.equal(scene.surveillanceCameras.modelDiagnostics.cameras,5);
    const bytes=await readFile(new URL('../assets/environments/containment-room-two/room-two-hall.glb',import.meta.url));
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.equal(json.images,undefined);assert.equal(json.animations,undefined);assert.equal(json.cameras,undefined);
    shell.root.traverse(object=>{
      assert.ok(!(object instanceof THREE.Light||object instanceof THREE.Camera));
      if(!(object instanceof THREE.Mesh))return;
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
    assert.equal(root,shell.root.children[0]);assert.equal(scene.surveillanceCameras.modelDiagnostics.cameras,5);
  }finally{scene.dispose();}
});

test('the complete prepared Room 2 has no opaque overlap at 0.1mm or 2mm in tracking, jump, climb and reset states',async()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    await prepare(scene);
    for(const position of [{x:-9,y:.46,z:31},{x:4.2,y:4.56,z:31.0999},{x:14.22,y:8,z:43},
      {x:.87909,y:10.81,z:38.41571},{x:0,y:11.36,z:46.5},{x:-9,y:.46,z:31}]){
      scene.surveillanceCameras.reset(position);
      scene.platformBoosters.update(.15,position);
      for(const tolerance of [.0001,.002]){
        assert.deepEqual(auditOpaqueSurfaces(scene.teaching.roomTwoArt.root,tolerance).conflicts,[],
          `Overlapping Room 2 faces at ${JSON.stringify(position)}, ${tolerance} m.`);
      }
    }
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

test('the new architecture clears neighbouring duct and Room 3 geometry at both room seams',async()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    await prepare(scene);
    const triangles=collectOpaqueTriangles(scene.root).filter(triangle=>triangle.min[2]<49.3&&triangle.max[2]>26.7&&
      triangle.min[1]<18.2&&triangle.max[1]>-.2&&triangle.min[0]<15.4&&triangle.max[0]>-18.6);
    assert.ok(triangles.some(triangle=>triangle.owner.includes('/room-2-production-art/')));
    assert.ok(triangles.some(triangle=>!triangle.owner.includes('/room-2-production-art/')));
    const conflicts:string[]=[];
    findOpaqueSurfaceOverlaps(triangles,.002,(a,b)=>{
      const first=a.owner.includes('/room-2-production-art/'),second=b.owner.includes('/room-2-production-art/');
      if(first!==second)conflicts.push(`${a.owner} / ${b.owner}`);
    });
    assert.deepEqual(conflicts,[]);
  }finally{scene.dispose();}
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
