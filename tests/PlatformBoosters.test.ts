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
import { addCultivationRoomThreeBoosters, addCultivationButtonPlatformBooster } from '../src/render/environment/cultivation/CultivationBoosterPlatforms.ts';
import { FORMER_TRAVERSAL_SUPPORTS } from './helpers/FormerTraversalSupports.ts';
import { ColliderTransformMode, CollisionWorld, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

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
      collider.geometry.computeBoundingBox(); collider.updateWorldMatrix(true, false);
      const bounds = collider.geometry.boundingBox!.clone().applyMatrix4(collider.matrixWorld);
      assert.equal(volume.intersectsBox(bounds), false,
        `${batch.userData.platformBoosterIds[i]} engine/exhaust intersects ${collider.name}`);
    }
  }
}

test('Containment explicitly equips 8/8/9 platforms, with compact low engines and full moving-route clearance', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    assert.equal(scene.platformBoosters.platformCount, 25);
    const allBatches = batches(scene.root);
    assert.deepEqual(allBatches.map(batch => batch.userData.platformBoosterIds.length).sort((a, b) => a - b), [1, 1, 7, 8, 8]);
    const ids = allBatches.flatMap(batch => batch.userData.platformBoosterIds);
    assert.equal(new Set(ids).size, 25);
    assert.equal(ids.includes('room-2-platform-a-height-lesson'), true);
    assert.equal(ids.includes('room-5-lower-platform-c'), true);
    assert.equal(ids.some(id => /cargo|room-1-|room-4-/.test(id)), false);
    assert.equal(ids.filter(id => id === 'room-3-entry-platform').length, 1);
    const renderedSourceNames: string[] = [];
    scene.root.traverse(object => renderedSourceNames.push(object.name, ...(object.userData.staticBatchSourceNames ?? [])));
    assert.equal(renderedSourceNames.some(name => /^room-3-(entry-platform|platform-a-bounce|platform-b-gap)-actuator-(column|base-socket|upper-collar)$/.test(name)), false);
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

test('retired traversal poles leave no collision or render meshes; platform shapes/poses remain intact', () => {
  const raw = new LevelTwoRoomThreeGreybox(() => {});
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const rawTwo = new LevelTwoRoomTwoGreybox(() => {}, scene.roomTwoToThreeGoopPassage.entryDoor);
  try {
    for (const { id, platformId } of FORMER_TRAVERSAL_SUPPORTS) {
      assert.equal(raw.root.getObjectByName(id), undefined);
      assert.equal(scene.roomThree.root.getObjectByName(id), undefined);
      assert.equal(scene.collisionMeshes.some(mesh => mesh.name === id), false);
      const before = raw.collisionMeshes.find(mesh => mesh.name === platformId)!, after = scene.roomThree.collisionMeshes.find(mesh => mesh.name === platformId)!;
      assert.deepEqual(after.geometry.getAttribute('position').array, before.geometry.getAttribute('position').array);
      assert.deepEqual(after.geometry.index?.array, before.geometry.index?.array);
      assert.deepEqual(after.position, before.position); assert.deepEqual(after.quaternion.toArray(), before.quaternion.toArray());
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

test('entry spill stays below the deck and short of the entry wall without changing nearby engines', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    const entry = scene.collisionMeshes.find(mesh => mesh.name === 'room-3-entry-platform')!;
    const lamps: THREE.PointLight[] = [];
    scene.root.traverse(object => { if (object.name.startsWith('containment-platform-booster-spill-')) lamps.push(object as THREE.PointLight); });
    const settle = (point: THREE.Vector3) => { for (let i = 0; i < 120; i++) scene.platformBoosters.update(1 / 60, point); };
    settle(entry.position);
    const lamp = lamps.find(light => Math.abs(light.position.z - entry.position.z) < 1e-6)!;
    assert.ok(lamp && lamp.intensity > 5, 'Entry underside light remains powered');
    assert.equal(lamps.length, 2); assert.ok(lamps.every(light => !light.castShadow));
    const lightPosition = lamp.getWorldPosition(new THREE.Vector3());
    const top = entry.position.y + (entry.geometry as THREE.BoxGeometry).parameters.height / 2;
    assert.ok(lightPosition.y + lamp.distance < top, 'Spill cannot cross the walking-surface plane');
    assert.ok(Math.abs(lightPosition.z - 49.2) > lamp.distance, 'Spill cannot reach the front of the entry wall');
    assert.ok(top - .5 - lightPosition.y < lamp.distance, 'Underside remains inside the light range');
    const neighbour = scene.collisionMeshes.find(mesh => mesh.name === 'room-3-platform-a-bounce')!;
    settle(neighbour.position);
    const normal = lamps.find(light => light.position.distanceTo(new THREE.Vector3(neighbour.position.x,
      neighbour.position.y + .25 - 1.47, neighbour.position.z)) < 1e-6)!;
    assert.ok(normal && normal.intensity > 5);
    assert.equal(normal.distance, 6, 'Neighbour retains the original spill range');
  } finally { scene.dispose(); }
});

test('former traversal poles no longer block movement, camera, projectile or sight sweeps; decks still carry Bob', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  try {
    scene.root.updateMatrixWorld(true);
    for (const broadphaseEnabled of [false, true]) {
      const world = new CollisionWorld({ broadphaseEnabled }), surfaces = new SurfaceRegistry();
      world.registerAll(scene.collisionMeshes, undefined, ColliderTransformMode.Static);
      surfaces.registerAll(scene.collisionMeshes);
      try {
        for (const { id, platformId, position } of FORMER_TRAVERSAL_SUPPORTS) {
          const platform = scene.roomThree.collisionMeshes.find(mesh => mesh.name === platformId)!;
          const size = (platform.geometry as THREE.BoxGeometry).parameters;
          const underside = platform.position.y - size.height / 2;
          for (const y of [position[1], underside - 1.5]) {
            const centre = scene.roomThree.root.localToWorld(new THREE.Vector3(position[0], y, position[2]));
            for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
              const origin = centre.clone().addScaledVector(axis, -2), displacement = axis.clone().multiplyScalar(4);
              for (const mask of [CollisionLayer.Movement, CollisionLayer.CameraObstruction, CollisionLayer.Projectile, CollisionLayer.LineOfSight]) {
                const hit = new CollisionHit();
                assert.equal(world.sweepSphere(origin, displacement, .45, hit, mask), false,
                  `${id} footprint blocked query layer ${mask} with ${hit.object?.name}`);
              }
              assert.equal(world.raycast(origin, axis, 4, new CollisionHit()), false, `${id} must not be invisible cover`);
            }
          }
          // A real Bob body, with normal gravity/acceleration, passes through
          // the upper former pole volume instead of snagging on it in mid-air.
          const start = scene.roomThree.root.localToWorld(new THREE.Vector3(position[0] - 2, underside - 1.5, position[2]));
          const bob = new KinematicBody({ world, surfaces, initialPosition: start });
          for (let step = 0; step < 60; step++) bob.update(1 / 60, new THREE.Vector3(1, 0, 0));
          assert.ok(bob.position.x > start.x + 4, `Bob snagged in ${id}'s former volume`);
          const top = scene.roomThree.root.localToWorld(platform.position.clone().add(new THREE.Vector3(0, size.height / 2 + .46, 0)));
          const rider = new KinematicBody({ world, surfaces, initialPosition: top });
          for (let step = 0; step < 12; step++) {
            rider.update(1 / 60, new THREE.Vector3(1, 0, 0));
            assert.equal(rider.isSupportedBy(platform), true, `${platformId} must remain walkable`);
          }
        }
        const cover = scene.roomThree.collisionMeshes.find(mesh => mesh.name === 'cultivation-room-3-goop-cover-1')!;
        const point = cover.getWorldPosition(new THREE.Vector3()), hit = new CollisionHit();
        assert.equal(cover.userData.coverRole, 'drone-line-of-sight-blocker');
        assert.equal(world.raycast(point.clone().add(new THREE.Vector3(-4, 0, 0)), new THREE.Vector3(1, 0, 0), 8, hit), true);
        assert.equal(hit.object, cover, 'Authored drone cover must still block sight');
      } finally { world.clear(); surfaces.clear(); }
    }
  } finally { scene.dispose(); }
});

test('a reused light slot restores the default range after leaving a compact spill', () => {
  const parent = new THREE.Group(), boosters = new PlatformBoosters(parent, 'range-test');
  boosters.addPlatforms(boosters.root, [{ id: 'enclosed', top: [0, 3, 0], spillRangeMetres: 1.4 },
    { id: 'open', top: [30, 3, 0] }], 'range-test');
  try {
    const lamps = boosters.root.children.filter(object => object instanceof THREE.PointLight) as THREE.PointLight[];
    for (let i = 0; i < 120; i++) boosters.update(1 / 60, { x: 0, y: 3, z: 0 });
    const slot = lamps.find(light => light.intensity > 5)!;
    assert.equal(slot.distance, 1.4);
    for (let i = 0; i < 120; i++) boosters.update(1 / 60, { x: 30, y: 3, z: 0 });
    assert.ok(slot.intensity > 5); assert.equal(slot.position.x, 30); assert.equal(slot.distance, 6);
    boosters.reset();
    assert.ok(lamps.every(light => light.intensity === 0));
  } finally { boosters.dispose(); }
});

test('the actual doorway offender never receives a light slot; its surface glow shares exhaust resources', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    const exit = scene.collisionMeshes.find(mesh => mesh.name === 'room-2-exit-balcony')!;
    const lamps: THREE.PointLight[] = [];
    scene.root.traverse(object => { if (object.name.startsWith('containment-platform-booster-spill-')) lamps.push(object as THREE.PointLight); });
    const oldSource = new THREE.Vector3(exit.position.x, exit.position.y + .25 - 1.47, exit.position.z);
    for (const observer of [exit.position, new THREE.Vector3(.6, 11.36, 49.8), new THREE.Vector3(2.7885, 11, 57.6261)]) {
      for (let i = 0; i < 120; i++) {
        scene.platformBoosters.update(1 / 60, observer);
        assert.ok(lamps.every(light => light.intensity === 0 || light.getWorldPosition(new THREE.Vector3()).distanceTo(oldSource) > .01),
          'The exit-balcony light caused the doorway leak and must never be selected');
      }
    }
    const glow = scene.root.getObjectByName('containment-room-2-platform-booster-surface-glow') as THREE.InstancedMesh;
    const flames = scene.root.getObjectByName('containment-room-2-platform-booster-flames') as THREE.InstancedMesh;
    assert.equal(glow.count, 1); assert.equal(glow.material, flames.material);
    assert.equal((glow.material as THREE.Material).depthTest, true);
    const positions = glow.geometry.getAttribute('position'), normals = glow.geometry.getAttribute('normal');
    for (let i = 0; i < positions.count; i++) { assert.equal(positions.getY(i), 0); assert.ok(normals.getY(i) < -.99); }
    let disposed = 0; glow.geometry.addEventListener('dispose', () => disposed++);
    scene.dispose(); assert.equal(disposed, 1);
  } finally { scene.dispose(); }
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
