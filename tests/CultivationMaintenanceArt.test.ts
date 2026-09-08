import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomFiveGreybox } from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationMaintenanceArt } from '../src/render/environment/cultivation/CultivationMaintenanceArt.ts';
import { CollisionWorld, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';

test('maintenance art preserves all Room 5 colliders, LOS, acid bounds and checkpoint/reset transforms', () => {
  const before = new LevelTwoRoomFiveGreybox(() => {}), room = new LevelTwoRoomFiveGreybox(() => {});
  const lab = new CultivationLabMaterials(), art = new CultivationMaintenanceArt(room, lab);
  const check = () => {
    assert.equal(room.collisionMeshes.length, before.collisionMeshes.length);
    room.collisionMeshes.forEach((mesh, i) => {
      const old = before.collisionMeshes[i];
      assert.deepEqual(mesh.quaternion.toArray(), old.quaternion.toArray());
      for (const field of ['name', 'userData', 'position', 'scale', 'visible'] as const) assert.deepEqual(mesh[field], old[field], `${mesh.name}: ${field}`);
      assert.deepEqual(mesh.geometry.getAttribute('position').array, old.geometry.getAttribute('position').array, mesh.name);
    });
    for (const p of [[40, -11.8, 70], [0, .2, 40], [40, .5, 14], [-12, 10.5, 23], [8, .6, 65]]) {
      assert.equal(room.isAcidAt(new THREE.Vector3(...p)), before.isAcidAt(new THREE.Vector3(...p)));
    }
    const a = new CollisionWorld(), b = new CollisionWorld();
    a.registerAll(before.collisionMeshes); b.registerAll(room.collisionMeshes);
    const ha = new CollisionHit(), hb = new CollisionHit(), delta = new THREE.Vector3(30, -4, 12);
    for (let y = -10; y <= 30; y += 5) for (let z = 20; z < 80; z += 8) {
      const origin = new THREE.Vector3(-18, y, z);
      const hit = a.sweepSphere(origin, delta, .1, ha, CollisionLayer.LineOfSight);
      assert.equal(b.sweepSphere(origin, delta, .1, hb, CollisionLayer.LineOfSight), hit);
      if (hit) assert.equal(hb.fraction, ha.fraction);
    }
  };
  try {
    check();
    for (const checkpoint of ['controls', 'rescued', 'split'] as const) {
      before.restoreCheckpoint(checkpoint); room.restoreCheckpoint(checkpoint); check();
    }
    before.reset(); room.reset(); check();
    assert.equal(art.acidSurfaces.length, 13);
    assert.ok(art.acidSurfaces.every(mesh => mesh.material === lab.acid));
    assert.equal(art.diagnostics.newTextures, 0);
    assert.ok(art.diagnostics.staticMeshesBatched > 180);
    assert.ok(art.diagnostics.batches < 60);
    let disposal = 0;
    const batch = room.root.children.find(o => o.name.startsWith('room-5-art-static')) as THREE.Mesh;
    batch.geometry.addEventListener('dispose', () => disposal++);
    art.dispose(); art.dispose(); assert.equal(disposal, 1);
  } finally { art.dispose(); lab.dispose(); room.dispose(); before.dispose(); }
});
