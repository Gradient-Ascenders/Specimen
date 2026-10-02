import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { AcidProjectileSystem } from '../src/abilities/AcidProjectileSystem.ts';
import { DissolveSystem } from '../src/abilities/DissolveSystem.ts';
import { ElectricalTargetRegistry } from '../src/abilities/ElectricalTargetRegistry.ts';
import { VoltElectricalSystem } from '../src/abilities/VoltElectricalSystem.ts';
import { BlackoutTransitController } from '../src/levels/BlackoutTransitController.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { ColliderTransformMode, CollisionHit, CollisionLayer, CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

const DT = 1 / 60;

function fixture() {
  const room = new BlackoutTransitRoom();
  const world = new CollisionWorld();
  const surfaces = new SurfaceRegistry();
  world.registerAll(room.collisionMeshes, undefined, ColliderTransformMode.Static);
  surfaces.registerAll(room.collisionMeshes);
  const registry = new ElectricalTargetRegistry(world);
  const controller = new BlackoutTransitController({ room, world, surfaces, electricalTargets: registry });
  controller.setActive(true);
  room.root.updateMatrixWorld(true);
  return {
    room, world, surfaces, registry, controller,
    dispose() { controller.dispose(); registry.dispose(); room.dispose(); world.clear(); surfaces.clear(); },
  };
}

test('Volt can acquire every light-bank and lift socket from the actual service catwalk', () => {
  const f = fixture();
  const volt = { position: new THREE.Vector3(), radiusMetres: 0.45 };
  const aimPoint = new THREE.Vector3();
  const system = new VoltElectricalSystem({
    slimeManager: { activeSlimeId: 'volt', getBody: () => volt, canActiveUseAbility: () => true },
    collisionWorld: f.world, targetRegistry: f.registry,
    aimRayProvider: { copyAimRay(origin, direction) {
      origin.copy(volt.position); direction.subVectors(aimPoint, origin).normalize();
    } },
    config: { acquisitionRangeMetres: 100, instabilityWarningRangeMetres: 110, tetherBreakRangeMetres: 120 },
  });
  try {
    const targets = [
      ...f.controller.lights.map(receiver => receiver.target),
      ...f.controller.lifts.map(lift => {
        const socket = f.controller.root.getObjectByName(`${lift.id}-conducting-contact`) as THREE.Mesh;
        assert.ok(socket, 'lift should expose a contact attached to the actual device');
        return f.registry.getRegistrationForMesh(socket)!.target;
      }),
    ];
    for (const target of targets) {
      system.reset('reset');
      target.copySocketWorldPosition(aimPoint);
      volt.position.set(-16, 2.96, aimPoint.z - 2);
      if (target.id !== 'transit-light-c') assert.ok(volt.position.distanceTo(aimPoint) > 20, 'target must be across the chamber, not a nearby proxy');
      system.update(DT, { aimHeld: true, fireHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true });
      const blocker = new CollisionHit();
      f.world.raycast(volt.position, aimPoint.clone().sub(volt.position), volt.position.distanceTo(aimPoint), blocker, CollisionLayer.LineOfSight);
      assert.equal(system.readModel.connectedTargetId, target.id,
        `Volt should acquire ${target.id} at ${aimPoint.toArray()}; blocker=${blocker.object?.name}`);
      if (target.id.startsWith('transit-light')) assert.match(target.hitMeshes[0]!.name, /conducting-lamp$/);
      assert.ok(new THREE.Vector3(system.readModel.beamEnd.x, system.readModel.beamEnd.y, system.readModel.beamEnd.z).distanceTo(aimPoint) < 0.001);
      system.reset('reset');
      // Long range must not bypass physical occlusion or grant a connection
      // simply because the highlighted object is within range.
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 10), new THREE.MeshBasicMaterial());
      wall.position.copy(volt.position).lerp(aimPoint, 0.5);
      wall.updateMatrixWorld(true); f.world.register(wall);
      system.update(DT, { aimHeld: true, fireHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true });
      assert.equal(system.readModel.connectedTargetId, undefined, 'solid cover still blocks the long beam');
      f.world.unregister(wall); wall.geometry.dispose(); wall.material.dispose();
    }
  } finally { system.dispose(); f.dispose(); }
});

test('Volt can power the existing exit-door edge from the far bridge landing and free Bob', () => {
  const f = fixture();
  const bob = new KinematicBody({ world: f.world, surfaces: f.surfaces,
    initialPosition: f.room.switchBodyPosition, config: { adhesionEnabled: true } });
  const goop = new KinematicBody({ world: f.world, surfaces: f.surfaces, initialPosition: new THREE.Vector3(18, -0.52, 90) });
  const volt = new KinematicBody({ world: f.world, surfaces: f.surfaces, initialPosition: new THREE.Vector3(0, 1.26, 145) });
  const aimPoint = new THREE.Vector3();
  f.controller.lockReceiver.target.copySocketWorldPosition(aimPoint);
  const system = new VoltElectricalSystem({
    slimeManager: { activeSlimeId: 'volt', getBody: () => volt, canActiveUseAbility: () => true },
    collisionWorld: f.world, targetRegistry: f.registry,
    aimRayProvider: { copyAimRay(origin, direction) {
      origin.copy(volt.position); direction.subVectors(aimPoint, origin).normalize();
    } },
    config: { acquisitionRangeMetres: 100, instabilityWarningRangeMetres: 110, tetherBreakRangeMetres: 120 },
  });
  try {
    for (const drone of f.controller.drones) drone.setEnabled(false);
    for (let step = 0; step < 90; step += 1) {
      bob.update(DT, new THREE.Vector3(-1, 0, 0));
      f.controller.update(DT, { bob, goop, volt });
    }
    assert.equal(bob.attached, true);
    assert.equal(f.controller.bridgeDeployed, true);
    assert.ok(aimPoint.z > 155, 'the lock contact is on the door, not a bridge prop');

    // Approaching from the catwalk must still not skip the bridge puzzle.
    volt.teleport(new THREE.Vector3(-16, 2.96, 136));
    f.controller.update(DT, { bob, goop, volt });
    system.update(DT, { aimHeld: true, fireHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true });
    assert.equal(system.readModel.connectedTargetId, undefined);

    volt.teleport(new THREE.Vector3(0, 1.26, 145));
    f.controller.update(DT, { bob, goop, volt });
    system.update(DT, { aimHeld: true, fireHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true });
    assert.equal(system.readModel.connectedTargetId, 'transit-bridge-lock', 'real aiming must reach the door edge without a solid blocker');
    for (let step = 0; step < 90; step += 1) {
      system.update(DT, { aimHeld: true, fireHeld: true, firePressed: false, gameplayInputEnabled: true, pointerLocked: true });
      f.controller.update(DT, { bob, goop, volt });
    }
    assert.equal(f.controller.bridgeLocked, true);
    bob.teleport(new THREE.Vector3(10, 8.06, 142.5));
    f.controller.update(DT, { bob, goop, volt });
    assert.equal(f.controller.switchHeld, false);
    assert.equal(f.controller.bridgeDeployed, true, 'the lock still frees Bob to leave his switch');
  } finally { system.dispose(); f.dispose(); }
});

test('Goop can shoot and dissolve all three retained cover supports from the acid floor', () => {
  const f = fixture();
  const goop = { position: new THREE.Vector3(), radiusMetres: 0.45 };
  const aimPoint = new THREE.Vector3();
  const dissolve = new DissolveSystem(f.controller.dissolveTargets);
  const acid = new AcidProjectileSystem({
    slimeManager: { activeBody: goop, activeSlimeId: 'goop', canActiveUseAbility: () => true },
    collisionWorld: f.world, dissolveSystem: dissolve,
    aimRayProvider: { copyAimRay(origin, direction) {
      origin.copy(goop.position); direction.subVectors(aimPoint, origin).normalize();
    } },
  });
  try {
    for (const target of f.controller.dissolveTargets) {
      acid.reset();
      target.mesh.getWorldPosition(aimPoint);
      goop.position.set(aimPoint.x + 2, -0.545, aimPoint.z - 2);
      acid.update(DT, { aimHeld: true, firePressed: true, gameplayInputEnabled: true, pointerLocked: true });
      for (let i = 0; i < 150; i++) {
        acid.update(DT, { aimHeld: true, firePressed: false, gameplayInputEnabled: true, pointerLocked: true });
        dissolve.update(DT);
      }
      assert.equal(target.completed, true, `${target.id} must be reachable with real Goop projectiles from the basin`);
    }
  } finally { acid.dispose(); dissolve.dispose(); f.dispose(); }
});

test('Bob can charge from a safe lip and clear the first laser while reaching the next pad', () => {
  const f = fixture();
  try {
    const bob = new KinematicBody({world:f.world, surfaces:f.surfaces,
      initialPosition:new THREE.Vector3(10,4.66,119.9),
      config:{adhesionEnabled:true, reboundEnabled:false, chargedJumpEnabled:true}});
    const laser = f.controller.lasers[0]!;
    const goop=new KinematicBody({world:f.world,surfaces:f.surfaces,initialPosition:new THREE.Vector3(18,-.52,90)});
    const volt=new KinematicBody({world:f.world,surfaces:f.surfaces,initialPosition:new THREE.Vector3(-16,2.96,90)});
    for(const drone of f.controller.drones) drone.setEnabled(false);
    const check = () => {
      assert.equal(f.controller.update(DT,{bob,goop,volt}),undefined,'the timed jump must avoid the live moving laser');
      assert.equal(laser.intersects({position:bob.position,radiusMetres:bob.radiusMetres}), false,
        `laser must leave a reachable charged-jump takeoff and clearance: ${JSON.stringify(bob.position)}`);
    };
    for (let i=0;i<4;i++) { bob.update(DT,new THREE.Vector3()); check(); }
    for (let i=0;i<44;i++) {
      bob.update(DT,new THREE.Vector3(),{pressed:i===0,held:true,released:false}); check();
    }
    const landing = new THREE.Vector3(9.5,4.86,126);
    const direction = () => new THREE.Vector3(landing.x-bob.position.x,0,landing.z-bob.position.z).normalize();
    bob.update(DT,direction(),{pressed:false,held:false,released:true});
    for (let i=0;i<100;i++) {
      const distance = Math.hypot(landing.x-bob.position.x,landing.z-bob.position.z);
      bob.update(DT,distance>.5?direction():new THREE.Vector3()); check();
      if (bob.grounded) break;
    }
    assert.equal(bob.supportColliderName,'bob-route-cover-b-landing');
  } finally { f.dispose(); }
});
