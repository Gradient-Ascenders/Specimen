import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentLevelScene} from '../../../src/levels/ContainmentLevelScene.ts';
import {createDepthPrewarmGroup} from '../../../src/render/ShadowPrewarmMaterial.ts';
import {HiddenMaterialCulling} from '../../../src/render/HiddenMaterialCulling.ts';
import {AuthoredShadowCulling} from '../../../src/render/AuthoredShadowCulling.ts';
import {CultivationRoomFiveCulling} from '../../../src/render/environment/cultivation/CultivationRoomFiveCulling.ts';
import {CollisionHit, CollisionWorld} from '../../../src/physics/CollisionWorld.ts';

test('hidden collider culling preserves child art, collision, material reveals and layer ownership after errors',()=>{
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(2,2,2);
  const hidden=new THREE.MeshBasicMaterial({visible:false}),visible=new THREE.MeshBasicMaterial();
  const collider=new THREE.Mesh(geometry,hidden),child=new THREE.Mesh(geometry,visible);
  const mixed=new THREE.Mesh(geometry,[hidden,visible]),allHidden=new THREE.Mesh(geometry,[hidden,hidden]);
  scene.add(collider,mixed,allHidden);collider.add(child);collider.layers.enable(3);
  const scope=new HiddenMaterialCulling(scene),world=new CollisionWorld(),hit=new CollisionHit();
  world.register(collider);
  const collision=()=>{
    assert.equal(world.raycast(new THREE.Vector3(0,0,4),new THREE.Vector3(0,0,-1),8,hit),true);
    assert.equal(hit.object,collider);
  };
  try {
    collision();
    assert.throws(()=>scope.render(()=>{
      assert.equal(collider.layers.mask,0);assert.equal(allHidden.layers.mask,0);
      assert.equal(collider.visible,true);assert.equal(child.layers.mask,1);assert.equal(mixed.layers.mask,1);
      collision();throw Error('draw failed');
    }),/draw failed/);
    assert.equal(collider.layers.mask,9);assert.equal(allHidden.layers.mask,1);collision();
    // Live material/layer changes between frames must not be overwritten by
    // the snapshot taken when the authored assets finished loading.
    collider.layers.set(4);hidden.visible=true;
    scope.render(()=>{assert.equal(collider.layers.mask,16);assert.equal(allHidden.layers.mask,1);});
    hidden.visible=false;collider.material=visible;
    scope.render(()=>{assert.equal(collider.layers.mask,16);assert.equal(allHidden.layers.mask,0);});
    collider.material=hidden;
    scope.render(()=>assert.equal(collider.layers.mask,0));
    assert.equal(collider.layers.mask,16);collision();
  } finally {world.clear();geometry.dispose();hidden.dispose();visible.dispose();}
});

test('depth submission reuse retains geometry/custom-shadow distinctions',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  const a=new THREE.Mesh(geometry,material);a.castShadow=true;root.add(a);
  const seen=new Set<string>(),first=createDepthPrewarmGroup(root,seen),second=createDepthPrewarmGroup(root,seen);
  assert.equal(first.group.children.length,1);assert.equal(second.group.children.length,0);
  a.customDepthMaterial=new THREE.MeshDepthMaterial();
  const custom=createDepthPrewarmGroup(root,seen);assert.equal(custom.group.children.length,1);
  first.dispose();second.dispose();custom.dispose();a.customDepthMaterial.dispose();geometry.dispose();material.dispose();
});

test('authored shadow boxes reject empty cube faces and restore shared draw ranges after errors',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(6,.2,6),material=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.blenderBatch=true;mesh.position.y=-2;root.add(mesh);root.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(90,1,.2,12);camera.up.set(0,0,1);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
  geometry.computeBoundingSphere();
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  assert.equal(frustum.intersectsObject(mesh),true,'the default sphere admits this empty shadow submission');
  const before=mesh.onBeforeShadow,after=mesh.onAfterShadow,scope=new AuthoredShadowCulling(root);
  const args=[{} as THREE.WebGLRenderer,mesh as unknown as THREE.Scene,camera,camera,geometry,material,null as never] as const;
  geometry.setDrawRange(3,9);
  try{
    scope.render(()=>{mesh.onBeforeShadow(...args);assert.equal(geometry.drawRange.count,0);mesh.onAfterShadow(...args);assert.equal(geometry.drawRange.count,9);});
    assert.throws(()=>scope.render(()=>{mesh.onBeforeShadow(...args);throw Error('driver');}),/driver/);
    assert.deepEqual(geometry.drawRange,{start:3,count:9});
    mesh.position.y=2;root.updateMatrixWorld(true);
    scope.render(()=>{mesh.onBeforeShadow(...args);assert.equal(geometry.drawRange.count,9);mesh.onAfterShadow(...args);});
    assert.equal(scope.diagnostics.culled,0,'moving owners invalidate cached bounds');
    scope.dispose();assert.equal(mesh.onBeforeShadow,before);assert.equal(mesh.onAfterShadow,after);
  }finally{scope.dispose();geometry.dispose();material.dispose();}
});

test('cinematic sector culling preserves borrowed craft and portal scenery',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(2,2,2);
  const chamber=new THREE.Mesh(geometry,material),sewer=chamber.clone(),portal=chamber.clone();
  chamber.position.set(0,10,35);sewer.position.set(40,-6,35);portal.position.set(25,0,10);
  for(const mesh of [chamber,sewer,portal]){mesh.userData.blenderBatch=true;mesh.updateMatrix();mesh.matrixAutoUpdate=false;root.add(mesh);}
  const craft=new THREE.Group();root.add(craft);const culling=new CultivationRoomFiveCulling(root);culling.registerChamber(craft);
  const camera=new THREE.PerspectiveCamera();camera.position.set(40,-6,35);camera.updateMatrixWorld(true);
  culling.prepare(camera,{x:0,y:10,z:35},'cinematic');
  assert.equal(chamber.visible,false);assert.equal(craft.visible,true);assert.equal(portal.visible,true);culling.restore();
  assert.equal(chamber.visible,true);
  culling.prepare(camera,camera.position);assert.equal(craft.visible,false);culling.restore();assert.equal(craft.visible,true);
  geometry.dispose();material.dispose();
});

test('atrium scope retains lower floors for a trailing camera and restores them after a draw',()=>{
  const root=new THREE.Group();
  const fixture={lighting:{activeRoomId:5},lowerFloorOccludedBranches:[{root,visible:true}],completedRoomOneBranches:[]};
  const draw=(cameraY:number)=>ContainmentLevelScene.prototype.withEnclosedRoomOcclusion.call(fixture as unknown as ContainmentLevelScene,
    {x:0,y:76,z:102},{x:0,y:cameraY,z:102},()=>root.visible);
  assert.equal(draw(74),true);assert.equal(draw(76),false);assert.equal(root.visible,true);
});
