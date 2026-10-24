import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';
import {ContainmentArtResources} from '../src/render/environment/containment/ContainmentArtResources.ts';
import {RoomOneShell} from '../src/render/environment/containment/RoomOneShell.ts';
import {RoomThreeShell} from '../src/render/environment/containment/RoomThreeShell.ts';
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

test('the chemical hall shares the finish bank and retains the complete collision, acid and hazard contracts',async()=>{
  const scene=new ContainmentLevelScene(()=>{}),room=scene.roomThree,shell=room.art.shell;
  const collision=captureContainmentCollisionFingerprint(scene.collisionMeshes);
  const acid=room.art.acidSurface,liquid=room.art.acidSurfaceMaterial;
  const hazards=()=>room.lasers.hazards.map(hazard=>({id:hazard.id,start:{...hazard.start},end:{...hazard.end},
    enabled:hazard.enabled,state:hazard.sequenceState,progress:hazard.phaseProgress}));
  const before=hazards();
  try{
    await prepare(scene);
    assert.deepEqual(captureContainmentCollisionFingerprint(scene.collisionMeshes),collision);
    assert.deepEqual(hazards(),before);
    assert.equal(room.art.acidSurface,acid);assert.equal(room.art.acidSurfaceMaterial,liquid);
    assert.equal(acid.visible,true);assert.equal(acid.parent,room.art.root);
    assert.equal(shell.diagnostics.meshes,14);assert.ok(shell.diagnostics.triangles<55_000);
    assert.equal(shell.diagnostics.textureCount,0);assert.equal(shell.diagnostics.ownedMaterials,1);
    assert.equal(shell.diagnostics.lasersAttached,true);
    const file=await readFile(new URL('../assets/environments/containment-room-three/room-three-laboratory.glb',import.meta.url));
    const json=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
    for(const key of ['images','textures','animations','cameras'])assert.equal(json[key],undefined);
    shell.root.traverse(object=>{
      assert.ok(!(object instanceof THREE.Light||object instanceof THREE.Camera||object instanceof THREE.SkinnedMesh));
      if(!(object instanceof THREE.Mesh))return;
      for(const attribute of Object.values(object.geometry.attributes))assert.ok((attribute as THREE.BufferAttribute).array.every(Number.isFinite));
      const finish=object.name.split('_').at(-1)!;
      if(finish==='Sticky')assert.equal(object.material,scene.artResources.materials.stickyMembrane);
      else if(finish==='Stained'){
        const material=object.material as THREE.MeshStandardMaterial;
        assert.equal(material.vertexColors,true);
        assert.equal(material.map,(scene.teaching.roomOneArt.shell.borrowFinish('Cool') as THREE.MeshStandardMaterial).map);
        const colours=object.geometry.getAttribute('color');assert.ok(colours);
        assert.ok(Math.max(...colours.array)-Math.min(...colours.array)>.1,'Author selective vertex wear.');
      }else assert.equal(object.material,scene.teaching.roomOneArt.shell.borrowFinish(finish));
    });
    for(const collider of room.collisionMeshes.filter(mesh=>/platform|ledge/.test(mesh.name))){
      collider.geometry.computeBoundingBox();
      const top=collider.position.y+collider.geometry.boundingBox!.max.y;
      for(const dx of [-.15,.15])for(const dz of [-.15,.15]){
        const hits=new THREE.Raycaster(new THREE.Vector3(collider.position.x+dx,top+.1,collider.position.z+dz),new THREE.Vector3(0,-1,0),0,.2).intersectObject(shell.root,true);
        assert.ok(hits[0],`Missing landing ${collider.name}`);
        assert.ok(Math.abs(hits[0].point.y-top)<1e-5,`Changed landing ${collider.name}`);
      }
    }
    for(const [x,y,z] of [[0,12.2,48.9],[9,32.3,76.5]]){
      assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,1),0,.8).intersectObject(shell.root,true),[]);
    }
    // The shared bulkhead must preserve the full original passage, including
    // its edges and headroom, through both rooms' authored geometry.
    for(const x of [-1.48,0,1.48])for(const y of [10.95,11.36,13.95]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,y,48.3),new THREE.Vector3(0,0,1),0,1.3)
        .intersectObjects([scene.teaching.roomTwoArt.shell.root,shell.root],true);
      assert.deepEqual(hits,[],`Blocked bulkhead passage at X=${x}, Y=${y}.`);
    }
    // Inspect behind the coping: a ray from the room centre hits the rim and
    // misses the open strip visible when looking down beside the dividing wall.
    for(const x of [-16.5,-12,-4,0,4,12,16.5])for(const y of [4.8,5.1,5.4,5.54,5.56,6]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,y,49.35),new THREE.Vector3(0,0,-1),0,.25)
        .intersectObject(shell.root,true);
      assert.ok(hits[0],`Unsealed Room 2/3 dividing wall at X=${x}, Y=${y}.`);
      assert.ok(Math.abs(hits[0].point.z-49.2)<1e-4,'The wall, rather than neighbouring room scenery, must close the basin.');
    }
    const root=shell.root.children[0];
    room.reset();await scene.prepareEnvironmentArt(loadRoomTwoShellFixture,()=>{throw new Error('Must reuse static architecture');});
    assert.equal(root,shell.root.children[0]);assert.deepEqual(hazards(),before);
    const prime=scene.measuredFirstUseGeometryPrimeDiagnostics;
    assert.equal(prime.resourceCount,74);assert.equal(prime.uniqueGeometryCount,74);
    assert.ok(!prime.ownerNames.some(name=>name.startsWith('room-3-production-art-static-batch')));
  }finally{scene.dispose();}
});

test('opaque architecture, laser heads, boosters, cameras and monitors clear 0.1mm and 2mm throughout the sweep and reset',async()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    await prepare(scene);
    for(const [time,position] of [[0,{x:0,y:11.36,z:51.4}],[.3,{x:11.2583,y:12.14,z:59}],
      [1.3,{x:16.22,y:18,z:63}],[2,{x:5,y:24.41,z:62.839}],
      [3.1,{x:5.7,y:25.7853,z:73.5}],[0,{x:0,y:11.36,z:51.4}]] as const){
      const room=scene.roomThree;room.reset();
      if(time)room.updateActive(time,{id:'audit',position:{x:0,y:11.36,z:51.4},radiusMetres:.01});
      scene.surveillanceCameras.reset(position);scene.platformBoosters.update(.15,position);
      for(const tolerance of [.0001,.002]){
        assert.deepEqual(auditOpaqueSurfaces(room.root,tolerance).conflicts,[],`Overlapping faces at ${time} s, ${tolerance} m.`);
      }
      for(const hazard of room.lasers.hazards){
        const emitter=room.root.getObjectByName(`${hazard.id}-presentation-emitter-start`)!;
        assert.ok(emitter.position.distanceTo(new THREE.Vector3(hazard.start.x,hazard.start.y,hazard.start.z))<1e-7);
        const facing=new THREE.Vector3(0,1,0).applyQuaternion(emitter.quaternion);
        const direction=new THREE.Vector3(hazard.end.x-hazard.start.x,hazard.end.y-hazard.start.y,hazard.end.z-hazard.start.z).normalize();
        assert.ok(facing.dot(direction)>.9999999);
        assert.equal(emitter.getObjectByName(`${emitter.name}-active-aperture`)!.visible,hazard.enabled);
        assert.equal(emitter.getObjectByName(`${emitter.name}-inactive-shutters`)!.visible,!hazard.enabled);
        assert.equal(emitter.getObjectByName(`${emitter.name}-housing-collar`)!.visible,false);
        assert.ok(emitter.getObjectByName(`${emitter.name}-authored-housing`));
      }
    }
  }finally{scene.dispose();}
});

test('the new room and duct clear neighbouring Room 2 and Room 4 surfaces',async()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    await prepare(scene);
    const triangles=collectOpaqueTriangles(scene.root).filter(triangle=>triangle.min[2]<81.2&&triangle.max[2]>48.5&&
      triangle.min[1]<34.5&&triangle.max[1]>4.5);
    const conflicts:string[]=[];
    findOpaqueSurfaceOverlaps(triangles,.002,(a,b)=>{
      if(a.owner.includes('containment-room-3-greybox/')!==b.owner.includes('containment-room-3-greybox/'))
        conflicts.push(`${a.owner} / ${b.owner}`);
    });
    assert.deepEqual(conflicts,[]);
  }finally{scene.dispose();}
});

test('unloading detaches borrowed optical geometry and disposes the asset once without releasing the shared bank',async()=>{
  const scene=new ContainmentLevelScene(()=>{}),room=scene.roomThree;
  const aperture=room.root.getObjectByName('room-3-first-static-laser-presentation-emitter-start-active-aperture') as THREE.Mesh;
  const original=aperture.geometry;await prepare(scene);
  const shell=room.art.shell;
  let bank=0,wear=0;
  scene.teaching.roomOneArt.shell.borrowFinish('Cool').addEventListener('dispose',()=>bank++);
  (shell.root.getObjectByName('R3_Batch_Shell_Stained') as THREE.Mesh).material.addEventListener('dispose',()=>wear++);
  const owned=new Set<THREE.BufferGeometry>(shell.renderMeshes.map(mesh=>mesh.geometry));
  const housing=room.root.getObjectByName('room-3-first-static-laser-presentation-emitter-start-authored-housing')!;
  housing.traverse(object=>{if(object instanceof THREE.Mesh)owned.add(object.geometry);});
  owned.add(aperture.geometry);
  owned.add((room.root.getObjectByName('room-3-first-static-laser-presentation-emitter-start-inactive-shutters') as THREE.Mesh).geometry);
  let geometries=0;
  for(const geometry of owned)geometry.addEventListener('dispose',()=>geometries++);
  shell.dispose();shell.dispose();
  assert.equal(geometries,owned.size);assert.equal(wear,1);assert.equal(bank,0);
  assert.equal(aperture.geometry,original);
  scene.dispose();assert.equal(bank,1);
});

test('a late asset is released after unload without allocating a wear material or texture bank',async()=>{
  const room=new RoomOneShell(),materials=new ContainmentArtResources(),shell=new RoomThreeShell();
  await room.prepare(loadRoomOneShellFixture);const source=await loadRoomThreeShellFixture();
  let release!:(source:THREE.Group)=>void,geometries=0;
  source.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.addEventListener('dispose',()=>geometries++);});
  const ready=shell.prepare(name=>room.borrowFinish(name),materials.materials,()=>new Promise(resolve=>{release=resolve;}));
  shell.dispose();release(source);await ready;
  assert.equal(geometries,18);assert.equal(shell.diagnostics.ownedMaterials,0);assert.equal(shell.ready,false);
  room.dispose();materials.dispose();
});
