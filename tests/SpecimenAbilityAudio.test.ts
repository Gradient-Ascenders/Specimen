import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpecimenAbilityAudio } from '../src/audio/SpecimenAbilityAudio.ts';
import type { AudioPlayback } from '../src/audio/AudioManager.ts';
import { SpecimenDash } from '../src/combat/SpecimenDash.ts';
import { SpecimenProjectileSystem } from '../src/combat/SpecimenProjectileSystem.ts';
import { CombatTargetRegistry } from '../src/combat/CombatTargetRegistry.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../src/physics/SurfaceRegistry.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';

test('charge audio rises without extra voices and release, pause, landing and disposal clear their ownership', () => {
  const world = new CollisionWorld(), targets = new CombatTargetRegistry(world);
  const body = new KinematicBody({ world, surfaces: new SurfaceRegistry(), initialPosition: new THREE.Vector3() });
  const weapon = new SpecimenProjectileSystem({ collisionWorld: world, targetRegistry: targets, body,
    config: { allowHipFire: true, fullChargeSeconds: 0.5 },
    aimRayProvider: { copyAimRay: (o, d) => { o.copy(body.position); d.set(1, 0, 0); } } });
  const loops = new Map<string, number>(), sounds: string[] = [];
  const audio: AudioPlayback = { play: sound => { sounds.push(sound); }, startLoop: (key, _sound, _pos, _volume, rate) => { loops.set(key, rate ?? 1); },
    stopLoop: key => { loops.delete(key); }, stopAll() {}, setPaused() {}, setListener() {} };
  const dash = new SpecimenDash(), feedback = new SpecimenAbilityAudio(audio, body, weapon, dash);
  const controls = { active: true, aimHeld: false, fireHeld: true, firePressed: true, fireReleased: false,
    gameplayInputEnabled: true, pointerLocked: true };
  try {
    feedback.setEnabled(true); weapon.update(0.1, controls); feedback.update();
    const firstPitch = loops.get('specimen-charge')!; assert.ok(firstPitch > 0.7);
    controls.firePressed = false; weapon.update(0.3, controls); feedback.update();
    assert.equal(loops.size, 1); assert.ok(loops.get('specimen-charge')! > firstPitch);
    controls.fireHeld = false; controls.fireReleased = true; weapon.update(1 / 60, controls);
    assert.equal(loops.size, 0); assert.equal(sounds.filter(sound => sound === 'volt-shoot-01').length, 1);
    body.events.emit('jumped', { chargeFraction: 1, speedMetresPerSecond: 20, directionWorld: { x: 0, y: 1, z: 0 } });
    body.events.emit('landed', { impactSpeedMetresPerSecond: 19 }); body.events.emit('landed', { impactSpeedMetresPerSecond: 19 });
    assert.equal(sounds.filter(sound => sound === 'world-platform-land-01').length, 1, 'one charged flight gets one heavy accent');
    controls.firePressed = controls.fireHeld = true; controls.fireReleased = false;
    weapon.update(0.2, controls); feedback.update(); assert.equal(loops.size, 1);
    feedback.setEnabled(false); assert.equal(loops.size, 0);
    const count = sounds.length; feedback.dispose();
    weapon.cancelInput(); controls.fireReleased = true; weapon.update(0.3, controls);
    assert.equal(sounds.length, count, 'disposed feedback cannot react to later shots');
  } finally { feedback.dispose(); weapon.dispose(); targets.dispose(); world.clear(); }
});
