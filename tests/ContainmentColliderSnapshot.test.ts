import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  captureContainmentCollisionFingerprint,
  ROOM_ONE_DEVELOPMENT_SOLUBLE_BARRIER_NAME,
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

test('production omits only the explicit development soluble barrier', () => {
  const scene = new ContainmentLevelScene(() => {});
  const production = captureContainmentCollisionFingerprint(
    scene.collisionMeshes,
  );
  assert.deepEqual(
    production,
    fixture.filter((collider) => !collider.developmentOnly),
  );
  assert.equal(production.length, fixture.length - 1);
  scene.dispose();
});

test('the only frozen development collider is the explicit Room 1 barrier', () => {
  const developmentColliders = fixture.filter(
    (collider) => collider.developmentOnly,
  );
  assert.deepEqual(
    developmentColliders.map((collider) => collider.name),
    [ROOM_ONE_DEVELOPMENT_SOLUBLE_BARRIER_NAME],
  );
  assert.equal(developmentColliders[0]?.soluble, true);
});
