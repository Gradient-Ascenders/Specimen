import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LevelTwoRoomFiveGreybox } from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import { CultivationPlatformBoosters } from '../src/render/environment/cultivation/CultivationPlatformBoosters.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';

test('boosters preserve all platforms and collision while reusing two fading light slots', () => {
  const room = new LevelTwoRoomFiveGreybox(() => {});
  room.root.position.set(64, 0, 242);
  const before = room.collisionMeshes.map(mesh => ({mesh, position: mesh.position.clone(), quaternion: mesh.quaternion.clone(),
    geometry: mesh.geometry, metadata: structuredClone(mesh.userData)}));
  const art = new CultivationPlatformBoosters(room);
  try {
    const exhaust = art.root.getObjectByName('room-5-platform-booster-flames') as THREE.InstancedMesh;
    const platforms = room.root.children.filter(o => /^room-5-(route-\d+-jump-\d+|safe-\d+-deck|release-quiet-walk)$/.test(o.name));
    assert.equal(exhaust.count, platforms.length);
    assert.ok(exhaust.count > 20);
    const lamps = art.root.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
    assert.equal(lamps.length, 2);
    const player = new THREE.Vector3();
    for (const stop of [[-12, 10.66, 23], [11, 26.66, 45], [40, -10, 120]]) {
      player.set(...stop as [number, number, number]); room.root.localToWorld(player);
      for (let i = 0; i < 120; i++) art.update(1 / 60, player);
      assert.deepEqual(art.root.children.filter(o => o instanceof THREE.PointLight), lamps, 'light identities and count remain stable');
      assert.ok(lamps.every(l => !l.castShadow && l.visible && l.intensity >= 0 && l.intensity <= 8));
      if (stop[0] === 40) assert.ok(lamps.every(l => l.intensity === 0), 'no booster spill follows the player into the sewer');
      else assert.ok(lamps.every(l => l.intensity > 7));
    }
    art.reset();
    assert.ok(lamps.every(l => l.intensity === 0));
    assert.equal(room.collisionMeshes.length, before.length);
    for (const [i, snapshot] of before.entries()) {
      assert.equal(room.collisionMeshes[i], snapshot.mesh);
      assert.equal(snapshot.mesh.geometry, snapshot.geometry);
      assert.deepEqual(snapshot.mesh.position, snapshot.position);
      assert.deepEqual(snapshot.mesh.quaternion.toArray(), snapshot.quaternion.toArray());
      assert.deepEqual(snapshot.mesh.userData, snapshot.metadata);
    }
    assert.deepEqual(auditOpaqueSurfaces(art.root, .01).conflicts, []);
    let disposed = 0;
    exhaust.geometry.addEventListener('dispose', () => disposed++);
    art.dispose(); art.dispose(); assert.equal(disposed, 1); assert.equal(art.root.parent, null);
  } finally { art.dispose(); room.dispose(); }
});
