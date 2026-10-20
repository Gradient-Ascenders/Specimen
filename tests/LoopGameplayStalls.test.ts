import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Loop } from '../src/core/Loop.ts';
import { Input } from '../src/core/Input.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { MovementEvents } from '../src/physics/MovementEvents.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { DroneProjectileSystem } from '../src/hazards/DroneProjectileSystem.ts';
import { LaserHazard } from '../src/hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../src/hazards/LaserHazardSystem.ts';
import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';
import { DeathSequence } from '../src/systems/DeathSequence.ts';
import { CultivationRoomFiveController } from '../src/levels/CultivationRoomFiveController.ts';

// Compare real components after equal admitted simulation, not equal wall time.
function journey(stallMs: number) {
  const hostDocument = Object.assign(new EventTarget(), {
    hidden: false, hasFocus: () => true, pointerLockElement: null,
    exitPointerLock: () => {},
  });
  const hostWindow = Object.assign(new EventTarget(), {performance});
  const input = new Input({document: hostDocument as unknown as Document,
    window: hostWindow as unknown as Window,
    pointerLockElement: Object.assign(new EventTarget(), {requestPointerLock: () => {}}) as unknown as HTMLElement});
  const key = (type: string, code: string) => {
    const event = new Event(type, {cancelable: true});
    Object.defineProperties(event, {code: {value: code}, repeat: {value: false}});
    hostWindow.dispatchEvent(event);
  };
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(100,1,100));
  floor.position.y = -.5; floor.updateWorldMatrix(true,false);
  world.register(floor); surfaces.register(floor);
  const events = new EventBus<MovementEvents>();
  const body = new KinematicBody({world, surfaces, events,
    initialPosition: new THREE.Vector3(0,.46,0)});
  let jumps = 0, recoveries = 0;
  events.on('jumped', () => jumps++);
  const death = new DeathSequence();
  const laser = new LaserHazard({id:'stall-laser', start: new THREE.Vector3(0,3,0),
    end: new THREE.Vector3(4,3,0), timeline: {axisWorld: new THREE.Vector3(0,1,0), repeat:true,
      steps:[{kind:'hold', durationSeconds:1, enabled:true, angleRadians:0}]}});
  const hazards = new LaserHazardSystem({id:'stall-hazards', hazards:[laser],
    requestRecovery: () => { death.requestDeath(() => recoveries++); }});
  const damage = new SlimeDamageSystem();
  const projectiles = new DroneProjectileSystem(world, damage, {
    speedMetresPerSecond:10, lifetimeSeconds:2, maximumRangeMetres:50,
  });
  const owner = new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  projectiles.spawn('stall-drone', owner, new THREE.Vector3(0,5,0), new THREE.Vector3(1,0,0));
  const release = new CultivationRoomFiveController();
  release.reset('controls'); release.security.release();
  const movement = new THREE.Vector3();
  let updates = 0, pressEdges = 0;
  const loop = new Loop({document: hostDocument as unknown as Document, window:hostWindow as unknown as Window,
    render: () => {}, fixedUpdate: dt => {
      updates++;
      if (input.wasPressed('jump')) pressEdges++;
      movement.set(input.isDown('moveForward') ? 1 : 0,0,0);
      body.update(dt, movement, {pressed:input.wasPressed('jump'), held:input.isDown('jump'),
        released:input.wasReleased('jump'), cancelled:input.wasClearedSinceFixedUpdate});
      hazards.update(dt, {id:'goop', position:new THREE.Vector3(2,3,0), radiusMetres:.45});
      death.update(dt);
      projectiles.update(dt, []);
      release.update(dt,false,false,false,false);
      input.endFixedUpdate();
    }});
  try {
    loop.tick(0);
    key('keydown','Space'); key('keydown','KeyW');
    let now = 0;
    if (stallMs) { now = stallMs; loop.tick(now); }
    else for (let i=1;i<=6;i++) { now=i*1000/60; loop.tick(now); }
    assert.equal(updates,6);
    assert.ok(Math.abs(body.chargeSeconds - .1) < 1e-8);
    assert.ok(Math.abs(projectiles.states[0]!.position.x - 1) < 1e-8);
    assert.ok(Math.abs(laser.sequenceElapsedSeconds - .1) < 1e-8);
    assert.ok(Math.abs(release.releaseElapsed - .1) < 1e-8);
    assert.equal(death.state,'bursting');
    key('keyup','Space');
    for (let i=1;i<=75;i++) loop.tick(now+i*1000/60);
    assert.equal(jumps,1);
    assert.equal(pressEdges,1,'a press is consumed once across catch-up steps');
    assert.equal(hazards.recoveryRequestCount,1);
    assert.equal(death.state,'gameOver');
    assert.equal(death.completeRetry(),true);
    assert.equal(recoveries,1);
    return {position:body.position.toArray(), velocity:body.velocity.toArray(), jumps,
      projectile:projectiles.states[0]!.position.x, release:release.releaseElapsed,
      laser:laser.sequenceElapsedSeconds, updates};
  } finally {
    loop.dispose(); input.dispose(); projectiles.dispose(); damage.dispose(); hazards.dispose();
    floor.geometry.dispose(); owner.geometry.dispose(); events.clear();
  }
}

test('movement, input edges, charge/release, hazards, projectiles, recovery and release clock survive stalls', () => {
  const reference = journey(0);
  for (const stallMs of [100,500,1000]) assert.deepEqual(journey(stallMs), reference);
});
