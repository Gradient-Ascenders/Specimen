import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomOneGreybox } from '../src/levels/LevelTwoRoomOneGreybox.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';

test('Room 1 material pass preserves collider geometry, transforms, metadata and hazard identity', () => {
  const room = new LevelTwoRoomOneGreybox(() => {});
  const art = new CultivationLabMaterials();
  const snapshots = room.collisionMeshes.map(mesh => ({ mesh, geometry: mesh.geometry,
    positions: Array.from(mesh.geometry.getAttribute('position').array),
    position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(),
    metadata: structuredClone(mesh.userData), material: mesh.material }));
  art.dress(room.builder);
  for (const snapshot of snapshots) {
    assert.deepEqual(Array.from(snapshot.mesh.geometry.getAttribute('position').array), snapshot.positions);
    assert.deepEqual(snapshot.mesh.position.toArray(), snapshot.position);
    assert.deepEqual(snapshot.mesh.quaternion.toArray(), snapshot.quaternion);
    assert.deepEqual(snapshot.mesh.userData, snapshot.metadata);
    if (snapshot.metadata.hazardRole) assert.equal(snapshot.mesh.material, snapshot.material);
  }
  const west = room.root.getObjectByName('cultivation-room-1-west-wall') as THREE.Mesh;
  const east = room.root.getObjectByName('cultivation-room-1-east-wall') as THREE.Mesh;
  assert.equal(west.material, east.material);
  const uv = west.geometry.getAttribute('uv');
  // 50 m wall must span 12.5 four-metre tiles, not a single stretched texture.
  const values = Array.from({length:4}, (_, i) => uv.getX(i));
  assert.equal(Math.max(...values) - Math.min(...values), 12.5);
  let textureDisposals = 0;
  for (const texture of art.textures) texture.addEventListener('dispose', () => textureDisposals++);
  room.reset();
  assert.equal(west.material, art.wall);
  art.dispose();
  art.dispose();
  assert.equal(textureDisposals, art.textures.length);
  for (const snapshot of snapshots) {
    assert.equal(snapshot.mesh.geometry, snapshot.geometry);
    assert.equal(snapshot.mesh.material, snapshot.material);
  }
  room.dispose();
});

test('ceiling presentation leaves the authored entrance vent open and owns instance disposal', () => {
  const root = new THREE.Group();
  const art = new CultivationLabMaterials();
  art.addFixtures(root, 36, 20, 50, [-12, -8, 2, 6]);
  const strips = root.getObjectByName('cultivation-neutral-ceiling-strips') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  const vent = new THREE.Box3(new THREE.Vector3(-12, 19.5, 2), new THREE.Vector3(-8, 20.5, 6));
  for (let i = 0; i < strips.count; i++) {
    strips.getMatrixAt(i, matrix);
    bounds.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix);
    assert.equal(bounds.intersectsBox(vent), false);
  }
  let disposed = 0;
  strips.geometry.addEventListener('dispose', () => disposed++);
  art.dispose();
  assert.equal(disposed, 1);
  assert.equal(root.children.length, 0);
});
