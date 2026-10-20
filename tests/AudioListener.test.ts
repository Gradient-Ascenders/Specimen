import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { AudioManager, type AudioPlayback } from '../src/audio/AudioManager.ts';
import { GameplayAudio } from '../src/audio/GameplayAudio.ts';
import type { AudioPosition } from '../src/audio/GameplayAudioEvents.ts';
import { EventBus } from '../src/core/EventBus.ts';
import type { KinematicBody } from '../src/physics/KinematicBody.ts';
import type { SlimeManager } from '../src/slimes/SlimeManager.ts';

class Parameter {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Parameter(); threshold = new Parameter(); ratio = new Parameter();
  connect() {} disconnect() {}
}
class Listener {
  positionX = new Parameter(); positionY = new Parameter(); positionZ = new Parameter();
  forwardX = new Parameter(); forwardY = new Parameter(); forwardZ = new Parameter();
  upX = new Parameter(); upY = new Parameter(); upZ = new Parameter();
  constructor() { this.forwardZ.value = -1; this.upY.value = 1; }
}
class Context {
  currentTime = 0; state = 'suspended'; destination = new Node(); listener = new Listener();
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  async suspend() { this.state = 'suspended'; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

test('modern Web Audio listener receives position, camera forward and camera up', async () => {
  const context = new Context(), audio = new AudioManager('./', () => context as unknown as AudioContext);
  try {
    await audio.preload([]);
    audio.setListener({ x: 4, y: 2, z: 6 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    const l = context.listener;
    assert.deepEqual([l.positionX.value, l.positionY.value, l.positionZ.value], [4, 2, 6]);
    assert.deepEqual([l.forwardX.value, l.forwardY.value, l.forwardZ.value], [1, 0, 0]);
    assert.deepEqual([l.upX.value, l.upY.value, l.upZ.value], [0, 0, 1]);
    audio.setListener({ x: 8, y: 2, z: 6 });
    assert.equal(l.positionX.value, 8);
    assert.deepEqual([l.forwardX.value, l.forwardY.value, l.forwardZ.value], [1, 0, 0], 'fixed-step position refresh cannot reset camera orientation');
  } finally { audio.dispose(); }
});

for (const partialModernApi of [false, true]) {
  test(`legacy listener orientation fallback supports missing or throwing modern properties (${partialModernApi})`, async () => {
    const context = new Context();
    const orientation: number[][] = [];
    const listener = context.listener as Listener & { setOrientation?: (...values: number[]) => void };
    for (const key of ['forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'] as const) {
      delete (listener as Partial<Listener>)[key];
    }
    if (partialModernApi) Object.defineProperty(listener, 'forwardX', { get: () => { throw new Error('partial API'); } });
    listener.setOrientation = (...values) => { orientation.push(values); };
    const audio = new AudioManager('./', () => context as unknown as AudioContext);
    try {
      await audio.preload([]);
      audio.setListener({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });
      assert.deepEqual(orientation, [[0, 0, 1, 0, 1, 0]]);
      listener.setOrientation = () => { throw new Error('unsupported'); };
      assert.doesNotThrow(() => audio.setListener({ x: 3, y: 2, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }));
      assert.equal(listener.positionX.value, 3, 'orientation failure cannot break ordinary positioning');
    } finally { audio.dispose(); }
  });
}

class Playback implements AudioPlayback {
  poses: { position: AudioPosition; forward?: AudioPosition; up?: AudioPosition }[] = [];
  play() {} startLoop() {} stopLoop() {} stopAll() {} setPaused() {}
  setListener(position: AudioPosition, forward?: AudioPosition, up?: AudioPosition) {
    this.poses.push({ position: { ...position }, forward: forward ? { ...forward } : undefined, up: up ? { ...up } : undefined });
  }
}

function fixture(camera?: THREE.Object3D) {
  const playback = new Playback();
  const body = { position: new THREE.Vector3(4, 2, 6), velocity: new THREE.Vector3(),
    groundNormal: new THREE.Vector3(0, 1, 0), locomotionPosition: new THREE.Vector3(),
    grounded: true, chargingJump: false, landedThisStep: false, events: new EventBus<any>() };
  const manager = { activeSlimeId: 'bob', activeBody: body,
    getBody: (id: string) => id === 'bob' ? body : undefined, events: new EventBus<any>() };
  let controlled: { position: THREE.Vector3 } | undefined = body;
  const director = new GameplayAudio(playback, manager as unknown as SlimeManager<KinematicBody>, [],
    () => controlled as KinematicBody | undefined, undefined, camera);
  return { playback, body, director, control: (next: typeof controlled) => { controlled = next; } };
}

function assertVector(actual: AudioPosition | undefined, expected: THREE.Vector3) {
  assert.ok(actual);
  assert.ok(new THREE.Vector3().copy(actual).distanceTo(expected) < 1e-10);
}

test('camera-only yaw, pitch, roll and parent rotation update stereo axes without moving the hearing origin', () => {
  const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera(); parent.add(camera);
  camera.position.set(100, 200, 300);
  const { director, playback, body } = fixture(camera);
  try {
    director.setEnabled(true); director.update();
    assertVector(playback.poses.at(-1)!.forward, new THREE.Vector3(0, 0, -1));
    camera.rotation.y = Math.PI;
    director.updateListener();
    assertVector(playback.poses.at(-1)!.forward, new THREE.Vector3(0, 0, 1));
    assertVector(playback.poses.at(-1)!.position, body.position);
    parent.rotation.set(.1, .6, .3); camera.rotation.set(.2, .4, .5);
    director.updateListener();
    const pose = playback.poses.at(-1)!;
    assertVector(pose.forward, camera.getWorldDirection(new THREE.Vector3()));
    assertVector(pose.up, new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())));
    assertVector(pose.position, body.position);
    const count = playback.poses.length;
    director.setEnabled(false); camera.rotation.y += .4; director.updateListener();
    assert.equal(playback.poses.length, count);
    director.setEnabled(true); director.died('bob'); director.updateListener();
    assert.equal(playback.poses.length, count);
    director.respawn(); director.updateListener(); assert.equal(playback.poses.length, count + 1);
  } finally { director.dispose(); }
});

test('merged control and slime switching keep the correct hearing position with the same camera-relative orientation', () => {
  const camera = new THREE.PerspectiveCamera(); camera.rotation.y = -Math.PI / 2;
  const { director, playback, control } = fixture(camera);
  try {
    director.setEnabled(true);
    control({ position: new THREE.Vector3(50, 2, 20) }); director.updateListener();
    assertVector(playback.poses.at(-1)!.position, new THREE.Vector3(50, 2, 20));
    assertVector(playback.poses.at(-1)!.forward, new THREE.Vector3(1, 0, 0));
    const count = playback.poses.length;
    control(undefined); director.updateListener(); assert.equal(playback.poses.length, count);
  } finally { director.dispose(); }
});

test('standalone audio fixtures remain usable without a camera', () => {
  const { director, playback, body } = fixture();
  try {
    director.setEnabled(true); director.updateListener();
    assertVector(playback.poses[0].position, body.position);
    assert.equal(playback.poses[0].forward, undefined); assert.equal(playback.poses[0].up, undefined);
  } finally { director.dispose(); }
});
