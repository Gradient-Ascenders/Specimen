import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AcidProjectileSystem } from '../../../src/abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../../../src/abilities/DissolveSystem.ts';
import { ElectricalTargetRegistry } from '../../../src/abilities/ElectricalTargetRegistry.ts';
import { BlackoutTransitController } from '../../../src/levels/BlackoutTransitController.ts';
import { BlackoutTransitRoom } from '../../../src/levels/BlackoutTransitRoom.ts';
import { CollisionWorld, CollisionHit, CollisionLayer, ColliderTransformMode } from '../../../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../../../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';

const DT = 1 / 60;
function fixture() {
  const room = new BlackoutTransitRoom(), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes, undefined, ColliderTransformMode.Static); surfaces.registerAll(room.collisionMeshes);
  const electrical = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets: electrical });
  const body = (x: number, y: number, z: number, bob = false) => new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(x, y, z),
    config: { adhesionEnabled: bob, reboundEnabled: false, chargedJumpEnabled: bob } });
  const bodies = { bob: body(6, .86, 84, true), goop: body(8, .86, 84), volt: body(-16, 2.96, 86) };
  const dissolve = new DissolveSystem(controller.dissolveTargets); controller.bindBurns(dissolve);
  const manager = { activeSlimeId: 'goop', activeBody: bodies.goop, canActiveUseAbility: () => true };
  const aim = new THREE.Vector3();
  const acid = new AcidProjectileSystem({ slimeManager: manager, collisionWorld: world, dissolveSystem: dissolve,
    aimRayProvider: { copyAimRay(origin, direction) {
      origin.copy(bodies.goop.position).add(new THREE.Vector3(0, .7, 0)); direction.subVectors(aim, origin).normalize();
    } } });
  controller.setActive(true);
  return { room, world, surfaces, electrical, controller, bodies, dissolve, acid, manager, aim,
    tick(firePressed = false) {
      acid.update(DT, { aimHeld: true, firePressed, gameplayInputEnabled: true, pointerLocked: true });
      dissolve.update(DT); return controller.update(DT, bodies);
    },
    dispose() { acid.dispose(); dissolve.dispose(); controller.dispose(); electrical.dispose(); room.dispose(); world.clear(); surfaces.clear(); },
  };
}

for (const cleared of [0, 1, 2]) test(`guard ${cleared + 1} releases only its own machinery`, () => {
  const f = fixture(), c = f.controller;
  try {
    c.emergingDrones[cleared]!.state.destroy(); c.setActive(true);
    assert.deepEqual(c.lifts.map(l => l.core.readModel.available), [cleared === 0, cleared === 1]);
    assert.equal(c.voltRouteCleared, cleared === 2);
    assert.ok(c.lifts.every(l => !l.core.readModel.powered), 'destroying a guard does not power a lift');
    assert.equal(c.bridgeDeployed, false, 'destroying the west guard does not perform Bob’s switch step');
    const saved = c.capture(); c.reset(); c.restore(saved);
    assert.deepEqual(c.lifts.map(l => l.core.readModel.available), [cleared === 0, cleared === 1]);
    assert.equal(c.voltRouteCleared, cleared === 2);
  } finally { f.dispose(); }
});

test('a living west guard restricts only the bridge; its destruction still requires Bob and Volt cooperation', () => {
  const f = fixture(), c = f.controller;
  try {
    f.bodies.bob.teleport(f.room.switchBodyPosition);
    for (let i = 0; i < 100; i++) { f.bodies.bob.update(DT, new THREE.Vector3(-1, 0, 0)); c.update(DT, f.bodies); }
    assert.equal(f.bodies.bob.attached, true); assert.equal(c.switchHeld, true);
    assert.equal(c.bridgeDeployed, false); assert.equal(c.bridgeLocked, false);
    c.emergingDrones[2]!.state.destroy();
    for (let i = 0; i < 90; i++) c.update(DT, f.bodies);
    assert.equal(c.bridgeDeployed, true, 'unrelated east guards do not interlock the west bridge');
    assert.equal(c.bridgeLocked, false, 'Volt must still power the original receiver');
    f.bodies.volt.teleport(new THREE.Vector3(0, .86, 145));
    c.update(DT, f.bodies); c.lockReceiver.target.setConnectionState(true);
    for (let i = 0; i < 91; i++) c.update(DT, f.bodies);
    assert.equal(c.bridgeLocked, true);
  } finally { f.dispose(); }
});

test('stale raised lift and deployed bridge checkpoints cannot override living local guards', () => {
  const f = fixture(), c = f.controller;
  try {
    for (const enemy of c.emergingDrones) enemy.state.destroy(); c.setActive(true);
    c.lifts[0]!.core.setConnectionState(true); c.lifts[1]!.core.setConnectionState(true);
    for (let i = 0; i < 180; i++) c.update(DT, f.bodies);
    assert.ok(c.lifts.every(l => l.platform.progress === 1));
    const stale = c.capture() as Record<string, any>;
    Object.assign(stale, { bridgeProgress: 1, bridgeDeployed: true, bridgeLocked: true,
      lockReceiver: { charge: 1, latched: true } });
    c.restore(stale);
    const hit = new CollisionHit(), bridgeRay = new THREE.Vector3(-7, 3, 140.5), down = new THREE.Vector3(0, -2.5, 0);
    assert.equal(f.world.sweepSphere(bridgeRay, down, .1, hit, CollisionLayer.Movement), true);
    c.reset(); const living = c.capture() as Record<string, any>;
    stale.sewerDrones = living.sewerDrones;
    Object.assign(stale, { bridgeProgress: 1, bridgeDeployed: true, bridgeLocked: true, complete: true,
      lockReceiver: { charge: 1, latched: true } });
    c.restore(stale);
    assert.ok(c.lifts.every(l => l.platform.progress === 0 && !l.core.readModel.available && !l.core.readModel.powered));
    assert.equal(c.bridgeDeployed, false); assert.equal(c.bridgeLocked, false); assert.equal(c.complete, false);
    assert.equal(c.lockReceiver.latched, false);
    assert.equal(f.world.sweepSphere(bridgeRay, down, .1, hit, CollisionLayer.Movement), false, 'stale bridge collision must be absent too');
  } finally { f.dispose(); }
});

test('the original hallway has no added barrier and completion has no independent drone predicate', () => {
  const f = fixture(), c = f.controller;
  try {
    f.room.root.traverse(mesh => assert.doesNotMatch(mesh.name, /transit-drone-interlock/));
    const hit = new CollisionHit();
    assert.equal(f.world.sweepSphere(new THREE.Vector3(0, .86, 158), new THREE.Vector3(0, 0, 3), .45, hit, CollisionLayer.Movement), false);
    for (const body of Object.values(f.bodies)) body.teleport(f.room.exitPosition);
    c.update(DT, f.bodies); assert.equal(c.complete, false, 'the original bridge lock is still required');
    // Stage the original solved cooperative bridge with living east guards.
    // Local route locks already enforce their legitimate traversal prerequisite.
    c.emergingDrones[2]!.state.destroy();
    const solved = c.capture() as Record<string, any>;
    Object.assign(solved, { bridgeProgress: 1, bridgeDeployed: true, bridgeLocked: true,
      lockReceiver: { charge: 1, latched: true } });
    c.restore(solved);
    f.bodies.goop.teleport(new THREE.Vector3(10, -.52, 139));
    c.update(DT, f.bodies); assert.equal(c.complete, false, 'all three bodies must still reach the exit');
    f.bodies.goop.teleport(f.room.exitPosition);
    c.update(DT, f.bodies); assert.equal(c.complete, true);
    assert.equal(c.emergingDrones[0]!.state.state, 'dormant'); assert.equal(c.emergingDrones[1]!.state.state, 'dormant');
  } finally { f.dispose(); }
});

for (const index of [0, 1]) for (const xOffset of [-1, 0, 1]) test(`Bob cannot charged-jump the unpowered lift ${index + 1} from x offset ${xOffset}`, () => {
  const f = fixture(), c = f.controller, body = f.bodies.bob;
  try {
    const lift = c.lifts[index]!, target = f.room.bobRoutePlatforms[index === 0 ? 2 : 4]!;
    body.teleport(lift.root.position.clone().add(new THREE.Vector3(xOffset, .71, 0)));
    const zero = new THREE.Vector3(), direction = target.position.clone().sub(body.position).setY(0).normalize();
    for (let i = 0; i < 4; i++) body.update(DT, zero);
    assert.equal(body.supportCollider, lift.platform.collisionMesh);
    for (let i = 0; i < 44; i++) body.update(DT, zero, { pressed: i === 0, held: true, released: false });
    body.update(DT, direction, { pressed: false, held: false, released: true });
    let reached = false;
    for (let i = 0; i < 120; i++) {
      body.update(DT, direction); c.update(DT, f.bodies); reached ||= body.isSupportedBy(target);
    }
    assert.equal(reached, false); assert.equal(lift.platform.progress, 0);
    assert.equal(c.lifts[index]!.core.readModel.available, false);
  } finally { f.dispose(); }
});

for (const index of [0, 1]) test(`Bob cannot bypass lift ${index + 1} by charging from the preceding sticky wall`, () => {
  const f = fixture(), body = f.bodies.bob;
  try {
    body.teleport(new THREE.Vector3(7.57, index === 0 ? 7.35 : 8.2, index === 0 ? 99.6 : 123.7));
    const target = f.room.bobRoutePlatforms[index === 0 ? 2 : 4]!;
    for (let i = 0; i < 4; i++) body.update(DT, new THREE.Vector3(-1, 0, 0));
    assert.equal(body.attached, true);
    for (let i = 0; i < 44; i++) body.update(DT, new THREE.Vector3(), { pressed: i === 0, held: true, released: false });
    const direction = target.position.clone().sub(body.position).setY(0).normalize();
    body.update(DT, direction, { pressed: false, held: false, released: true });
    let reached = false;
    for (let i = 0; i < 180; i++) { body.update(DT, direction); reached ||= body.isSupportedBy(target); }
    assert.equal(reached, false);
  } finally { f.dispose(); }
});

for (const [index, slimeId, position] of [[0, 'bob', [10.5, 1.66, 102]], [1, 'bob', [11.5, 4.86, 126]], [2, 'volt', [-16, 2.96, 132]]] as const) {
  test(`one real guard ${index + 1} projectile kills ${slimeId}, and acquisition alone does not`, () => {
    const f = fixture(), enemy = f.controller.emergingDrones[index]!;
    let impacts = 0, damage = 0, died = 0, failure: string | undefined;
    f.controller.projectiles.events.on('slimeImpact', e => { if (e.ownerDroneId === enemy.id && e.slimeId === slimeId) { impacts++; damage = e.damage; } });
    f.controller.damage.events.on('died', e => { if (e.slimeId === slimeId) died++; });
    try {
      f.bodies[slimeId].teleport(new THREE.Vector3(...position));
      for (let i = 0; i < 600 && !impacts; i++) {
        failure = f.controller.update(DT, f.bodies);
        if (!impacts) assert.equal(f.controller.damage.health.find(h => h.slimeId === slimeId)!.health, 100);
      }
      assert.equal(impacts, 1); assert.equal(damage, 100); assert.equal(died, 1); assert.equal(failure, slimeId);
      assert.equal(f.controller.damage.health.find(h => h.slimeId === slimeId)!.health, 0);
    } finally { f.dispose(); }
  });
}

for (const index of [0, 1, 2]) test(`real acid impacts alert guard ${index + 1}, retaliate at basin Goop and permanently destroy it`, () => {
  const f = fixture(), enemy = f.controller.emergingDrones[index]!;
  let elapsed = 0, firstHit: number | undefined, firstShot: number | undefined, impacts = 0, shots = 0;
  f.acid.events.on('solubleImpact', e => { if (e.targetId === enemy.id && e.burnStarted) firstHit ??= elapsed; });
  enemy.weapon.events.on('fired', e => { assert.equal(e.slimeId, 'goop'); firstShot ??= elapsed; shots++; });
  f.controller.projectiles.events.on('slimeImpact', e => { if (e.ownerDroneId === enemy.id && e.slimeId === 'goop') impacts++; });
  const tick = (fire = false) => { elapsed += DT; enemy.shell.body.getWorldPosition(f.aim); f.tick(fire); };
  try {
    // Reachable acid-floor firing position, including the isolated west guard.
    const z = index === 0 ? 100 : index === 1 ? 124 : 132;
    f.bodies.goop.teleport(new THREE.Vector3(index === 2 ? -8 : 18, -.52, z - 7));
    for (let i = 0; i < 180; i++) tick();
    const shotsBefore = shots;
    tick(true);
    for (let i = 0; i < 150 && !impacts; i++) tick();
    assert.equal(enemy.state.hits, 1, JSON.stringify({ index, hits: enemy.state.hits, shots }));
    assert.ok(firstHit !== undefined && firstShot !== undefined && firstShot - firstHit >= .4 - DT);
    assert.ok(shots > shotsBefore && impacts > 0, `guard ${index + 1} must actually damage stationary Goop`);
    assert.equal(enemy.weapon.readModel.targetSlimeId, 'goop');
    assert.equal(f.controller.damage.health.find(h => h.slimeId === 'goop')!.health, 70);
    const light = enemy.light.target.position.clone().sub(enemy.light.position).normalize();
    assert.ok(light.dot(enemy.weapon.readModel.scanDirection as THREE.Vector3) > 1 - 1e-9);
    const saved = enemy.capture(); enemy.reset(); enemy.restore(saved); assert.equal(enemy.retaliating, true);
    for (let hit = 1; hit < 3; hit++) { tick(true); for (let i = 0; i < 70; i++) tick(); }
    assert.equal(enemy.state.state, 'destroyed'); assert.equal(enemy.target.completed, true);
    const shotsAfter = shots; for (let i = 0; i < 120; i++) tick(); assert.equal(shots, shotsAfter);
    assert.equal(enemy.light.intensity, 0); assert.equal(enemy.shell.body.visible, false);
  } finally { f.dispose(); }
});

test('Goop priority survives character switching, respects cover, searches briefly then returns to surveillance', () => {
  const f = fixture(), enemy = f.controller.emergingDrones[0]!;
  const cover = new THREE.Mesh(new THREE.BoxGeometry(8, 7, .3), new THREE.MeshBasicMaterial());
  cover.name = 'test-combat-cover'; cover.position.set(18, 2, 96); cover.updateMatrixWorld();
  let impacts = 0; f.controller.projectiles.events.on('slimeImpact', e => { if (e.slimeId === 'goop') impacts++; });
  const tick = () => { enemy.shell.body.getWorldPosition(f.aim); f.tick(); };
  try {
    f.bodies.goop.teleport(new THREE.Vector3(18, -.52, 93));
    for (let i = 0; i < 180; i++) tick();
    enemy.shell.body.getWorldPosition(f.aim); f.tick(true);
    for (let i = 0; i < 120 && !impacts; i++) tick(); assert.ok(impacts > 0);
    f.manager.activeSlimeId = 'bob';
    for (let i = 0; i < 30; i++) tick(); assert.equal(enemy.weapon.readModel.targetSlimeId, 'goop');
    f.world.register(cover); const before = impacts;
    for (let i = 0; i < 60; i++) tick();
    assert.equal(impacts, before); assert.equal(enemy.weapon.readModel.targetSlimeId, undefined); assert.equal(enemy.retaliating, true);
    for (let i = 0; i < 360; i++) tick(); assert.equal(enemy.retaliating, false);
    assert.equal(enemy.light.distance, 10);
  } finally { f.world.unregister(cover); cover.geometry.dispose(); (cover.material as THREE.Material).dispose(); f.dispose(); }
});

test('a nearby acid miss does not alert a guard and moving Goop can evade long-range retaliation', () => {
  const outcomes: { shots: number; impacts: number; x: number; speed: number }[] = [];
  for (const moving of [false, true]) {
    const f = fixture(), enemy = f.controller.emergingDrones[0]!;
    let shots = 0, impacts = 0;
    enemy.weapon.events.on('fired', () => shots++);
    f.controller.projectiles.events.on('slimeImpact', e => { if (e.slimeId === 'goop') impacts++; });
    try {
      f.bodies.goop.teleport(new THREE.Vector3(18, -.52, 85));
      for (let i = 0; i < 180; i++) f.tick();
      f.aim.set(18, 2, 81); f.tick(true);
      for (let i = 0; i < 75; i++) f.tick();
      assert.equal(enemy.state.hits, 0); assert.equal(enemy.retaliating, false);
      f.bodies.goop.teleport(new THREE.Vector3(18, -.52, 120));
      enemy.shell.body.getWorldPosition(f.aim); f.tick(true);
      let direction = 1;
      for (let i = 0; i < 360; i++) {
        if (moving) {
          if (f.bodies.goop.position.x > 20) direction = -1;
          if (f.bodies.goop.position.x < 14) direction = 1;
          f.bodies.goop.update(DT, new THREE.Vector3(direction, 0, 0));
        }
        f.tick();
      }
      assert.equal(enemy.state.hits, 1); assert.ok(shots >= 4);
      outcomes.push({ shots, impacts, x: f.bodies.goop.position.x, speed: f.bodies.goop.velocity.x });
    } finally { f.dispose(); }
  }
  assert.ok(outcomes[0]!.impacts >= 3, JSON.stringify(outcomes));
  assert.ok(outcomes[1]!.impacts < outcomes[0]!.impacts, `real movement must avoid some shots: ${JSON.stringify(outcomes)}`);
});
