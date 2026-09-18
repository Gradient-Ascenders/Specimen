import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  BOB_GATE_ONE_BODY_NAME,
  BOB_GATE_ONE_EYE_NAMES,
  disposeBobGateOneAsset,
  validateBobGateOneAsset,
} from '../src/render/bob/BobGateOneAsset.ts';

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

function triangleCount(mesh: THREE.Mesh): number {
  const index = mesh.geometry.index;
  return index
    ? index.count / 3
    : mesh.geometry.getAttribute('position').count / 3;
}

function assertVectorClose(actual: THREE.Vector3, expected: THREE.Vector3): void {
  assert.ok(
    actual.distanceTo(expected) < 1e-5,
    `${actual.toArray().join(', ')} != ${expected.toArray().join(', ')}`,
  );
}

test('Gate 1 GLB exposes the approved neutral silhouette contract', async () => {
  const root = await loadAsset();
  const asset = validateBobGateOneAsset(root);

  assert.equal(asset.body.name, BOB_GATE_ONE_BODY_NAME);
  assert.deepEqual(
    asset.eyes.map((eye) => eye.name),
    [...BOB_GATE_ONE_EYE_NAMES],
  );
  assertVectorClose(
    asset.bounds.getSize(new THREE.Vector3()),
    new THREE.Vector3(1, 0.8, 0.9),
  );
  assertVectorClose(asset.bounds.min, new THREE.Vector3(-0.5, -0.45, -0.45));
  assertVectorClose(asset.bounds.max, new THREE.Vector3(0.5, 0.35, 0.45));

  const bodyTriangles = triangleCount(asset.body);
  const eyeTriangles = asset.eyes.reduce(
    (sum, eye) => sum + triangleCount(eye),
    0,
  );
  assert.ok(bodyTriangles >= 2_000 && bodyTriangles <= 3_500);
  assert.ok(eyeTriangles <= 600);
  assert.ok(bodyTriangles + eyeTriangles <= 4_100);

  assert.equal(root.getObjectByProperty('type', 'Bone'), undefined);
  assert.equal(root.animations.length, 0);
  for (const mesh of [asset.body, ...asset.eyes]) {
    assert.equal(mesh.morphTargetInfluences, undefined);
    assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
    assert.deepEqual(mesh.rotation.toArray().slice(0, 3), [0, 0, 0]);
    assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
  }

  disposeBobGateOneAsset(root);
});

test('Gate 1 validator rejects an exported root transform that changes the agreed axes', async () => {
  const root = await loadAsset();
  const assetRoot = root.getObjectByName('Bob-Gate-One');
  assert.ok(assetRoot);
  assetRoot.rotation.x = Math.PI / 2;

  assert.throws(
    () => validateBobGateOneAsset(root),
    /Bob Gate 1 asset contract: "Bob-Gate-One" must have an identity transform/,
  );
  disposeBobGateOneAsset(root);
});

test('Gate 1 validator rejects a transformed wrapper around the stable asset root', async () => {
  const root = await loadAsset();
  const assetRoot = root.getObjectByName('Bob-Gate-One');
  assert.ok(assetRoot);
  const wrapper = new THREE.Group();
  wrapper.scale.setScalar(2);
  root.add(wrapper);
  wrapper.add(assetRoot);

  assert.throws(
    () => validateBobGateOneAsset(root),
    /"Bob-Gate-One" must be a direct child of the loaded scene/,
  );
  disposeBobGateOneAsset(root);
});

test('Gate 1 validator rejects an injected bone', async () => {
  const root = await loadAsset();
  const assetRoot = root.getObjectByName('Bob-Gate-One');
  assert.ok(assetRoot);
  assetRoot.add(new THREE.Bone());

  assert.throws(
    () => validateBobGateOneAsset(root),
    /Bob Gate 1 asset contract: bones are not permitted/,
  );
  disposeBobGateOneAsset(root);
});

test('Gate 1 validator rejects renamed neutral material slots', async () => {
  const root = await loadAsset();
  const eye = root.getObjectByName('Bob-Eye-Left');
  assert.ok(eye instanceof THREE.Mesh);
  (eye.material as THREE.Material).name = 'unexpected-eye-material';

  assert.throws(
    () => validateBobGateOneAsset(root),
    /Bob Gate 1 asset contract: "Bob-Eye-Left" uses material "unexpected-eye-material"/,
  );
  disposeBobGateOneAsset(root);
});

test('Gate 1 validator rejects a body topology that is no longer watertight', async () => {
  const root = await loadAsset();
  const body = root.getObjectByName('Bob-Body');
  assert.ok(body instanceof THREE.Mesh);
  const index = body.geometry.index;
  assert.ok(index);
  index.setX(0, index.getX(1));

  assert.throws(
    () => validateBobGateOneAsset(root),
    /Bob Gate 1 asset contract: body topology is not one watertight component/,
  );
  disposeBobGateOneAsset(root);
});

test('Gate 1 validator rejects meshes moved outside the stable Bob root', async () => {
  const root = await loadAsset();
  const eye = root.getObjectByName('Bob-Eye-Right');
  assert.ok(eye);
  root.attach(eye);

  assert.throws(
    () => validateBobGateOneAsset(root),
    /Bob Gate 1 asset contract: "Bob-Eye-Right" must be a direct child of "Bob-Gate-One"/,
  );
  disposeBobGateOneAsset(root);
});
