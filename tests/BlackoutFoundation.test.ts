import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { BLACKOUT_SLIME_DEFINITIONS } from '../src/levels/BlackoutSlimeDefinitions.ts';
import { validateLevelThreeProgressionSnapshot } from '../src/levels/LevelProgression.ts';
import {
  BlackoutCheckpointManager,
  type BlackoutCheckpointDefinition,
} from '../src/levels/BlackoutCheckpointManager.ts';
import {
  BLACKOUT_CHECKPOINT_IDS,
  BlackoutPhaseController,
  type SerializableValue,
} from '../src/levels/BlackoutRuntimeState.ts';
import { SlimeManager } from '../src/slimes/SlimeManager.ts';
import { PersistentSlimeGroup } from '../src/slimes/PersistentSlimeGroup.ts';

class TestBody {
  readonly position = new THREE.Vector3();
  readonly radiusMetres = 0.45;
  recoveries = 0;

  constructor(position: THREE.Vector3) {
    this.position.copy(position);
  }

  recoverAt(position: THREE.Vector3): void {
    this.position.copy(position);
    this.recoveries += 1;
  }
}

const positions = (z = 0) => ({
  bob: new THREE.Vector3(-2, 0.46, z),
  goop: new THREE.Vector3(0, 0.46, z),
  volt: new THREE.Vector3(2, 0.46, z),
});

const checkpoint = (
  id: BlackoutCheckpointDefinition['id'] = 'cp1',
  z = 0,
): BlackoutCheckpointDefinition => {
  const specimen = id === 'cp8' || id === 'cp9';
  return {
    id,
    bodyPositions: positions(z),
    activeSlimeId: specimen ? 'bob' : 'volt',
    controlledForm: specimen ? 'specimen' : 'group',
    specimenPosition: specimen
      ? new THREE.Vector3(0, 0.685, z)
      : undefined,
    specimenClearanceRadius: specimen ? 0.675 : undefined,
    room: {
      roomId: specimen ? 'room-4b' : 'room-1',
      phase: id === 'cp9' ? 'boss' : specimen ? 'specimen' : 'three-slime',
      local: {},
    },
  };
};

function makeGroup() {
  const manager = new SlimeManager<TestBody>(BLACKOUT_SLIME_DEFINITIONS);
  const starts = positions();
  const bodies = {
    bob: new TestBody(starts.bob),
    goop: new TestBody(starts.goop),
    volt: new TestBody(starts.volt),
  };
  const group = new PersistentSlimeGroup({
    manager,
    bodies,
    spawnPositions: starts,
    initialActiveSlimeId: 'volt',
  });
  return {
    manager,
    bodies,
    group,
    specimen: new TestBody(new THREE.Vector3(0, 0.685, 60)),
  };
}

test('Level 3 group registers all three bodies once and switching preserves inactive positions', () => {
  const { manager, bodies, group } = makeGroup();
  const bobBefore = bodies.bob.position.clone();
  const goopBefore = bodies.goop.position.clone();
  const voltBefore = bodies.volt.position.clone();

  assert.equal(manager.registeredCount, 3);
  assert.equal(group.activeSlimeId, 'volt');
  assert.equal(group.switchNext(), true);
  assert.equal(group.activeSlimeId, 'bob');
  assert.deepEqual(bodies.bob.position, bobBefore);
  assert.deepEqual(bodies.goop.position, goopBefore);
  assert.deepEqual(bodies.volt.position, voltBefore);
  assert.equal(manager.getBody('bob'), bodies.bob);
  assert.equal(manager.getBody('goop'), bodies.goop);
  assert.equal(manager.getBody('volt'), bodies.volt);
});

test('Level 3 checkpoint recovery clears transients, restores participant state, bodies, and ownership', () => {
  const { bodies, group, specimen } = makeGroup();
  const manager = new BlackoutCheckpointManager<TestBody>(
    checkpoint(),
    () => true,
  );
  let liveTransient = true;
  let participantState: SerializableValue = { doorOpen: false, hazardActive: true };
  const order: string[] = [];
  manager.registerParticipant({
    id: 'room-state',
    capture: () => participantState,
    resetTransient: () => {
      order.push('transient');
      liveTransient = false;
    },
    restore: (state) => {
      order.push('restore');
      participantState = state;
    },
  });

  manager.activate('cp1', 'volt');
  bodies.bob.position.set(4, 1, 4);
  bodies.goop.position.set(5, 1, 5);
  bodies.volt.position.set(6, 1, 6);
  group.activate('goop');
  participantState = { doorOpen: true, hazardActive: false };
  liveTransient = true;

  const restored = manager.recover(group, specimen);
  assert.deepEqual(order, ['transient', 'restore']);
  assert.equal(liveTransient, false);
  assert.deepEqual(participantState, { doorOpen: false, hazardActive: true });
  assert.deepEqual(bodies.bob.position, positions().bob);
  assert.deepEqual(bodies.goop.position, positions().goop);
  assert.deepEqual(bodies.volt.position, positions().volt);
  assert.equal(group.activeSlimeId, 'volt');
  assert.equal(restored.connections.voltTargetId, null);
  assert.equal(restored.controlledForm, 'group');
  assert.equal(restored.specimenPosition, null);
});

test('checkpoint snapshots are independent, use authored safe anchors, and recover idempotently', () => {
  const { bodies, group, specimen } = makeGroup();
  const manager = new BlackoutCheckpointManager<TestBody>(checkpoint(), () => true);
  manager.registerCheckpoint(checkpoint('cp2', 10));

  bodies.bob.position.set(-1, 0.46, 7);
  bodies.goop.position.set(0, 0.46, 8);
  bodies.volt.position.set(1, 0.46, 9);
  group.activate('bob');
  manager.activate('cp2', group.activeSlimeId, {
    roomId: 'room-1',
    phase: 'three-slime',
    local: { tutorialComplete: true },
  });

  const first = manager.activeCheckpoint;
  const mutable = first.bodyPositions.bob as [number, number, number];
  mutable[0] = 999;
  assert.notEqual(manager.activeCheckpoint.bodyPositions.bob[0], 999);

  manager.recover(group, specimen);
  manager.recover(group, specimen);
  assert.equal(group.activeSlimeId, 'bob');
  assert.deepEqual(bodies.bob.position.toArray(), [-2, 0.46, 10]);
  assert.deepEqual(bodies.goop.position.toArray(), [0, 0.46, 10]);
  assert.deepEqual(bodies.volt.position.toArray(), [2, 0.46, 10]);
  assert.equal(bodies.bob.recoveries, 2);
  assert.equal(bodies.goop.recoveries, 2);
  assert.equal(bodies.volt.recoveries, 2);
});

test('all CP1-CP9 identifiers are structurally registerable and unsafe restores are rejected before movement', () => {
  const { bodies, group, specimen } = makeGroup();
  let safe = true;
  const manager = new BlackoutCheckpointManager<TestBody>(
    checkpoint('cp1'),
    () => safe,
  );
  for (let index = 1; index < BLACKOUT_CHECKPOINT_IDS.length; index += 1) {
    manager.registerCheckpoint(checkpoint(BLACKOUT_CHECKPOINT_IDS[index]!, index * 5));
  }
  manager.activate('cp9');
  const before = bodies.bob.position.clone();
  safe = false;
  assert.throws(() => manager.recover(group, specimen), /unsafe restored Specimen spawn/);
  assert.deepEqual(bodies.bob.position, before);
});

test('merged checkpoint recovery validates and moves only Specimen while preserving original body identity', () => {
  const { bodies, group, specimen } = makeGroup();
  const manager = new BlackoutCheckpointManager<TestBody>(
    checkpoint('cp1'),
    () => true,
  );
  manager.registerCheckpoint(checkpoint('cp8', 65));
  manager.activate('cp8');

  const bobBefore = bodies.bob.position.clone();
  const goopBefore = bodies.goop.position.clone();
  const voltBefore = bodies.volt.position.clone();

  const snapshot = manager.recover(group, specimen);

  assert.equal(snapshot.controlledForm, 'specimen');
  assert.deepEqual(snapshot.specimenPosition, [0, 0.685, 65]);
  assert.deepEqual(specimen.position.toArray(), [0, 0.685, 65]);
  assert.deepEqual(bodies.bob.position, bobBefore);
  assert.deepEqual(bodies.goop.position, goopBefore);
  assert.deepEqual(bodies.volt.position, voltBefore);
  assert.equal(specimen.recoveries, 1);
});

test('Blackout phase hooks reject illegal transitions and completion is terminal', () => {
  const phase = new BlackoutPhaseController();
  assert.equal(phase.transition('boss'), false);
  for (const next of [
    'merging',
    'specimen',
    'boss',
    'boss-defeated',
    'splitting',
    'escape',
    'complete',
  ] as const) {
    assert.equal(phase.transition(next), true);
  }
  assert.equal(phase.terminal, true);
  assert.equal(phase.transition('escape'), false);
  assert.equal(phase.phase, 'complete');
});


test('full restart restores participant state captured at Level 3 entry, not later mutations', () => {
  const { group, specimen } = makeGroup();
  const manager = new BlackoutCheckpointManager<TestBody>(checkpoint(), () => true);
  let deviceState: SerializableValue = { powered: false, doorOpen: false };
  manager.registerParticipant({
    id: 'device',
    capture: () => deviceState,
    restore: (state) => {
      deviceState = state;
    },
  });

  deviceState = { powered: true, doorOpen: true };
  manager.registerCheckpoint(checkpoint('cp2', 10));
  manager.activate('cp2');
  deviceState = { powered: false, doorOpen: true };

  manager.resetToInitial();
  manager.recover(group, specimen);

  assert.deepEqual(deviceState, { powered: false, doorOpen: false });
  assert.equal(manager.activeCheckpoint.checkpointId, 'cp1');
});


test('Level 3 progression requires the rescued three-slime roster and preserves any active member', () => {
  assert.throws(
    () => validateLevelThreeProgressionSnapshot({
      unlockedSlimeIds: ['bob', 'goop'],
      activeSlimeId: 'goop',
    }),
    /requires volt to be unlocked/,
  );

  assert.doesNotThrow(() => validateLevelThreeProgressionSnapshot({
    unlockedSlimeIds: ['bob', 'goop', 'volt'],
    activeSlimeId: 'volt',
  }));
});


test('full restart preserves the active identity handed off at Level 3 entry', () => {
  const { group, specimen } = makeGroup();
  const manager = new BlackoutCheckpointManager<TestBody>(
    checkpoint(),
    () => true,
    'goop',
  );

  group.activate('bob');
  manager.activate('cp1', 'bob');
  manager.resetToInitial();
  manager.recover(group, specimen);

  assert.equal(group.activeSlimeId, 'goop');
});
