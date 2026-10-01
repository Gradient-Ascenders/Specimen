import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { Input } from '../src/core/Input.ts';
import { GreyboxLevelRuntime } from '../src/levels/GreyboxLevelRuntime.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { BobCharacterPresentation } from '../src/render/bob/BobCharacterPresentation.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';
import { SlimePairPresentation } from '../src/slimes/SlimePairPresentation.ts';
import { DeathSequence } from '../src/systems/DeathSequence.ts';

async function createFixture(activeSlimeId: 'bob' | 'goop' = 'goop') {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(async () => {
    const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
    return (await new GLTFLoader().parseAsync(bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer, '')).scene;
  });
  const pairPresentation = new SlimePairPresentation(0.45);
  const bobPosition = new THREE.Vector3(0, 0.45, 0);
  const goopPosition = new THREE.Vector3(2, 0.45, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 5);
  const collisionWorld = new CollisionWorld();
  const pair = {
    activeSlimeId,
    get activeBody() { return { position: this.activeSlimeId === 'goop' ? goopPosition : bobPosition }; },
  };
  const deathSequence = new DeathSequence();
  const resources = {
    body: { position: bobPosition },
    slimePair: pair,
    slimePairPresentation: pairPresentation,
    deathSequence,
    testScene: { bob, updateDeath() {}, roomFour: { resolveLiftCamera: () => undefined } },
    collisionWorld,
    acidProjectileSystem: { cancelAim() {} },
    goopAcidPresentation: { suspend() {}, resume() {} },
    deathScreen: { show() {}, hide() {} },
    containmentLevel: { state: 'playing' },
    pressurePlate: { trigger: { occupants: new Set() } },
    slimeManager: { getRosterState: () => [], get activeSlimeId() { return pair.activeSlimeId; } },
  };
  const runtime = new GreyboxLevelRuntime({
    host: { dataset: {} } as HTMLElement,
    input: { setEnabled() {}, releasePointerLock() {}, requestPointerLock() {}, endFixedUpdate() {} } as unknown as Input,
    renderLayer: { cameraRig: { setFollowTarget() {}, setContextualCamera() {} } } as unknown as RenderLayer,
    window: new EventTarget() as unknown as Window,
    debugAvailable: false,
  });
  const probe = runtime as unknown as {
    resources: typeof resources;
    requestPlayerDeath(recovery: () => void, resources: typeof resources): boolean;
    updateDeathState(deltaSeconds: number, resources: typeof resources): void;
    retryAfterDeath(): void;
  };
  probe.resources = resources;
  const scene = new THREE.Scene();
  scene.add(bob.root, pairPresentation.root);
  const goop = pairPresentation.root.getObjectByName('goop-development-body') as THREE.Mesh;
  bob.setPosition(bobPosition);
  const updatePair = () => pairPresentation.update(bobPosition, goopPosition, pair.activeSlimeId, camera, collisionWorld);
  updatePair();
  const characterCasters = () => {
    const names: string[] = [];
    scene.traverseVisible(object => {
      if (object instanceof THREE.Mesh && object.castShadow) names.push(object.name);
    });
    return names;
  };
  const dispose = () => { bob.dispose(); pairPresentation.dispose(); collisionWorld.clear(); };
  return { probe, resources, bob, goop, pair, deathSequence, characterCasters, updatePair, dispose };
}

test('Level 1 Goop death transfers casting immediately through anticipation, rupture and retry', async () => {
  const f = await createFixture();
  try {
    const positionsBefore = [f.resources.body.position.toArray(), f.pair.activeBody.position.toArray()];
    assert.equal(f.goop.visible, true);
    assert.equal(f.characterCasters().length, 4); // Live Bob's three meshes and Goop.
    let recoveryCalls = 0;
    assert.equal(f.probe.requestPlayerDeath(() => {
      recoveryCalls++;
      f.pair.activeSlimeId = 'bob'; // Recovery may restore a different controller.
    }, f.resources), true);

    // Check the accepted handoff before even one death update or render.
    assert.equal(f.goop.visible, false);
    assert.equal(f.bob.diagnostics.visible, true);
    assert.equal(f.characterCasters().length, 3);
    assert.deepEqual(f.bob.mesh.position.toArray(), positionsBefore[1]);
    assert.deepEqual([f.resources.body.position.toArray(), f.pair.activeBody.position.toArray()], positionsBefore);
    for (let step = 0; step < 3; step++) {
      f.probe.updateDeathState(0.02, f.resources);
      assert.equal(f.bob.diagnostics.visible, true); // Still inside the 75 ms anticipation.
      assert.equal(f.goop.visible, false);
      assert.equal(f.characterCasters().length, 3);
    }
    f.probe.updateDeathState(0.02, f.resources);
    assert.equal(f.bob.diagnostics.visible, false);
    assert.equal(f.goop.visible, false);
    assert.deepEqual(f.characterCasters(), []); // Rupture particles never cast.
    f.probe.updateDeathState(1.2, f.resources);
    f.probe.retryAfterDeath();
    assert.equal(recoveryCalls, 1);
    assert.equal(f.deathSequence.isPlaying, true);
    assert.equal(f.pair.activeSlimeId, 'bob');
    assert.deepEqual(f.bob.mesh.position.toArray(), positionsBefore[0]);
    f.updatePair(); // Normal rendering resumes after authoritative recovery.
    assert.equal(f.goop.visible, true);
    assert.equal(f.characterCasters().length, 4);
  } finally { f.dispose(); }
});

test('Level 1 rejected Goop death starts leave the original mesh visible', async () => {
  const f = await createFixture();
  try {
    f.deathSequence.requestDeath(() => {});
    assert.equal(f.probe.requestPlayerDeath(() => {}, f.resources), false);
    assert.equal(f.goop.visible, true);
    f.deathSequence.reset();
    f.bob.startDeath(f.resources.body.position); // The presentation refuses a second start.
    assert.equal(f.probe.requestPlayerDeath(() => {}, f.resources), false);
    assert.equal(f.deathSequence.isPlaying, true);
    assert.equal(f.goop.visible, true);
  } finally { f.dispose(); }
});

test('Level 1 Bob death keeps the independent Goop mesh visible', async () => {
  const f = await createFixture('bob');
  try {
    assert.equal(f.probe.requestPlayerDeath(() => {}, f.resources), true);
    assert.equal(f.goop.visible, true);
    f.probe.updateDeathState(0.08, f.resources);
    assert.equal(f.goop.visible, true);
    assert.deepEqual(f.characterCasters(), ['goop-development-body']);
  } finally { f.dispose(); }
});
