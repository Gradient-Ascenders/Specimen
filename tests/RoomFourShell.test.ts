import {loadRoomFiveShellFixture} from './helpers/RoomFiveShellAsset.ts';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';
import {auditOpaqueSurfaces,collectOpaqueTriangles,findOpaqueSurfaceOverlaps} from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import {loadRoomOneShellFixture} from './helpers/RoomOneShellAsset.ts';
import {loadRoomTwoShellFixture} from './helpers/RoomTwoShellAsset.ts';
import {loadRoomThreeShellFixture} from './helpers/RoomThreeShellAsset.ts';
import {loadRoomFourShellFixture} from './helpers/RoomFourShellAsset.ts';
import {loadOpeningLaboratoryFixture} from './helpers/OpeningLaboratoryAsset.ts';

async function prepare(level:ContainmentLevelScene){
  await level.teaching.roomOneArt.shell.prepare(loadRoomOneShellFixture);
  await level.prepareEnvironmentArt(loadRoomTwoShellFixture,loadRoomThreeShellFixture,loadOpeningLaboratoryFixture,loadRoomFourShellFixture,loadRoomFiveShellFixture);
}
function pose(level:ContainmentLevelScene,total:number){
  const room=level.roomFour;room.reset();room.elevator.begin();
  if(total)room.elevator.update(total,[]);
  if(total>3)room.lasers.update(Math.min(45,total-3),{id:'audit',position:{x:1000,y:1000,z:1000},radiusMetres:.1});
  (room as unknown as {syncPresentation():void}).syncPresentation();
}

test('authored lift art preserves collision, travel, hazard timing, the complete roof and existing light budget',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFour;
  const collision=captureContainmentCollisionFingerprint(level.collisionMeshes);
  const lights:THREE.Light[]=[];level.root.traverse(object=>{if(object instanceof THREE.Light)lights.push(object);});
  const hazards=room.lasers.hazards.map(hazard=>({id:hazard.id,start:{...hazard.start},end:{...hazard.end},enabled:hazard.enabled}));
  try{
    await prepare(level);
    assert.deepEqual(captureContainmentCollisionFingerprint(level.collisionMeshes),collision);
    assert.equal(room.elevator.travelDurationSeconds,45);assert.equal(room.elevator.startDelaySeconds,3);
    assert.equal(room.elevator.arrivalDelaySeconds,2);
    assert.deepEqual(room.elevatorPlatform.size.toArray(),[8,.5,8]);
    assert.deepEqual(room.lasers.hazards.map(hazard=>({id:hazard.id,start:{...hazard.start},end:{...hazard.end},enabled:hazard.enabled})),hazards);
    const after:THREE.Light[]=[];level.root.traverse(object=>{if(object instanceof THREE.Light)after.push(object);});
    assert.deepEqual(after,lights);
    const shell=room.art.shell;
    assert.equal(shell.diagnostics.textureCount,0);assert.equal(shell.diagnostics.lasersAttached,true);
    assert.ok(shell.diagnostics.triangles<40_000);assert.equal(shell.diagnostics.meshes,30);
    const file=await readFile(new URL('../assets/environments/containment-room-four/room-four-lift.glb',import.meta.url));
    const json=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
    for(const key of ['images','textures','animations','cameras'])assert.equal(json[key],undefined);
    const wear=(shell.carRoot.getObjectByName('R4_Batch_Car_Worn') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    assert.equal(wear.map,(level.teaching.roomOneArt.shell.borrowFinish('Cool') as THREE.MeshStandardMaterial).map);
    assert.equal(wear.vertexColors,true);
    const top=room.elevatorPlatform.position.y+.25;
    for(const x of [-3.5,-.2,.2,3.5])for(const z of [-2.8,-.2,.2,2.8]){
      const hits=new THREE.Raycaster(new THREE.Vector3(9+x,top+.1,85.5+z),new THREE.Vector3(0,-1,0),0,.2)
        .intersectObject(shell.carRoot,true);
      assert.ok(hits[0]);assert.ok(Math.abs(hits[0].point.y-top)<1e-5,'Keep the walkable roof aligned with its collider.');
    }
    assert.equal(level.measuredFirstUseGeometryPrimeDiagnostics.resourceCount,137);
    assert.equal(level.measuredFirstUseGeometryPrimeDiagnostics.uniqueGeometryCount,137);
  }finally{level.dispose();}
});

test('the car, counterweight, cables, optics and pocket doors clear opaque surfaces through travel, opening and reset',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFour;
  try{
    await prepare(level);
    for(const total of [0,2,8,20,35,48,48.25,48.5,48.75,49,49.25,49.5,49.75,49.9,50,0]){
      pose(level,total);
      for(const tolerance of [.0001,.002])assert.deepEqual(auditOpaqueSurfaces(room.root,tolerance).conflicts,[],
        `Surface conflict at ${total} s / ${tolerance} m.`);
      const progress=room.elevator.ascentProgress,d=room.art.shell.diagnostics;
      assert.ok(Math.abs(d.heightMetres-45*progress)<1e-8);
      assert.equal(d.displayMetres,Math.round(45*progress));
      const weight=room.root.getObjectByName('R4_Counterweight')!;
      assert.ok(Math.abs(weight.position.y-(75-45*progress))<1e-8);
      weight.updateWorldMatrix(true,true);
      assert.ok(new THREE.Box3().setFromObject(weight).max.x<2.7,'Keep the counterweight behind the existing camera boundary.');
      assert.ok(d.doorOpen>=0&&d.doorOpen<=1);
      if(total<48)assert.equal(d.doorOpen,0);
      if(total>=50)assert.equal(d.doorOpen,1);
      assert.equal(room.root.getObjectByName('R4_ExitArrow')!.visible,room.elevator.exitReady);
    }
  }finally{level.dispose();}
});

test('the lift entry and arrival join neighbouring rooms without overlapping opaque coverage',async()=>{
  const level=new ContainmentLevelScene(()=>{});
  try{
    await prepare(level);
    for(const total of [0,49,50]){
      pose(level,total);
      const triangles=collectOpaqueTriangles(level.root).filter(triangle=>triangle.min[2]<94&&triangle.max[2]>76.5&&
        triangle.min[1]<79&&triangle.max[1]>25);
      const conflicts:string[]=[];
      findOpaqueSurfaceOverlaps(triangles,.002,(a,b)=>{
        if(a.owner.includes('containment-room-4-greybox/')!==b.owner.includes('containment-room-4-greybox/'))
          conflicts.push(`${a.owner} / ${b.owner}`);
      });
      assert.deepEqual(conflicts,[]);
    }
  }finally{level.dispose();}
});

test('the lift-side duct surround seals the oversized opening while keeping the existing passage and floor clear',async()=>{
  const level=new ContainmentLevelScene(()=>{}),shell=level.roomFour.art.shell;
  try{
    await prepare(level);level.root.updateWorldMatrix(true,true);
    const ray=(x:number,y:number)=>new THREE.Raycaster(new THREE.Vector3(x,y,82),new THREE.Vector3(0,0,-1),0,2.4);
    for(const x of [7.82,9,10.18])for(const y of [30.5,31,33.55])
      assert.ok(ray(x,y).intersectObject(shell.root,true).length>0,`Seal the wall around the duct at ${x}, ${y}.`);
    for(const x of [7.82,10.18])assert.ok(ray(x,32.2).intersectObject(shell.root,true).length>0);
    for(const x of [8.05,9,9.95])for(const y of [31.3,32.2,33.2])
      assert.equal(ray(x,y).intersectObject(shell.root,true).length,0,'Keep the original tunnel aperture clear.');
    for(const z of [79.75,80.70]){
      const hits=new THREE.Raycaster(new THREE.Vector3(9,31.3,z),new THREE.Vector3(0,-1,0),0,.2)
        .intersectObject(level.roomThree.art.shell.root,true);
      assert.ok(hits[0]);assert.ok(Math.abs(hits[0].point.y-31.175)<1e-5,'Room 3 retains the existing duct floor.');
    }
  }finally{level.dispose();}
});

test('warning optics charge before the real laser, then clear on activation and reset without changing lethality',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFour;
  try{
    await prepare(level);pose(level,7.2);
    const hazard=room.lasers.hazards[0],ring=room.root.getObjectByName(`${hazard.id}-charge-ring`) as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
    assert.equal(hazard.enabled,false);assert.ok(Math.abs(hazard.secondsUntilEnabled!-.3)<1e-8);
    assert.equal(ring.visible,true);assert.ok(ring.material.opacity>0&&ring.material.opacity<1);
    pose(level,7.6);assert.equal(hazard.enabled,true);assert.equal(ring.visible,false);
    room.reset();assert.equal(ring.visible,false);assert.equal(room.art.shell.diagnostics.displayMetres,0);
  }finally{level.dispose();}
});

test('the landing door eases both panels into wall pockets and releases the existing exit only when fully open',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFour;
  try{
    await prepare(level);
    const left=room.root.getObjectByName('R4_DoorLeft')!,right=room.root.getObjectByName('R4_DoorRight')!;
    room.root.updateWorldMatrix(true,true);
    for(const x of [7.71,9,10.29])for(const y of [74.9,76,78.05,78.2]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,y,90.8),new THREE.Vector3(0,0,1),0,1)
        .intersectObject(room.art.shell.root,true);
      assert.ok(hits[0],`The closed door and transom must seal the landing at ${x}, ${y}.`);
    }
    for(const [total,open] of [[48,0],[48.5,.15625],[49,.5],[49.5,.84375],[50,1]] as const){
      pose(level,total);
      assert.ok(Math.abs(room.art.shell.diagnostics.doorOpen-open)<1e-8);
      assert.ok(Math.abs(left.position.x+1.35*open)<1e-8);
      assert.ok(Math.abs(right.position.x-1.35*open)<1e-8);
      assert.equal(room.root.getObjectByName('room-4-exit-lock')!.visible,total<50);
    }
    room.root.updateWorldMatrix(true,true);
    for(const x of [7.75,9,10.25])assert.equal(new THREE.Raycaster(new THREE.Vector3(x,76,90.8),
      new THREE.Vector3(0,0,1),0,1).intersectObjects([left,right],true).length,0,'Both panels must clear the original opening.');
    room.reset();assert.ok(Math.abs(left.position.x)<1e-8);assert.ok(Math.abs(right.position.x)<1e-8);
  }finally{level.dispose();}
});

test('unload restores presentation owners and releases lift buffers and instances once while retaining borrowed optics and finishes',async()=>{
  const level=new ContainmentLevelScene(()=>{}),shell=level.roomFour.art.shell;
  try{
    await prepare(level);
    const meshes=shell.renderMeshes,geometry=new Set(meshes.map(mesh=>mesh.geometry));
    let disposed=0,instances=0,bank=0,optic=0;
    for(const value of geometry)value.addEventListener('dispose',()=>disposed++);
    (shell.carRoot.getObjectByName('room-4-lift-height-display') as THREE.InstancedMesh).addEventListener('dispose',()=>instances++);
    level.teaching.roomOneArt.shell.borrowFinish('Alloy').addEventListener('dispose',()=>bank++);
    level.roomThree.art.shell.borrowLaserEmitter()!.aperture.addEventListener('dispose',()=>optic++);
    shell.dispose();shell.dispose();
    assert.equal(disposed,geometry.size);assert.equal(instances,1);assert.equal(bank,0);assert.equal(optic,0);
    assert.equal(level.roomFour.root.getObjectByName('room-4-cargo-elevator-industrial-roof')!.visible,true);
    level.dispose();assert.equal(bank,1);assert.equal(optic,1);
  }finally{level.dispose();}
});
