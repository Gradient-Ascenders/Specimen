/** Check the visual candidate without changing the shipped Bob contract. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';

const root = path.resolve(import.meta.dirname, '..');
const assetDir = path.join(root, 'assets/characters/bob');
const loader = new GLTFLoader();
const load = async (name) => {
  const bytes = await readFile(path.join(assetDir, name));
  const scene = (await loader.parseAsync(bytes.buffer.slice(
    bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
  ), '')).scene;
  return { bytes, scene };
};
const approved = await load('bob-curl-candidate.glb');
const candidate = await load('bob-locomotion-candidate.glb');
const report = JSON.parse(await readFile(path.join(assetDir,
  'bob-locomotion-candidate.validation.json'), 'utf8'));
assert.equal(report.glb_sha256, createHash('sha256').update(candidate.bytes).digest('hex'));
assert.equal(report.generator_sha256, createHash('sha256').update(await readFile(path.join(
  assetDir, 'generate-bob-locomotion-candidate.py'))).digest('hex'));
assert.equal(report.approved_neutral_glb_sha256,
  createHash('sha256').update(approved.bytes).digest('hex'));

for (const name of ['Bob-Body', 'Bob-Eye-Left', 'Bob-Eye-Right']) {
  const source = approved.scene.getObjectByName(name);
  const target = candidate.scene.getObjectByName(name);
  assert.ok(source instanceof THREE.Mesh && target instanceof THREE.Mesh);
  const original = source.geometry.getAttribute('position');
  const neutral = target.geometry.getAttribute('position');
  assert.equal(neutral.count, original.count, name);
  for (let index = 0; index < neutral.count; index += 1) {
    for (const coordinate of [0, 1, 2]) {
      assert.ok(Math.abs(neutral.getComponent(index, coordinate) -
        original.getComponent(index, coordinate)) < 1e-6,
      `${name}: neutral vertex ${index}, component ${coordinate}`);
    }
  }
  assert.deepEqual(Array.from(target.geometry.index.array),
    Array.from(source.geometry.index.array), `${name}: triangles`);
  assert.deepEqual(Object.keys(target.morphTargetDictionary), name === 'Bob-Body'
    ? report.body_targets : report.eye_targets);
  assert.ok(target.morphTargetInfluences.every((weight) => weight === 0),
    `${name}: neutral defaults`);
  for (const morph of target.geometry.morphAttributes.position) {
    assert.ok(Array.from(morph.array).every(Number.isFinite), `${name}: finite deltas`);
  }
}

const body = candidate.scene.getObjectByName('Bob-Body');
const positions = body.geometry.getAttribute('position');
const [forward, reverse] = body.geometry.morphAttributes.position;
const metrics = {};
for (const [name, morph] of [['forward', forward], ['reverse', reverse]]) {
  const sole = [];
  const shoulder = [];
  const sprout = [];
  for (let index = 0; index < positions.count; index += 1) {
    const height = positions.getY(index);
    if (height <= -0.43) {
      sole.push(Math.hypot(morph.getX(index), morph.getY(index), morph.getZ(index)));
    }
    if (height > 0.02 && height < 0.22) shoulder.push(morph.getZ(index));
    if (height > 0.45) sprout.push(morph.getZ(index));
  }
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const shoulderShift = average(shoulder);
  const sproutShift = average(sprout);
  assert.equal(Math.max(...sole), 0, `${name}: planted sole`);
  assert.ok(Math.abs(shoulderShift) > 0.12, `${name}: noticeable upper-mass lean`);
  assert.ok(Math.abs(sproutShift) < Math.abs(shoulderShift) - 0.05,
    `${name}: sprout lags upper mass`);
  assert.equal(Math.sign(shoulderShift), name === 'forward' ? -1 : 1);
  metrics[name] = { plantedSoleVertices: sole.length, shoulderShift,
    sproutShift, relativeSproutLag: Math.abs(shoulderShift) - Math.abs(sproutShift) };
}
console.log(JSON.stringify(metrics, null, 2));
