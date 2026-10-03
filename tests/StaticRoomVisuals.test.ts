import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CollisionHit, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { consolidateStaticRoomVisuals } from '../src/render/StaticRoomVisuals.ts';

test('static visual batching preserves world bounds, collider identity, and ray queries', () => {
  const parent = new THREE.Group(), room = new THREE.Group(), assembly = new THREE.Group();
  parent.position.set(2, 3, -4); parent.rotation.y = .3;
  room.position.set(1, 2, 1); room.rotation.z = .1; room.scale.set(1.2, 1, .8);
  assembly.position.set(1, 0, 1);
  parent.add(room); room.add(assembly);
  const material = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), material);
  a.name = 'collision-a'; b.name = 'collision-b';
  a.position.set(-2, 0, 0); b.position.set(2, 0, 0);
  a.castShadow = b.castShadow = a.receiveShadow = b.receiveShadow = true;
  a.userData.surfaceTag = 'sticky'; a.userData.visualOnly = false;
  assembly.add(a, b); parent.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(room, true);
  const matrix = a.matrixWorld.clone(), geometry = a.geometry, metadata = a.userData;
  const world = new CollisionWorld(); world.register(a); world.register(b);
  const origin = a.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 10, 0));
  const direction = new THREE.Vector3(0, -1, 0);
  const before = new CollisionHit(), after = new CollisionHit();
  assert.equal(world.raycast(origin, direction, 20, before), true);

  const result = consolidateStaticRoomVisuals(room, [a, b], 100);
  const visualRoot = room.getObjectByName(`${room.name}-batched-static-visuals`)!;
  parent.updateMatrixWorld(true);
  const visualBounds = new THREE.Box3().setFromObject(visualRoot, true);
  assert.equal(result.diagnostics.drawCallsRemoved, 1);
  assert.ok(bounds.min.distanceTo(visualBounds.min) < 1e-6);
  assert.ok(bounds.max.distanceTo(visualBounds.max) < 1e-6);
  assert.equal(room.getObjectByName(a.name), a);
  assert.equal(a.parent, assembly); assert.equal(a.geometry, geometry);
  assert.equal(a.userData, metadata); assert.equal(a.visible, true);
  assert.deepEqual(a.matrixWorld.elements, matrix.elements);
  assert.equal(a.material.visible, false); assert.equal(a.castShadow, true);
  assert.equal(a.receiveShadow, true);
  assert.equal(world.colliderCount, 2);
  assert.equal(world.raycast(origin, direction, 20, after), true);
  assert.equal(after.object, before.object);
  assert.ok(after.point.distanceTo(before.point) < 1e-9);
  for (const batch of visualRoot.children) {
    assert.equal(batch.castShadow, true); assert.equal(batch.receiveShadow, true);
  }
  result.dispose();
  assert.equal(a.material, material);
  assert.equal(a.castShadow, true); assert.equal(a.parent, assembly);
  world.clear(); a.geometry.dispose(); b.geometry.dispose(); material.dispose();
});

test('static visual batching leaves transparent, animated, hidden, and child-owned meshes alone', () => {
  const room = new THREE.Group(), hiddenParent = new THREE.Group();
  hiddenParent.visible = false; room.add(hiddenParent);
  const geometry = new THREE.BoxGeometry(), solid = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ transparent: true });
  const transparent = [new THREE.Mesh(geometry, glass), new THREE.Mesh(geometry, glass)];
  const depth = new THREE.MeshDepthMaterial();
  const animated = [new THREE.Mesh(geometry, solid), new THREE.Mesh(geometry, solid)];
  for (const mesh of animated) mesh.customDepthMaterial = depth;
  const hidden = [new THREE.Mesh(geometry, solid), new THREE.Mesh(geometry, solid)];
  hiddenParent.add(...hidden);
  const owner = new THREE.Mesh(geometry, solid); owner.add(new THREE.Object3D());
  room.add(...transparent, ...animated, owner);
  const result = consolidateStaticRoomVisuals(room, [...transparent, ...animated, ...hidden, owner]);
  assert.equal(result.diagnostics.batchCount, 0);
  for (const mesh of [...animated, ...hidden, owner]) assert.equal(mesh.material, solid);
  for (const mesh of transparent) assert.equal(mesh.material, glass);
  result.dispose();
  geometry.dispose(); solid.dispose(); glass.dispose(); depth.dispose();
});

test('batch disposal frees owned instance/merge buffers once without freeing borrowed source assets', () => {
  const room = new THREE.Group(), shared = new THREE.BoxGeometry();
  const wider = new THREE.BoxGeometry(2, 1, 1);
  const instancedMaterial = new THREE.MeshStandardMaterial(), mergedMaterial = new THREE.MeshStandardMaterial();
  const meshes = [
    new THREE.Mesh(shared, instancedMaterial), new THREE.Mesh(shared, instancedMaterial),
    new THREE.Mesh(shared, mergedMaterial), new THREE.Mesh(wider, mergedMaterial),
  ];
  room.add(...meshes);
  let borrowedDisposals = 0;
  for (const asset of [shared, wider, instancedMaterial, mergedMaterial]) asset.addEventListener('dispose', () => borrowedDisposals++);
  const result = consolidateStaticRoomVisuals(room, meshes);
  const root = room.getObjectByName(`${room.name}-batched-static-visuals`)!;
  const instance = root.children.find(object => object instanceof THREE.InstancedMesh)!;
  const merged = root.children.find(object => object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh)) as THREE.Mesh;
  let instanceDisposals = 0, mergedDisposals = 0, hiddenDisposals = 0;
  instance.addEventListener('dispose', () => instanceDisposals++);
  merged.geometry.addEventListener('dispose', () => mergedDisposals++);
  for (const material of new Set(meshes.map(mesh => mesh.material))) material.addEventListener('dispose', () => hiddenDisposals++);
  result.dispose(); result.dispose();
  assert.equal(instanceDisposals, 1); assert.equal(mergedDisposals, 1);
  assert.equal(hiddenDisposals, 2); assert.equal(borrowedDisposals, 0);
  assert.equal(root.parent, null);
  assert.equal(meshes[0].material, instancedMaterial); assert.equal(meshes[2].material, mergedMaterial);
  shared.dispose(); wider.dispose(); instancedMaterial.dispose(); mergedMaterial.dispose();
});
