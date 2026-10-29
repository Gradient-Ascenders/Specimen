import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLightLayout} from '../../../src/render/ContainmentLightLayout.ts';
import {GreyboxLevelRuntime} from '../../../src/levels/GreyboxLevelRuntime.ts';

test('leaving an empty vent-culling scope refreshes restored padding before the next draw',()=>{
  const scene=new THREE.Scene();
  for(let i=0;i<6;i++)scene.add(new THREE.PointLight());
  for(let i=0;i<3;i++)scene.add(new THREE.SpotLight());
  const layout=new ContainmentLightLayout(scene),camera=new THREE.PerspectiveCamera();
  // Previous Room 1 layout needed six points; Room 2 now needs seven.
  for(const light of layout.root.children)if(light instanceof THREE.PointLight)light.visible=false;
  const points=()=>{let count=0;scene.traverseVisible(o=>{if(o instanceof THREE.PointLight)count++;});return count;};
  let refreshes=0;
  const runtime={lightLayout:layout,lastShadowLayoutKey:undefined,preparationLightState:new THREE.Group(),
    renderLayer:{graphicsConfiguration:{},scene,cameraRig:{camera},renderer:{shadowMap:{type:THREE.PCFShadowMap},compile:()=>refreshes++}}};
  const level={configureLightingQuality:()=>{},lighting:{visibleRoomMask:4,prepareShadowFrame:()=>{}}};
  const refresh=()=> (GreyboxLevelRuntime.prototype as any).prepareContainmentShadows.call(runtime,level,[]);
  layout.withCameraCulling(camera,()=>{refresh();assert.equal(points(),7);});
  assert.equal(points(),6); // temporary scope restored its incoming state
  refresh();assert.equal(points(),7);assert.equal(refreshes,2);
  refresh();assert.equal(refreshes,2); // unchanged ordinary views stay cached
  layout.dispose();
});

test('empty and nonempty vent scopes restore their key and padding on draw failure',()=>{
  const scene=new THREE.Scene(),light=new THREE.SpotLight();light.castShadow=true;light.distance=1;light.position.set(1000,0,0);scene.add(light);
  const layout=new ContainmentLightLayout(scene),camera=new THREE.PerspectiveCamera();
  const before=layout.root.children.map(o=>o.visible);
  for(const distance of [0,1]){
    light.distance=distance;
    assert.throws(()=>layout.withCameraCulling(camera,()=>{assert.ok(layout.cameraCullKey.startsWith('camera:'));throw Error('draw');}),/draw/);
    assert.equal(layout.cameraCullKey,'');assert.equal(light.visible,true);
    assert.deepEqual(layout.root.children.map(o=>o.visible),before);
  }
  layout.dispose();
});
