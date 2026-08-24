import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { LaserHazard } from '../src/hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../src/hazards/LaserHazardSystem.ts';

test('multi-target laser updates advance each timeline once and identify the struck slime', () => {
  const hazard = new LaserHazard({
    id: 'multi-target-test-laser',
    start: new THREE.Vector3(0, 1, 0),
    end: new THREE.Vector3(4, 1, 0),
    timeline: {
      axisWorld: new THREE.Vector3(0, 1, 0),
      repeat: true,
      steps: [
        {
          kind: 'hold',
          durationSeconds: 1,
          enabled: true,
          angleRadians: 0,
        },
      ],
    },
  });
  let struckTargetId = 'none';
  const system = new LaserHazardSystem({
    id: 'multi-target-test-system',
    hazards: [hazard],
    requestRecovery: (_struckHazard, target) => {
      struckTargetId = target.id ?? 'anonymous';
    },
  });

  system.updateTargets(0.25, [
    {
      id: 'goop',
      position: new THREE.Vector3(10, 1, 0),
      radiusMetres: 0.45,
    },
    {
      id: 'bob',
      position: new THREE.Vector3(2, 1, 0),
      radiusMetres: 0.45,
    },
  ]);

  assert.equal(hazard.sequenceElapsedSeconds, 0.25);
  assert.equal(system.recoveryRequestCount, 1);
  assert.equal(system.lastFailureTargetId, 'bob');
  assert.equal(struckTargetId, 'bob');

  system.dispose();
});
