import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { BlackoutPoweredDeviceRig } from '../src/electrical/BlackoutPoweredDeviceRig.ts';
import {
  LaserJunctionDevice,
  PoweredDoorDevice,
  PoweredLiftDevice,
  PoweredPlatformDevice,
  RotatingBridgeDevice,
  type PoweredCarrierBody,
} from '../src/electrical/PoweredDevices.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { LaserHazard } from '../src/hazards/LaserHazard.ts';
import {
  ColliderTransformMode,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

class TestCarrier implements PoweredCarrierBody {
  readonly id: string;
  readonly position = new THREE.Vector3();
  readonly radiusMetres = 0.45;
  supportCollider: THREE.Mesh | null = null;
  carrierApplications = 0;

  constructor(id: string, position = new THREE.Vector3()) {
    this.id = id;
    this.position.copy(position);
  }

  isSupportedBy(collider: THREE.Mesh): boolean {
    return this.supportCollider === collider;
  }

  applyCarrierDisplacement(
    displacement: { readonly x: number; readonly y: number; readonly z: number },
    _carrierCollider: THREE.Mesh,
  ): void {
    this.position.add(
      new THREE.Vector3(displacement.x, displacement.y, displacement.z),
    );
    this.carrierApplications += 1;
  }
}

test('powered door opens with power and all three slime identities protect closing', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const door = new PoweredDoorDevice({
    id: 'door',
    displayName: 'Door',
    collisionWorld: world,
    surfaceRegistry: surfaces,
    closedPosition: new THREE.Vector3(0, 1.5, 0),
    panelSize: new THREE.Vector3(4, 3, 0.4),
    travelAxis: new THREE.Vector3(0, 1, 0),
    travelDistance: 3.5,
    openingDurationSeconds: 1,
    closingDurationSeconds: 1,
  });

  const bodies = ['bob', 'goop', 'volt'].map(
    (id, index) => new TestCarrier(id, new THREE.Vector3(index * 0.3, 1.5, 0)),
  );

  try {
    door.core.setConnectionState(true);
    door.updateMechanics(1, bodies);
    assert.equal(door.door.state, 'open');
    assert.equal(door.core.readModel.powered, true);

    door.core.setConnectionState(false);
    door.updateMechanics(0.1, bodies);
    assert.equal(door.core.readModel.blocked, true);
    assert.deepEqual([...door.door.obstructionIds], ['bob', 'goop', 'volt']);

    door.reset();
    assert.equal(door.door.progress, 0);
    assert.equal(door.door.desiredOpen, false);
    assert.equal(door.core.readModel.blocked, false);
  } finally {
    door.dispose();
    assert.equal(world.colliderCount, 0);
    assert.equal(surfaces.registeredCount, 0);
  }
});

test('powered platform transports active and inactive riders, pauses on power loss, resumes, and restores exact checkpoint pose', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const platform = new PoweredPlatformDevice({
    id: 'platform',
    displayName: 'Platform',
    collisionWorld: world,
    surfaceRegistry: surfaces,
    start: new THREE.Vector3(0, 0.2, 0),
    end: new THREE.Vector3(0, 0.2, 4),
    size: new THREE.Vector3(2, 0.3, 2),
    travelDurationSeconds: 2,
    routePolicy: 'one-way',
  });
  const bob = new TestCarrier('bob', new THREE.Vector3(0, 0.8, 0));
  const volt = new TestCarrier('volt', new THREE.Vector3(0.4, 0.8, 0));
  bob.supportCollider = platform.platform.collisionMesh;
  volt.supportCollider = platform.platform.collisionMesh;

  try {
    platform.core.setConnectionState(true);
    platform.updateMechanics(0.5, [bob, volt]);
    assert.ok(Math.abs(platform.platform.progress - 0.25) < 1e-12);
    assert.equal(bob.carrierApplications, 1);
    assert.equal(volt.carrierApplications, 1);

    const checkpoint = platform.captureState();
    const checkpointPosition = platform.platform.root.position.clone();

    platform.core.setConnectionState(false);
    platform.updateMechanics(0.5, [bob, volt]);
    assert.ok(platform.platform.root.position.equals(checkpointPosition));
    assert.equal(platform.platform.displacement.lengthSq(), 0);

    platform.core.setConnectionState(true);
    platform.updateMechanics(0.5, [bob, volt]);
    assert.ok(platform.platform.progress > 0.25);

    platform.restoreState(checkpoint);
    assert.ok(platform.platform.root.position.equals(checkpointPosition));
    assert.ok(platform.platform.previousPosition.equals(checkpointPosition));
    assert.equal(platform.platform.displacement.lengthSq(), 0);
  } finally {
    platform.dispose();
  }
});

test('powered lift preflights supported-body ceiling motion and blocks without moving the carrier', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const lift = new PoweredLiftDevice({
    id: 'lift',
    displayName: 'Lift',
    collisionWorld: world,
    surfaceRegistry: surfaces,
    start: new THREE.Vector3(0, 0.2, 0),
    end: new THREE.Vector3(0, 3.2, 0),
    size: new THREE.Vector3(2, 0.3, 2),
    travelDurationSeconds: 1,
  });
  const rider = new TestCarrier('bob', new THREE.Vector3(0, 0.8, 0));
  rider.supportCollider = lift.platform.collisionMesh;

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 3));
  ceiling.position.set(0, 1.5, 0);
  world.register(ceiling, undefined, ColliderTransformMode.Static);

  try {
    lift.core.setConnectionState(true);
    const before = lift.platform.root.position.clone();
    lift.updateMechanics(0.5, [rider]);
    assert.equal(lift.core.readModel.powered, true);
    assert.equal(lift.core.readModel.blocked, true);
    assert.ok(lift.platform.root.position.equals(before));
    assert.equal(rider.carrierApplications, 0);
  } finally {
    world.unregister(ceiling);
    ceiling.geometry.dispose();
    const materials = Array.isArray(ceiling.material)
      ? ceiling.material
      : [ceiling.material];
    for (const material of materials) material.dispose();
    lift.dispose();
  }
});

test('rotating bridge blocks conservatively for occupants and resumes after the deck clears', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const bridge = new RotatingBridgeDevice({
    id: 'bridge',
    displayName: 'Bridge',
    collisionWorld: world,
    surfaceRegistry: surfaces,
    position: new THREE.Vector3(0, 0.3, 0),
    size: new THREE.Vector3(6, 0.4, 1.5),
    endAngleRadians: Math.PI / 2,
    rotationDurationSeconds: 1,
  });
  const occupant = new TestCarrier('goop', new THREE.Vector3(0, 0.6, 0));

  try {
    bridge.core.setConnectionState(true);
    bridge.updateMechanics(0.25, [occupant]);
    assert.equal(bridge.progress, 0);
    assert.equal(bridge.core.readModel.blocked, true);

    occupant.position.set(10, 10, 10);
    bridge.updateMechanics(0.25, [occupant]);
    assert.ok(bridge.progress > 0);
    assert.equal(bridge.core.readModel.blocked, false);

    const checkpoint = bridge.captureState();
    const angle = bridge.root.rotation.y;
    bridge.updateMechanics(0.25, [occupant]);
    bridge.restoreState(checkpoint);
    assert.ok(Math.abs(bridge.root.rotation.y - angle) < 1e-12);
  } finally {
    bridge.dispose();
  }
});

test('laser junction gates only its authored circuit while patterned timing continues underneath suppression', () => {
  const controlled = new LaserHazard({
    id: 'controlled',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4, y: 0, z: 0 },
    timeline: {
      axisWorld: { x: 0, y: 1, z: 0 },
      repeat: true,
      steps: [
        {
          kind: 'hold',
          durationSeconds: 0.2,
          enabled: true,
          angleRadians: 0,
        },
        {
          kind: 'hold',
          durationSeconds: 0.2,
          enabled: false,
          angleRadians: 0,
        },
      ],
    },
  });
  const neighbour = new LaserHazard({
    id: 'neighbour',
    start: { x: 0, y: 1, z: 0 },
    end: { x: 4, y: 1, z: 0 },
    enabled: true,
  });
  const junction = new LaserJunctionDevice({
    id: 'junction',
    displayName: 'Junction',
    position: new THREE.Vector3(),
    hazards: [controlled],
    mode: 'suppress-when-powered',
  });

  try {
    junction.core.setConnectionState(true);
    junction.syncPowerOutputs();
    assert.equal(controlled.circuitGateEnabled, false);
    assert.equal(controlled.enabled, false);
    assert.equal(neighbour.enabled, true);

    const elapsedBefore = controlled.sequenceElapsedSeconds;
    controlled.update(0.35);
    assert.ok(controlled.sequenceElapsedSeconds > elapsedBefore);
    assert.equal(controlled.enabled, false);
    assert.equal(neighbour.enabled, true);

    junction.core.setConnectionState(false);
    junction.syncPowerOutputs();
    assert.equal(controlled.circuitGateEnabled, true);
  } finally {
    junction.dispose();
    controlled.dispose();
    neighbour.dispose();
  }
});

test('development rig contains all eight device types and remains resource-stable across repeated reset', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const targets = new ElectricalTargetRegistry(world);
  let failures = 0;
  const rig = new BlackoutPoweredDeviceRig({
    collisionWorld: world,
    surfaceRegistry: surfaces,
    targetRegistry: targets,
    requestFailure: () => {
      failures += 1;
    },
  });

  try {
    assert.equal(rig.devices.size, 8);
    assert.equal(targets.size, 8);

    for (let index = 0; index < 12; index += 1) {
      rig.reset();
      assert.equal(rig.devices.size, 8);
      assert.equal(targets.size, 8);
    }

    assert.equal(failures, 0);
  } finally {
    rig.dispose();
    assert.equal(targets.size, 0);
    targets.dispose();
    assert.equal(world.colliderCount, 0);
    assert.equal(surfaces.registeredCount, 0);
  }
});
