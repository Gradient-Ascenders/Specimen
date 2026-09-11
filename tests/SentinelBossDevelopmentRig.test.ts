import assert from 'node:assert/strict';
import test from 'node:test';

import { SentinelBossDevelopmentRig } from '../src/boss/SentinelBossDevelopmentRig.ts';
import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

test('Sentinel development rig owns bounded targets/colliders and disposes them without leaks', () => {
  const world = new CollisionWorld();
  const targets = new CombatTargetRegistry(world);
  const rig = new SentinelBossDevelopmentRig({
    collisionWorld: world,
    targetRegistry: targets,
  });

  assert.equal(targets.size, 5);
  assert.equal(world.colliderCount, 1);
  assert.equal(rig.droneSquad.poolCapacity, 16);

  rig.droneSquad.deploy(4);
  assert.equal(rig.droneSquad.activeCount, 4);
  assert.equal(world.colliderCount, 5);

  rig.reset();
  assert.equal(rig.controller.readModel.state, 'idle');
  assert.equal(rig.droneSquad.activeCount, 0);
  assert.equal(rig.droneSquad.liveProjectileCount, 0);
  assert.equal(world.colliderCount, 1);

  rig.dispose();
  assert.equal(targets.size, 0);
  assert.equal(world.colliderCount, 0);
  targets.dispose();
});

test('Sentinel development rig construction failure rolls back drones, weak point, colliders, and graphics ownership', () => {
  const world = new CollisionWorld();
  const targets = new CombatTargetRegistry(world);
  const originalRegister = targets.register.bind(targets);
  let registrationCount = 0;

  targets.register = ((target, options) => {
    registrationCount += 1;
    if (registrationCount === 5) {
      throw new Error('injected Sentinel weak-point registration failure');
    }
    return originalRegister(target, options);
  }) as typeof targets.register;

  assert.throws(
    () => new SentinelBossDevelopmentRig({
      collisionWorld: world,
      targetRegistry: targets,
    }),
    /injected Sentinel weak-point registration failure/,
  );

  assert.equal(targets.size, 0);
  assert.equal(world.colliderCount, 0);
  targets.dispose();
});

test('Sentinel reset repeatedly restores pristine health, closed weak point, and zero transients', () => {
  const world = new CollisionWorld();
  const targets = new CombatTargetRegistry(world);
  const rig = new SentinelBossDevelopmentRig({
    collisionWorld: world,
    targetRegistry: targets,
  });

  try {
    rig.droneSquad.deploy(4);
    rig.controller.start();
    rig.reset();
    rig.reset();
    rig.reset();

    assert.equal(rig.controller.readModel.state, 'idle');
    assert.equal(rig.controller.readModel.armourLayersRemaining, 3);
    assert.equal(rig.controller.readModel.currentArmourHealth, 3);
    assert.equal(rig.controller.readModel.coreHealth, 1);
    assert.equal(rig.controller.readModel.weakPointOpen, false);
    assert.equal(rig.controller.readModel.currentAttackId, null);
    assert.equal(rig.controller.readModel.defeated, false);
    assert.equal(rig.droneSquad.activeCount, 0);
    assert.equal(rig.droneSquad.liveProjectileCount, 0);
  } finally {
    rig.dispose();
    targets.dispose();
  }
});
