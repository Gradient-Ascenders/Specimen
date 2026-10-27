import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createTransitArtFixture,loadTransitArt,TRANSIT_ART_POSES} from '../scripts/lib/blackout-transit-art-states.ts';
import {auditOpaqueSurfaces} from '../src/render/geometry/OpaqueSurfaceAudit.ts';

test('distribution hall preserves live collision and electrical targets, with prepared device skins and shared maps',async()=>{
  const f=createTransitArtFixture();
  try{
    const colliders=[...f.room.collisionMeshes,...f.controller.lifts.map(l=>l.platform.collisionMesh)];
    const old=colliders.map(mesh=>({mesh,geometry:mesh.geometry,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),data:structuredClone(mesh.userData)}));
    const targets=[...f.controller.lights,f.controller.lockReceiver].map(r=>({r,target:r.target,meshes:[...r.target.hitMeshes],material:r.targetMaterial}));
    const lights:THREE.Light[]=[];f.scene.root.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});
    const textureCount=f.kit.diagnostics.textureCount;
    await f.prepare();
    assert.equal(f.controller.root.parent,f.scene.root,'match the production machinery hierarchy');
    for(const lift of f.controller.lifts){
      assert.equal(lift.platform.collisionMesh.material.visible,false,'only the authored deck renders over the live collider');
      const stem=lift.root.getObjectByName(lift.id+'-contact-mount') as THREE.Mesh;
      assert.equal((stem.material as THREE.Material).visible,false,'the old conducting stem is also retired outside the room root');
    }
    for(const saved of old){
      assert.equal(saved.mesh.geometry,saved.geometry);assert.deepEqual(saved.mesh.position.toArray(),saved.position);
      assert.deepEqual(saved.mesh.quaternion.toArray(),saved.quaternion);assert.deepEqual(saved.mesh.scale.toArray(),saved.scale);
      assert.deepEqual(saved.mesh.userData,saved.data);
    }
    for(const {r,target,meshes,material}of targets){assert.equal(r.target,target);assert.deepEqual(r.target.hitMeshes,meshes);assert.equal(r.targetMaterial,material);}
    const afterLights:THREE.Light[]=[];f.scene.root.traverse(o=>{if(o instanceof THREE.Light)afterLights.push(o);});
    assert.deepEqual(afterLights,lights);assert.equal(f.kit.diagnostics.textureCount,textureCount);
    assert.ok(f.room.art!.diagnostics.triangles<35000);assert.ok(f.room.art!.diagnostics.meshes<100);
    for(const lamp of f.controller.lights)assert.equal(lamp.targetMaterial.visible,true,'conducting diffusors remain visible and targetable');
    for(const name of ['transit-bridge-end-marking','goop-acid-exit-ramp','transit-exit-hallway-floor']){
      const source=f.room.root.getObjectByName(name) as THREE.Mesh;
      assert.equal((source.material as THREE.Material).visible,false,'old tile finishes and raised junction strip are retired');
    }
    for(const [i,bank]of f.controller.lights.entries()){
      const beam=bank.root.getObjectByName('B3_R2_Batch_Bank'+String.fromCharCode(65+i)+'_Alloy')!;
      assert.ok(Math.abs(new THREE.Box3().setFromObject(beam).max.y-22)<1e-4,'metal suspension reaches the roof');
      bank.root.traverse(o=>{if(o instanceof THREE.Mesh)assert.notEqual(o.userData.finish,'Copper','light banks have no orange wire feeds');});
    }
    f.pose(1,1);
    for(const lift of f.controller.lifts){
      const mesh=lift.root.children.find(o=>o.name.includes('B3_R2_Batch_Lift')&&o.name.endsWith('_Deck'))!;
      assert.ok(mesh,'the actual moving owner carries its deck');
      const top=new THREE.Box3().setFromObject(lift.platform.collisionMesh).max.y;
      const hit=new THREE.Raycaster(lift.root.position.clone().add(new THREE.Vector3(0,4,0)),new THREE.Vector3(0,-1,0),0,5).intersectObject(mesh,true)[0];
      assert.ok(hit&&Math.abs(hit.point.y-top)<1e-5,'moving skin keeps the live platform top');
    }
    for(const [x,y,z]of [[10,1,94],[10.5,1.2,102],[10,4.2,118],[9.5,4.4,126],[10,7.6,142.5],[-16,2.5,113],
      [0,.4,144],[0,.4,164],[11,-.29,145]]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,y+.05,z),new THREE.Vector3(0,-1,0),0,.1).intersectObject(f.room.art!.root,true)[0];
      assert.ok(hit&&Math.abs(hit.point.y-y)<1e-5,`rendered landing at ${x},${y},${z}`);
    }
    const acid=f.room.root.getObjectByName('transit-acid-surface') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    assert.equal(acid.material.emissiveIntensity,.048,'acid has a faint room-local glow');
    f.room.art!.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial)assert.equal(o.material.emissiveIntensity,0,'architecture cannot illuminate a blackout');});
  }finally{f.dispose();}
});

test('assembled transit art stays disjoint across bridge/lift travel, and seals walls and protected bores',async()=>{
  const f=createTransitArtFixture();
  try{
    await f.prepare();
    for(const pose of TRANSIT_ART_POSES){
      f.pose(pose.bridge,pose.lift,pose.powered);
      const report=auditOpaqueSurfaces(f.scene.root,.0001);
      assert.deepEqual(report.conflicts.filter(c=>c.first.includes('B3_R2_')||c.second.includes('B3_R2_')),[],pose.name);
    }
    for(const side of [-1,1])for(const y of [-.7,.1,6.85,13.75,20])for(const z of [82,100,117,138,154]){
      const ray=new THREE.Raycaster(new THREE.Vector3(0,y,z),new THREE.Vector3(side,0,0),0,24);
      assert.ok(ray.intersectObject(f.room.art!.root,true).length,`wall coverage ${side},${y},${z}`);
    }
    for(const [x,y]of [[6,1.5],[-16,3.6]]){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,y,78),new THREE.Vector3(0,0,1),0,4);
      assert.equal(ray.intersectObject(f.room.art!.root,true).length,0,'the two entry bores stay open');
    }
    const exitRay=new THREE.Raycaster(new THREE.Vector3(0,1.5,154),new THREE.Vector3(0,0,1),0,19);
    assert.equal(exitRay.intersectObject(f.room.art!.root,true).length,0,'the jammed shutter leaves its passage clear');
  }finally{f.dispose();}
});

test('device disposal detaches borrowed art; late preparation cannot leak geometry or dispose bay maps',async()=>{
  const f=createTransitArtFixture(),disposed=new Map<THREE.BufferGeometry,number>();
  await f.prepare(false);
  f.scene.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.startsWith('B3_R2_')&&!disposed.has(o.geometry)){const g=o.geometry;disposed.set(g,0);g.addEventListener('dispose',()=>disposed.set(g,disposed.get(g)!+1));}});
  let mapsDisposed=0;f.kit.get('floorDeck').normalMap!.addEventListener('dispose',()=>mapsDisposed++);
  f.controller.dispose();assert.ok([...disposed.values()].every(v=>v===0));
  f.room.dispose();assert.ok([...disposed.values()].every(v=>v===1));assert.equal(mapsDisposed,0);
  f.dispose();assert.equal(mapsDisposed,1);
  const late=createTransitArtFixture(),source=await loadTransitArt();let complete!:(s:THREE.Group)=>void;
  const pending=late.controller.prepareArt(()=>new Promise(resolve=>{complete=resolve;}));
  const geometries=new Set<THREE.BufferGeometry>();let releases=0;
  source.traverse(o=>{if(o instanceof THREE.Mesh&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry.addEventListener('dispose',()=>releases++);}});
  late.dispose();complete(source);await pending;
  assert.equal(late.room.art!.diagnostics.ready,false);assert.equal(releases,geometries.size);
});
