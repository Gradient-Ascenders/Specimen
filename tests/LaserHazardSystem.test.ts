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


test('patterned laser circuit gate survives timeline writes and affects both collision and visibility state', () => {
  const hazard = new LaserHazard({
    id: 'circuit-gated-pattern',
    start: new THREE.Vector3(0, 1, 0),
    end: new THREE.Vector3(4, 1, 0),
    timeline: {
      axisWorld: new THREE.Vector3(0, 1, 0),
      repeat: true,
      steps: [
        {
          kind: 'hold',
          durationSeconds: 0.1,
          enabled: false,
          angleRadians: 0,
        },
        {
          kind: 'hold',
          durationSeconds: 0.1,
          enabled: true,
          angleRadians: 0,
        },
      ],
    },
  });

  hazard.setCircuitGateEnabled(false);
  hazard.update(0.15);
  assert.equal(hazard.authoredEnabled, true);
  assert.equal(hazard.circuitGateEnabled, false);
  assert.equal(hazard.enabled, false);
  assert.equal(
    hazard.intersects({
      id: 'bob',
      position: new THREE.Vector3(2, 1, 0),
      radiusMetres: 0.45,
    }),
    false,
  );

  hazard.setCircuitGateEnabled(true);
  assert.equal(hazard.enabled, true);
  assert.equal(
    hazard.intersects({
      id: 'bob',
      position: new THREE.Vector3(2, 1, 0),
      radiusMetres: 0.45,
    }),
    true,
  );

  hazard.reset();
  assert.equal(hazard.circuitGateEnabled, true);
  hazard.dispose();
});
