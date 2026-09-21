import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  BobCharacterPresentation,
} from '../src/render/bob/BobCharacterPresentation.ts';
import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import type { SlimeVisualState } from '../src/render/slime/SlimeVisual.ts';
import { ContainmentTeachingScene } from '../src/levels/ContainmentTeachingScene.ts';
import { DEFAULT_DEATH_BURST_DURATION_SECONDS } from '../src/systems/DeathSequence.ts';

const ASSET_URL = new URL(
  '../assets/characters/bob/bob-gate-one.glb',
  import.meta.url,
);

async function loadAsset(): Promise<THREE.Group> {
  const bytes = await readFile(ASSET_URL);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return (await new GLTFLoader().parseAsync(buffer, '')).scene;
}

function state(): SlimeVisualState {
  return {
    velocityWorld: new THREE.Vector3(1, 0, -2),
    surfaceNormalWorld: new THREE.Vector3(0, 1, 0),
    gameplayUpWorld: new THREE.Vector3(0, 1, 0),
    grounded: true,
    attached: false,
    jumpCharge: 0.4,
    maximumLocomotionSpeedMetresPerSecond: 5.5,
    contactCount: 1,
    contactNormalWorld: new THREE.Vector3(0, 1, 0),
    contactSpeedMetresPerSecond: 0,
    contactName: 'room-1-floor',
    contactSurfaceTag: 'default',
    landedThisStep: false,
  };
}

function getCharacter(root: THREE.Object3D): THREE.Group {
  const character = root.getObjectByName('player-slime-bob-character');
  assert.ok(character instanceof THREE.Group);
  return character;
}

test('neutral Bob presentation loads, follows authoritative transforms, fades, resets and disposes', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);
  const character = getCharacter(bob.root);

  assert.equal(bob.ready, true);
  assert.ok(character.getObjectByName('Bob-Body'));

  const source = state();
  const sourceSnapshot = JSON.stringify(source);
  bob.setPosition(new THREE.Vector3(2, 3, 4));
  bob.setYaw(Math.PI / 3);
  bob.setOpacity(0.35);
  bob.update(1 / 60, source);
  bob.present();

  assert.deepEqual(character.position.toArray(), [2, 3, 4]);
  assert.equal(character.rotation.y, Math.PI / 3);
  assert.equal(JSON.stringify(source), sourceSnapshot);
  character.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      assert.equal(material.opacity, 0.35);
      assert.equal(material.transparent, true);
    }
  });

  bob.setVisible(false);
  bob.reset();
  assert.equal(character.visible, true);
  assert.equal(bob.diagnostics.speed, 0);
  assert.equal(bob.diagnostics.jumpCharge, 0);
  character.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      assert.equal((object.material as THREE.Material).opacity, 1);
    }
  });

  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  const disposalCounts = new Map<
    THREE.BufferGeometry | THREE.Material,
    number
  >();
  bob.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) resources.add(material);
  });
  for (const resource of resources) {
    disposalCounts.set(resource, 0);
    resource.addEventListener('dispose', () => {
      disposalCounts.set(resource, disposalCounts.get(resource)! + 1);
    });
  }

  bob.dispose();
  bob.dispose();
  assert.equal(bob.ready, false);
  assert.equal(bob.root.children.length, 0);
  assert.ok([...disposalCounts.values()].every((count) => count === 1));
});

test('Bob presentation owns visibility, death hooks and combined diagnostics', async () => {
  const bob = new BobCharacterPresentation(0.45);
  await bob.prepare(loadAsset);

  bob.setVisible(false);
  assert.equal(bob.diagnostics.visible, false);
  bob.setVisible(true);

  const deathPosition = new THREE.Vector3(4, 2, -3);
  assert.equal(bob.startDeath(deathPosition), true);
  assert.equal(bob.diagnostics.deathBurst.active, true);
  assert.deepEqual(bob.diagnostics.deathBurst.origin.toArray(), [4, 2, -3]);
  assert.equal(bob.diagnostics.visible, true);

  bob.updateDeath(0.08);
  assert.equal(bob.diagnostics.visible, false);

  const recoveryPosition = new THREE.Vector3(-1, 0.45, 6);
  bob.finishDeath(recoveryPosition);
  assert.equal(bob.diagnostics.visible, true);
  assert.equal(bob.diagnostics.deathBurst.active, false);
  assert.deepEqual(bob.root.position.toArray(), [0, 0, 0]);
  assert.deepEqual(
    bob.root.getObjectByName('player-slime-bob-character')?.position.toArray(),
    [-1, 0.45, 6],
  );

  bob.dispose();
});

test('finished death ignores a late presentation update', () => {
  const bob = new BobCharacterPresentation(0.45);
  const deathPosition = new THREE.Vector3(4, 2, -3);
  const recoveryPosition = new THREE.Vector3(-1, 0.45, 6);

  assert.equal(bob.startDeath(deathPosition), true);
  bob.finishDeath(recoveryPosition);
  bob.updateDeath(0.08);

  assert.equal(bob.diagnostics.visible, true);
  assert.equal(bob.diagnostics.deathBurst.active, false);
  assert.deepEqual(getCharacter(bob.root).position.toArray(), [-1, 0.45, 6]);

  bob.dispose();
});

test('neutral reset ignores a late death presentation update', () => {
  const bob = new BobCharacterPresentation(0.45);

  assert.equal(bob.startDeath(new THREE.Vector3(4, 2, -3)), true);
  bob.reset();
  bob.updateDeath(0.08);

  assert.equal(bob.diagnostics.visible, true);
  assert.equal(bob.diagnostics.deathBurst.active, false);

  bob.dispose();
});

test('death cannot restart after the burst expires before recovery', () => {
  const bob = new BobCharacterPresentation(0.45);
  const deathPosition = new THREE.Vector3(4, 2, -3);

  assert.equal(bob.startDeath(deathPosition), true);
  bob.updateDeath(DEFAULT_DEATH_BURST_DURATION_SECONDS);
  assert.equal(bob.diagnostics.deathBurst.active, false);

  assert.equal(bob.startDeath(new THREE.Vector3(20, 10, 5)), false);
  assert.deepEqual(bob.diagnostics.deathBurst.origin.toArray(), [4, 2, -3]);
  assert.equal(bob.diagnostics.visible, false);

  bob.dispose();
});

test('Level 1 owns one shared Bob presentation without changing authoritative input', async () => {
  const art = new ContainmentArtResources();
  const scene = new ContainmentTeachingScene(art);
  await scene.bob.prepare(loadAsset);

  const bobOwners: THREE.Object3D[] = [];
  scene.root.traverse((object) => {
    if (object.name.startsWith('player-slime-')) bobOwners.push(object);
  });
  assert.equal(scene.bob.ready, true);
  assert.equal(scene.bob.root.parent, scene.root);
  assert.equal(
    bobOwners.filter((object) => object.name === 'player-slime-bob-character')
      .length,
    1,
  );
  assert.equal(
    bobOwners.some((object) =>
      object.name.startsWith('player-slime-visual-radius'),
    ),
    false,
  );

  const authoritativeState = state();
  const snapshot = JSON.stringify(authoritativeState);
  scene.bob.update(1 / 60, authoritativeState);
  scene.bob.present();
  assert.equal(JSON.stringify(authoritativeState), snapshot);

  scene.dispose();
  art.dispose();
});
