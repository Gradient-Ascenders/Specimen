import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpecimenDash } from '../src/combat/SpecimenDash.ts';
import { FINAL_SPECIMEN_MOVEMENT } from '../src/boss/FinalBossConfig.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const dt = 1 / 60, zero = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1), up = new THREE.Vector3(0, 1, 0);

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
