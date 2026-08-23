import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { CultivationLevelController } from '../src/levels/CultivationLevelController.ts';
import { CULTIVATION_FOUNDATION_MANIFEST } from '../src/levels/CultivationFoundationManifest.ts';
import { SlimeManager } from '../src/slimes/SlimeManager.ts';
import { PersistentSlimePair } from '../src/slimes/PersistentSlimePair.ts';
import type { DeathRecoveryAction } from '../src/systems/DeathSequence.ts';

function createController() {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const manager = new SlimeManager<KinematicBody>();
  const start = CULTIVATION_FOUNDATION_MANIFEST.checkpoints[0];
  const bob = new KinematicBody({ world, surfaces, initialPosition: start.bobSpawnPosition });
  const goop = new KinematicBody({ world, surfaces, initialPosition: start.goopSpawnPosition });
  const pair = new PersistentSlimePair({
    manager, bobBody: bob, goopBody: goop,
    bobSpawnPosition: start.bobSpawnPosition,
    goopSpawnPosition: start.goopSpawnPosition,
  });
  let recovery: DeathRecoveryAction | undefined;
  let dyingSlimeId: string | undefined;
  const controller = new CultivationLevelController({
    pair,
    collisionWorld: world,
    initialActiveSlimeId: 'bob',
    requestDeath: (nextRecovery, nextDyingSlimeId) => {
      if (recovery) return false;
      recovery = nextRecovery;
      dyingSlimeId = nextDyingSlimeId;
      return true;
    },
    cancelTransients: () => {},
  });
  return {
    controller, pair, bob, goop,
    retry: () => {
      const action = recovery;
      recovery = undefined;
      action?.();
    },
    dyingSlimeId: () => dyingSlimeId,
  };
}

test('Goop may enter Room 2 early but Bob remains the Room 1 completion authority', () => {
  const fixture = createController();
  const roomTwo = CULTIVATION_FOUNDATION_MANIFEST.triggers[0].centre;

  fixture.goop.teleport(roomTwo);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-1');
  assert.equal(fixture.controller.readModel.goopEnteredRoomTwoEarly, true);

  fixture.bob.teleport(roomTwo);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-2');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-2-entry');
  fixture.controller.dispose();
});

test('Room 2 remains authoritative until both slimes reach their separate Room 3 exits', () => {
  const fixture = createController();
  const [roomTwo, bobExit, goopExit] = CULTIVATION_FOUNDATION_MANIFEST.triggers;
  fixture.bob.teleport(roomTwo.centre);
  fixture.controller.update();

  fixture.bob.teleport(bobExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, true);
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-2-entry');

  assert.equal(
    fixture.controller.requestRadiationFailure({ hazardId: 'test', targetId: 'goop' }),
    true,
  );
  fixture.retry();
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-2');
  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, false);
  assert.equal(fixture.controller.readModel.goopEnteredRoomThree, false);

  fixture.goop.teleport(goopExit.centre);
  fixture.controller.update();
  fixture.bob.teleport(bobExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-3');
  assert.equal(fixture.controller.readModel.state, 'playing');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-3-entry');
  fixture.controller.dispose();
});

test('Room 3 requires both slimes to occupy their own exits at the same time', () => {
  const fixture = createController();
  const [roomTwo, bobExit, goopExit] = CULTIVATION_FOUNDATION_MANIFEST.triggers;
  fixture.bob.teleport(roomTwo.centre);
  fixture.controller.update();

  fixture.bob.teleport(bobExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, true);

  fixture.bob.teleport(roomTwo.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, false);

  fixture.goop.teleport(goopExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.goopEnteredRoomThree, true);
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-2');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-2-entry');

  fixture.bob.teleport(bobExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-3');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-3-entry');
  fixture.controller.dispose();
});

test('Room 3 reconciles both exits before evaluating a same-step occupancy handoff', () => {
  const fixture = createController();
  const [roomTwo, bobExit, goopExit] = CULTIVATION_FOUNDATION_MANIFEST.triggers;
  fixture.bob.teleport(roomTwo.centre);
  fixture.controller.update();

  fixture.goop.teleport(goopExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.goopEnteredRoomThree, true);

  fixture.bob.teleport(bobExit.centre);
  fixture.goop.teleport(roomTwo.centre);
  fixture.controller.update();

  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, true);
  assert.equal(fixture.controller.readModel.goopEnteredRoomThree, false);
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-2');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-2-entry');

  fixture.goop.teleport(goopExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-3');
  fixture.controller.dispose();
});

test('Room 3 exits count only their authored slime identity', () => {
  const fixture = createController();
  const [roomTwo, bobExit, goopExit] = CULTIVATION_FOUNDATION_MANIFEST.triggers;
  fixture.bob.teleport(roomTwo.centre);
  fixture.controller.update();

  fixture.bob.teleport(goopExit.centre);
  fixture.goop.teleport(bobExit.centre);
  fixture.controller.update();

  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, false);
  assert.equal(fixture.controller.readModel.goopEnteredRoomThree, false);
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-2');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-2-entry');
  fixture.controller.dispose();
});

test('switching during split entry preserves occupancy and checkpoint identity', () => {
  const fixture = createController();
  const [roomTwo, bobExit, goopExit] = CULTIVATION_FOUNDATION_MANIFEST.triggers;
  fixture.bob.teleport(roomTwo.centre);
  fixture.controller.update();

  fixture.bob.teleport(bobExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, true);

  assert.equal(fixture.pair.switchActive(), true);
  fixture.controller.update();
  fixture.goop.teleport(goopExit.centre);
  fixture.controller.update();

  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-3');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-room-3-entry');
  assert.equal(fixture.pair.activeSlimeId, 'goop');

  assert.equal(
    fixture.controller.requestRadiationFailure({ hazardId: 'test', targetId: 'bob' }),
    true,
  );
  fixture.retry();
  assert.equal(fixture.pair.activeSlimeId, 'goop');
  assert.ok(fixture.bob.position.y > fixture.goop.position.y);
  fixture.controller.dispose();
});

test('restart during partial Room 3 entry clears flags and restores the entrance pair', () => {
  const fixture = createController();
  const [roomTwo, , goopExit] = CULTIVATION_FOUNDATION_MANIFEST.triggers;
  fixture.bob.teleport(roomTwo.centre);
  fixture.controller.update();
  fixture.goop.teleport(goopExit.centre);
  fixture.controller.update();
  assert.equal(fixture.controller.readModel.goopEnteredRoomThree, true);

  fixture.controller.reset('goop');
  const entrance = CULTIVATION_FOUNDATION_MANIFEST.checkpoints[0];
  assert.equal(fixture.controller.readModel.roomId, 'cultivation-room-1');
  assert.equal(fixture.controller.readModel.checkpointId, 'cultivation-entrance');
  assert.equal(fixture.controller.readModel.bobEnteredRoomThree, false);
  assert.equal(fixture.controller.readModel.goopEnteredRoomThree, false);
  assert.equal(fixture.pair.activeSlimeId, 'goop');
  assert.ok(fixture.bob.position.equals(entrance.bobSpawnPosition));
  assert.ok(fixture.goop.position.equals(entrance.goopSpawnPosition));
  fixture.controller.dispose();
});

test('inactive out-of-bounds bodies request one pair recovery for their own identity', () => {
  const fixture = createController();
  fixture.pair.switchActive();
  fixture.bob.teleport(new THREE.Vector3(0, -6, 0));
  fixture.controller.update();
  fixture.controller.update();

  assert.equal(fixture.dyingSlimeId(), 'bob');
  assert.equal(fixture.controller.readModel.state, 'recovering');
  fixture.retry();
  assert.ok(fixture.bob.position.y > 0);
  assert.ok(fixture.goop.position.y > 0);
  fixture.controller.dispose();
});
