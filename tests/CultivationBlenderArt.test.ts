import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';
import {CULTIVATION_BLENDER_ASSETS} from '../src/render/environment/cultivation/CultivationBlenderManifest.ts';

const layout=JSON.parse(readFileSync(new URL('../assets/environments/cultivation/authoring-layout.json',import.meta.url),'utf8'));

test('the actual Blender buffers replace old coverage and share one Level 1 finish bank without changing collision data',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets);
  try{
    const originals=scene.collisionMeshes.map(mesh=>({mesh,geometry:mesh.geometry,metadata:structuredClone(mesh.userData),
      position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.toArray()}));
    assert.equal(scene.blenderArt.diagnostics.assets,CULTIVATION_BLENDER_ASSETS.length);
    assert.equal(scene.blenderArt.diagnostics.newTextures,6);
    assert.equal(scene.blenderArt.diagnostics.textureBytes,24*1024*1024);
    assert.ok(scene.blenderArt.diagnostics.retiredMeshes>0);
    for(const asset of CULTIVATION_BLENDER_ASSETS){
      const root=(scene as any)[asset.owner].root as THREE.Group;
      for(const batch of asset.batches){
        const mesh=root.getObjectByName(batch.name) as THREE.Mesh;
        assert.ok(mesh?.geometry.getAttribute('uv'),batch.name);
        assert.ok(mesh.geometry.getAttribute('color'),batch.name);
        assert.equal(mesh.matrixAutoUpdate,false,'immutable local matrices still inherit their existing moving owner');
        assert.equal(mesh.parent,batch.target?root.getObjectByName(batch.target):asset.owner==='roomFour'?scene.roomFourGeometry:root);
        if(batch.finish==='Lamp')assert.equal((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity,scene.labArt.fixture.emissiveIntensity);
        else assert.equal((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity??0,0);
      }
    }
    scene.blenderArt.dispose();scene.blenderArt.dispose();
    for(const s of originals){
      assert.equal(s.mesh.geometry,s.geometry);assert.deepEqual(s.mesh.userData,s.metadata);
      assert.deepEqual(s.mesh.position.toArray(),s.position);assert.deepEqual(s.mesh.quaternion.toArray(),s.quaternion);
      assert.deepEqual(s.mesh.scale.toArray(),s.scale);
    }
  }finally{scene.dispose();}
});

test('front-sided opaque coverage seals the authored wall, floor and ceiling footprints, including close wall views',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),failures:unknown[]=[];
  try{
    for(const asset of CULTIVATION_BLENDER_ASSETS){
      const room=(scene as any)[asset.owner].root as THREE.Group;room.visible=true;
      const owner=(layout[asset.id].defaultTarget?room.getObjectByName(layout[asset.id].defaultTarget):room) as THREE.Group;
      owner.visible=true;
      const meshes:THREE.Mesh[]=[];
      owner.traverse(o=>{if(o instanceof THREE.Mesh){
        let visible=true;for(let p:THREE.Object3D|null=o;p&&p!==owner;p=p.parent)visible&&=p.visible;
        if(visible&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.visible&&!m.transparent&&m.colorWrite))meshes.push(o);
      }});
      scene.root.updateWorldMatrix(true,true);
      for(const spec of layout[asset.id].boxes){
        const lo=spec.lo as number[],hi=spec.hi as number[],size=hi.map((v,i)=>v-lo[i]);
        const axis=size.indexOf(Math.min(...size)),other=[0,1,2].filter(i=>i!==axis);
        const n=new THREE.Vector3();let inward:number;
        if(axis===1)inward=/floor|landing-tile/.test(spec.name)?1:-1;
        else inward=spec.inward??((lo[axis]+hi[axis])/2<(axis===2?1:0)?1:-1);
        n.setComponent(axis,inward);
        const aCount=Math.max(2,Math.ceil(size[other[0]]/2)),bCount=Math.max(2,Math.ceil(size[other[1]]/2));
        for(let a=0;a<aCount;a++)for(let b=0;b<bCount;b++){
          const point=new THREE.Vector3().fromArray(lo);
          point.setComponent(axis,inward>0?hi[axis]:lo[axis]);
          point.setComponent(other[0],lo[other[0]]+size[other[0]]*(a+.5)/aCount);
          point.setComponent(other[1],lo[other[1]]+size[other[1]]*(b+.5)/bCount);
          const from=owner.localToWorld(point.addScaledVector(n,.15));
          const direction=n.clone().negate().transformDirection(owner.matrixWorld);
          const ray=new THREE.Raycaster(from,direction,0,spec.coverageDepth??2.5);
          if(!ray.intersectObjects(meshes,false).length)failures.push({room:asset.id,source:spec.name,point:from.toArray()});
        }
      }
      if(asset.id==='room-1'){
        // Floor paint replaces its substrate face. Probe both sides of its
        // boundaries so a missing patch cannot pass by hitting deeper backing.
        for(const z of [8.1399,8.1401,8.31,8.4799,8.4801,8.6199,8.6201,8.7199,8.7201,
          43.2799,43.2801,43.3799,43.3801,43.5199,43.5201,43.69,43.8599,43.8601]){
          const from=owner.localToWorld(new THREE.Vector3(.96,.5,z));
          const hit=new THREE.Raycaster(from,new THREE.Vector3(0,-1,0),0,.5).intersectObjects(meshes,false)[0];
          assert.ok(hit,`opaque floor at paint boundary ${z}`);
          assert.ok(Math.abs(owner.worldToLocal(hit.point.clone()).y-.2)<1e-5,`floor height at paint boundary ${z}`);
          assert.equal((hit.object as THREE.Mesh).material instanceof THREE.MeshStandardMaterial,true);
        }
      }
      if(asset.id==='room-5'){
        // Front-sided radial probes cover the true vault and its deep joints;
        // its angled panels are deliberately absent from the AABB footprint list.
        for(const z of [16.2,19.8,21.7,39.97,64.02,95.97,121.99,122.01,122.06,123.8,125.94,125.99,126.01,139.8]){
          for(let cell=0;cell<20;cell++)for(const phase of [.001,.5,.999]){
            if(z>18.5&&z<21.5&&(cell===9||cell===10))continue;
            const angle=(cell+phase)*Math.PI/20,n=new THREE.Vector3(Math.cos(angle),Math.sin(angle),0);
            const from=owner.localToWorld(new THREE.Vector3(40,-12,z).addScaledVector(n,9.55));
            const ray=new THREE.Raycaster(from,n.transformDirection(owner.matrixWorld),0,2);
            if(!ray.intersectObjects(meshes,false).length)failures.push({room:asset.id,source:'vault joint',cell,phase,z});
          }
        }
        const drop=owner.localToWorld(new THREE.Vector3(40,-2.45,20));
        assert.equal(new THREE.Raycaster(drop,new THREE.Vector3(0,1,0),0,2.4).intersectObjects(meshes,false).length,0,
          'the intentional crown drop must remain open into the duct');
      }
    }
    assert.deepEqual(failures.slice(0,24),[],`${failures.length} uncovered sampled structural points`);
  }finally{scene.dispose();}
});
