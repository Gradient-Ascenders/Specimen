import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CollisionWorld } from '../../../src/physics/CollisionWorld.ts';
import { DEFAULT_KINEMATIC_BODY_CONFIG, KinematicBody } from '../../../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../../../src/physics/SurfaceRegistry.ts';
import { GOOP_ACID_SPEED_MULTIPLIER } from '../../../src/slimes/SlimeRoster.ts';
import { CompanionRegroup, type CompanionWalk } from '../../../src/slimes/CompanionRegroup.ts';
import { LevelTwoPreviewScene } from '../../../src/levels/LevelTwoPreviewScene.ts';
import { BlackoutMaintenanceBay } from '../../../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutTransitRoom } from '../../../src/levels/BlackoutTransitRoom.ts';
import { cultivationAssets } from '../../helpers/CultivationBakedAssets.ts';
import { maintenanceMaps } from '../../helpers/BlackoutMaintenanceMapData.ts';

const DT = 1 / 60, ZERO = new THREE.Vector3(), FORWARD = new THREE.Vector3(0, 0, 1);
const NORMAL_SPEED = DEFAULT_KINEMATIC_BODY_CONFIG.maxSpeedMetresPerSecond;
const ACID_SPEED = NORMAL_SPEED * GOOP_ACID_SPEED_MULTIPLIER;

function physics(meshes: readonly THREE.Mesh[]) {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(meshes); surfaces.registerAll(meshes);
  const body = (position: THREE.Vector3, goop = true) => new KinematicBody({world, surfaces, initialPosition: position,
    config: {adhesionEnabled: false, reboundEnabled: false, chargedJumpEnabled: false,
      acidSpeedMultiplier: goop ? GOOP_ACID_SPEED_MULTIPLIER : 1}});
  return {world, body, dispose() {world.clear(); surfaces.clear();}};
}

test('acid speed belongs to Goop contact, resets on dry ground/recovery and does not change jumps', () => {
  const acid = new THREE.Mesh(new THREE.BoxGeometry(30, .4, 100)); acid.position.set(-15, -.2, 0);
  acid.userData.textureRole = 'acid-floor';
  const dry = new THREE.Mesh(new THREE.BoxGeometry(30, .4, 100)); dry.position.set(15, -.2, 0);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4, .4, 4)); platform.position.set(-10, 1.8, 8);
  const p = physics([acid, dry, platform]);
  try {
    const goop = p.body(new THREE.Vector3(-10, .46, -10)), ordinary = p.body(new THREE.Vector3(-15, .46, -10), false);
    for (let i = 0; i < 60; i++) {goop.update(DT, FORWARD); ordinary.update(DT, FORWARD);}
    assert.ok(Math.abs(goop.velocity.z - ACID_SPEED) < 1e-8);
    assert.ok(Math.abs(ordinary.velocity.z - NORMAL_SPEED) < 1e-8, 'Bob/Volt retain their ordinary speed');
    assert.ok(goop.groundStoppingDistanceMetres > ordinary.groundStoppingDistanceMetres);
    const x = new THREE.Vector3(1, 0, 0);
    goop.recoverAt(new THREE.Vector3(-2, .46, -10));
    for (let i = 0; i < 120; i++) goop.update(DT, x);
    assert.ok(goop.position.x > 0);
    assert.equal(goop.maximumLocomotionSpeedMetresPerSecond, NORMAL_SPEED);
    assert.ok(Math.abs(goop.velocity.x - NORMAL_SPEED) < 1e-8, 'leaving acid restores the ordinary target');
    goop.recoverAt(new THREE.Vector3(-10, 2.46, 8));
    assert.equal(goop.supportCollider, platform);
    assert.equal(goop.maximumLocomotionSpeedMetresPerSecond, NORMAL_SPEED, 'a dry platform above acid is not acid contact');
    goop.recoverAt(new THREE.Vector3(-10, .46, -10));
    goop.update(DT, ZERO, {pressed: true, held: false, released: true});
    assert.equal(goop.grounded, false);
    assert.equal(goop.maximumLocomotionSpeedMetresPerSecond, NORMAL_SPEED);
    assert.equal(goop.lastJumpSpeedMetresPerSecond, DEFAULT_KINEMATIC_BODY_CONFIG.minimumJumpSpeedMetresPerSecond);
    goop.recoverAt(new THREE.Vector3(10, .46, -10));
    assert.equal(goop.maximumLocomotionSpeedMetresPerSecond, NORMAL_SPEED);
    assert.equal(goop.velocity.lengthSq(), 0);
  } finally {p.dispose(); for (const mesh of [acid, dry, platform]) {mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();}}
});

test('every authored Cultivation pool and both Blackout acid supports grant the same boost', () => {
  const cultivation = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  const bay = new BlackoutMaintenanceBay(maintenanceMaps), transit = new BlackoutTransitRoom();
  try {
    for (const trial of [
      {name: 'Cultivation Room 1', meshes: cultivation.collisionMeshes, position: cultivation.roomOne.root.localToWorld(new THREE.Vector3(10, .46, 15))},
      {name: 'Cultivation Room 2', meshes: cultivation.collisionMeshes, position: cultivation.roomTwo.root.localToWorld(new THREE.Vector3(0, .46, 15))},
      {name: 'Cultivation Room 3', meshes: cultivation.collisionMeshes, position: cultivation.roomThree.root.localToWorld(new THREE.Vector3(0, .46, 20))},
      {name: 'Blackout bay', meshes: bay.collisionMeshes, position: new THREE.Vector3(10, -.49, 15)},
      {name: 'Blackout transit subfloor', meshes: transit.collisionMeshes, position: new THREE.Vector3(17, -.54, 90)},
    ]) {
      const p = physics(trial.meshes);
      try {
        const goop = p.body(trial.position);
        for (let i = 0; i < 90; i++) goop.update(DT, FORWARD);
        assert.ok(goop.grounded, trial.name);
        assert.equal(goop.maximumLocomotionSpeedMetresPerSecond, ACID_SPEED, `${trial.name}: ${goop.supportColliderName}`);
        assert.ok(Math.abs(goop.velocity.z - ACID_SPEED) < 1e-8, trial.name);
      } finally {p.dispose();}
    }
  } finally {cultivation.dispose(); bay.dispose(); transit.dispose();}
});

test('AI reaches the player acid speed and brakes before a blocked path or its destination', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4, .4, 30)); floor.position.set(0, -.2, 15);
  floor.userData.textureRole = 'acid-floor';
  const door = new THREE.Mesh(new THREE.BoxGeometry(4, 3, .4)); door.position.set(0, 1.5, 20);
  const p = physics([floor, door]), companion = new CompanionRegroup();
  const walk: CompanionWalk = {points: [[0, 0, 1], [0, 0, 28]], bounds: [[-1, .3, 0], [1, 1, 30]]};
  try {
    const goop = p.body(new THREE.Vector3(0, .46, 1));
    let maximumSpeed = 0;
    const tick = () => {
      companion.beginStep(); goop.update(DT, companion.steer('goop', goop, walk, p.world)); companion.commit();
      maximumSpeed = Math.max(maximumSpeed, Math.hypot(goop.velocity.x, goop.velocity.z));
    };
    for (let i = 0; i < 360; i++) tick();
    assert.ok(Math.abs(maximumSpeed - ACID_SPEED) < 1e-8);
    assert.ok(goop.position.z < 19.35, `AI must brake before touching the door: ${goop.position.z}`);
    assert.match(companion.passiveInteractions[0]?.label ?? '', /Waiting/);
    p.world.unregister(door);
    for (let i = 0; i < 360; i++) tick();
    assert.ok(Math.abs(goop.position.z - 28) < .65, `AI must stop at the gathering point: ${goop.position.z}`);
    assert.ok(Math.hypot(goop.velocity.x, goop.velocity.z) < 1e-8);
  } finally {p.dispose(); for (const mesh of [floor, door]) {mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();}}
});

test('acid speed multipliers must be positive and finite', () => {
  const p = physics([]);
  try {
    for (const value of [0, -1, Infinity, NaN]) assert.throws(() => new KinematicBody({world: p.world,
      surfaces: new SurfaceRegistry(), initialPosition: ZERO, config: {acidSpeedMultiplier: value}}), /acidSpeedMultiplier/);
  } finally {p.dispose();}
});
