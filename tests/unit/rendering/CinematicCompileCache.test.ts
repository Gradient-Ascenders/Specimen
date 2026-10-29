import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {CinematicCompileCache} from '../../../src/render/CinematicCompileCache.ts';

test('cinematic compilation reuses unchanged objects but invalidates features and light layouts',async()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);let calls=0;
  const renderer={outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.ACESFilmicToneMapping,shadowMap:{enabled:true,type:THREE.PCFShadowMap},
    clippingPlanes:[],localClippingEnabled:false,compileAsync:async()=>{calls++;}} as unknown as THREE.WebGLRenderer;
  const cache=new CinematicCompileCache();await cache.compile(renderer,scene,camera);
  mesh.position.x=10;await cache.compile(renderer,scene,camera);assert.equal(calls,1);
  material.transparent=true;await cache.compile(renderer,scene,camera);assert.equal(calls,2);
  scene.add(new THREE.SpotLight());await cache.compile(renderer,scene,camera);assert.equal(calls,3);
  mesh.receiveShadow=true;await cache.compile(renderer,scene,camera);assert.equal(calls,4);
  const hidden=new THREE.Mesh(geometry,material),owner=new THREE.Group();owner.visible=false;owner.add(hidden);scene.add(owner);
  await cache.compile(renderer,scene,camera);assert.equal(calls,4,'hidden shots do not compile unrelated actors');
  owner.visible=true;await cache.compile(renderer,scene,camera);assert.equal(calls,5,'a newly visible actor still gets prepared');
  geometry.dispose();material.dispose();
});
