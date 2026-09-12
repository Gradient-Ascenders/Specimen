import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';

test('contamination survives retries without duplication and disposes owned resources exactly once', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const art = scene.contaminationArt;
  const owned = new Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>([
    ...art.textures, ...Object.values(art.finishes), art.glass,
  ]);
  const objects: THREE.Object3D[] = [];
  for (const root of art.roots) root.traverse(object => {
    objects.push(object);
    if (object instanceof THREE.Mesh) {
      owned.add(object.geometry);
      if (!Array.isArray(object.material) && object.material !== scene.chamberArt.warning) owned.add(object.material);
    }
  });
  const colliders = [...scene.collisionMeshes];
  const metadata = colliders.map(mesh => structuredClone(mesh.userData));
  const materialsOutsideScope: THREE.Material[] = [];
  for (const room of [scene.roomFour, scene.roomFive]) room.root.traverse(object => {
    if (object instanceof THREE.Mesh) materialsOutsideScope.push(...(Array.isArray(object.material) ? object.material : [object.material]));
  });
  assert.equal(materialsOutsideScope.some(material => Object.values(art.finishes).includes(material as THREE.MeshStandardMaterial)), false);
  const disposals = new Map<unknown, number>();
  for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  let borrowedReliefDisposals = 0;
  scene.labArt.wall.bumpMap!.addEventListener('dispose', () => borrowedReliefDisposals++);
  scene.reset(); scene.reset();
  assert.deepEqual(scene.collisionMeshes, colliders);
  assert.deepEqual(colliders.map(mesh => mesh.userData), metadata);
  const after: THREE.Object3D[] = [];
  for (const root of art.roots) root.traverse(object => after.push(object));
  assert.deepEqual(after, objects);
  assert.equal(disposals.size, 0);
  art.dispose(); art.dispose();
  assert.equal(borrowedReliefDisposals, 0, 'dressing must not release the lab owner maps');
  scene.dispose();
  for (const resource of owned) assert.equal(disposals.get(resource), 1, `${resource.type} disposed once`);
  assert.equal(borrowedReliefDisposals, 1);
});
