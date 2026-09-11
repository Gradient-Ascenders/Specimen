import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { PoweredDeviceCore } from '../src/electrical/PoweredDeviceCore.ts';

function createCore(
  powerMode: 'sustained' | 'latched' = 'sustained',
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const core = new PoweredDeviceCore({
    id: `core-${powerMode}`,
    displayName: 'Test Core',
    hitMeshes: [mesh],
    powerMode,
  });
  return {
    core,
    mesh,
    dispose: () => {
      core.dispose();
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) material.dispose();
    },
  };
}

test('sustained core keeps direct connection distinct from multiple upstream supplies', () => {
  const fixture = createCore();
  const transitions: boolean[] = [];
  fixture.core.events.on('powerChanged', ({ powered }) => {
    transitions.push(powered);
  });

  try {
    fixture.core.setConnectionState(true);
    fixture.core.setConnectionState(true);
    assert.equal(fixture.core.readModel.connected, true);
    assert.equal(fixture.core.readModel.powered, true);
    assert.deepEqual(transitions, [true]);

    fixture.core.setSupply('generator-a', true);
    fixture.core.setSupply('generator-b', true);
    fixture.core.setConnectionState(false);
    assert.equal(fixture.core.readModel.connected, false);
    assert.equal(fixture.core.readModel.supplyCount, 2);
    assert.equal(fixture.core.readModel.powered, true);

    fixture.core.setSupply('generator-a', false);
    assert.equal(fixture.core.readModel.powered, true);
    fixture.core.setSupply('generator-b', false);
    assert.equal(fixture.core.readModel.powered, false);
    assert.deepEqual(transitions, [true, false]);
  } finally {
    fixture.dispose();
  }
});

test('latched core retains authored latch after input loss while availability only gates operation', () => {
  const fixture = createCore('latched');

  try {
    fixture.core.setSupply('generator', true);
    assert.equal(fixture.core.readModel.latched, true);
    assert.equal(fixture.core.readModel.powered, true);

    fixture.core.setSupply('generator', false);
    assert.equal(fixture.core.readModel.powered, true);

    fixture.core.setAvailable(false);
    assert.equal(fixture.core.readModel.powered, false);
    assert.equal(fixture.core.readModel.latched, true);

    fixture.core.setAvailable(true);
    assert.equal(fixture.core.readModel.powered, true);

    fixture.core.reset();
    assert.equal(fixture.core.readModel.latched, false);
    assert.equal(fixture.core.readModel.connected, false);
    assert.equal(fixture.core.readModel.supplyCount, 0);
    assert.equal(fixture.core.readModel.powered, false);
  } finally {
    fixture.dispose();
  }
});

test('powered core snapshot is independent and never serializes live connection or upstream supply', () => {
  const fixture = createCore('latched');

  try {
    fixture.core.setConnectionState(true);
    fixture.core.setSupply('generator', true);
    const snapshot = fixture.core.captureLocalState();
    assert.deepEqual(snapshot, {
      available: true,
      latched: true,
    });

    fixture.core.setAvailable(false);
    fixture.core.restoreLocalState(snapshot);
    assert.equal(fixture.core.readModel.available, true);
    assert.equal(fixture.core.readModel.latched, true);
    assert.equal(fixture.core.readModel.connected, false);
    assert.equal(fixture.core.readModel.supplyCount, 0);
    assert.equal(fixture.core.readModel.powered, true);
  } finally {
    fixture.dispose();
  }
});

test('powered core disposal is idempotent', () => {
  const fixture = createCore();
  fixture.core.setConnectionState(true);
  fixture.core.dispose();
  fixture.core.dispose();
  assert.equal(fixture.core.readModel.powered, false);
  assert.equal(fixture.core.readModel.connected, false);
  fixture.mesh.geometry.dispose();
  const materials = Array.isArray(fixture.mesh.material)
    ? fixture.mesh.material
    : [fixture.mesh.material];
  for (const material of materials) material.dispose();
});
