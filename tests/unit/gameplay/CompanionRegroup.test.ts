import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CompanionRegroup, type CompanionId, type CompanionWalk } from '../../../src/slimes/CompanionRegroup.ts';
import { GOOP_ACID_SPEED_MULTIPLIER } from '../../../src/slimes/SlimeRoster.ts';
import { cultivationCompanionWalk, type CultivationCompanionState } from '../../../src/levels/CultivationCompanionWalks.ts';
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
  goopPassageUnlocked: false, groundDronesDisabled: false, projectilesClear: true, liftWaiting: true, ...overrides,
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
  assert.ok(cultivationCompanionWalk({...waiting, goopPassageUnlocked: true}));
  assert.equal(cultivationCompanionWalk({...waiting, id: 'bob', goopPassageUnlocked: true}), undefined);
  assert.ok(cultivationCompanionWalk({...waiting, position: new THREE.Vector3(0, .66, TWO + 50)}), 'Goop finishes the corridor after the shutter relocks');
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
      companion.beginStep(); goop.update(DT, companion.steer('goop', goop, walk, p.world, scene.root), companion.jump.goop);
      scene.roomOneToTwoPassage.update(DT, occupants);
    }
    scene.root.worldToLocal(local.copy(goop.position));
    assert.ok(local.z >= TWO + 2.3, `Goop stalled at ${local.toArray()}`);
    assert.ok(local.z < TWO + 4, 'the companion stops on the next entry apron');
    assert.deepEqual(leader.toArray(), [0, .66, TWO + 4]);
    assert.ok(goop.grounded);
  } finally { p.dispose(); scene.dispose(); }
});

test('Goop finishes the released Room 2 passage after its entry shutter relocks', () => {
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets), p = physics(scene.collisionMeshes);
  try {
    const goop = p.createBody(scene.root.localToWorld(new THREE.Vector3(3, .66, TWO + 4)));
    const leader = new THREE.Vector3(-17, 15, TWO + 30), local = new THREE.Vector3(), companion = new CompanionRegroup();
    const entry = scene.roomTwoToThreeGoopPassage.entryDoor;
    entry.setLocked(false);
    for (let i = 0; i < 1800; i++) {
      scene.root.worldToLocal(local.copy(goop.position));
      if (local.z > TWO + 49) entry.setLocked(true);
      const walk = cultivationCompanionWalk(cultivationState({position: local, leader, goopPassageUnlocked: !entry.locked}));
      companion.beginStep(); goop.update(DT, companion.steer('goop', goop, walk, p.world, scene.root), companion.jump.goop);
      scene.roomTwoToThreeGoopPassage.update(DT, [{id: 'goop', position: goop.position, radiusMetres: goop.radiusMetres}]);
    }
    scene.root.worldToLocal(local.copy(goop.position));
    assert.ok(local.z >= THREE_ROOM + 2.3, `Goop stalled at ${local.toArray()}`);
    assert.ok(local.z < THREE_ROOM + 4);
    assert.equal(entry.locked, true);
  } finally { p.dispose(); scene.dispose(); }
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
      companion.beginStep(); goop.update(DT, companion.steer('goop', goop, walk, p.world, scene.root), companion.jump.goop);
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
        companion.beginStep(); body.update(DT, companion.steer(trial.id, body, walk, p.world), companion.jump[trial.id]);
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
