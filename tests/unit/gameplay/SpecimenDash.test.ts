import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpecimenDash, SPECIMEN_DASH } from '../../../src/combat/SpecimenDash.ts';
import { FINAL_SPECIMEN_MOVEMENT } from '../../../src/boss/FinalBossConfig.ts';
import { CollisionWorld } from '../../../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../../../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';

const dt = 1 / 60, zero = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1), up = new THREE.Vector3(0, 1, 0);

test('perfect-dodge confirmation fires once per active burst and never during recovery or after cancellation', () => {
  const dash = new SpecimenDash(); let dodges = 0;
  dash.events.on('dodged', () => dodges++);
  const controls = { enabled: true, pressed: true, cancelled: false, movement: forward, forward, up };
  assert.equal(dash.confirmDodge(), false);
  dash.update(dt, controls); assert.equal(dodges, 0, 'dashing alone is not a perfect dodge');
  assert.equal(dash.confirmDodge(), true); assert.equal(dash.confirmDodge(), false); assert.equal(dodges, 1);
  dash.update(0.3, { ...controls, pressed: false }); assert.equal(dash.confirmDodge(), false);
  dash.update(1, controls); assert.equal(dash.confirmDodge(), true); assert.equal(dodges, 2);
  dash.cancel(); assert.equal(dash.confirmDodge(), false);
  dash.reset(); dash.update(dt, controls); assert.equal(dash.confirmDodge(), true); assert.equal(dodges, 3);
});

test('dash locks the requested direction, has a cooldown and cancels on input loss', () => {
  const dash = new SpecimenDash(); let starts = 0;
  dash.events.on('started', () => starts++);
  const controls = { enabled: true, pressed: true, cancelled: false, movement: new THREE.Vector3(1, 0, 0), forward, up };
  dash.update(dt, controls); assert.equal(starts, 1); assert.equal(dash.readModel.active, true);
  controls.pressed = false; controls.movement.set(0, 0, -1); dash.update(dt, controls);
  assert.equal(dash.movementDirection.x, 1, 'turning input cannot bend a dash in progress');
  for (let i = 0; i < 15; i++) dash.update(dt, controls);
  controls.pressed = true; dash.update(dt, controls); assert.equal(starts, 1, 'recovery rejects another press');
  controls.pressed = false; for (let i = 0; i < 75; i++) dash.update(dt, controls);
  controls.pressed = true; controls.movement.set(0, 0, 0); dash.update(dt, controls);
  assert.equal(starts, 2); assert.equal(dash.movementDirection.z, -1, 'stationary dash uses the facing direction');
  controls.enabled = false; dash.update(dt, controls); assert.equal(dash.readModel.active, false);
  dash.reset(); assert.equal(dash.readModel.cooldownProgress, 1);
});

test('a fast dash sweeps against thin walls and leaves airborne gravity unchanged', () => {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 100, 100)); wall.position.x = 5;
  world.register(wall); surfaces.register(wall);
  const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(0, 20, 0), config: FINAL_SPECIMEN_MOVEMENT });
  const reference = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(-20, 20, 0), config: FINAL_SPECIMEN_MOVEMENT });
  const dash = new SpecimenDash(); let maximumSpeed = 0;
  try {
    for (let i = 0; i < 16; i++) {
      dash.update(dt, { enabled: true, pressed: i === 0, cancelled: false, movement: new THREE.Vector3(1, 0, 0), forward, up });
      body.update(dt, dash.readModel.active ? dash.movementDirection : zero, undefined, dash.locomotion);
      reference.update(dt, zero);
      maximumSpeed = Math.max(maximumSpeed, body.velocity.x);
      assert.ok(body.position.x <= 5 - 0.05 - body.radiusMetres + 0.001, 'continuous collision stops the burst');
      assert.ok(Math.abs(body.position.y - reference.position.y) < 1e-8, 'dash adds no vertical impulse or float');
    }
    assert.ok(maximumSpeed > body.maximumLocomotionSpeedMetresPerSecond * 1.7);
    assert.equal(body.maximumLocomotionSpeedMetresPerSecond, FINAL_SPECIMEN_MOVEMENT.maxSpeedMetresPerSecond);
  } finally { world.clear(); surfaces.clear(); wall.geometry.dispose(); (wall.material as THREE.Material).dispose(); }
});

test('the stronger burst clears more than seven metres without extending its cooldown or adding lift', () => {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry(), dash = new SpecimenDash();
  const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(0, 30, 0), config: FINAL_SPECIMEN_MOVEMENT });
  const step = 1 / 120;
  try {
    for (let i = 0; i < Math.ceil(SPECIMEN_DASH.durationSeconds / step); i++) {
      dash.update(step, { enabled: true, pressed: i === 0, cancelled: false, movement: forward, forward, up });
      body.update(step, dash.movementDirection, undefined, dash.locomotion);
    }
    assert.ok(-body.position.z > 7); assert.ok(body.position.y < 30);
    assert.equal(SPECIMEN_DASH.cooldownSeconds, 1.2);
  } finally { world.clear(); surfaces.clear(); }
});
