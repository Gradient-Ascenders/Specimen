import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import type { CultivationAssetSource } from '../src/render/environment/cultivation/CultivationBakedAssets.ts';

test('surface cleanup preserves collider identity, geometry, metadata and transforms, and restores owned resources', () => {
  const restored: {mesh: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]}[] = [];
  let retired = 0;
  const assets: CultivationAssetSource = {
    textures: cultivationAssets.textures.bind(cultivationAssets),
    geometry: cultivationAssets.geometry.bind(cultivationAssets),
    geometries: cultivationAssets.geometries.bind(cultivationAssets),
    bounds: cultivationAssets.bounds.bind(cultivationAssets),
    repair(scene, install) {
      // Observe the real construction order: repair paths precede Blender
      // adoption and cannot be replayed against the reparented final scene.
      const snapshots = scene.collisionMeshes.map(mesh => ({mesh, geometry: mesh.geometry,
        positions: Array.from(mesh.geometry.getAttribute('position').array),
        position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray(),
        metadata: structuredClone(mesh.userData)}));
      const count = cultivationAssets.repair(scene, (mesh, geometry) => {
        restored.push({mesh, geometry: mesh.geometry, material: mesh.material});
        geometry.addEventListener('dispose', () => retired++);
        install(mesh, geometry);
      });
      for (const s of snapshots) {
        assert.equal(s.mesh.geometry, s.geometry, s.mesh.name);
        assert.deepEqual(Array.from(s.mesh.geometry.getAttribute('position').array), s.positions);
        assert.deepEqual(s.mesh.position.toArray(), s.position);
        assert.deepEqual(s.mesh.quaternion.toArray(), s.quaternion);
        assert.deepEqual(s.mesh.scale.toArray(), s.scale);
        assert.deepEqual(s.mesh.userData, s.metadata);
      }
      return count;
    },
  };
  const scene = new LevelTwoPreviewScene(() => {}, assets);
  try {
    assert.ok(scene.surfaceCleanup.repairedMeshes > 0);
    scene.surfaceCleanup.dispose(); scene.surfaceCleanup.dispose();
    for (const s of restored) { assert.equal(s.mesh.material, s.material); assert.equal(s.mesh.geometry, s.geometry); }
    assert.equal(retired, scene.surfaceCleanup.repairedMeshes, 'every repaired geometry is released exactly once');
  } finally { scene.dispose(); }
});

