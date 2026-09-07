import { performance } from 'node:perf_hooks';

import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import {
  ColliderTransformMode,
  CollisionHit,
  CollisionLayer,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';

interface BenchmarkScene {
  readonly name: string;
  readonly collisionMeshes: readonly THREE.Mesh[];
  readonly dynamicCollisionMeshes: readonly THREE.Mesh[];
  readonly cameraObstructionMeshes?: readonly THREE.Mesh[];
  readonly root: THREE.Object3D;
  dispose(): void;
}

interface SweepCase {
  readonly origin: THREE.Vector3;
  readonly displacement: THREE.Vector3;
  readonly radius: number;
  readonly queryMask: number;
}

const createSweepCases = (
  meshes: readonly THREE.Mesh[],
): readonly SweepCase[] => {
  const bounds = new THREE.Box3();
  const centre = new THREE.Vector3();
  const size = new THREE.Vector3();

  return meshes.map((mesh, index) => {
    bounds.copy(mesh.geometry.boundingBox ?? new THREE.Box3());
    if (bounds.isEmpty()) {
      mesh.geometry.computeBoundingBox();
      bounds.copy(mesh.geometry.boundingBox ?? new THREE.Box3());
    }
    bounds.applyMatrix4(mesh.matrixWorld);
    bounds.getCenter(centre);
    bounds.getSize(size);

    const axis = index % 3;
    const direction = new THREE.Vector3();
    direction.setComponent(axis, 1);
    const crossingDistance = size.getComponent(axis) + 2;
    const origin = centre
      .clone()
      .addScaledVector(direction, -crossingDistance * 0.5);

    return {
      origin,
      displacement: direction.multiplyScalar(crossingDistance),
      radius: index % 5 === 0 ? 0.22 : 0.45,
      queryMask:
        index % 11 === 0
          ? CollisionLayer.CameraObstruction
          : index % 7 === 0
            ? CollisionLayer.Projectile
            : CollisionLayer.Movement,
    };
  });
};

const runSceneBenchmark = (
  scene: BenchmarkScene,
  broadphaseEnabled: boolean,
): void => {
  scene.root.updateWorldMatrix(true, true);
  const world = new CollisionWorld({ broadphaseEnabled });
  world.registerAll(
    scene.collisionMeshes,
    undefined,
    ColliderTransformMode.Static,
  );
  for (const mesh of scene.dynamicCollisionMeshes) {
    world.setTransformMode(mesh, ColliderTransformMode.Dynamic);
  }
  world.registerAll(
    scene.cameraObstructionMeshes ?? [],
    CollisionLayer.CameraObstruction,
    ColliderTransformMode.Static,
  );

  const cases = createSweepCases(scene.collisionMeshes);
  const hit = new CollisionHit();
  const iterations = 100;

  try {
    for (let warmup = 0; warmup < 10; warmup += 1) {
      for (const sweep of cases) {
        world.sweepSphere(
          sweep.origin,
          sweep.displacement,
          sweep.radius,
          hit,
          sweep.queryMask,
        );
      }
    }

    const started = performance.now();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const sweep of cases) {
        world.sweepSphere(
          sweep.origin,
          sweep.displacement,
          sweep.radius,
          hit,
          sweep.queryMask,
        );
      }
    }
    const durationMs = performance.now() - started;
    const sweepCount = iterations * cases.length;
    let eligibleColliders = 0;
    let broadphaseCandidates = 0;
    let narrowPhaseChecks = 0;
    for (const sweep of cases) {
      world.sweepSphere(
        sweep.origin,
        sweep.displacement,
        sweep.radius,
        hit,
        sweep.queryMask,
      );
      const diagnostics = world.getLastSweepDiagnostics();
      eligibleColliders += diagnostics.eligibleColliders;
      broadphaseCandidates += diagnostics.broadphaseCandidates;
      narrowPhaseChecks += diagnostics.narrowPhaseChecks;
    }

    console.log(
      JSON.stringify({
        scene: scene.name,
        mode: broadphaseEnabled ? 'broadphase' : 'exhaustive',
        registeredColliders: world.colliderCount,
        staticColliders:
          world.colliderCount - scene.dynamicCollisionMeshes.length,
        dynamicColliders: scene.dynamicCollisionMeshes.length,
        sweeps: sweepCount,
        averageEligibleColliders: eligibleColliders / cases.length,
        averageBroadphaseCandidates: broadphaseCandidates / cases.length,
        averageNarrowPhaseChecks: narrowPhaseChecks / cases.length,
        averageNarrowPhaseChecksAvoided:
          (eligibleColliders - narrowPhaseChecks) / cases.length,
        durationMs,
        microsecondsPerSweep: (durationMs * 1000) / sweepCount,
      }),
    );
  } finally {
    world.clear();
    scene.dispose();
  }
};

const createContainmentScene = (): BenchmarkScene =>
  Object.assign(new ContainmentLevelScene(() => {}), {
    name: 'containment',
  });
const createCultivationPreviewScene = (): BenchmarkScene =>
  Object.assign(new LevelTwoPreviewScene(() => {}), {
    name: 'cultivation-preview',
    cameraObstructionMeshes: [] as readonly THREE.Mesh[],
  });

runSceneBenchmark(createContainmentScene(), false);
runSceneBenchmark(createContainmentScene(), true);
runSceneBenchmark(createCultivationPreviewScene(), false);
runSceneBenchmark(createCultivationPreviewScene(), true);
