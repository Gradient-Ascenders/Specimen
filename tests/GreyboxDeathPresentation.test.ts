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
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';
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
  const goop = new GoopCharacterPresentation(); await goop.prepare(loadGoop);
  bob.setSpawnYaw(Math.PI); goop.setSpawnYaw(Math.PI);
  let recoveryCameraYaw: number | undefined;
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
    goopBody: { position: goopPosition },
    slimePair: pair,
    slimePairPresentation: pairPresentation,
    deathSequence,
    testScene: { bob, goop, updateDeath() {}, roomFour: { resolveLiftCamera: () => undefined } },
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
    renderLayer: { cameraRig: { setFollowTarget() {}, setContextualCamera() {},
      setGroundOrbitYawRadians(yaw: number) { recoveryCameraYaw = yaw; },
    } } as unknown as RenderLayer,
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
  scene.add(bob.root, goop.root, pairPresentation.root);
  goop.setPosition(goopPosition);
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
  const dispose = () => { bob.dispose(); goop.dispose(); pairPresentation.dispose(); collisionWorld.clear(); };
  return { probe, resources, bob, goop, pair, deathSequence, characterCasters, updatePair, dispose,
    get recoveryCameraYaw() { return recoveryCameraYaw; },
  };
}

test('Level 1 Goop death preserves Bob position and casting through rupture, locator updates and retry', async () => {
  const f = await createFixture();
  try {
    const bobPosition = f.resources.body.position.toArray();
    const goopPosition = f.resources.goopBody.position.toArray();
    assert.equal(f.characterCasters().length, 6);
    let recoveryCalls = 0;
    assert.equal(f.probe.requestPlayerDeath(() => { recoveryCalls++; f.pair.activeSlimeId = 'bob'; }, f.resources), true);
    assert.equal(f.goop.diagnostics.visible, true); // Existing 75 ms rupture timing.
    assert.deepEqual(f.bob.mesh.position.toArray(), bobPosition);
    for (let step = 0; step < 3; step++) {
      f.probe.updateDeathState(0.02, f.resources); f.updatePair();
      assert.equal(f.goop.diagnostics.visible, true);
      assert.equal(f.characterCasters().length, 6);
    }
    f.probe.updateDeathState(0.02, f.resources); f.updatePair();
    assert.equal(f.goop.diagnostics.visible, false);
    assert.equal(f.bob.diagnostics.visible, true);
    assert.deepEqual(f.characterCasters(), ['Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right']);
    assert.deepEqual(f.goop.diagnostics.deathBurst.origin.toArray(), goopPosition);
    f.probe.updateDeathState(1.2, f.resources); f.probe.retryAfterDeath(); f.updatePair();
    assert.equal(f.recoveryCameraYaw, Math.PI);
    assert.equal(f.bob.diagnostics.facingYawRadians, Math.PI);
    assert.equal(f.goop.diagnostics.facingYawRadians, Math.PI);
    assert.equal(recoveryCalls, 1); assert.equal(f.pair.activeSlimeId, 'bob');
    assert.equal(f.goop.diagnostics.visible, true); assert.equal(f.characterCasters().length, 6);
    assert.deepEqual(f.bob.mesh.position.toArray(), bobPosition);
  } finally { f.dispose(); }
});

test('Level 1 rejected Goop death leaves Bob and Goop presentation unchanged', async () => {
  const f = await createFixture();
  try {
    f.deathSequence.requestDeath(() => {});
    assert.equal(f.probe.requestPlayerDeath(() => {}, f.resources), false);
    assert.equal(f.goop.diagnostics.visible, true);
    f.deathSequence.reset(); f.goop.startDeath(f.resources.goopBody.position);
    assert.equal(f.probe.requestPlayerDeath(() => {}, f.resources), false);
    assert.equal(f.deathSequence.isPlaying, true); assert.equal(f.bob.diagnostics.visible, true);
  } finally { f.dispose(); }
});

test('Level 1 Bob death leaves the independent authored Goop and its shadow visible', async () => {
  const f = await createFixture('bob');
  try {
    assert.equal(f.probe.requestPlayerDeath(() => {}, f.resources), true);
    f.probe.updateDeathState(0.08, f.resources); f.updatePair();
    assert.equal(f.goop.diagnostics.visible, true);
    assert.deepEqual(f.characterCasters(), ['Goop-Body', 'Goop-Eye-Left', 'Goop-Eye-Right']);
  } finally { f.dispose(); }
});
