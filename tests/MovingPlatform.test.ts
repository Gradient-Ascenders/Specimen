import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { MovingPlatform } from '../src/puzzle/MovingPlatform.ts';

const EPSILON = 1e-10;

test('moving platform restores an authored midpoint and travel direction', () => {
  const platform = new MovingPlatform({
    id: 'midpoint-platform',
    start: new THREE.Vector3(-4, 2, 3),
    end: new THREE.Vector3(4, 2, 3),
    travelDurationSeconds: 4,
    initialProgress: 0.5,
    initialTarget: 'end',
  });

  assert.ok(platform.root.position.equals(new THREE.Vector3(0, 2, 3)));
  assert.equal(platform.platformState, 'movingToEnd');

  platform.update(2);
  assert.ok(platform.root.position.equals(new THREE.Vector3(4, 2, 3)));
  assert.equal(platform.isAtEnd, true);

  platform.setActive(false);
  platform.update(4);
  assert.ok(platform.root.position.equals(new THREE.Vector3(-4, 2, 3)));
  assert.equal(platform.isAtStart, true);

  platform.reset();
  assert.ok(platform.root.position.distanceTo(new THREE.Vector3(0, 2, 3)) < EPSILON);
  assert.equal(platform.platformState, 'movingToEnd');
  assert.equal(platform.displacement.lengthSq(), 0);

  assert.throws(() =>
    new MovingPlatform({
      id: 'invalid-midpoint-platform',
      start: new THREE.Vector3(),
      end: new THREE.Vector3(1, 0, 0),
      initialProgress: 1.1,
    }));

  platform.dispose();
});


test('moving platform snapshot restore commits current/previous transforms together with zero stale displacement', () => {
  const platform = new MovingPlatform({
    id: 'snapshot-platform',
    start: new THREE.Vector3(0, 1, 0),
    end: new THREE.Vector3(0, 1, 8),
    travelDurationSeconds: 4,
    initialTarget: 'end',
  });

  platform.update(1.25);
  const snapshot = platform.captureState();
  const checkpointPosition = platform.root.position.clone();
  assert.ok(platform.displacement.lengthSq() > 0);

  const preview = new THREE.Vector3();
  platform.copyProposedDisplacement(0.5, preview);
  assert.ok(preview.z > 0);
  assert.ok(platform.root.position.equals(checkpointPosition));

  platform.update(1);
  platform.setActive(false);
  platform.update(0.5);
  assert.ok(!platform.root.position.equals(checkpointPosition));

  platform.restoreState(snapshot);
  assert.ok(platform.root.position.equals(checkpointPosition));
  assert.ok(platform.previousPosition.equals(checkpointPosition));
  assert.equal(platform.displacement.lengthSq(), 0);
  assert.equal(platform.target, 'end');

  platform.hold();
  assert.ok(platform.root.position.equals(checkpointPosition));
  assert.equal(platform.displacement.lengthSq(), 0);
  platform.dispose();
});
