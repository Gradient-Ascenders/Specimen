import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentTeachingScene } from '../src/levels/ContainmentTeachingScene.ts';
import { ColliderTransformMode, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';

for (const includeDevelopmentHelpers of [false, true]) {
  test(`Room 1's vent ramp reaches its top landing without an invisible curb (dev ${includeDevelopmentHelpers})`, () => {
    const resources = new ContainmentArtResources();
    const scene = new ContainmentTeachingScene(resources, { includeDevelopmentHelpers });
    const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
    try {
      scene.root.updateMatrixWorld(true);
      world.registerAll(scene.collisionMeshes, undefined, ColliderTransformMode.Static);
      surfaces.registerAll(scene.collisionMeshes);
      const ramp = scene.collisionMeshes.find(mesh => mesh.name === 'duct-segment-b-ramp')!;
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(ramp.quaternion);
      const forward = new THREE.Vector3(0, 0, 1);
      for (const hz of [60, 120]) for (const x of [-5.24, -5.1, -4.8, -4.5, -4.36]) {
        const initialPosition = new THREE.Vector3(x - ramp.position.x, .125, -4)
          .applyMatrix4(ramp.matrixWorld).addScaledVector(normal, .462);
        const body = new KinematicBody({ world, surfaces, initialPosition });
        for (let step = 0; step < 4 * hz && body.position.z < 24.05; step++) {
          const previousZ = body.position.z;
          body.update(1 / hz, forward);
          if (previousZ > 22.5 && previousZ < 23.7) {
            assert.ok(body.position.z - previousZ > 1.8 / hz,
              `Vent snag at x=${x}, z=${previousZ}, ${hz}Hz: ${body.lastContactCollider?.name}`);
            assert.equal(body.grounded, true, 'Walking over the landing edge must not require a jump.');
          }
        }
        assert.ok(body.position.z >= 24.05, `The turning bay must be reachable at x=${x}, ${hz}Hz.`);
      }
    } finally { world.clear(); surfaces.clear(); scene.dispose(); resources.dispose(); }
  });
}
