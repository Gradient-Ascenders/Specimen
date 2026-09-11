import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CombatDroneTarget,
  FixtureCombatTarget,
} from '../src/combat/CombatTargetAdapters.ts';
import {
  CombatTargetRegistry,
  type CombatImpact,
} from '../src/combat/CombatTargetRegistry.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

function impact(
  overrides: Partial<CombatImpact> = {},
): CombatImpact {
  return {
    projectileId: 1,
    targetId: 'target',
    kind: 'direct',
    chargeAmount: 0,
    fullyCharged: false,
    damageUnits: 1,
    point: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: 1 },
    ...overrides,
  };
}

test('combat registry requires explicit unique targets and preserves registration identity', () => {
  const world = new CollisionWorld();
  const registry = new CombatTargetRegistry(world);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const target = new FixtureCombatTarget({
    id: 'fixture',
    hitMeshes: [mesh],
  });

  const unregister = registry.register(target, {
    registerCollision: true,
  });
  const registration = registry.getRegistrationForMesh(mesh);
  assert.ok(registration);
  assert.equal(registry.isRegistered(registration), true);
  assert.equal(registry.size, 1);
  assert.equal(world.colliderCount, 1);

  assert.throws(
    () => registry.register(new FixtureCombatTarget({
      id: 'fixture',
      hitMeshes: [new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))],
    })),
    /Duplicate combat target ID/,
  );

  unregister();
  assert.equal(registry.isRegistered(registration), false);
  assert.equal(registry.getRegistrationForMesh(mesh), undefined);
  assert.equal(world.colliderCount, 0);

  const replacement = new FixtureCombatTarget({
    id: 'fixture',
    hitMeshes: [mesh],
  });
  const unregisterReplacement = registry.register(replacement, {
    registerCollision: true,
  });
  const replacementRegistration = registry.getRegistrationForMesh(mesh);
  assert.ok(replacementRegistration);
  assert.notEqual(replacementRegistration, registration);
  assert.equal(registry.isRegistered(registration), false);

  unregisterReplacement();
  registry.dispose();
  mesh.geometry.dispose();
  const material = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const item of material) item.dispose();
});

test('ordinary, reinforced, and gated weak-point targets enforce explicit impact contracts', () => {
  const ordinaryMesh = new THREE.Mesh();
  const reinforcedMesh = new THREE.Mesh();
  const weakMesh = new THREE.Mesh();
  const ordinary = new FixtureCombatTarget({
    id: 'ordinary',
    hitMeshes: [ordinaryMesh],
    healthUnits: 3,
  });
  const reinforced = new FixtureCombatTarget({
    id: 'reinforced',
    hitMeshes: [reinforcedMesh],
    kind: 'reinforced',
    healthUnits: 3,
  });
  const weak = new FixtureCombatTarget({
    id: 'weak',
    hitMeshes: [weakMesh],
    kind: 'weak-point',
    healthUnits: 2,
    weakPointInitiallyOpen: false,
  });

  assert.equal(
    ordinary.applyImpact(impact({
      targetId: 'ordinary',
      kind: 'splash',
      damageUnits: 1,
    })).accepted,
    true,
  );
  assert.equal(ordinary.healthUnits, 2);

  assert.deepEqual(
    reinforced.applyImpact(impact({
      targetId: 'reinforced',
      kind: 'direct',
      fullyCharged: false,
      damageUnits: 3,
    })),
    {
      accepted: false,
      destroyed: false,
      rejectionReason: 'armour',
    },
  );
  assert.equal(
    reinforced.applyImpact(impact({
      targetId: 'reinforced',
      kind: 'splash',
      fullyCharged: true,
      damageUnits: 3,
    })).accepted,
    false,
  );
  assert.equal(
    reinforced.applyImpact(impact({
      targetId: 'reinforced',
      kind: 'direct',
      fullyCharged: true,
      chargeAmount: 1,
      damageUnits: 3,
    })).destroyed,
    true,
  );

  assert.equal(
    weak.applyImpact(impact({
      targetId: 'weak',
      fullyCharged: true,
      damageUnits: 2,
    })).rejectionReason,
    'weak-point-closed',
  );
  weak.setWeakPointOpen(true);
  assert.equal(
    weak.applyImpact(impact({
      targetId: 'weak',
      kind: 'splash',
      fullyCharged: true,
      damageUnits: 2,
    })).rejectionReason,
    'splash-not-allowed',
  );
  assert.equal(
    weak.applyImpact(impact({
      targetId: 'weak',
      kind: 'direct',
      fullyCharged: false,
      damageUnits: 2,
    })).destroyed,
    true,
  );
});

test('fixture snapshots restore health, gates, and destruction deterministically', () => {
  let destroyed = 0;
  let reset = 0;
  const mesh = new THREE.Mesh();
  const target = new FixtureCombatTarget({
    id: 'snapshot-target',
    hitMeshes: [mesh],
    healthUnits: 4,
    weakPointInitiallyOpen: false,
    onDestroyed: () => {
      destroyed += 1;
    },
    onReset: () => {
      reset += 1;
    },
  });

  target.applyImpact(impact({
    targetId: target.id,
    damageUnits: 1.5,
  }));
  target.setWeakPointOpen(true);
  target.setEnabled(false);
  const snapshot = target.captureState();

  target.reset();
  assert.equal(target.healthUnits, 4);
  assert.equal(target.enabled, true);
  assert.equal(target.weakPointOpen, false);

  target.restoreState(snapshot);
  assert.equal(target.healthUnits, 2.5);
  assert.equal(target.enabled, false);
  assert.equal(target.weakPointOpen, true);
  assert.equal(target.destroyed, false);
  assert.equal(reset, 2);

  target.setEnabled(true);
  target.applyImpact(impact({
    targetId: target.id,
    damageUnits: 4,
  }));
  assert.equal(target.destroyed, true);
  assert.equal(destroyed, 1);
});

test('combat drone adapter disables owner atomically and reset restores without reconstruction', () => {
  const mesh = new THREE.Mesh();
  const calls: string[] = [];
  const target = new CombatDroneTarget({
    id: 'drone',
    hitMeshes: [mesh],
    healthUnits: 2,
    owner: {
      setEnabled: (enabled) => calls.push(`enabled:${enabled}`),
      setCollisionEnabled: (enabled) =>
        calls.push(`collision:${enabled}`),
      setVisible: (visible) => calls.push(`visible:${visible}`),
      clearOwnedProjectiles: () => calls.push('clear'),
    },
  });

  target.applyImpact(impact({
    targetId: 'drone',
    damageUnits: 2,
  }));
  assert.equal(target.destroyed, true);
  assert.deepEqual(calls, [
    'clear',
    'enabled:false',
    'collision:false',
    'visible:false',
  ]);

  calls.length = 0;
  target.reset();
  assert.equal(target.destroyed, false);
  assert.deepEqual(calls, [
    'clear',
    'visible:true',
    'collision:true',
    'enabled:true',
  ]);
});
