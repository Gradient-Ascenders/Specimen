import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {LevelTwoPreviewScene} from '../src/levels/LevelTwoPreviewScene.ts';
import {cultivationAssets} from './helpers/CultivationBakedAssets.ts';

test('every Cultivation fixture shares the exact Level 1 Blender camera buffers and keeps live gimbals',async()=>{
  const bytes=await readFile(new URL('../assets/environments/opening-laboratory/opening-laboratory.glb',import.meta.url));
  const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const world=new LevelTwoPreviewScene(()=>{},cultivationAssets),buffers=new Map<string,THREE.BufferGeometry>();
  try{
    assert.equal(world.surveillanceArt.diagnostics.cameras,3);
    assert.equal(world.surveillanceArt.diagnostics.textureCount,0);
    for(const observation of [world.roomOneObservation,world.roomTwoObservation,world.roomThreeObservation]){
      const camera=observation.cameras.cameras[0],model=camera.tilt.getObjectByName('containment-authored-surveillance-camera');
      assert.ok(model);assert.equal(camera.pan.matrixAutoUpdate,true);assert.equal(camera.tilt.matrixAutoUpdate,true);
      assert.equal(camera.tilt.getObjectByName(camera.placement.id+'-housing')!.visible,false);
      model.traverse(object=>{if(object instanceof THREE.Mesh){
        assert.equal(object.castShadow,false);assert.equal(object.receiveShadow,false);
        if(buffers.has(object.name))assert.equal(object.geometry,buffers.get(object.name));else buffers.set(object.name,object.geometry);
        if(!object.name.startsWith('OI_Camera_'))return;
        const original=source.getObjectByName(object.name) as THREE.Mesh;assert.ok(original);
        for(const name of ['position','uv']){
          assert.deepEqual(object.geometry.getAttribute(name)?.array,original.geometry.getAttribute(name)?.array,name);
        }
        const actual=object.geometry.getAttribute('normal'),expected=original.geometry.getAttribute('normal');
        assert.equal(actual.count,expected.count);
        for(let i=0;i<actual.array.length;i++)assert.ok(Math.abs(actual.array[i]-expected.array[i])<1e-6,'normal normalization retains the same surface');
        assert.deepEqual(object.geometry.index?.array,original.geometry.index?.array);
      }});
    }
    assert.equal(buffers.size,5,'four authored finishes and the shared recording indicator');
    world.reset();
    for(const o of [world.roomOneObservation,world.roomTwoObservation,world.roomThreeObservation])
      assert.ok(o.cameras.cameras[0].tilt.getObjectByName('containment-authored-surveillance-camera'));
    const disposals=new Map([...buffers.values()].map(g=>[g,0]));
    for(const [geometry]of disposals)geometry.addEventListener('dispose',()=>disposals.set(geometry,disposals.get(geometry)!+1));
    let borrowed=0;world.labArt.metal.addEventListener('dispose',()=>borrowed++);
    world.surveillanceArt.dispose();world.surveillanceArt.dispose();
    assert.equal(borrowed,0);assert.deepEqual([...disposals.values()],[1,1,1,1,1]);
    for(const o of [world.roomOneObservation,world.roomTwoObservation,world.roomThreeObservation])
      assert.equal(o.cameras.cameras[0].tilt.getObjectByName(o.cameras.cameras[0].placement.id+'-housing')!.visible,true);
  }finally{
    world.dispose();source.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
  }
});
