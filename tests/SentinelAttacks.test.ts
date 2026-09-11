import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import {
  SentinelDroneAttack,
  SentinelDroneSquad,
} from '../src/boss/attacks/SentinelDroneAttack.ts';
import {
  SentinelRotatingLaserAttack,
  SentinelSweepLaserAttack,
} from '../src/boss/attacks/SentinelLaserAttacks.ts';
import { SentinelShockwaveAttack } from '../src/boss/attacks/SentinelShockwaveAttack.ts';
import type { SentinelAttackContext } from '../src/boss/SentinelBossTypes.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

function contextAt(
  x: number,
  y: number,
  z: number,
  previous = new THREE.Vector3(x, y, z),
  onFailure: () => boolean = () => true,
): SentinelAttackContext {
  return {
    specimen: {
      position: { x, y, z },
      previousPosition: {
        x: previous.x,
        y: previous.y,
        z: previous.z,
      },
      radiusMetres: 0.675,
    },
    requestFailure: onFailure,
  };
}

test('sweep laser enforces telegraph, active, recovery, complete and disables collision outside active', () => {
  const attack = new SentinelSweepLaserAttack({
    id: 'test-sweep',
    start: new THREE.Vector3(-3, 0.675, 0),
    end: new THREE.Vector3(3, 0.675, 0),
    axisWorld: new THREE.Vector3(0, 1, 0),
    fromAngleRadians: 0,
    toAngleRadians: 0,
    durations: {
      telegraphSeconds: 0.1,
      activeSeconds: 0.2,
      recoverySeconds: 0.1,
    },
  });
  let failures = 0;
  const context = contextAt(0, 0.675, 0, undefined, () => {
    failures += 1;
    return true;
  });

  try {
    attack.start(context);
    assert.equal(attack.readModel.stage, 'telegraph');
    assert.equal(attack.hazard.enabled, false);

    attack.update(0.1, context);
    assert.equal(attack.readModel.stage, 'active');
    assert.equal(attack.hazard.enabled, true);
    assert.equal(failures, 0);

    attack.update(0.05, context);
    assert.equal(failures, 1);

    attack.update(0.15, context);
    assert.equal(attack.readModel.stage, 'recovery');
    assert.equal(attack.hazard.enabled, false);

    attack.update(0.1, context);
    assert.equal(attack.readModel.stage, 'complete');
    assert.equal(failures, 1);
  } finally {
    attack.dispose();
  }
});

test('timed laser cancellation from active stage is idempotent and removes lethal beam immediately', () => {
  const attack = new SentinelSweepLaserAttack({
    id: 'cancel-sweep',
    start: new THREE.Vector3(-3, 0.675, 0),
    end: new THREE.Vector3(3, 0.675, 0),
    axisWorld: new THREE.Vector3(0, 1, 0),
    fromAngleRadians: 0,
    toAngleRadians: 0,
    durations: {
      telegraphSeconds: 0.1,
      activeSeconds: 1,
      recoverySeconds: 0.1,
    },
  });
  const context = contextAt(8, 0.675, 0);

  try {
    attack.start(context);
    attack.update(0.1, context);
    assert.equal(attack.hazard.enabled, true);

    attack.cancel('death');
    attack.cancel('death');
    assert.equal(attack.readModel.stage, 'idle');
    assert.equal(attack.hazard.enabled, false);

    attack.start(context);
    assert.equal(attack.readModel.stage, 'telegraph');
    attack.reset();
    assert.equal(attack.readModel.stage, 'idle');
    assert.equal(attack.hazard.enabled, false);
  } finally {
    attack.dispose();
  }
});

test('rotating laser owns a bounded authored beam set and large deltas traverse all attack stages', () => {
  const attack = new SentinelRotatingLaserAttack({
    id: 'rotate',
    origin: new THREE.Vector3(0, 1, 0),
    beamLengthMetres: 8,
    beamCount: 3,
    rotationRadians: Math.PI,
    durations: {
      telegraphSeconds: 0.1,
      activeSeconds: 0.2,
      recoverySeconds: 0.1,
    },
  });
  const context = contextAt(20, 1, 20);

  try {
    assert.equal(attack.hazards.length, 3);
    attack.start(context);
    attack.update(0.4, context);
    assert.equal(attack.readModel.stage, 'complete');
    assert.equal(
      attack.hazards.every((hazard) => !hazard.enabled),
      true,
    );
  } finally {
    attack.dispose();
  }
});

test('shockwave hits a ground-level Specimen through swept radial expansion but a jump clears it', () => {
  const groundAttack = new SentinelShockwaveAttack({
    id: 'ground-wave',
    origin: new THREE.Vector3(0, 0, 0),
    maximumRadiusMetres: 10,
    durations: {
      telegraphSeconds: 0.1,
      activeSeconds: 1,
      recoverySeconds: 0.1,
    },
  });
  let groundFailures = 0;
  const ground = contextAt(5, 0.675, 0, undefined, () => {
    groundFailures += 1;
    return true;
  });

  try {
    groundAttack.start(ground);
    groundAttack.update(0.1, ground);
    groundAttack.update(0.6, ground);
    assert.equal(groundFailures, 1);
    assert.ok(groundAttack.shockwaveReadModel.radiusMetres >= 5);
  } finally {
    groundAttack.dispose();
  }

  const jumpAttack = new SentinelShockwaveAttack({
    id: 'jump-wave',
    origin: new THREE.Vector3(0, 0, 0),
    maximumRadiusMetres: 10,
    durations: {
      telegraphSeconds: 0.1,
      activeSeconds: 1,
      recoverySeconds: 0.1,
    },
  });
  let jumpFailures = 0;
  const airborne = contextAt(5, 2.2, 0, undefined, () => {
    jumpFailures += 1;
    return true;
  });

  try {
    jumpAttack.start(airborne);
    jumpAttack.update(0.1, airborne);
    jumpAttack.update(0.6, airborne);
    assert.equal(jumpFailures, 0);
  } finally {
    jumpAttack.dispose();
  }
});

test('shockwave reset during active clears radius and contact latch', () => {
  const attack = new SentinelShockwaveAttack({
    id: 'reset-wave',
    origin: new THREE.Vector3(0, 0, 0),
    maximumRadiusMetres: 10,
    durations: {
      telegraphSeconds: 0.1,
      activeSeconds: 1,
      recoverySeconds: 0.1,
    },
  });
  const context = contextAt(5, 0.675, 0);

  try {
    attack.start(context);
    attack.update(0.1, context);
    attack.update(0.4, context);
    assert.ok(attack.shockwaveReadModel.radiusMetres > 0);

    attack.reset();
    assert.equal(attack.readModel.stage, 'idle');
    assert.equal(attack.shockwaveReadModel.radiusMetres, 0);
    assert.equal(attack.shockwaveReadModel.previousRadiusMetres, 0);
  } finally {
    attack.dispose();
  }
});

test('drone waves preallocate four reusable drones, deploy 2/3/4, and destroyed drones stop participating', () => {
  const world = new CollisionWorld();
  const registry = new CombatTargetRegistry(world);
  const squad = new SentinelDroneSquad({
    collisionWorld: world,
    targetRegistry: registry,
    anchors: [
      new THREE.Vector3(-3, 3, 8),
      new THREE.Vector3(3, 3, 8),
      new THREE.Vector3(-3, 3, 10),
      new THREE.Vector3(3, 3, 10),
    ],
  });
  const context = contextAt(0, 0.675, 0);

  try {
    assert.equal(registry.size, 4);
    assert.equal(squad.poolCapacity, 16);

    for (const count of [2, 3, 4] as const) {
      const attack = new SentinelDroneAttack({
        id: `wave-${count}`,
        squad,
        deployCount: count,
        durations: {
          telegraphSeconds: 0.1,
          activeSeconds: 1,
          recoverySeconds: 0.1,
        },
      });
      attack.start(context);
      attack.update(0.1, context);
      assert.equal(squad.activeCount, count);
      assert.ok(squad.activeCount <= 4);

      const liveTargets = registry.registeredTargets
        .map((registration) => registration.target)
        .filter((target) => target.isCombatActive());
      assert.equal(liveTargets.length, count);
      for (const target of liveTargets) {
        const result = target.applyImpact({
          projectileId: 1,
          targetId: target.id,
          kind: 'direct',
          chargeAmount: 0.5,
          fullyCharged: false,
          damageUnits: 2,
          point: { x: 0, y: 0, z: 0 },
          direction: { x: 0, y: 0, z: 1 },
        });
        assert.equal(result.destroyed, true);
      }
      assert.equal(squad.activeCount, 0);

      attack.update(0.01, context);
      assert.equal(attack.readModel.stage, 'recovery');
      attack.update(0.1, context);
      assert.equal(attack.readModel.stage, 'complete');
      attack.dispose();
    }

    assert.equal(registry.size, 4);
  } finally {
    squad.dispose();
    registry.dispose();
    assert.equal(world.colliderCount, 0);
  }
});

test('drone hostile projectile pool stays bounded and clear/reset removes every transient', () => {
  const world = new CollisionWorld();
  const registry = new CombatTargetRegistry(world);
  const squad = new SentinelDroneSquad({
    collisionWorld: world,
    targetRegistry: registry,
    anchors: [
      new THREE.Vector3(-3, 3, 8),
      new THREE.Vector3(3, 3, 8),
      new THREE.Vector3(-3, 3, 10),
      new THREE.Vector3(3, 3, 10),
    ],
    fireIntervalSeconds: 0.05,
  });
  const target = contextAt(0, 0.675, -30).specimen;

  try {
    squad.deploy(4);
    for (let index = 0; index < 40; index += 1) {
      squad.update(0.05, target, () => false);
      assert.ok(squad.liveProjectileCount <= squad.poolCapacity);
    }
    assert.equal(squad.poolCapacity, 16);

    squad.clear();
    assert.equal(squad.activeCount, 0);
    assert.equal(squad.liveProjectileCount, 0);
    assert.equal(
      squad.projectileStates.every((state) => !state.active),
      true,
    );

    squad.reset();
    assert.equal(squad.activeCount, 0);
    assert.equal(squad.liveProjectileCount, 0);
  } finally {
    squad.dispose();
    registry.dispose();
  }
});
