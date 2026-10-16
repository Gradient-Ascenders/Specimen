import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene, LEVEL_TWO_ROOM_FOUR_OFFSET_Z, LEVEL_TWO_ROOM_FIVE_OFFSET_Z } from '../src/levels/LevelTwoPreviewScene.ts';
import { CollisionWorld, CollisionHit } from '../src/physics/CollisionWorld.ts';
import { DissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

test('render scope hides distant rooms while keeping authored collision and split-body simulation', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const world = new CollisionWorld(); world.registerAll(scene.collisionMeshes);
  try {
    const floor = scene.roomTwo.radiationHazard.mesh;
    const origin = floor.getWorldPosition(new THREE.Vector3()); origin.y = 4;
    const displacement = new THREE.Vector3(0, -8, 0), before = new CollisionHit(), after = new CollisionHit();
    assert.equal(world.sweepSphere(origin, displacement, .46, before), true);
    scene.updatePresentationVisibility({ z: 4 }, { z: 8 });
    assert.equal(scene.roomOne.root.visible, true);
    assert.equal(scene.roomOneToTwoPassage.root.visible, true, 'exit shutter remains visible from across Room 1');
    for (const rope of scene.roomOne.solubleTargetMeshes) {
      assert.equal(rope.children.some(child => child.name.includes('soluble-marker-band')), false);
      assert.equal(rope.userData.soluble, true, 'wood stays shootable without a green marker');
    }
    for (const room of [scene.roomTwo, scene.roomThree, scene.roomFour, scene.roomFive]) assert.equal(room.root.visible, false);
    assert.equal(floor.visible, true);
    assert.equal(world.sweepSphere(origin, displacement, .46, after), true);
    assert.equal(after.object, before.object); assert.equal(after.fraction, before.fraction);
    const secondRoomLaser = scene.roomTwo.lasers.hazards[0].start.clone();
    scene.update(.1, 1, [{ id: 'goop', position: origin, radiusMetres: .46 }]);
    assert.notDeepEqual(scene.roomTwo.lasers.hazards[0].start, secondRoomLaser);
    scene.updatePresentationVisibility({ z: 60 }, { z: 65 });
    assert.equal(scene.roomOne.root.visible, true); assert.equal(scene.roomTwo.root.visible, true);
    assert.equal(scene.roomOneToTwoPassage.root.visible, true);
    assert.equal(scene.roomTwoToThreeGoopPassage.root.visible, true, 'Room 2 exit renders before its proximity trigger');
    scene.updatePresentationVisibility({ z: 135 }, { z: 140 });
    assert.equal(scene.roomTwo.root.visible, true); assert.equal(scene.roomThree.root.visible, true);
    assert.equal(scene.roomTwoToThreeBobAirDuct.root.visible, true);
    assert.equal(scene.roomTwoToThreeGoopPassage.root.visible, true);
    scene.roomFour.controller.update(1.5, true, true);
    scene.updatePresentationVisibility({ z: LEVEL_TWO_ROOM_FOUR_OFFSET_Z + 5 }, { z: LEVEL_TWO_ROOM_FOUR_OFFSET_Z + 10 });
    assert.equal(scene.roomFour.root.visible, true); assert.equal(scene.roomFive.root.visible, false);
    scene.roomFour.controller.restoreArrival();
    scene.updatePresentationVisibility({ z: LEVEL_TWO_ROOM_FIVE_OFFSET_Z - 7 }, { z: LEVEL_TWO_ROOM_FIVE_OFFSET_Z - 5 });
    assert.equal(scene.roomFive.root.visible, true);
    scene.updatePresentationVisibility({ z: LEVEL_TWO_ROOM_FIVE_OFFSET_Z - 5 }, { z: LEVEL_TWO_ROOM_FIVE_OFFSET_Z + 1 });
    assert.equal(scene.roomThree.root.visible, false, 'upper Room 3 stays hidden while the camera crosses the lower vent entrance');
    assert.equal(scene.roomFourGeometry.visible, true);
    assert.equal(scene.roomFive.root.visible, true);
    const arrivalLights: THREE.Light[] = [];
    scene.root.traverseVisible(object => { if (object instanceof THREE.Light) arrivalLights.push(object); });
    const liftFloor = scene.roomFour.collisionMeshes.find(mesh => mesh.name === 'room-4-lift-floor')!;
    const floorBefore = liftFloor.getWorldPosition(new THREE.Vector3());
    scene.updatePresentationVisibility({ z: 275 }, { z: 280 });
    assert.equal(scene.roomFourGeometry.visible, false, 'distant lift geometry is still culled');
    assert.equal(scene.roomFour.root.visible, true, 'the finite lift lights retain their shader slots');
    assert.equal(liftFloor.visible, true, 'render culling cannot disable collision');
    assert.deepEqual(liftFloor.getWorldPosition(new THREE.Vector3()), floorBefore);
    const distantLights: THREE.Light[] = [];
    scene.root.traverseVisible(object => { if (object instanceof THREE.Light) distantLights.push(object); });
    assert.deepEqual(distantLights, arrivalLights);
    scene.reset(); scene.updatePresentationVisibility({ z: 4 }, { z: 8 });
    assert.equal(scene.roomOne.root.visible, true); assert.equal(scene.roomFive.root.visible, false);
  } finally { world.clear(); scene.dispose(); }
});

test('workload scopes suspend dormant updates, preserve hidden occupants and finish remote drops', context => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  try {
    const second = context.mock.method(scene.roomTwo, 'update');
    const fifth = context.mock.method(scene.roomFive, 'update');
    const captive = context.mock.method(scene.roomFive, 'updateCosmetics');
    scene.updatePresentationVisibility({ z: 4 }, { z: 8 });
    scene.update(.1, 1, []);
    assert.deepEqual(scene.workload.snapshot().resident, [1, 2, 3, 4, 5]);
    assert.deepEqual(scene.workload.snapshot().simulated, [1]);
    assert.deepEqual(scene.workload.snapshot().rendered, [1]);
    assert.equal(second.mock.callCount(), 0); assert.equal(fifth.mock.callCount(), 0);
    assert.equal(captive.mock.callCount(), 0);
    scene.update(.1, 1, [], undefined, new Set([3]));
    assert.deepEqual(scene.workload.snapshot().simulated, [1, 3], 'live encounter projectiles retain simulation ownership');
    const goop = { id: 'goop' as const, position: scene.copyRoomSpawnPosition(2, 'goop', new THREE.Vector3()), radiusMetres: .46 };
    scene.update(.1, 1, [goop]);
    assert.deepEqual(scene.workload.snapshot().simulated, [1, 2]);
    assert.equal(second.mock.callCount(), 1, 'hidden persistent body keeps its room simulated');

    const collisionWorld = new CollisionWorld(), surfaceRegistry = new SurfaceRegistry();
    const targets = scene.solubleTargetMeshes.map(mesh => new DissolveTarget({ mesh,
      id: mesh.userData.solubleId, collisionWorld, surfaceRegistry, dissolveDurationSeconds: .5, collisionDisableProgress: .9 }));
    scene.bindDissolveTargets(targets);
    const drop = scene.roomThree.wallDrops[0];
    const support = targets.find(target => target.id === drop.solubleTargetId)!;
    support.advance(support.dissolveDurationSeconds);
    scene.update(.1, 1, []);
    assert.ok(scene.workload.simulated.has(3));
    assert.equal(drop.state, 'falling');
    scene.update(10, 1, []);
    assert.equal(drop.state, 'landed', 'released geometry finishes while its room is hidden and empty');
    scene.update(.1, 1, []);
    assert.equal(scene.workload.simulated.has(3), false);
    for (const target of targets) target.dispose();

    scene.updatePresentationVisibility({ z: 275 }, { z: 280 });
    scene.update(.1, 1, []);
    assert.equal(captive.mock.callCount(), 1, 'cosmetics follow the camera independently of simulation');
    assert.equal(fifth.mock.callCount(), 0);
    scene.workload.prepared.add(5);
    scene.reset();
    assert.deepEqual(scene.workload.snapshot().simulated, []);
    assert.deepEqual(scene.workload.snapshot().rendered, [1]);
    assert.ok(scene.workload.prepared.has(5), 'restart retains ready GPU resources');
  } finally { scene.dispose(); }
  assert.deepEqual(scene.workload.snapshot().resident, []);
  assert.deepEqual(scene.workload.snapshot().prepared, []);
});

test('immutable local transforms freeze while lift, fan, controls and rescue assemblies remain live', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  try {
    const diagnostic = scene.getWorkloadDiagnostics();
    assert.ok(diagnostic.frozenTransforms > 1000);
    assert.ok(diagnostic.automaticMatrices < 500);
    for (const object of [...scene.roomTwo.dynamicTransformRoots, ...scene.roomThree.dynamicTransformRoots,
      ...scene.roomFour.dynamicTransformRoots, ...scene.roomFive.dynamicTransformRoots, scene.filtrationArt.fan]) {
      assert.equal(object.matrixAutoUpdate, true, object.name);
    }
    scene.roomFour.controller.restoreArrival();
    const before = scene.roomFour.arrivalWall.getWorldPosition(new THREE.Vector3());
    scene.update(.1, 5, []);
    assert.notDeepEqual(scene.roomFour.arrivalWall.getWorldPosition(new THREE.Vector3()), before);
    const staticMesh = scene.roomOne.collisionMeshes.find(mesh => !mesh.matrixAutoUpdate)!;
    const local = staticMesh.position.clone();
    scene.root.position.x += 10;
    assert.equal(staticMesh.getWorldPosition(new THREE.Vector3()).x, local.x + scene.root.position.x);
    scene.reset();
    assert.equal(scene.roomFour.arrivalWall.matrixAutoUpdate, true);
  } finally { scene.dispose(); }
});
