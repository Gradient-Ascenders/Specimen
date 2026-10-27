import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createAscentArtFixture,loadAscentArt} from '../scripts/lib/blackout-ascent-art-states.ts';

test('ascent skins retain collision, moving owners, shared shaft buffers and the existing light/map budgets',async()=>{
  const f=createAscentArtFixture();
  try{
    const old=f.lift.collisionMeshes.map(mesh=>({mesh,geometry:mesh.geometry,p:mesh.position.toArray(),q:mesh.quaternion.toArray(),data:structuredClone(mesh.userData)}));
    const lights:THREE.Light[]=[];f.lift.root.traverse(o=>{if(o instanceof THREE.Light)lights.push(o);});
    const maps=f.kit.diagnostics.textureCount;
    await f.prepare();
    for(const s of old){assert.equal(s.mesh.geometry,s.geometry);assert.deepEqual(s.mesh.position.toArray(),s.p);assert.deepEqual(s.mesh.quaternion.toArray(),s.q);assert.deepEqual(s.mesh.userData,s.data);}
    const after:THREE.Light[]=[];f.lift.root.traverse(o=>{if(o instanceof THREE.Light)after.push(o);});
    assert.deepEqual(after,lights);assert.equal(f.kit.diagnostics.textureCount,maps);
    assert.ok(f.lift.art!.diagnostics.triangles<20000);assert.equal(f.lift.art!.diagnostics.newTextures,0);
    const shafts:THREE.Mesh[]=[];f.lift.root.traverse(o=>{if(o instanceof THREE.Mesh&&/^B3_ASC_Batch_Shaft_Steel/.test(o.name))shafts.push(o);});
    assert.equal(shafts.length,6);assert.ok(shafts.every(s=>s.geometry===shafts[0]!.geometry),'six shaft sections share a single upload');
    for(const gate of [f.lift.rearGate,f.lift.frontGate,f.lift.labDoor]){
      assert.equal((gate.material as THREE.Material).visible,false);
      assert.ok(gate.children.some(o=>o.name.startsWith('B3_ASC_')),'real gate carries its render skin');
    }
    for(const [x,y,z]of [[0,.4,175],[0,.4,180.7],[0,.4,187.5]]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,y+.05,z),new THREE.Vector3(0,-1,0),0,.1).intersectObject(f.lift.art!.root,true)[0];
      assert.ok(hit&&Math.abs(hit.point.y-y)<1e-5,'render deck follows the live support exactly');
    }
    f.pose(18,1,0,.25);
    const lamps:THREE.Mesh[]=[];f.lift.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.includes('Batch_Car_Boot'))lamps.push(o);});
    assert.equal(lamps.length,3);assert.equal(lamps.filter(m=>(m.material as THREE.MeshStandardMaterial).emissiveIntensity>.5).length,1);
    f.pose(0,0,0,0);assert.ok(lamps.every(m=>(m.material as THREE.MeshStandardMaterial).emissiveIntensity<.05));
  }finally{f.dispose();}
});

test('ascent ownership releases shared buffers once and discards a cancelled late asset',async()=>{
  const f=createAscentArtFixture(),counts=new Map<THREE.BufferGeometry,number>();
  await f.prepare();
  f.lift.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.startsWith('B3_ASC_')&&!counts.has(o.geometry)){const g=o.geometry;counts.set(g,0);g.addEventListener('dispose',()=>counts.set(g,counts.get(g)!+1));}});
  let mapReleases=0;f.kit.get('wallPanel').normalMap!.addEventListener('dispose',()=>mapReleases++);
  f.lift.dispose();f.lift.dispose();assert.ok([...counts.values()].every(n=>n===1));assert.equal(mapReleases,0);
  f.dispose();assert.equal(mapReleases,1);
  const late=createAscentArtFixture(),source=await loadAscentArt(),geometries=new Set<THREE.BufferGeometry>();let releases=0;
  source.traverse(o=>{if(o instanceof THREE.Mesh&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry.addEventListener('dispose',()=>releases++);}});
  let complete!:(s:THREE.Group)=>void;const pending=late.lift.prepareArt(()=>new Promise(resolve=>{complete=resolve;}));
  late.dispose();complete(source);await pending;
  assert.equal(late.lift.art!.diagnostics.ready,false);assert.equal(releases,geometries.size);
});
