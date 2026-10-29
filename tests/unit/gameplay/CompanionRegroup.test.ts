import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CompanionRegroup, type CompanionId, type CompanionWalk } from '../../../src/slimes/CompanionRegroup.ts';
import { GOOP_ACID_SPEED_MULTIPLIER } from '../../../src/slimes/SlimeRoster.ts';
import { cultivationCompanionWalk, cultivationCompanionWaitingReason, type CultivationCompanionState } from '../../../src/levels/CultivationCompanionWalks.ts';
import { createAuthoredDissolveTarget } from '../../../src/abilities/DissolveTarget.ts';
import { blackoutCompanionWalk, type BlackoutCompanionState } from '../../../src/levels/BlackoutCompanionWalks.ts';
import { LevelTwoPreviewScene, LEVEL_TWO_ROOM_TWO_OFFSET_Z as TWO,
  LEVEL_TWO_ROOM_THREE_OFFSET_Z as THREE_ROOM, LEVEL_TWO_ROOM_FOUR_OFFSET_Z as FOUR } from '../../../src/levels/LevelTwoPreviewScene.ts';
import { BlackoutMaintenanceBay } from '../../../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutTransitRoom } from '../../../src/levels/BlackoutTransitRoom.ts';
import { BlackoutBossStaging } from '../../../src/levels/BlackoutBossStaging.ts';
import { CollisionWorld } from '../../../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../../../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';
import { cultivationAssets } from '../../helpers/CultivationBakedAssets.ts';
import { maintenanceMaps } from '../../helpers/BlackoutMaintenanceMapData.ts';

const DT = 1 / 60, ZERO = new THREE.Vector3();
const cultivationState = (overrides: Partial<CultivationCompanionState> = {}): CultivationCompanionState => ({
  id: 'goop', position: new THREE.Vector3(), leader: new THREE.Vector3(),
  goopPassageUnlocked: false, roomTwoPlatformsReady: false,
  groundDronesDisabled: false, projectilesClear: true, liftWaiting: true, ...overrides,
});
const blackoutState = (overrides: Partial<BlackoutCompanionState> = {}): BlackoutCompanionState => ({
  id: 'bob', position: new THREE.Vector3(), leader: new THREE.Vector3(), bayAvailable: true,
  mainRouteReady: false, bridgeLocked: false, transitComplete: false, conducting: false, mounted: false, ...overrides,
});

function physics(meshes: readonly THREE.Mesh[]) {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(meshes); surfaces.registerAll(meshes);
  const createBody = (p: THREE.Vector3, id: CompanionId = 'goop') => {
    const body = new KinematicBody({world, surfaces, initialPosition: p,
      config: {adhesionEnabled: id === 'bob', reboundEnabled: false, chargedJumpEnabled: id === 'bob',
        acidSpeedMultiplier: id === 'goop' ? GOOP_ACID_SPEED_MULTIPLIER : 1}});
    for (let i = 0; i < 30; i++) body.update(DT, ZERO);
    return body;
  };
  return {world, surfaces, createBody, dispose() { world.clear(); surfaces.clear(); }};
}

test('eligibility preserves the Room 2 release, Room 3 combat and uncompleted traversal', () => {
  const waiting = cultivationState({position: new THREE.Vector3(0, .46, TWO + 20), leader: new THREE.Vector3(-17, 15, TWO + 30)});
  assert.equal(cultivationCompanionWalk(waiting), undefined);
  assert.equal(cultivationCompanionWalk({...waiting, goopPassageUnlocked: true}), undefined, 'the shutter cannot bypass unfinished platforms');
  assert.ok(cultivationCompanionWalk({...waiting, goopPassageUnlocked: true, roomTwoPlatformsReady: true}));
  assert.equal(cultivationCompanionWalk({...waiting, id: 'bob', goopPassageUnlocked: true}), undefined);
  assert.equal(cultivationCompanionWalk({...waiting, position: new THREE.Vector3(0, .66, TWO + 50),
    committedRoute: 'cultivation-released-passage'}), undefined, 'neither an existing route nor crossing the shutter bypasses unfinished platforms');
  assert.ok(cultivationCompanionWalk({...waiting, roomTwoPlatformsReady: true,
    position: new THREE.Vector3(0, .66, TWO + 50)}), 'Goop finishes the corridor after the shutter relocks');
  const combat = cultivationState({position: new THREE.Vector3(0, .46, THREE_ROOM + 3), leader: new THREE.Vector3(0, .81, THREE_ROOM + 70)});
  assert.equal(cultivationCompanionWalk(combat), undefined);
  assert.equal(cultivationCompanionWalk({...combat, groundDronesDisabled: true, projectilesClear: false}), undefined);
  assert.ok(cultivationCompanionWalk({...combat, groundDronesDisabled: true}), 'regrouping can start before both bodies reach the exit');
  const volt = blackoutState({id: 'volt', position: new THREE.Vector3(-16, 2, 72), leader: new THREE.Vector3(6, .86, 84), mainRouteReady: true});
  assert.ok(blackoutCompanionWalk(volt));
  assert.equal(blackoutCompanionWalk({...volt, conducting: true}), undefined);
  assert.equal(blackoutCompanionWalk({...volt, mounted: true}), undefined);
  assert.equal(blackoutCompanionWalk({...volt, position: new THREE.Vector3(-6, .46, 57)}), undefined, 'the live electrical vent stays manual');
  assert.equal(blackoutCompanionWalk(blackoutState({position: new THREE.Vector3(10, 8, 142), leader: new THREE.Vector3(0, .86, 158), bridgeLocked: true})), undefined, 'the last platform jump stays manual');
});

test('Goop catches up from Room 1 through the real shutters without moving Bob', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets), p = physics(scene.collisionMeshes);
  try {
    const goop = p.createBody(scene.root.localToWorld(new THREE.Vector3(-9, .66, 5.5)));
    const leader = new THREE.Vector3(0, .66, TWO + 4), local = new THREE.Vector3(), companion = new CompanionRegroup();
    const occupants = [{id: 'goop', position: goop.position, radiusMetres: goop.radiusMetres}];
    for (let i = 0; i < 2400; i++) {
      scene.root.worldToLocal(local.copy(goop.position));
      const walk = cultivationCompanionWalk(cultivationState({position: local, leader}));
      companion.beginStep(); goop.update(DT, companion.steer('goop', goop, walk, p.world, scene.root), companion.jump.goop, companion.locomotion.goop);
      scene.roomOneToTwoPassage.update(DT, occupants);
    }
    scene.root.worldToLocal(local.copy(goop.position));
    assert.ok(local.z >= TWO + 2.3, `Goop stalled at ${local.toArray()}`);
    assert.ok(local.z < TWO + 4, 'the companion stops on the next entry apron');
    assert.deepEqual(leader.toArray(), [0, .66, TWO + 4]);
    assert.ok(goop.grounded);
  } finally { p.dispose(); scene.dispose(); }
});

test('Goop waits for all three Room 2 platforms to land, then finishes the released passage after its shutter relocks', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets), p = physics(scene.collisionMeshes);
  const targets = scene.roomTwo.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, p.world, p.surfaces)!);
  scene.roomTwo.bindDissolveTargets(targets);
  try {
    const goop = p.createBody(scene.root.localToWorld(new THREE.Vector3(3, .66, TWO + 4)));
    const leader = new THREE.Vector3(-17, 15, TWO + 30), local = new THREE.Vector3(), companion = new CompanionRegroup();
    const entry = scene.roomTwoToThreeGoopPassage.entryDoor;
    entry.setLocked(false);
    const start = goop.position.z;
    const tick = () => {
      scene.root.worldToLocal(local.copy(goop.position));
      if (local.z > TWO + 49) entry.setLocked(true);
      const state = cultivationState({position: local, leader, goopPassageUnlocked: !entry.locked,
        roomTwoPlatformsReady: scene.roomTwo.blockDrops.every(drop => drop.state === 'landed')});
      const walk = cultivationCompanionWalk(state);
      companion.beginStep(); goop.update(DT, companion.steer('goop', goop, walk, p.world, scene.root,
        {waitReason: walk ? undefined : cultivationCompanionWaitingReason(state)}), companion.jump.goop, companion.locomotion.goop);
      companion.commit();
      scene.roomTwoToThreeGoopPassage.update(DT, [{id: 'goop', position: goop.position, radiusMetres: goop.radiusMetres}]);
    };
    for (let i = 0; i < 120; i++) tick();
    assert.equal(goop.position.z, start, 'an open shutter does not pull Goop away from the platform puzzle');
    assert.equal(companion.passiveInteractions[0]?.label, "Lower Bob's platforms");
    for (const drop of scene.roomTwo.blockDrops.slice(0, -1)) {
      const target = targets.find(target => target.id === drop.solubleTargetId)!;
      target.advance(target.dissolveDurationSeconds); drop.update(1);
    }
    for (let i = 0; i < 120; i++) tick();
    assert.equal(goop.position.z, start, 'lowering only two platforms is insufficient');
    const last = scene.roomTwo.blockDrops.at(-1)!;
    const target = targets.find(target => target.id === last.solubleTargetId)!;
    target.advance(target.dissolveDurationSeconds);
    tick();
    assert.equal(goop.position.z, start, 'the final platform must finish falling before Bob can use it');
    last.update(1);
    for (let i = 0; i < 1800; i++) tick();
    scene.root.worldToLocal(local.copy(goop.position));
    assert.ok(local.z >= THREE_ROOM + 2.3, `Goop stalled at ${local.toArray()}`);
    assert.ok(local.z < THREE_ROOM + 4);
    assert.equal(entry.locked, true);
    scene.roomTwo.reset();
    const resetState = cultivationState({position: new THREE.Vector3(0, .66, TWO + 50), leader,
      goopPassageUnlocked: true, committedRoute: 'cultivation-released-passage',
      roomTwoPlatformsReady: scene.roomTwo.blockDrops.every(drop => drop.state === 'landed')});
    assert.equal(cultivationCompanionWalk(resetState), undefined, 'retry restores the platform prerequisite');
  } finally { for (const target of targets) target.dispose(); p.dispose(); scene.dispose(); }
});

test('Goop walks around the Room 3 spawn shield after combat, then boards the lift', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets), p = physics(scene.collisionMeshes);
  try {
    const goop = p.createBody(scene.root.localToWorld(new THREE.Vector3(0, .46, THREE_ROOM + 2.8)));
    const leader = new THREE.Vector3(-1, .66, FOUR + 9), local = new THREE.Vector3(), companion = new CompanionRegroup();
    const bob = scene.root.localToWorld(leader.clone());
    for (let i = 0; i < 2400; i++) {
      scene.root.worldToLocal(local.copy(goop.position));
      const walk = cultivationCompanionWalk(cultivationState({position: local, leader, groundDronesDisabled: true,
        liftWaiting: scene.roomFour.controller.readModel.state === 'waitingForSlimes'}));
      companion.beginStep(); goop.update(DT, companion.steer('goop', goop, walk, p.world, scene.root), companion.jump.goop, companion.locomotion.goop);
      scene.roomFour.update(DT, [{id: 'bob', position: bob, radiusMetres: .45}, {id: 'goop', position: goop.position, radiusMetres: goop.radiusMetres}]);
      if (scene.roomFour.controller.boardingConfirmed) break;
    }
    scene.root.worldToLocal(local.copy(goop.position));
    assert.ok(scene.roomFour.controller.boardingConfirmed, `Goop stalled at ${local.toArray()}`);
    assert.ok(local.z > FOUR + 5.8 && local.z < FOUR + 14);
  } finally { p.dispose(); scene.dispose(); }
});

test('Blackout companions walk the safe bay corridor, rising duct and transit exit', () => {
  const bay = new BlackoutMaintenanceBay(maintenanceMaps), transit = new BlackoutTransitRoom(), staging = new BlackoutBossStaging();
  const p = physics([...bay.collisionMeshes, ...transit.collisionMeshes, ...staging.collisionMeshes]);
  try {
    for (const trial of [
      {id: 'bob' as const, start: new THREE.Vector3(-2, .46, 51), leader: new THREE.Vector3(6, .86, 84), end: 81.3},
      {id: 'volt' as const, start: new THREE.Vector3(-16, .9, 65), leader: new THREE.Vector3(6, .86, 84), end: 81.3},
      {id: 'goop' as const, start: new THREE.Vector3(10.5, .86, 152), leader: new THREE.Vector3(0, .86, 180), end: 179.3},
    ]) {
      const body = p.createBody(trial.start, trial.id), companion = new CompanionRegroup();
      for (let i = 0; i < 1200; i++) {
        const walk = blackoutCompanionWalk(blackoutState({...trial, position: body.position, mainRouteReady: true, bridgeLocked: true}));
        companion.beginStep(); body.update(DT, companion.steer(trial.id, body, walk, p.world), companion.jump[trial.id], companion.locomotion[trial.id]);
        assert.equal(bay.acidAt(body.position) || (trial.id !== 'goop' && transit.acidAt(body.position)), false);
      }
      assert.ok(body.position.z >= trial.end, `${trial.id} stalled at ${(body.position as THREE.Vector3).toArray()}`);
      assert.ok(body.grounded);
    }
  } finally { p.dispose(); staging.dispose(); transit.dispose(); bay.dispose(); }
});

test('closed doors and missing floors stop the companion; switching/recovery clears intent and status', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4, .4, 14)); floor.position.set(0, 0, 7);
  const door = new THREE.Mesh(new THREE.BoxGeometry(4, 3, .4)); door.position.set(0, 1.7, 5);
  const p = physics([floor, door]), companion = new CompanionRegroup();
  const walk: CompanionWalk = {points: [[0, 0, 1], [0, 0, 12]], bounds: [[-1, .3, 0], [1, 1, 14]], stepUps: [[0, .2, 5]]};
  try {
    const body = p.createBody(new THREE.Vector3(0, .66, 1));
    for (let i = 0; i < 300; i++) { companion.beginStep(); body.update(DT, companion.steer('bob', body, walk, p.world)); companion.commit(); }
    assert.ok(body.position.z < 4.5 && body.position.z > 3);
    assert.match(companion.passiveInteractions[0]?.label ?? '', /Waiting/);
    assert.equal(companion.jump.bob.pressed, false, 'an approved floor lip cannot authorize jumping a closed door');
    p.world.unregister(door); p.world.unregister(floor);
    companion.beginStep(); assert.equal(companion.steer('bob', body, walk, p.world).lengthSq(), 0);
    companion.commit(); assert.match(companion.passiveInteractions[0]?.label ?? '', /Waiting/);
    companion.reset(); assert.deepEqual(companion.passiveInteractions, []);
    assert.equal(companion.movement.bob.lengthSq(), 0);
    body.recoverAt(new THREE.Vector3(0, .66, 1));
    assert.equal(companion.steer('bob', body, undefined, p.world).lengthSq(), 0, 'no saved destination resumes after recovery');
  } finally { p.dispose(); floor.geometry.dispose(); door.geometry.dispose(); }
});

test('A* backs up to an authored branch and detours around a blocked centre lane', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, .4, 24)); floor.position.set(0, 0, 10);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2, 2)); crate.position.set(0, 1.2, 10);
  const p = physics([floor, crate]), companion = new CompanionRegroup();
  const walk: CompanionWalk = { finishPassage: true, widthMetres: 2, bounds: [[-6, .3, -1], [6, 1.2, 21]],
    points: [[0, 0, 1], [0, 0, 6], [0, 0, 14], [0, 0, 19]],
    alternatives: [{ widthMetres: 2, points: [[0, 0, 6], [3, 0, 6], [3, 0, 14], [0, 0, 14]] }] };
  try {
    const body = p.createBody(new THREE.Vector3(0, .66, 1), 'goop');
    let detoured = false, waited = false;
    for (let i = 0; i < 1200; i++) {
      companion.beginStep(DT);
      body.update(DT, companion.steer('goop', body, walk, p.world), companion.jump.goop, companion.locomotion.goop);
      companion.commit();
      detoured ||= body.position.x > 2;
      waited ||= companion.passiveInteractions.some(entry => entry.state === 'waiting');
    }
    assert.ok(waited, 'a live obstruction is detected before changing the route');
    assert.ok(detoured, 'the companion used the side corridor');
    assert.ok(body.position.z > 18.3, `detour stalled at ${[body.position.x, body.position.y, body.position.z]}`);
    assert.equal(companion.passiveInteractions[0]?.state, 'arrived');
    assert.ok(companion.diagnostics.plans < 12, 'cached paths and retry backoff bound searches');
  } finally { p.dispose(); }
});

test('route clearance and character restrictions also apply to alternative corridors', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, .4, 24)); floor.position.set(0, 0, 10);
  const p = physics([floor]), companion = new CompanionRegroup();
  const walk: CompanionWalk = {finishPassage: true, widthMetres: .8, bounds: [[-6, .3, -1], [6, 1, 22]],
    points: [[0, 0, 1], [0, 0, 20]], alternatives: [{slimes: ['goop'], widthMetres: 2,
      points: [[0, 0, 1], [3, 0, 1], [3, 0, 20], [0, 0, 20]]}]};
  try {
    const bob = p.createBody(new THREE.Vector3(0, .66, 1), 'bob');
    const goop = p.createBody(new THREE.Vector3(0, .66, 1), 'goop');
    for (let i = 0; i < 180; i++) {
      companion.beginStep(DT);
      bob.update(DT, companion.steer('bob', bob, walk, p.world));
      goop.update(DT, companion.steer('goop', goop, walk, p.world));
      companion.commit();
    }
    assert.equal(bob.position.z, 1, 'Bob cannot enter the narrow lane or Goop-only detour');
    assert.ok(goop.position.z > 5 && goop.position.x > 2, 'Goop uses its eligible alternative');
    assert.equal(companion.passiveInteractions.find(entry => entry.slimeId === 'bob')?.reason, 'route');
  } finally {p.dispose();}
});

test('activation waits, uses route distance, caches idle decisions and keeps arrival hysteresis', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, .4, 30)); floor.position.set(0, 0, 10);
  const p = physics([floor]), companion = new CompanionRegroup();
  const walk: CompanionWalk = { points: [[0, 0, 0], [0, 0, 20]], bounds: [[-8, .3, -1], [8, 1, 25]] };
  try {
    const body = p.createBody(new THREE.Vector3(0, .66, 0), 'goop');
    const tick = () => { companion.beginStep(DT); body.update(DT, companion.steer('goop', body, walk, p.world)); companion.commit(); };
    for (let i = 0; i < 30; i++) tick();
    assert.ok(body.position.z < .01, 'brief switches do not start catch-up');
    for (let i = 0; i < 450; i++) tick();
    assert.equal(companion.passiveInteractions[0]?.state, 'arrived');
    assert.ok(body.position.z > 16.8 && body.position.z < 18, `ordinary regroup stops near the party: ${body.position.z}`);
    body.recoverAt(new THREE.Vector3(0, .66, 15));
    const plans = companion.diagnostics.plans;
    for (let i = 0; i < 120; i++) tick();
    assert.equal(body.position.z, 15, 'a five-metre gap does not restart an arrived companion');
    assert.equal(companion.diagnostics.plans, plans);
    companion.reset();
    for (let i = 0; i < 180; i++) tick();
    assert.equal(companion.diagnostics.plans, plans + 1, 'idle neighbours do not repeatedly query their unchanged path');
  } finally { p.dispose(); }
});

test('searches share a render-frame budget and safety still reacts between renders', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, .4, 25)); floor.position.set(0, 0, 10);
  const p = physics([floor]), companion = new CompanionRegroup();
  const walk: CompanionWalk = {finishPassage: true, points: [[0, 0, 1], [0, 0, 20]], bounds: [[-4, .3, -1], [4, 1, 22]]};
  try {
    const bob = p.createBody(new THREE.Vector3(-1, .66, 1), 'bob');
    const goop = p.createBody(new THREE.Vector3(1, .66, 1), 'goop');
    companion.beginFrame();
    for (let i = 0; i < 60; i++) {
      companion.beginStep(DT); companion.steer('bob', bob, walk, p.world); companion.steer('goop', goop, walk, p.world); companion.commit();
    }
    assert.equal(companion.diagnostics.plans, 1);
    companion.beginFrame(); companion.beginStep(DT);
    companion.steer('bob', bob, walk, p.world); companion.steer('goop', goop, walk, p.world); companion.commit();
    assert.equal(companion.diagnostics.plans, 2);
    assert.equal(companion.diagnostics.maximumPlansPerFrame, 1);
    p.world.unregister(floor);
    companion.beginStep(DT);
    assert.equal(companion.steer('goop', goop, walk, p.world).lengthSq(), 0, 'a cached route cannot bypass a removed floor');
    companion.commit();
    assert.equal(companion.passiveInteractions.find(entry => entry.slimeId === 'goop')?.reason, 'floor');
  } finally { p.dispose(); }
});

test('holding a puzzle role clears plans, and a committed safe passage survives a leader returning', () => {
  const state = cultivationState({position: new THREE.Vector3(10, .46, 25), leader: new THREE.Vector3(0, .66, 5)});
  assert.equal(cultivationCompanionWalk(state), undefined);
  assert.ok(cultivationCompanionWalk({...state, committedRoute: 'cultivation-lab-exit'}));
  const unrelated = blackoutState({position: new THREE.Vector3(6, .46, 60), leader: new THREE.Vector3(0, 15, 170),
    party: [{position: new THREE.Vector3(0, 15, 170)}]});
  assert.equal(blackoutCompanionWalk(unrelated), undefined, 'an unrelated high platform does not request a bay regroup');
  assert.ok(blackoutCompanionWalk({...unrelated, committedRoute: 'blackout-bay-exit'}));
  const companion = new CompanionRegroup();
  companion.beginStep(); companion.hold('volt', 'power'); companion.commit();
  assert.equal(companion.passiveInteractions[0]?.state, 'holding');
  assert.equal(companion.passiveInteractions[0]?.reason, 'power');
  assert.equal(companion.diagnostics.plans, 0);
  companion.reset(); assert.deepEqual(companion.passiveInteractions, []);
});

test('an approved floor-lip hop keeps its catching-up status while airborne', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(8, .4, 16)); floor.position.set(0, 0, 7);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(8, .3, 6)); lip.position.set(0, .35, 8);
  const p = physics([floor, lip]), companion = new CompanionRegroup();
  const walk: CompanionWalk = {finishPassage: true, points: [[0, 0, 1], [0, 0, 10]],
    stepUps: [[0, .5, 5]], bounds: [[-3, .3, 0], [3, 1.3, 12]]};
  try {
    const body = p.createBody(new THREE.Vector3(0, .66, 1), 'goop');
    let jumped = false;
    for (let i = 0; i < 240; i++) {
      companion.beginStep(DT);
      body.update(DT, companion.steer('goop', body, walk, p.world), companion.jump.goop, companion.locomotion.goop);
      companion.commit();
      if (!companion.jump.goop.pressed) continue;
      jumped = true;
      assert.equal(body.grounded, false);
      assert.equal(companion.passiveInteractions[0]?.state, 'catching-up');
      companion.beginStep(DT);
      assert.equal(companion.steer('goop', body, walk, p.world).lengthSq(), 0, 'airborne input remains owned by physics');
      companion.commit();
      assert.equal(companion.passiveInteractions[0]?.state, 'catching-up', 'the HUD must not blink off during the hop');
      break;
    }
    assert.ok(jumped, 'the authored lip was traversed with a tap jump');
  } finally {p.dispose();}
});
