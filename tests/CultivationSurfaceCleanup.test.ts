import assert from 'node:assert/strict';
import test from 'node:test';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CultivationSurfaceCleanup } from '../src/render/environment/cultivation/CultivationSurfaceCleanup.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import { visitLevelTwoSurfaceStates } from '../scripts/lib/level-two-surface-states.ts';

test('surface cleanup preserves collider identity, geometry, metadata and transforms, and restores owned resources', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  scene.surfaceCleanup.dispose();
  const snapshots = scene.collisionMeshes.map(mesh => ({mesh, geometry: mesh.geometry,
    positions: Array.from(mesh.geometry.getAttribute('position').array), material: mesh.material,
    position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray(),
    metadata: structuredClone(mesh.userData)}));
  const cleanup = new CultivationSurfaceCleanup(scene);
  assert.ok(cleanup.repairedMeshes > 0);
  for (const s of snapshots) {
    assert.equal(s.mesh.geometry, s.geometry, s.mesh.name);
    assert.deepEqual(Array.from(s.mesh.geometry.getAttribute('position').array), s.positions);
    assert.deepEqual(s.mesh.position.toArray(), s.position);
    assert.deepEqual(s.mesh.quaternion.toArray(), s.quaternion);
    assert.deepEqual(s.mesh.scale.toArray(), s.scale);
    assert.deepEqual(s.mesh.userData, s.metadata);
  }
  cleanup.dispose(); cleanup.dispose();
  for (const s of snapshots) { assert.equal(s.mesh.material, s.material); assert.equal(s.mesh.geometry, s.geometry); }
  scene.dispose();
});

test('all Level 2 rooms, passages and runtime drones stay clear through drops, door opening, descent, rescue and reset', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  try {
    visitLevelTwoSurfaceStates(scene, state => {
      const report = auditOpaqueSurfaces(scene.root);
      assert.deepEqual(report.conflicts, [], `${state}: ${JSON.stringify(report.conflicts.slice(0, 4))}`);
    });
  } finally { scene.dispose(); }
});
