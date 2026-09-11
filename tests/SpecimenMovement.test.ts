import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import {
  DEFAULT_KINEMATIC_BODY_CONFIG,
  KinematicBody,
} from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const DT = 1 / 60;
const SPECIMEN_RADIUS = 0.675;
const STILL = new THREE.Vector3();

test('larger Specimen body preserves normal locomotion tuning and attaches to authored sticky walls', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 10, 10));
  wall.name = 'specimen-sticky-test-wall';
  wall.userData.surfaceTag = 'sticky';
  world.register(wall);
  surfaces.register(wall);

  const body = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(
      -(SPECIMEN_RADIUS + 0.11),
      1,
      0,
    ),
    config: {
      radiusMetres: SPECIMEN_RADIUS,
      adhesionEnabled: true,
      reboundEnabled: true,
      chargedJumpEnabled: true,
    },
  });

  assert.equal(body.radiusMetres, SPECIMEN_RADIUS);
  assert.equal(
    body.maximumLocomotionSpeedMetresPerSecond,
    DEFAULT_KINEMATIC_BODY_CONFIG.maxSpeedMetresPerSecond,
  );
  assert.equal(
    body.maximumJumpChargeSeconds,
    DEFAULT_KINEMATIC_BODY_CONFIG.maximumJumpChargeSeconds,
  );

  for (let step = 0; step < 10 && !body.attached; step += 1) {
    body.update(DT, new THREE.Vector3(1, 0, 0));
  }

  assert.equal(body.attached, true);
  assert.equal(body.attachmentSurfaceName, wall.name);
  assert.equal(body.supportSurfaceTag, 'sticky');
  assert.ok(Math.abs(body.gameplayUp.x + 1) < 1e-6);

  world.unregister(wall);
  surfaces.unregister(wall);
  wall.geometry.dispose();
  const materials = Array.isArray(wall.material)
    ? wall.material
    : [wall.material];
  for (const material of materials) material.dispose();
});

test('larger Specimen body performs the existing deterministic full charged jump', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  floor.name = 'specimen-jump-test-floor';
  floor.position.y = -0.1;
  floor.userData.surfaceTag = 'default';
  world.register(floor);
  surfaces.register(floor);

  const body = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(0, SPECIMEN_RADIUS, 0),
    config: {
      radiusMetres: SPECIMEN_RADIUS,
      adhesionEnabled: true,
      reboundEnabled: true,
      chargedJumpEnabled: true,
    },
  });

  assert.equal(body.grounded, true);
  const chargeSteps = Math.ceil(body.maximumJumpChargeSeconds / DT);
  for (let step = 0; step < chargeSteps; step += 1) {
    body.update(DT, STILL, {
      pressed: step === 0,
      held: true,
      released: false,
    });
  }
  body.update(DT, STILL, {
    pressed: false,
    held: false,
    released: true,
  });

  assert.equal(body.grounded, false);
  assert.ok(Math.abs(body.lastJumpChargeFraction - 1) < 1e-9);
  assert.ok(body.lastJumpSpeedMetresPerSecond > 0);
  assert.ok(body.velocity.y > 0);

  world.unregister(floor);
  surfaces.unregister(floor);
  floor.geometry.dispose();
  const materials = Array.isArray(floor.material)
    ? floor.material
    : [floor.material];
  for (const material of materials) material.dispose();
});
