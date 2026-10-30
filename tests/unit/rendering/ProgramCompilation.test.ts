import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ProgramCompilation } from '../../../src/render/ProgramCompilation.ts';

test('compilation snapshots every submitted program and polls shared materials only once', async () => {
  let queries = 0, ready = false, secondReady = false;
  const a = {isReady: () => { queries++; return ready; }};
  const b = {isReady: () => secondReady};
  const c = {isReady: () => { throw Error('a later material selection must not replace the pending program'); }};
  const properties = {currentProgram: a};
  const materials = new Set(Array.from({length: 100}, () => new THREE.MeshBasicMaterial()));
  const renderer = {
    localClippingEnabled: false, clippingPlanes: [], info: {programs: [] as unknown[]},
    extensions: {has: () => true}, properties: {get: () => properties},
    compile: () => {renderer.info.programs.push(a, b);return materials;},
    compileAsync: async () => new THREE.Scene(),
  };
  const original = renderer.compileAsync;
  const compilation = new ProgramCompilation(renderer as unknown as THREE.WebGLRenderer);
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const pending = (renderer as unknown as THREE.WebGLRenderer).compileAsync(scene, camera);
    assert.equal(queries, 1);
    properties.currentProgram = c;
    ready = true;
    let completed = false;
    void pending.then(() => {completed = true;});
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(completed, false, 'an earlier geometry/face program must finish too');
    secondReady = true;
    assert.equal(await pending, scene);
    assert.equal(queries, 2);
  } finally {
    compilation.dispose();
    for (const material of materials) material.dispose();
  }
  assert.equal(renderer.compileAsync, original);
});

test('clipping seeds precede heavy submissions while every group still receives its state-setting draw', () => {
  for (const local of [true,false]) {
    const events:string[]=[],materialA=new THREE.MeshBasicMaterial(),materialB=new THREE.MeshBasicMaterial();
    const planes=Array.from({length:6},()=>new THREE.Plane(new THREE.Vector3(1,0,0),1));
    materialB.clippingPlanes=planes;materialB.clipIntersection=true;
    const geometry=new THREE.BoxGeometry(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    scene.add(new THREE.Mesh(geometry,materialA),new THREE.Mesh(geometry,materialB));
    let target:THREE.WebGLRenderTarget|null=null,scissorTest=false;
    const viewport=new THREE.Vector4(3,4,50,60),scissor=viewport.clone();
    const set=(v:THREE.Vector4,x:number|THREE.Vector4,y=0,z=0,w=0)=>x instanceof THREE.Vector4?v.copy(x):v.set(x,y,z,w);
    let clip=0,intersection=false,fail=false,fallback=0;const seeded=new Set<string>();
    const renderer={
      localClippingEnabled:local,clippingPlanes:local?[]:[new THREE.Plane()],transmissionResolutionScale:.5,
      info:{programs:[] as {isReady():boolean}[],render:{calls:0,triangles:0,points:0,lines:0}},extensions:{has:()=>false},
      getViewport:(v:THREE.Vector4)=>v.copy(viewport),getScissor:(v:THREE.Vector4)=>v.copy(scissor),
      getScissorTest:()=>scissorTest,getRenderTarget:()=>target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getPixelRatio:()=>1,
      setRenderTarget:(v:THREE.WebGLRenderTarget|null)=>{target=v;},
      setViewport:(x:number|THREE.Vector4,y?:number,z?:number,w?:number)=>set(viewport,x,y,z,w),
      setScissor:(x:number|THREE.Vector4,y?:number,z?:number,w?:number)=>set(scissor,x,y,z,w),
      setScissorTest:(v:boolean)=>{scissorTest=v;},
      render:(seed:THREE.Scene)=>{const m=(seed.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material;
        clip=m.clippingPlanes?.length??0;intersection=m.clipIntersection;events.push('seed:'+clip+':'+intersection);const key=clip+':'+intersection;if(!seeded.has(key)){seeded.add(key);renderer.info.programs.push({isReady:()=>{events.push('ready:'+key);return true;}});}},
      compile:(batch:THREE.Object3D)=>{events.push('compile:'+clip+':'+intersection);if(fail)throw Error('compile failure');
        const result=new Set<THREE.Material>();batch.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of [o.material].flat())result.add(m);});return result;},
      compileAsync:async()=>{fallback++;return scene;},
    };
    const typed=renderer as unknown as THREE.WebGLRenderer,owner=new ProgramCompilation(typed);
    try{
      typed.compile(scene,camera);
      assert.deepEqual(events,local?['seed:0:false','seed:6:true','ready:0:false','ready:6:true','seed:0:false','compile:0:false','seed:6:true','compile:6:true']:['seed:0:false','compile:0:false']);
      assert.deepEqual(viewport.toArray(),[3,4,50,60]);assert.equal(target,null);assert.equal(scissorTest,false);
      fail=true;assert.throws(()=>typed.compile(scene,camera),/compile failure/);
      assert.deepEqual(viewport.toArray(),[3,4,50,60]);assert.equal(target,null);
      void typed.compileAsync(scene,camera);assert.equal(fallback,1,'no-extension fallback remains delegated');
      renderer.localClippingEnabled=false;renderer.clippingPlanes=[];fail=false;events.length=0;
      typed.compile(scene,camera);assert.equal(events[0],'seed:0:false','leaving clipping resets seed state');
    }finally{owner.dispose();geometry.dispose();materialA.dispose();materialB.dispose();}
  }
});
