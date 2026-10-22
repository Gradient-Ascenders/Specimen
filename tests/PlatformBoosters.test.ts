import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlatformBoosters } from '../src/render/environment/PlatformBoosters.ts';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { CONTAINMENT_BOOSTER_PLATFORMS } from '../src/render/environment/containment/ContainmentPlatformBoosters.ts';
import { LevelTwoRoomThreeGreybox } from '../src/levels/LevelTwoRoomThreeGreybox.ts';
import { LevelTwoRoomTwoGreybox } from '../src/levels/LevelTwoRoomTwoGreybox.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { LevelTwoRoomFiveGreybox } from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import { CultivationPlatformBoosters } from '../src/render/environment/cultivation/CultivationPlatformBoosters.ts';
import { addCultivationRoomThreeBoosters, addCultivationButtonPlatformBooster, CULTIVATION_TRAVERSAL_SUPPORT_IDS } from '../src/render/environment/cultivation/CultivationBoosterPlatforms.ts';

function batches(root: THREE.Object3D): THREE.Group[] {
  const result: THREE.Group[] = [];
  root.traverse(object => { if (object.userData.platformBoosterIds) result.push(object as THREE.Group); });
  return result;
}
function assertClearance(batch: THREE.Group, colliders: readonly THREE.Mesh[]): void {
  const flames = batch.children.find(child => child.name.endsWith('platform-booster-flames')) as THREE.InstancedMesh;
  batch.updateWorldMatrix(true, true);
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (let i = 0; i < flames.count; i++) {
    flames.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix).applyMatrix4(flames.matrixWorld);
    const scale = new THREE.Vector3().setFromMatrixScale(matrix).y;
    // Full outer exhaust plus housing, including the shader's small sideways flicker.
    const volume = new THREE.Box3(new THREE.Vector3(point.x - .4 * scale, point.y - .85 * scale, point.z - .4 * scale),
      new THREE.Vector3(point.x + .4 * scale, point.y + .62 * scale, point.z + .4 * scale));
    for (const collider of colliders) {
      if (CULTIVATION_TRAVERSAL_SUPPORT_IDS.includes(collider.name)) {
        assert.equal((collider.material as THREE.Material).visible, false, 'Preserved support collisions must have no rendered skin');
        continue;
      }
      collider.geometry.computeBoundingBox(); collider.updateWorldMatrix(true, false);
      const bounds = collider.geometry.boundingBox!.clone().applyMatrix4(collider.matrixWorld);
      assert.equal(volume.intersectsBox(bounds), false,
        `${batch.userData.platformBoosterIds[i]} engine/exhaust intersects ${collider.name}`);
    }
  }
}

test('Containment explicitly equips 8/7/9 platforms, with compact low engines and full moving-route clearance', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    assert.equal(scene.platformBoosters.platformCount, 24);
    const allBatches = batches(scene.root);
    assert.deepEqual(allBatches.map(batch => batch.userData.platformBoosterIds.length).sort((a, b) => a - b), [1, 1, 7, 7, 8]);
    const ids = allBatches.flatMap(batch => batch.userData.platformBoosterIds);
    assert.equal(new Set(ids).size, 24);
    assert.equal(ids.includes('room-2-platform-a-height-lesson'), true);
    assert.equal(ids.includes('room-5-lower-platform-c'), true);
    assert.equal(ids.some(id => /cargo|room-1-|room-4-|entry-platform/.test(id)), false);
    assert.ok(scene.root.getObjectByName('room-3-entry-platform-actuator-column'), 'Permanent entry deck support stays');
    const renderedSourceNames: string[] = [];
    scene.root.traverse(object => renderedSourceNames.push(object.name, ...(object.userData.staticBatchSourceNames ?? [])));
    assert.equal(renderedSourceNames.some(name => /^room-3-platform-(a-bounce|b-gap)-actuator-(column|base-socket|upper-collar)$/.test(name)), false);
    for (const room of [2, 3, 5] as const) for (const id of CONTAINMENT_BOOSTER_PLATFORMS[room]) assert.ok(ids.includes(id));
    for (const batch of allBatches) assertClearance(batch, scene.collisionMeshes);
    for (const platform of [scene.roomFive.movingPlatformOne, scene.roomFive.movingPlatformTwo]) {
      for (const progress of [0, .25, .5, .75, 1]) {
        platform.restoreState({ progress, target: 'end' });
        scene.roomFive.art.presentMovingPlatforms(.3);
        for (const batch of allBatches.filter(batch => batch.name.startsWith('containment-moving'))) assertClearance(batch, scene.collisionMeshes);
      }
    }
  } finally { scene.dispose(); }
});

test('moving booster batches inherit the same presentation pose as the whole deck without touching physics', () => {
  const scene = new ContainmentLevelScene(() => {});
  const idle = { position: new THREE.Vector3(-18, 76, 95), radiusMetres: .45 } as any;
  try {
    for (let step = 0; step < 450; step++) {
      scene.roomFive.updateTraversal(1 / 60, idle, []);
      for (const alpha of [0, .2, .8, 1]) {
        scene.roomFive.art.presentMovingPlatforms(alpha);
        for (const [i, platform] of [scene.roomFive.movingPlatformOne, scene.roomFive.movingPlatformTwo].entries()) {
          const current = platform.position.clone();
          const dressing = platform.root.getObjectByName(`room-5-moving-platform-${i + 1}-production-dressing`)!;
          const batch = dressing.getObjectByName(`containment-moving-${i + 1}-booster-batch`)!;
          assert.ok(batch.getWorldPosition(new THREE.Vector3()).distanceTo(dressing.getWorldPosition(new THREE.Vector3())) < 1e-9);
          scene.platformBoosters.update(0, current);
          assert.deepEqual(platform.position, current);
        }
      }
    }
    scene.roomFive.reset(); scene.platformBoosters.reset();
    assert.ok(batches(scene.root).every(batch => batch.position.lengthSq() === 0));
  } finally { scene.dispose(); }
});

test('Cultivation retains 21 Room 5 engines and equips all 13 Room 3 decks plus the button ledge with one shared light/audio owner', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const scope = scene.root, roomThree = scene.roomThree, roomFive = scene.roomFive;
  const boosters = new CultivationPlatformBoosters(roomFive, undefined, scope);
  try {
    assert.equal(boosters.platformCount, 21);
    const original = boosters.root.getObjectByName('room-5-platform-booster-flames') as THREE.InstancedMesh;
    const matrices = original.instanceMatrix.array.slice();
    addCultivationRoomThreeBoosters(boosters, roomThree);
    addCultivationRoomThreeBoosters(boosters, roomThree);
    addCultivationButtonPlatformBooster(boosters, scene.roomTwo);
    addCultivationButtonPlatformBooster(boosters, scene.roomTwo);
    assert.equal(boosters.platformCount, 35); assert.equal(boosters.batchCount, 3);
    assert.deepEqual(original.instanceMatrix.array, matrices);
    for (const batch of batches(roomThree.root)) assertClearance(batch, roomThree.collisionMeshes);
    for (const batch of batches(scene.roomTwo.root)) assertClearance(batch, scene.roomTwo.collisionMeshes);
    const lights = scope.children.filter(object => object.name.startsWith('room-5-platform-booster-spill-')) as THREE.PointLight[];
    assert.equal(lights.length, 2); assert.ok(lights.every(light => !light.castShadow));
    roomFive.root.visible = false; scene.roomTwo.root.visible = false; roomThree.root.visible = true;
    const observer = roomThree.root.localToWorld(new THREE.Vector3(8, 20, 9.5));
    for (let i = 0; i < 120; i++) boosters.update(1 / 60, observer);
    assert.ok(lights.every(light => light.intensity > 5));
    roomThree.root.visible = false;
    for (let i = 0; i < 120; i++) boosters.update(1 / 60, observer);
    assert.ok(lights.every(light => light.intensity === 0));
  } finally { boosters.dispose(); scene.dispose(); }
});

test('traversal post skins disappear without changing their collisions or button-platform shape/pose', () => {
  const raw = new LevelTwoRoomThreeGreybox(() => {});
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const rawTwo = new LevelTwoRoomTwoGreybox(() => {}, scene.roomTwoToThreeGoopPassage.entryDoor);
  try {
    for (const id of CULTIVATION_TRAVERSAL_SUPPORT_IDS) {
      const before = raw.collisionMeshes.find(mesh => mesh.name === id)!, after = scene.roomThree.collisionMeshes.find(mesh => mesh.name === id)!;
      assert.deepEqual(after.geometry.getAttribute('position').array, before.geometry.getAttribute('position').array);
      assert.deepEqual(after.geometry.index?.array, before.geometry.index?.array);
      assert.deepEqual(after.position, before.position); assert.deepEqual(after.quaternion.toArray(), before.quaternion.toArray());
      assert.equal((after.material as THREE.Material).visible, false);
      assert.equal(after.children.length, 0, 'No stale surface-skin proxy may render the removed post');
    }
    const ledge = scene.roomTwo.collisionMeshes.find(mesh => mesh.name === 'cultivation-room-2-button-rest-ledge')!;
    const originalLedge = rawTwo.collisionMeshes.find(mesh => mesh.name === ledge.name)!;
    assert.deepEqual(ledge.position.toArray(), originalLedge.position.toArray());
    assert.deepEqual(ledge.quaternion.toArray(), originalLedge.quaternion.toArray());
    assert.deepEqual(ledge.geometry.getAttribute('position').array, originalLedge.geometry.getAttribute('position').array);
    assert.deepEqual(ledge.geometry.index?.array, originalLedge.geometry.index?.array);
    assert.ok(ledge.getObjectByName(`${ledge.name}-level-one-platform-art`));
    assert.equal(ledge.material, scene.labArt.platformArt.hidden);
  } finally { raw.dispose(); rawTwo.dispose(); scene.dispose(); }
});

test('shared geometry/materials and instance buffers dispose exactly once; borrowed maps survive', () => {
  const parent = new THREE.Group(), other = new THREE.Group(), map = new THREE.Texture(); parent.add(other);
  const boosters = new PlatformBoosters(parent, 'test', { bumpMap: map, roughnessMap: map });
  const platforms = [{ id: 'one', top: [0, 3, 0] as const }];
  boosters.addPlatforms(boosters.root, platforms, 'first');
  boosters.addPlatforms(other, [{ id: 'two', top: [4, 6, 0] }], 'second');
  boosters.addPlatforms(other, platforms, 'duplicate');
  assert.equal(boosters.platformCount, 2); assert.equal(boosters.batchCount, 2);
  const meshes: THREE.InstancedMesh[] = [];
  parent.traverse(object => { if (object instanceof THREE.InstancedMesh) meshes.push(object); });
  const resources = new Set([...meshes.map(mesh => mesh.geometry), ...meshes.map(mesh => mesh.material)]);
  assert.equal(resources.size, 8); assert.equal(meshes.length, 8);
  let disposals = 0, instanceDisposals = 0, mapDisposals = 0;
  for (const resource of resources) (resource as THREE.BufferGeometry).addEventListener('dispose', () => disposals++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => instanceDisposals++);
  map.addEventListener('dispose', () => mapDisposals++);
  boosters.dispose(); boosters.dispose();
  assert.equal(disposals, 8); assert.equal(instanceDisposals, 8); assert.equal(mapDisposals, 0);
  assert.equal(boosters.root.parent, null); assert.equal(other.children.length, 0);
  map.dispose();
});
