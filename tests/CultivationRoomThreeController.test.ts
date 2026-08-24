import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CultivationRoomThreeController } from '../src/levels/CultivationRoomThreeController.ts';

test('Room 3 completion requires four ground disables and both identity exits', () => {
  const roomRoot = new THREE.Group();
  roomRoot.position.set(64, 0, 151);
  let disabledCount = 3;
  const controller = new CultivationRoomThreeController(roomRoot, () => disabledCount);
  const bob = { position: new THREE.Vector3(62.5, 3, 224.5), radiusMetres: 0.45 };
  const goop = { position: new THREE.Vector3(65.5, 3, 224.5), radiusMetres: 0.45 };
  let completionCount = 0;
  controller.events.on('completed', () => completionCount += 1);

  controller.update(bob, goop);
  assert.equal(controller.readModel.bobAtExit, true);
  assert.equal(controller.readModel.goopAtExit, true);
  assert.equal(controller.readModel.complete, false);

  disabledCount = 4;
  controller.update(bob, goop);
  controller.update(bob, goop);
  assert.equal(controller.readModel.complete, true);
  assert.equal(completionCount, 1);
});

test('Room 3 exit ownership cannot be swapped and reset clears completion', () => {
  const roomRoot = new THREE.Group();
  const controller = new CultivationRoomThreeController(roomRoot, () => 4);
  const bob = { position: new THREE.Vector3(1.5, 3, 73.5), radiusMetres: 0.45 };
  const goop = { position: new THREE.Vector3(-1.5, 3, 73.5), radiusMetres: 0.45 };

  controller.update(bob, goop);
  assert.equal(controller.readModel.complete, false);
  assert.equal(controller.readModel.bobAtExit, false);
  assert.equal(controller.readModel.goopAtExit, false);
  controller.reset();
  assert.deepEqual(controller.readModel, {
    bobAtExit: false,
    goopAtExit: false,
    groundDronesDisabled: 0,
    complete: false,
  });
});
