import assert from 'node:assert/strict';
import test from 'node:test';

import { CULTIVATION_FOUNDATION_MANIFEST } from '../src/levels/CultivationFoundationManifest.ts';
import { CultivationLevelScene } from '../src/levels/CultivationLevelScene.ts';

test('Cultivation harness exposes explicitly tagged collision and hazard authoring', () => {
  const scene = new CultivationLevelScene(CULTIVATION_FOUNDATION_MANIFEST);
  assert.ok(scene.collisionMeshes.length > 0);
  assert.ok(scene.collisionMeshes.every((mesh) => mesh.userData.surfaceTag === 'default'));

  const radiation = scene.root.getObjectByName('cultivation-room-2-radiation-presentation');
  assert.equal(radiation?.userData.authoringRole, 'radioactive-hazard');
  assert.equal(radiation?.userData.hazardType, 'radioactive');
  assert.ok(!scene.collisionMeshes.includes(radiation as never));

  const roomThree = CULTIVATION_FOUNDATION_MANIFEST.checkpoints[2];
  assert.notDeepEqual(
    roomThree.bobSpawnPosition.toArray(),
    roomThree.goopSpawnPosition.toArray(),
  );
  assert.ok(roomThree.bobSpawnPosition.y > roomThree.goopSpawnPosition.y);
  scene.dispose();
  assert.equal(scene.root.children.length, 0);
});
