import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { captureContainmentCollisionFingerprint } from '../src/levels/ContainmentCollisionFingerprint.ts';
import {
  AcidSurfaceMaterial,
  DEFAULT_ACID_BUBBLE_SCALE,
  DEFAULT_ACID_BUBBLE_STRENGTH,
  DEFAULT_ACID_EMISSION_STRENGTH,
  DEFAULT_ACID_FLOW_SCALE,
  DEFAULT_ACID_FLOW_SPEED,
} from '../src/render/environment/containment/AcidSurfaceMaterial.ts';

test('acid material retains standard lighting and updates one stable uniform set', () => {
  const material = new AcidSurfaceMaterial();
  const materialReference = material;

  assert.ok(material instanceof THREE.MeshStandardMaterial);
  assert.equal(material.name, 'room-3-hazardous-chemical-liquid');
  assert.deepEqual(material.diagnostics, {
    timeSeconds: 0,
    flowSpeed: DEFAULT_ACID_FLOW_SPEED,
    flowScale: DEFAULT_ACID_FLOW_SCALE,
    bubbleScale: DEFAULT_ACID_BUBBLE_SCALE,
    bubbleStrength: DEFAULT_ACID_BUBBLE_STRENGTH,
    emissionStrength: DEFAULT_ACID_EMISSION_STRENGTH,
  });
  for (const value of Object.values(material.diagnostics)) {
    assert.equal(Number.isFinite(value), true);
  }

  material.update(0.25);
  material.update(0.5);
  assert.equal(material, materialReference);
  assert.equal(material.diagnostics.timeSeconds, 0.75);
  assert.throws(() => material.update(Number.NaN), /finite and non-negative/);
  assert.throws(() => material.update(-0.01), /finite and non-negative/);
  material.dispose();
});

test('Room 3 owns one acid material while frozen collision remains unchanged', () => {
  const first = new ContainmentLevelScene(() => {});
  const material = first.roomThree.art.acidSurfaceMaterial;
  const surface = first.roomThree.art.acidSurface;
  const collider = first.collisionMeshes.find(
    (mesh) => mesh.name === 'room-3-acid-floor',
  );
  assert.ok(collider);
  const collisionBefore = captureContainmentCollisionFingerprint(
    first.collisionMeshes,
  );

  assert.equal(surface.material, material);
  assert.equal(surface.userData.authoritativeCollider, collider.name);
  assert.equal(surface.userData.materialRole, 'replaceable-acid-surface');
  assert.equal(first.collisionMeshes.includes(surface), false);
  assert.deepEqual(surface.scale.toArray(), [32.7, 0.05, 26.7]);
  assert.deepEqual(surface.position.toArray(), [0, 5.025, 63]);
  assert.equal(collider.userData.textureRole, 'acid-floor');
  assert.deepEqual(collider.userData.sizeMetres, [34, 0.4, 28]);
  assert.deepEqual(collider.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(collider.position.toArray(), [0, 4.8, 63]);

  first.update(0.4);
  first.roomThree.reset();
  first.update(0.6);
  assert.equal(first.roomThree.art.acidSurfaceMaterial, material);
  assert.equal(material.diagnostics.timeSeconds, 1);
  assert.deepEqual(
    captureContainmentCollisionFingerprint(first.collisionMeshes),
    collisionBefore,
  );

  let disposeEvents = 0;
  material.addEventListener('dispose', () => {
    disposeEvents += 1;
  });
  first.dispose();
  assert.equal(disposeEvents, 1);

  const recreated = new ContainmentLevelScene(() => {});
  assert.notEqual(recreated.roomThree.art.acidSurfaceMaterial, material);
  assert.equal(
    recreated.roomThree.art.acidSurfaceMaterial.diagnostics.timeSeconds,
    0,
  );
  recreated.dispose();
});
