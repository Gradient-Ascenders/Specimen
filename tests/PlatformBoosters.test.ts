import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlatformBoosters } from '../src/render/environment/PlatformBoosters.ts';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { FORMER_TRAVERSAL_SUPPORTS } from './helpers/FormerTraversalSupports.ts';
import { ColliderTransformMode, CollisionWorld, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

function batches(root: THREE.Object3D): THREE.Group[] {
  const result: THREE.Group[] = [];
  root.traverse(object => { if (object.userData.platformBoosterIds) result.push(object as THREE.Group); });
  return result;
}
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
