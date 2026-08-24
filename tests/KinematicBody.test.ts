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
import {
  DEFAULT_SURFACE_DEFINITIONS,
  SurfaceRegistry,
} from '../src/physics/SurfaceRegistry.ts';

const FIXED_DELTA_SECONDS = 1 / 60;
const EPSILON = 1e-10;
const NO_MOVEMENT = new THREE.Vector3();

interface AttachedBodyFixture {
  body: KinematicBody;
  events: EventBus<MovementEvents>;
  world: CollisionWorld;
  wall: THREE.Mesh;
}

interface GroundBodyFixture {
  body: KinematicBody;
  events: EventBus<MovementEvents>;
  floor: THREE.Mesh;
}

function createGroundBody(
  config: ConstructorParameters<typeof KinematicBody>[0]['config'] = {},
): GroundBodyFixture {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const events = new EventBus<MovementEvents>();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20));
  floor.name = 'test-jump-buffer-floor';
  floor.position.y = -0.5;
  floor.updateWorldMatrix(true, false);
  world.register(floor);
  surfaces.register(floor);

  const body = new KinematicBody({
    world,
    surfaces,
    events,
    config,
    initialPosition: new THREE.Vector3(
      0,
      DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres +
        DEFAULT_KINEMATIC_BODY_CONFIG.skinWidthMetres,
      0,
    ),
  });
  assert.equal(body.grounded, true);

  return { body, events, floor };
}

function launchTapJump(body: KinematicBody): void {
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: true,
    held: true,
    released: false,
  });
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: false,
    released: true,
  });
  assert.equal(body.grounded, false);
}

function advanceToBufferedLandingApproach(body: KinematicBody): void {
  for (let step = 0; step < 120; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
    if (body.velocity.y < 0 && body.position.y < 0.85) return;
  }

  assert.fail('Body did not reach the expected descending landing approach.');
}

interface FallingBodyFixture {
  body: KinematicBody;
  events: EventBus<MovementEvents>;
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

test('landing-reaction tuning cannot equal or exceed the normal jump impulse', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();

  assert.throws(
    () => new KinematicBody({
      world,
      surfaces,
      initialPosition: new THREE.Vector3(),
      config: {
        slimeLandingReactionHopSpeedMetresPerSecond:
          DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond,
      },
    }),
    /must be less than minimumJumpSpeedMetresPerSecond/,
  );
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
  const events = new EventBus<MovementEvents>();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  floor.name = 'ordinary-test-floor';
  floor.position.y = -0.1;
  world.register(floor);
  surfaces.register(floor);

  const body = new KinematicBody({
    world,
    surfaces,
    events,
    config,
    initialPosition: new THREE.Vector3(0, initialHeightMetres, 0),
  });

  return { body, events, floor };
}

function advanceUntilLanding(body: KinematicBody): void {
  for (let step = 0; step < 300; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
    if (body.landedThisStep) return;
  }

  assert.fail('Body did not reach a stable landing transition.');
}

function advanceUntilGrounded(body: KinematicBody): void {
  for (let step = 0; step < 600; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
    if (body.grounded) return;
  }

  assert.fail('Body did not reach a stable grounded state.');
}

function launchFullyChargedJump(body: KinematicBody): void {
  const chargeSteps = Math.ceil(
    body.maximumJumpChargeSeconds / FIXED_DELTA_SECONDS,
  );
  for (let step = 0; step < chargeSteps; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
      pressed: step === 0,
      held: true,
      released: false,
    });
  }
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: false,
    released: true,
  });
  assert.equal(body.grounded, false);
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
  assert.equal(body.usingSurfaceGravity, true);
  assert.ok(
    new THREE.Vector3(
      body.gameplayUp.x,
      body.gameplayUp.y,
      body.gameplayUp.z,
    ).distanceTo(attachedUp) < EPSILON,
  );
  assert.ok(reportedDirection.distanceTo(attachedUp) < EPSILON);
  assert.ok(
    body.velocity.x * attachedUp.x +
      body.velocity.y * attachedUp.y +
      body.velocity.z * attachedUp.z > 0,
  );

  wall.geometry.dispose();
});

test('sticky jump retains local gravity through a gap then falls back to world gravity', () => {
  const { body, world, wall } = createAttachedBody();
  const stickyUp = new THREE.Vector3(
    body.gameplayUp.x,
    body.gameplayUp.y,
    body.gameplayUp.z,
  );

  beginWallJump(body);
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: false,
    released: true,
  });
  world.unregister(wall);

  const launchSpeedAlongStickyUp = new THREE.Vector3(
    body.velocity.x,
    body.velocity.y,
    body.velocity.z,
  ).dot(stickyUp);
  for (let step = 0; step < 30; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
  }

  assert.equal(body.attached, false);
  assert.equal(body.usingSurfaceGravity, true);
  assert.ok(
    new THREE.Vector3(
      body.gameplayUp.x,
      body.gameplayUp.y,
      body.gameplayUp.z,
    ).distanceTo(stickyUp) < EPSILON,
  );
  assert.ok(
    new THREE.Vector3(
      body.velocity.x,
      body.velocity.y,
      body.velocity.z,
    ).dot(stickyUp) < launchSpeedAlongStickyUp,
  );
  assert.ok(Math.abs(body.velocity.y) < EPSILON);

  for (let step = 0; step < 120 && body.usingSurfaceGravity; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
  }

  assert.equal(body.usingSurfaceGravity, false);
  assert.equal(body.stickyJumpGravityRemainingSeconds, 0);
  assert.ok(Math.abs(body.gameplayUp.x) < EPSILON);
  assert.ok(Math.abs(body.gameplayUp.y - 1) < EPSILON);
  assert.ok(Math.abs(body.gameplayUp.z) < EPSILON);
  assert.ok(body.velocity.y < 0);

  wall.geometry.dispose();
});

test('sticky jump crosses a gap and adopts the destination tile', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const firstTile = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 4));
  firstTile.name = 'sticky-transfer-start';
  firstTile.userData.surfaceTag = 'sticky';
  const destinationTile = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 4));
  destinationTile.name = 'sticky-transfer-destination';
  destinationTile.position.y = 4.5;
  destinationTile.userData.surfaceTag = 'sticky';
  world.registerAll([firstTile, destinationTile]);
  surfaces.registerAll([firstTile, destinationTile]);

  const body = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(-0.56, 0.5, 0),
  });
  body.update(FIXED_DELTA_SECONDS, new THREE.Vector3(1, 0, 0));
  assert.equal(body.attachmentSurfaceName, firstTile.name);

  for (let step = 0; step < 42; step += 1) {
    body.update(
      FIXED_DELTA_SECONDS,
      NO_MOVEMENT,
      {
        pressed: step === 0,
        held: true,
        released: false,
      },
    );
  }
  body.update(
    FIXED_DELTA_SECONDS,
    new THREE.Vector3(0, 1, 0),
    { pressed: false, held: false, released: true },
  );
  assert.equal(body.usingSurfaceGravity, true);
  world.unregister(firstTile);

  for (let step = 0; step < 120 && !body.attached; step += 1) {
    body.update(FIXED_DELTA_SECONDS, new THREE.Vector3(0, 1, 0));
  }

  assert.equal(body.attached, true);
  assert.equal(body.attachmentSurfaceName, destinationTile.name);
  assert.equal(body.stickyJumpGravityRemainingSeconds, 0);
  assert.ok(body.gameplayUp.x < -0.99);

  firstTile.geometry.dispose();
  destinationTile.geometry.dispose();
});

test('wall jump release preserves ordinary surface locomotion', () => {
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
  assert.ok(Math.abs(forwardVelocity.x - idleVelocity.x) < EPSILON);
  assert.ok(Math.abs(forwardVelocity.z - idleVelocity.z) < EPSILON);

  idleFixture.wall.geometry.dispose();
  forwardFixture.wall.geometry.dispose();
});

test('floor-facing sticky jump keeps locomotion without a directional dash', () => {
  const { body, wall } = createAttachedBody();
  const towardFloor = new THREE.Vector3(0, -1, 0);

  for (let step = 0; step < 20; step += 1) {
    body.update(FIXED_DELTA_SECONDS, towardFloor, {
      pressed: step === 0,
      held: true,
      released: false,
    });
  }
  const tangentSpeedBeforeRelease = Math.abs(body.velocity.y);

  body.update(FIXED_DELTA_SECONDS, towardFloor, {
    pressed: false,
    held: false,
    released: true,
  });

  assert.equal(body.attached, false);
  assert.ok(body.velocity.x < 0);
  assert.ok(body.velocity.y < 0);
  assert.ok(Math.abs(body.lastJumpDirection.x + 1) < EPSILON);
  assert.ok(Math.abs(body.lastJumpDirection.y) < EPSILON);
  assert.ok(
    Math.abs(body.velocity.y) <=
      body.maximumLocomotionSpeedMetresPerSecond + EPSILON,
  );
  assert.ok(
    Math.abs(Math.abs(body.velocity.y) - tangentSpeedBeforeRelease) < 0.1,
  );

  wall.geometry.dispose();
});

test('buffered sticky-wall contact uses a normal local-up jump', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const events = new EventBus<MovementEvents>();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 10, 10));
  wall.name = 'test-buffered-sticky-wall';
  wall.userData.surfaceTag = 'sticky';
  world.register(wall);
  surfaces.register(wall);

  const body = new KinematicBody({
    world,
    surfaces,
    events,
    initialPosition: new THREE.Vector3(-0.56, 0, 0),
  });
  const reportedDirection = new THREE.Vector3();
  let jumpCount = 0;
  events.on('jumped', (event) => {
    jumpCount += 1;
    reportedDirection.set(
      event.directionWorld.x,
      event.directionWorld.y,
      event.directionWorld.z,
    );
  });

  body.update(
    FIXED_DELTA_SECONDS,
    new THREE.Vector3(1, 1, 0),
    {
      pressed: true,
      held: false,
      released: true,
    },
  );

  assert.equal(jumpCount, 1);
  assert.equal(body.attached, false);
  assert.equal(body.jumpInputBufferRemainingSeconds, 0);
  assert.ok(reportedDirection.x < 0);
  assert.ok(Math.abs(reportedDirection.y) < EPSILON);
  assert.ok(body.velocity.x < 0);
  assert.ok(
    Math.abs(body.velocity.y) <=
      body.maximumLocomotionSpeedMetresPerSecond + EPSILON,
  );

  wall.geometry.dispose();
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

test('jump pressed shortly before landing begins charging on touchdown', () => {
  const { body, floor } = createGroundBody();
  launchTapJump(body);
  advanceToBufferedLandingApproach(body);

  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: true,
    held: true,
    released: false,
  });

  for (let step = 0; step < 8 && !body.chargingJump; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
      pressed: false,
      held: true,
      released: false,
    });
  }

  assert.equal(body.grounded, true);
  assert.equal(body.chargingJump, true);
  assert.equal(body.jumpInputBufferRemainingSeconds, 0);

  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: true,
    released: false,
  });
  assert.ok(body.chargeSeconds > 0);

  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: false,
    released: true,
  });
  assert.equal(body.grounded, false);
  assert.ok(body.velocity.y > 0);

  floor.geometry.dispose();
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

test('a small ledge fall lands without an automatic hop', () => {
  const { body, floor } = createFallingBody(1.2);

  advanceUntilLanding(body);

  assert.ok(
    body.lastLandingImpactSpeedMetresPerSecond <
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeHardLandingImpactSpeedMetresPerSecond,
  );
  assert.equal(body.lastBounceSpeedMetresPerSecond, 0);
  assert.equal(body.grounded, true);

  floor.geometry.dispose();
});

test('a normal jump lands without an automatic hop', () => {
  const { body, floor } = createGroundBody({ chargedJumpEnabled: false });

  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: true,
    held: true,
    released: false,
  });
  assert.equal(body.grounded, false);
  advanceUntilGrounded(body);

  assert.equal(body.lastBounceSpeedMetresPerSecond, 0);
  assert.equal(body.grounded, true);

  floor.geometry.dispose();
});

test('a minimally charged jump lands without an automatic hop', () => {
  const { body, floor } = createGroundBody();

  launchTapJump(body);
  advanceUntilGrounded(body);

  assert.equal(body.lastBounceSpeedMetresPerSecond, 0);
  assert.equal(body.grounded, true);

  floor.geometry.dispose();
});

test('a fully charged jump lands without an automatic hop', () => {
  const { body, floor } = createGroundBody();

  launchFullyChargedJump(body);
  assert.equal(body.lastJumpChargeFraction, 1);
  advanceUntilGrounded(body);

  assert.ok(
    body.lastLandingImpactSpeedMetresPerSecond <
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeHardLandingImpactSpeedMetresPerSecond,
  );
  assert.equal(body.lastBounceSpeedMetresPerSecond, 0);
  assert.equal(body.grounded, true);

  floor.geometry.dispose();
});

test('a fully charged jump from the Room 2 exit height hops on the Room 3 entry platform', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const events = new EventBus<MovementEvents>();
  const lowerFloor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 5));
  lowerFloor.name = 'room-3-entry-platform';
  lowerFloor.position.y = 10.15;
  const launchPlatform = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 4));
  launchPlatform.name = 'room-2-exit-balcony';
  launchPlatform.position.y = 10.65;
  lowerFloor.updateWorldMatrix(true, false);
  launchPlatform.updateWorldMatrix(true, false);
  world.registerAll([lowerFloor, launchPlatform]);
  surfaces.registerAll([lowerFloor, launchPlatform]);
  const body = new KinematicBody({
    world,
    surfaces,
    events,
    initialPosition: new THREE.Vector3(
      0,
      10.9 +
        DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres +
        DEFAULT_KINEMATIC_BODY_CONFIG.skinWidthMetres,
      0,
    ),
  });
  const landingSpeeds: number[] = [];
  events.on('landed', (event) => {
    landingSpeeds.push(event.impactSpeedMetresPerSecond);
  });

  assert.equal(body.grounded, true);
  launchFullyChargedJump(body);
  world.unregister(launchPlatform);
  surfaces.unregister(launchPlatform);
  advanceUntilLanding(body);

  assert.ok(
    body.lastLandingImpactSpeedMetresPerSecond >=
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeHardLandingImpactSpeedMetresPerSecond,
  );
  assert.equal(
    body.lastBounceSpeedMetresPerSecond,
    DEFAULT_KINEMATIC_BODY_CONFIG.slimeLandingReactionHopSpeedMetresPerSecond,
  );
  assert.ok(body.velocity.y > 0);

  advanceUntilGrounded(body);

  assert.equal(landingSpeeds.length, 2);
  assert.equal(body.grounded, true);

  lowerFloor.geometry.dispose();
  launchPlatform.geometry.dispose();
});

test('jump pressed and released shortly before landing launches on touchdown', () => {
  const { body, events, floor } = createGroundBody();
  let jumpCount = 0;
  events.on('jumped', () => {
    jumpCount += 1;
  });

  launchTapJump(body);
  assert.equal(jumpCount, 1);
  advanceToBufferedLandingApproach(body);

  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: true,
    held: true,
    released: false,
  });
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: false,
    released: true,
  });

  for (let step = 0; step < 8 && jumpCount < 2; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
  }

  assert.equal(jumpCount, 2);
  assert.equal(body.grounded, false);
  assert.ok(body.velocity.y > 0);
  assert.ok(
    Math.abs(
      body.lastJumpSpeedMetresPerSecond -
        DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond,
    ) < EPSILON,
  );

  floor.geometry.dispose();
});

test('a large fall produces one visible landing-reaction hop', () => {
  const { body, events, floor } = createFallingBody(3.5);
  const landingSpeeds: number[] = [];
  events.on('landed', (event) => {
    landingSpeeds.push(event.impactSpeedMetresPerSecond);
  });

  advanceUntilLanding(body);

  assert.equal(body.landedThisStep, true);
  assert.ok(
    body.lastLandingImpactSpeedMetresPerSecond >=
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeHardLandingImpactSpeedMetresPerSecond,
  );
  assert.ok(
    Math.abs(
      body.velocity.y -
        DEFAULT_KINEMATIC_BODY_CONFIG.slimeLandingReactionHopSpeedMetresPerSecond,
    ) < EPSILON,
  );
  assert.ok(
    body.lastBounceSpeedMetresPerSecond <
      DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond,
  );
  assert.equal(body.grounded, false);

  advanceUntilGrounded(body);

  assert.equal(landingSpeeds.length, 2);
  assert.ok(
    landingSpeeds[1] <
      DEFAULT_KINEMATIC_BODY_CONFIG.slimeHardLandingImpactSpeedMetresPerSecond,
  );
  assert.equal(body.grounded, true);

  floor.geometry.dispose();
});

test('repeated large falls produce exactly one reaction hop each', () => {
  const qualifyingFallHeightMetres = 3.5;
  const { body, floor } = createFallingBody(qualifyingFallHeightMetres);

  for (let fall = 0; fall < 2; fall += 1) {
    let reactionHopDepartures = 0;

    for (let step = 0; step < 600; step += 1) {
      body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
      if (body.landedThisStep && body.velocity.y > 0) {
        reactionHopDepartures += 1;
      }
      if (reactionHopDepartures > 0 && body.grounded) break;
    }

    assert.equal(reactionHopDepartures, 1);
    assert.equal(body.grounded, true);

    if (fall === 0) {
      body.teleport(new THREE.Vector3(0, qualifyingFallHeightMetres, 0));
    }
  }

  floor.geometry.dispose();
});

test('an authored bouncy surface keeps its configured gameplay bounce', () => {
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const bouncePad = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  bouncePad.name = 'authored-test-bounce-pad';
  bouncePad.position.y = -0.1;
  bouncePad.userData.surfaceTag = 'bouncy';
  world.register(bouncePad);
  surfaces.register(bouncePad);
  const body = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(0, 1.2, 0),
  });

  for (
    let step = 0;
    step < 300 && body.lastBounceSurfaceName !== bouncePad.name;
    step += 1
  ) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
  }

  assert.equal(body.lastBounceSurfaceName, bouncePad.name);
  assert.ok(
    Math.abs(
      body.lastBounceSpeedMetresPerSecond -
        DEFAULT_SURFACE_DEFINITIONS.bouncy.bounceSpeedMetresPerSecond,
    ) < EPSILON,
  );
  assert.ok(body.velocity.y > 0);

  bouncePad.geometry.dispose();
});

test('focus-cleared input cancels released buffer without a stale launch', () => {
  const { body, events, floor } = createGroundBody();
  let jumpCount = 0;
  events.on('jumped', () => {
    jumpCount += 1;
  });

  launchTapJump(body);
  advanceToBufferedLandingApproach(body);
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: true,
    held: true,
    released: false,
  });
  assert.ok(body.jumpInputBufferRemainingSeconds > 0);

  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: false,
    released: true,
  });
  assert.ok(body.jumpInputBufferRemainingSeconds > 0);

  // A later focus loss explicitly invalidates even a stored release.
  body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT, {
    pressed: false,
    held: false,
    released: false,
    cancelled: true,
  });
  assert.equal(body.jumpInputBufferRemainingSeconds, 0);

  for (let step = 0; step < 600 && !body.grounded; step += 1) {
    body.update(FIXED_DELTA_SECONDS, NO_MOVEMENT);
  }

  assert.equal(body.grounded, true);
  assert.equal(body.chargingJump, false);
  assert.equal(jumpCount, 1);
  assert.equal(body.lastBounceSpeedMetresPerSecond, 0);

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
