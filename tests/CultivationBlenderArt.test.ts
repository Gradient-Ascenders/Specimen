import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';
import {CULTIVATION_BLENDER_ASSETS} from '../src/render/environment/cultivation/CultivationBlenderManifest.ts';
import {CollisionWorld} from '../src/physics/CollisionWorld.ts';
import {SurfaceRegistry} from '../src/physics/SurfaceRegistry.ts';
import {createAuthoredDissolveTarget} from '../src/abilities/DissolveTarget.ts';

const layout=JSON.parse(readFileSync(new URL('../assets/environments/cultivation/authoring-layout.json',import.meta.url),'utf8'));

test('the decontamination passage has front-sided enclosure and clear shared doorway openings',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),passage=scene.roomOneToTwoPassage;
  try{
    const meshes:THREE.Mesh[]=[];
    passage.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.parent===passage.root&&o.userData.blenderBatch){
      const materials=Array.isArray(o.material)?o.material:[o.material];
      if(materials.some(m=>m.visible&&!m.transparent))meshes.push(o);
    }});
    scene.root.updateWorldMatrix(true,true);
    const hit=(point:THREE.Vector3,direction:THREE.Vector3,far=3)=>
      new THREE.Raycaster(passage.root.localToWorld(point),direction,0,far).intersectObjects(meshes,false);
    const uncovered:unknown[]=[];
    // Wall probes begin above the finished floor, outside its opaque volume.
    for(const side of [-1,1])for(const z of [.25,.76,3.5,7.475,7.525,10.73,13.9,17.175,17.225,18.7,20.775,20.825,22,23.6,26.3,27.2,27.9]){
      for(const y of [.23,.5,1.25,2.2,3.6,5.3,5.48,6.15,6.34])
        if(!hit(new THREE.Vector3(side*3.7,y,z),new THREE.Vector3(side,0,0)).length)uncovered.push({side,y,z});
    }
    assert.deepEqual(uncovered,[],'side returns have opaque coverage');
    for(const x of [-3.7,-2.1,0,.3,2.1,3.7])for(const z of [.1,3.5,7.7,12.3,17.6,22.9,23.6,24.4,26.8,27.9]){
      assert.ok(hit(new THREE.Vector3(x,.6,z),new THREE.Vector3(0,-1,0),1).length,'floor and drain remain opaque');
      assert.ok(hit(new THREE.Vector3(x,6.3,z),new THREE.Vector3(0,1,0),.5).length,'ceiling joints remain opaque');
    }
    for(const z of [-.25,26.75])for(const x of [-1.7,0,1.7])for(const y of [.6,2.3,4.3])
      assert.equal(hit(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,1),1.5).length,0,'no static art crosses the existing doorway');
    assert.equal(scene.passageArt.root.children.length,0,'superseded procedural dressing is excluded from preparation');
  }finally{scene.dispose();}
});

test('authored support skins share the original dissolve progress, feedback and shadow masks through release/reset',()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),world=new CollisionWorld(),surfaces=new SurfaceRegistry();
  const targets=scene.solubleTargetMeshes.map(mesh=>createAuthoredDissolveTarget(mesh,world,surfaces)!);
  const compile=(material:THREE.Material)=>{
    const shader={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:'#include <common>\n#include <project_vertex>',
      fragmentShader:'#include <common>\n#include <clipping_planes_fragment>\n#include <emissivemap_fragment>'};
    material.onBeforeCompile(shader,null as never);return shader;
  };
  try{
    scene.bindDissolveTargets(targets);
    for(const target of targets.filter(target=>target.mesh.name.startsWith('cultivation-room-1-platform-'))){
      const geometry=target.mesh.geometry;
      const skin=target.mesh.children.find((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&o.userData.blenderBatch)!;
      assert.ok(skin);assert.equal((target.mesh.material as THREE.Material).visible,false);
      assert.equal((skin.material as THREE.Material).visible,true);
      const original=compile(target.mesh.material as THREE.Material),art=compile(skin.material as THREE.Material);
      assert.equal(art.uniforms.uDissolveAmount,original.uniforms.uDissolveAmount);
      assert.equal(art.uniforms.uAimHighlightStrength,original.uniforms.uAimHighlightStrength);
      assert.equal(art.uniforms.uBurnHighlightStrength,original.uniforms.uBurnHighlightStrength);
      assert.equal(skin.customDepthMaterial,target.mesh.customDepthMaterial);
      assert.equal(skin.customDistanceMaterial,target.mesh.customDistanceMaterial);
      target.advance(target.dissolveDurationSeconds*.45);
      assert.equal(art.uniforms.uDissolveAmount.value,target.progress);
      target.advance(target.dissolveDurationSeconds);
      assert.equal(target.mesh.visible,false);assert.equal(art.uniforms.uDissolveAmount.value,1);
      target.reset();assert.equal(target.mesh.visible,true);assert.equal(art.uniforms.uDissolveAmount.value,0);
      assert.equal(target.mesh.geometry,geometry);
    }
  }finally{for(const target of targets)target.dispose();scene.dispose();}
});

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
