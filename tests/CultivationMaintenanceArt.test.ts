import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createRustedSewerDrone } from '../src/levels/RustedSewerDrone.ts';
import { batchMaintenanceScout } from '../src/render/hazards/BatchMaintenanceScout.ts';

test('patrol drone detailing fits its envelope and retains its live eye with batched machinery', () => {
  const {body, eye} = createRustedSewerDrone(false);
  body.scale.setScalar(.75);
  const bounds = new THREE.Box3().setFromObject(body, true), eyeMaterial = eye.material;
  const eyePosition = eye.position.clone(), oldGeometry = body.geometry;
  let retiredHull = 0; oldGeometry.addEventListener('dispose', () => retiredHull++);
  const materials = new Set<THREE.Material>();
  body.traverse(o => { if (o instanceof THREE.Mesh) materials.add(o.material); });
  try {
    batchMaintenanceScout(body, eye);
    const after = new THREE.Box3().setFromObject(body, true);
    assert.ok(bounds.containsBox(after), 'new armour and fans stay inside the previous visual envelope');
    assert.notEqual(body.geometry, oldGeometry);
    assert.equal(retiredHull, 1, 'replaced hull is disposed');
    assert.equal(eye.material, eyeMaterial); assert.deepEqual(eye.position, eyePosition);
    assert.equal(body.children.length, 4, 'one eye, two machinery batches and one shared sensor batch');
    const markers = body.children.find(o => o !== eye && o instanceof THREE.Mesh && o.material === eyeMaterial);
    assert.ok(markers, 'sensor markers share live network status without extra lights');

    body.traverse(o => { if (o instanceof THREE.Mesh) assert.ok(materials.has(o.material)); });
  } finally {
    body.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    for (const material of materials) material.dispose();
  }
});

