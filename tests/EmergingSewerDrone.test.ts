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
  const enemy = new EmergingSewerDrone('test-sewer', parent, new THREE.Vector3(), world, surfaces, projectiles, resources);
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
      assert.equal(f.enemy.shell.body.visible, false);
      assert.ok(f.enemy.shell.body.position.y < -2);
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
