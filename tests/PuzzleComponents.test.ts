import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { Door } from '../src/puzzle/Door.ts';
import { PressurePlate } from '../src/puzzle/PressurePlate.ts';

test('existing pressure plate keeps its occupant threshold and reset behaviour', () => {
  const plate = new PressurePlate({
    id: 'regression-plate',
    position: new THREE.Vector3(),
    requiredOccupants: 2,
  });
  const changes: boolean[] = [];
  plate.events.on('changed', ({ pressed }) => changes.push(pressed));

  plate.setOccupants(['bob']);
  assert.equal(plate.isPressed, false);
  plate.setOccupants(['bob', 'goop']);
  assert.equal(plate.isPressed, true);
  plate.setOccupants(['goop']);
  assert.equal(plate.isPressed, false);
  plate.setOccupants(['bob', 'goop']);
  plate.reset();

  assert.equal(plate.isPressed, false);
  assert.deepEqual(changes, [true, false, true, false]);
  plate.dispose();
});

test('existing hinged door keeps deterministic endpoints, reversal, and reset', () => {
  const door = new Door({
    id: 'regression-door',
    position: new THREE.Vector3(),
    openDurationSeconds: 1,
  });
  const states: string[] = [];
  door.events.on('stateChanged', ({ state }) => states.push(state));

  door.setOpen(true);
  door.update(0.4);
  assert.equal(door.doorState, 'opening');
  assert.equal(door.openProgress, 0.4);

  door.setOpen(false);
  door.update(0.2);
  assert.equal(door.doorState, 'closing');
  assert.ok(Math.abs(door.openProgress - 0.2) < 1e-12);

  door.setOpen(true);
  door.update(0.8);
  assert.equal(door.doorState, 'open');
  assert.equal(door.openProgress, 1);

  door.reset();
  assert.equal(door.doorState, 'closed');
  assert.equal(door.openProgress, 0);
  assert.equal(door.isOpen, false);
  assert.deepEqual(states, ['opening', 'closing', 'opening', 'open', 'closed']);
  door.dispose();
});
