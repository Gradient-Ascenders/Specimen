import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  RadioactiveHazardSystem,
  type RadiationContactTarget,
} from '../src/hazards/RadioactiveHazardSystem.ts';

const definition = {
  id: 'test-radiation',
  centre: new THREE.Vector3(),
  size: new THREE.Vector3(2, 2, 2),
};

function target(
  id: string,
  response: RadiationContactTarget['response'],
  position = new THREE.Vector3(),
  kind: RadiationContactTarget['kind'] = 'slime',
): RadiationContactTarget {
  return { id, response, position, kind, radiusMetres: 0.45 };
}

test('Bob is lethal and Goop is immune in the same authored radiation', () => {
  const failures: string[] = [];
  const system = new RadioactiveHazardSystem([definition], (failure) => {
    failures.push(failure.targetId);
    return true;
  });

  system.update([target('goop', 'immune')]);
  assert.deepEqual(failures, []);
  system.update([target('bob', 'lethal')]);
  assert.deepEqual(failures, ['bob']);
  assert.equal(system.failureRequestCount, 1);

  system.dispose();
});

test('active selection cannot hide Bob or revoke Goop immunity', () => {
  for (const activeSlimeId of ['bob', 'goop'] as const) {
    const failures: string[] = [];
    const system = new RadioactiveHazardSystem([definition], (failure) => {
      failures.push(failure.targetId);
      return true;
    });
    const outside = new THREE.Vector3(10, 0, 0);

    system.update([
      target('bob', 'lethal'),
      target('goop', 'immune', outside),
    ]);
    assert.deepEqual(
      failures,
      ['bob'],
      `Bob must remain detectable while ${activeSlimeId} is selected.`,
    );

    system.reset();
    failures.length = 0;
    system.update([
      target('bob', 'lethal', outside),
      target('goop', 'immune'),
    ]);
    assert.deepEqual(
      failures,
      [],
      `Goop must remain immune while ${activeSlimeId} is selected.`,
    );
    system.dispose();
  }
});

test('one continuous or simultaneous overlap creates one failure request', () => {
  const failures: string[] = [];
  const system = new RadioactiveHazardSystem([definition], (failure) => {
    failures.push(failure.targetId);
    return true;
  });
  const bob = target('bob', 'lethal');

  system.update([bob, target('goop', 'immune')]);
  system.update([bob]);
  system.update([bob]);
  assert.deepEqual(failures, ['bob']);

  system.reset();
  system.update([bob]);
  assert.deepEqual(failures, ['bob', 'bob']);
  system.dispose();
});

test('overlapping radiation volumes still enqueue only one failure', () => {
  const failures: string[] = [];
  const system = new RadioactiveHazardSystem(
    [definition, { ...definition, id: 'overlapping-radiation' }],
    (failure) => {
      failures.push(`${failure.hazardId}:${failure.targetId}`);
      return true;
    },
  );

  system.update([target('bob', 'lethal')]);
  assert.equal(failures.length, 1);
  assert.equal(system.failureRequestCount, 1);
  system.dispose();
});

test('drone contact emits a signal without owning drone state or failure', () => {
  let failureCount = 0;
  const contacts: string[] = [];
  const system = new RadioactiveHazardSystem([definition], () => {
    failureCount += 1;
    return true;
  });
  system.events.on('contacted', ({ targetId, response }) => {
    contacts.push(`${targetId}:${response}`);
  });

  system.update([target('room-3-drone', 'signal', new THREE.Vector3(), 'drone')]);
  assert.deepEqual(contacts, ['room-3-drone:signal']);
  assert.equal(failureCount, 0);
  system.dispose();
});
