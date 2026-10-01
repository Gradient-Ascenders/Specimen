import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { BLACKOUT_TRANSIT_CHECKPOINTS, BLACKOUT_TRANSIT_LIFT_SLOTS, BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { CollisionWorld, ColliderTransformMode } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { PoweredLiftDevice } from '../src/electrical/PoweredDevices.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';

const FIXED_DT = 1 / 60;

function directionTo(body: KinematicBody, target: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(target.x - body.position.x, 0, target.z - body.position.z).normalize();
}

function createTransitFixture() {
  const room = new BlackoutTransitRoom();
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes, undefined, ColliderTransformMode.Static);
  surfaces.registerAll(room.collisionMeshes);

  const bob = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(6, 0.86, 84),
    config: { adhesionEnabled: true, reboundEnabled: false, chargedJumpEnabled: true },
  });
  const goop = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(11, -0.52, 139),
    config: { adhesionEnabled: false, reboundEnabled: false, chargedJumpEnabled: false },
  });
  const volt = new KinematicBody({
    world,
    surfaces,
    initialPosition: new THREE.Vector3(-16, 2.96, 134),
    config: { adhesionEnabled: false, reboundEnabled: false, chargedJumpEnabled: false },
  });
  const bodies = [bob, goop, volt];
  const lifts = BLACKOUT_TRANSIT_LIFT_SLOTS.map((slot) => {
    const device = new PoweredLiftDevice({
      id: slot.id,
      displayName: slot.id,
      collisionWorld: world,
      surfaceRegistry: surfaces,
      start: new THREE.Vector3(slot.position.x, slot.minY, slot.position.z),
      end: new THREE.Vector3(slot.position.x, slot.maxY, slot.position.z),
      size: slot.size.clone(),
      travelDurationSeconds: 2.4,
      routePolicy: 'one-way',
      powerMode: 'sustained',
    });
    room.root.add(device.root);
    return device;
  });

  const step = (body: KinematicBody, direction: THREE.Vector3, count = 1) => {
    for (let i = 0; i < count; i += 1) body.update(FIXED_DT, direction);
  };
  const walkTo = (body: KinematicBody, target: THREE.Vector3, maxSteps = 240) => {
    for (let i = 0; i < maxSteps; i += 1) {
      const distance = Math.hypot(target.x - body.position.x, target.z - body.position.z);
      if (distance < 0.22 && body.grounded) break;
      body.update(FIXED_DT, directionTo(body, target));
    }
    assert.ok(body.grounded, `walk should finish grounded at ${body.position.x.toFixed(2)}, ${body.position.y.toFixed(2)}, ${body.position.z.toFixed(2)}`);
    assert.ok(Math.hypot(target.x - body.position.x, target.z - body.position.z) < 1.1,
      `walk should reach its target; ended at ${JSON.stringify(body.position)}`);
  };
  const chargedJumpTo = (body: KinematicBody, target: THREE.Vector3, expectedSupport?: THREE.Mesh) => {
    assert.equal(body.grounded, true, `Bob must start the jump supported by ${body.supportColliderName}`);
    const start = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
    for (let i = 0; i < 44; i += 1) {
      body.update(FIXED_DT, new THREE.Vector3(), { pressed: i === 0, held: true, released: false });
    }
    body.update(FIXED_DT, directionTo(body, target), { pressed: false, held: false, released: true });
    assert.equal(body.jumpState, 'airborne', 'a full-charge jump should launch');
    let becameAirborne = false;
    let maximumY = body.position.y;
    let maximumForwardMetres = 0;
    for (let i = 0; i < 100; i += 1) {
      const dx = target.x - body.position.x;
      const dz = target.z - body.position.z;
      const distance = Math.hypot(dx, dz);
      const direction = distance > 0.5 ? new THREE.Vector3(dx, 0, dz).normalize() : new THREE.Vector3();
      body.update(FIXED_DT, direction);
      maximumY = Math.max(maximumY, body.position.y);
      maximumForwardMetres = Math.max(maximumForwardMetres,
        (body.position.z - start.z) * Math.sign(target.z - start.z));
      becameAirborne ||= !body.grounded;
      if (becameAirborne && body.grounded) break;
    }
    for (let i = 0; i < 16; i += 1) body.update(FIXED_DT, new THREE.Vector3());
    assert.equal(body.grounded, true,
      `charged jump ${JSON.stringify(start)} -> ${JSON.stringify(target)} should land on a real collider; at ${JSON.stringify(body.position)}, maxY=${maximumY}, hit=${body.lastCollisionName}`);
    if (expectedSupport) assert.equal(body.supportColliderName, expectedSupport.name,
      `charged jump ${JSON.stringify(start)} -> ${JSON.stringify(target)} should land on ${expectedSupport.name}, not ${body.supportColliderName} (maxForward=${maximumForwardMetres.toFixed(2)}m, maxY=${maximumY.toFixed(2)}m)`);
    assert.ok(Math.hypot(target.x - body.position.x, target.z - body.position.z) < 2.3,
      `charged jump ${JSON.stringify(start)} -> ${JSON.stringify(target)} should land on the next surface; at ${JSON.stringify(body.position)}, maxY=${maximumY}, maxForward=${maximumForwardMetres}, hit=${body.lastCollisionName}`);
    assert.ok(body.lastJumpChargeFraction > 0.9, 'the route must use Bob’s charged jump');
  };

  return {
    room, world, surfaces, bob, goop, volt, bodies, lifts, walkTo, chargedJumpTo,
    dispose() {
      for (const lift of [...lifts].reverse()) lift.dispose();
      room.dispose();
      world.clear();
      surfaces.clear();
    },
  };
}

test('Room 2 permanent checkpoints spawn each slime clear of the real route geometry', () => {
  const s = createTransitFixture();
  try {
    for (const checkpoint of BLACKOUT_TRANSIT_CHECKPOINTS) {
      for (const id of ['bob', 'goop', 'volt'] as const) {
        const body = new KinematicBody({
          world: s.world,
          surfaces: s.surfaces,
          initialPosition: checkpoint.bodyPositions[id],
          config: {
            adhesionEnabled: id === 'bob',
            reboundEnabled: false,
            chargedJumpEnabled: id === 'bob',
          },
        });
        body.update(FIXED_DT, new THREE.Vector3());
        assert.equal(body.grounded, true, `${checkpoint.id} ${id} spawn should have stable floor support at ${JSON.stringify(body.position)}`);
        assert.ok(body.contactsThisStep < 3, `${checkpoint.id} ${id} spawn should not be wedged into overlapping geometry`);
      }
    }
  } finally {
    s.dispose();
  }
});

test('Bob crosses the whole elevated route using separated charged jumps and both powered lifts', () => {
  const s = createTransitFixture();
  try {
    const bob = s.bob;
    // Walk across the deliberately generous entry deck before starting the
    // elevated route; the long diagonal from the checkpoint is not a jump.
    s.walkTo(bob, new THREE.Vector3(10, 0.86, 88.3));

    const route = [
      { position: new THREE.Vector3(10, 1.45, 94), surface: s.room.bobRoutePlatforms.find((mesh) => mesh.name === 'bob-route-approach')! },
      { position: new THREE.Vector3(10.5, 1.65, 102), surface: s.room.bobRoutePlatforms.find((mesh) => mesh.name === 'bob-route-cover-a-landing')! },
    ];
    for (const [index, landing] of route.entries()) {
      s.chargedJumpTo(bob, landing.position, landing.surface);
      if (index === 0) s.walkTo(bob, new THREE.Vector3(10, 1.45, 95.9));
    }

    // The low lift is reachable from the cover landing. Simulate an already
    // solved power puzzle and verify its powered carrier actually lifts Bob.
    s.walkTo(bob, new THREE.Vector3(10.5, 1.65, 103.2));
    s.chargedJumpTo(bob, new THREE.Vector3(10, 1.9, 110), s.lifts[0]!.platform.collisionMesh);
    const firstLift = s.lifts[0]!;
    assert.equal(bob.supportCollider, firstLift.platform.collisionMesh,
      'Bob should land on the powered lift rather than an invisible placeholder');
    const beforeFirstLift = bob.position.y;
    firstLift.core.setSupply('solved-light-bank-a', true);
    for (let i = 0; i < 180; i += 1) firstLift.updateMechanics(FIXED_DT, s.bodies);
    assert.ok(bob.position.y > beforeFirstLift + 2,
      `powered lift A should carry Bob upward; ${beforeFirstLift} -> ${bob.position.y}`);
    assert.equal(bob.supportCollider, firstLift.platform.collisionMesh,
      'Bob should remain supported while the powered lift rises');

    s.walkTo(bob, new THREE.Vector3(10, 4.7, 111.4));
    s.chargedJumpTo(bob, new THREE.Vector3(10, 4.65, 118), s.room.bobRoutePlatforms.find((mesh) => mesh.name === 'bob-route-lift-a-landing')!);
    s.walkTo(bob, new THREE.Vector3(10, 4.65, 119.9));
    s.chargedJumpTo(bob, new THREE.Vector3(9.5, 4.85, 126), s.room.bobRoutePlatforms.find((mesh) => mesh.name === 'bob-route-cover-b-landing')!);
    s.walkTo(bob, new THREE.Vector3(9.5, 4.85, 127.9));
    s.chargedJumpTo(bob, new THREE.Vector3(10, 5.1, 134), s.lifts[1]!.platform.collisionMesh);
    const secondLift = s.lifts[1]!;
    assert.equal(bob.supportCollider, secondLift.platform.collisionMesh);
    const beforeSecondLift = bob.position.y;
    secondLift.core.setSupply('solved-light-bank-b', true);
    for (let i = 0; i < 180; i += 1) secondLift.updateMechanics(FIXED_DT, s.bodies);
    assert.ok(bob.position.y > beforeSecondLift + 1.5,
      `powered lift B should carry Bob upward; ${beforeSecondLift} -> ${bob.position.y}`);

    s.walkTo(bob, new THREE.Vector3(10, 8.1, 135.4));
    s.chargedJumpTo(bob, new THREE.Vector3(10, 8.06, 142.5), s.room.bobRoutePlatforms.find((mesh) => mesh.name === 'bob-bridge-switch-approach')!);
    assert.ok(bob.position.z > 140 && bob.position.y > 7.4,
      `Bob should reach the far switch deck after both lifts; at ${JSON.stringify(bob.position)}`);

    // The finale requires use of a wall as a surface, not merely landing on
    // the neighboring platform. Walk into the switch wall and retain contact.
    const switchWall = s.room.bobSwitchWall;
    assert.equal(s.surfaces.get(switchWall).tag, 'sticky');
    for (let i = 0; i < 90 && !bob.attached; i += 1) {
      bob.update(FIXED_DT, new THREE.Vector3(-1, 0, 0));
    }
    assert.equal(bob.attached, true,
      `Bob should stick to the final switch wall; position=${JSON.stringify(bob.position)}, contact=${bob.lastCollisionName}`);
    assert.equal(bob.attachmentSurfaceName, switchWall.name);
    while (bob.position.z < s.room.switchBodyPosition.z - 0.15) {
      bob.update(FIXED_DT, new THREE.Vector3(0, 0, 1));
    }
    for (let i = 0; i < 16; i += 1) bob.update(FIXED_DT, new THREE.Vector3());

    const electricalTargets = new ElectricalTargetRegistry(s.world);
    const controller = new BlackoutTransitController({ room: s.room, world: s.world, surfaces: s.surfaces, electricalTargets });
    try {
      controller.setActive(true);
      controller.update(FIXED_DT, { bob, goop: s.goop, volt: s.volt });
      assert.equal(controller.switchHeld, true,
        `Bob’s sticky-wall contact must hold the bridge switch; Bob=${JSON.stringify(bob.position)}, switch=${JSON.stringify(s.room.switchBodyPosition)}, surface=${bob.attachmentSurfaceName}`);

      for (let i = 0; i < 110; i += 1) controller.update(FIXED_DT, { bob, goop: s.goop, volt: s.volt });
      assert.equal(controller.bridgeDeployed, true, 'holding the switch should deploy a walkable Volt bridge');
      const volt = s.volt;
      assert.equal(volt.grounded, true, `Volt should start the bridge transfer on the catwalk: ${JSON.stringify(volt.position)}`);
      const bridgeStart = new THREE.Vector3(-16, 2.96, 136);
      volt.update(FIXED_DT, new THREE.Vector3(0, 0, 1), { pressed: true, held: false, released: false });
      assert.equal(volt.lastJumpChargeFraction, 0, 'Volt’s catwalk transfer is an immediate normal jump');
      let voltAirborne = false;
      for (let i = 0; i < 90; i += 1) {
        volt.update(FIXED_DT, directionTo(volt, bridgeStart));
        controller.update(FIXED_DT, { bob, goop: s.goop, volt: s.volt });
        voltAirborne ||= !volt.grounded;
        if (voltAirborne && volt.grounded && volt.position.z >= 134.8) break;
      }
      assert.equal(voltAirborne, true);
      assert.equal(volt.grounded, true,
        `Volt should land on the deployed bridge approach after a normal jump: ${JSON.stringify(volt.position)}`);
      assert.equal(volt.lastJumpChargeFraction, 0);
      s.walkTo(volt, new THREE.Vector3(-10, 0, 139));
      assert.equal(volt.supportColliderName, 'transit-deployable-bridge-deck',
        'Volt should transfer from the catwalk anchor onto the actual deployed bridge collider');
      s.walkTo(volt, new THREE.Vector3(-1, 0.96, 145.4));
      assert.equal(volt.supportColliderName, 'transit-bridge-end-anchor',
        'Volt should cross the full powered bridge to its far anchor');
      const exitDeck = s.room.collisionMeshes.find((mesh) => mesh.name === 'transit-room-3-exit-deck')!;
      const exitTarget = new THREE.Vector3(-1, 0.86, 148.5);
      volt.update(FIXED_DT, directionTo(volt, exitTarget), { pressed: true, held: false, released: false });
      let exitJumpAirborne = false;
      for (let i = 0; i < 90; i += 1) {
        volt.update(FIXED_DT, directionTo(volt, exitTarget));
        controller.update(FIXED_DT, { bob, goop: s.goop, volt: s.volt });
        exitJumpAirborne ||= !volt.grounded;
        if (exitJumpAirborne && volt.grounded) break;
      }
      assert.equal(exitJumpAirborne, true);
      assert.equal(volt.supportCollider, exitDeck,
        `Volt needs a normal jump across the short bridge-to-exit gap; support=${volt.supportColliderName}, position=${JSON.stringify(volt.position)}`);
      assert.equal(volt.lastJumpChargeFraction, 0);
      assert.equal(s.room.exitAt(volt.position), true,
        `Volt should reach the shared exit volume after crossing the bridge: ${JSON.stringify(volt.position)}`);
    } finally {
      controller.dispose();
      electricalTargets.dispose();
    }
  } finally {
    s.dispose();
  }
});

test('neither transit lift can be skipped with Bob’s unpowered full-charge jump', () => {
  const s = createTransitFixture();
  try {
    const tryJumpFromRest = (lift: PoweredLiftDevice, target: THREE.Mesh, targetPosition: THREE.Vector3) => {
      const platformTop = lift.platform.root.position.y + lift.platform.size.y / 2;
      const body = new KinematicBody({
        world: s.world,
        surfaces: s.surfaces,
        initialPosition: new THREE.Vector3(lift.platform.root.position.x, platformTop + 0.46, lift.platform.root.position.z),
        config: { adhesionEnabled: true, reboundEnabled: false, chargedJumpEnabled: true },
      });
      for (let i = 0; i < 4; i += 1) body.update(FIXED_DT, new THREE.Vector3());
      assert.equal(body.supportCollider, lift.platform.collisionMesh);
      for (let i = 0; i < 44; i += 1) {
        body.update(FIXED_DT, new THREE.Vector3(), { pressed: i === 0, held: true, released: false });
      }
      body.update(FIXED_DT, directionTo(body, targetPosition), { pressed: false, held: false, released: true });
      for (let i = 0; i < 120; i += 1) body.update(FIXED_DT, directionTo(body, targetPosition));
      assert.notEqual(body.supportCollider, target,
        `${lift.id} must be powered before Bob can reach ${target.name}; otherwise the jump bypasses the lift`);
    };

    const padAfterLiftA = s.room.bobRoutePlatforms.find((mesh) => mesh.name === 'bob-route-lift-a-landing')!;
    const padAfterLiftB = s.room.bobRoutePlatforms.find((mesh) => mesh.name === 'bob-bridge-switch-approach')!;
    tryJumpFromRest(s.lifts[0]!, padAfterLiftA, new THREE.Vector3(10, 4.65, 118));
    tryJumpFromRest(s.lifts[1]!, padAfterLiftB, new THREE.Vector3(10, 8.06, 142.5));
  } finally {
    s.dispose();
  }
});

test('Goop walks continuously from the acid basin up the exit ramp to Room 3', () => {
  const s = createTransitFixture();
  try {
    const goop = s.goop;
    // Follow the east-side acid floor to the ramp toe, then stay on the ramp
    // as it rises onto the shared exit deck.
    s.walkTo(goop, new THREE.Vector3(11, -0.52, 139), 30);
    for (let i = 0; i < 360; i += 1) {
      const target = goop.position.z < 148
        ? new THREE.Vector3(11, 0, 148)
        : new THREE.Vector3(4, 0, 154);
      goop.update(FIXED_DT, directionTo(goop, target));
      if (s.room.exitAt(goop.position)) break;
    }
    assert.ok(s.room.exitAt(goop.position),
      `Goop should climb fully onto the shared exit deck; at ${JSON.stringify(goop.position)}`);
    assert.ok(goop.position.y > 0.2, `Goop should finish above the acid; y=${goop.position.y}`);
  } finally {
    s.dispose();
  }
});

test('Bob can drop from the final parkour deck onto the shared exit without touching acid', () => {
  const s = createTransitFixture();
  try {
    const checkpoint = BLACKOUT_TRANSIT_CHECKPOINTS.find((value) => value.id === 'cp5')!;
    const bob = new KinematicBody({
      world: s.world,
      surfaces: s.surfaces,
      initialPosition: checkpoint.bodyPositions.bob,
      config: { adhesionEnabled: true, reboundEnabled: false, chargedJumpEnabled: true },
    });
    for (let i = 0; i < 4; i += 1) bob.update(FIXED_DT, new THREE.Vector3());
    assert.equal(bob.grounded, true, 'Bob should begin on the permanent final deck');

    let crossedAcid = false;
    for (let i = 0; i < 150; i += 1) {
      bob.update(FIXED_DT, new THREE.Vector3(0, 0, 1));
      crossedAcid ||= s.room.acidAt(bob.position);
      if (bob.grounded && bob.position.z >= 147) break;
    }
    assert.equal(crossedAcid, false, 'the forward drop should clear the acid boundary before descending into it');
    assert.equal(bob.grounded, true, `Bob should land on the shared exit deck; at ${JSON.stringify(bob.position)}`);
    assert.ok(['transit-room-3-exit-deck', 'goop-acid-exit-ramp'].includes(bob.supportColliderName!));
    // The relocated left-hand route lands on the broad dry exit ramp, then
    // rejoins the centre deck instead of requiring another acid jump.
    s.walkTo(bob, new THREE.Vector3(10, 0.86, 151.9));
    s.walkTo(bob, new THREE.Vector3(0, 0.86, 153));
    assert.equal(s.room.exitAt(bob.position), true);
  } finally {
    s.dispose();
  }
});

test('Volt can use a normal jump from the catwalk onto the transit bridge anchor', () => {
  const s = createTransitFixture();
  try {
    const volt = s.volt;
    for (let i = 0; i < 8; i += 1) volt.update(FIXED_DT, new THREE.Vector3());
    assert.equal(volt.grounded, true, `Volt should start on the service catwalk at ${JSON.stringify(volt.position)}`);
    const landing = new THREE.Vector3(-16, 2.96, 136);
    volt.update(FIXED_DT, new THREE.Vector3(0, 0, 1), { pressed: true, held: false, released: false });
    assert.equal(volt.lastJumpChargeFraction, 0,
      'Volt must use his immediate normal jump, not Bob’s charge mechanic');
    let airborne = false;
    for (let i = 0; i < 90; i += 1) {
      const direction = directionTo(volt, landing);
      volt.update(FIXED_DT, direction);
      airborne ||= !volt.grounded;
      if (airborne && volt.grounded && volt.position.z >= 134.8) break;
    }
    assert.equal(airborne, true);
    assert.equal(volt.grounded, true,
      `Volt should land on the bridge start anchor after a normal jump; at ${JSON.stringify(volt.position)}, hit=${volt.lastCollisionName}`);
    assert.ok(volt.position.z >= 134.8 && volt.position.z <= 138,
      `Volt should reach the bridge anchor without overshooting; at z=${volt.position.z}`);
    assert.equal(volt.lastJumpChargeFraction, 0);
  } finally {
    s.dispose();
  }
});
