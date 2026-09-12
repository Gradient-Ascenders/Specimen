import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionLayer, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { MaintenanceDroneController } from '../src/vehicles/MaintenanceDroneController.ts';
import { MaintenanceDroneDevelopmentFixture } from '../src/vehicles/MaintenanceDroneDevelopmentFixture.ts';
import { MaintenanceDroneFlightBody } from '../src/vehicles/MaintenanceDroneFlightBody.ts';

const DT = 1 / 60;
const STILL = new THREE.Vector3();

function createFloor(world: CollisionWorld): THREE.Mesh {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 30));
  floor.name = 'maintenance-drone-test-floor';
  floor.position.y = -0.1;
  world.register(floor);
  return floor;
}

function createVolt(
  world: CollisionWorld,
  surfaces: SurfaceRegistry,
  position = new THREE.Vector3(3, 0.46, 2),
): KinematicBody {
  return new KinematicBody({
    world,
    surfaces,
    initialPosition: position,
    config: {
      movementCollisionMask:
        CollisionLayer.Movement |
        CollisionLayer.MaintenanceDroneSupport,
      adhesionEnabled: false,
      reboundEnabled: false,
      chargedJumpEnabled: false,
    },
  });
}

function createControllerFixture() {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const floor = createFloor(world);
  surfaces.register(floor);
  const authoring = new MaintenanceDroneDevelopmentFixture();
  const volt = createVolt(world, surfaces);
  const controller = new MaintenanceDroneController({
    world,
    authoring: authoring.authoring,
    voltRadiusMetres: volt.radiusMetres,
    isVoltPlacementSafe: () => true,
  });
  return {
    world,
    surfaces,
    floor,
    authoring,
    volt,
    controller,
    dispose: () => {
      controller.dispose();
      authoring.dispose();
      world.unregister(floor);
      surfaces.unregister(floor);
      floor.geometry.dispose();
      const materials = Array.isArray(floor.material)
        ? floor.material
        : [floor.material];
      for (const material of materials) material.dispose();
    },
  };
}

test('only Volt can mount and first startup/tutorial fire exactly once', () => {
  const fixture = createControllerFixture();
  let startupStarted = 0;
  let startupCompleted = 0;
  let tutorial = 0;
  fixture.controller.events.on('startupStarted', () => startupStarted += 1);
  fixture.controller.events.on('startupCompleted', () => startupCompleted += 1);
  fixture.controller.events.on('firstMountTutorialRequested', () => tutorial += 1);

  try {
    assert.equal(
      fixture.controller.updateMountAvailability(
        'bob',
        fixture.volt.position,
        true,
      ),
      false,
    );
    assert.equal(
      fixture.controller.requestMount('bob', fixture.volt.position),
      false,
    );
    assert.equal(
      fixture.controller.requestMount('goop', fixture.volt.position),
      false,
    );

    assert.equal(
      fixture.controller.updateMountAvailability(
        'volt',
        fixture.volt.position,
        true,
      ),
      true,
    );
    assert.equal(
      fixture.controller.requestMount('volt', fixture.volt.position),
      true,
    );
    assert.equal(fixture.controller.readModel.state, 'starting');
    assert.equal(startupStarted, 1);

    for (let step = 0; step < 90; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
      fixture.controller.syncMountedVolt(fixture.volt);
    }

    assert.equal(fixture.controller.readModel.state, 'mounted');
    assert.equal(fixture.controller.readModel.startupCompleted, true);
    assert.equal(fixture.controller.readModel.tutorialCompleted, true);
    assert.equal(startupCompleted, 1);
    assert.equal(tutorial, 1);

    assert.equal(fixture.controller.requestDismount(fixture.volt), true);
    for (let step = 0; step < 120; step += 1) {
      fixture.volt.update(DT, STILL);
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
      fixture.controller.applyFallingSupportToVolt(fixture.volt);
      if (fixture.controller.readModel.state === 'grounded-idle') break;
    }
    assert.equal(fixture.controller.readModel.state, 'grounded-idle');

    fixture.volt.recoverAt(new THREE.Vector3(3, 0.46, 2));
    assert.equal(
      fixture.controller.requestMount('volt', fixture.volt.position),
      true,
    );
    assert.equal(fixture.controller.readModel.state, 'mounted');
    assert.equal(startupStarted, 1);
    assert.equal(startupCompleted, 1);
    assert.equal(tutorial, 1);
  } finally {
    fixture.dispose();
  }
});

test('powered flight is bounded, deterministic, upright, and aim freezes drift', () => {
  const fixture = createControllerFixture();

  try {
    fixture.controller.requestMount('volt', fixture.volt.position);
    for (let step = 0; step < 90; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
    }

    const before = new THREE.Vector3(
      fixture.controller.readModel.position.x,
      fixture.controller.readModel.position.y,
      fixture.controller.readModel.position.z,
    );
    for (let step = 0; step < 180; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: new THREE.Vector3(1, 0, 1),
        ascendHeld: step < 60,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
    }
    assert.ok(
      fixture.controller.readModel.horizontalSpeed <= 5.5 + 1e-9,
    );
    assert.ok(
      Math.abs(fixture.controller.readModel.verticalSpeed) <= 4 + 1e-9,
    );
    assert.ok(
      new THREE.Vector3(
        fixture.controller.readModel.position.x,
        fixture.controller.readModel.position.y,
        fixture.controller.readModel.position.z,
      ).distanceTo(before) > 1,
    );
    assert.ok(Math.abs(fixture.authoring.droneRoot.rotation.x) < 1e-12);
    assert.ok(Math.abs(fixture.authoring.droneRoot.rotation.z) < 1e-12);

    const beforeAim = {
      x: fixture.controller.readModel.position.x,
      y: fixture.controller.readModel.position.y,
      z: fixture.controller.readModel.position.z,
    };
    fixture.controller.update(DT, {
      horizontalDirection: new THREE.Vector3(1, 0, 0),
      ascendHeld: true,
      descendHeld: false,
      aimHeld: true,
      controllingVolt: true,
    });
    assert.deepEqual(
      [
        fixture.controller.readModel.position.x,
        fixture.controller.readModel.position.y,
        fixture.controller.readModel.position.z,
      ],
      [beforeAim.x, beforeAim.y, beforeAim.z],
    );
    assert.equal(fixture.controller.readModel.horizontalSpeed, 0);
    assert.equal(fixture.controller.readModel.verticalSpeed, 0);
  } finally {
    fixture.dispose();
  }
});

test('switch parking preserves exact pose and resuming starts from zero velocity', () => {
  const fixture = createControllerFixture();

  try {
    fixture.controller.requestMount('volt', fixture.volt.position);
    for (let step = 0; step < 90; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
    }
    fixture.controller.update(0.5, {
      horizontalDirection: new THREE.Vector3(1, 0, 0),
      ascendHeld: false,
      descendHeld: false,
      aimHeld: false,
      controllingVolt: true,
    });

    assert.equal(fixture.controller.parkForSwitch(), true);
    const parked = [
      fixture.controller.readModel.position.x,
      fixture.controller.readModel.position.y,
      fixture.controller.readModel.position.z,
    ] as const;
    assert.equal(fixture.controller.readModel.state, 'parked-hover');
    assert.equal(fixture.controller.readModel.lightEnabled, true);

    for (let step = 0; step < 120; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: new THREE.Vector3(-1, 0, 1),
        ascendHeld: true,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: false,
      });
    }
    assert.deepEqual(
      [
        fixture.controller.readModel.position.x,
        fixture.controller.readModel.position.y,
        fixture.controller.readModel.position.z,
      ],
      [...parked],
    );
    assert.equal(fixture.controller.readModel.horizontalSpeed, 0);
    assert.equal(fixture.controller.readModel.verticalSpeed, 0);

    assert.equal(fixture.controller.resumeMountedControl(), true);
    assert.equal(fixture.controller.readModel.state, 'mounted');
    fixture.controller.update(DT, {
      horizontalDirection: STILL,
      ascendHeld: false,
      descendHeld: false,
      aimHeld: false,
      controllingVolt: true,
    });
    assert.equal(fixture.controller.readModel.horizontalSpeed, 0);
    assert.equal(fixture.controller.readModel.verticalSpeed, 0);
  } finally {
    fixture.dispose();
  }
});

test('mid-air dismount is allowed, drone loses power, and supported Volt follows falling support', () => {
  const fixture = createControllerFixture();

  try {
    fixture.controller.requestMount('volt', fixture.volt.position);
    for (let step = 0; step < 90; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
      fixture.controller.syncMountedVolt(fixture.volt);
    }
    for (let step = 0; step < 45; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: true,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
      fixture.controller.syncMountedVolt(fixture.volt);
    }

    const droneYBefore = fixture.controller.readModel.position.y;
    assert.equal(fixture.controller.requestDismount(fixture.volt), true);
    assert.equal(
      fixture.controller.readModel.state,
      'unpowered-falling',
    );
    assert.equal(fixture.controller.readModel.powered, false);
    assert.equal(fixture.controller.voltMounted, false);

    let carriedDown = false;
    for (let step = 0; step < 180; step += 1) {
      fixture.volt.update(DT, STILL);
      const voltBefore = fixture.volt.position.y;
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
      fixture.controller.applyFallingSupportToVolt(fixture.volt);
      if (fixture.volt.position.y < voltBefore - 1e-5) carriedDown = true;
      if (fixture.controller.readModel.state === 'grounded-idle') break;
    }

    assert.ok(fixture.controller.readModel.position.y < droneYBefore);
    assert.equal(fixture.controller.readModel.state, 'grounded-idle');
    assert.equal(carriedDown, true);
  } finally {
    fixture.dispose();
  }
});

test('acid short and inaccessible recovery always return a usable authored drone', () => {
  const fixture = createControllerFixture();
  const recovery = new THREE.Vector3();
  fixture.authoring.recoveryAnchor.getWorldPosition(recovery);

  try {
    assert.equal(fixture.controller.requestRecovery('acid'), true);
    assert.equal(fixture.controller.readModel.state, 'shorted');
    for (let step = 0; step < 80; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: false,
      });
    }
    assert.equal(fixture.controller.readModel.state, 'damaged-idle');
    assert.ok(
      new THREE.Vector3(
        fixture.controller.readModel.position.x,
        fixture.controller.readModel.position.y,
        fixture.controller.readModel.position.z,
      ).distanceTo(recovery) < 1e-9,
    );

    assert.equal(
      fixture.controller.requestRecovery('inaccessible'),
      true,
    );
    for (let step = 0; step < 20; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: false,
      });
    }
    assert.equal(fixture.controller.readModel.state, 'damaged-idle');
  } finally {
    fixture.dispose();
  }
});

test('checkpoint snapshot preserves stable mounted/parked learning state but never transient velocity', () => {
  const fixture = createControllerFixture();

  try {
    fixture.controller.requestMount('volt', fixture.volt.position);
    for (let step = 0; step < 90; step += 1) {
      fixture.controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
    }
    fixture.controller.parkForSwitch();
    const snapshot = fixture.controller.capture();

    fixture.controller.requestRecovery('acid');
    fixture.controller.restore(snapshot);
    fixture.controller.reconcileAfterBodyRecovery('bob', fixture.volt);

    assert.equal(fixture.controller.readModel.state, 'parked-hover');
    assert.equal(fixture.controller.voltMounted, true);
    assert.equal(fixture.controller.readModel.startupCompleted, true);
    assert.equal(fixture.controller.readModel.tutorialCompleted, true);
    assert.equal(fixture.controller.readModel.horizontalSpeed, 0);
    assert.equal(fixture.controller.readModel.verticalSpeed, 0);

    fixture.controller.recoverImmediately('restart');
    const transientSnapshot = fixture.controller.capture();
    fixture.controller.restore(transientSnapshot);
    assert.equal(
      fixture.controller.readModel.state === 'damaged-idle' ||
      fixture.controller.readModel.state === 'grounded-idle',
      true,
    );
  } finally {
    fixture.dispose();
  }
});

test('authored drone clearance cannot pass a vent gap that ordinary Volt can traverse', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const left = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 0.3));
  const right = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 0.3));
  left.name = 'vent-left-frame';
  right.name = 'vent-right-frame';
  left.position.set(-2.6, 2.5, 4);
  right.position.set(2.6, 2.5, 4);
  // A 1.2 m clear opening between inner frame edges.
  left.scale.x = 1;
  right.scale.x = 1;
  world.registerAll([left, right]);
  surfaces.registerAll([left, right]);

  const droneRoot = new THREE.Group();
  droneRoot.position.set(0, 1.2, 0);
  const droneCollider = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.5, 1.65),
  );
  droneRoot.add(droneCollider);
  const flight = new MaintenanceDroneFlightBody({
    world,
    root: droneRoot,
    collider: droneCollider,
  });

  const volt = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(0, 0.46, 0),
    config: {
      adhesionEnabled: false,
      reboundEnabled: false,
      chargedJumpEnabled: false,
    },
  });

  try {
    for (let step = 0; step < 180; step += 1) {
      flight.updatePowered(
        DT,
        new THREE.Vector3(0, 0, 1),
        0,
        false,
      );
      volt.update(DT, new THREE.Vector3(0, 0, 1));
    }

    assert.ok(
      flight.position.z < 4,
      'drone clearance should contact the narrow vent frame',
    );
    assert.ok(
      volt.position.z > 4,
      'ordinary Volt-sized body should fit through the opening',
    );
  } finally {
    for (const mesh of [left, right, droneCollider]) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) material.dispose();
    }
  }
});


test('partial constructor failure unregisters an already-added drone support collider', () => {
  const world = new CollisionWorld();
  const authoring = new MaintenanceDroneDevelopmentFixture();
  const originalRegister = world.register.bind(world);
  world.register = ((mesh, layerMask, transformMode) => {
    originalRegister(mesh, layerMask, transformMode);
    if ((layerMask & CollisionLayer.MaintenanceDroneSupport) !== 0) {
      throw new Error('injected drone collider registration failure');
    }
  }) as typeof world.register;

  try {
    assert.throws(
      () => new MaintenanceDroneController({
        world,
        authoring: authoring.authoring,
        voltRadiusMetres: 0.45,
        isVoltPlacementSafe: () => true,
      }),
      /injected drone collider registration failure/,
    );
    assert.equal(
      world.colliderCount,
      0,
      'constructor rollback must not leave support collision registered',
    );
  } finally {
    authoring.dispose();
    world.clear();
  }
});

test('checkpoint capture during a parked incomplete startup normalizes to an unmounted stable recovery state', () => {
  const fixture = createControllerFixture();

  try {
    assert.equal(
      fixture.controller.requestMount('volt', fixture.volt.position),
      true,
    );
    fixture.controller.update(0.25, {
      horizontalDirection: STILL,
      ascendHeld: false,
      descendHeld: false,
      aimHeld: false,
      controllingVolt: true,
    });
    assert.equal(fixture.controller.readModel.state, 'starting');

    assert.equal(fixture.controller.parkForSwitch(), true);
    assert.equal(fixture.controller.readModel.state, 'parked-hover');
    assert.equal(fixture.controller.readModel.startupCompleted, false);

    const snapshot = fixture.controller.capture();
    fixture.controller.restore(snapshot);
    fixture.controller.reconcileAfterBodyRecovery('bob', fixture.volt);

    assert.equal(fixture.controller.voltMounted, false);
    assert.equal(fixture.controller.readModel.state, 'damaged-idle');
    assert.equal(fixture.controller.readModel.startupCompleted, false);
  } finally {
    fixture.dispose();
  }
});


test('mounted rider clearance prevents the drone from moving Volt into low ceiling geometry', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const floor = createFloor(world);
  surfaces.register(floor);
  const authoring = new MaintenanceDroneDevelopmentFixture();
  const volt = createVolt(world, surfaces);
  const controller = new MaintenanceDroneController({
    world,
    authoring: authoring.authoring,
    voltRadiusMetres: volt.radiusMetres,
    isVoltPlacementSafe: (position, radius) =>
      position.y + radius <= 1.65,
  });

  try {
    assert.equal(
      controller.requestMount('volt', volt.position),
      true,
    );

    for (let step = 0; step < 90; step += 1) {
      controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: false,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
      controller.syncMountedVolt(volt);
    }

    assert.equal(controller.readModel.state, 'mounted');
    assert.ok(
      volt.position.y + volt.radiusMetres <= 1.65 + 1e-9,
      'mounted rider must remain outside the authored ceiling clearance',
    );

    const before = controller.readModel.position.y;
    for (let step = 0; step < 30; step += 1) {
      controller.update(DT, {
        horizontalDirection: STILL,
        ascendHeld: true,
        descendHeld: false,
        aimHeld: false,
        controllingVolt: true,
      });
      controller.syncMountedVolt(volt);
    }
    assert.ok(
      controller.readModel.position.y <= before + 1e-9,
      'blocked ascent must revert instead of clipping Volt upward',
    );
  } finally {
    controller.dispose();
    authoring.dispose();
    world.unregister(floor);
    surfaces.unregister(floor);
    floor.geometry.dispose();
    const materials = Array.isArray(floor.material)
      ? floor.material
      : [floor.material];
    for (const material of materials) material.dispose();
  }
});
