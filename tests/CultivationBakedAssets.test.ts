import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { CultivationBakedAssets, readCultivationBakedAssets, loadCultivationBakedAssets, type CultivationAssetSource } from '../src/render/environment/cultivation/CultivationBakedAssets.ts';
import { CultivationAssetGenerator } from '../scripts/lib/cultivation-asset-generator.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';

test('every baked texture byte and sampler matches the retained offline generator', () => {
  const generator = new CultivationAssetGenerator();
  try {
    for (const key of Object.keys(cultivationAssets.manifest.textures)) {
      const expected = generator.textures(key), actual = cultivationAssets.textures(key);
      assert.deepEqual(Object.keys(actual), Object.keys(expected), key);
      for (const role of Object.keys(expected)) {
        const a = actual[role], b = expected[role];
        assert.deepEqual(a.image, b.image, `${key}/${role}`);
        for (const property of ['name', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'generateMipmaps', 'anisotropy'] as const) {
          assert.equal(a[property], b[property], `${key}/${role}/${property}`);
        }
        assert.deepEqual(a.repeat, b.repeat); assert.deepEqual(a.offset, b.offset);
        a.dispose(); b.dispose();
      }
    }
  } finally { generator.dispose(); }
});

test('baked scene never invokes geometry generators and owns independent disposable resources', () => {
  const source: CultivationAssetSource = {
    textures: key => cultivationAssets.textures(key),
    geometry: (key, _generate) => cultivationAssets.geometry(key),
    geometries: (key, _generate) => cultivationAssets.geometries(key),
    bounds: (key, _generate) => cultivationAssets.bounds(key),
    repair: (scene, install) => cultivationAssets.repair(scene, install),
  };
  const first = new LevelTwoPreviewScene(() => {}, source);
  const second = new LevelTwoPreviewScene(() => {}, source);
  try {
    const a = first.root.getObjectByName('cover-props-shell-batch') as import('three').Mesh;
    const b = second.root.getObjectByName('cover-props-shell-batch') as import('three').Mesh;
    assert.notEqual(a.geometry, b.geometry);
    const ap = a.geometry.getAttribute('position'), bp = b.geometry.getAttribute('position');
    const before = bp.getX(0); ap.setX(0, before + 1);
    assert.equal(bp.getX(0), before);
    assert.notEqual(first.labArt.wall.map, second.labArt.wall.map);
    first.dispose(); first.dispose();
    assert.equal(bp.getX(0), before);
    assert.equal(second.surfaceCleanup.repairedMeshes, cultivationAssets.manifest.repairs.length);
  } finally { second.dispose(); }
});

test('bundle validation rejects truncation, versions, invalid ranges, and stale repair targets', async () => {
  const compressed = await readFile(new URL('../src/assets/cultivation/authored-assets.bin', import.meta.url));
  const raw = gunzipSync(compressed);
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  assert.throws(() => readCultivationBakedAssets(buffer.slice(0, 11)), /truncated/);
  const unsupported = buffer.slice(0); new Uint8Array(unsupported)[0] = 0;
  assert.throws(() => readCultivationBakedAssets(unsupported), /Unsupported/);
  assert.throws(() => readCultivationBakedAssets(buffer.slice(0, -1)), /truncated/);
  const manifest = structuredClone(cultivationAssets.manifest);
  const first = Object.values(Object.values(manifest.textures)[0])[0];
  Object.assign(first.pixels, { offset: -1 });
  assert.throws(() => new CultivationBakedAssets(manifest, new ArrayBuffer(0)), /Invalid/);
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets);
  scene.surfaceCleanup.dispose();
  const target = cultivationAssets.manifest.repairs[0];
  let object = scene.root;
  for (const index of target.path) object = object.children[index] as typeof object;
  object.name += '-stale';
  try { assert.throws(() => cultivationAssets.repair(scene, () => {}), /Stale/); }
  finally { scene.dispose(); }
});

test('async loader accepts a nested asset URL and reports HTTP failure', async t => {
  const bytes = await readFile(new URL('../src/assets/cultivation/authored-assets.bin', import.meta.url));
  const url = new URL('https://example.test/group-folder/assets/authored.bin');
  t.mock.method(globalThis, 'fetch', async (request: URL) => {
    assert.equal(request.href, url.href);
    return new Response(bytes);
  });
  assert.equal((await loadCultivationBakedAssets(url)).manifest.repairs.length, 137);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  await assert.rejects(loadCultivationBakedAssets(url), /HTTP 404/);
});
