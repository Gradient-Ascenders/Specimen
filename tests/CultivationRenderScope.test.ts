import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene, LEVEL_TWO_ROOM_FOUR_OFFSET_Z, LEVEL_TWO_ROOM_FIVE_OFFSET_Z } from '../src/levels/LevelTwoPreviewScene.ts';
import { CollisionWorld, CollisionHit } from '../src/physics/CollisionWorld.ts';

test('render scope hides distant rooms while keeping authored collision and split-body simulation', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const world = new CollisionWorld(); world.registerAll(scene.collisionMeshes);
  try {
    const floor = scene.roomTwo.radiationHazard.mesh;
    const origin = floor.getWorldPosition(new THREE.Vector3()); origin.y = 4;
    const displacement = new THREE.Vector3(0, -8, 0), before = new CollisionHit(), after = new CollisionHit();
    assert.equal(world.sweepSphere(origin, displacement, .46, before), true);
    scene.updatePresentationVisibility({ z: 4 }, { z: 8 });
    assert.equal(scene.roomOne.root.visible, true);
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
    scene.reset(); scene.updatePresentationVisibility({ z: 4 }, { z: 8 });
    assert.equal(scene.roomOne.root.visible, true); assert.equal(scene.roomFive.root.visible, false);
  } finally { world.clear(); scene.dispose(); }
});
