import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomThreeGreybox } from '../src/levels/LevelTwoRoomThreeGreybox.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationChamberMaterials } from '../src/render/environment/cultivation/CultivationChamberMaterials.ts';

test('Room 3 art preserves authored collision and interactions through batching and reset', () => {
  const baseline = new LevelTwoRoomThreeGreybox(() => {});
  const lab = new CultivationLabMaterials();
  const chamber = new CultivationChamberMaterials();
  const room = new LevelTwoRoomThreeGreybox(() => {}, builder => lab.dress(builder, [], chamber.overrides(builder, lab)));
  assert.equal(room.collisionMeshes.length, baseline.collisionMeshes.length);
  room.collisionMeshes.forEach((mesh, index) => {
    const original = baseline.collisionMeshes[index];
    assert.equal(mesh.name, original.name);
    assert.deepEqual(mesh.position.toArray(), original.position.toArray());
    assert.deepEqual(mesh.quaternion.toArray(), original.quaternion.toArray());
    assert.deepEqual(mesh.scale.toArray(), original.scale.toArray());
    assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array), Array.from(original.geometry.getAttribute('position').array));
    assert.deepEqual(mesh.userData, original.userData);
    if (mesh.userData.textureRole === 'acid-floor') assert.equal(mesh.material, lab.acid);
    if (mesh.userData.textureRole === 'soluble-cable') assert.equal(mesh.material, chamber.cable);
  });
  const batches: THREE.Mesh[] = [];
  room.root.traverse(object => { if (object instanceof THREE.Mesh && object.userData.staticBatchSourceNames) batches.push(object); });
  assert.ok(room.root.getObjectByName('cultivation-static-platform-art'));
  assert.ok(batches.some(mesh => mesh.material === lab.wall));
  assert.ok(room.staticBatchDiagnostics.drawCallsRemoved > 15);
  room.reset();
  assert.deepEqual(room.wallDrops.map(drop => drop.state), baseline.wallDrops.map(drop => drop.state));
  let disposals = 0;
  lab.platform.addEventListener('dispose', () => disposals++);
  lab.dispose(); chamber.dispose(); room.dispose(); baseline.dispose();
  assert.equal(disposals, 1, 'borrowed batch materials have exactly one owner');
});
