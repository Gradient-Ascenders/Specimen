import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { EventBus } from '../src/core/EventBus.ts';
import {
  DEFAULT_KINEMATIC_BODY_CONFIG,
  KinematicBody,
} from '../src/physics/KinematicBody.ts';
import type { MovementEvents } from '../src/physics/MovementEvents.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const FIXED_DELTA_SECONDS = 1 / 60;
const EPSILON = 1e-10;
const NO_MOVEMENT = new THREE.Vector3();

interface AttachedBodyFixture {
  body: KinematicBody;
  events: EventBus<MovementEvents>;
  world: CollisionWorld;
  wall: THREE.Mesh;
}

interface FallingBodyFixture {
  body: KinematicBody;
  floor: THREE.Mesh;
}

test('charged jump endpoints produce approximately 25% higher apexes', () => {
  const originalMinimumJumpSpeed = 4.8;
  const originalMaximumJumpSpeed = 8.8;
  const minimumHeightRatio =
    DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond ** 2 /
    originalMinimumJumpSpeed ** 2;
  const maximumHeightRatio =
    DEFAULT_KINEMATIC_BODY_CONFIG.maximumJumpSpeedMetresPerSecond ** 2 /
    originalMaximumJumpSpeed ** 2;

  assert.ok(Math.abs(minimumHeightRatio - 1.25) < 0.01);
  assert.ok(Math.abs(maximumHeightRatio - 1.25) < 0.01);
});

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

  return { body, events, world, wall };
}

function createFallingBody(
  initialHeightMetres: number,
  config: ConstructorParameters<typeof KinematicBody>[0]['config'] = {},
): FallingBodyFixture {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  floor.name = 'ordinary-test-floor';
  floor.position.y = -0.1;
  world.register(floor);
  surfaces.register(floor);

  const body = new KinematicBody({
    world,
    surfaces,
    config,
    initialPosition: new THREE.Vector3(0, initialHeightMetres, 0),
  });

  return { body, floor };
}

function advanceUntilFloorContact(body: KinematicBody): void {
  for (let step = 0; step < 300; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
    if (body.lastContactName === 'ordinary-test-floor') return;
  }

  assert.fail('Body did not contact the ordinary test floor.');
}

function beginWallJump(body: KinematicBody): void {
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: true,
    held: true,
    released: false,
  });
}

function createSlopeBody(): { body: KinematicBody; slope: THREE.Mesh } {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const slope = new THREE.Mesh(new THREE.BoxGeometry(4, 0.35, 4));
  slope.name = 'test-slope-15-degrees';
  slope.rotation.z = -THREE.MathUtils.degToRad(15);
  slope.updateWorldMatrix(true, false);
  world.register(slope);
  surfaces.register(slope);

  const surfaceNormal = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(slope.quaternion)
    .normalize();
  const surfacePoint = new THREE.Vector3(0, 0.35 / 2, 0).applyMatrix4(
    slope.matrixWorld,
  );
  const initialPosition = surfacePoint.addScaledVector(
    surfaceNormal,
    DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres +
      DEFAULT_KINEMATIC_BODY_CONFIG.skinWidthMetres +
      0.002,
  );
  const body = new KinematicBody({
    world,
    surfaces,
    initialPosition,
  });
  assert.equal(body.grounded, true);
  assert.ok(body.groundNormal.y < 1);

  return { body, slope };
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

test('slope jump release uses the current airborne movement plane', () => {
  const idleFixture = createSlopeBody();
  const uphillFixture = createSlopeBody();
  const beginCharge = {
    pressed: true,
    held: true,
    released: false,
  } as const;
  idleFixture.body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, beginCharge);
  uphillFixture.body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, beginCharge);

  const release = {
    pressed: false,
    held: false,
    released: true,
  } as const;
  idleFixture.body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, release);
  uphillFixture.body.update(
    FIXED_DELTA_SECONDS,
    new THREE.Vector3(1, 0, 0),
    release,
  );

  const idleVelocity = new THREE.Vector3(
    idleFixture.body.velocity.x,
    idleFixture.body.velocity.y,
    idleFixture.body.velocity.z,
  );
  const uphillVelocity = new THREE.Vector3(
    uphillFixture.body.velocity.x,
    uphillFixture.body.velocity.y,
    uphillFixture.body.velocity.z,
  );
  const airControlDelta = uphillVelocity.sub(idleVelocity);

  assert.equal(idleFixture.body.grounded, false);
  assert.equal(uphillFixture.body.grounded, false);
  assert.ok(airControlDelta.x > 0);
  assert.ok(Math.abs(airControlDelta.y) < EPSILON);
  assert.ok(Math.abs(airControlDelta.z) < EPSILON);

  idleFixture.slope.geometry.dispose();
  uphillFixture.slope.geometry.dispose();
});

test('losing sticky support immediately restores authoritative world-up', () => {
  const { body, world, wall } = createAttachedBody();
  world.unregister(wall);

  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);

  assert.equal(body.attached, false);
  assert.ok(Math.abs(body.gameplayUp.x) < EPSILON);
  assert.ok(Math.abs(body.gameplayUp.y - 1) < EPSILON);
  assert.ok(Math.abs(body.gameplayUp.z) < EPSILON);

  wall.geometry.dispose();
});

test('below-threshold ordinary-floor landing does not rebound', () => {
  const configuredMinimumImpactSpeed = 15;
  const { body, floor } = createFallingBody(6, {
    slimeMinimumBounceImpactSpeedMetresPerSecond:
      configuredMinimumImpactSpeed,
  });

  advanceUntilFloorContact(body);

  assert.ok(
    body.lastContactImpactSpeedMetresPerSecond <
      configuredMinimumImpactSpeed,
  );
  assert.ok(
    body.lastContactImpactSpeedMetresPerSecond >
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeMinimumBounceImpactSpeedMetresPerSecond,
  );
  assert.equal(body.lastBounceSpeedMetresPerSecond, 0);
  assert.equal(body.grounded, true);

  floor.geometry.dispose();
});

test('ordinary-floor landing rebounds using impact times restitution', () => {
  const { body, floor } = createFallingBody(6);

  advanceUntilFloorContact(body);

  const expectedReboundSpeed =
    body.lastContactImpactSpeedMetresPerSecond *
    DEFAULT_KINEMATIC_BODY_CONFIG.slimeBounceRestitution;
  assert.ok(
    expectedReboundSpeed <
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeMaximumBounceSpeedMetresPerSecond,
  );
  assert.ok(
    Math.abs(body.lastBounceSpeedMetresPerSecond - expectedReboundSpeed) <
      EPSILON,
    `expected ${expectedReboundSpeed}, received ${body.lastBounceSpeedMetresPerSecond}`,
  );

  floor.geometry.dispose();
});

test('very large ordinary-floor impact is capped at maximum rebound speed', () => {
  const { body, floor } = createFallingBody(12);

  advanceUntilFloorContact(body);

  assert.ok(
    body.lastContactImpactSpeedMetresPerSecond *
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeBounceRestitution >
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeMaximumBounceSpeedMetresPerSecond,
  );
  assert.ok(
    Math.abs(
      body.lastBounceSpeedMetresPerSecond -
        DEFAULT_KINEMATIC_BODY_CONFIG.slimeMaximumBounceSpeedMetresPerSecond,
    ) < EPSILON,
  );

  floor.geometry.dispose();
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

test('authored sticky route carries movement around a vertical corner', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const perimeterPatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 4, 2.4),
  );
  perimeterPatch.name = 'sticky-perimeter-patch';
  perimeterPatch.position.y = 2;
  perimeterPatch.userData.surfaceTag = 'sticky';

  const ledgeFascia = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 4, 0.2),
  );
  ledgeFascia.name = 'sticky-ledge-fascia';
  ledgeFascia.position.set(-1, 2, 1.1);
  ledgeFascia.userData.surfaceTag = 'sticky';

  world.registerAll([perimeterPatch, ledgeFascia]);
  surfaces.registerAll([perimeterPatch, ledgeFascia]);

  const body = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(-0.56, 1, 0),
  });
  body.update(FIXED_DELTA_SECONDS, new THREE.Vector3(1, 0, 0));
  assert.equal(body.attached, true);

  let crossedCorner = false;
  for (let step = 0; step < 120; step += 1) {
    body.update(FIXED_DELTA_SECONDS, new THREE.Vector3(0, 0, 1));
    if (body.attached && body.gameplayUp.z < -0.99) {
      crossedCorner = true;
      break;
    }
  }

  assert.equal(crossedCorner, true);
  assert.equal(body.attachmentSurfaceName, 'sticky-ledge-fascia');

  perimeterPatch.geometry.dispose();
  ledgeFascia.geometry.dispose();
});
