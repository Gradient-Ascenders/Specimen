import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { CultivationBakedAssets, readCultivationBakedAssets, loadCultivationBakedAssets } from '../src/render/environment/cultivation/CultivationBakedAssets.ts';

test('BC7 validation rejects broken mip chains before creating textures',async()=>{
  const manifest=structuredClone(cultivationAssets.manifest),map=Object.values(manifest.textures['blender-finishes'])[0];
  Object.assign(map.bc7![1],{width:123});
  const bytes=gunzipSync(await readFile(new URL('../src/assets/cultivation/authored-assets.bin',import.meta.url)));
  const dataOffset=12+bytes.readUInt32LE(8);
  assert.throws(()=>new CultivationBakedAssets(manifest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),dataOffset),/BC7 mip/);
  const invalidDelta=structuredClone(cultivationAssets.manifest);
  Object.assign(Object.values(invalidDelta.geometries)[0].attributes.position,{delta:0});
  assert.throws(()=>new CultivationBakedAssets(invalidDelta,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),dataOffset),/Invalid/);
});

test('bundle validation rejects truncation, versions and invalid ranges', async () => {
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
});

test('async loader accepts a nested asset URL and reports HTTP failure', async t => {
  const bytes = await readFile(new URL('../src/assets/cultivation/authored-assets.bin', import.meta.url));
  const url = new URL('https://example.test/group-folder/assets/authored.bin');
  t.mock.method(globalThis, 'fetch', async (request: URL) => {
    assert.equal(request.href, url.href);
    return new Response(bytes);
  });
  assert.equal((await loadCultivationBakedAssets(url)).manifest.repairs.length, cultivationAssets.manifest.repairs.length);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  await assert.rejects(loadCultivationBakedAssets(url), /HTTP 404/);
});
