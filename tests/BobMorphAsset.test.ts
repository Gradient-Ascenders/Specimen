import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateBobMorphAsset } from '../src/render/bob/BobMorphAsset.ts';
import { disposeBobGateOneAsset } from '../src/render/bob/BobGateOneAsset.ts';

test('authored Bob exports exactly seven body poses and matching seats plus four expressions', async () => {
  const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
  const root = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const asset = validateBobMorphAsset(root);
  const bodyNames = ['move-reach', 'move-gather', 'squash', 'flatten', 'launch', 'airborne', 'stress'];
  assert.deepEqual(Object.keys(asset.body.morphTargetDictionary!), bodyNames);
  for (const eye of asset.eyes) {
    assert.deepEqual(Object.keys(eye.morphTargetDictionary!), [...bodyNames, 'blink', 'effort', 'surprise', 'stress-expression']);
  }
  assert.deepEqual(asset.bounds.getSize(asset.bounds.min.clone()).toArray().map(n => Number(n.toFixed(5))), [1, 0.8, 0.9]);
  disposeBobGateOneAsset(root);
});

test('authored export report pins both generator sources and the runtime asset', async () => {
  const base = new URL('../assets/characters/bob/', import.meta.url);
  const report = JSON.parse(await readFile(new URL('bob-authored.validation.json', base), 'utf8'));
  for (const [field, name] of [
    ['generator_sha256', 'generate-bob-authored.py'],
    ['neutral_generator_sha256', 'generate-bob-gate-one.py'],
    ['glb_sha256', 'bob-authored.glb'],
  ]) {
    assert.equal(report[field!], createHash('sha256').update(await readFile(new URL(name!, base))).digest('hex'));
  }
});

test('authored validator rejects missing seats, extra poses and corrupt morph geometry', async () => {
  const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
  for (const defect of ['missing-seat', 'extra-pose', 'invalid-geometry', 'empty-expression']) {
    const root = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    const asset = validateBobMorphAsset(root);
    if (defect === 'missing-seat') delete asset.eyes[0].morphTargetDictionary!.squash;
    if (defect === 'extra-pose') asset.body.morphTargetDictionary!.corpse = 7;
    if (defect === 'invalid-geometry') asset.body.geometry.morphAttributes.position![0]!.setX(0, NaN);
    if (defect === 'empty-expression') asset.eyes[0].geometry.morphAttributes.position![7]!.array.fill(0);
    assert.throws(() => validateBobMorphAsset(root), /Bob morph contract/);
    disposeBobGateOneAsset(root);
  }
});
