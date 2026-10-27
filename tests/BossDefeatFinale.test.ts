import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ENDING_TIMING as T, ENDING_ANCHOR, ENDING_DIALOGUE, endingBeamCollision, sampleEndingSlime,
  sampleEndingDrone, endingDroneEntryTime, endingDroneDeathTime, endingShot, sampleEndingBossWreck, sampleEndingIncomingShot,
  endingGoopHitTime, sampleEndingGoopHit } from '../src/cinematics/BossDefeatTimeline.ts';
import { endingTerrainHeight } from '../src/cinematics/BossDefeatTerrain.ts';
import { BossDefeatEffects } from '../src/cinematics/BossDefeatEffects.ts';
import { BossDefeatSet } from '../src/cinematics/BossDefeatSet.ts';
import { BossDefeatCamera } from '../src/cinematics/BossDefeatCamera.ts';
import { FINAL_ARENA, FINAL_ARENA_RING } from '../src/boss/FinalBossConfig.ts';

test('ending preserves the exact last-stand conversation and gives silence before daylight', () => {
  assert.deepEqual(ENDING_DIALOGUE.map(l => [l.speaker, l.text]), [
    ['volt', 'We need to get out of here quickly!'], ['goop', 'I’ll hold them off! Go, now!'],
    ['volt', 'But—'], ['goop', 'I SAID GO!'], ['goop', 'Goodbye… my friends.'],
  ]);
  for (let i = 1; i < ENDING_DIALOGUE.length; i++) assert.ok(ENDING_DIALOGUE[i]!.start >= ENDING_DIALOGUE[i - 1]!.end);
  assert.ok(T.explosion - T.impact >= 10 && T.explosion - T.impact < 20); assert.ok(T.daylight - T.black >= 4);
  assert.ok(T.leave > ENDING_DIALOGUE[3]!.end); assert.ok(T.credits > T.daylight + 15);
  assert.equal(endingShot(T.black + 2), 'silence'); assert.equal(endingShot(T.credits), 'credits');
});

test('beam deadlock never favors either emitter and uses equal radii', () => {
  const fx = new BossDefeatEffects(), from = ENDING_ANCHOR.clone().add(new THREE.Vector3(0, .8, 1.2));
  const to = new THREE.Vector3(0, 11.7, FINAL_ARENA.centreZ - 34), center = new THREE.Vector3();
  try {
    for (let t = T.impact; t < T.explosion; t += .1) {
      endingBeamCollision(t, from, to, center);
      assert.ok(Math.abs(center.distanceTo(from) - center.distanceTo(to)) < 1.41);
      fx.present(t, from, to, ENDING_ANCHOR); assert.equal(fx.diagnostics.equalBeamRadius, true);
      assert.equal(fx.diagnostics.beamVisible, true);
    }
    fx.present(T.specimenFire - .01, from, to, ENDING_ANCHOR); assert.equal(fx.diagnostics.specimenBeamLaunched, false);
    fx.present(T.specimenFire + .08, from, to, ENDING_ANCHOR); assert.equal(fx.diagnostics.beamsLaunched, true); assert.equal(fx.diagnostics.beamVisible, false);
    assert.equal(fx.diagnostics.specimenBeamLaunched, true); assert.ok(T.impact - T.specimenFire < .25);
    const tip = new THREE.Vector3().fromArray(fx.diagnostics.tips[0]!); assert.ok(tip.distanceTo(from) > 5 && tip.distanceTo(from) < from.distanceTo(to) / 2);
    assert.ok(new THREE.Vector3().fromArray(fx.diagnostics.tips[1]!).distanceTo(tip) > 10, 'the two launched beams must visibly travel before contact');
    fx.present(T.explosion, from, to, ENDING_ANCHOR); assert.equal(fx.diagnostics.beamVisible, false);
  } finally { fx.dispose(); }
});

test('violent unmerge lands all three on the actual annular deck, then they converge', () => {
  const point = new THREE.Vector3(), target = new THREE.Vector3();
  for (const id of ['bob', 'goop', 'volt'] as const) {
    assert.equal(sampleEndingSlime(id, T.split - .01, point).visible, false);
    assert.ok(T.landing - T.split < 1.5);
    assert.equal(sampleEndingSlime(id, (T.split + T.landing) / 2, point).airborne, true); assert.ok(point.y > 5);
    sampleEndingSlime(id, T.landing, point);
    const radius = Math.hypot(point.x, point.z - FINAL_ARENA.centreZ);
    assert.ok(radius > FINAL_ARENA_RING.innerRadius && radius < FINAL_ARENA_RING.outerRadius);
    sampleEndingSlime(id, T.together, target); assert.ok(point.distanceTo(target) > 5); assert.ok(target.distanceTo(ENDING_ANCHOR) < 9);
  }
});

test('Bob stops and looks back while Volt continues, then catches him with low forward hops', () => {
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  sampleEndingSlime('bob', T.lookBack + .55, p); sampleEndingSlime('bob', T.lookBack + .64, q); assert.equal(p.z, q.z);
  assert.equal(sampleEndingSlime('bob', T.lookBack + .64, q).facing, 0);
  const turning = sampleEndingSlime('bob', T.lookBack + 1.2, q); assert.ok(turning.facing > 0 && turning.facing < Math.PI);
  sampleEndingSlime('bob', T.lookBack + 1, p); const pose = sampleEndingSlime('bob', T.runAgain - .1, q);
  assert.equal(p.z, q.z); assert.equal(pose.facing, Math.PI);
  sampleEndingSlime('volt', T.lookBack + 1, p); sampleEndingSlime('volt', T.runAgain - .1, q); assert.ok(q.z < p.z - 12);
  sampleEndingSlime('bob', T.runAgain + 2, p); sampleEndingSlime('bob', T.runAgain + 3, q); assert.ok(q.z < p.z - 6);
  for (let t = T.leave; t < T.black; t += .05) { sampleEndingSlime('bob', t, p); assert.ok(p.y < 1.53); }
  assert.equal(sampleEndingSlime('goop', T.daylight, p).visible, false);
});

test('reinforcements emerge from six wall bays in distinct lanes and die to Goop’s fire', () => {
  const point = new THREE.Vector3(), other = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    assert.equal(sampleEndingDrone(i, endingDroneEntryTime(i) - .001, point), false);
    assert.equal(sampleEndingDrone(i, endingDroneEntryTime(i), point), true);
    assert.ok(Math.hypot(point.x, point.z - FINAL_ARENA.centreZ) > 100);
    assert.equal(sampleEndingDrone(i, T.sacrifice, point), true);
    if (i > 0) { sampleEndingDrone(i - 1, T.sacrifice, other); assert.ok(point.distanceTo(other) > 1.2); }
    if (Number.isFinite(endingDroneDeathTime(i))) assert.equal(sampleEndingDrone(i, endingDroneDeathTime(i), point), false);
  }
  let remaining = 0;
  for (let i = 0; i < 24; i++) if (sampleEndingDrone(i, T.destruction - .5, point)) remaining++;
  assert.ok(remaining >= 12, 'a substantial part of the wave must survive the last stand');
  for (let i = 0; i < 24; i++) assert.equal(sampleEndingDrone(i, T.destruction, point), false);
});

test('the boss wreck falls progressively into the pit after the explosion', () => {
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  sampleEndingBossWreck(T.bossDrop, p); sampleEndingBossWreck(T.bossLost - .1, q);
  assert.ok(p.y < FINAL_ARENA.floorY && q.y < p.y - 100);
  assert.ok(Math.hypot(q.x, q.z - FINAL_ARENA.centreZ) < FINAL_ARENA_RING.innerRadius - 20);
});

test('Goop faces the drones and receives return fire only after his friends leave', () => {
  const from = new THREE.Vector3(), to = new THREE.Vector3(), goop = new THREE.Vector3(), nearest = new THREE.Vector3();
  assert.ok(T.returnFire > T.leave && T.returnFire < T.leave + 1);
  assert.ok(T.goodbyeEnd - T.goodbye < 3 && T.runAgain - T.goodbye < 4);
  assert.equal(sampleEndingIncomingShot(2, T.returnFire - .1, from, to), false);
  let shots = 0, dodge = 0;
  for (let t = T.goodbye; t < T.hideGoop; t += .2) {
    const pose = sampleEndingSlime('goop', t, goop); assert.equal(pose.facing, -Math.PI / 2);
    dodge = Math.max(dodge, Math.abs(goop.z - (ENDING_ANCHOR.z - 4)));
    for (let i = 0; i < 24; i++) if (sampleEndingIncomingShot(i, t, from, to)) {
      shots++; sampleEndingSlime('goop', t + .5, goop); new THREE.Line3(from, to).closestPointToPoint(goop, true, nearest);
      assert.ok(nearest.distanceTo(goop) > .7, 'incoming shots must not visibly intersect Goop');
    }
  }
  assert.ok(shots > 100 && dodge > .4);
  assert.equal(sampleEndingSlime('goop', T.destruction, goop).visible, false);
  for (let i = 0; i < 3; i++) {
    const hit = endingGoopHitTime(i); sampleEndingGoopHit(i, from, to); sampleEndingSlime('goop', hit, goop); goop.y += .48;
    assert.ok(to.distanceTo(goop) < .35); assert.ok(hit > T.leave && hit < T.hideGoop);
  }
});

test('the exit slab meets rather than overlaps the tunnel, and the exterior is contoured, populated terrain', () => {
  const set = new BossDefeatSet(); try {
    const floor = set.passage.getObjectByName('escape-tunnel-floor') as THREE.Mesh;
    const pad = set.exterior.getObjectByName('worn-egress-concrete') as THREE.Mesh;
    assert.equal(pad.position.z + pad.scale.z / 2, floor.position.z - floor.scale.z / 2);
    assert.ok(pad.scale.z < 2, 'only a doorstep remains, not a concrete apron');
    for (const id of ['bob', 'volt'] as const) {
      const position = new THREE.Vector3(); sampleEndingSlime(id, T.sky, position);
      assert.ok(position.z < pad.position.z - pad.scale.z / 2);
      assert.ok(Math.abs(position.y - endingTerrainHeight(position.x, position.z) - .47) < .001);
    }
    const matrix = new THREE.Matrix4(), blade = new THREE.Vector3(); let nearbyGrass = 0;
    for (let i = 0; i < set.terrain.grass.count; i++) {
      set.terrain.grass.getMatrixAt(i, matrix); blade.setFromMatrixPosition(matrix);
      if (Math.abs(blade.x) < 8 && blade.z > 80 && blade.z < 108) nearbyGrass++;
    }
    assert.ok(nearbyGrass > 400, 'grass must grow around the final standing positions');
    assert.ok(set.terrain.ground.geometry.getAttribute('position').count > 40000);
    assert.equal(set.terrain.trees.count, 240); assert.equal(set.terrain.grass.count, 9600);
    for (const x of [-7, 0, 7]) for (const z of [74, 100, 109]) assert.ok(endingTerrainHeight(x, z) < .4);
    for (const x of [-6, 0, 6]) for (const z of [115, 130, 145, 180]) assert.ok(endingTerrainHeight(x, z) < .4);
    const ground = set.terrain.ground.geometry.getAttribute('position');
    for (let i = 0; i < ground.count; i++) assert.ok(ground.getZ(i) < 110, 'terrain triangles must end outside the facade');
    assert.ok(endingTerrainHeight(240, -520) > 30);
    set.present(T.leave); assert.ok(set.passage.getObjectByName('daylight-exit-door'));
    set.present(T.daylight + 2); assert.ok(set.sun.intensity > 0);
  } finally { set.dispose(); }
});

test('debris, smoke and beams stay inside fixed capacities across the complete movie', () => {
  const set = new BossDefeatSet(), fx = new BossDefeatEffects(), boss = new THREE.Vector3(0, 12, FINAL_ARENA.centreZ - 34);
  const source = ENDING_ANCHOR.clone().add(new THREE.Vector3(0, .8, 1.2)), goop = new THREE.Vector3();
  let maxSmoke = 0, maxDebris = 0;
  try {
    for (let t = 0; t <= T.duration; t += .2) {
      sampleEndingSlime('goop', t, goop); set.present(t); fx.present(t, source, boss, goop);
      assert.ok(fx.smoke.count <= 192 && fx.sparks.count <= 256 && fx.rings.count <= 24 && fx.bolts.count <= 64 && fx.incoming.count <= 64);
      assert.ok(set.debris.count <= 224 && set.wreckage.count <= 48 && set.structural.count <= 48);
      maxSmoke = Math.max(maxSmoke, fx.smoke.count); maxDebris = Math.max(maxDebris, set.debris.count);
      for (const pool of [fx.smoke, fx.sparks, fx.bolts, fx.incoming, fx.rings, fx.explosions, set.debris, set.wreckage, set.structural])
        assert.ok(Array.from(pool.instanceMatrix.array.subarray(0, pool.count * 16)).every(Number.isFinite));
    }
    assert.ok(maxSmoke >= 140 && maxDebris >= 30);
    set.present(T.destruction + 3); fx.present(T.destruction + 3, source, boss, goop);
    assert.ok(set.structural.count > 20 && fx.explosions.count > 0);
    set.reset(); assert.equal(set.root.visible, false); assert.equal(set.sun.intensity, 0);
  } finally { fx.dispose(); set.dispose(); }
});

test('every authored camera remains finite, upright and below the ceiling indoors', () => {
  const track = new BossDefeatCamera(), camera = new THREE.PerspectiveCamera(52, 16 / 9), p = new THREE.Vector3(), g = new THREE.Vector3(), v = new THREE.Vector3();
  const source = ENDING_ANCHOR.clone().add(new THREE.Vector3(0, .8, 1.2)), boss = new THREE.Vector3(0, 11.7, FINAL_ARENA.centreZ - 34), collision = new THREE.Vector3();
  for (let t = 0; t < T.duration; t += .1) {
    sampleEndingSlime('bob', t, p); sampleEndingSlime('goop', t, g); sampleEndingSlime('volt', t, v); endingBeamCollision(t, source, boss, collision);
    track.present(camera, t, source, boss, collision, p, g, v);
    assert.ok([...camera.position.toArray(), ...camera.quaternion.toArray()].every(Number.isFinite));
    assert.ok(camera.position.y > .4); if (t < T.black) assert.ok(camera.position.y < FINAL_ARENA.ceilingY - 2);
    assert.ok(camera.up.equals(new THREE.Vector3(0, 1, 0)));
    if (t >= T.destruction && t < T.black) {
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      assert.equal(frustum.containsPoint(ENDING_ANCHOR), false, 'the final wide must look away from the doorway and Goop’s position');
      assert.equal(frustum.containsPoint(g), false);
      for (const x of [-7, 0, 7]) for (const z of [190, 390]) assert.equal(frustum.containsPoint(new THREE.Vector3(x, 4, z)), false);
    }
  }
});
