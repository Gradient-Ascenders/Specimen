import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { CollisionWorld, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomThreeGreybox } from '../src/levels/LevelTwoRoomThreeGreybox.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationCoverEquipmentArt, COVER_EQUIPMENT } from '../src/render/environment/cultivation/CultivationCoverEquipmentArt.ts';
import { applyCultivationShadowRoles } from '../src/render/environment/cultivation/CultivationShadowCoverage.ts';

test('all eight unique equipment models preserve cover geometry and sightline volumes', () => {
 const baseline=new LevelTwoRoomThreeGreybox(()=>{}), lab=new CultivationLabMaterials(cultivationAssets), art=new CultivationCoverEquipmentArt(cultivationAssets);
 const room=new LevelTwoRoomThreeGreybox(()=>{},builder=>{lab.dress(builder,[],art.overrides());art.build(builder);});
 assert.equal(COVER_EQUIPMENT.length,8);
 assert.equal(new Set(COVER_EQUIPMENT.map(item=>item.identity)).size,8);
 assert.equal(room.collisionMeshes.filter(mesh=>mesh.userData.coverRole).length,8);
 for(const item of COVER_EQUIPMENT){
  const before=baseline.root.getObjectByName(item.name) as THREE.Mesh, after=room.root.getObjectByName(item.name) as THREE.Mesh;
  assert.deepEqual(after.userData,before.userData);
  assert.deepEqual(after.position.toArray(),before.position.toArray());
  assert.deepEqual(Array.from(after.geometry.getAttribute('position').array),Array.from(before.geometry.getAttribute('position').array));
  assert.deepEqual(new THREE.Box3().setFromObject(after),new THREE.Box3().setFromObject(before));
  // Probe every authored cover from both ground-level approach axes. The
  // production line-of-sight and movement queries must hit at the same fraction.
  const oldWorld = new CollisionWorld(), newWorld = new CollisionWorld();
  oldWorld.register(before); newWorld.register(after);
  for (const axis of ['x', 'z'] as const) for (const mask of [CollisionLayer.LineOfSight, CollisionLayer.Movement]) {
    const origin = before.position.clone(); origin.y = 0.46; origin[axis] -= 10;
    const displacement = new THREE.Vector3(); displacement[axis] = 20;
    const oldHit = new CollisionHit(), newHit = new CollisionHit();
    const radius = mask === CollisionLayer.LineOfSight ? 0.001 : 0.46;
    assert.equal(oldWorld.sweepSphere(origin, displacement, radius, oldHit, mask), true);
    assert.equal(newWorld.sweepSphere(origin, displacement, radius, newHit, mask), true);
    assert.equal(newHit.fraction, oldHit.fraction);
    assert.equal(newHit.object, after);
  }
  oldWorld.clear(); newWorld.clear();
  assert.equal((after.material as THREE.Material).visible,false);
  const bounds=art.propBounds.get(item.name)!;
  assert.ok(bounds.getSize(new THREE.Vector3()).x >= item.size[0]);
  assert.ok(bounds.getSize(new THREE.Vector3()).y >= item.size[1]);
 }
 assert.ok(art.diagnostics.drawCalls <= 56);
 assert.ok(art.diagnostics.drawCalls > 6, 'distant props retain independent culling bounds');
 assert.equal(new Set(art.root.children.filter(mesh => !mesh.userData.shadowHull).map(mesh => (mesh as THREE.Mesh).material)).size, 6, 'spatial batches reuse the six finishes');
 assert.equal(art.diagnostics.propCount,8);
 assert.equal(art.diagnostics.newTextures,4);
 applyCultivationShadowRoles(art.root);
 let hullTriangles = 0;
 art.root.traverse(object => {
  if (!(object instanceof THREE.Mesh)) return;
  if (object.userData.shadowHull) {
   assert.equal(object.castShadow, true);
   assert.equal((object.material as THREE.Material).colorWrite, false);
   hullTriangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  } else { assert.equal(object.castShadow, false); assert.equal(object.receiveShadow, true); }
 });
 assert.equal(hullTriangles, 8 * 12, 'only the stable cover envelopes enter the shadow passes');
 let disposedTextures=0;
 for(const texture of art.textures)texture.addEventListener('dispose',()=>disposedTextures++);
 let disposed=0;art.material.addEventListener('dispose',()=>disposed++);
 room.reset();lab.dispose();art.dispose();room.dispose();baseline.dispose();
 assert.equal(disposed,1);
 art.dispose();
 assert.equal(disposedTextures,4);
});
