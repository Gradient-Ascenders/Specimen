import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CultivationCheckpointManager,
  type CultivationCheckpointDefinition,
} from '../src/levels/CultivationCheckpointManager.ts';
import { SlimeManager } from '../src/slimes/SlimeManager.ts';
import { PersistentSlimePair } from '../src/slimes/PersistentSlimePair.ts';

class TestBody {
  readonly position = new THREE.Vector3();
  readonly radiusMetres = 0.45;
  private readonly id: string;
  private readonly order: string[];

  constructor(id: string, order: string[]) {
    this.id = id;
    this.order = order;
  }

  recoverAt(position: THREE.Vector3): void {
    this.order.push(`recover:${this.id}`);
    this.position.copy(position);
  }
}

const checkpoint = (
  id: string,
  group: string,
  z: number,
): CultivationCheckpointDefinition => ({
  id,
  puzzleGroupId: group,
  bobSpawnPosition: new THREE.Vector3(-1, 0.45, z),
  goopSpawnPosition: new THREE.Vector3(1, 0.45, z),
  progression: {
    roomId: z === 0 ? 'cultivation-room-1' : 'cultivation-room-3',
    bobEnteredRoomThree: z !== 0,
    goopEnteredRoomThree: z !== 0,
  },
});

test('dual checkpoint resets puzzle state before recovering both bodies', () => {
  const order: string[] = [];
  const manager = new SlimeManager<TestBody>();
  const bob = new TestBody('bob', order);
  const goop = new TestBody('goop', order);
  const pair = new PersistentSlimePair({
    manager,
    bobBody: bob,
    goopBody: goop,
    bobSpawnPosition: new THREE.Vector3(-1, 0.45, 0),
    goopSpawnPosition: new THREE.Vector3(1, 0.45, 0),
  });
  const groups = {
    hasGroup: (id: string) => id === 'room-1' || id === 'room-3',
    resetGroup: (id: string) => order.push(`reset:${id}`),
  };
  const checkpoints = new CultivationCheckpointManager(
    checkpoint('start', 'room-1', 0),
    'bob',
    () => true,
    groups,
  );
  checkpoints.register(checkpoint('room-3', 'room-3', 12));

  pair.switchActive();
  checkpoints.activate('room-3', 'goop');
  checkpoints.recover(pair);

  assert.deepEqual(order, ['reset:room-3', 'recover:bob', 'recover:goop']);
  assert.deepEqual(bob.position.toArray(), [-1, 0.45, 12]);
  assert.deepEqual(goop.position.toArray(), [1, 0.45, 12]);
  assert.equal(pair.activeSlimeId, 'goop');
});

test('both spawn anchors are safety-checked at registration and recovery', () => {
  const manager = new SlimeManager<TestBody>();
  const pair = new PersistentSlimePair({
    manager,
    bobBody: new TestBody('bob', []),
    goopBody: new TestBody('goop', []),
    bobSpawnPosition: new THREE.Vector3(-1, 0.45, 0),
    goopSpawnPosition: new THREE.Vector3(1, 0.45, 0),
  });
  let safe = true;
  const checkpoints = new CultivationCheckpointManager(
    checkpoint('start', 'room-1', 0),
    'bob',
    () => safe,
    { hasGroup: () => true, resetGroup: () => {} },
  );
  safe = false;
  assert.throws(() => checkpoints.recover(pair), /unsafe Bob spawn/);
});
