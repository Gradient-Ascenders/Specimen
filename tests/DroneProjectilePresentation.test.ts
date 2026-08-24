import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DEFAULT_DRONE_PROJECTILE_CONFIG } from '../src/hazards/DroneProjectileSystem.ts';
import { DroneProjectilePresentation } from '../src/render/hazards/DroneProjectilePresentation.ts';

test('drone projectile proxies interpolate bounded live read states and reset cleanly', () => {
  const states = [
    {
      id: 1,
      active: true,
      ownerDroneId: 'drone-1',
      previousPosition: { x: 0, y: 1, z: 2 },
      position: { x: 2, y: 3, z: 4 },
      direction: { x: 1, y: 0, z: 0 },
    },
    {
      id: 2,
      active: false,
      ownerDroneId: 'drone-2',
      previousPosition: { x: 5, y: 5, z: 5 },
      position: { x: 6, y: 6, z: 6 },
      direction: { x: 0, y: 0, z: 1 },
    },
  ] as const;
  const presentation = new DroneProjectilePresentation(states);
  assert.equal(
    (presentation.mesh.geometry as THREE.SphereGeometry).parameters.radius,
    DEFAULT_DRONE_PROJECTILE_CONFIG.radiusMetres,
  );

  presentation.update(0.5);
  assert.equal(presentation.mesh.count, 1);
  presentation.mesh.getMatrixAt(0, presentation.mesh.matrix);
  assert.deepEqual(presentation.mesh.matrix.elements.slice(12, 15), [1, 2, 3]);

  presentation.reset();
  assert.equal(presentation.mesh.count, 0);
  presentation.dispose();
  assert.equal(presentation.mesh.parent, null);
});
