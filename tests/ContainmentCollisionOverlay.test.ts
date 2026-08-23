import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ContainmentCollisionOverlay } from '../src/render/environment/containment/ContainmentCollisionOverlay.ts';

test('collision overlay is hidden, visual-only and follows its collider transform', () => {
  const parent = new THREE.Group();
  parent.position.set(4, 2, -1);
  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(2, 3, 4),
    new THREE.MeshBasicMaterial(),
  );
  collider.name = 'overlay-test-collider';
  collider.position.set(1, 0.5, 2);
  collider.userData.surfaceTag = 'sticky';
  parent.add(collider);

  const overlay = new ContainmentCollisionOverlay([collider]);
  const line = collider.getObjectByName(
    'overlay-test-collider-debug-collision-overlay',
  );
  assert.ok(line instanceof THREE.LineSegments);
  assert.equal(overlay.colliderCount, 1);
  assert.equal(overlay.isVisible, false);
  assert.equal(line.visible, false);
  assert.equal(line.userData.visualOnly, true);
  assert.deepEqual(line.scale.toArray(), [2, 3, 4]);

  overlay.setVisible(true);
  assert.equal(line.visible, true);
  const before = line.getWorldPosition(new THREE.Vector3());
  parent.position.x += 7;
  parent.updateWorldMatrix(true, true);
  const after = line.getWorldPosition(new THREE.Vector3());
  assert.equal(after.x - before.x, 7);

  let geometryDisposeEvents = 0;
  let materialDisposeEvents = 0;
  line.geometry.addEventListener('dispose', () => {
    geometryDisposeEvents += 1;
  });
  line.material.addEventListener('dispose', () => {
    materialDisposeEvents += 1;
  });
  overlay.dispose();
  overlay.dispose();
  assert.equal(line.parent, null);
  assert.equal(geometryDisposeEvents, 1);
  assert.equal(materialDisposeEvents, 1);
  assert.equal(overlay.colliderCount, 0);

  collider.geometry.dispose();
  (collider.material as THREE.Material).dispose();
});
