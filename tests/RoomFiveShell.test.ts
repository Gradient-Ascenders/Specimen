import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../src/levels/ContainmentLevelScene.ts';
import {captureContainmentCollisionFingerprint} from '../src/levels/ContainmentCollisionFingerprint.ts';
import {auditOpaqueSurfaces,collectOpaqueTriangles,findOpaqueSurfaceOverlaps} from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import {sampleContainmentFinale} from '../src/cinematics/ContainmentFinaleTimeline.ts';
import {ROOM_FIVE_ESCAPE} from '../src/levels/RoomFiveEscapeLayout.ts';
import {loadRoomOneShellFixture} from './helpers/RoomOneShellAsset.ts';
import {loadRoomTwoShellFixture} from './helpers/RoomTwoShellAsset.ts';
import {loadRoomThreeShellFixture} from './helpers/RoomThreeShellAsset.ts';
import {loadRoomFourShellFixture} from './helpers/RoomFourShellAsset.ts';
import {loadRoomFiveShellFixture} from './helpers/RoomFiveShellAsset.ts';
import {loadOpeningLaboratoryFixture} from './helpers/OpeningLaboratoryAsset.ts';
import type {KinematicBody} from '../src/physics/KinematicBody.ts';

async function prepare(level:ContainmentLevelScene){
  await level.teaching.roomOneArt.shell.prepare(loadRoomOneShellFixture);
  await level.prepareEnvironmentArt(loadRoomTwoShellFixture,loadRoomThreeShellFixture,
    loadOpeningLaboratoryFixture,loadRoomFourShellFixture,loadRoomFiveShellFixture);
}
const farBody={position:{x:1000,y:1000,z:1000},radiusMetres:.45} as KinematicBody;

test('the authored atrium preserves collision, lasers, platform routes, thrusters and the existing light budget',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFive;
  const collision=captureContainmentCollisionFingerprint(level.collisionMeshes);
  const lights:THREE.Light[]=[];level.root.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});
  const boosterCount=level.platformBoosters.platformCount,wood=room.goopWoodenDoor.geometry;
  const routes=[room.movingPlatformOne,room.movingPlatformTwo].map(p=>[p.startPosition.toArray(),p.endPosition.toArray(),p.travelDurationSeconds]);
  const lasers=room.lasers.hazards.map(h=>[h.id,{...h.start},{...h.end},h.enabled]);
  try{
    await prepare(level);
    assert.deepEqual(captureContainmentCollisionFingerprint(level.collisionMeshes),collision);
    assert.deepEqual([room.movingPlatformOne,room.movingPlatformTwo].map(p=>[p.startPosition.toArray(),p.endPosition.toArray(),p.travelDurationSeconds]),routes);
    assert.deepEqual(room.lasers.hazards.map(h=>[h.id,{...h.start},{...h.end},h.enabled]),lasers);
    const after:THREE.Light[]=[];level.root.traverse(o=>{if(o instanceof THREE.Light)after.push(o);});
    assert.deepEqual(after,lights);assert.equal(level.platformBoosters.platformCount,boosterCount);
    assert.equal(room.goopWoodenDoor.geometry,wood);
    assert.equal(room.art.shell.diagnostics.textureCount,0);assert.equal(room.art.shell.diagnostics.meshes,44);
    assert.ok(room.art.shell.diagnostics.triangles<40_000);assert.equal(room.art.shell.diagnostics.lasersAttached,true);
    const file=await readFile(new URL('../assets/environments/containment-room-five/room-five-atrium.glb',import.meta.url));
    const json=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
    for(const key of ['images','textures','animations','cameras'])assert.equal(json[key],undefined);
    assert.equal(level.measuredFirstUseGeometryPrimeDiagnostics.uniqueGeometryCount,137);
    for(const name of ['R5_Batch_Cell_Security','R5_Batch_Front_Security']){
      const marking=room.root.getObjectByName(name) as THREE.Mesh;
      assert.equal(marking.material,room.art.security.signs.material,'Reuse the original security atlas and its material owner.');
    }
    level.root.updateWorldMatrix(true,true);
    for(const [x,z] of [[0,105.31],[0,114.69],[-4.54,110],[4.54,110],[-4.54,105.31],[4.54,114.69]]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,74.9,z),new THREE.Vector3(0,-1,0),0,.2)
        .intersectObject(room.art.shell.root,true);
      assert.equal((hits[0]?.object as THREE.Mesh)?.material,room.art.security.signs.material,'The floor border is continuous and seated at floor height.');
      assert.ok(Math.abs(hits[0].point.y-74.75)<1e-5);
    }
    for(const y of [74.80,75.15,75.50])for(const x of [-2.5,0,2.5]){
      assert.ok(new THREE.Raycaster(new THREE.Vector3(x,y,106.5),new THREE.Vector3(0,0,1),0,.6)
        .intersectObject(room.art.shell.root,true).length,'Seal the base continuously from the floor to the plinth.');
    }
    assert.equal(room.root.getObjectByName('R5_Cross-transfer guide'),undefined);
    assert.equal(room.root.getObjectByName('R5_Rail support'),undefined);
    level.root.updateWorldMatrix(true,true);
    assert.equal(new THREE.Raycaster(new THREE.Vector3(-3.15,75.21,106),new THREE.Vector3(0,0,1),0,8.5)
      .intersectObject(room.art.shell.root,true).length,0,'Keep the actual cell props clear of Goop’s escape path.');
  }finally{level.dispose();}
});

test('the lift-facing wall is sealed to the floor and the shared sliding-door seam clears every opening pose',async()=>{
  const level=new ContainmentLevelScene(()=>{}),shell=level.roomFive.art.shell;
  try{
    await prepare(level);level.root.updateWorldMatrix(true,true);
    for(const x of [-19.5,-15,-8,0,7.4,10.6,15,19.5])for(const y of [74.78,74.95,75.25]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,y,92.6),new THREE.Vector3(0,0,-1),0,2).intersectObject(shell.root,true);
      assert.ok(hits.length>0,`Seal the entrance wall at ${x}, ${y}.`);
    }
    assert.equal(new THREE.Raycaster(new THREE.Vector3(9,76,92.6),new THREE.Vector3(0,0,-1),0,2)
      .intersectObject(shell.root,true).length,0,'Keep the actual door aperture clear.');
    for(const total of [0,48,48.25,48.5,49,49.5,49.75,50]){
      const room=level.roomFour;room.reset();room.elevator.begin();if(total)room.elevator.update(total,[]);
      (room as unknown as {syncPresentation():void}).syncPresentation();
      const triangles=collectOpaqueTriangles(level.root).filter(t=>t.min[2]<92.5&&t.max[2]>90.5&&t.min[1]<80&&t.max[1]>74&&t.min[0]<12&&t.max[0]>6);
      const conflicts:string[]=[];
      findOpaqueSurfaceOverlaps(triangles,.002,(a,b)=>conflicts.push(`${a.owner} / ${b.owner}`));
      assert.deepEqual(conflicts,[],`Door seam at ${total}s.`);
    }
  }finally{level.dispose();}
});

test('the complete atrium has no overlapping opaque surfaces through platform travel, hatch opening and reset',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFive;
  try{
    await prepare(level);
    for(const [time,open] of [[0,0],[1.6,0],[3.2,0],[0,.25],[0,.5],[0,.75],[0,1],[0,0]]){
      room.reset();if(time)room.updateTraversal(time,farBody,[]);room.art.setReleaseProgress(open);
      for(const tolerance of [.0001,.002])assert.deepEqual(auditOpaqueSurfaces(room.root,tolerance).conflicts,[],
        `Opaque overlap at travel ${time}s / hatch ${open} / ${tolerance}m.`);
    }
  }finally{level.dispose();}
});

test('landings and the cell roof retain their walking height while platform art and thrusters interpolate together',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFive;
  try{
    await prepare(level);room.updateTraversal(.4,farBody,[]);
    for(const alpha of [0,.5,1]){
      room.art.presentMovingPlatforms(alpha);level.root.updateWorldMatrix(true,true);
      for(const [index,platform] of [room.movingPlatformOne,room.movingPlatformTwo].entries()){
        const world=room.art.shell.carriages[index].getWorldPosition(new THREE.Vector3());
        const expected=platform.previousPosition.clone().lerp(platform.position,alpha);
        assert.ok(world.distanceTo(expected)<1e-7);
        const top=world.y+platform.size.y/2;
        const hits=new THREE.Raycaster(new THREE.Vector3(world.x,top+.05,world.z),new THREE.Vector3(0,-1,0),0,.1)
          .intersectObject(room.art.shell.carriages[index],true);
        assert.ok(hits[0]);assert.ok(Math.abs(hits[0].point.y-top)<1e-5);
      }
    }
    for(const x of [-2,0,2])for(const z of [108,110,112]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,78.8,z),new THREE.Vector3(0,-1,0),0,.2).intersectObject(room.art.shell.root,true);
      assert.ok(hits[0]);assert.ok(Math.abs(hits[0].point.y-78.675)<1e-5);
    }
  }finally{level.dispose();}
});

test('release visuals follow the real finale clock and the wooden cover keeps one solid, overlap-free dissolve target',async()=>{
  const level=new ContainmentLevelScene(()=>{}),room=level.roomFive;
  try{
    await prepare(level);
    room.art.setReleaseProgress(.15);level.root.updateWorldMatrix(true,true);
    assert.equal(room.art.panelPivots.front.rotation.x,0,'The hatch stays closed until its bolts retract.');
    const locks=room.root.getObjectByName('R5_Locks')!;
    assert.ok(new THREE.Box3().setFromObject(locks).max.y<=75.58001,'Retract the pistons completely below the moving sill.');
    room.art.setReleaseProgress(.16);
    assert.ok(room.art.panelPivots.front.rotation.x>0,'The hatch starts lifting after the bolts are clear.');
    room.reset();assert.equal(room.beginEnding(),true);
    let elapsed=0;
    for(const delta of [.25,1,3,2,3]){
      elapsed+=delta;room.updateEnding(delta);
      const frame=sampleContainmentFinale(elapsed);
      assert.equal(room.art.shell.diagnostics.releaseProgress,frame.panelOpen);
      assert.ok(Math.abs(room.art.panelPivots.front.rotation.x-THREE.MathUtils.clamp((frame.panelOpen-.15)/.85,0,1)*1.65)<1e-8);
    }
    room.reset();assert.equal(room.art.shell.diagnostics.releaseProgress,0);
    assert.ok(Math.abs(room.root.getObjectByName('R5_Locks')!.position.y)<1e-8);
    const wood=room.goopWoodenDoor;
    wood.geometry.computeBoundingBox();
    const size=wood.geometry.boundingBox!.getSize(new THREE.Vector3());
    ROOM_FIVE_ESCAPE.coverSize.forEach((value,index)=>assert.ok(Math.abs(size.getComponent(index)-value)<1e-6));
    assert.equal(wood.userData.solubleId,wood.name);assert.equal(wood.userData.dissolveCollisionDisableProgress,.72);
    assert.deepEqual(auditOpaqueSurfaces(wood,.002).conflicts,[]);
  }finally{level.dispose();}
});

test('unload releases owned atrium geometry once and retains the shared finishes and optical kit',async()=>{
  const level=new ContainmentLevelScene(()=>{}),shell=level.roomFive.art.shell;
  try{
    await prepare(level);
    const geometry=new Set(shell.renderMeshes.map(mesh=>mesh.geometry));let disposed=0,bank=0,optics=0;
    for(const value of geometry)value.addEventListener('dispose',()=>disposed++);
    level.teaching.roomOneArt.shell.borrowFinish('Alloy').addEventListener('dispose',()=>bank++);
    level.roomThree.art.shell.borrowLaserEmitter()!.aperture.addEventListener('dispose',()=>optics++);
    shell.dispose();shell.dispose();assert.equal(disposed,geometry.size);assert.equal(bank,0);assert.equal(optics,0);
    level.dispose();assert.equal(bank,1);assert.equal(optics,1);
  }finally{level.dispose();}
});
