import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { BlackoutTransitController, type TransitBodies } from '../src/levels/BlackoutTransitController.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { CollisionHit, CollisionLayer, ColliderTransformMode, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';

const DT = 1 / 60;

function fakeBody(position: THREE.Vector3, partial: Partial<{ attached: boolean; attachmentSurfaceName: string; grounded: boolean }> = {}): KinematicBody {
  const previousPosition = position.clone();
  const body = {
    position,
    previousPosition,
    radiusMetres: 0.45,
    grounded: partial.grounded ?? true,
    attached: partial.attached ?? false,
    attachmentSurfaceName: partial.attachmentSurfaceName ?? '',
    isSupportedBy: () => false,
    applyCarrierDisplacement: () => undefined,
  };
  return body as unknown as KinematicBody;
}

function fixture() {
  const room = new BlackoutTransitRoom();
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes, undefined, ColliderTransformMode.Static);
  surfaces.registerAll(room.collisionMeshes);
  const electricalTargets = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets });
  controller.setActive(true);
  const bodies: TransitBodies = {
    bob: fakeBody(new THREE.Vector3(15, 1, 90)),
    goop: fakeBody(new THREE.Vector3(18, -0.545, 90)),
    volt: fakeBody(new THREE.Vector3(-16, 2.96, 90)),
  };
  return {
    room, world, surfaces, electricalTargets, controller, bodies,
    dispose() {
      controller.dispose(); electricalTargets.dispose(); room.dispose(); world.clear(); surfaces.clear();
    },
  };
}

test('three room lights latch after 1.5 seconds and remain powered after disconnect', () => {
  const f = fixture();
  try {
    const light = f.controller.lights[0]!;
    light.target.setConnectionState(true);
    for (let i = 0; i < 89; i++) f.controller.update(DT, f.bodies);
    assert.equal(light.latched, false);
    f.controller.update(DT, f.bodies);
    assert.equal(light.latched, true);
    light.target.setConnectionState(false);
    f.controller.update(DT, f.bodies);
    assert.equal(light.latched, true);
    assert.ok(light.light.intensity > 0);
    assert.equal(f.controller.lights.length, 3);
  } finally { f.dispose(); }
});

test('conducting fixtures have no standby glow or yellow torus markers', () => {
  const f = fixture();
  try {
    for (const receiver of [...f.controller.lights, f.controller.lockReceiver]) {
      assert.equal(receiver.targetMaterial.emissiveIntensity, 0);
      receiver.root.traverse(object => {
        if (object instanceof THREE.Mesh) assert.notEqual(object.geometry.type, 'TorusGeometry');
      });
    }
    for (const lift of f.controller.lifts) {
      const contact = lift.root.getObjectByName(`${lift.id}-conducting-contact`) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
      assert.equal(contact.material.emissiveIntensity, 0);
    }
  } finally { f.dispose(); }
});

test('drone head follows a moving visible target and rapid fire defeats exposure within half a second', () => {
  const f = fixture();
  try {
    const drone = f.controller.drones[0]!;
    f.bodies.bob.position.set(10.5,1.66,102);
    const hoverPosition = drone.root.position.clone();
    f.controller.update(DT,f.bodies);
    const head = drone.root.getObjectByName(`${drone.id}-tracking-head`)!;
    const before = head.quaternion.clone();
    f.bodies.bob.position.z += .55;
    f.controller.update(DT,f.bodies);
    assert.ok(before.angleTo(head.quaternion) > .01, 'head must aim toward the moving victim rather than remain in its patrol pose');
    let failed: string | undefined;
    let elapsed = 2*DT;
    while(!failed && elapsed < .5) { failed=f.controller.update(DT,f.bodies); elapsed+=DT; }
    assert.equal(failed,'bob','remaining exposed cannot outrun the slow old firing cadence');
    assert.deepEqual(drone.root.position.toArray(), hoverPosition.toArray(), 'head tracking does not become a patrol or chase');
  } finally { f.dispose(); }
});

for (const [index, baseY, sweep, period] of [[0, 5.1, 2.4, 1.2], [1, 8.35, 2.75, 0.9]] as const) {
test(`vertical laser ${index + 1} stays live with matching presentation and collision clear of solids`, () => {
  const f = fixture();
  try {
    const laser=f.controller.lasers[index]!;
    let low=Infinity,high=-Infinity;
    const direction=new THREE.Vector3(),start=new THREE.Vector3();
    for(let i=0;i<period / DT;i++) {
      f.controller.update(DT,f.bodies);
      assert.equal(laser.enabled, true, 'vertical sweep must not offer the old disabled window');
      low=Math.min(low,laser.start.y);high=Math.max(high,laser.start.y);
      laser.copyStart(start);direction.copy(laser.end).sub(start);
      const hit=new CollisionHit();
      assert.equal(f.world.raycast(start,direction,direction.length(),hit,CollisionLayer.LineOfSight),false,
        `laser should never pass through ${hit.object?.name}`);
      assert.equal(laser.intersects({position:new THREE.Vector3(10.5,laser.start.y,laser.start.z),radiusMetres:.45}),true);
      const core=f.controller.root.getObjectByName(`${laser.id}-presentation-beam-core`)!;
      assert.ok(Math.abs(core.position.y-laser.start.y)<1e-6);
      assert.equal(laser.root.getObjectByName(`${laser.id}-emitter-start-proxy`)!.visible,false);
    }
    assert.ok(high-low>sweep, `laser ${index + 1} completes its ${sweep}m sweep within ${period}s`);
    f.controller.reset();
    assert.equal(laser.start.y,baseY,'retry resets laser motion as well as visuals');
  } finally { f.dispose(); }
});
}

test('drones visibly sweep and red beam volumes use their own shadow depth without a flat cutoff', () => {
  const f = fixture();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(12,.2,12),new THREE.MeshStandardMaterial());
  try {
    const drone = f.controller.drones[0]!;
    const start = new THREE.Vector3().copy(drone.readModel.scanDirection);
    const hoverPosition = drone.root.position.clone();
    for (let i=0;i<60;i++) f.controller.update(DT,f.bodies);
    const direction = new THREE.Vector3().copy(drone.readModel.scanDirection);
    assert.ok(start.angleTo(direction) > 0.1 && start.angleTo(direction) < 0.23, 'livelier bounded idle sweep without moving the drone');
    assert.deepEqual(drone.root.position.toArray(), hoverPosition.toArray(), 'the authored hover position remains fixed while sweeping');
    const beam = f.room.root.getObjectByName(`${drone.id}-searchlight`) as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
    const light = f.room.root.getObjectByName(`${drone.id}-search-light`) as THREE.SpotLight;
    assert.equal(light.color.getHex(), 0xff1830);
    assert.equal(beam.material.uniforms.beamShadowMatrix.value,light.shadow.matrix);
    assert.match(beam.material.fragmentShader,/texture\(beamShadow/);
    assert.equal(light.castShadow,true);
    wall.position.copy(beam.position).addScaledVector(direction,2);
    wall.quaternion.copy(beam.quaternion); wall.updateMatrixWorld(true);
    f.world.register(wall);
    f.controller.update(DT,f.bodies);
    assert.equal(beam.scale.y,1,'a blocker must mask only shadowed fragments, not shrink the whole cone');
    f.world.unregister(wall);
    f.controller.update(DT,f.bodies);
    assert.equal(beam.scale.y,1);
  } finally {
    f.world.unregister(wall); wall.geometry.dispose(); wall.material.dispose(); f.dispose();
  }
});

test('a dissolved support releases a retained cover that physically blocks drone LOS', () => {
  const f = fixture();
  try {
    const cover = f.controller.covers[0]!;
    cover.support.advance(cover.support.dissolveDurationSeconds);
    for (let i = 0; i < 60; i++) f.controller.update(DT, f.bodies);
    assert.equal(cover.deployed, true);
    assert.equal(cover.panel.visible, true, 'the cover remains as a sight blocker');

    const origin = new THREE.Vector3(18, 5.5, 100);
    const end = new THREE.Vector3(10, 3.8, 102);
    const direction = end.clone().sub(origin);
    const drone = f.controller.drones[0]!;
    const hit = new CollisionHit();
    assert.equal(f.world.raycast(origin, direction, direction.length(), hit, CollisionLayer.LineOfSight, drone.collider), true);
    assert.equal(hit.object, cover.panel, 'the deployed cover, not merely its visual cone, occludes detection rays');
  } finally { f.dispose(); }
});

test('Bob must hold the wall switch to deploy the bridge; Volt can latch the far-side lock', () => {
  const f = fixture();
  try {
    f.bodies.bob.position.copy(f.room.switchBodyPosition);
    (f.bodies.bob as unknown as { attached: boolean; attachmentSurfaceName: string }).attached = true;
    (f.bodies.bob as unknown as { attachmentSurfaceName: string }).attachmentSurfaceName = 'bob-bridge-switch-sticky-wall';
    f.bodies.volt.position.set(0, 0.86, 145);
    for (let i = 0; i < 90; i++) f.controller.update(DT, f.bodies);
    assert.equal(f.controller.bridgeDeployed, true);
    assert.equal(f.controller.lockReceiver.target.isAvailable(), true);
    assert.deepEqual(f.controller.lockReceiver.target.hitMeshes, [f.room.bridgeLockContact]);
    assert.equal(f.room.root.getObjectByName('transit-bridge-lock-electrical-socket'), undefined,
      'the floating block must not return when the bridge deploys');
    f.room.root.traverse(object => assert.doesNotMatch(object.name, /transit-deployable-bridge-rail|transit-bridge-rail-seat/));

    f.controller.lockReceiver.target.setConnectionState(true);
    for (let i = 0; i < 90; i++) f.controller.update(DT, f.bodies);
    assert.equal(f.controller.bridgeLocked, true);
    (f.bodies.bob as unknown as { attached: boolean }).attached = false;
    f.controller.update(DT, f.bodies);
    assert.equal(f.controller.bridgeDeployed, true, 'Volt locking the bridge frees Bob to leave the switch');
  } finally { f.dispose(); }
});

test('disposing the transit controller does not dispose its borrowed exit-door contact', () => {
  const f = fixture();
  const material = f.controller.lockReceiver.targetMaterial;
  let disposed = 0;
  material.addEventListener('dispose', () => { disposed += 1; });
  try {
    assert.equal(f.controller.lockReceiver.ownsTargetMaterial, false);
    f.controller.lockReceiver.target.setConnectionState(true);
    f.controller.update(DT, f.bodies);
    f.controller.dispose();
    assert.equal(disposed, 0, 'the room, not the controller, owns the existing door material');
    assert.equal(f.room.bridgeLockContact.parent, f.room.root);
    assert.equal(material.emissiveIntensity, 0);
  } finally { f.dispose(); }
  assert.equal(disposed, 1, 'the room disposes the contact material exactly once');
});

test('checkpoint capture restores lights, cover progress, lift position, and bridge state', () => {
  const f = fixture();
  try {
    f.controller.lights[1]!.target.setConnectionState(true);
    for (let i = 0; i < 90; i++) f.controller.update(DT, f.bodies);
    f.controller.lights[1]!.target.setConnectionState(false);
    const cover = f.controller.covers[0]!;
    cover.support.advance(cover.support.dissolveDurationSeconds);
    for (let i = 0; i < 30; i++) f.controller.update(DT, f.bodies);
    const saved = f.controller.capture();
    f.controller.reset();
    f.controller.restore(saved);
    assert.equal(f.controller.lights[1]!.latched, true);
    assert.ok(f.controller.covers[0]!.elapsed > 0);
    assert.equal(f.controller.covers[0]!.deployed, false, 'mid-fall cover resumes its checkpoint pose');
  } finally { f.dispose(); }
});

test('drone acquisition provides a warning window; Goop remains acid-safe while Bob and Volt fail in acid', () => {
  const f = fixture();
  try {
    f.bodies.bob.position.set(-4, 2.3, 100.5);
    assert.equal(f.controller.update(0.1, f.bodies), undefined, 'acquisition alone is not an instant fail');
    f.bodies.bob.position.set(-4, -0.5, 100);
    f.bodies.goop.position.set(4, -0.5, 100);
    assert.equal(f.controller.update(DT, f.bodies), 'bob');
    f.bodies.bob.position.set(15, 1, 90);
    f.bodies.volt.position.set(-4, -0.5, 100);
    assert.equal(f.controller.update(DT, f.bodies), 'volt');
  } finally { f.dispose(); }
});

test('each scanning drone threatens its route until its matching physical cover is lowered', () => {
  const cases = [
    { index: 0, body: 'bob' as const, position: new THREE.Vector3(10.5, 1.66, 102) },
    { index: 1, body: 'bob' as const, position: new THREE.Vector3(9.5, 4.86, 126) },
    { index: 2, body: 'volt' as const, position: new THREE.Vector3(-8, 1.96, 140) },
  ];
  for (const scenario of cases) {
    const f = fixture();
    try {
      const body = f.bodies[scenario.body];
      const safePosition = new THREE.Vector3().copy(body.position);
      body.position.copy(scenario.position);
      body.previousPosition.copy(scenario.position);
      const drone = f.controller.drones[scenario.index]!;
      const fixedDirection = { ...drone.readModel.scanDirection };
      assert.equal(f.controller.update(DT, f.bodies), undefined);
      assert.equal(drone.readModel.state, 'warning', `drone ${scenario.index + 1} must cover its intended route`);
      let failed: string | undefined;
      for (let step = 0; step < 240 && !failed; step++) failed = f.controller.update(DT, f.bodies);
      assert.equal(failed, scenario.body, 'remaining exposed should cause damage and failure, not harmless detection');
      const startDirection = new THREE.Vector3(fixedDirection.x, fixedDirection.y, fixedDirection.z);
      const direction = drone.readModel.scanDirection;
      assert.ok(startDirection.angleTo(new THREE.Vector3(direction.x, direction.y, direction.z)) < 0.15,
        'small scan motion must remain centred on the authored route, not track bodies freely');

      body.position.copy(safePosition);
      body.previousPosition.copy(safePosition);
      f.controller.resetTransient();
      const cover = f.controller.covers[scenario.index]!;
      cover.support.advance(cover.support.dissolveDurationSeconds);
      for (let step = 0; step < 60; step++) f.controller.update(DT, f.bodies);
      assert.equal(cover.deployed, true);
      body.position.copy(scenario.position);
      body.previousPosition.copy(scenario.position);
      for (let step = 0; step < 180; step++) assert.equal(f.controller.update(DT, f.bodies), undefined);
      assert.equal(drone.readModel.targetSlimeId, undefined, `cover ${scenario.index + 1} must block actual detection`);
      assert.equal(cover.panel.castShadow, true, 'the physical blocker must also occlude its searchlight');
    } finally { f.dispose(); }
  }
});

test('Room 2 starts dormant and disposal releases every registered target and puzzle collider', () => {
  const room = new BlackoutTransitRoom();
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  const electricalTargets = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets });
  try {
    for (const drone of controller.drones) assert.equal(drone.readModel.enabled, false);
    room.root.traverse(object => {
      if (object instanceof THREE.SpotLight) assert.equal(object.intensity, 0, 'unpositioned Room 2 searchlights must not light Room 1');
      if (object.name.endsWith('-searchlight')) assert.equal(object.visible, false);
    });
    controller.dispose();
    assert.equal(electricalTargets.size, 0);
    assert.equal(world.colliderCount, 0);
  } finally { controller.dispose(); electricalTargets.dispose(); room.dispose(); world.clear(); surfaces.clear(); }
});
