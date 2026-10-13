import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import {maintenanceMaps} from './helpers/BlackoutMaintenanceMapData.ts';
import {BLACKOUT_MATERIAL_FAMILIES} from '../src/render/environment/blackout/BlackoutMaintenanceFinish.ts';
import {loadBlackoutMaintenanceMapData, readBlackoutMaintenanceMapData, BLACKOUT_MAP_HEADER_BYTES} from '../src/render/environment/blackout/BlackoutMaintenanceMapData.ts';
import {BlackoutMaintenanceMaterials} from '../src/render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import {generateBlackoutMaintenanceMaps} from '../scripts/lib/blackout-maintenance-generator.ts';

const originalHashes = JSON.parse(readFileSync(new URL('./fixtures/BlackoutMaintenanceMapHashes.json', import.meta.url), 'utf8'));
const compressed = readFileSync(new URL('../src/assets/blackout/maintenance-maps.bin', import.meta.url));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const url = new URL('https://specimen.invalid/group-folder/assets/maintenance-maps.bin');

test('every prebaked byte matches the unchanged offline wear generator', () => {
  for (const family of BLACKOUT_MATERIAL_FAMILIES) {
    const generated = generateBlackoutMaintenanceMaps(family);
    for (const [i, map] of maintenanceMaps.maps[family].entries()) {
      assert.equal(hash(map), hash(generated[i]!), `${family}/${i}`);
      assert.equal(hash(map), originalHashes[family][i], 'preserve commit 32554a1 map bytes');
    }
  }
});

test('all nine families and five detail finishes borrow data but own independent GPU resources', () => {
  const a = new BlackoutMaintenanceMaterials(maintenanceMaps), b = new BlackoutMaintenanceMaterials(maintenanceMaps);
  const counts = new Map<THREE.Texture | THREE.Material, number>();
  const watch = (item: THREE.Texture | THREE.Material) => { counts.set(item, 0); item.addEventListener('dispose', () => counts.set(item, counts.get(item)! + 1)); };
  for (const family of BLACKOUT_MATERIAL_FAMILIES) {
    const first = a.get(family), second = b.get(family);
    watch(first);
    for (const [i, map] of [first.map!, first.roughnessMap!, first.normalMap!].entries()) {
      watch(map);assert.notEqual(map, [second.map, second.roughnessMap, second.normalMap][i]);
      assert.equal((map as THREE.DataTexture).image.data, maintenanceMaps.maps[family][i]);
      assert.equal(map.flipY, false);
    }
  }
  for (const finish of ['circuitBoard','copper','rubber','droneTrim','steel'] as const) {
    const detail=a.detail(finish);watch(detail);
    const base=a.get(finish==='droneTrim'?'dronePaint':'machineryMetal');
    assert.equal(detail.normalMap,base.normalMap);assert.equal(detail.roughnessMap,base.roughnessMap);
    assert.equal(detail.map,finish==='droneTrim'?base.map:null);
  }
  assert.equal(a.diagnostics.materialCount,14);assert.equal(a.diagnostics.textureCount,27);
  a.dispose();a.dispose();for(const count of counts.values())assert.equal(count,1);
  assert.ok(b.get('wallPanel').map);b.dispose();
  assert.throws(()=>a.get('wallPanel'),/disposed/);
});

test('native async loader prepares nested-path data without allocating GPU resources', async () => {
  const original=globalThis.fetch;let received: unknown;
  globalThis.fetch=async(input)=>{received=input;return new Response(compressed);};
  try {
    const data=await loadBlackoutMaintenanceMapData(url);
    assert.equal(received,url);assert.equal(hash(data.maps.acidPlatform[0]),hash(maintenanceMaps.maps.acidPlatform[0]));
    assert.equal(data.maps.wallPanel[0].buffer,data.maps.dronePaint[2].buffer,'all views share one prepared buffer');
  } finally {globalThis.fetch=original;}
});

for (const mode of ['missing','network','gzip','header','size','truncated','trailing'] as const) test(`map loading rejects ${mode} data before scene construction`, async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{
    if(mode==='network')throw new TypeError('network unavailable');
    if(mode==='missing')return new Response(null,{status:404});
    if(mode==='gzip')return new Response(new Uint8Array([1,2,3]));
    const raw=gunzipSync(compressed);
    if(mode==='header')raw[0]=0;
    if(mode==='size')raw.writeUInt32LE(1,8);
    return new Response(gzipSync(mode==='truncated'?raw.subarray(0,BLACKOUT_MAP_HEADER_BYTES):mode==='trailing'?Buffer.concat([raw,Buffer.from([0])]):raw));
  };
  try {await assert.rejects(loadBlackoutMaintenanceMapData(url), (error: Error) => {
    assert.match(error.message,/Could not prepare Room 1/);
    if(mode==='missing')assert.match(error.message,/HTTP 404/);
    if(mode==='network')assert.match(error.message,/network unavailable/);
    assert.ok(error.cause instanceof Error);return true;
  });} finally {globalThis.fetch=original;}
});

test('aborted preparation rejects its result and malformed data never creates partial views', async () => {
  const original=globalThis.fetch,controller=new AbortController();
  globalThis.fetch=async()=>{controller.abort(new Error('transition cancelled'));return new Response(compressed);};
  try {await assert.rejects(loadBlackoutMaintenanceMapData(url,controller.signal),/transition cancelled/);} finally {globalThis.fetch=original;}
  assert.throws(()=>readBlackoutMaintenanceMapData(new ArrayBuffer(0)),/Truncated/);
});

for (const mode of ['unsupported','empty'] as const) test(`preparation diagnoses ${mode} responses without constructing textures`, async () => {
  const originalFetch=globalThis.fetch,originalStream=globalThis.DecompressionStream;
  let requested=false;globalThis.fetch=async()=>{requested=true;return new Response(null);};
  if(mode==='unsupported')globalThis.DecompressionStream=undefined as any;
  try {
    await assert.rejects(loadBlackoutMaintenanceMapData(url),mode==='unsupported'?/does not support native texture decompression/:/Empty Blackout map response/);
    assert.equal(requested,mode==='empty');
  } finally {globalThis.fetch=originalFetch;globalThis.DecompressionStream=originalStream;}
});
