import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AcidProjectileSystem } from '../src/abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { CollisionWorld, CollisionHit, CollisionLayer, ColliderTransformMode } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const DT = 1 / 60;
function fixture() {
  const room = new BlackoutTransitRoom(), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes, undefined, ColliderTransformMode.Static); surfaces.registerAll(room.collisionMeshes);
  const electrical = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets: electrical });
  const body = (x: number, y: number, z: number) => new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(x, y, z),
    config: { adhesionEnabled: false, reboundEnabled: false, chargedJumpEnabled: false } });
  const bodies = { bob: body(6, .86, 84), goop: body(8, .86, 84), volt: body(-16, 2.96, 86) };
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
      dissolve.update(DT); controller.update(DT, bodies);
    },
    dispose() { acid.dispose(); dissolve.dispose(); controller.dispose(); electrical.dispose(); room.dispose(); world.clear(); surfaces.clear(); },
  };
}

test('drone destruction independently unlocks the correct lift, then both routes and the physical exit', () => {
  const f = fixture(), c = f.controller;
  const sweep = (x: number, y: number) => {
    const hit = new CollisionHit();
    const blocked = f.world.sweepSphere(new THREE.Vector3(x, y, 158), new THREE.Vector3(0, 0, 2), .45, hit, CollisionLayer.Movement);
    return blocked ? hit.object?.name : undefined;
  };
  try {
    for (const phase of ['dormant', 'rebooting', 'active'] as const) {
      for (const enemy of c.emergingDrones) enemy.state.restore({ state: phase, elapsed: phase === 'dormant' ? 0 : 1, hits: 0 });
      c.setActive(true);
      for (const lift of c.lifts) { lift.core.setConnectionState(true); assert.equal(lift.core.readModel.powered, false); }
      for (const x of [-3, 0, 3]) for (const y of [.86, 3, 5.3]) assert.equal(sweep(x, y), 'transit-drone-interlock-shutter');
    }
    // The wrong drone cannot unlock either Bob lift.
    c.emergingDrones[2]!.state.destroy(); c.update(DT, f.bodies);
    assert.equal(c.voltRouteCleared, true); assert.equal(c.bobRouteCleared, false);
    assert.ok(c.lifts.every(lift => !lift.core.readModel.available));
    c.emergingDrones[0]!.state.hit(); c.emergingDrones[0]!.state.hit(); c.update(DT, f.bodies);
    assert.equal(c.lifts[0]!.core.readModel.available, false, 'two hits are not destruction');
    c.emergingDrones[0]!.state.hit(); c.update(DT, f.bodies);
    assert.equal(c.lifts[0]!.core.readModel.available, true); assert.equal(c.lifts[1]!.core.readModel.available, false);
    assert.equal(sweep(0, .86), 'transit-drone-interlock-shutter');
    c.emergingDrones[1]!.state.destroy(); c.update(DT, f.bodies);
    assert.equal(c.encounterCleared, true); assert.ok(c.lifts.every(lift => lift.core.readModel.available));
    assert.equal(sweep(0, .86), undefined, 'the real collider is removed with the visible shutter');
    const cleared = c.capture(); c.reset(); assert.equal(sweep(0, .86), 'transit-drone-interlock-shutter');
    c.restore(cleared); assert.equal(sweep(0, .86), undefined); assert.equal(c.encounterCleared, true);
    c.reset(); assert.equal(c.encounterCleared, false); assert.ok(c.lifts.every(lift => !lift.core.readModel.available));
  } finally { f.dispose(); }
});

test('switch attachment, direct receiver calls and stale checkpoint flags cannot bypass living guards', () => {
  const f = fixture(), c = f.controller;
  try {
    f.bodies.bob.teleport(f.room.switchBodyPosition);
    for (let i = 0; i < 120; i++) {
      f.bodies.bob.update(DT, new THREE.Vector3(-1, 0, 0));
      c.lockReceiver.target.setConnectionState(true); c.update(DT, f.bodies);
    }
    assert.equal(c.switchHeld, false); assert.equal(c.bridgeDeployed, false); assert.equal(c.bridgeLocked, false);
    const forged = c.capture() as Record<string, any>;
    Object.assign(forged, { complete: true, switchHeld: true, bridgeDeployed: true, bridgeProgress: 1, bridgeLocked: true,
      lockReceiver: { charge: 1, latched: true } });
    c.restore(forged);
    assert.equal(c.complete, false); assert.equal(c.bridgeLocked, false); assert.equal(c.bridgeDeployed, false);
    assert.equal(c.lockReceiver.latched, false);
    for (const body of Object.values(f.bodies)) body.teleport(f.room.exitPosition);
    c.update(DT, f.bodies); assert.equal(c.complete, false);
  } finally { f.dispose(); }
});

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
