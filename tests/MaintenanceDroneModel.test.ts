import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {MaintenanceDroneDevelopmentFixture} from '../src/vehicles/MaintenanceDroneDevelopmentFixture.ts';
import {MaintenanceDroneModel,parseMaintenanceDroneModel} from '../src/render/environment/blackout/MaintenanceDroneModel.ts';
import {MaintenanceDronePresentation} from '../src/render/environment/blackout/MaintenanceDronePresentation.ts';
import {BlackoutMaintenanceMaterials} from '../src/render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import {auditOpaqueSurfaces} from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import {maintenanceMaps} from './helpers/BlackoutMaintenanceMapData.ts';
import type {MaintenanceDroneReadModel} from '../src/vehicles/MaintenanceDroneTypes.ts';

const bytes=readFileSync(new URL('../assets/vehicles/maintenance-drone/maintenance-drone.glb',import.meta.url));
const load=()=>parseMaintenanceDroneModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const element=()=>({style:{},append(){},remove(){}});
const host=()=>({...element(),ownerDocument:{createElement:element}} as unknown as HTMLElement);

test('authored drone fits its collider and rider, spins only inner rotors, and leaves the searchlight clear',async()=>{
  const fixture=new MaintenanceDroneDevelopmentFixture();
  const presentation=new MaintenanceDronePresentation(fixture.droneRoot,host());
  try{
    const collider=fixture.collider.geometry;
    const anchors=fixture.droneRoot.children.filter(o=>o.name.includes('anchor')).map(o=>({o,position:o.position.toArray()}));
    await presentation.prepare(load);
    const model=fixture.droneRoot.getObjectByName('maintenance-drone-authored-model')!;
    const localRoot=new THREE.Group();localRoot.add(model);localRoot.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    assert.ok(bounds.min.x>=-.825&&bounds.max.x<=.825&&bounds.min.z>=-.825&&bounds.max.z<=.825,'art stays inside protected flight footprint');
    assert.ok(bounds.min.y>=-.25001&&bounds.max.y<.29,'no landing shoe penetrates the floor');
    const saddle=new THREE.Raycaster(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0)).intersectObject(model,true)[0];
    assert.ok(saddle&&Math.abs(saddle.point.y-.27)<1e-5,'Volt sole meets the actual saddle');
    const meshes:THREE.Mesh[]=[],rotors:THREE.Mesh[]=[],fixed:THREE.Mesh[]=[];
    model.traverse(o=>{if(o instanceof THREE.Mesh){meshes.push(o);if(o.userData.owner.startsWith('Rotor_'))rotors.push(o);else fixed.push(o);}});
    assert.equal(rotors.length,4);assert.ok(rotors.every(o=>o.geometry===rotors[0].geometry),'rotor GPU buffers are shared');
    assert.ok(meshes.length<=13,'batch small fittings by finish');
    const triangles=meshes.reduce((n,o)=>n+(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3,0);
    assert.ok(triangles<10000,'keep the craft small');
    const original=fixed.map(o=>o.quaternion.toArray());
    presentation.update(.1,{state:'mounted',powered:true,lightEnabled:true} as MaintenanceDroneReadModel);
    assert.ok(rotors.every(o=>Math.abs(o.rotation.y)>1));
    assert.deepEqual(fixed.map(o=>o.quaternion.toArray()),original,'fan guards and saddle never rotate with blades');
    for(const x of [-.8,0,.8])for(const z of [-.8,0,.8]){
      if(Math.hypot(x,z)>.86)continue;
      const ray=new THREE.Raycaster(new THREE.Vector3(0,-.13,0),new THREE.Vector3(x,-1,z).normalize(),0,2);
      assert.equal(ray.intersectObjects(meshes.filter(o=>o.castShadow),false).length,0,'housing cannot block the landing beam');
    }
    assert.equal(fixture.collider.geometry,collider);
    for(const {o,position}of anchors)assert.deepEqual(o.position.toArray(),position);
    const lamps=meshes.map(o=>o.material as THREE.MeshStandardMaterial).filter(m=>m.name.includes('Lamp'));
    assert.ok(lamps.every(m=>m.emissiveIntensity>0));
    presentation.update(.1,{state:'shorted',powered:false,lightEnabled:false} as MaintenanceDroneReadModel);
    assert.ok(lamps.some(m=>m.emissive.getHex()===0xff421e),'existing short circuit state reaches the authored status lamps');
    for(const mesh of meshes){const m=mesh.material as THREE.MeshStandardMaterial;if(!m.name.includes('Lamp'))assert.equal(m.emissiveIntensity,0,'solid craft stays dark without a real light');}
    model.removeFromParent();fixture.droneRoot.getObjectByName('maintenance-drone-presentation')!.add(model);
  }finally{presentation.dispose();fixture.dispose();}
});

test('fixed guards and moving rotors have no duplicate opaque coverage throughout a turn',async()=>{
  const model=new MaintenanceDroneModel();
  try{
    await model.prepare(load);
    for(const angle of [0,.3,.9,1.7]){
      for(let i=0;i<model.rotors.length;i++)model.rotors[i].rotation.y=angle*(i%2?-1:1);
      const report=auditOpaqueSurfaces(model.root,.0001);
      assert.deepEqual(report.conflicts,[],`rotor angle ${angle}`);
    }
  }finally{model.dispose();}
});

test('drone releases shared geometry once, borrows bay textures, and discards cancelled loads',async()=>{
  const kit=new BlackoutMaintenanceMaterials(maintenanceMaps);
  kit.get('dronePaint');kit.get('machineryMetal');
  const count=kit.diagnostics.textureCount,model=new MaintenanceDroneModel(kit);
  await model.prepare(load);assert.equal(kit.diagnostics.textureCount,count);
  const disposed=new Map<THREE.BufferGeometry,number>();
  model.root.traverse(o=>{if(o instanceof THREE.Mesh&&!disposed.has(o.geometry)){const g=o.geometry;disposed.set(g,0);g.addEventListener('dispose',()=>disposed.set(g,disposed.get(g)!+1));}});
  let textureDisposals=0;
  kit.get('machineryMetal').normalMap!.addEventListener('dispose',()=>textureDisposals++);
  model.dispose();model.dispose();
  assert.ok([...disposed.values()].every(n=>n===1));assert.equal(textureDisposals,0,'model does not own bay texture maps');kit.dispose();assert.equal(textureDisposals,1);
  const cancelled=new MaintenanceDroneModel(),source=await load();let finish!:(s:THREE.Group)=>void;
  const work=cancelled.prepare(()=>new Promise(resolve=>{finish=resolve;}));
  const geometries=new Set<THREE.BufferGeometry>();let lateDisposals=0;
  source.traverse(o=>{if(o instanceof THREE.Mesh&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry.addEventListener('dispose',()=>lateDisposals++);}});
  cancelled.dispose();finish(source);await work;
  assert.equal(cancelled.diagnostics.ready,false);assert.equal(lateDisposals,geometries.size);
});
