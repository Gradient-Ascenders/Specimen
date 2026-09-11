import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { ElectricalDeviceCollection } from '../src/electrical/ElectricalDeviceCollection.ts';
import {
  GeneratorDevice,
  PoweredLightDevice,
  TerminalDevice,
} from '../src/electrical/PoweredDevices.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

function createCollectionFixture() {
  const world = new CollisionWorld();
  const targets = new ElectricalTargetRegistry(world);
  const collection = new ElectricalDeviceCollection(targets);

  const generatorA = new GeneratorDevice({
    id: 'generator-a',
    displayName: 'Generator A',
    position: new THREE.Vector3(),
  });
  const generatorB = new GeneratorDevice({
    id: 'generator-b',
    displayName: 'Generator B',
    position: new THREE.Vector3(2, 0, 0),
  });
  const relay = new TerminalDevice({
    id: 'relay',
    displayName: 'Relay',
    position: new THREE.Vector3(4, 0, 0),
  });
  const light = new PoweredLightDevice({
    id: 'light',
    displayName: 'Light',
    position: new THREE.Vector3(6, 0, 0),
  });

  for (const device of [generatorA, generatorB, relay, light]) {
    collection.addDevice(device);
  }

  return {
    world,
    targets,
    collection,
    generatorA,
    generatorB,
    relay,
    light,
    dispose: () => {
      collection.dispose();
      targets.dispose();
    },
  };
}

test('device graph supports fan-out, multiple suppliers, and deterministic source removal', () => {
  const fixture = createCollectionFixture();
  try {
    fixture.collection.addSupplyLink('generator-a', 'light');
    fixture.collection.addSupplyLink('generator-b', 'light');
    fixture.collection.addSupplyLink('generator-a', 'relay');

    fixture.generatorA.core.setConnectionState(true);
    fixture.collection.recomputePower();
    assert.equal(fixture.light.core.readModel.powered, true);
    assert.equal(fixture.relay.core.readModel.powered, true);

    fixture.generatorB.core.setConnectionState(true);
    fixture.collection.recomputePower();
    fixture.generatorA.core.setConnectionState(false);
    fixture.collection.recomputePower();

    assert.equal(fixture.light.core.readModel.powered, true);
    assert.equal(fixture.light.core.readModel.supplyCount, 1);
    assert.equal(fixture.relay.core.readModel.powered, false);

    assert.equal(fixture.collection.removeDevice('generator-b'), true);
    assert.equal(fixture.light.core.readModel.powered, false);
    assert.equal(fixture.light.core.readModel.supplyCount, 0);
  } finally {
    fixture.dispose();
  }
});

test('device graph rejects invalid suppliers, unknown recipients, self-links, and cycles', () => {
  const fixture = createCollectionFixture();
  try {
    assert.throws(
      () => fixture.collection.addSupplyLink('light', 'relay'),
      /cannot supply downstream devices/,
    );
    assert.throws(
      () => fixture.collection.addSupplyLink('generator-a', 'missing'),
      /Unknown electrical device/,
    );
    assert.throws(
      () => fixture.collection.addSupplyLink('generator-a', 'generator-a'),
      /self-links/,
    );

    fixture.collection.addSupplyLink('generator-a', 'relay');
    fixture.collection.addSupplyLink('relay', 'generator-b');
    assert.throws(
      () => fixture.collection.addSupplyLink('generator-b', 'generator-a'),
      /acyclic/,
    );
  } finally {
    fixture.dispose();
  }
});

test('collection checkpoint restore applies every local state before one deterministic supply recompute', () => {
  const fixture = createCollectionFixture();
  try {
    fixture.collection.addSupplyLink('generator-a', 'relay');
    fixture.collection.addSupplyLink('relay', 'light');

    fixture.generatorA.core.setConnectionState(true);
    fixture.collection.recomputePower();
    assert.equal(fixture.relay.core.readModel.powered, true);
    assert.equal(fixture.light.core.readModel.powered, true);

    const snapshot = fixture.collection.capture();

    fixture.generatorA.core.setConnectionState(false);
    fixture.collection.recomputePower();
    assert.equal(fixture.light.core.readModel.powered, false);

    fixture.collection.restore(snapshot);

    // The live tether is intentionally absent from snapshots, so sustained
    // power remains off after recovery even though the topology is restored.
    assert.equal(fixture.generatorA.core.readModel.connected, false);
    assert.equal(fixture.generatorA.core.readModel.powered, false);
    assert.equal(fixture.relay.core.readModel.powered, false);
    assert.equal(fixture.light.core.readModel.powered, false);
  } finally {
    fixture.dispose();
  }
});

test('collection repeated reset and disposal leave target registrations bounded', () => {
  const fixture = createCollectionFixture();
  assert.equal(fixture.targets.size, 4);

  for (let index = 0; index < 20; index += 1) {
    fixture.collection.reset();
    assert.equal(fixture.targets.size, 4);
  }

  fixture.collection.dispose();
  assert.equal(fixture.targets.size, 0);
  fixture.collection.dispose();
  fixture.targets.dispose();
});


test('recomputing an unchanged powered graph emits no duplicate power transitions', () => {
  const fixture = createCollectionFixture();
  const transitions: boolean[] = [];
  fixture.light.core.events.on('powerChanged', ({ powered }) => {
    transitions.push(powered);
  });

  try {
    fixture.collection.addSupplyLink('generator-a', 'light');
    fixture.generatorA.core.setConnectionState(true);
    fixture.collection.recomputePower();
    assert.deepEqual(transitions, [true]);

    for (let index = 0; index < 10; index += 1) {
      fixture.collection.recomputePower();
    }
    assert.deepEqual(transitions, [true]);

    assert.equal(
      fixture.collection.removeSupplyLink('generator-a', 'light'),
      true,
    );
    assert.deepEqual(transitions, [true, false]);
    assert.equal(fixture.light.core.readModel.powered, false);
  } finally {
    fixture.dispose();
  }
});
