import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EmergingSewerDrone, TRANSIT_SEWER_ATTACK_RANGE, TRANSIT_SEWER_EMERGENCE_RANGE } from '../src/hazards/EmergingSewerDrone.ts';
import { WEAK_SEWER_DRONE } from '../src/hazards/WeakSewerDrone.ts';
import { SecurityDronePresentationResources } from '../src/render/hazards/SecurityDronePresentation.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { DroneProjectileSystem } from '../src/hazards/DroneProjectileSystem.ts';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';
import type { SecurityDroneTarget } from '../src/hazards/SecurityDrone.ts';

const DT = 1 / 60;
function fixture() {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const parent = new THREE.Group(), resources = new SecurityDronePresentationResources(undefined, true);
  const damage = new SlimeDamageSystem({}, ['bob', 'goop', 'volt']);
  const projectiles = new DroneProjectileSystem(world, damage, {
    damage: WEAK_SEWER_DRONE.projectileDamage, speedMetresPerSecond: WEAK_SEWER_DRONE.projectileSpeed,
  });
  const enemy = new EmergingSewerDrone('test-sewer', parent, new THREE.Vector3(), world, surfaces, projectiles, resources,
    { routeTarget: new THREE.Vector3(0, 4, -6), acidSurfaceY: 0, sweepMetres: 0 });
  return { enemy, world, damage, projectiles, dispose() {
    enemy.dispose(); projectiles.dispose(); damage.dispose(); resources.dispose(); world.clear(); surfaces.clear();
  } };
}

for (const slimeId of ['bob', 'goop', 'volt'] as const) {
  test(`${slimeId} independently triggers emergence outside attack range, then receives weak-drone shots`, () => {
    const f = fixture();
    const position = new THREE.Vector3(0, 0, -TRANSIT_SEWER_EMERGENCE_RANGE + .5);
    const target: SecurityDroneTarget = { slimeId, position, radiusMetres: .45 };
    let elapsed = 0;
    const shots: number[] = [];
    f.projectiles.events.on('spawned', () => shots.push(elapsed));
    try {
      assert.ok(TRANSIT_SEWER_EMERGENCE_RANGE > TRANSIT_SEWER_ATTACK_RANGE);
      assert.equal(f.enemy.shell.body.visible, true);
      assert.equal(f.enemy.shell.body.position.y, 0, 'dormant body centre sits at the acid surface');
      for (let i = 0; i < 89; i++) {
        elapsed += DT; f.enemy.update(DT, [target], true);
        assert.equal(f.enemy.light.intensity, 0, 'lamp stays off during emergence');
      }
      assert.equal(f.enemy.state.state, 'rebooting');
      const powers = new Set<number>();
      for (let i = 0; i < 120; i++) {
        elapsed += DT; f.enemy.update(DT, [target], true); powers.add(f.enemy.light.intensity);
      }
      assert.equal(f.enemy.state.state, 'active');
      assert.ok(f.enemy.shell.body.position.y > 3.5);
      assert.equal(shots.length, 0, 'activation annulus does not start combat');
      assert.equal(powers.size, 2, 'the active spotlight visibly flickers');
      assert.equal(f.enemy.light.castShadow, false);

      // Approach the visible shell; both LOS and projectiles must ignore its
      // authored dissolve collider rather than hitting the hidden stock proxy.
      position.set(0, 4, -6);
      const approach = elapsed;
      for (let i = 0; i < 150; i++) {
        elapsed += DT; f.enemy.update(DT, [target], true);
        f.projectiles.update(DT, [{ slimeId, position, previousPosition: position, radiusMetres: .45 }]);
      }
      assert.ok(shots.length >= 3, 'real weapon can fire past its own soluble shell');
      assert.ok(shots[0]! - approach >= WEAK_SEWER_DRONE.warningSeconds);
      for (let i = 1; i < shots.length; i++) assert.ok(Math.abs(shots[i]! - shots[i - 1]! - .65) < DT * 1.1);
      assert.ok(f.damage.health.find(h => h.slimeId === slimeId)!.health < 100);
      for (const other of f.damage.health) if (other.slimeId !== slimeId) assert.equal(other.health, 100);
      f.enemy.state.destroy(); f.enemy.update(DT, [target], true);
      assert.equal(f.enemy.light.intensity, 0); assert.equal(f.enemy.shell.body.visible, false);
      assert.ok(f.projectiles.states.every(s => !s.active), 'destroyed owner releases pooled shots');
    } finally { f.dispose(); }
  });
}

test('visible dormant shells stay passive and rise continuously from their half-submerged pose', () => {
  const f = fixture();
  const target: SecurityDroneTarget = { slimeId: 'bob', position: new THREE.Vector3(0, 0, -20) };
  try {
    for (let i = 0; i < 120; i++) f.enemy.update(DT, [target], true);
    assert.equal(f.enemy.state.state, 'dormant'); assert.equal(f.enemy.shell.body.position.y, 0);
    assert.equal(f.enemy.weapon.readModel.enabled, false); assert.equal(f.enemy.light.intensity, 0);
    f.enemy.shell.body.updateWorldMatrix(true, false);
    const bounds = f.enemy.shell.body.geometry.boundingBox!.clone().applyMatrix4(f.enemy.shell.body.matrixWorld);
    assert.ok(bounds.min.y < -.5 && bounds.max.y > .5, 'acid crosses the body, not just a rotor');
    assert.ok(Math.abs(bounds.max.y + bounds.min.y) < .03, 'approximately half of the body is above acid');
    target.position.set(0, 0, -15);
    let previous = 0;
    for (let i = 0; i < 90; i++) {
      f.enemy.update(DT, [target], true);
      const y = f.enemy.shell.body.position.y;
      assert.ok(y >= previous, 'emergence never reverses or teleports back');
      assert.ok(y - previous < .09, 'a fixed tick cannot snap to the operational height');
      previous = y;
    }
    f.enemy.reset(); assert.equal(f.enemy.shell.body.position.y, 0); assert.equal(f.enemy.shell.body.visible, true);
    assert.equal(f.enemy.weapon.readModel.enabled, false);
  } finally { f.dispose(); }
});

test('route beam and detection agree, ignore off-cone slimes and respect solid cover', () => {
  const f = fixture();
  const position = new THREE.Vector3(4, 4, -4);
  const target: SecurityDroneTarget = { slimeId: 'bob', position };
  const cover = new THREE.Mesh(new THREE.BoxGeometry(3, 3, .3), new THREE.MeshBasicMaterial());
  let shots = 0; f.projectiles.events.on('spawned', () => shots++);
  try {
    for (let i = 0; i < 240; i++) f.enemy.update(DT, [target], true);
    assert.equal(shots, 0, 'nearby slimes outside the visible cone are not shot');
    assert.equal(f.enemy.weapon.readModel.targetSlimeId, undefined);
    const gaze = new THREE.Vector3().copy(f.enemy.weapon.readModel.scanDirection);
    const lightDirection = f.enemy.light.target.position.clone().sub(f.enemy.light.position).normalize();
    assert.ok(gaze.distanceTo(lightDirection) < 1e-9);
    assert.ok(gaze.distanceTo(new THREE.Vector3(0, 0, -1)) < .04, 'gaze stays on the authored route');
    assert.ok(f.enemy.light.angle > .27 && f.enemy.light.angle < .28, '25% wider coverage retains a focused security beam');
    cover.position.set(0, 4, -3.5); cover.updateMatrixWorld(); f.world.register(cover);
    position.set(0, 4, -6);
    for (let i = 0; i < 120; i++) f.enemy.update(DT, [target], true);
    assert.equal(shots, 0, 'solid cover still protects Bob inside the beam');
    f.world.unregister(cover);
    for (let i = 0; i < 120; i++) f.enemy.update(DT, [target], true);
    assert.ok(shots > 0, 'clearing LOS restores normal warning and combat');
  } finally { f.world.unregister(cover); cover.geometry.dispose(); cover.material.dispose(); f.dispose(); }
});

test('checkpoint restores the actual emergence pose and continues the same smooth scan', () => {
  const f = fixture();
  const target: SecurityDroneTarget = { slimeId: 'goop', position: new THREE.Vector3(0, 0, -15) };
  try {
    for (let i = 0; i < 45; i++) f.enemy.update(DT, [target], true);
    const saved = f.enemy.capture();
    assert.equal(saved.state, 'rebooting'); assert.ok(saved.position![1]! > .5);
    f.enemy.update(DT, [target], true);
    const next = f.enemy.capture();
    f.enemy.reset(); f.enemy.restore(saved);
    assert.deepEqual(f.enemy.shell.body.position.toArray(), saved.position);
    f.enemy.update(DT, [target], true);
    assert.deepEqual(f.enemy.shell.body.position.toArray(), next.position);
    assert.ok(f.enemy.shell.body.quaternion.angleTo(new THREE.Quaternion().fromArray(next.rotation!)) < 1e-7);
  } finally { f.dispose(); }
});
