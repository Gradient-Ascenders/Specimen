import { AcidSurfaceMaterial } from '../src/render/environment/containment/AcidSurfaceMaterial.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationMaintenanceArt } from '../src/render/environment/cultivation/CultivationMaintenanceArt.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SecurityNetworkController } from '../src/puzzle/SecurityNetworkController.ts';
import { CultivationRoomFiveController } from '../src/levels/CultivationRoomFiveController.ts';
import { LevelTwoRoomFiveGreybox, ROOM_FIVE_SAFE_STATIONS, ROOM_FIVE_ROUTE_NETWORKS } from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import { RoomFiveDroneEncounter } from '../src/hazards/RoomFiveDroneEncounter.ts';
import { CollisionWorld, ColliderTransformMode, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { createAuthoredDissolveTarget } from '../src/abilities/DissolveTarget.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { AcidProjectileSystem } from '../src/abilities/AcidProjectileSystem.ts';
import { ROOM_FIVE_JUMPS } from '../src/levels/RoomFiveParkour.ts';
import { RoomFivePatrol } from '../src/hazards/RoomFivePatrol.ts';

test('pausing one patrol creates a shared four-second opening; reset removes the offset', () => {
  const forward = new THREE.Vector3(0, -.3, -1).normalize();
  const a = new RoomFivePatrol(new THREE.Vector3(), forward, 0);
  const b = new RoomFivePatrol(new THREE.Vector3(), forward, Math.PI);
  const bothAway = () => a.direction.dot(forward) < Math.cos(.65) && b.direction.dot(forward) < Math.cos(.65);
  for (let i = 0; i < 720; i++) {
    a.update(1 / 60, true); b.update(1 / 60, true);
    assert.equal(bothAway(), false, 'unaltered guards cover each other');
  }
  a.reset(); b.reset();
  const frozen = a.position.clone();
  for (let i = 0; i < 360; i++) { a.update(1 / 60, false); b.update(1 / 60, true); }
  assert.deepEqual(a.position, frozen);
  let consecutive = 0, longest = 0;
  for (let i = 0; i < 720; i++) {
    a.update(1 / 60, true); b.update(1 / 60, true);
    consecutive = bothAway() ? consecutive + 1 : 0; longest = Math.max(longest, consecutive);
  }
  assert.ok(longest >= 240, `shared window ${longest / 60}s`);
  a.reset(); b.reset(); assert.equal(bothAway(), false);
});

test('room switch networks pause only their own patrols and retry resets every clock', () => {
  const s = setup();
  try {
    assert.equal(s.encounter.drones.length, 9);
    s.room.controller.security.select('red');
    for (let i = 0; i < 120; i++) s.encounter.update(1 / 60);
    for (let i = 0; i < 9; i++) {
      assert.equal(s.encounter.patrols[i].elapsed === 0, s.encounter.drones[i].root.userData.network === 'red');
    }
    s.encounter.reset();
    assert.ok(s.encounter.patrols.every(p => p.elapsed === 0));
    assert.equal(s.room.root.getObjectByName('room-5-security-mount-0'), undefined);
  } finally { s.dispose(); }
});

test('network changes are exclusive, repeatable, and cannot undo rescue shutdown', () => {
  const c = new SecurityNetworkController();
  const colours = ['red', 'blue', 'green'] as const;
  assert.ok(colours.every(n => c.isEnabled(n)));
  for (let i = 0; i < 30; i++) {
    c.select(colours[i % 3]); assert.equal(colours.filter(n => !c.isEnabled(n)).length, 1);
  }
  c.release(); c.select('red'); assert.ok(colours.every(n => !c.isEnabled(n)));
  c.reset(); assert.ok(colours.every(n => c.isEnabled(n)));
});

for (const [label, viewer, partner, landing] of [
  ['first blue', 6, 0, [-14.5, 10.9, 28.2]],
  ['later green', 2, 7, [-12.5, 17.7, 54]],
  ['final green', 5, 8, [5, 27.9, 37]],
] as const) test(`${label} patrol reaches the landing without its red partner blocking it`, () => {
  const s = setup();
  try {
    const blue = s.encounter.drones[viewer], red = s.encounter.drones[partner];
    const bluePatrol = s.encounter.patrols[viewer], redPatrol = s.encounter.patrols[partner];
    const target = s.room.root.localToWorld(new THREE.Vector3(...landing));
    const origin = new THREE.Vector3(), delta = new THREE.Vector3(), hit = new CollisionHit();
    const shadowRay = new THREE.Raycaster();
    const redShell = red.root.getObjectByName(`${red.id}-flying-shell`)!;
    const modelForward = new THREE.Vector3(0, 0, -1);
    let facingSamples = 0;
    for (let bluePhase = 0; bluePhase < 48; bluePhase++) {
      bluePatrol.elapsed = bluePhase / 4; bluePatrol.update(0, false);
      blue.root.position.copy(bluePatrol.position);
      origin.copy(bluePatrol.position).addScaledVector(bluePatrol.direction, 1.4); s.room.root.localToWorld(origin);
      delta.copy(target).sub(origin);
      if (delta.dot(bluePatrol.direction) / delta.length() < Math.cos(.4)) continue;
      facingSamples++;
      assert.ok(delta.length() < 15, 'landing within the searchlight range');
      for (let redPhase = 0; redPhase < 48; redPhase++) {
        redPatrol.elapsed = redPhase / 4; redPatrol.update(0, false); red.root.position.copy(redPatrol.position);
        const blocked = s.world.sweepSphere(origin, delta, .001, hit, CollisionLayer.LineOfSight, blue.collider);
        assert.equal(blocked, false, `blue ${bluePhase}, red ${redPhase}: ${hit.object?.name}`);
        redShell.quaternion.setFromUnitVectors(modelForward, redPatrol.direction);
        red.root.updateWorldMatrix(true, true);
        shadowRay.set(origin, delta.clone().normalize()); shadowRay.far = delta.length();
        assert.equal(shadowRay.intersectObject(redShell, true).length, 0, 'red visible hardware cannot shadow the landing');
      }
    }
    assert.ok(facingSamples > 8, 'a useful portion of the patrol faces the landing');
  } finally { s.dispose(); }
});

test('red guards have sustained clear sightlines onto their authored jumping platforms', () => {
  const s = setup();
  try {
    for (const index of [0, 3, 7, 8]) {
      const drone = s.encounter.drones[index], patrol = s.encounter.patrols[index];
      const route = drone.root.userData.route as number;
      let clearFrames = 0;
      for (let frame = 0; frame < 48; frame++) {
        patrol.elapsed = frame / 4; patrol.update(0, false); drone.root.position.copy(patrol.position);
        const origin = s.room.root.localToWorld(patrol.position.clone().addScaledVector(patrol.direction, 1.4));
        if (ROOM_FIVE_JUMPS[route].some(([x, y, z]) => {
          const delta = s.room.root.localToWorld(new THREE.Vector3(x, y + .66, z)).sub(origin);
          return delta.length() < 15 && delta.clone().normalize().dot(patrol.direction) >= Math.cos(.4)
            && !s.world.sweepSphere(origin, delta, .001, new CollisionHit(), CollisionLayer.LineOfSight, drone.collider);
        })) clearFrames++;
      }
      assert.ok(clearFrames >= 8, `${drone.id}: only ${clearFrames} clear patrol samples`);
    }
  } finally { s.dispose(); }
});

test('release control is a lever and the dry reunion floor stays absent until release', () => {
  const s = setup();
  try {
    assert.equal(s.room.lever.name, 'room-5-manual-release-lever');
    assert.notEqual(s.room.lever.userData.surfaceTag, 'sticky');
    const floor = s.room.root.getObjectByName('room-5-reunion-floor')!;
    assert.equal(floor.visible, false);
    assert.equal(s.room.isAcidAt(s.room.root.localToWorld(new THREE.Vector3(4, .4, 65))), true);
    const position = s.room.root.localToWorld(new THREE.Vector3(0, 29.66, 28));
    s.room.update(3, [{ id: 'bob', position }]);
    assert.equal(s.room.controller.releasing, false, 'early lever use cannot bypass cooperation');
    assert.equal(s.room.controller.leverProgress, 0);
    s.room.controller.destroyBrokenDrone();
    s.room.update(3, [{ id: 'bob', position }]);
    assert.equal(s.room.controller.releasing, false, 'destroying the drone alone is insufficient');
    s.room.controller.update(.1, false, true, true, false);
    assert.equal(s.room.controller.checkpoint, 'controls');
    s.room.update(1.5, [{ id: 'bob', position }]);
    assert.equal(s.room.controller.releasing, true);
    assert.ok(s.room.lever.rotation.x > 1);
    assert.equal(floor.visible, true);
    assert.equal(s.room.isAcidAt(s.room.root.localToWorld(new THREE.Vector3(4, .4, 65))), false);
  } finally { s.dispose(); }
});

test('terminal, exit and dry-floor exceptions reject below-floor and out-of-bounds bodies', () => {
  const s = setup();
  try {
    s.room.restoreCheckpoint('rescued');
    const world = (x: number, y: number, z: number) => s.room.root.localToWorld(new THREE.Vector3(x, y, z));
    assert.equal(s.room.isAtVoltTerminal(world(16, .66, 68)), true);
    assert.equal(s.room.isAtFinalExit(world(16, .66, 75)), true);
    for (const y of [-17, -.01, 3, 10]) {
      assert.equal(s.room.isAtVoltTerminal(world(16, y, 68)), false);
      assert.equal(s.room.isAtFinalExit(world(16, y, 75)), false);
    }
    for (const x of [11, 21]) assert.equal(s.room.isAtFinalExit(world(x, .66, 75)), false);
    for (const z of [71, 79, 100]) assert.equal(s.room.isAtFinalExit(world(16, .66, z)), false);
    for (const [x, z] of [[14, 68], [18, 68], [16, 66], [16, 70]])
      assert.equal(s.room.isAtVoltTerminal(world(x, .66, z)), false);
    assert.equal(s.room.isAcidAt(world(16, -.01, 75)), true);
    assert.equal(s.room.isAcidAt(world(4, -.01, 65)), true);
    assert.equal(s.room.isAcidAt(world(16, .4, 79.5)), true);
  } finally { s.dispose(); }
});

test('dark-room lights follow drone power, damage recovery, and the moving Volt pod', () => {
  const s = setup();
  try {
    const light = s.room.root.getObjectByName('room-5-rusted-drone-light') as THREE.PointLight;
    const visibleLightCount = () => {
      let count = 0;
      s.room.root.traverseVisible(object => { if (object instanceof THREE.Light) count++; });
      return count;
    };
    const initialLights = visibleLightCount();
    s.encounter.update(1 / 60); const dormant = light.intensity;
    assert.ok(dormant > 0);
    s.room.controller.hitBrokenDrone(); s.encounter.update(1 / 60);
    assert.ok(light.intensity > dormant * 10);
    s.room.controller.destroyBrokenDrone(); s.encounter.update(1 / 60); assert.equal(light.intensity, 0);
    s.room.brokenCore.visible = false;
    assert.equal(visibleLightCount(), initialLights, 'destroying the shell must not change renderer light variants');
    assert.equal(light.parent, s.room.root);
    s.room.restoreCheckpoint('split'); s.encounter.reset(); assert.equal(light.intensity, dormant);
    const search = s.room.root.getObjectByName('room-5-red-security-0-search-light') as THREE.SpotLight;
    assert.equal(search.angle, .4);
    assert.equal(search.castShadow, true);
    assert.equal(search.shadow.mapSize.x, 512);
    assert.equal(s.room.captiveVolt.castShadow, false);
    assert.equal((s.room.captiveVolt.material as THREE.MeshStandardMaterial).color.getHex(), 0xffe85c);
    assert.equal((s.room.root.getObjectByName('room-5-volt-glow') as THREE.PointLight).color.getHex(), 0xffdc35);
    assert.equal((s.room.root.getObjectByName('room-5-volt-glow') as THREE.PointLight).castShadow, true);
    assert.ok(search.distance > 0 && search.distance <= 15);
    const ray = s.room.root.getObjectByName('room-5-red-scanner-0') as THREE.Mesh<THREE.ConeGeometry>;
    assert.equal(ray.geometry.parameters.height, 15);
    assert.ok(ray.position.distanceTo(search.position) < 1e-8, 'beam and shadow light share the flying eye');
    const rayMaterial = ray.material as THREE.MeshBasicMaterial;
    assert.equal(rayMaterial.side, THREE.DoubleSide, 'beam remains visible when viewed from inside its cone');
    assert.equal(rayMaterial.forceSinglePass, true);
    const blueRay = s.room.root.getObjectByName('room-5-blue-scanner-1') as THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
    assert.ok(blueRay.material.opacity > rayMaterial.opacity);
    assert.equal(blueRay.material.color.getHex(), 0x165dff);
    assert.equal(blueRay.material.opacity, .09);
    const bluePanelLight = s.room.root.getObjectByName('room-5-control-blue-glow') as THREE.PointLight;
    assert.equal(bluePanelLight.color.getHex(), 0x245bff);
    assert.equal(blueRay.geometry.parameters.height, ray.geometry.parameters.height);
    assert.ok(Math.abs(Math.atan(ray.geometry.parameters.radius / ray.geometry.parameters.height) - search.angle) < 1e-8);
    s.room.controller.security.select('red'); s.encounter.update(1 / 60); assert.equal(search.intensity, 0);
    s.room.controller.security.toggle('red'); s.encounter.update(1 / 60); assert.ok(search.intensity > 0);
    assert.equal(s.room.root.getObjectByName('room-5-volt-glow')!.parent, s.room.pod);
    for (const index of [0, 2, 4]) for (const prefix of ['platform-bulb', 'platform-light', 'bulb-base'])
      assert.equal(s.room.root.getObjectByName(`room-5-${prefix}-${index}`), undefined);
    assert.equal(s.room.root.getObjectByName('room-5-chamber-light-50'), undefined);
    assert.equal(s.room.root.getObjectByName('room-5-sewer-light-25'), undefined);
    assert.equal((s.room.reunionDoor.material as THREE.Material).visible, false);
    assert.equal(s.room.reunionDoor.children.filter(child => child.name.includes('hidden-exit-skin')).length, 3);
    const floor = s.room.root.getObjectByName('room-5-chamber-acid-bed') as THREE.Mesh;
    assert.ok(floor.material instanceof AcidSurfaceMaterial, 'dressed chamber uses the shared dynamic acid shader');
  } finally { s.dispose(); }
});

test('sewer reboot, paired checkpoints and rescue retries preserve the right state', () => {
  const c = new CultivationRoomFiveController();
  c.update(1, true, false, false, false); assert.equal(c.brokenDroneState, 'rebooting');
  c.update(.5, false, false, false, false); assert.equal(c.brokenDroneState, 'active');
  c.destroyBrokenDrone(); c.update(.1, false, true, false, false); assert.equal(c.checkpoint, 'split');
  c.update(.1, false, true, true, false); assert.equal(c.checkpoint, 'controls');
  c.security.select('green'); c.reset('controls');
  assert.equal(c.brokenDroneState, 'destroyed'); assert.equal(c.security.disabledNetwork, undefined);
  c.update(1, false, false, false, true); c.update(.1, false, false, false, false);
  assert.equal(c.leverProgress, 0, 'leaving lever interrupts the pull');
  c.update(1.5, false, false, false, true); assert.equal(c.releasing, true);
  c.update(4, false, false, false, false); assert.equal(c.rescued, true);
  c.powerExit(); c.finish(); assert.equal(c.complete, true);
  c.reset('rescued'); assert.equal(c.rescued, true); assert.equal(c.exitPowered, false);
  c.reset(); assert.equal(c.rescued, false); assert.equal(c.brokenDroneState, 'dormant');
});

function setup() {
  const room = new LevelTwoRoomFiveGreybox(() => {});
  const lab = new CultivationLabMaterials();
  const art = new CultivationMaintenanceArt(room, lab);
  room.root.position.set(64, 0, 249); room.root.updateMatrixWorld(true);
  const world = new CollisionWorld(); const surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes, undefined, ColliderTransformMode.Static); surfaces.registerAll(room.collisionMeshes);
  for (const mesh of room.dynamicCollisionMeshes) world.setTransformMode(mesh, ColliderTransformMode.Dynamic);
  const bob = new KinematicBody({ world, surfaces, initialPosition: room.root.localToWorld(new THREE.Vector3(-12, 10.66, 23)) });
  const goop = new KinematicBody({ world, surfaces, initialPosition: room.root.localToWorld(new THREE.Vector3(44, -10.54, 122)), config: { adhesionEnabled: false, reboundEnabled: false, chargedJumpEnabled: false } });
  const targets = room.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, world, surfaces)!);
  const burns = new DissolveSystem(targets); room.bindDissolveTargets(targets); room.bindBurns(burns);
  const encounter = new RoomFiveDroneEncounter(room, world, surfaces, bob, goop, () => true);
  return { room, world, bob, goop, targets, burns, encounter,
    dispose() { encounter.dispose(); burns.dispose(); for (const target of targets) target.dispose(); art.dispose(); lab.dispose(); room.dispose(); world.clear(); surfaces.clear(); } };
}

test('three acid hits wake, progressively damage, and destroy the sewer drone; retry restores it', () => {
  const s = setup();
  try {
    const target = s.targets.find(t => t.mesh === s.room.brokenCore)!;
    const parts = s.room.brokenCore.children.filter(p => typeof p.userData.damageStage === 'number');
    const visibleLights = () => {
      const lights: THREE.Object3D[] = [];
      s.room.root.traverseVisible(object => { if (object instanceof THREE.Light) lights.push(object); });
      return lights;
    };
    const initialLights = visibleLights();
    assert.ok(parts.length > 0);
    for (let hit = 1; hit <= 3; hit++) {
      assert.equal(s.burns.startBurn(target), 'started');
      assert.equal(s.room.controller.brokenDroneHits, hit);
      assert.equal(s.room.controller.brokenDroneState, hit < 3 ? 'active' : 'destroyed');
      s.encounter.update(1 / 60);
      for (const part of parts) assert.equal(part.visible, hit < part.userData.damageStage);
      assert.equal(s.room.brokenCore.getObjectByName('room-5-damaged-drone-sparks')!.visible, hit < 3);
      s.burns.update(.3);
      assert.equal(s.room.brokenCore.visible, hit < 3);
      assert.deepEqual(visibleLights(), initialLights, 'acid hits must not invalidate room lighting shader variants');
    }
    s.room.restoreCheckpoint('split');
    target.reset(); s.encounter.reset();
    assert.equal(s.room.controller.brokenDroneHits, 0);
    assert.ok(parts.every(p => p.visible));
    assert.equal(s.room.brokenCore.getObjectByName('room-5-damaged-drone-sparks')!.visible, false);
  } finally { s.dispose(); }
});

test('both recessed sewer ends support Goop and stop movement through the grates', () => {
  const s = setup();
  try {
    for (const [z, direction] of [[18, -1], [138, 1]]) {
      s.goop.recoverAt(s.room.root.localToWorld(new THREE.Vector3(40, -11.54, z)));
      for (let frame = 0; frame < 240; frame++) s.goop.update(1 / 60, new THREE.Vector3(0, 0, direction));
      const local = s.room.root.worldToLocal(s.goop.position.clone());
      assert.ok(local.y > -12, `recess floor at ${local.toArray()}`);
      assert.ok(local.z > 14 && local.z < 142, 'grate blocks passage into decorative tunnel');
    }
  } finally { s.dispose(); }
});

test('acid network contacts work repeatedly through the real burn coordinator', () => {
  const s = setup();
  for (const colour of ['red', 'blue', 'green', 'red', 'blue'] as const) {
    const target = s.targets.find(t => t.mesh === s.room.controls.get(colour))!;
    assert.equal(s.burns.startBurn(target), 'started');
    s.burns.update(.3); s.room.update(1 / 60, []);
    assert.equal(s.room.controller.security.disabledNetwork, colour);
    assert.equal(target.completed, false); assert.equal(target.collisionEnabled, true);
  }
  s.dispose();
});

test('same-tick contact completion preserves latest impact order, not authoring order', () => {
  const s = setup();
  const red = s.targets.find(t => t.mesh === s.room.controls.get('red'))!;
  const blue = s.targets.find(t => t.mesh === s.room.controls.get('blue'))!;
  s.burns.startBurn(blue); s.burns.startBurn(red); s.burns.update(.3); s.room.update(1 / 60, []);
  assert.equal(s.room.controller.security.disabledNetwork, 'red');
  assert.equal(s.burns.activeBurnCount, 0);
  s.dispose();
});

test('every authored switching station is safe against every network', () => {
  const s = setup();
  for (let i = 0; i < ROOM_FIVE_SAFE_STATIONS.length; i++) {
    const [x,y,z] = ROOM_FIVE_SAFE_STATIONS[i];
    s.bob.recoverAt(s.room.root.localToWorld(new THREE.Vector3(x, y + .66, z)));
    for (const colour of ['red', 'blue', 'green'] as const) {
      s.encounter.reset(); s.room.controller.security.select(colour);
      for (let tick = 0; tick < 720; tick++) s.encounter.update(1 / 60);
      assert.equal(s.encounter.damage.health[0].health, 100, `station ${i} while ${colour} offline`);
      assert.ok(s.encounter.drones.every(drone => drone.readModel.targetSlimeId === undefined), `station ${i} exposed to detection`);
    }
  }
  s.dispose();
});

test('each traversal is covered by its network and becomes safe when disabled', () => {
  const s = setup();
  for (let i = 0; i < ROOM_FIVE_ROUTE_NETWORKS.length; i++) {
    const point = new THREE.Vector3(...ROOM_FIVE_SAFE_STATIONS[i]).lerp(new THREE.Vector3(...ROOM_FIVE_SAFE_STATIONS[i + 1]), .5);
    point.y += .66;
    if (i === 5) point.set(9.5, 27.46, 40);
    s.bob.recoverAt(s.room.root.localToWorld(point));
    s.room.controller.security.reset(); s.encounter.reset();
    let detected = false;
    for (let tick = 0; tick < 720; tick++) {
      s.encounter.update(1 / 60);
      detected ||= s.encounter.drones[i].readModel.targetSlimeId === 'bob';
    }
    assert.ok(detected, `route ${i} should be covered during its patrol`);
    s.room.controller.security.select(ROOM_FIVE_ROUTE_NETWORKS[i]); s.encounter.update(1 / 60);
    assert.equal(s.encounter.drones[i].readModel.enabled, false);
  }
  s.dispose();
});

test('all flying shells remain outside Volt glass throughout a patrol cycle', () => {
  const s = setup();
  try {
    const pod = new THREE.Box3().setFromCenterAndSize(s.room.root.localToWorld(new THREE.Vector3(0, 25, 49)), new THREE.Vector3(6.2, 4.2, 6.2));
    const bounds = new THREE.Box3();
    for (let frame = 0; frame < 720; frame++) {
      s.encounter.update(1 / 60);
      for (const drone of s.encounter.drones) {
        bounds.setFromObject(drone.root.getObjectByName(`${drone.id}-flying-shell`)!);
        assert.equal(bounds.intersectsBox(pod), false, `${drone.id} at frame ${frame}`);
      }
    }
  } finally { s.dispose(); }
});

test('flying models do not overlap even with independently shifted patrol clocks', () => {
  const s = setup();
  try {
    const samples: THREE.Box3[][] = s.encounter.drones.map(() => []);
    for (let phase = 0; phase < 48; phase++) {
      for (const patrol of s.encounter.patrols) patrol.elapsed = phase / 4;
      s.encounter.update(.0001);
      // Use rendered vertices: a rotated merged mesh has a looser cached local AABB than its former individual parts.
      s.encounter.drones.forEach((drone, i) => samples[i].push(new THREE.Box3().setFromObject(drone.root.getObjectByName(`${drone.id}-flying-shell`)!, true)));
    }
    for (let a = 0; a < samples.length; a++) for (let b = a + 1; b < samples.length; b++) {
      for (const first of samples[a]) for (const second of samples[b])
        assert.equal(first.intersectsBox(second), false, `patrols ${a} and ${b}`);
    }
  } finally { s.dispose(); }
});

test('final walkway leads around the cover to the lever without another jump', () => {
  const s = setup();
  try {
    s.bob.recoverAt(s.room.root.localToWorld(new THREE.Vector3(0, 29.46, 37)));
    const direction = new THREE.Vector3(), local = new THREE.Vector3();
    for (const [x, z] of [[0, 34], [0, 30], [0, 27.7]]) {
      let arrived = false;
      for (let frame = 0; frame < 240; frame++) {
        s.room.root.worldToLocal(local.copy(s.bob.position));
        if (Math.hypot(local.x - x, local.z - z) < .2) { arrived = true; break; }
        direction.set(x - local.x, 0, z - local.z).normalize(); s.bob.update(1 / 60, direction);
      }
      assert.ok(arrived && local.y > 29, `walk to ${x},${z}: ${local.toArray()}`);
      for (let frame = 0; frame < 720; frame++) s.encounter.update(1 / 60);
      assert.equal(s.encounter.damage.health[0].health, 100, 'quiet lever approach stays out of fire');
    }
  } finally { s.dispose(); }
});

test('Bob climbs smoothly from the shaft onto the chamber entrance without jumping', () => {
  const s = setup();
  s.bob.recoverAt(s.room.root.localToWorld(new THREE.Vector3(-12, .66, 16)));
  const forward = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 60; i++) s.bob.update(1 / 60, forward);
  assert.equal(s.bob.attached, true);
  for (let i = 0; i < 240; i++) {
    s.bob.update(1 / 60, s.bob.attached ? up : forward);
    const local = s.room.root.worldToLocal(s.bob.position.clone());
    if (s.bob.grounded && local.z > 22 && s.bob.supportColliderName.startsWith('room-5-safe-0-floor')) break;
  }
  const point = s.room.root.worldToLocal(s.bob.position.clone());
  assert.ok(point.y >= 10.4 && point.z > 22, 'shaft lip joins the covered starting platform');
  s.dispose();
});

test('Goop traverses the flat duct, drops into the sewer and walks back up the maintenance ramp', () => {
  const s = setup();
  s.goop.recoverAt(s.room.root.localToWorld(new THREE.Vector3(12, .86, 9.1)));
  const point = new THREE.Vector3();
  const moveTo = (axis: 'x' | 'z', goal: number) => {
    s.room.root.worldToLocal(point.copy(s.goop.position));
    const sign = Math.sign(goal - point[axis]);
    const direction = new THREE.Vector3(); direction[axis] = sign;
    for (let i = 0; i < 1400; i++) {
      s.room.root.worldToLocal(point.copy(s.goop.position));
      if ((point[axis] - goal) * sign >= 0) break;
      s.goop.update(1 / 60, direction);
    }
    s.room.root.worldToLocal(point.copy(s.goop.position));
    assert.ok((point[axis] - goal) * sign >= 0, `blocked before ${axis}=${goal} at ${point.toArray()}`);
  };
  moveTo('x', 40); moveTo('z', 20);
  for (let i = 0; i < 180; i++) s.goop.update(1 / 60, new THREE.Vector3());
  s.room.root.worldToLocal(point.copy(s.goop.position));
  assert.ok(point.y < -11, `floor opening reaches sewer: ${point.toArray()}`);
  const core = s.targets.find(target => target.mesh === s.room.brokenCore)!;
  for (let i = 0; i < 3; i++) { s.burns.startBurn(core); s.burns.update(1); }
  moveTo('x', 39.2); moveTo('z', 124); moveTo('x', 44);
  s.room.restoreCheckpoint('rescued');
  moveTo('x', 25); moveTo('z', 62);
  assert.ok(point.y > .4, 'maintenance ramp reaches the dry reunion landing');
  s.dispose();
});

test('rusted drone itself highlights in aim mode and accepts acid without a proxy box', () => {
  const s = setup();
  s.goop.teleport(s.room.root.localToWorld(new THREE.Vector3(40, -11.3, 65)));
  const acid = new AcidProjectileSystem({
    slimeManager: { activeSlimeId: 'goop', activeBody: s.goop, canActiveUseAbility: () => true },
    collisionWorld: s.world, dissolveSystem: s.burns,
    aimRayProvider: { copyAimRay(origin, direction) {
      origin.copy(s.goop.position);
      direction.copy(s.room.brokenCore.position); s.room.root.localToWorld(direction);
      direction.sub(origin).normalize();
    } },
  });
  try {
    acid.update(1 / 60, { gameplayInputEnabled: true, pointerLocked: true, aimHeld: true, firePressed: false });
    assert.ok(acid.aimReadModel.visibleSolubleIds.includes(s.room.brokenCore.name));
    assert.equal(s.room.brokenCore.geometry.type, 'SphereGeometry');
    for (let i = 0; i < 120; i++) {
      acid.update(1 / 60, { gameplayInputEnabled: true, pointerLocked: true, aimHeld: true, firePressed: i === 0 || i === 35 || i === 70 });
      s.burns.update(1 / 60);
    }
    assert.equal(s.room.controller.brokenDroneState, 'destroyed');
    assert.equal(s.room.brokenCore.visible, false);
    s.room.reset();
    assert.equal(s.room.brokenCore.visible, true);
  } finally { acid.dispose(); s.dispose(); }
});

test('switch handles and I/O indicators reflect network state and reset', () => {
  const s = setup();
  try {
    const handle = s.room.root.getObjectByName('room-5-red-toggle')!;
    s.room.syncPresentation();
    assert.ok(handle.rotation.z < 0);
    s.room.controller.security.select('red'); s.room.syncPresentation();
    assert.ok(handle.rotation.z > 0);
    const off = s.room.root.getObjectByName('room-5-red-offline-O') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    assert.equal(off.material.emissiveIntensity, .8);
    s.room.reset();
    assert.ok(handle.rotation.z < 0);
    assert.equal(off.material.emissiveIntensity, 0);
    const acid = s.room.root.localToWorld(new THREE.Vector3(40, -11.6, 65));
    assert.equal(s.room.isAcidAt(acid), true);
    assert.equal(s.room.isAcidAt(s.room.root.localToWorld(new THREE.Vector3(44, -11.6, 65))), false);
  } finally { s.dispose(); }
});

test('authored jumping sequences use reachable gaps with real charged-jump collision', () => {
  const s = setup();
  try {
    const direction = new THREE.Vector3(), local = new THREE.Vector3();
    for (const [section, jumps] of ROOM_FIVE_JUMPS.entries()) {
      for (let i = 0; i < jumps.length - 1; i++) {
        const from = jumps[i], to = jumps[i + 1];
        s.bob.recoverAt(s.room.root.localToWorld(new THREE.Vector3(from[0], from[1] + .46, from[2])));
        for (let frame = 0; frame < 50; frame++) s.bob.update(1 / 60, direction.set(0, 0, 0), { pressed: frame === 5, held: frame >= 5, released: false });
        let landed = false;
        for (let frame = 0; frame < 120; frame++) {
          s.room.root.worldToLocal(local.copy(s.bob.position));
          direction.set(to[0] - local.x, 0, to[2] - local.z);
          if (direction.length() > .15) direction.normalize(); else direction.set(0, 0, 0);
          s.bob.update(1 / 60, direction, { pressed: false, held: false, released: frame === 0 });
          if (s.bob.supportColliderName === `room-5-route-${section}-jump-${i + 2}` && s.bob.grounded) { landed = true; break; }
        }
        assert.ok(landed, `section ${section} jump ${i + 1}->${i + 2}: ${local.toArray()} support=${s.bob.supportColliderName}`);
      }
    }
  } finally { s.dispose(); }
});

test('removed middle climb and overlapping landing leave reachable station approaches', () => {
  const s = setup();
  try {
    for (const section of [1, 2, 3, 4, 5]) {
      const jumps = ROOM_FIVE_JUMPS[section], from = jumps[jumps.length - 1];
      const to = ROOM_FIVE_SAFE_STATIONS[section + 1];
      const direction = new THREE.Vector3(), local = new THREE.Vector3();
      s.bob.recoverAt(s.room.root.localToWorld(new THREE.Vector3(from[0], from[1] + .46, from[2])));
      for (let frame = 0; frame < 50; frame++) s.bob.update(1 / 60, direction, { pressed: frame === 5, held: frame >= 5, released: false });
      let landed = false;
      for (let frame = 0; frame < 120; frame++) {
        s.room.root.worldToLocal(local.copy(s.bob.position));
        direction.set(to[0] - local.x, 0, to[2] - local.z).normalize();
        s.bob.update(1 / 60, direction, { pressed: false, held: false, released: frame === 0 });
        if (s.bob.grounded && s.bob.supportColliderName.startsWith(`room-5-safe-${section + 1}-floor`)) { landed = true; break; }
      }
      assert.ok(landed, `section ${section}: ${local.toArray()}`);
    }
  } finally { s.dispose(); }
});

test('rusted drone lifts from the acid and tracks Goop on either side and above it', () => {
  const s = setup();
  try {
    assert.ok(s.room.brokenCore.rotation.z > 1);
    assert.ok(s.room.brokenCore.position.y < -11.5);
    s.room.controller.update(1.5, true, false, false, false);
    for (const position of [[40, -11.54, 63], [40, -11.54, 80], [43, -3, 70]]) {
      s.goop.teleport(s.room.root.localToWorld(new THREE.Vector3(...position)));
      for (let i = 0; i < 120; i++) s.encounter.update(1 / 60);
      const expected = s.room.root.worldToLocal(s.goop.position.clone()).sub(s.room.brokenCore.position).normalize();
      const actual = new THREE.Vector3(0, 0, -1).applyQuaternion(s.room.brokenCore.quaternion);
      assert.ok(actual.dot(expected) > .98);
      assert.equal(s.encounter.brokenDrone.readModel.targetSlimeId, 'goop');
    }
    assert.ok(s.room.brokenCore.position.y > -8);
    s.encounter.reset();
    assert.ok(s.room.brokenCore.position.y < -11.5);
  } finally { s.dispose(); }
});

test('acid must hit the moving handle, including a second hit to raise it again', () => {
  const s = setup();
  const point = new THREE.Vector3();
  const acid = new AcidProjectileSystem({
    slimeManager: { activeSlimeId: 'goop', activeBody: s.goop, canActiveUseAbility: () => true },
    collisionWorld: s.world, dissolveSystem: s.burns,
    aimRayProvider: { copyAimRay(origin, direction) { origin.copy(s.goop.position); direction.copy(point).sub(origin).normalize(); } },
  });
  try {
    const target = s.room.controls.get('red')!;
    assert.equal(s.room.root.getObjectByName('room-5-control-red-face')!.userData.soluble, undefined);
    s.goop.teleport(s.room.root.localToWorld(new THREE.Vector3(44, -10.5, 118)));
    for (let hit = 0; hit < 2; hit++) {
      target.getWorldPosition(point);
      for (let i = 0; i < 90; i++) {
        acid.update(1 / 60, { gameplayInputEnabled: true, pointerLocked: true, aimHeld: true, firePressed: i === 0 });
        s.burns.update(1 / 60); s.room.update(1 / 60, []);
      }
      assert.equal(s.room.controller.security.disabledNetwork, hit === 0 ? 'red' : undefined);
    }
    assert.equal(acid.getDiagnostics().solubleImpactCount, 2);
  } finally { acid.dispose(); s.dispose(); }
});

test('redundant sticky assembly and cover colour strips are absent', () => {
  const s = setup();
  try {
    for (const name of ['route-1-sticky-wall', 'route-1-sticky-return', 'route-1-top-transfer', 'route-3-jump-3', 'release-side-walk', 'release-bridge'])
      assert.equal(s.room.root.getObjectByName(`room-5-${name}`), undefined);
    s.room.root.traverse(object => assert.ok(!object.name.endsWith('-marker')));
  } finally { s.dispose(); }
});

test('covered switching stations allow charged launches onto each next route', () => {
  const s = setup();
  try {
    for (let section = 0; section < 6; section++) {
      const station = ROOM_FIVE_SAFE_STATIONS[section], to = ROOM_FIVE_JUMPS[section][0];
      const from = new THREE.Vector3(...station);
      if (Math.abs(to[0] - from.x) > Math.abs(to[2] - from.z)) from.x += Math.sign(to[0] - from.x) * 2.3;
      else from.z += Math.sign(to[2] - from.z) * 2.3;
      from.y += .46; s.bob.recoverAt(s.room.root.localToWorld(from));
      const direction = new THREE.Vector3(), local = new THREE.Vector3();
      for (let i = 0; i < 50; i++) s.bob.update(1 / 60, direction, { pressed: i === 5, held: i >= 5, released: false });
      let landed = false;
      for (let i = 0; i < 120; i++) {
        s.room.root.worldToLocal(local.copy(s.bob.position));
        direction.set(to[0] - local.x, 0, to[2] - local.z);
        if (direction.length() > .15) direction.normalize(); else direction.set(0, 0, 0);
        s.bob.update(1 / 60, direction, { pressed: false, held: false, released: i === 0 });
        if (s.bob.supportColliderName === `room-5-route-${section}-jump-1` && s.bob.grounded) { landed = true; break; }
      }
      assert.ok(landed, `station ${section}: ${local.toArray()} support=${s.bob.supportColliderName}`);
    }
  } finally { s.dispose(); }
});
