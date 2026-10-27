import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { BlackoutTransitController, type TransitBodies } from '../src/levels/BlackoutTransitController.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { CollisionHit, CollisionLayer, ColliderTransformMode, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import { gameplayAudioEvents } from '../src/audio/GameplayAudioEvents.ts';

const DT = 1 / 60;

function fakeBody(position: THREE.Vector3, partial: Partial<{ attached: boolean; attachmentSurfaceName: string; grounded: boolean }> = {}): KinematicBody {
  const previousPosition = position.clone();
  const body = {
    position,
    velocity: new THREE.Vector3(),
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
    bob: fakeBody(new THREE.Vector3(6, .86, 84)),
    goop: fakeBody(new THREE.Vector3(8, .86, 84)),
    volt: fakeBody(new THREE.Vector3(-16, 2.96, 90)),
  };
  return {
    room, world, surfaces, electricalTargets, controller, bodies,
    dispose() {
      controller.dispose(); electricalTargets.dispose(); room.dispose(); world.clear(); surfaces.clear();
    },
  };
}

test('four room lights latch after 1.5 seconds, including the final switch platform bank', () => {
  const f = fixture();
  try {
    assert.equal(f.controller.lights.length, 4);
    for (const light of f.controller.lights) light.target.setConnectionState(true);
    for (let i = 0; i < 89; i++) f.controller.update(DT, f.bodies);
    assert.ok(f.controller.lights.every(light => !light.latched));
    f.controller.update(DT, f.bodies);
    assert.ok(f.controller.lights.every(light => light.latched));
    for (const light of f.controller.lights) light.target.setConnectionState(false);
    f.controller.update(DT, f.bodies);
    assert.ok(f.controller.lights.every(light => light.latched && light.light.intensity > 0));
    const final = f.controller.lights[3]!;
    assert.deepEqual(final.root.position.toArray(), [10, 14.4, 142.5]);
    // Older saves contain three banks. The new one must start unpowered.
    const saved = f.controller.capture() as any;
    saved.lights.pop(); f.controller.restore(saved);
    assert.equal(final.latched, false); assert.equal(final.light.intensity, 0);
    assert.ok(f.controller.lights.slice(0, 3).every(light => light.latched));
    f.controller.reset();
    assert.ok(f.controller.lights.every(light => !light.latched && light.light.intensity === 0));
  } finally { f.dispose(); }
});

test('room light fixtures stay dark while locked lift contacts signal their guard interlocks', () => {
  const f = fixture();
  try {
    for (const receiver of [...f.controller.lights, f.controller.lockReceiver]) {
      assert.equal(receiver.targetMaterial.emissiveIntensity, receiver === f.controller.lockReceiver ? .6 : 0);
      receiver.root.traverse(object => {
        if (object instanceof THREE.Mesh) assert.notEqual(object.geometry.type, 'TorusGeometry');
      });
    }
    for (const lift of f.controller.lifts) {
      const contact = lift.root.getObjectByName(`${lift.id}-conducting-contact`) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
      assert.equal(contact.material.emissiveIntensity, .6, 'locked lifts visibly signal their drone interlock');
    }
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





test('Bob must hold the wall switch to deploy the bridge; Volt can latch the far-side lock', () => {
  const f = fixture();
  const cues: string[] = [], off = gameplayAudioEvents.on('cue',e=>cues.push(e.sound));
  try {
    for (const enemy of f.controller.emergingDrones) enemy.state.destroy();
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
    assert.ok(cues.includes('world-button-press-01'));
    assert.equal(cues.filter(sound=>sound==='world-lever-lock-01').length,1,'the bridge latch sounds once, not on every powered tick');
    const snapshot=f.controller.capture(), count=cues.length;
    f.controller.restore(snapshot);f.controller.update(DT,f.bodies);
    assert.equal(cues.length,count,'checkpoint restoration never replays locking');
  } finally { off(); f.dispose(); }
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

test('checkpoint capture restores lights, sewer damage, lift position, and bridge state', () => {
  const f = fixture();
  try {
    f.controller.lights[1]!.target.setConnectionState(true);
    for (let i = 0; i < 90; i++) f.controller.update(DT, f.bodies);
    f.controller.lights[1]!.target.setConnectionState(false);
    f.controller.emergingDrones[0]!.state.hit();
    for (let i = 0; i < 30; i++) f.controller.update(DT, f.bodies);
    const saved = f.controller.capture();
    f.controller.reset();
    f.controller.restore(saved);
    assert.equal(f.controller.lights[1]!.latched, true);
    assert.equal(f.controller.emergingDrones[0]!.state.hits, 1);
    assert.equal(f.controller.emergingDrones[0]!.state.state, 'active');
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

test('Bob-side drones emerge sequentially while the third waits beside Volt’s route', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.controller.emergingDrones.map(d => d.state.state), ['dormant', 'dormant', 'dormant']);
    for (const [index, z] of [85, 109, 131].entries()) {
      // Only Goop approaches; persistent inactive bodies remain at the entry.
      f.bodies.goop.position.set(18, -.52, z);
      for (let i = 0; i < 120; i++) f.controller.update(DT, f.bodies);
      assert.deepEqual(f.controller.emergingDrones.map(d => d.state.state),
        [0, 1, 2].map(i => i < 2 && i <= index ? 'active' : 'dormant'));
      assert.equal(f.controller.emergingDrones[index]!.shell.body.visible, true);
      if (index < 2) assert.ok(f.controller.emergingDrones[index]!.shell.body.position.y > -.98);
    }
    f.bodies.bob.position.set(10, 8.06, 142.5);
    f.bodies.goop.position.set(10, -.52, 139);
    f.controller.update(DT, f.bodies);
    assert.equal(f.controller.emergingDrones[2]!.state.state, 'dormant', 'separate Bob/Goop routes do not wake Volt’s drone');
    f.bodies.volt.position.set(-16, 2.96, 117.5);
    for (let i = 0; i < 120; i++) f.controller.update(DT, f.bodies);
    assert.equal(f.controller.emergingDrones[2]!.state.state, 'active');
    const third = f.controller.emergingDrones[2]!.shell.body;
    assert.ok(third.position.x < -10 && third.position.z === 132);
    assert.equal(f.controller.projectiles.liveCount, 0, 'Volt can observe emergence outside attack range');
    f.room.root.updateMatrixWorld(true);
    const hull = third.geometry.boundingBox!.clone().applyMatrix4(third.matrixWorld);
    assert.ok(!hull.intersectsBox(new THREE.Box3().setFromObject(f.room.voltCatwalk)), 'relocation leaves the actual catwalk clear');
  } finally { f.dispose(); }
});

test('obsolete covers, supports and beam blockers are absent from collision queries', () => {
  const f = fixture();
  try {
    f.room.root.traverse(object => assert.doesNotMatch(object.name, /^transit-(cover|security|bridge-cover)/));
    assert.deepEqual(f.controller.dissolveTargets.map(t => t.id),
      ['transit-sewer-drone-1', 'transit-sewer-drone-2', 'transit-sewer-drone-3']);
    for (const [x, y, z] of [[14, 11.5, 101], [14, 11.5, 125], [0, 11.5, 141],
      [14, 13.7, 101], [14, 13.7, 125], [-4, 13.7, 141]]) {
      const hit = new CollisionHit();
      for (const mask of [CollisionLayer.Movement, CollisionLayer.LineOfSight, CollisionLayer.Projectile]) {
        assert.equal(f.world.sweepSphere(new THREE.Vector3(x - 1, y, z), new THREE.Vector3(2, 0, 0), .1, hit, mask), false,
          `${x},${y},${z} should no longer contain ${hit.object?.name}`);
      }
    }
    // Checkpoints now follow Goop's enemy clear and Bob's original landing.
    const pad = f.room.bobRoutePlatforms[1]!;
    f.bodies.bob.position.copy(pad.position); f.bodies.bob.position.y += .7;
    f.bodies.bob.isSupportedBy = mesh => mesh === pad;
    f.controller.update(DT, f.bodies); assert.equal(f.controller.checkpointStage, 0);
    f.controller.emergingDrones[0]!.state.destroy();
    f.controller.update(DT, f.bodies); assert.equal(f.controller.checkpointStage, 1);
  } finally { f.dispose(); }
});
