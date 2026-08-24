import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { CULTIVATION_FOUNDATION_MANIFEST } from '../src/levels/CultivationFoundationManifest.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import {
  DropToAcidAssembly,
  RopeCatchAssembly,
  type SuspendedStructureAssembly,
} from '../src/puzzle/SuspendedStructureAssembly.ts';

interface AssemblyFixture {
  readonly target: DissolveTarget;
  readonly targetMesh: THREE.Mesh;
  readonly world: CollisionWorld;
  readonly surfaces: SurfaceRegistry;
  createDrop(options?: { readonly delay?: number; readonly duration?: number }): DropToAcidAssembly;
  createCatch(options?: { readonly delay?: number; readonly duration?: number }): RopeCatchAssembly;
  dispose(assembly?: SuspendedStructureAssembly): void;
}

function createFixture(id = 'test-assembly'): AssemblyFixture {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const targetMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshStandardMaterial(),
  );
  targetMesh.name = `${id}-support`;
  targetMesh.userData.surfaceTag = 'default';
  targetMesh.userData.assemblyId = id;
  targetMesh.userData.supportRole = 'soluble-rope';
  world.register(targetMesh);
  surfaces.register(targetMesh);
  const target = new DissolveTarget({
    id: targetMesh.name,
    mesh: targetMesh,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    dissolveDurationSeconds: 1,
    collisionDisableProgress: 0.72,
  });
  const common = (
    supportRole: 'soluble-rope' | 'soluble-brace',
    delay = 0.1,
    duration = 1,
  ) => ({
    id,
    supportTargetId: target.id,
    supportRole,
    supportTarget: target,
    collisionWorld: world,
    surfaceRegistry: surfaces,
    initialPosition: new THREE.Vector3(0, 6, 0),
    finalPosition: new THREE.Vector3(2, 1, 3),
    size: new THREE.Vector3(2.8, 0.5, 2.8),
    releaseDelaySeconds: delay,
    travelDurationSeconds: duration,
  });

  return {
    target,
    targetMesh,
    world,
    surfaces,
    createDrop: (options = {}) =>
      new DropToAcidAssembly(common('soluble-rope', options.delay, options.duration)),
    createCatch: (options = {}) =>
      new RopeCatchAssembly({
        ...common('soluble-brace', options.delay, options.duration),
        settlingDurationSeconds: 0.4,
        settlingSwingRadians: 0.08,
      }),
    dispose: (assembly) => {
      assembly?.dispose();
      target.dispose();
      targetMesh.geometry.dispose();
      const materials = Array.isArray(targetMesh.material)
        ? targetMesh.material
        : [targetMesh.material];
      for (const material of materials) material.dispose();
      world.clear();
      surfaces.clear();
    },
  };
}

function completeTarget(target: DissolveTarget): void {
  if (target.completed) return;
  target.advance((1 - target.progress) * target.dissolveDurationSeconds);
}

test('drop-to-acid releases only on completion and lands exactly once', () => {
  const fixture = createFixture();
  const assembly = fixture.createDrop();
  const events: string[] = [];
  assembly.events.on('released', () => events.push('released'));
  assembly.events.on('landed', () => events.push('landed'));

  fixture.target.advance(0.5);
  assembly.update(0);
  assert.equal(assembly.state, 'dissolving');
  assert.equal(assembly.travelProgress, 0);
  assert.ok(assembly.root.position.equals(new THREE.Vector3(0, 6, 0)));

  completeTarget(fixture.target);
  completeTarget(fixture.target);
  assert.equal(assembly.state, 'released');
  assert.deepEqual(events, ['released']);

  assembly.update(0.1);
  assert.equal(assembly.state, 'falling');
  assembly.update(1);
  assert.equal(assembly.state, 'landed');
  assert.ok(assembly.root.position.equals(new THREE.Vector3(2, 1, 3)));
  assert.equal(assembly.travelProgress, 1);
  assert.equal(assembly.collisionEnabled, true);
  assert.deepEqual(events, ['released', 'landed']);

  assembly.update(5);
  assert.deepEqual(events, ['released', 'landed']);
  fixture.dispose(assembly);
});

test('rope-catch exposes the taut boundary, settles, and ends at the exact pose', () => {
  const fixture = createFixture('rope-catch');
  fixture.targetMesh.userData.supportRole = 'soluble-brace';
  const assembly = fixture.createCatch();
  const events: string[] = [];
  assembly.events.on('released', () => events.push('released'));
  assembly.events.on('ropeTaut', () => events.push('taut'));
  assembly.events.on('settled', () => events.push('settled'));

  fixture.target.advance(0.25);
  assembly.update(0);
  assert.equal(assembly.state, 'braceDissolving');

  completeTarget(fixture.target);
  assembly.update(1.1);
  assert.equal(assembly.state, 'ropeTaut');
  assert.ok(assembly.root.position.equals(new THREE.Vector3(2, 1, 3)));
  assert.deepEqual(events, ['released', 'taut']);

  assembly.update(0.05);
  assert.equal(assembly.state, 'settling');
  assert.ok(Math.abs(assembly.root.rotation.z) > 0);
  assembly.update(0.35);
  assert.equal(assembly.state, 'stable');
  assert.ok(assembly.root.position.equals(new THREE.Vector3(2, 1, 3)));
  assert.ok(assembly.root.quaternion.equals(new THREE.Quaternion()));
  assert.deepEqual(events, ['released', 'taut', 'settled']);
  fixture.dispose(assembly);
});

test('reset from every drop state restores target, pose, collision, progress, and latches', () => {
  const reachStates: readonly ((fixture: AssemblyFixture, assembly: DropToAcidAssembly) => void)[] = [
    (fixture, assembly) => {
      fixture.target.advance(0.3);
      assembly.update(0);
    },
    (fixture) => completeTarget(fixture.target),
    (fixture, assembly) => {
      completeTarget(fixture.target);
      assembly.update(0.6);
    },
    (fixture, assembly) => {
      completeTarget(fixture.target);
      assembly.update(2);
    },
  ];

  for (const [index, reachState] of reachStates.entries()) {
    const fixture = createFixture(`drop-reset-${index}`);
    const assembly = fixture.createDrop();
    reachState(fixture, assembly);
    fixture.target.reset();
    assembly.reset();
    assert.equal(fixture.target.progress, 0);
    assert.equal(fixture.target.completed, false);
    assert.equal(assembly.state, 'suspended');
    assert.equal(assembly.travelProgress, 0);
    assert.equal(assembly.displacement.lengthSq(), 0);
    assert.ok(assembly.root.position.equals(new THREE.Vector3(0, 6, 0)));
    assert.equal(assembly.collisionEnabled, true);

    completeTarget(fixture.target);
    assert.equal(assembly.state, 'released');
    fixture.dispose(assembly);
  }
});

test('reset at rope-taut and settling boundaries rearms a retained-rope assembly', () => {
  for (const settleSeconds of [0, 0.2] as const) {
    const fixture = createFixture(`catch-reset-${settleSeconds}`);
    fixture.targetMesh.userData.supportRole = 'soluble-brace';
    const assembly = fixture.createCatch();
    completeTarget(fixture.target);
    assembly.update(1.1);
    if (settleSeconds > 0) assembly.update(settleSeconds);

    fixture.target.reset();
    assembly.reset();
    assert.equal(assembly.state, 'suspended');
    assert.ok(assembly.root.position.equals(new THREE.Vector3(0, 6, 0)));
    assert.ok(assembly.root.quaternion.equals(new THREE.Quaternion()));
    assert.equal(assembly.travelProgress, 0);
    assert.equal(assembly.collisionEnabled, true);
    completeTarget(fixture.target);
    assert.equal(assembly.state, 'released');
    fixture.dispose(assembly);
  }
});

test('reset from every retained-rope state restores the exact authored state', () => {
  const reachStates: readonly ((fixture: AssemblyFixture, assembly: RopeCatchAssembly) => void)[] = [
    (fixture, assembly) => {
      fixture.target.advance(0.3);
      assembly.update(0);
    },
    (fixture) => completeTarget(fixture.target),
    (fixture, assembly) => {
      completeTarget(fixture.target);
      assembly.update(0.6);
    },
    (fixture, assembly) => {
      completeTarget(fixture.target);
      assembly.update(1.1);
    },
    (fixture, assembly) => {
      completeTarget(fixture.target);
      assembly.update(1.1);
      assembly.update(0.05);
    },
    (fixture, assembly) => {
      completeTarget(fixture.target);
      assembly.update(1.1);
      assembly.update(0.4);
    },
  ];

  for (const [index, reachState] of reachStates.entries()) {
    const fixture = createFixture(`catch-all-reset-${index}`);
    fixture.targetMesh.userData.supportRole = 'soluble-brace';
    const assembly = fixture.createCatch();
    reachState(fixture, assembly);
    fixture.target.reset();
    assembly.reset();
    assert.equal(assembly.state, 'suspended');
    assert.equal(assembly.travelProgress, 0);
    assert.equal(assembly.displacement.lengthSq(), 0);
    assert.ok(assembly.root.position.equals(new THREE.Vector3(0, 6, 0)));
    assert.ok(assembly.root.quaternion.equals(new THREE.Quaternion()));
    assert.equal(assembly.collisionEnabled, true);
    completeTarget(fixture.target);
    assert.equal(assembly.state, 'released');
    fixture.dispose(assembly);
  }
});

test('fixed-step chunking and independent completion order produce exact endpoints', () => {
  const ids = ['ordered-a', 'ordered-b', 'ordered-c'] as const;
  const fixtures = ids.map((id) => createFixture(id));
  const assemblies = fixtures.map((fixture) => fixture.createDrop({ delay: 0, duration: 1 }));
  const completionOrder = [2, 0, 1] as const;

  for (const index of completionOrder) completeTarget(fixtures[index]!.target);
  for (let step = 0; step < 60; step += 1) {
    for (const assembly of assemblies) assembly.update(1 / 60);
  }
  for (const assembly of assemblies) {
    assert.equal(assembly.state, 'landed');
    assert.ok(assembly.root.position.equals(new THREE.Vector3(2, 1, 3)));
  }

  const largeStepFixture = createFixture('large-step');
  const largeStepAssembly = largeStepFixture.createDrop({ delay: 0, duration: 1 });
  completeTarget(largeStepFixture.target);
  largeStepAssembly.update(1);
  assert.ok(largeStepAssembly.root.position.equals(assemblies[0]!.root.position));

  fixtures.forEach((fixture, index) => fixture.dispose(assemblies[index]));
  largeStepFixture.dispose(largeStepAssembly);
});

test('every three-support completion order remains independent for both assembly modes', () => {
  const orders = permutations([0, 1, 2]);

  for (const mode of ['drop', 'catch'] as const) {
    for (const [orderIndex, order] of orders.entries()) {
      const fixtures = [0, 1, 2].map((index) =>
        createFixture(`${mode}-order-${orderIndex}-${index}`),
      );
      if (mode === 'catch') {
        for (const fixture of fixtures) {
          fixture.targetMesh.userData.supportRole = 'soluble-brace';
        }
      }
      const assemblies = fixtures.map((fixture) =>
        mode === 'drop'
          ? fixture.createDrop({ delay: 0, duration: 0.5 })
          : fixture.createCatch({ delay: 0, duration: 0.5 }),
      );
      const released = new Set<number>();

      for (const completedIndex of order) {
        completeTarget(fixtures[completedIndex]!.target);
        released.add(completedIndex);
        for (const [index, assembly] of assemblies.entries()) {
          assert.equal(
            assembly.state === 'released',
            released.has(index),
            `${mode} order ${order.join(',')} released the wrong assembly`,
          );
        }
      }

      for (let step = 0; step < 120; step += 1) {
        for (const assembly of assemblies) assembly.update(1 / 60);
      }
      for (const assembly of assemblies) {
        assert.equal(assembly.state, mode === 'drop' ? 'landed' : 'stable');
        assert.ok(assembly.root.position.equals(new THREE.Vector3(2, 1, 3)));
      }

      fixtures.forEach((fixture, index) => fixture.dispose(assemblies[index]));
    }
  }
});

test('every authored final platform and block provides an ordinary walkable collider', () => {
  for (const authoring of CULTIVATION_FOUNDATION_MANIFEST.structuralAssemblies) {
    const world = new CollisionWorld();
    const surfaces = new SurfaceRegistry();
    const targetMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        authoring.supportSize.x,
        authoring.supportSize.y,
        authoring.supportSize.z,
      ),
      new THREE.MeshStandardMaterial(),
    );
    targetMesh.name = authoring.supportTargetId;
    targetMesh.position.copy(authoring.supportPosition);
    targetMesh.userData.surfaceTag = 'default';
    targetMesh.userData.assemblyId = authoring.id;
    targetMesh.userData.supportRole = authoring.supportRole;
    world.register(targetMesh);
    surfaces.register(targetMesh);
    const target = new DissolveTarget({
      id: authoring.supportTargetId,
      mesh: targetMesh,
      collisionWorld: world,
      surfaceRegistry: surfaces,
      dissolveDurationSeconds: 1,
      collisionDisableProgress: 0.72,
    });
    const common = {
      id: authoring.id,
      supportTargetId: authoring.supportTargetId,
      supportRole: authoring.supportRole,
      supportTarget: target,
      collisionWorld: world,
      surfaceRegistry: surfaces,
      initialPosition: authoring.initialPosition,
      finalPosition: authoring.finalPosition,
      size: authoring.movingSize,
      releaseDelaySeconds: authoring.releaseDelaySeconds,
      travelDurationSeconds: authoring.travelDurationSeconds,
      finalSurfaceTag: authoring.finalSurfaceTag,
    };
    const assembly = authoring.mode === 'drop-to-acid'
      ? new DropToAcidAssembly(common)
      : new RopeCatchAssembly({
          ...common,
          settlingDurationSeconds: authoring.settlingDurationSeconds,
          settlingSwingRadians: authoring.settlingSwingRadians,
        });

    completeTarget(target);
    for (let step = 0; step < 180; step += 1) assembly.update(1 / 60);
    assert.equal(
      assembly.state,
      authoring.mode === 'drop-to-acid' ? 'landed' : 'stable',
    );
    assert.ok(assembly.root.position.equals(authoring.finalPosition));

    const body = new KinematicBody({
      world,
      surfaces,
      initialPosition: new THREE.Vector3(
        authoring.finalPosition.x,
        authoring.finalPosition.y + authoring.movingSize.y / 2 + 0.46,
        authoring.finalPosition.z,
      ),
    });
    body.update(1 / 60, new THREE.Vector3());
    assert.equal(body.grounded, true, `${authoring.id} should support a body`);
    assert.equal(body.isSupportedBy(assembly.collisionMesh), true);
    assert.equal(surfaces.get(assembly.collisionMesh).tag, authoring.finalSurfaceTag);

    assembly.dispose();
    target.dispose();
    targetMesh.geometry.dispose();
    const materials = Array.isArray(targetMesh.material)
      ? targetMesh.material
      : [targetMesh.material];
    for (const material of materials) material.dispose();
    world.clear();
    surfaces.clear();
  }
});

test('invalid updates and support-role associations fail without changing state', () => {
  const dropFixture = createFixture('invalid-drop');
  const drop = dropFixture.createDrop();
  assert.throws(() => drop.update(-1), /non-negative and finite/);
  assert.throws(() => drop.update(Number.NaN), /non-negative and finite/);
  assert.equal(drop.state, 'suspended');
  dropFixture.dispose(drop);

  const catchFixture = createFixture('invalid-catch');
  assert.throws(() => catchFixture.createCatch(), /metadata does not match/);
  assert.equal(catchFixture.world.colliderCount, 1);
  catchFixture.dispose();
});

test('explicit support association rejects duplicate subscriptions and disposal removes collision', () => {
  const fixture = createFixture('unique-support');
  const assembly = fixture.createDrop();
  const initialColliderCount = fixture.world.colliderCount;
  assert.throws(() => fixture.createDrop(), /already associated/);

  assembly.dispose();
  assert.equal(fixture.world.colliderCount, initialColliderCount - 1);
  completeTarget(fixture.target);
  assert.equal(assembly.state, 'suspended');

  fixture.target.reset();
  const replacement = fixture.createDrop();
  assert.equal(fixture.world.colliderCount, initialColliderCount);
  fixture.dispose(replacement);
});

test('landing collider updates before body movement and does not inject assembly velocity', () => {
  const fixture = createFixture('landing-order');
  const assembly = fixture.createDrop({ delay: 0, duration: 1 });
  const body = new KinematicBody({
    world: fixture.world,
    surfaces: fixture.surfaces,
    initialPosition: new THREE.Vector3(2, 1.71, 3),
  });

  completeTarget(fixture.target);
  assembly.update(1);
  body.update(1 / 60, new THREE.Vector3());

  assert.equal(assembly.state, 'landed');
  assert.equal(body.grounded, true);
  assert.equal(body.isSupportedBy(assembly.collisionMesh), true);
  assert.ok(Math.abs(body.velocity.y) < 1e-10);
  fixture.dispose(assembly);
});

test('repeated create, reset, and dispose cycles keep listener and collider counts stable', () => {
  const fixture = createFixture('lifecycle-cycles');
  const targetOnlyColliderCount = fixture.world.colliderCount;

  for (let cycle = 0; cycle < 10; cycle += 1) {
    const assembly = fixture.createDrop();
    assert.equal(fixture.world.colliderCount, targetOnlyColliderCount + 1);
    completeTarget(fixture.target);
    assembly.update(2);
    fixture.target.reset();
    assembly.reset();
    assembly.dispose();
    assert.equal(fixture.world.colliderCount, targetOnlyColliderCount);
  }

  fixture.dispose();
});

function permutations(values: readonly number[]): number[][] {
  if (values.length <= 1) return [[...values]];
  const result: number[][] = [];
  for (const [index, value] of values.entries()) {
    const remaining = values.filter((_, candidateIndex) => candidateIndex !== index);
    for (const suffix of permutations(remaining)) result.push([value, ...suffix]);
  }
  return result;
}
