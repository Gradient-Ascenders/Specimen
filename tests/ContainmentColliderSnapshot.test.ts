import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  captureContainmentCollisionFingerprint,
  type ContainmentColliderFingerprint,
} from '../src/levels/ContainmentCollisionFingerprint.ts';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';

const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/containment-colliders.json', import.meta.url),
    'utf8',
  ),
) as readonly ContainmentColliderFingerprint[];

test('Containment collision matches the frozen pre-art route', () => {
  const scene = new ContainmentLevelScene(() => {}, {
    includeDevelopmentHelpers: true,
  });
  assert.deepEqual(
    captureContainmentCollisionFingerprint(scene.collisionMeshes),
    fixture,
  );
  scene.dispose();
});

test('production and debug retain the same route without the retired Room 1 demo wall', () => {
  const scene = new ContainmentLevelScene(() => {});
  const production = captureContainmentCollisionFingerprint(
    scene.collisionMeshes,
  );
  assert.deepEqual(
    production,
    fixture,
  );
  assert.equal(production.length, fixture.length);
  assert.equal(scene.root.getObjectByName('room-1-goop-soluble-test-barrier'), undefined);
  scene.dispose();
});

test('the collider fixture contains no retired development barriers', () => {
  assert.equal(fixture.some(collider => collider.developmentOnly), false);
  assert.equal(fixture.some(collider => collider.name === 'room-1-goop-soluble-test-barrier'), false);
});
