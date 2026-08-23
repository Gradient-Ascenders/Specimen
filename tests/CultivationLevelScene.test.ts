import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CULTIVATION_FOUNDATION_MANIFEST } from '../src/levels/CultivationFoundationManifest.ts';
import { CultivationLevelScene } from '../src/levels/CultivationLevelScene.ts';

test('Cultivation harness exposes explicitly tagged collision and hazard authoring', () => {
  const scene = new CultivationLevelScene(CULTIVATION_FOUNDATION_MANIFEST);
  assert.ok(scene.collisionMeshes.length > 0);
  assert.ok(scene.collisionMeshes.every((mesh) => mesh.userData.surfaceTag === 'default'));

  assert.equal(CULTIVATION_FOUNDATION_MANIFEST.structuralAssemblies.length, 6);
  assert.equal(scene.solubleSupportMeshes.length, 6);
  assert.equal(
    scene.solubleSupportMeshes.filter(
      (mesh) => mesh.userData.supportRole === 'soluble-rope',
    ).length,
    3,
  );
  assert.equal(
    scene.solubleSupportMeshes.filter(
      (mesh) => mesh.userData.supportRole === 'soluble-brace',
    ).length,
    3,
  );
  assert.ok(
    scene.solubleSupportMeshes.every(
      (mesh) =>
        mesh.userData.soluble === true &&
        typeof mesh.userData.assemblyId === 'string' &&
        scene.collisionMeshes.includes(mesh),
    ),
  );
  assert.equal(
    new Set(scene.solubleSupportMeshes.map((mesh) => mesh.userData.solubleId)).size,
    6,
  );

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

test('Cultivation structural authoring rejects role mismatches and obstructed poses', () => {
  const source = CULTIVATION_FOUNDATION_MANIFEST.structuralAssemblies[0]!;
  assert.throws(
    () =>
      new CultivationLevelScene({
        ...CULTIVATION_FOUNDATION_MANIFEST,
        structuralAssemblies: [{ ...source, supportRole: 'soluble-brace' }],
      }),
    /invalid support role/,
  );
  assert.throws(
    () =>
      new CultivationLevelScene({
        ...CULTIVATION_FOUNDATION_MANIFEST,
        structuralAssemblies: [
          { ...source, finalPosition: new THREE.Vector3(0, -0.2, 5) },
        ],
      }),
    /final collider overlaps static collider "cultivation-foundation-floor"/,
  );
});
