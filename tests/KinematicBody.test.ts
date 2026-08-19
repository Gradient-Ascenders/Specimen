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
const NO_MOVEMENT = new THREE.Vector3();

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
  body.update(FIXED_DELTA_SECONDS, new THREE.Vector3(1, 0, 0));
  assert.equal(body.attached, true);

  return { body, events, wall };
}

function beginWallJump(body: KinematicBody): void {
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
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
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
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
  idleFixture.body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, release);
  // The camera has already resolved this as a world-space tangent direction.
  // Jump detachment must keep using the step-start wall plane rather than
  // projecting it away against world-up midway through the fixed step.
  forwardFixture.body.update(
    FIXED_DELTA_SECONDS,
    new THREE.Vector3(0, 1, 0),
    release,
  );

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
  assert.ok(forwardVelocity.y > idleVelocity.y);
  assert.ok(Math.abs(forwardVelocity.z - idleVelocity.z) < EPSILON);

  idleFixture.wall.geometry.dispose();
  forwardFixture.wall.geometry.dispose();
});

test('authored sticky wall carries movement across its top edge', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 4));
  wall.name = 'sticky-wall-with-top';
  wall.position.y = 1;
  wall.userData.surfaceTag = 'sticky';
  world.register(wall);
  surfaces.register(wall);

  const body = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(-0.56, 1.2, 0),
  });
  body.update(FIXED_DELTA_SECONDS, new THREE.Vector3(1, 0, 0));
  assert.equal(body.attached, true);

  let crossedTop = false;
  for (let step = 0; step < 120; step += 1) {
    body.update(FIXED_DELTA_SECONDS, new THREE.Vector3(0, 1, 0));
    if (body.grounded && !body.attached && body.groundNormal.y > 0.99) {
      crossedTop = true;
      break;
    }
  }

  assert.equal(crossedTop, true);
  assert.equal(body.supportSurfaceTag, 'sticky');
  assert.ok(body.position.y > 2.4);
  assert.ok(body.velocity.x > 0);
  assert.ok(Math.abs(body.gameplayUp.y - 1) < EPSILON);

  wall.geometry.dispose();
});
