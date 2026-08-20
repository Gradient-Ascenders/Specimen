import * as THREE from 'three';

import {
  createAuthoredDissolveTarget,
} from '../abilities/DissolveTarget.ts';
import { DissolveSystem } from '../abilities/DissolveSystem.ts';
import { CollisionWorld } from '../physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import { SlimeManager } from '../slimes/SlimeManager.ts';

class FakeDissolveBody {
  readonly radiusMetres = 0.45;
  readonly position = new THREE.Vector3();

  constructor(position: THREE.Vector3) {
    this.position.copy(position);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Dependency-free #30 regression that never mutates the live scene target. */
export function runDissolveRegression(): string {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const manager = new SlimeManager<FakeDissolveBody>();

  const bob = new FakeDissolveBody(new THREE.Vector3(0, 0, 0.66));
  const goop = new FakeDissolveBody(new THREE.Vector3(0, 0, 0.66));
  manager.registerBody('bob', bob);
  manager.unlock('goop');
  manager.registerBody('goop', goop);

  const geometry = new THREE.BoxGeometry(2, 2, 0.4);
  const material = new THREE.MeshStandardMaterial();
  const solubleMesh = new THREE.Mesh(geometry, material);
  solubleMesh.name = 'dissolve-regression-soluble';
  solubleMesh.userData.surfaceTag = 'default';
  solubleMesh.userData.soluble = true;
  solubleMesh.userData.dissolveDurationSeconds = 2;
  solubleMesh.userData.dissolveCollisionDisableProgress = 0.7;

  world.register(solubleMesh);
  surfaces.register(solubleMesh);

  const target = createAuthoredDissolveTarget(
    solubleMesh,
    world,
    surfaces,
  );
  if (!target) {
    throw new Error('Marked soluble regression target was rejected.');
  }

  const system = new DissolveSystem(manager, [target]);
  let completedEvents = 0;
  const unsubscribeCompleted = target.events.on('completed', () => {
    completedEvents += 1;
  });

  const nonSolubleMeshes: THREE.Mesh[] = [];

  try {
    // Every existing non-soluble surface class must remain ineligible.
    for (const surfaceTag of [
      'default',
      'sticky',
      'nonStick',
      'bouncy',
    ] as const) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
      );
      mesh.name = `non-soluble-${surfaceTag}`;
      mesh.userData.surfaceTag = surfaceTag;
      nonSolubleMeshes.push(mesh);

      assert(
        createAuthoredDissolveTarget(mesh, world, surfaces) === undefined,
        `${surfaceTag} geometry became soluble without explicit metadata.`,
      );
    }

    // Bob can stand in the same contact range and hold E, but the #27 ability
    // gate must prevent any progress.
    manager.activate('bob');
    system.update(0.5, true);
    assert(target.progress === 0, 'Bob advanced dissolve progress.');

    // Goop may partially dissolve the marked target.
    manager.activate('goop');
    system.update(0.4, true);
    assert(
      Math.abs(target.progress - 0.2) < 1e-9,
      'Partial dissolve progress was not deterministic.',
    );
    assert(target.collisionEnabled, 'Collision disabled before threshold.');

    // Interrupted activation preserves partial progress without rebuilding.
    const interruptedProgress = target.progress;
    system.update(0.75, false);
    assert(
      target.progress === interruptedProgress,
      'Interrupted dissolve unexpectedly changed progress.',
    );

    // Continue below threshold.
    system.update(0.9, true);
    assert(
      target.progress < target.collisionDisableProgress,
      'Regression unexpectedly crossed threshold too early.',
    );
    assert(target.collisionEnabled, 'Collision desynchronised below threshold.');

    // Cross the authored threshold: collision must disappear on the same
    // authoritative progress transition.
    system.update(0.2, true);
    assert(
      target.progress >= target.collisionDisableProgress,
      'Threshold was not crossed.',
    );
    assert(
      !target.collisionEnabled && world.colliderCount === 0,
      'Collision remained registered after threshold.',
    );

    // Because activation was already established, the hold can continue to
    // completion even though the collider is now gone.
    system.update(1, true);
    assert(target.completed, 'Dissolve did not reach completed state.');
    assert(target.progress === 1, 'Completed dissolve was not clamped to 1.');
    assert(!target.mesh.visible, 'Completed target remained visible.');
    assert(completedEvents === 1, 'Completion event did not fire exactly once.');

    const originalMesh = target.mesh;

    // Reset restores the exact same mesh and collider without reloading.
    target.reset();
    assert(target.mesh === originalMesh, 'Reset replaced the authored mesh.');
    assert(target.progress === 0, 'Reset did not clear dissolve progress.');
    assert(!target.completed, 'Reset left target completed.');
    assert(target.mesh.visible, 'Reset did not restore visibility.');
    assert(target.collisionEnabled, 'Reset did not restore collision.');
    assert(world.colliderCount === 1, 'Reset did not re-register collision.');

    // Repeated complete/reset cycles remain reversible.
    for (let cycle = 0; cycle < 5; cycle += 1) {
      system.update(2, true);
      assert(
        target.completed && !target.collisionEnabled,
        `Repeated dissolve failed on cycle ${cycle + 1}.`,
      );
      target.reset();
      assert(
        target.progress === 0 &&
          target.collisionEnabled &&
          target.mesh.visible,
        `Repeated reset failed on cycle ${cycle + 1}.`,
      );
    }

    return [
      'PASS',
      'Bob rejected',
      'Goop partial/interrupted/complete',
      '4 non-soluble surface classes rejected',
      'collision threshold synchronized',
      '5 repeated reset cycles',
    ].join(' — ');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return `FAIL — ${message}`;
  } finally {
    unsubscribeCompleted();
    system.dispose();
    target.dispose();
    manager.dispose();

    geometry.dispose();
    material.dispose();
    for (const mesh of nonSolubleMeshes) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const item of materials) item.dispose();
    }
  }
}
