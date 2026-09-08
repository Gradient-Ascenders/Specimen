import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomOneGreybox } from '../src/levels/LevelTwoRoomOneGreybox.ts';
import { LevelTwoRoomTwoGreybox } from '../src/levels/LevelTwoRoomTwoGreybox.ts';
import { LevelTwoLabPassageGreybox } from '../src/levels/LevelTwoLabPassageGreybox.ts';
import { LevelTwoAirDuctGreybox } from '../src/levels/LevelTwoAirDuctGreybox.ts';
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
    if (snapshot.metadata.textureRole === 'acid-floor') assert.equal(snapshot.mesh.material, art.acid);
    else if (snapshot.metadata.hazardRole) assert.equal(snapshot.mesh.material, snapshot.material);
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
  art.addFixtures(root, 36, 20, 50, { ceilingOpening: [-12, -8, 2, 6] });
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

test('Room 2 and its two exit routes share the palette without changing gameplay surfaces or colliders', () => {
  const passage = new LevelTwoLabPassageGreybox({
    id: 'cultivation-room-2-to-3-goop-lab-passage', fromRoomId: 2, toRoomId: 3,
    widthMetres: 7, heightMetres: 6.5, lengthMetres: 28,
    doorwayWidthMetres: 4, doorwayHeightMetres: 4.6, entryInitiallyLocked: true,
  });
  const duct = new LevelTwoAirDuctGreybox({
    id: 'cultivation-room-2-to-3-bob-air-duct', fromRoomId: 2, toRoomId: 3,
    innerWidthMetres: 2, innerHeightMetres: 2.1, lengthMetres: 28,
  });
  const room = new LevelTwoRoomTwoGreybox(() => {}, passage.entryDoor);
  const art = new CultivationLabMaterials();
  const builders = [room.builder, passage.builder, duct.builder];
  const snapshots = builders.flatMap(builder => builder.collisionMeshes.map(mesh => ({
    mesh, material: mesh.material, geometry: mesh.geometry,
    positions: Array.from(mesh.geometry.getAttribute('position').array),
    metadata: structuredClone(mesh.userData), position: mesh.position.toArray(),
    quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray(),
  })));
  for (const builder of builders) art.dress(builder);
  for (const snapshot of snapshots) {
    assert.deepEqual(Array.from(snapshot.mesh.geometry.getAttribute('position').array), snapshot.positions);
    assert.deepEqual(snapshot.mesh.userData, snapshot.metadata);
    assert.deepEqual(snapshot.mesh.position.toArray(), snapshot.position);
    assert.deepEqual(snapshot.mesh.quaternion.toArray(), snapshot.quaternion);
    assert.deepEqual(snapshot.mesh.scale.toArray(), snapshot.scale);
    if (snapshot.metadata.textureRole === 'sticky-wall-tile') {
      assert.equal(snapshot.mesh.material, art.sticky);
      assert.equal(art.sticky.color.getHex(), 0x72ead0);
      assert.equal(art.sticky.roughness, 0.24);
      assert.ok(art.sticky.normalMap);
      assert.ok(art.sticky.roughnessMap);
    } else if (snapshot.metadata.environmentRole === 'air-duct-entry') {
      assert.equal(snapshot.mesh.material, art.duct);
    } else if (snapshot.metadata.textureRole === 'acid-floor') {
      assert.equal(snapshot.mesh.material, art.acid);
    } else if (snapshot.metadata.surfaceTag === 'sticky' || snapshot.metadata.hazardRole) {
      assert.equal(snapshot.mesh.material, snapshot.material);
    }
  }
  assert.equal(room.lasers.hazards.length, 4);
  const wallSeam = room.root.getObjectByName('room-2-panel-seam-1-5') as THREE.Mesh;
  assert.equal(wallSeam.material, art.metal);
  const wallFixture = room.root.getObjectByName('room-2-fluorescent-strip-1-6') as THREE.Mesh;
  assert.equal(wallFixture.material, art.fixture);
  const roomFloor = room.root.getObjectByName('cultivation-room-2-start-floor') as THREE.Mesh;
  const passageFloor = passage.root.getObjectByName('cultivation-room-2-to-3-goop-lab-passage-floor') as THREE.Mesh;
  assert.equal(roomFloor.material, passageFloor.material);
  assert.equal(roomFloor.material, art.floor);
  const ductFloor = duct.root.getObjectByName('cultivation-room-2-to-3-bob-air-duct-floor') as THREE.Mesh;
  assert.equal(ductFloor.material, art.duct);
  const uv = ductFloor.geometry.getAttribute('uv');
  // Updated main leaves end clearance: the 26.3 m metal run uses two-metre repeats.
  const v = Array.from({length: 4}, (_, i) => uv.getY(8 + i));
  assert.ok(Math.abs(Math.max(...v) - Math.min(...v) - 13.15) < 1e-5);
  const tether = room.root.getObjectByName('cultivation-room-2-block-1-non-soluble-rope') as THREE.Mesh;
  assert.equal(tether.material, room.builder.materials.support);
  const button = room.root.getObjectByName('cultivation-room-2-wall-button-pad') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  room.update(0.6, [{id: 'bob', position: new THREE.Vector3(), radiusMetres: 0.45,
    attached: true, supportCollider: room.wallButton}]);
  assert.equal(passage.entryDoor.locked, false);
  assert.equal(button.material.color.getHex(), 0x62ff91);
  room.reset();
  assert.equal(passage.entryDoor.locked, true);
  assert.equal(button.material.color.getHex(), 0xe53945);
  art.dispose();
  for (const snapshot of snapshots) {
    assert.equal(snapshot.mesh.material, snapshot.material);
    assert.equal(snapshot.mesh.geometry, snapshot.geometry);
  }
  room.dispose();
  passage.dispose();
  duct.dispose();
});
