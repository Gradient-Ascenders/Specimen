import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { consolidateContainmentRoomStaticVisuals } from '../src/render/environment/containment/ContainmentStaticBatching.ts';
import { markVisualOnly } from '../src/render/environment/containment/ContainmentModularComponents.ts';

test('room-local static batching preserves bounds and independent assemblies', () => {
  const root = new THREE.Group();
  root.name = 'batch-test-room';
  const ceramic = new THREE.MeshStandardMaterial();
  const metal = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ transparent: true });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const wideBox = new THREE.BoxGeometry(2, 1, 1);

  const mergedA = visualMesh('merged-a', unitBox, ceramic, [-1.5, 0, 0]);
  const mergedB = visualMesh('merged-b', wideBox, ceramic, [1, 0, 0]);
  const instancedA = visualMesh('instanced-a', unitBox, metal, [0, 1, 0]);
  const instancedB = visualMesh('instanced-b', unitBox, metal, [2, 1, 0]);
  const transparent = visualMesh('transparent', unitBox, glass, [0, 0, 2]);
  const preserved = visualMesh('preserved', unitBox, metal, [0, 0, -2]);
  const animatedAssembly = new THREE.Group();
  animatedAssembly.name = 'animated-assembly';
  animatedAssembly.add(
    visualMesh('animated-a', unitBox, ceramic, [0, 0, 0]),
    visualMesh('animated-b', unitBox, ceramic, [1, 0, 0]),
  );
  root.add(
    mergedA,
    mergedB,
    instancedA,
    instancedB,
    transparent,
    preserved,
    animatedAssembly,
  );
  root.updateMatrixWorld(true);
  const boundsBefore = new THREE.Box3().setFromObject(root);

  const result = consolidateContainmentRoomStaticVisuals(root, {
    excludedRoots: [animatedAssembly],
    preservedNames: new Set([preserved.name]),
  });
  root.updateMatrixWorld(true);
  const boundsAfter = new THREE.Box3().setFromObject(root);

  assert.deepEqual(result.diagnostics, {
    batchCount: 2,
    sourceMeshCount: 4,
    instanceCount: 4,
    drawCallsRemoved: 2,
    mergedGeometryCount: 1,
  });
  assert.ok(boundsBefore.min.distanceTo(boundsAfter.min) < 1e-8);
  assert.ok(boundsBefore.max.distanceTo(boundsAfter.max) < 1e-8);
  assert.equal(root.getObjectByName('merged-a'), undefined);
  assert.equal(root.getObjectByName('instanced-a'), undefined);
  assert.equal(root.getObjectByName('transparent'), transparent);
  assert.equal(root.getObjectByName('preserved'), preserved);
  assert.equal(root.getObjectByName('animated-a')?.parent, animatedAssembly);

  const batches = root.children.filter(
    (object): object is THREE.Mesh =>
      object instanceof THREE.Mesh &&
      Array.isArray(object.userData.staticBatchSourceNames),
  );
  assert.equal(batches.length, 2);
  assert.ok(batches.some((batch) => batch instanceof THREE.InstancedMesh));
  assert.ok(
    batches.some(
      (batch) =>
        !(batch instanceof THREE.InstancedMesh) &&
        batch.userData.resourceOwnership === 'owned-containment-static-batch',
    ),
  );

  const ownedGeometry = batches.find(
    (batch) => !(batch instanceof THREE.InstancedMesh),
  )?.geometry;
  assert.ok(ownedGeometry);
  let disposeCount = 0;
  ownedGeometry.addEventListener('dispose', () => {
    disposeCount += 1;
  });
  result.dispose();
  result.dispose();
  assert.equal(disposeCount, 1);
  assert.equal(root.children.includes(transparent), true);

  unitBox.dispose();
  wideBox.dispose();
  ceramic.dispose();
  metal.dispose();
  glass.dispose();
});

function visualMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  markVisualOnly(mesh);
  return mesh;
}
