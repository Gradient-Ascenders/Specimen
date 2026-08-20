import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { LaserHazard } from '../src/hazards/LaserHazard.ts';
import { LaserHazardPresentation } from '../src/render/hazards/LaserHazardPresentation.ts';

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

function requireObject(root: THREE.Object3D, name: string): THREE.Object3D {
  const object = root.getObjectByName(name);
  assert.ok(object, `Expected presentation object "${name}".`);
  return object;
}

test('laser presentation maps active/inactive state without retaining stale beams', () => {
  const hazard = new LaserHazard({
    id: 'test-laser',
    start: new THREE.Vector3(-2, 1, 3),
    end: new THREE.Vector3(4, 2, -1),
  });
  const presentation = new LaserHazardPresentation([hazard]);
  const beam = requireObject(
    presentation.root,
    'test-laser-presentation-beam-core',
  );
  const activeAperture = requireObject(
    presentation.root,
    'test-laser-presentation-emitter-start-active-aperture',
  );
  const inactiveAperture = requireObject(
    presentation.root,
    'test-laser-presentation-emitter-start-inactive-aperture',
  );

  assert.equal(beam.visible, true);
  assert.equal(activeAperture.visible, true);
  assert.equal(inactiveAperture.visible, false);

  presentation.root.updateMatrixWorld(true);
  const visibleStart = new THREE.Vector3(0, -0.5, 0).applyMatrix4(
    beam.matrixWorld,
  );
  const visibleEnd = new THREE.Vector3(0, 0.5, 0).applyMatrix4(
    beam.matrixWorld,
  );
  assertVectorClose(visibleStart, new THREE.Vector3(-2, 1, 3));
  assertVectorClose(visibleEnd, new THREE.Vector3(4, 2, -1));

  hazard.setEnabled(false);
  presentation.sync();
  assert.equal(beam.visible, false);
  assert.equal(activeAperture.visible, false);
  assert.equal(inactiveAperture.visible, true);

  hazard.reset();
  presentation.sync();
  assert.equal(beam.visible, true);
  assert.equal(activeAperture.visible, true);
  assert.equal(inactiveAperture.visible, false);

  presentation.dispose();
  hazard.dispose();
});

test('scripted laser presentation stays on authoritative moving endpoints', () => {
  const hazard = new LaserHazard({
    id: 'moving-laser',
    start: new THREE.Vector3(1, 2, 3),
    end: new THREE.Vector3(5, 2, 3),
    timeline: {
      axisWorld: new THREE.Vector3(0, 1, 0),
      steps: [
        {
          kind: 'sweep',
          durationSeconds: 1,
          enabled: true,
          fromAngleRadians: 0,
          toAngleRadians: Math.PI / 2,
        },
      ],
    },
  });
  const presentation = new LaserHazardPresentation([hazard]);
  hazard.update(0.5);
  presentation.sync();

  const beam = requireObject(
    presentation.root,
    'moving-laser-presentation-beam-core',
  );
  const startEmitter = requireObject(
    presentation.root,
    'moving-laser-presentation-emitter-start',
  );
  const endEmitter = requireObject(
    presentation.root,
    'moving-laser-presentation-emitter-end',
  );
  presentation.root.updateMatrixWorld(true);
  assertVectorClose(
    new THREE.Vector3(0, -0.5, 0).applyMatrix4(beam.matrixWorld),
    new THREE.Vector3(hazard.start.x, hazard.start.y, hazard.start.z),
  );
  assertVectorClose(
    new THREE.Vector3(0, 0.5, 0).applyMatrix4(beam.matrixWorld),
    new THREE.Vector3(hazard.end.x, hazard.end.y, hazard.end.z),
  );
  assertVectorClose(
    startEmitter.getWorldPosition(new THREE.Vector3()),
    new THREE.Vector3(hazard.start.x, hazard.start.y, hazard.start.z),
  );
  assertVectorClose(
    endEmitter.getWorldPosition(new THREE.Vector3()),
    new THREE.Vector3(hazard.end.x, hazard.end.y, hazard.end.z),
  );

  hazard.reset();
  presentation.sync();
  presentation.root.updateMatrixWorld(true);
  assertVectorClose(
    new THREE.Vector3(0, -0.5, 0).applyMatrix4(beam.matrixWorld),
    new THREE.Vector3(1, 2, 3),
  );
  assertVectorClose(
    new THREE.Vector3(0, 0.5, 0).applyMatrix4(beam.matrixWorld),
    new THREE.Vector3(5, 2, 3),
  );
  assertVectorClose(
    startEmitter.getWorldPosition(new THREE.Vector3()),
    new THREE.Vector3(1, 2, 3),
  );
  assertVectorClose(
    endEmitter.getWorldPosition(new THREE.Vector3()),
    new THREE.Vector3(5, 2, 3),
  );

  presentation.dispose();
  hazard.dispose();
});

test('translated laser endpoints keep collision and presentation synchronized', () => {
  const hazard = new LaserHazard({
    id: 'translated-laser',
    start: new THREE.Vector3(-2, 1, 0),
    end: new THREE.Vector3(2, 1, 0),
  });
  const presentation = new LaserHazardPresentation([hazard]);

  hazard.setTranslationOffset(new THREE.Vector3(0, 3, 2));
  presentation.sync();
  assertVectorClose(
    new THREE.Vector3(hazard.start.x, hazard.start.y, hazard.start.z),
    new THREE.Vector3(-2, 4, 2),
  );
  assertVectorClose(
    new THREE.Vector3(hazard.end.x, hazard.end.y, hazard.end.z),
    new THREE.Vector3(2, 4, 2),
  );
  assert.equal(
    hazard.intersects({
      position: new THREE.Vector3(0, 4, 2),
      radiusMetres: 0.45,
    }),
    true,
  );
  assert.equal(
    hazard.intersects({
      position: new THREE.Vector3(0, 1, 0),
      radiusMetres: 0.45,
    }),
    false,
  );

  const beam = requireObject(
    presentation.root,
    'translated-laser-presentation-beam-core',
  );
  presentation.root.updateMatrixWorld(true);
  assertVectorClose(
    new THREE.Vector3(0, -0.5, 0).applyMatrix4(beam.matrixWorld),
    new THREE.Vector3(-2, 4, 2),
  );

  assert.throws(() =>
    hazard.setTranslationOffset({ x: Number.NaN, y: 0, z: 0 }));
  hazard.reset();
  assertVectorClose(
    new THREE.Vector3(hazard.start.x, hazard.start.y, hazard.start.z),
    new THREE.Vector3(-2, 1, 0),
  );

  presentation.dispose();
  hazard.dispose();
});
