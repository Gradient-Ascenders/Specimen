import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomFourGreybox } from '../src/levels/LevelTwoRoomFourGreybox.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationChamberMaterials } from '../src/render/environment/cultivation/CultivationChamberMaterials.ts';
import { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationElevatorArt } from '../src/render/environment/cultivation/CultivationElevatorArt.ts';

test('elevator art preserves collider geometry and the full descent/reset transforms', () => {
  const baseline = new LevelTwoRoomFourGreybox(), room = new LevelTwoRoomFourGreybox();
  const lab = new CultivationLabMaterials(), chamber = new CultivationChamberMaterials();
  const contamination = new CultivationContaminationArt(lab);
  const art = new CultivationElevatorArt(room, lab, chamber, contamination);
  const occupants = [{ id: 'bob', position: new THREE.Vector3(-2, .66, 9), radiusMetres: .46 },
    { id: 'goop', position: new THREE.Vector3(2, .66, 9), radiusMetres: .46 }];
  const check = () => {
    assert.deepEqual(room.controller.readModel, baseline.controller.readModel);
    assert.equal(room.collisionMeshes.length, baseline.collisionMeshes.length);
    room.collisionMeshes.forEach((mesh, i) => {
      const original = baseline.collisionMeshes[i];
      assert.equal(mesh.name, original.name);
      assert.deepEqual(mesh.userData, original.userData);
      assert.deepEqual(mesh.position, original.position);
      assert.deepEqual(mesh.scale, original.scale);
      assert.deepEqual(mesh.geometry.getAttribute('position').array, original.geometry.getAttribute('position').array);
    });
    room.solubleTargetMeshes.forEach((mesh, i) => {
      assert.deepEqual(mesh.userData, baseline.solubleTargetMeshes[i].userData);
      assert.deepEqual(mesh.scale, baseline.solubleTargetMeshes[i].scale);
    });
  };
  try {
    check();
    for (let frame = 0; frame < 3840; frame++) {
      baseline.update(1 / 60, occupants); room.update(1 / 60, occupants);
      if (frame % 60 === 0) check();
    }
    assert.equal(room.controller.readModel.state, 'complete');
    baseline.reset(); room.reset(); check();
    assert.equal(art.diagnostics.newTextures, 0);
    assert.ok(art.diagnostics.addedDrawCalls <= 36);
    const first = room.root.getObjectByName('room-4-art-shaft-0-0') as THREE.Mesh;
    const second = room.root.getObjectByName('room-4-art-shaft-1-0') as THREE.Mesh;
    assert.equal(first.geometry, second.geometry);
    assert.equal(first.material, second.material);
    let geometryDisposals = 0;
    first.geometry.addEventListener('dispose', () => geometryDisposals++);
    art.dispose(); art.dispose();
    assert.equal(geometryDisposals, 1);
    assert.equal(room.root.getObjectByName(first.name), undefined);
  } finally { art.dispose(); contamination.dispose(); lab.dispose(); chamber.dispose(); room.dispose(); baseline.dispose(); }
});
