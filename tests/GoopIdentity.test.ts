import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { getSlimeDefinition } from '../src/slimes/SlimeRoster.ts';

test('Goop retains normal jump, acid and radiation identity without charge, adhesion, rebound or electrical power', () => {
  const definition = getSlimeDefinition('goop');
  assert.equal(definition.jumpMode, 'normal');
  assert.deepEqual(definition.abilities, { adhesion: false, rebound: false, dissolve: true, electrical: false });
  assert.equal(definition.hazardResponses.radiation, 'immune');
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20));
  floor.position.y = -0.5; floor.userData.surfaceTag = 'sticky';
  floor.updateWorldMatrix(true, false); world.register(floor); surfaces.register(floor);
  const body = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(0, 0.46, 0),
    config: { adhesionEnabled: definition.abilities.adhesion, reboundEnabled: definition.abilities.rebound,
      chargedJumpEnabled: definition.jumpMode === 'charged' } });
  const movement = new THREE.Vector3();
  body.update(1 / 60, movement, { pressed: true, held: true, released: false });
  assert.equal(body.chargingJump, false); assert.equal(body.chargeFraction, 0); assert.ok(body.velocity.y > 0);
  for (let i = 0; i < 180; i++) body.update(1 / 60, movement, { pressed: false, held: true, released: false });
  assert.equal(body.grounded, true); assert.equal(body.attached, false);
  assert.equal(body.lastBounceSpeedMetresPerSecond, 0);
  floor.geometry.dispose(); (floor.material as THREE.Material).dispose(); world.clear(); surfaces.clear();
});
