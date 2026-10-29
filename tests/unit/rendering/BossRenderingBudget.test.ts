import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { CameraOcclusion } from '../../../src/render/CameraOcclusion.ts';
import { exterminationOccluders } from '../../../src/boss/ExterminationOcclusion.ts';
import { parseExterminationLairAsset } from '../../../src/boss/ExterminationLairAsset.ts';
import { ExterminationLighting } from '../../../src/boss/ExterminationLighting.ts';
import { CharacterDetail } from '../../../src/render/slime/CharacterDetail.ts';

function fixture() {
  const scene = new THREE.Scene(), frame = new THREE.Group(); scene.add(frame);
  const door = new THREE.Mesh(new THREE.BoxGeometry(8, 6, .5), new THREE.MeshBasicMaterial()); frame.add(door);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  hidden.position.z = -20; frame.add(hidden);
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 1000); camera.position.z = 10; frame.add(camera);
  const calls: THREE.Object3D[] = [];
  const renderer = { clippingPlanes: [], renderBufferDirect: function (_c: THREE.Camera, _s: THREE.Scene,
    _g: THREE.BufferGeometry, _m: THREE.Material, o: THREE.Object3D) { assert.equal(this, renderer); calls.push(o); } } as unknown as THREE.WebGLRenderer;
  const helper = new CameraOcclusion(renderer, [{mesh: door, frame: new THREE.Matrix4(), halfWidth: 3.8, halfHeight: 2.8, depthMargin: .3}], [hidden]);
  const submit = (c: THREE.Camera = camera) => renderer.renderBufferDirect(c, scene, hidden.geometry, hidden.material, hidden, null as never);
  const draw = () => { scene.updateMatrixWorld(true); helper.render(camera, () => submit()); };
  return { scene, frame, door, hidden, camera, calls, renderer, helper, submit, draw };
}

test('arena camera occlusion keeps shadows, authoritative visibility and renderer ownership', () => {
  const f = fixture(); f.scene.updateMatrixWorld(true);
  const method = f.renderer.renderBufferDirect, matrix = f.hidden.matrixWorld.clone(), shadow = new THREE.PerspectiveCamera();
  f.helper.render(f.camera, () => { f.submit(); f.submit(shadow); });
  assert.deepEqual(f.calls, [f.hidden]); assert.equal(f.helper.culledDraws, 1);
  assert.equal(f.hidden.visible, true); assert.equal(f.hidden.layers.mask, 1); assert.deepEqual(f.hidden.matrixWorld, matrix);
  assert.throws(() => f.helper.render(f.camera, () => { throw Error('draw failure'); }), /draw failure/);
  assert.equal(f.renderer.renderBufferDirect, method);
});

test('open doors, side views, near clipping and diagnostic materials fail open', () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.door.position.y = 10; },
    (f: ReturnType<typeof fixture>) => { f.camera.position.x = 20; },
    (f: ReturnType<typeof fixture>) => { f.hidden.position.y = 12; },
    (f: ReturnType<typeof fixture>) => { f.camera.position.z = -1; },
    (f: ReturnType<typeof fixture>) => { f.camera.near = 11; f.camera.updateProjectionMatrix(); },
    (f: ReturnType<typeof fixture>) => { f.camera.layers.set(2); },
    (f: ReturnType<typeof fixture>) => { f.door.visible = false; },
    (f: ReturnType<typeof fixture>) => { f.frame.visible = false; },
    (f: ReturnType<typeof fixture>) => { f.door.material.transparent = true; },
    (f: ReturnType<typeof fixture>) => { f.door.material.wireframe = true; },
    (f: ReturnType<typeof fixture>) => { f.door.material.side = THREE.BackSide; },
    (f: ReturnType<typeof fixture>) => { f.door.layers.set(3); },
    (f: ReturnType<typeof fixture>) => { f.scene.overrideMaterial = new THREE.MeshBasicMaterial(); },
  ]) {
    const f = fixture(); change(f); f.draw(); assert.equal(f.calls.length, 1);
  }
});

test('arena culling follows parenting, moving sources and changed geometry', () => {
  const f = fixture(); f.draw(); assert.equal(f.calls.length, 0);
  f.frame.position.set(40, 12, -80); f.frame.rotation.y = .65; f.draw(); assert.equal(f.calls.length, 0);
  f.hidden.position.x = 15; f.draw(); assert.equal(f.calls.length, 1);
  f.hidden.position.x = 0; f.hidden.geometry.scale(100, 1, 1); f.draw(); assert.equal(f.calls.length, 2);
});

test('research cutouts only admit occluders wholly on the retained side of their planes', () => {
  const f=fixture(); f.renderer.localClippingEnabled=true;
  f.door.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0)];
  f.draw();assert.equal(f.calls.length,1,'a hole through the inset prevents rejection');
  f.door.material.clippingPlanes.push(new THREE.Plane(new THREE.Vector3(0,1,0),100));
  f.draw();assert.equal(f.calls.length,2,'union clipping retains the hole');
  f.door.material.clipIntersection=true;f.draw();assert.equal(f.calls.length,2,'intersection cutout entirely misses the inset');
  f.door.material.clipIntersection=false;f.door.material.clippingPlanes.shift();f.draw();assert.equal(f.calls.length,2);
});

test('every instance must fit behind the opaque rectangle, including updated banks', () => {
  const f = fixture(), bank = new THREE.InstancedMesh(f.hidden.geometry, f.hidden.material, 2);
  const transform = new THREE.Matrix4(); bank.setMatrixAt(0, transform.makeTranslation(0, 0, -20));
  bank.setMatrixAt(1, transform.makeTranslation(0, 0, -25)); f.frame.add(bank);
  const helper = new CameraOcclusion(f.renderer, [{mesh:f.door,frame:new THREE.Matrix4(),halfWidth:3.8,halfHeight:2.8,depthMargin:.3}], [bank]);
  const draw = () => { f.scene.updateMatrixWorld(true); helper.render(f.camera, () => f.renderer.renderBufferDirect(f.camera,f.scene,bank.geometry,bank.material,bank,null as never)); };
  draw(); assert.equal(f.calls.length, 0);
  bank.setMatrixAt(1, transform.makeTranslation(15, 0, -20)); bank.instanceMatrix.needsUpdate = true;
  draw(); assert.equal(f.calls.length, 1);
});

test('lair occluder insets are backed by the shipped opaque triangles, including open-door motion', async () => {
  const bytes = await readFile(new URL('../../../assets/environments/extermination-lair/extermination-lair.glb', import.meta.url));
  const asset = await parseExterminationLairAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const occluders = exterminationOccluders(asset); assert.equal(occluders.length, 29);
  const ray = new THREE.Raycaster(), frame = new THREE.Matrix4(), point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (const doorY of [0, 7.6]) {
    asset.entryDoor.position.y += doorY; asset.root.updateMatrixWorld(true);
    for (const source of occluders) {
      frame.multiplyMatrices(source.mesh.matrixWorld, source.frame);
      normal.set(0, 0, 1).transformDirection(frame);
      for (const x of [-1, -.5, 0, .5, 1]) for (const y of [-1, -.5, 0, .5, 1]) {
        point.set(x * source.halfWidth, y * source.halfHeight, 0).applyMatrix4(frame);
        ray.set(point.clone().addScaledVector(normal, source.depthMargin + 2), normal.clone().negate());
        const hit = ray.intersectObject(source.mesh, false)[0];
        assert.ok(hit && hit.distance <= source.depthMargin + 2 + 1e-4,
          `${source.mesh.name}: uncovered inset ${x},${y} at ${point.toArray()}`);
      }
    }
  }
  asset.root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
});

test('Medium shadow caching holds map origin and immediately invalidates teleports and edits', () => {
  const lighting = new ExterminationLighting(), shadow = lighting.key.shadow;
  const map = new THREE.WebGLRenderTarget(1,1); shadow.map = map; lighting.setPowered(true);
  const position = { x: 0, z: 290 };
  lighting.prepareFrame(position, true, 1/75, true); shadow.needsUpdate = false;
  const target = lighting.key.target.position.clone();
  lighting.prepareFrame({x:.1,z:290}, true, 1/75, true);
  assert.equal(shadow.autoUpdate, false); assert.equal(shadow.needsUpdate, false); assert.deepEqual(lighting.key.target.position,target);
  lighting.prepareFrame({x:.2,z:290}, true, 1/75, true); assert.equal(shadow.needsUpdate,false);
  lighting.prepareFrame({x:.3,z:290}, true, 1/75, true); assert.equal(shadow.needsUpdate,true);
  shadow.needsUpdate=false; lighting.invalidateShadows(); lighting.prepareFrame({x:.4,z:290},true,0,true);
  assert.equal(shadow.needsUpdate,true);
  shadow.needsUpdate=false; lighting.prepareFrame({x:20,z:290},true,0,true); assert.equal(shadow.needsUpdate,true);
  lighting.prepareFrame(position,true,1/75,false); assert.equal(shadow.autoUpdate,true);
  shadow.needsUpdate=false; lighting.prepareFrame(position,false,1,false); assert.equal(shadow.autoUpdate,false); assert.equal(shadow.needsUpdate,false);
  lighting.dispose();
});

test('Medium haze budget leaves the moonlight spill intact and restores cinematic haze', () => {
  const lighting = new ExterminationLighting(); lighting.setPowered(true); lighting.setRoofOpening(1);
  const intensity = lighting.moonlight.light.intensity;
  assert.equal(lighting.moonlight.shaft.visible,true); lighting.moonlight.setShaftEnabled(false);
  lighting.setRoofOpening(1); assert.equal(lighting.moonlight.shaft.visible,false); assert.equal(lighting.moonlight.light.intensity,intensity);
  lighting.moonlight.setShaftEnabled(true); assert.equal(lighting.moonlight.shaft.visible,true);
  lighting.dispose(); lighting.moonlight.setShaftEnabled(true); assert.equal(lighting.moonlight.shaft.visible,false);
});

test('combat detail respects world scale, close views and hysteresis without new index buffers', () => {
  const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1)); mesh.name='body';root.add(mesh);mesh.geometry.computeBoundingSphere();
  const detail = new CharacterDetail(root,[mesh],[{name:'body',vertices:mesh.geometry.attributes.position.count,indices:new Uint16Array([0,1,2])}]);
  const index=mesh.geometry.index,camera=new THREE.PerspectiveCamera(60,1,.1,1000);camera.position.z=5;
  detail.update(camera,.9,true); assert.equal(detail.diagnostics.level,'distant');
  root.scale.setScalar(5); detail.update(camera,.9,true); assert.equal(detail.diagnostics.level,'full');
  root.scale.setScalar(1); camera.position.z=10;detail.update(camera,.9,true);assert.equal(detail.diagnostics.level,'distant');
  detail.update(camera);assert.equal(detail.diagnostics.level,'full');assert.equal(mesh.geometry.index,index);
  detail.dispose();mesh.geometry.dispose();for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
});
