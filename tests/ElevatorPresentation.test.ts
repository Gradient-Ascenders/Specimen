import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type {
  ElevatorSequence,
  ElevatorSequenceState,
} from '../src/puzzle/ElevatorSequence.ts';
import { ElevatorPresentation } from '../src/render/elevator/ElevatorPresentation.ts';

interface MutablePresentationSource {
  readonly id: string;
  readonly root: THREE.Group;
  readonly platform: {
    readonly size: THREE.Vector3;
  };
  readonly routeStart: THREE.Vector3;
  readonly routeEnd: THREE.Vector3;
  state: ElevatorSequenceState;
  ascentProgress: number;
  stateElapsedSeconds: number;
}

const EPSILON = 1e-10;

function assertVectorClose(
  actual: THREE.Vector3,
  expected: THREE.Vector3,
): void {
  assert.ok(
    actual.distanceTo(expected) < EPSILON,
    `${actual.toArray().join(', ')} did not match ${expected.toArray().join(', ')}`,
  );
}

function createSource(): MutablePresentationSource {
  return {
    id: 'presentation-test-elevator',
    root: new THREE.Group(),
    platform: { size: new THREE.Vector3(4, 0.5, 4) },
    routeStart: new THREE.Vector3(0, 0, 0),
    routeEnd: new THREE.Vector3(0, 4, 0),
    state: 'waitingForRider',
    ascentProgress: 0,
    stateElapsedSeconds: 0,
  };
}

test('elevator cues map directly to runtime state and clear on reset', () => {
  const source = createSource();
  const sequence = source as unknown as ElevatorSequence;
  const presentation = new ElevatorPresentation(sequence);

  assert.deepEqual(presentation.diagnostics, {
    state: 'waitingForRider',
    progress: 0,
    warningLightIntensity: 0,
    arrivalCueVisible: false,
    exitRouteVisible: false,
  });

  source.state = 'warning';
  source.stateElapsedSeconds = 0.1;
  presentation.sync();
  assert.equal(presentation.diagnostics.state, 'warning');
  assert.ok(presentation.diagnostics.warningLightIntensity > 0);
  assert.equal(presentation.diagnostics.exitRouteVisible, false);

  source.state = 'arrivalPause';
  source.ascentProgress = 1;
  source.stateElapsedSeconds = 0.1;
  presentation.sync();
  assert.equal(presentation.diagnostics.state, 'arrivalPause');
  assert.equal(presentation.diagnostics.progress, 1);
  assert.equal(presentation.diagnostics.arrivalCueVisible, true);
  assert.equal(presentation.diagnostics.exitRouteVisible, false);

  source.state = 'exitReady';
  source.stateElapsedSeconds = 0;
  presentation.sync();
  assert.equal(presentation.diagnostics.state, 'exitReady');
  assert.equal(presentation.diagnostics.exitRouteVisible, true);

  source.state = 'waitingForRider';
  source.ascentProgress = 0;
  source.stateElapsedSeconds = 0;
  presentation.sync();
  assert.deepEqual(presentation.diagnostics, {
    state: 'waitingForRider',
    progress: 0,
    warningLightIntensity: 0,
    arrivalCueVisible: false,
    exitRouteVisible: false,
  });
  assert.deepEqual(source.root.position.toArray(), [0, 0, 0]);

  presentation.dispose();
});

test('elevator platform presentation follows a non-identity runtime transform', () => {
  const source = createSource();
  const sequence = source as unknown as ElevatorSequence;
  const presentation = new ElevatorPresentation(sequence);
  const roof = source.root.getObjectByName(
    'presentation-test-elevator-industrial-roof',
  );
  assert.ok(roof, 'Expected runtime-owned roof presentation geometry.');

  source.root.position.set(5, 2.5, -3);
  source.root.rotation.set(0.2, -0.65, 0.1);
  source.root.scale.set(1.25, 0.8, 1.1);
  source.root.updateMatrixWorld(true);

  const localProbe = new THREE.Vector3(0.75, 0.18, -0.6);
  assertVectorClose(
    localProbe.clone().applyMatrix4(roof.matrixWorld),
    localProbe.clone().applyMatrix4(source.root.matrixWorld),
  );

  source.root.position.add(new THREE.Vector3(-1.5, 4, 2));
  source.root.rotation.y += 0.4;
  source.root.updateMatrixWorld(true);
  assertVectorClose(
    localProbe.clone().applyMatrix4(roof.matrixWorld),
    localProbe.clone().applyMatrix4(source.root.matrixWorld),
  );

  presentation.dispose();
});
