import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { BLACKOUT_BOSS_STAGING_CHECKPOINT, BlackoutBossStaging } from '../src/levels/BlackoutBossStaging.ts';
import { CollisionHit, CollisionWorld, ColliderTransformMode } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const DT = 1 / 60;

function makeFixture() {
  const bay = new BlackoutMaintenanceBay();
  const transit = new BlackoutTransitRoom();
  const staging = new BlackoutBossStaging();
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const meshes = [...bay.collisionMeshes, ...transit.collisionMeshes, ...staging.collisionMeshes];
  world.registerAll(meshes, undefined, ColliderTransformMode.Static);
  surfaces.registerAll(meshes);

  const createBody = (position: THREE.Vector3, bob = false) => new KinematicBody({
    world,
    surfaces,
    initialPosition: position,
    config: {
      adhesionEnabled: bob,
      reboundEnabled: false,
      chargedJumpEnabled: bob,
    },
  });

  return {
    bay,
    transit,
    staging,
    world,
    surfaces,
    createBody,
    dispose() {
      bay.dispose();
      transit.dispose();
      staging.dispose();
      world.clear();
      surfaces.clear();
    },
  };
}

function walkTo(body: KinematicBody, x: number, z: number, options: { maxSteps?: number } = {}): void {
  const maxSteps = options.maxSteps ?? 360;
  const direction = new THREE.Vector3();
  for (let i = 0; i < maxSteps; i += 1) {
    const dx = x - body.position.x;
    const dz = z - body.position.z;
    if (Math.hypot(dx, dz) < 0.18 && body.grounded) break;
    direction.set(dx, 0, dz).normalize();
    body.update(DT, direction);
  }
  assert.equal(body.grounded, true,
    `body should finish supported near (${x}, ${z}); actual=${JSON.stringify(body.position)}, lastHit=${body.lastCollisionName}`);
  assert.ok(Math.hypot(x - body.position.x, z - body.position.z) < 0.85,
    `body should walk to (${x}, ${z}); actual=${JSON.stringify(body.position)}, lastHit=${body.lastCollisionName}`);
}

test('Bob and Goop can walk from Room 1 through the main hall into Room 2 without jumping', () => {
  const s = makeFixture();
  try {
    assert.equal(s.bay.vestibuleAt({ x: 6, y: 0.46, z: 70 }), true,
      'the Room 1 main doorway should remain the Bob/Goop exit');
    assert.ok(s.transit.collisionMeshes.some((mesh) => mesh.name === 'transit-entry-platform'));

    for (const [id, x] of [['Bob', 5], ['Goop', 7]] as const) {
      const body = s.createBody(new THREE.Vector3(x, 0.46, 56), id === 'Bob');
      body.update(DT, new THREE.Vector3());
      assert.equal(body.grounded, true, `${id} starts on the main corridor floor`);
      walkTo(body, x, 83);
      assert.equal(body.supportColliderName, 'transit-entry-platform',
        `${id} must enter Room 2 onto its real entry pad, not walk through the shell`);
      assert.equal(body.lastJumpChargeFraction, 0,
        `${id} must be able to follow the hallway ramp without a jump`);
    }
  } finally {
    s.dispose();
  }
});

test('Volt can traverse the separated vent, west turn, rising duct, and Room 2 side catwalk normally', () => {
  const s = makeFixture();
  try {
    const volt = s.createBody(new THREE.Vector3(-6, 0.46, 52));
    volt.update(DT, new THREE.Vector3());
    assert.equal(volt.grounded, true, 'Volt starts at the Room 1 vent approach');

    walkTo(volt, -6, 58.8);
    walkTo(volt, -15.75, 61.5);
    walkTo(volt, -16, 69.5);
    walkTo(volt, -16, 83);
    assert.equal(volt.supportColliderName, 'volt-catwalk-entry-extension',
      'the rising duct must land on the physical side-catwalk extension');
    assert.ok(volt.position.y > 2.5,
      `Volt should arrive at catwalk height via the ramp, not teleport: ${JSON.stringify(volt.position)}`);
    walkTo(volt, -16, 87);
    assert.equal(volt.supportColliderName, 'volt-service-catwalk');
    assert.equal(volt.lastJumpChargeFraction, 0,
      'the entire maintenance-vent path should use ordinary walking, without a jump');
  } finally {
    s.dispose();
  }
});

test('all three slimes can walk under the crate-propped Room 2 door through the hallway to boss staging', () => {
  const s = makeFixture();
  try {
    for (const id of ['bob', 'goop', 'volt'] as const) {
      const body = s.createBody(new THREE.Vector3(0, 0.86, 151), id === 'bob');
      const destination = BLACKOUT_BOSS_STAGING_CHECKPOINT.bodyPositions[id];
      walkTo(body, 0, destination.z, { maxSteps: 600 });
      assert.equal(body.supportColliderName, 'boss-staging-floor');
      assert.equal(body.lastJumpChargeFraction, 0, 'no jump is needed through the half-closed door');
      assert.ok(body.position.y > 0.8 && body.position.y < 1, 'the entire route stays level');
    }
  } finally { s.dispose(); }
});

test('Volt’s narrow Room 1 vent is solidly separated from the main Bob/Goop corridor', () => {
  const s = makeFixture();
  try {
    const hit = new CollisionHit();
    assert.equal(s.world.sweepSphere(
      new THREE.Vector3(-6, 1.1, 57),
      new THREE.Vector3(3, 0, 0),
      0.45,
      hit,
    ), true, 'the duct side wall must prevent crossing into the main hall');
    assert.equal(hit.object?.name, 'vent-duct-east-wall');

    const broadDoorHit = new CollisionHit();
    assert.equal(s.world.sweepSphere(
      new THREE.Vector3(6, 0.46, 53),
      new THREE.Vector3(0, 0, 3),
      0.45,
      broadDoorHit,
    ), false, 'the wide main doorway must stay unobstructed for Bob and Goop');

    const room2EntryHit = new CollisionHit();
    assert.equal(s.world.sweepSphere(
      // Keep this aperture-only sweep above the rising floor so it isolates
      // wall clearance rather than intentionally touching the raised ramp.
      new THREE.Vector3(6, 1.2, 78.5),
      new THREE.Vector3(0, 0, 3),
      0.45,
      room2EntryHit,
    ), false, 'the Room 2 main entrance must align with the corridor opening');
  } finally {
    s.dispose();
  }
});
