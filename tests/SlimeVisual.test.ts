import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  SlimeVisual,
  type SlimeVisualState,
} from '../src/render/slime/SlimeVisual.ts';

const FIXED_DELTA_SECONDS = 1 / 60;
const EPSILON = 1e-10;

function createState(): SlimeVisualState {
  return {
    velocityWorld: new THREE.Vector3(),
    surfaceNormalWorld: new THREE.Vector3(0, 1, 0),
    gameplayUpWorld: new THREE.Vector3(0, 1, 0),
    grounded: true,
    attached: false,
    jumpCharge: 0,
    maximumLocomotionSpeedMetresPerSecond: 5.5,
    contactCount: 0,
    contactNormalWorld: new THREE.Vector3(0, 1, 0),
    contactSpeedMetresPerSecond: 0,
    contactName: 'none',
    contactSurfaceTag: 'default',
    landedThisStep: false,
  };
}

test('directional deformation is independent of render presentations between fixed steps', () => {
  const frequentPresentation = new SlimeVisual({ radiusMetres: 0.45 });
  const sparsePresentation = new SlimeVisual({ radiusMetres: 0.45 });
  const frequentState = createState();
  const sparseState = createState();
  const velocities = [
    new THREE.Vector3(5.5, 0, 0),
    new THREE.Vector3(0, 0, -5.5),
    new THREE.Vector3(-5.5, 0, 0),
    new THREE.Vector3(0, 0, 5.5),
  ];

  for (let step = 0; step < velocities.length; step += 1) {
    frequentState.velocityWorld = velocities[step];
    sparseState.velocityWorld = velocities[step];
    frequentPresentation.update(FIXED_DELTA_SECONDS, frequentState);
    sparsePresentation.update(FIXED_DELTA_SECONDS, sparseState);

    frequentPresentation.mesh.rotation.y = (step + 1) * Math.PI / 8;
    frequentPresentation.present();
  }

  const finalYaw = Math.PI / 2;
  frequentPresentation.mesh.rotation.y = finalYaw;
  sparsePresentation.mesh.rotation.y = finalYaw;
  frequentPresentation.present();
  sparsePresentation.present();

  const frequent = frequentPresentation.diagnostics;
  const sparse = sparsePresentation.diagnostics;
  assert.ok(
    frequent.moveDirectionLocal.distanceTo(sparse.moveDirectionLocal) < EPSILON,
  );
  assert.ok(
    frequent.surfaceNormalLocal.distanceTo(sparse.surfaceNormalLocal) < EPSILON,
  );
  assert.ok(
    frequent.surfaceTangentLocal.distanceTo(sparse.surfaceTangentLocal) < EPSILON,
  );
  assert.ok(
    frequent.stretchDirectionLocal.distanceTo(
      sparse.stretchDirectionLocal,
    ) < EPSILON,
  );
  assert.ok(frequent.inertiaLocal.distanceTo(sparse.inertiaLocal) < EPSILON);
  assert.equal(frequent.speed, sparse.speed);
  assert.equal(frequent.stretch, sparse.stretch);

  frequentPresentation.dispose();
  sparsePresentation.dispose();
});
