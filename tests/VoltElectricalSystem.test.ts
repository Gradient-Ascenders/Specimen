import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  ElectricalTargetRegistry,
  type ElectricalConnectionTarget,
} from '../src/abilities/ElectricalTargetRegistry.ts';
import {
  DEFAULT_VOLT_ELECTRICAL_CONFIG,
  VoltElectricalSystem,
  type VoltElectricalControls,
} from '../src/abilities/VoltElectricalSystem.ts';
import {
  ColliderTransformMode,
  CollisionLayer,
  CollisionWorld,
} from '../src/physics/CollisionWorld.ts';

class TestBody {
  readonly position = new THREE.Vector3();
  readonly radiusMetres = 0.45;
}

class TestManager {
  activeSlimeId: 'bob' | 'goop' | 'volt' = 'volt';
  readonly volt = new TestBody();

  getBody(id: 'volt'): TestBody | undefined {
    return id === 'volt' ? this.volt : undefined;
  }

  canActiveUseAbility(ability: 'electrical'): boolean {
    return ability === 'electrical' && this.activeSlimeId === 'volt';
  }
}

class TestTarget implements ElectricalConnectionTarget {
  readonly id: string;
  readonly displayName: string;
  readonly mesh: THREE.Mesh;
  readonly hitMeshes: readonly THREE.Mesh[];
  available = true;
  connected = false;
  connectionWrites: boolean[] = [];

  constructor(
    id: string,
    displayName: string,
    mesh: THREE.Mesh,
  ) {
    this.id = id;
    this.displayName = displayName;
    this.mesh = mesh;
    this.hitMeshes = [mesh];
  }

  copySocketWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    target.set(0, 0, 0);
    return this.mesh.localToWorld(target);
  }

  isAvailable(): boolean {
    return this.available;
  }

  setConnectionState(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.connectionWrites.push(connected);
  }
}

const controls = (
  overrides: Partial<VoltElectricalControls> = {},
): VoltElectricalControls => ({
  aimHeld: false,
  fireHeld: false,
  firePressed: false,
  gameplayInputEnabled: true,
  pointerLocked: true,
  ...overrides,
});

function makeFixture(targetZ = 10) {
  const world = new CollisionWorld();
  const registry = new ElectricalTargetRegistry(world);
  const manager = new TestManager();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.name = 'electrical-test-target';
  mesh.position.set(0, 0, targetZ);
  const target = new TestTarget('target', 'Test Terminal', mesh);
  const unregister = registry.register(target, {
    transformMode: ColliderTransformMode.Dynamic,
  });
  const aimOrigin = new THREE.Vector3();
  const aimDirection = new THREE.Vector3(0, 0, 1);
  const system = new VoltElectricalSystem({
    slimeManager: manager,
    collisionWorld: world,
    targetRegistry: registry,
    aimRayProvider: {
      copyAimRay: (origin, direction) => {
        origin.copy(aimOrigin);
        direction.copy(aimDirection);
      },
    },
  });

  return {
    world,
    registry,
    manager,
    mesh,
    target,
    unregister,
    aimOrigin,
    aimDirection,
    system,
    dispose: () => {
      system.dispose();
      registry.dispose();
      mesh.geometry.dispose();
    },
  };
}

test('Volt acquires continuously, release preserves, and a fresh LMB press disconnects without same-step reconnect', () => {
  const fixture = makeFixture();
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);
    assert.equal(fixture.target.connected, true);
    assert.equal(fixture.system.readModel.connectedTargetId, 'target');

    fixture.system.update(1 / 60, controls());
    assert.equal(fixture.system.connected, true);

    fixture.system.update(1 / 60, controls({
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.target.connected, false);

    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
    }));
    assert.equal(fixture.system.connected, false);

    fixture.system.update(1 / 60, controls());
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);
    assert.deepEqual(fixture.target.connectionWrites, [true, false, true]);
  } finally {
    fixture.dispose();
  }
});

test('Bob and Goop cannot aim or operate Volt, while an established tether survives switching, camera motion, and later obstruction', () => {
  const fixture = makeFixture(10);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5));
  blocker.position.z = 5;
  try {
    fixture.manager.activeSlimeId = 'bob';
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.system.readModel.aimActive, false);

    fixture.manager.activeSlimeId = 'volt';
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);
    fixture.system.update(1 / 60, controls());

    fixture.world.register(
      blocker,
      CollisionLayer.LineOfSight,
      ColliderTransformMode.Static,
    );
    fixture.manager.activeSlimeId = 'goop';
    fixture.mesh.position.z = 16;
    fixture.aimDirection.set(1, 0, 0);
    fixture.system.update(1 / 60, controls());

    assert.equal(fixture.system.connected, true);
    assert.equal(fixture.target.connected, true);
    assert.equal(fixture.system.readModel.connectedTargetId, 'target');
    assert.equal(fixture.system.readModel.connectionUnstable, true);
  } finally {
    blocker.geometry.dispose();
    fixture.dispose();
  }
});

test('a tether tolerates parked-body jitter and switching, but breaks on cumulative Volt movement from the latch point', () => {
  const fixture = makeFixture(10);
  const disconnects: string[] = [];
  fixture.system.events.on('disconnected', ({ reason }) => {
    disconnects.push(reason);
  });
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);

    // Switching away and looking around do not affect the latched tether.
    fixture.manager.activeSlimeId = 'goop';
    fixture.manager.volt.position.x = 0.04;
    fixture.aimDirection.set(1, 0, 0);
    fixture.system.update(1 / 60, controls());
    fixture.manager.volt.position.x = -0.07;
    fixture.system.update(1 / 60, controls({ pointerLocked: false }));
    assert.equal(fixture.system.connected, true);
    assert.deepEqual(disconnects, []);

    // Slow per-step movement accumulates against the latch point instead of
    // resetting the tolerance each frame.
    fixture.manager.volt.position.x = 0.05;
    fixture.system.update(1 / 60, controls());
    assert.equal(fixture.system.connected, true);
    fixture.manager.volt.position.x = 0.10;
    fixture.system.update(1 / 60, controls());
    assert.equal(fixture.system.connected, true);
    fixture.manager.volt.position.x = 0.13;
    fixture.system.update(1 / 60, controls());

    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.target.connected, false);
    assert.deepEqual(disconnects, ['movement']);
  } finally {
    fixture.dispose();
  }
});

test('acquisition and tether boundaries are exact at 15, 16, and 20 metres', () => {
  const fixture = makeFixture(DEFAULT_VOLT_ELECTRICAL_CONFIG.acquisitionRangeMetres);
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);

    fixture.system.update(1 / 60, controls());
    fixture.mesh.position.z =
      DEFAULT_VOLT_ELECTRICAL_CONFIG.instabilityWarningRangeMetres;
    fixture.system.update(1 / 60, controls());
    assert.equal(fixture.system.connected, true);
    assert.equal(fixture.system.readModel.connectionUnstable, true);

    fixture.mesh.position.z =
      DEFAULT_VOLT_ELECTRICAL_CONFIG.tetherBreakRangeMetres;
    fixture.system.update(1 / 60, controls());
    assert.equal(fixture.system.connected, true);

    fixture.mesh.position.z =
      DEFAULT_VOLT_ELECTRICAL_CONFIG.tetherBreakRangeMetres + 0.001;
    fixture.system.update(1 / 60, controls());
    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.target.connected, false);
  } finally {
    fixture.dispose();
  }

  const beyond = makeFixture(
    DEFAULT_VOLT_ELECTRICAL_CONFIG.acquisitionRangeMetres + 0.01,
  );
  try {
    beyond.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(beyond.system.connected, false);
    assert.equal(beyond.system.readModel.selectedTargetValid, false);
  } finally {
    beyond.dispose();
  }
});

test('camera selection and Volt-to-socket LOS are both required only at acquisition', () => {
  const fixture = makeFixture(10);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2, 0.6));
  blocker.position.set(0, 0, 5);
  fixture.world.register(
    blocker,
    CollisionLayer.LineOfSight,
    ColliderTransformMode.Static,
  );
  try {
    // Camera sees around the narrow blocker while Volt's body-origin ray does not.
    fixture.aimOrigin.set(2, 0, 0);
    fixture.aimDirection.set(-2, 0, 10).normalize();
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));

    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.system.readModel.selectedTargetId, 'target');
    assert.equal(fixture.system.readModel.selectedTargetValid, false);
    assert.ok(fixture.system.readModel.beamEnd.z < 6);
  } finally {
    blocker.geometry.dispose();
    fixture.dispose();
  }
});

test('target removal disconnects immediately and a replacement with the same ID never inherits the old tether', () => {
  const fixture = makeFixture();
  const replacementMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  replacementMesh.position.z = 9;
  const replacement = new TestTarget(
    'target',
    'Replacement Terminal',
    replacementMesh,
  );
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);

    fixture.unregister();
    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.target.connected, false);

    const unregisterReplacement = fixture.registry.register(replacement);
    try {
      assert.equal(fixture.system.connected, false);
      assert.equal(replacement.connected, false);
      fixture.system.update(1 / 60, controls());
      assert.equal(fixture.system.connected, false);
    } finally {
      unregisterReplacement();
    }
  } finally {
    replacementMesh.geometry.dispose();
    fixture.dispose();
  }
});

test('disabled targets invalidate a live connection and held fire cannot reconnect until release', () => {
  const fixture = makeFixture();
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);

    fixture.target.available = false;
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
    }));
    assert.equal(fixture.system.connected, false);

    fixture.target.available = true;
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
    }));
    assert.equal(fixture.system.connected, false);

    fixture.system.update(1 / 60, controls());
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);
  } finally {
    fixture.dispose();
  }
});

test('invalid range configuration is rejected', () => {
  const fixture = makeFixture();
  try {
    assert.throws(
      () => new VoltElectricalSystem({
        slimeManager: fixture.manager,
        collisionWorld: fixture.world,
        targetRegistry: fixture.registry,
        aimRayProvider: {
          copyAimRay: () => {},
        },
        config: {
          acquisitionRangeMetres: 17,
          instabilityWarningRangeMetres: 16,
          tetherBreakRangeMetres: 20,
        },
      }),
      /ordered acquisition <= warning <= break/,
    );
  } finally {
    fixture.dispose();
  }
});


test('pause-style aim cancellation preserves the tether while reset clears it idempotently', () => {
  const fixture = makeFixture();
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);

    fixture.system.cancelAim();
    assert.equal(fixture.system.connected, true);
    assert.equal(fixture.system.readModel.aimActive, false);

    fixture.system.reset('death');
    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.target.connected, false);
    assert.deepEqual(fixture.target.connectionWrites, [true, false]);

    fixture.system.reset('reset');
    assert.deepEqual(fixture.target.connectionWrites, [true, false]);
  } finally {
    fixture.dispose();
  }
});


test('camera-world obstruction clips search and prevents acquiring a target behind it', () => {
  const fixture = makeFixture(10);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5));
  blocker.position.z = 5;
  fixture.world.register(
    blocker,
    CollisionLayer.LineOfSight,
    ColliderTransformMode.Static,
  );

  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));

    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.system.readModel.selectedTargetId, undefined);
    assert.equal(fixture.system.readModel.beamMode, 'search');
    assert.ok(fixture.system.readModel.beamEnd.z < 6);
  } finally {
    blocker.geometry.dispose();
    fixture.dispose();
  }
});

test('unregistered lookalike geometry is never electrically compatible', () => {
  const world = new CollisionWorld();
  const registry = new ElectricalTargetRegistry(world);
  const manager = new TestManager();
  const lookalike = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  lookalike.name = 'yellow-terminal-looking-mesh';
  lookalike.position.z = 8;
  world.register(
    lookalike,
    CollisionLayer.LineOfSight,
    ColliderTransformMode.Static,
  );
  const system = new VoltElectricalSystem({
    slimeManager: manager,
    collisionWorld: world,
    targetRegistry: registry,
    aimRayProvider: {
      copyAimRay: (origin, direction) => {
        origin.set(0, 0, 0);
        direction.set(0, 0, 1);
      },
    },
  });

  try {
    system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(system.connected, false);
    assert.equal(system.readModel.selectedTargetId, undefined);
  } finally {
    system.dispose();
    registry.dispose();
    lookalike.geometry.dispose();
  }
});

test('pointer lock loss cancels search without breaking an established connection', () => {
  const fixture = makeFixture();
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);

    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      pointerLocked: false,
    }));
    assert.equal(fixture.system.connected, true);
    assert.equal(fixture.system.readModel.aimActive, false);
    assert.equal(fixture.system.readModel.searching, false);
  } finally {
    fixture.dispose();
  }
});


test('input-free revalidation breaks a tether moved beyond range without advancing search state', () => {
  const fixture = makeFixture(10);
  try {
    fixture.system.update(1 / 60, controls({
      aimHeld: true,
      fireHeld: true,
      firePressed: true,
    }));
    assert.equal(fixture.system.connected, true);

    fixture.system.update(1 / 60, controls());
    assert.equal(fixture.system.readModel.searching, false);
    assert.equal(fixture.system.readModel.aimActive, false);

    fixture.mesh.position.z =
      DEFAULT_VOLT_ELECTRICAL_CONFIG.tetherBreakRangeMetres + 0.1;
    fixture.system.revalidateConnection();

    assert.equal(fixture.system.connected, false);
    assert.equal(fixture.target.connected, false);
    assert.equal(fixture.system.readModel.searching, false);
    assert.equal(fixture.system.readModel.aimActive, false);
  } finally {
    fixture.dispose();
  }
});
