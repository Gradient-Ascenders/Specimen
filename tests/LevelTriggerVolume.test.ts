import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { LevelTriggerVolume } from '../src/levels/LevelTriggerVolume.ts';

test('level trigger emits one enter and exit for sphere contact', () => {
  const volume = new LevelTriggerVolume({
    id: 'test-volume',
    centre: new THREE.Vector3(0, 0, 0),
    size: new THREE.Vector3(2, 2, 2),
  });
  const target = {
    position: new THREE.Vector3(2, 0, 0),
    radiusMetres: 0.45,
  };
  let entries = 0;
  let exits = 0;
  volume.trigger.events.on('entered', () => entries += 1);
  volume.trigger.events.on('exited', () => exits += 1);

  volume.update(target);
  assert.equal(volume.occupied, false);

  target.position.x = 1.4;
  volume.update(target);
  volume.update(target);
  assert.equal(volume.occupied, true);
  assert.equal(entries, 1);

  target.position.x = 2;
  volume.update(target);
  volume.update(target);
  assert.equal(volume.occupied, false);
  assert.equal(exits, 1);

  volume.dispose();
});

test('level trigger reset rearms entry without retaining occupancy', () => {
  const volume = new LevelTriggerVolume({
    id: 'reset-volume',
    centre: new THREE.Vector3(0, 0, 0),
    size: new THREE.Vector3(2, 2, 2),
  });
  const target = {
    position: new THREE.Vector3(0, 0, 0),
    radiusMetres: 0.45,
  };
  let entries = 0;
  volume.trigger.events.on('entered', () => entries += 1);

  volume.update(target);
  volume.reset();
  volume.update(target);

  assert.equal(entries, 2);
  volume.dispose();
});
