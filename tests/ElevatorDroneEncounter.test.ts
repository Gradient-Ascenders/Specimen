import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationRoomFourController, ROOM_FOUR_SPAWNS } from '../src/levels/CultivationRoomFourController.ts';
import { LevelTwoRoomFourGreybox } from '../src/levels/LevelTwoRoomFourGreybox.ts';
import { ElevatorDroneEncounter } from '../src/hazards/ElevatorDroneEncounter.ts';
import { CollisionWorld, ColliderTransformMode, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { AcidProjectileSystem } from '../src/abilities/AcidProjectileSystem.ts';
import { createLevelTwoPreviewProgression, advanceLevelTwoPreviewProgression } from '../src/levels/LevelTwoPreviewProgression.ts';
import { LevelTwoRoomFiveGreybox } from '../src/levels/LevelTwoRoomFiveGreybox.ts';

test('boarding requires both bodies continuously without waiting for the entrance door', () => {
  const c = new CultivationRoomFourController();
  c.update(2, true, false); assert.equal(c.readModel.state, 'waitingForSlimes');
  c.update(2, false, true); assert.equal(c.readModel.elapsed, 0);
  c.update(1, true, true); assert.equal(c.readModel.state, 'preparingDescent');
  c.update(.1, false, true); assert.equal(c.readModel.confirmation, 0);
  c.update(1.5, true, true); assert.equal(c.running, true);
  assert.equal(c.readModel.elapsed, 0);
  for (let i = 0; i < 3600; i++) c.update(1 / 60, true, true);
  assert.equal(c.readModel.state, 'arrival'); assert.equal(c.progress, 1);
  c.update(1.4, true, true); assert.equal(c.readModel.state, 'arrival');
  c.update(.1, true, true); assert.equal(c.readModel.state, 'complete');
  c.reset(); assert.equal(c.progress, 0); assert.equal(c.boardingConfirmed, false);
});

test('Room 4 checkpoint advances both bodies together', () => {
  const prior = createLevelTwoPreviewProgression(3);
  const partial = advanceLevelTwoPreviewProgression(prior, { bob: 3, goop: 4 });
  assert.deepEqual(partial.recoveryRoomIds, { bob: 3, goop: 3 });
  const both = advanceLevelTwoPreviewProgression(partial, { bob: 4, goop: 4 });
  assert.equal(both.roomId, 4); assert.deepEqual(both.recoveryRoomIds, { bob: 4, goop: 4 });
});

function fixture() {
  const room = new LevelTwoRoomFourGreybox();
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes); surfaces.registerAll(room.collisionMeshes);
  for (const mesh of [room.entrance.collisionMesh, room.boardingWall, room.arrivalWall, room.shield]) world.setTransformMode(mesh, ColliderTransformMode.Dynamic);
  const targets = room.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, world, surfaces)!);
  const dissolve = new DissolveSystem(targets);
  const bob = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(-2, .66, 9) });
  const goop = new KinematicBody({ world, surfaces, initialPosition: new THREE.Vector3(2, .66, 9) });
  let deaths = 0;
  const encounter = new ElevatorDroneEncounter(room, world, surfaces, bob, goop, targets, dissolve, () => deaths++);
  const step = (dt = 1 / 60) => {
    room.controller.update(dt, true, true);
    encounter.update(dt, 'goop'); dissolve.update(dt);
  };
  const reset = () => {
    dissolve.reset(); room.reset(); for (const target of targets) target.reset(); encounter.reset();
  };
  return { room, world, surfaces, targets, dissolve, encounter, step, reset, bob, goop,
    dispose() { encounter.dispose(); dissolve.dispose(); for (const t of targets) t.dispose(); room.dispose(); } };
}

test('all 12 scheduled drones spawn once, corrode from one hit, and reset without leaks', () => {
  const f = fixture();
  try {
    const baseline = f.world.colliderCount;
    for (let run = 0; run < 3; run++) {
      f.reset();
      assert.ok(f.targets.every(t => !t.mesh.visible));
      let next = 0;
      for (let frame = 0; frame < 3800; frame++) {
        f.step();
        const time = f.room.controller.readModel.elapsed;
        while (next < ROOM_FOUR_SPAWNS.length && time + 1e-9 >= ROOM_FOUR_SPAWNS[next].time) {
          const t = f.targets[next]; assert.equal(t.mesh.visible, true, `spawn ${next} at ${time}`);
          assert.equal(f.dissolve.startBurn(t), 'started');
          assert.equal(f.dissolve.startBurn(t), 'already-burning');
          next++;
        }
      }
      assert.equal(next, 12); assert.ok(f.targets.every(t => t.completed));
      assert.ok(f.room.droneRoots.every(root => !root.visible), 'all wrecks clear between waves');
      assert.equal(f.room.root.getObjectByName('lift-drone-impact-debris')!.visible, false);
      assert.equal(f.encounter.projectiles.liveCount, 0);
      assert.equal(f.room.controller.readModel.state, 'complete');
      f.reset(); assert.equal(f.world.colliderCount, baseline);
      assert.equal(f.dissolve.activeBurnCount, 0);
    }
  } finally { f.dispose(); }
});

test('uncleared drones overlap waves with a bounded cap and arrival removes every threat', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 3000; i++) f.step();
    const active = f.room.droneRoots.filter(root => root.visible);
    assert.equal(active.length, 8);
    assert.ok(f.encounter.diagnostics().includes('pending'));
    for (let i = 0; i < 1000; i++) f.step();
    assert.equal(f.room.controller.readModel.state, 'complete');
    assert.equal(f.encounter.projectiles.liveCount, 0);
    assert.ok(f.targets.every(t => !t.mesh.visible));
    f.reset();
    // Hidden, unspawned drones must not intercept a shot through their authored location.
    assert.equal(f.world.sweepSphere(new THREE.Vector3(0, 33, 10), new THREE.Vector3(0, 0, 4), .05, new CollisionHit()), false);
  } finally { f.dispose(); }
});

test('a real upward acid projectile hits the drone body and starts its destruction', () => {
  const f = fixture();
  const aimPoint = new THREE.Vector3();
  const acid = new AcidProjectileSystem({
    slimeManager: { activeSlimeId: 'goop', activeBody: f.goop, canActiveUseAbility: () => true },
    collisionWorld: f.world, dissolveSystem: f.dissolve,
    aimRayProvider: { copyAimRay(origin, direction) {
      f.targets[0].copyWorldBoundsCenter(aimPoint);
      origin.copy(f.goop.position); direction.copy(aimPoint).sub(origin).normalize();
    } },
    isTargetEnabled: target => target.mesh.parent?.visible === true,
  });
  const impacts: unknown[] = [];
  acid.events.on('worldImpact', event => impacts.push(event));
  try {
    while (f.room.controller.readModel.elapsed < 19.2) f.step();
    for (let i = 0; i < 180; i++) {
      acid.update(1 / 60, { gameplayInputEnabled: true, pointerLocked: true, aimHeld: true, firePressed: i === 0 });
      f.step();
    }
    assert.equal(acid.getDiagnostics().firedCount, 1);
    assert.equal(acid.getDiagnostics().solubleImpactCount, 1, JSON.stringify({ diagnostics: acid.getDiagnostics(), impacts }));
    assert.equal(f.targets[0].completed, true);
    assert.equal(f.room.droneRoots[0].getObjectByName('lift-drone-booster-flames')!.visible, false);
  } finally { acid.dispose(); f.dispose(); }
});

test('live drones fire out of their damage envelopes and can still hit the player', () => {
  const f = fixture();
  const selfHits: string[] = [], slimeHits: string[] = [];
  f.encounter.projectiles.events.on('worldImpact', ({ ownerDroneId, objectName }) => {
    if (objectName === ownerDroneId.replace('drone-', 'drone-target-')) selfHits.push(objectName);
  });
  f.encounter.projectiles.events.on('slimeImpact', ({ slimeId }) => slimeHits.push(slimeId));
  try {
    while (f.room.controller.readModel.elapsed < 24) f.step();
    assert.deepEqual(selfHits, []);
    assert.ok(slimeHits.includes('goop'), 'changing acid targets must not disable enemy fire');
  } finally { f.dispose(); }
});

test('body aiming ignores empty space above the drone and does not block the drone own sightline', () => {
  const f = fixture();
  try {
    while (f.room.controller.readModel.elapsed < 19.2) f.step();
    const root = f.room.droneRoots[0], hit = new CollisionHit();
    const start = new THREE.Vector3(root.position.x, root.position.y + 3, root.position.z - 1.2);
    assert.equal(f.world.sweepSphere(start, new THREE.Vector3(0, 0, 2.4), .04, hit,
      CollisionLayer.Projectile), false, 'shooting through the tether cannot disable the drone');
    start.y = root.position.y;
    assert.ok(f.world.sweepSphere(start, new THREE.Vector3(0, 0, 2.4), .04, hit, CollisionLayer.Projectile));
    assert.equal(hit.object, f.targets[0].mesh);
    assert.ok(f.world.sweepSphere(start, new THREE.Vector3(0, 0, 2.4), .04, hit, CollisionLayer.CameraObstruction));
    assert.equal(hit.object, f.targets[0].mesh, 'crosshair resolves the body target');
    const dronePosition = new THREE.Vector3(root.position.x, root.position.y, root.position.z);
    assert.equal(f.world.sweepSphere(dronePosition, new THREE.Vector3(0, -3, 0), .001, hit,
      CollisionLayer.LineOfSight, root.getObjectByName('room-4-drone-1-body') as THREE.Mesh), false);
    f.reset();
    assert.ok(f.targets.every(target => !target.mesh.visible));
    assert.ok(f.room.droneRoots.every(root => !root.getObjectByName('lift-drone-booster-flames')!.visible));
  } finally { f.dispose(); }
});

test('visible drone armor shares its own target highlight and reset without dissolving the wreck', () => {
  const f = fixture();
  let disposals = 0;
  try {
    const armor = f.room.droneRoots[0].getObjectByName('room-4-drone-1-armoured-shell') as THREE.Mesh;
    const other = f.room.droneRoots[1].getObjectByName('room-4-drone-2-armoured-shell') as THREE.Mesh;
    assert.notEqual(armor.material, other.material, 'selection cannot leak between drones');
    const compile = (mesh: THREE.Mesh) => {
      const shader = { uniforms: {} as Record<string, THREE.IUniform>,
        vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      (mesh.material as THREE.Material).onBeforeCompile(shader, null as never);
      return shader.uniforms;
    };
    const uniforms = compile(armor), otherUniforms = compile(other);
    f.targets[0].setCorrosionPresentation(.34, 1, .5, 2);
    assert.equal(uniforms.uAimHighlightStrength.value, .34);
    assert.equal(uniforms.uAimSelectedStrength.value, 1);
    assert.equal(uniforms.uBurnHighlightStrength.value, .5);
    assert.equal(otherUniforms.uAimHighlightStrength.value, 0);
    f.targets[0].advance(.8);
    assert.equal(uniforms.uDissolveAmount.value, 0, 'wreck remains visible until impact');
    f.reset();
    assert.equal(uniforms.uAimHighlightStrength.value, 0);
    assert.equal(uniforms.uAimSelectedStrength.value, 0);
    (armor.material as THREE.Material).addEventListener('dispose', () => disposals++);
  } finally { f.dispose(); }
  assert.equal(disposals, 1);
});

test('flying drones have no suspension geometry and boosters stop when disabled or reset', () => {
  const f = fixture();
  try {
    assert.equal(f.room.root.getObjectByName('room-4-cable-1'), undefined);
    assert.equal(f.room.root.getObjectByName('room-4-roof-winch-0'), undefined);
    while (f.room.controller.readModel.elapsed < 16) f.step();
    const root = f.room.droneRoots[0];
    const flames = root.getObjectByName('lift-drone-booster-flames')!;
    assert.equal(flames.visible, true);
    f.dissolve.startBurn(f.targets[0]); f.step();
    assert.equal(flames.visible, false);
    f.reset();
    assert.equal(flames.visible, false);
    assert.equal(root.position.y, 30);
    assert.equal(root.getObjectByName('room-4-drone-1-presentation')!.position.y, 0);
  } finally { f.dispose(); }
});

test('each later wave descends faster while the first keeps its original speed', () => {
  for (const [index, speed] of [[0, 7], [2, 9], [6, 14]]) {
    const f = fixture();
    try {
      f.room.controller.update(1.5, true, true);
      f.room.controller.update(ROOM_FOUR_SPAWNS[index].time, true, true);
      f.encounter.update(.25, 'goop');
      assert.equal(f.room.droneRoots[index].position.y, 30 - speed * .25);
    } finally { f.dispose(); }
  }
});

test('the entrance stays unlocked and scrolls continuously out of view during descent', () => {
  const room = new LevelTwoRoomFourGreybox();
  const occupants = [
    { id: 'bob', position: new THREE.Vector3(-1, .66, 1), radiusMetres: .45 },
    { id: 'goop', position: new THREE.Vector3(1, .66, 1), radiusMetres: .45 },
  ];
  try {
    room.update(1, occupants);
    assert.equal(room.entrance.state, 'open');
    assert.equal(room.entrance.locked, false);
    assert.equal(room.controller.running, false);
    for (const occupant of occupants) occupant.position.z = 8;
    room.update(1.5, occupants);
    assert.equal(room.controller.running, true);
    assert.equal(room.entrance.locked, false);
    assert.equal(room.entrance.root.position.z, 0);
    assert.equal(room.boardingWall.position.y, -100);
    assert.equal(room.entrance.root.position.y, 0, 'no wall swap when descent begins');
    room.update(1, occupants);
    assert.ok(room.entrance.root.position.y > 0);
    assert.ok(Math.abs(room.boardingWall.position.y + 100 - room.entrance.root.position.y) < 1e-8);
    room.reset();
    assert.equal(room.entrance.locked, false);
    assert.equal(room.boardingWall.position.y, -100);
  } finally { room.dispose(); }
});

test('severed drones eject struck bodies, break up on impact and leave no stacked or invisible obstacles', () => {
  const f = fixture();
  try {
    while (f.room.controller.readModel.elapsed < 16) f.step();
    const anchor = f.room.droneRoots[0];
    f.goop.teleport(new THREE.Vector3(2.8, .7, anchor.position.z));
    f.bob.teleport(new THREE.Vector3(2.8, .7, anchor.position.z));
    f.dissolve.startBurn(f.targets[0]);
    for (let i = 0; i < 180 && !f.encounter.diagnostics().startsWith('1: gone'); i++) f.step();
    assert.ok(f.encounter.diagnostics().startsWith('1: gone'));
    assert.equal(anchor.visible, false);
    const debris = f.room.root.getObjectByName('lift-drone-impact-debris')!;
    assert.equal(debris.visible, true, 'impact is visible before cleanup');
    for (const body of [f.bob, f.goop]) {
      assert.ok(Math.hypot(body.velocity.x, body.velocity.z) >= 24 - 1e-8);
      assert.ok(body.velocity.y >= 12 - 1e-8);
      assert.ok(Math.abs(body.position.x - anchor.position.x) > .9 + body.radiusMetres ||
        Math.abs(body.position.z - anchor.position.z) > .9 + body.radiusMetres);
    }
    // Visibility alone must not be masking a registered wreck collider.
    const count = f.world.colliderCount;
    const collider = anchor.getObjectByName('room-4-drone-1-body') as THREE.Mesh;
    f.world.unregister(collider);
    assert.equal(f.world.colliderCount, count);
    for (let i = 0; i < 60; i++) f.step();
    assert.equal(debris.visible, false, 'fragments clear within a second');

    f.room.droneRoots[1].position.x = anchor.position.x;
    f.room.droneRoots[1].position.z = anchor.position.z;
    f.dissolve.startBurn(f.targets[1]);
    for (let i = 0; i < 180; i++) f.step();
    assert.ok(f.encounter.diagnostics().split('\n')[1].startsWith('2: gone'));
    const hit = new CollisionHit();
    assert.ok(f.world.sweepSphere(new THREE.Vector3(anchor.position.x, 4, anchor.position.z),
      new THREE.Vector3(0, -4, 0), .1, hit));
    assert.ok(!hit.object?.name.includes('drone'), hit.object?.name);
    f.reset();
    assert.equal(debris.visible, false);
    const presentation = anchor.getObjectByName('room-4-drone-1-presentation')!;
    assert.equal(presentation.rotation.x, 0);
    assert.equal(presentation.rotation.z, 0);
  } finally { f.dispose(); }
});

test('arrival lets an already falling wreck finish its impact and cleanup', () => {
  const f = fixture();
  try {
    while (f.room.controller.readModel.elapsed < 16) f.step();
    f.dissolve.startBurn(f.targets[0]);
    for (let i = 0; i < 120 && !f.encounter.diagnostics().startsWith('1: falling'); i++) f.step();
    assert.ok(f.encounter.diagnostics().startsWith('1: falling'));
    f.room.controller.restoreArrival();
    for (let i = 0; i < 240 && !f.encounter.diagnostics().startsWith('1: gone'); i++) f.step();
    assert.ok(f.encounter.diagnostics().startsWith('1: gone'));
    const debris = f.room.root.getObjectByName('lift-drone-impact-debris')!;
    assert.equal(debris.visible, true);
    f.reset();
    assert.equal(debris.visible, false, 'retry cancels an impact still in progress');
    assert.ok(f.encounter.diagnostics().startsWith('1: pending'));
  } finally { f.dispose(); }
});

test('shaft bars recycle only above the roof and do not overlap the arrival shield', () => {
  const room = new LevelTwoRoomFourGreybox();
  try {
    const modules = Array.from({ length: 8 }, (_, i) => room.root.getObjectByName(`room-4-shaft-module-${i}`)!);
    const previous = modules.map(module => module.position.y);
    room.controller.update(1.5, true, true);
    for (let frame = 0; frame < 3750; frame++) {
      room.update(1 / 60, []);
      modules.forEach((module, i) => {
        if (module.position.y < previous[i]) assert.ok(previous[i] > 44.6);
        previous[i] = module.position.y;
      });
    }
    for (const module of modules) assert.ok(Math.abs(module.position.y - room.shield.position.y) > .35);
  } finally { room.dispose(); }
});

test('the arrival vent connects directly to the lift and both bodies fit its narrow entrance', () => {
  const f = fixture();
  const next = new LevelTwoRoomFiveGreybox(() => {});
  next.root.position.z = 15;
  next.root.updateMatrixWorld(true);
  f.world.registerAll(next.collisionMeshes);
  f.surfaces.registerAll(next.collisionMeshes);
  try {
    f.room.controller.restoreArrival(); f.room.update(1 / 60, []);
    for (const body of [f.bob, f.goop]) {
      body.recoverAt(new THREE.Vector3(0, .86, 13.5));
      for (let i = 0; i < 120; i++) body.update(1 / 60, new THREE.Vector3(0, 0, 1));
      assert.ok(body.position.z > 20, `blocked at ${body.position.toArray()}`);
      assert.ok(body.position.y > .5);
    }
  } finally { next.dispose(); f.dispose(); }
});

test('rear deck guard closes before descent and blocks walking off into the boarding gap', () => {
  const f = fixture();
  try {
    const occupants = [
      { id: 'bob', position: f.bob.position, radiusMetres: .45 },
      { id: 'goop', position: f.goop.position, radiusMetres: .45 },
    ];
    f.room.update(1.5, occupants);
    assert.equal(f.room.controller.running, true);
    assert.ok(f.room.boardingGuard.position.y > 2);
    for (let frame = 0; frame < 120; frame++) {
      f.room.update(1 / 60, occupants);
      f.bob.update(1 / 60, new THREE.Vector3(0, 0, -1));
    }
    assert.ok(f.bob.position.z > 5.7);
    assert.ok(f.bob.position.y > .5);
    f.reset(); assert.ok(f.room.boardingGuard.position.y < -2);
  } finally { f.dispose(); }
});
