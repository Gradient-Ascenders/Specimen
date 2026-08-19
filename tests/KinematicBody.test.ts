import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { EventBus } from '../src/core/EventBus.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { MovementEvents } from '../src/physics/MovementEvents.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const FIXED_DELTA_SECONDS = 1 / 60;
const EPSILON = 1e-10;

interface AttachedBodyFixture {
  body: KinematicBody;
  events: EventBus<MovementEvents>;
  wall: THREE.Mesh;
}

function createAttachedBody(): AttachedBodyFixture {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const events = new EventBus<MovementEvents>();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 10, 10));
  wall.name = 'test-sticky-wall';
  wall.userData.surfaceTag = 'sticky';
  world.register(wall);
  surfaces.register(wall);

  const body = new KinematicBody({
    world,
    surfaces,
    events,
    initialPosition: new THREE.Vector3(-0.56, 0, 0),
  });
  body.update(FIXED_DELTA_SECONDS, 1, 0);
  assert.equal(body.attached, true);

  return { body, events, wall };
}

function beginWallJump(body: KinematicBody): void {
  body.update(FIXED_DELTA_SECONDS, 0, 0, {
    pressed: true,
    held: true,
    released: false,
  });
}

test('wall jump event reports the pre-detach launch direction', () => {
  const { body, events, wall } = createAttachedBody();
  const attachedUp = new THREE.Vector3(
    body.gameplayUp.x,
    body.gameplayUp.y,
    body.gameplayUp.z,
  );
  const reportedDirection = new THREE.Vector3();

  events.on('jumped', (event) => {
    reportedDirection.set(
      event.directionWorld.x,
      event.directionWorld.y,
      event.directionWorld.z,
    );
  });

  beginWallJump(body);
  body.update(FIXED_DELTA_SECONDS, 0, 0, {
    pressed: false,
    held: false,
    released: true,
  });

  assert.equal(body.attached, false);
  assert.ok(reportedDirection.distanceTo(attachedUp) < EPSILON);
  assert.ok(
    body.velocity.x * attachedUp.x +
      body.velocity.y * attachedUp.y +
      body.velocity.z * attachedUp.z > 0,
  );

  wall.geometry.dispose();
});

test('wall jump release keeps the step-start wall movement basis', () => {
  const idleFixture = createAttachedBody();
  const forwardFixture = createAttachedBody();
  beginWallJump(idleFixture.body);
  beginWallJump(forwardFixture.body);

  const release = {
    pressed: false,
    held: false,
    released: true,
  } as const;
  idleFixture.body.update(FIXED_DELTA_SECONDS, 0, 0, release);
  // W is wall-up on this wall. It must not be reinterpreted as world -Z after
  // jump handling detaches the body earlier in the same fixed step.
  forwardFixture.body.update(FIXED_DELTA_SECONDS, 0, -1, release);

  const idleVelocity = new THREE.Vector3(
    idleFixture.body.velocity.x,
    idleFixture.body.velocity.y,
    idleFixture.body.velocity.z,
  );
  const forwardVelocity = new THREE.Vector3(
    forwardFixture.body.velocity.x,
    forwardFixture.body.velocity.y,
    forwardFixture.body.velocity.z,
  );
  assert.ok(forwardVelocity.distanceTo(idleVelocity) < EPSILON);

  idleFixture.wall.geometry.dispose();
  forwardFixture.wall.geometry.dispose();
});
