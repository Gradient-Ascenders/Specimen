import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from '../src/levels/CultivationRoomThreeAuthoring.ts';
import { SecurityDrone } from '../src/hazards/SecurityDrone.ts';
import { DroneProjectileSystem } from '../src/hazards/DroneProjectileSystem.ts';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';

test('Room 3 wooden latches release independently and remain down until reset', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.roomThree.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, world, surfaces)!);
  scene.roomThree.bindDissolveTargets(targets);
  const raised = scene.roomThree.wallDrops.map(drop => drop.mesh.position.y);
  scene.roomThree.update(2, []);
  for (const laser of scene.roomThree.lasers.hazards) {
    assert.equal(laser.enabled, false);
    assert.equal(scene.root.getObjectByName(`${laser.id}-wall-mounted-visuals`)!.visible, false);
  }
  for (const [index, drop] of scene.roomThree.wallDrops.entries()) {
    const latch = targets.find(target => target.id === drop.solubleTargetId)!;
    const halfHeight = (drop.mesh.geometry as THREE.BoxGeometry).parameters.height / 2;
    assert.ok(drop.mesh.position.y - halfHeight > 29.8, 'Panel should be stored above the ceiling');
    assert.ok(latch.mesh.position.y < 29.8, 'Wooden latch must remain exposed');
    latch.advance(1);
    scene.roomThree.update(.45, []);
    assert.equal(drop.state, 'falling');
    assert.ok(drop.mesh.position.y < raised[index]);
    const beam = new THREE.Vector3();
    if (index < 3) {
      scene.roomThree.lasers.hazards[index].copyStart(beam);
      assert.ok(Math.abs(beam.y - drop.mesh.position.y) <= halfHeight + 1e-6);
    }
    scene.roomThree.update(.45, []);
    assert.equal(drop.state, 'landed');
    const landedY = drop.mesh.position.y;
    scene.roomThree.update(30, []);
    assert.equal(drop.mesh.position.y, landedY);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let tick = 0; index < 3 && tick < 180; tick++) {
      scene.roomThree.update(1 / 60, []);
      const laser = scene.roomThree.lasers.hazards[index];
      laser.copyStart(beam);
      assert.equal(laser.enabled, true);
      assert.ok(Math.abs(beam.y - landedY) <= halfHeight + 1e-6);
      minY = Math.min(minY, index === 1 ? beam.z : beam.y);
      maxY = Math.max(maxY, index === 1 ? beam.z : beam.y);
    }
    if (index < 3) assert.ok(maxY - minY > (index === 1 ? 7.5 : index === 2 ? 8.8 : halfHeight * 1.95), 'Laser should sweep its full authored travel');
    for (const other of scene.roomThree.wallDrops.slice(index + 1)) assert.equal(other.state, 'suspended');
  }
  scene.reset();
  for (const target of targets) target.reset();
  for (const [index, drop] of scene.roomThree.wallDrops.entries()) {
    assert.equal(drop.state, 'suspended');
    assert.equal(drop.mesh.position.y, raised[index]);
  }
  scene.dispose();
  for (const target of targets) target.dispose();
  world.clear();
  surfaces.clear();
});

test('Blender parkour gaps can be landed with the real charged-jump controller', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  // Evaluate Room 2's solved pose: the release/reset behaviour is covered by
  // LevelTwoPreview.test.ts; here the actual revised landing geometry matters.
  for (const drop of scene.roomTwo.blockDrops) {
    const position = drop.mesh.userData.landingPosition as number[];
    drop.mesh.position.set(position[0], position[1], position[2]);
  }
  scene.root.updateWorldMatrix(true, true);
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.roomThree.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, world, surfaces)!);
  scene.roomThree.bindDissolveTargets(targets);
  for (const drop of scene.roomThree.wallDrops.slice(0, 3)) targets.find(target => target.id === drop.solubleTargetId)!.advance(1);
  scene.roomThree.update(1, []);
  const routes: [2 | 3, string[]][] = [
    [2, ['button-rest-ledge', 'block-1-block', 'block-2-block', 'block-3-block']],
    [3, ['bob-entry', 'bob-launch-island', 'bob-cross-beam']],
    [3, ['bob-first-wall-exit', 'bob-offset-island', 'bob-west-runup']],
    [3, ['bob-west-wall-exit', 'bob-west-return-island', 'bob-cross-room-a', 'bob-cross-room-b']],
    [3, ['bob-final-wall-exit', 'bob-last-island', 'bob-drop-launch']],
  ];
  for (const [room, names] of routes) {
    for (let i = 1; i < names.length; i++) {
      const from = scene.root.getObjectByName(`cultivation-room-${room}-${names[i - 1]}`) as THREE.Mesh;
      const to = scene.root.getObjectByName(`cultivation-room-${room}-${names[i]}`) as THREE.Mesh;
      assert.ok(from && to);
      const a = new THREE.Box3().setFromObject(from);
      const b = new THREE.Box3().setFromObject(to);
      const target = b.getCenter(new THREE.Vector3());
      const start = a.getCenter(new THREE.Vector3());
      const direction = target.clone().sub(start).setY(0).normalize();
      const edge = Math.min(
        Math.abs(direction.x) > 1e-6 ? ((a.max.x - a.min.x) / 2 - .65) / Math.abs(direction.x) : Infinity,
        Math.abs(direction.z) > 1e-6 ? ((a.max.z - a.min.z) / 2 - .65) / Math.abs(direction.z) : Infinity,
      );
      start.addScaledVector(direction, edge).setY(a.max.y + .46);
      const body = new KinematicBody({ world, surfaces, initialPosition: start, config: { reboundEnabled: false } });
      assert.ok(body.grounded, `Takeoff not grounded: ${from.name}`);
      const still = new THREE.Vector3();
      // Descending steps need a short hop; a full-charge jump can intentionally
      // return to an earlier, higher platform in the switchback.
      const chargeSteps = b.max.y < a.max.y - 1 ? 12 : 44;
      for (let step = 0; step < chargeSteps; step++) {
        body.update(1 / 60, still, { pressed: step === 0, held: true, released: false });
      }
      body.update(1 / 60, direction, { pressed: false, held: false, released: true });
      let landed = false;
      for (let step = 0; step < 180; step++) {
        direction.subVectors(target, body.position).setY(0);
        if (direction.length() > .3) direction.normalize(); else direction.set(0, 0, 0);
        body.update(1 / 60, direction);
        if (body.grounded && body.supportCollider === to) { landed = true; break; }
        if (body.position.y < b.min.y - 2) break;
      }
      assert.ok(landed, `Cannot land ${from.name} -> ${to.name}; stopped at ${body.position.toArray()}`);
    }
  }
  scene.dispose();
  for (const target of targets) target.dispose();
  world.clear();
  surfaces.clear();
});

test('Room 3 individual barricades leave an exposed final approach', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const world = new CollisionWorld();
  world.registerAll(scene.collisionMeshes);
  for (let i = 1; i <= 7; i++) {
    const cover = scene.root.getObjectByName(`cultivation-room-3-goop-cover-${i}`) as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(cover);
    const drone = scene.roomThree.root.localToWorld(new THREE.Vector3(0, 1.1, 68));
    assert.ok(drone.z - bounds.max.z >= 14, 'Barricade too close to ground drones');
    assert.ok(bounds.max.x - bounds.min.x <= 5.5, 'Cover should be separate machinery, not a long fence');
  }
  scene.dispose();
  world.clear();
});

test('Bob jumps directly from the final released block to the vent adhesion', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  assert.equal(scene.root.getObjectByName('cultivation-room-2-vent-takeoff-platform'), undefined);
  const block = scene.roomTwo.blockDrops[2].mesh;
  const final = block.userData.landingPosition as number[];
  block.position.set(final[0], final[1], final[2]);
  scene.root.updateWorldMatrix(true, true);
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const start = scene.roomTwo.root.localToWorld(new THREE.Vector3(5.1, 16.46, 41.6));
  const target = scene.roomTwo.root.localToWorld(new THREE.Vector3(8, 18, 44.72));
  const body = new KinematicBody({ world, surfaces, initialPosition: start });
  assert.ok(body.grounded);
  const movement = new THREE.Vector3();
  for (let i = 0; i < 44; i++) body.update(1 / 60, movement, { pressed: i === 0, held: true, released: false });
  movement.subVectors(target, body.position).setY(0).normalize();
  body.update(1 / 60, movement, { pressed: false, held: false, released: true });
  for (let i = 0; i < 120 && !body.attached; i++) {
    movement.subVectors(target, body.position).setY(0).normalize();
    body.update(1 / 60, movement);
  }
  assert.ok(body.attached, `Vent jump missed at ${body.position.toArray()}`);
  assert.equal(body.supportCollider?.name, 'cultivation-room-2-final-vent-sticky-approach');
  scene.dispose();
  world.clear();
  surfaces.clear();
});

test('each hanging drone can detect and fire on its new exposed Bob approach', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  const targets = scene.roomThree.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, world, surfaces)!);
  scene.roomThree.bindDissolveTargets(targets);
  for (const drop of scene.roomThree.wallDrops.slice(0, 3)) targets.find(target => target.id === drop.solubleTargetId)!.advance(1);
  scene.roomThree.update(1, []);
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage);
  const approaches = ['offset-island', 'west-wall-exit', 'final-wall-exit'];
  for (const [i, config] of CULTIVATION_ROOM_THREE_DRONE_AUTHORING.ceilingDrones.entries()) {
    const drone = new SecurityDrone(config.drone, world, surfaces, projectiles);
    scene.roomThree.root.add(drone.root);
    const mesh = scene.root.getObjectByName(`cultivation-room-3-bob-${approaches[i]}`)!;
    const position = mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .7, 0));
    // Drone 2 now watches Bob's exposed climbing face below the wall crest.
    if (i === 1) scene.roomThree.root.localToWorld(position.set(-12.44, 24, 35));
    let fired = false;
    drone.events.on('fired', () => { fired = true; });
    for (const z of [-12, -3, 0]) {
      const sheltered = scene.roomThree.root.localToWorld(new THREE.Vector3(8, 19.26, z));
      for (let tick = 0; tick < 240; tick++) drone.update(1 / 60, [{ slimeId: 'bob', position: sheltered }]);
      assert.equal(fired, false, `${config.drone.id} shoots into the vent`);
      drone.reset();
    }
    for (let tick = 0; tick < 240 && !fired; tick++) drone.update(1 / 60, [{ slimeId: 'bob', position }]);
    assert.ok(fired, `${config.drone.id} cannot pressure its approach`);
    if (i === 2) {
      const sheltered = scene.roomThree.root.localToWorld(new THREE.Vector3(3, 24.8, 50.44));
      drone.reset();
      fired = false;
      for (let tick = 0; tick < 720; tick++) drone.update(1 / 60, [{ slimeId: 'bob', position: sheltered }]);
      assert.equal(fired, false, 'The third wall should provide cover below its opening');
    }
    if (i === 1) {
      for (const height of [22, 26]) {
        const climbingPosition = scene.roomThree.root.localToWorld(new THREE.Vector3(-12.44, height, 35));
        drone.reset();
        fired = false;
        for (let tick = 0; tick < 720 && !fired; tick++) drone.update(1 / 60, [{ slimeId: 'bob', position: climbingPosition }]);
        assert.ok(fired, `Drone 2 cannot see Bob climbing at height ${height}`);
      }
      const fallingPosition = scene.roomThree.root.localToWorld(new THREE.Vector3(-12.44, 24, 35));
      drone.reset();
      fired = false;
      const fallingTarget = { slimeId: 'bob' as const, position: fallingPosition };
      for (let tick = 0; tick < 720 && !fired; tick++) drone.update(1 / 60, [fallingTarget]);
      assert.ok(fired);
      scene.roomThree.root.localToWorld(fallingPosition.set(-12.44, .7, 35));
      fired = false;
      for (let tick = 0; tick < 720; tick++) drone.update(1 / 60, [fallingTarget]);
      assert.equal(fired, false, 'Drone 2 must stop firing when its tracked target reaches the lower room');
    }
    if (i < 2) {
      const coveredPosition = i === 0 ? position : scene.roomThree.root.localToWorld(new THREE.Vector3(-5, 26.2, 42));
      drone.reset();
      fired = false;
      for (let tick = 0; tick < 240 && !fired; tick++) drone.update(1 / 60, [{ slimeId: 'bob', position: coveredPosition }]);
      assert.equal(fired, true, 'The next platform should be exposed before lowering its cover');
      const cover = scene.roomThree.wallDrops[3 + i];
      targets.find(target => target.id === cover.solubleTargetId)!.advance(1);
      scene.roomThree.update(1, []);
      drone.reset();
      projectiles.reset();
      fired = false;
      for (let tick = 0; tick < 240; tick++) drone.update(1 / 60, [{ slimeId: 'bob', position: coveredPosition }]);
      assert.equal(fired, false, `Lowered cover should protect Bob from drone ${i + 1}`);
    }
    drone.dispose();
    projectiles.reset();
  }
  projectiles.dispose();
  for (const target of targets) target.dispose();
  damage.dispose();
  scene.dispose();
  world.clear();
  surfaces.clear();
});

for (const index of [0, 1, 2]) test(`Bob can traverse lowered sticky wall ${index + 1}`, () => {
  const scene = new LevelTwoPreviewScene(() => {});
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes);
  surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.roomThree.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, world, surfaces)!);
  scene.roomThree.bindDissolveTargets(targets);
  const drop = scene.roomThree.wallDrops[index];
  targets.find(target => target.id === drop.solubleTargetId)!.advance(1);
  scene.roomThree.update(1, []);
  const start = scene.roomThree.root.localToWorld(index === 0 ? new THREE.Vector3(1, 22.2, 17.44) : index === 1 ? new THREE.Vector3(-12.44, 24.8, 37) : new THREE.Vector3(3, 24.05, 50.44));
  const body = new KinematicBody({ world, surfaces, initialPosition: start });
  const movement = (index !== 1 ? new THREE.Vector3(0, 1, 1) : new THREE.Vector3(-1, 1, 0)).normalize();
  const local = new THREE.Vector3();
  for (let tick = 0; tick < 180; tick++) {
    body.update(1 / 60, movement);
    scene.roomThree.root.worldToLocal(local.copy(body.position));
    if (index === 0 ? local.z > 19.5 && local.y > 24 : index === 1 ? local.y > 26.7 : local.z > 53 && local.y > 25.85) break;
  }
  assert.ok(index === 0 ? local.z > 19.5 && local.y > 24 : index === 1 ? local.y > 26.7 : local.z > 53 && local.y > 25.85, `Wall exit blocked at ${local.toArray()}`);
  for (const target of targets) target.dispose();
  scene.dispose();
  world.clear();
  surfaces.clear();
});
