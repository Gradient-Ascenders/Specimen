import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { CollisionWorld, ColliderTransformMode } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';

const DT = 1 / 60;
function fixture(x = -16, z = 117.5) {
  const room = new BlackoutTransitRoom(), world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes, undefined, ColliderTransformMode.Static); surfaces.registerAll(room.collisionMeshes);
  const electricalTargets = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets });
  const makeBody = (position: THREE.Vector3) => new KinematicBody({ world, surfaces, initialPosition: position,
    config: { adhesionEnabled: false, reboundEnabled: false, chargedJumpEnabled: false } });
  const bodies = { bob: makeBody(new THREE.Vector3(6, .86, 84)), goop: makeBody(new THREE.Vector3(8, .86, 84)),
    volt: makeBody(new THREE.Vector3(x, 2.96, z)) };
  const enemy = controller.emergingDrones[2]!;
  const zero = new THREE.Vector3(), lightDirection = new THREE.Vector3();
  let acquired = 0, shots = 0, impacts = 0, minimumHealth = 100;
  let firstAcquiredZ: number | undefined, firstImpactZ: number | undefined;
  const blockers: string[] = [];
  enemy.weapon.events.on('acquired', event => { if (event.slimeId === 'volt') { acquired++; firstAcquiredZ ??= bodies.volt.position.z; } });
  enemy.weapon.events.on('fired', event => { if (event.slimeId === 'volt') shots++; });
  controller.projectiles.events.on('slimeImpact', event => {
    if (event.ownerDroneId === enemy.id && event.slimeId === 'volt') { impacts++; firstImpactZ ??= bodies.volt.position.z; }
  });
  controller.projectiles.events.on('worldImpact', event => { if (event.ownerDroneId === enemy.id) blockers.push(event.objectName); });
  controller.setActive(true);
  return { room, world, surfaces, controller, bodies, enemy,
    tick(direction = zero) {
      bodies.volt.update(DT, direction); controller.update(DT, bodies);
      minimumHealth = Math.min(minimumHealth, controller.damage.health.find(h => h.slimeId === 'volt')!.health);
      if (enemy.weapon.readModel.enabled) {
        lightDirection.subVectors(enemy.light.target.position, enemy.light.position).normalize();
        assert.ok(lightDirection.dot(enemy.weapon.readModel.scanDirection as THREE.Vector3) > 1 - 1e-10,
          'the following spotlight and AI must retain the same actual gaze');
      }
    },
    result: () => ({ acquired, shots, impacts, minimumHealth, blockers, firstAcquiredZ, firstImpactZ }),
    dispose() { controller.dispose(); electricalTargets.dispose(); room.dispose(); world.clear(); surfaces.clear(); },
  };
}

for (const [x, z] of [[-16, 130], [-16, 132], [-16, 134], [-15.3, 132], [-15.28, 132]]) {
  test(`Volt-side live shots clear authored railing at grounded route position ${x},${z}`, () => {
    const f = fixture(x, z);
    try {
      for (let i = 0; i < 2400 && !f.result().impacts; i++) f.tick();
      const result = f.result();
      assert.ok(f.bodies.volt.grounded && Math.abs(f.bodies.volt.position.y - 2.96001) < 1e-5);
      assert.ok(result.impacts > 0 && result.minimumHealth === 0, JSON.stringify(result));
    } finally { f.dispose(); }
  });
}

for (const x of [-16, -15.28]) for (const warmup of [0, 2, 4, 6, 8, 10, 12]) {
  test(`Volt is detected and damaged while continuously traversing x=${x} after ${warmup}s emergence/scan warmup`, () => {
    const f = fixture(x);
    const forward = new THREE.Vector3(0, 0, 1);
    try {
      for (let i = 0; i < warmup / DT; i++) f.tick();
      for (let i = 0; i < 360 && !f.result().impacts; i++) f.tick(forward);
      const result = f.result();
      assert.ok(f.bodies.volt.grounded && f.bodies.volt.position.z < 136, 'a real lethal hit ends the run before the crossing');
      assert.ok(f.bodies.volt.velocity.z > 5.49, 'the response must work at the normal 5.5 m/s running speed');
      assert.ok(result.acquired > 0 && result.impacts > 0 && result.minimumHealth === 0, JSON.stringify(result));
    } finally { f.dispose(); }
  });
}

for (const x of [-16, -15.28]) {
  test(`an uninterrupted run from the catwalk entry at x=${x} wakes the guard and takes a live hit`, () => {
    const f = fixture(x, 90), forward = new THREE.Vector3(0, 0, 1);
    try {
      assert.equal(f.enemy.state.state, 'dormant');
      for (let i = 0; i < 600 && !f.result().impacts; i++) f.tick(forward);
      const result = f.result();
      assert.ok(f.bodies.volt.grounded && f.bodies.volt.position.z < 136 && f.bodies.volt.velocity.z > 5.49);
      assert.ok(result.acquired > 0 && result.impacts > 0 && result.minimumHealth === 0, JSON.stringify(result));
    } finally { f.dispose(); }
  });
}

test('solid authored-style cover still blocks the Volt-side guard without changing catwalk colliders', () => {
  const f = fixture(-16, 132);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(.2, 4, 12), new THREE.MeshBasicMaterial());
  cover.name = 'test-solid-cover'; cover.position.set(-14, 4, 132); cover.updateMatrixWorld(); f.world.register(cover);
  try {
    for (let i = 0; i < 900; i++) f.tick();
    assert.equal(f.enemy.state.state, 'active');
    assert.equal(f.result().acquired, 0); assert.equal(f.result().impacts, 0); assert.equal(f.result().minimumHealth, 100);
  } finally { f.world.unregister(cover); cover.geometry.dispose(); (cover.material as THREE.Material).dispose(); f.dispose(); }
});

test('a guard that acquired Volt drops him behind solid cover and can reacquire after it is removed', () => {
  const f = fixture(-16, 132);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(.2, 4, 12), new THREE.MeshBasicMaterial());
  cover.name = 'test-solid-cover'; cover.position.set(-14, 4, 132); cover.updateMatrixWorld();
  try {
    for (let i = 0; i < 2400 && !f.result().acquired; i++) f.tick();
    const impacts = f.result().impacts; assert.equal(impacts, 0); assert.ok(f.result().acquired > 0);
    f.world.register(cover);
    for (let i = 0; i < 300; i++) f.tick();
    assert.equal(f.result().impacts, impacts, 'acquired-target following must not bypass cover');
    assert.equal(f.enemy.weapon.readModel.targetSlimeId, undefined);
    f.world.unregister(cover);
    for (let i = 0; i < 1800 && f.result().impacts === impacts; i++) f.tick();
    assert.ok(f.result().impacts > impacts, 'the guard returns to its route scan and reacquires normally');
  } finally { f.world.unregister(cover); cover.geometry.dispose(); (cover.material as THREE.Material).dispose(); f.dispose(); }
});
