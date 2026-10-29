import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ProgramCompilation } from '../../../src/render/ProgramCompilation.ts';

test('compilation snapshots every submitted program and polls shared materials only once', async () => {
  let queries = 0, ready = false, secondReady = false;
  const a = {isReady: () => { queries++; return ready; }};
  const b = {isReady: () => secondReady};
  const c = {isReady: () => { throw Error('a later material selection must not replace the pending program'); }};
  const properties = {currentProgram: a};
  const materials = new Set(Array.from({length: 100}, () => new THREE.MeshBasicMaterial()));
  const renderer = {
    localClippingEnabled: false, clippingPlanes: [], info: {programs: [] as unknown[]},
    extensions: {has: () => true}, properties: {get: () => properties},
    compile: () => {renderer.info.programs.push(a, b);return materials;},
    compileAsync: async () => new THREE.Scene(),
  };
  const original = renderer.compileAsync;
  const compilation = new ProgramCompilation(renderer as unknown as THREE.WebGLRenderer);
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const pending = (renderer as unknown as THREE.WebGLRenderer).compileAsync(scene, camera);
    assert.equal(queries, 1);
    properties.currentProgram = c;
    ready = true;
    let completed = false;
    void pending.then(() => {completed = true;});
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(completed, false, 'an earlier geometry/face program must finish too');
    secondReady = true;
    assert.equal(await pending, scene);
    assert.equal(queries, 2);
  } finally {
    compilation.dispose();
    for (const material of materials) material.dispose();
  }
  assert.equal(renderer.compileAsync, original);
});
