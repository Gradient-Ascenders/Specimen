import * as THREE from 'three';

import {
  createAuthoredDissolveTarget,
} from '../abilities/DissolveTarget.ts';
import { DissolveSystem } from '../abilities/DissolveSystem.ts';
import { CollisionWorld } from '../physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Dependency-free burn/reset regression that never mutates the live target. */
export function runDissolveRegression(): string {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
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

  const system = new DissolveSystem([target]);
  let completedEvents = 0;
  const unsubscribeCompleted = target.events.on('completed', () => {
    completedEvents += 1;
  });
  const nonSolubleMeshes: THREE.Mesh[] = [];

  try {
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

    assert(system.startBurn(target) === 'started', 'Burn was not accepted.');
    system.update(0.4);
    assert(
      Math.abs(target.progress - 0.2) < 1e-9,
      'Partial dissolve progress was not deterministic.',
    );
    assert(target.collisionEnabled, 'Collision disabled before threshold.');

    assert(
      system.startBurn(target) === 'already-burning',
      'Repeated hit created another burn.',
    );
    system.update(0.4);
    assert(
      Math.abs(target.progress - 0.4) < 1e-9,
      'Repeated hit accelerated dissolve progress.',
    );

    system.update(0.6);
    assert(
      target.progress >= target.collisionDisableProgress,
      'Threshold was not crossed.',
    );
    assert(
      !target.collisionEnabled && world.colliderCount === 0,
      'Collision remained registered after threshold.',
    );

    system.update(0.6);
    assert(target.completed, 'Dissolve did not reach completed state.');
    assert(target.progress === 1, 'Completed dissolve was not clamped to 1.');
    assert(!target.mesh.visible, 'Completed target remained visible.');
    assert(completedEvents === 1, 'Completion event did not fire exactly once.');

    const originalMesh = target.mesh;
    system.reset();
    target.reset();
    assert(target.mesh === originalMesh, 'Reset replaced the authored mesh.');
    assert(target.progress === 0, 'Reset did not clear dissolve progress.');
    assert(!target.completed, 'Reset left target completed.');
    assert(target.mesh.visible, 'Reset did not restore visibility.');
    assert(target.collisionEnabled, 'Reset did not restore collision.');
    assert(world.colliderCount === 1, 'Reset did not re-register collision.');

    for (let cycle = 0; cycle < 5; cycle += 1) {
      assert(
        system.startBurn(target) === 'started',
        `Repeated burn failed to start on cycle ${cycle + 1}.`,
      );
      system.update(2);
      assert(
        target.completed && !target.collisionEnabled,
        `Repeated dissolve failed on cycle ${cycle + 1}.`,
      );
      system.reset();
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
      'partial/non-stacking/complete burn',
      '4 non-soluble surface classes rejected',
      'collision threshold synchronized',
      '5 repeated reset cycles',
    ].join(' — ');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `FAIL — ${message}`;
  } finally {
    unsubscribeCompleted();
    system.dispose();
    target.dispose();

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
