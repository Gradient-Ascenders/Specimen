import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {BlackoutMaintenanceBay} from '../src/levels/BlackoutMaintenanceBay.ts';
import {BlackoutMaintenanceBayController} from '../src/levels/BlackoutMaintenanceBayController.ts';
import {parseBlackoutMaintenanceArt} from '../src/render/environment/blackout/BlackoutMaintenanceArt.ts';
import {CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {ElectricalTargetRegistry} from '../src/abilities/ElectricalTargetRegistry.ts';
import {maintenanceMaps} from './helpers/BlackoutMaintenanceMapData.ts';

const bytes=readFileSync(new URL('../assets/environments/blackout-maintenance/maintenance-bay.glb',import.meta.url));
const load=()=>parseBlackoutMaintenanceArt(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
function setup(){
  const bay=new BlackoutMaintenanceBay(maintenanceMaps),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  world.registerAll(bay.collisionMeshes);surfaces.registerAll(bay.collisionMeshes);
  const registry=new ElectricalTargetRegistry(world),controller=new BlackoutMaintenanceBayController(bay,world,surfaces,registry);
  return {bay,controller,dispose(){controller.dispose();registry.dispose();bay.dispose();world.clear();surfaces.clear();}};
}

test('authored maintenance bay keeps collision, landing heights and borrowed texture ownership',async()=>{
  const s=setup();
  try{
    const snapshots=s.bay.collisionMeshes.map(mesh=>({mesh,geometry:mesh.geometry,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),data:{...mesh.userData}}));
    const textures=s.bay.surfaceMaterials.diagnostics.textureCount;
    await s.bay.prepareArt(s.controller.door.collisionMesh,load);
    assert.equal(s.bay.art.diagnostics.ready,true);
    assert.ok(s.bay.art.diagnostics.triangles<22000,'keep the bay and both connector routes a small geometry addition');
    assert.equal(s.bay.surfaceMaterials.diagnostics.textureCount,textures,'authored finishes borrow existing texture families');
    assert.equal(s.bay.art.diagnostics.newTextures,0);assert.equal(s.bay.art.diagnostics.newLights,0);
    for(const old of snapshots){
      assert.equal(old.mesh.geometry,old.geometry);assert.deepEqual(old.mesh.position.toArray(),old.position);
      assert.deepEqual(old.mesh.quaternion.toArray(),old.quaternion);assert.deepEqual(old.mesh.userData,old.data);
    }
    for(const [x,top,z]of [[-3,.15,17],[1.5,.45,28.5],[-2.5,.15,40]]){
      for(const offset of [-2.3,0,2.3]){
        const ray=new THREE.Raycaster(new THREE.Vector3(x+offset,top+2,z),new THREE.Vector3(0,-1,0),0,3);
        const hit=ray.intersectObject(s.bay.art.root,true)[0];assert.ok(hit,'rendered deck covers the landing');
        assert.ok(Math.abs(hit.point.y-top)<1e-5,'authored tops match the protected jump heights');
      }
    }
    for(const side of [-1,1])for(const z of [0,8,16,25,39,50])for(const y of [.08,1.2,4.92,8.96,11.95]){
      const ray=new THREE.Raycaster(new THREE.Vector3(0,y,z),new THREE.Vector3(side,0,0),0,20);
      assert.ok(ray.intersectObject(s.bay.art.root,true).length,`wall backing seals x=${side}, y=${y}, z=${z}`);
    }
    for(const [x,y,z]of [[6,0,56],[6,0,70],[6,.225,77],[-6,0,57],[-11,0,61.5],[-16,7*2.58/17,70],[-16,2.5,83]]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,y+.05,z),new THREE.Vector3(0,-1,0),0,.1).intersectObject(s.bay.art.root,true)[0];
      assert.ok(hit&&Math.abs(hit.point.y-y)<1e-5,`connector tread follows the actual support at ${x},${z}`);
    }
    for(const side of [-1,1])for(const z of [56,59,63.5,68,73,78])for(const y of [1.13,2.71]){
      const hits=new THREE.Raycaster(new THREE.Vector3(6,y,z),new THREE.Vector3(side,0,0),0,4).intersectObject(s.bay.art.root,true);
      assert.ok(hits.length,`corridor backing seals panel joints at ${side},${y},${z}`);
    }
    const fan=s.bay.art.root.getObjectByName('blackout-connector-fan')!;
    s.bay.art.update(.5,true);assert.ok(fan.rotation.x<-.2,'the recessed fan turns');
    s.bay.resetConnector();assert.equal(fan.rotation.x,0,'reset retains the authored fan pose');
  }finally{s.dispose();}
});

test('door borrows its skin until controller disposal; late cancelled loads release their own buffers',async()=>{
  const s=setup();
  const disposed=new Map<THREE.BufferGeometry,number>();
  try{
    await s.bay.prepareArt(s.controller.door.collisionMesh,load);
    s.bay.root.traverse(object=>{
      if(object instanceof THREE.Mesh&&object.name.startsWith('B3_R1_')){
        const geometry=object.geometry;
        if(!disposed.has(geometry)){disposed.set(geometry,0);geometry.addEventListener('dispose',()=>disposed.set(geometry,disposed.get(geometry)!+1));}
      }
    });
    s.controller.dispose();
    assert.ok([...disposed.values()].every(count=>count===0),'the door controller cannot dispose borrowed Blender buffers');
    s.bay.dispose();
    assert.ok([...disposed.values()].every(count=>count===1),'the art owner releases every buffer exactly once');
  }finally{s.dispose();}
  const cancelled=setup(),source=await load(),late=new Map<THREE.BufferGeometry,number>();
  source.traverse(object=>{if(object instanceof THREE.Mesh){const geometry=object.geometry;late.set(geometry,0);geometry.addEventListener('dispose',()=>late.set(geometry,late.get(geometry)!+1));}});
  let finish!:(source:THREE.Group)=>void;
  const work=cancelled.bay.prepareArt(cancelled.controller.door.collisionMesh,()=>new Promise(resolve=>{finish=resolve;}));
  cancelled.dispose();finish(source);await work;
  assert.equal(cancelled.bay.art.diagnostics.ready,false);
  assert.ok([...late.values()].every(count=>count===1),'an abandoned loader never adopts or leaks late geometry');
});
