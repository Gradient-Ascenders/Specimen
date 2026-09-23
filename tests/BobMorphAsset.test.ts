import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { validateBobMorphAsset } from '../src/render/bob/BobMorphAsset.ts';
import { disposeBobGateOneAsset } from '../src/render/bob/BobGateOneAsset.ts';

test('authored Bob exports exactly seven body poses and matching seats plus four expressions', async () => {
  const bytes = await readFile(new URL('../assets/characters/bob/bob-authored.glb', import.meta.url));
  const root = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const asset = validateBobMorphAsset(root);
  const bodyNames = ['move-forward', 'move-reverse', 'squash', 'flatten', 'launch', 'airborne', 'stress'];
  assert.deepEqual(Object.keys(asset.body.morphTargetDictionary!), bodyNames);
  for (const eye of asset.eyes) {
    assert.deepEqual(Object.keys(eye.morphTargetDictionary!), [...bodyNames, 'blink', 'effort', 'surprise', 'stress-expression']);
  }
  assert.deepEqual(asset.bounds.getSize(asset.bounds.min.clone()).toArray().map(n => Number(n.toFixed(5))), [1, 0.97589, 0.86]);
  disposeBobGateOneAsset(root);
});

test('authored export report pins both generator sources and the runtime asset', async () => {
  const base = new URL('../assets/characters/bob/', import.meta.url);
  const report = JSON.parse(await readFile(new URL('bob-authored.validation.json', base), 'utf8'));
  for (const [field, name] of [
    ['generator_sha256', 'generate-bob-authored.py'],
    ['locomotion_generator_sha256', 'generate-bob-locomotion-candidate.py'],
    ['curl_generator_sha256', 'generate-bob-curl-candidate.py'],
    ['approved_neutral_glb_sha256', 'bob-curl-candidate.glb'],
    ['glb_sha256', 'bob-authored.glb'],
  ]) {
    assert.equal(report[field!], createHash('sha256').update(await readFile(new URL(name!, base))).digest('hex'));
  }
});

test('authored neutral preserves every approved curl vertex and triangle', async () => {
  const base = new URL('../assets/characters/bob/', import.meta.url);
  const loader = new GLTFLoader();
  const readScene = async (name: string) => {
    const bytes = await readFile(new URL(name, base));
    return (await loader.parseAsync(bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
    ), '')).scene;
  };
  const approved = await readScene('bob-curl-candidate.glb');
  const authored = await readScene('bob-authored.glb');
  for (const name of ['Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right']) {
    const source = approved.getObjectByName(name);
    const result = authored.getObjectByName(name);
    assert.ok(source instanceof THREE.Mesh && result instanceof THREE.Mesh);
    const sourcePositions = source.geometry.getAttribute('position');
    const resultPositions = result.geometry.getAttribute('position');
    assert.equal(resultPositions.count, sourcePositions.count, name);
    for (let vertex = 0; vertex < sourcePositions.count; vertex++) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const getter = axis === 'x' ? 'getX' : axis === 'y' ? 'getY' : 'getZ';
        assert.ok(Math.abs(resultPositions[getter](vertex) -
          sourcePositions[getter](vertex)) < 1e-6, `${name} ${vertex} ${axis}`);
      }
    }
    assert.deepEqual(Array.from(result.geometry.index!.array),
      Array.from(source.geometry.index!.array), `${name} triangles`);
  }
  approved.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
  disposeBobGateOneAsset(authored);
});

test('production directional poses match the accepted locomotion candidate', async () => {
  const base = new URL('../assets/characters/bob/', import.meta.url);
  const loader = new GLTFLoader();
  const load = async (name: string) => {
    const bytes = await readFile(new URL(name, base));
    return (await loader.parseAsync(bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
    ), '')).scene;
  };
  const candidate = await load('bob-locomotion-candidate.glb');
  const production = await load('bob-authored.glb');
  for (const meshName of ['Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right']) {
    const source = candidate.getObjectByName(meshName);
    const result = production.getObjectByName(meshName);
    assert.ok(source instanceof THREE.Mesh && result instanceof THREE.Mesh);
    for (const pose of ['move-forward', 'move-reverse']) {
      const sourceMorph = source.geometry.morphAttributes.position![
        source.morphTargetDictionary![pose]!
      ]!;
      const resultMorph = result.geometry.morphAttributes.position![
        result.morphTargetDictionary![pose]!
      ]!;
      assert.deepEqual(Array.from(resultMorph.array), Array.from(sourceMorph.array),
        `${meshName} ${pose}`);
    }
  }
  disposeBobGateOneAsset(candidate);
  disposeBobGateOneAsset(production);
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
