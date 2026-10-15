import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { loadCharacterAsset } from '../src/render/slime/LoadCharacterAsset.ts';
import { validateGoopAsset, disposeGoopAsset } from '../src/render/goop/GoopAsset.ts';

const url = 'https://specimen.invalid/group-folder/assets/goop.glb';

test('native character downloads parse the real GLB into independently owned scenes', async t => {
  const bytes = await readFile(new URL('../assets/characters/goop/goop.glb', import.meta.url));
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  let calls = 0;
  globalThis.fetch = async request => {
    assert.equal(request, url); calls++;
    return new Response(bytes);
  };
  const a = await loadCharacterAsset(url), b = await loadCharacterAsset(url);
  const assetA = validateGoopAsset(a), assetB = validateGoopAsset(b);
  assert.equal(calls, 2); assert.notEqual(a, b);
  assert.notEqual(assetA.body.geometry, assetB.body.geometry);
  assert.notEqual(assetA.body.material, assetB.body.material);
  assetA.body.geometry.getAttribute('position').setX(0, 99);
  assert.notEqual(assetB.body.geometry.getAttribute('position').getX(0), 99);
  let disposed = false; assetB.body.geometry.addEventListener('dispose', () => { disposed = true; });
  disposeGoopAsset(a); assert.equal(disposed, false); disposeGoopAsset(b); assert.equal(disposed, true);
});

test('HTTP, network, incomplete-body and parse failures reject, then a fresh attempt can succeed', async t => {
  const fetch = globalThis.fetch; t.after(() => { globalThis.fetch = fetch; });
  globalThis.fetch = async () => new Response('missing', { status: 404, statusText: 'Not Found' });
  await assert.rejects(loadCharacterAsset(url), /HTTP 404/);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(loadCharacterAsset(url), /offline/);
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('incomplete body')); } }));
  await assert.rejects(loadCharacterAsset(url), /incomplete body/);
  globalThis.fetch = async () => new Response('invalid glb');
  await assert.rejects(loadCharacterAsset(url));
  const bytes = await readFile(new URL('../assets/characters/goop/goop.glb', import.meta.url));
  globalThis.fetch = async () => new Response(bytes);
  const root = await loadCharacterAsset(url); assert.ok(root instanceof THREE.Group); disposeGoopAsset(root);
});
