import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import { CultivationBakedAssets, readCultivationBakedAssets, loadCultivationBakedAssets, type CultivationAssetSource } from '../src/render/environment/cultivation/CultivationBakedAssets.ts';
import { CultivationAssetGenerator } from '../scripts/lib/cultivation-asset-generator.ts';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { GelRendering } from '../src/render/slime/GelRendering.ts';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';
import * as THREE from 'three';

test('baked scene forwards the session gel policy to captive Volt and releases its registration', async () => {
  const rendering = new GelRendering({ transmissionResolutionScale: 1 });
  rendering.setMode('minimum');
  const scene = new LevelTwoPreviewScene(() => {}, cultivationAssets, rendering);
  try {
    await scene.roomFive.captiveVoltPresentation.prepare(loadVolt);
    const body = scene.roomFive.captiveVoltPresentation.root.getObjectByName('Volt-Body') as import('three').Mesh;
    const material = body.material as import('three').MeshPhysicalMaterial;
    assert.equal(rendering.materialCount, 1);
    assert.equal(material.transmission, 0, 'late captive preparation inherits the active session mode');
    rendering.setMode('physical');
    assert.equal(material.transmission, 0.55);
    assert.equal(scene.surfaceCleanup.repairedMeshes, cultivationAssets.manifest.repairs.length);
  } finally { scene.dispose(); }
  assert.equal(rendering.materialCount, 0);
});

test('every baked texture byte and sampler matches the retained offline generator', () => {
  const generator = new CultivationAssetGenerator();
  try {
    for (const key of Object.keys(cultivationAssets.manifest.textures)) {
      const expected = generator.textures(key), actual = cultivationAssets.textures(key);
      assert.deepEqual(Object.keys(actual), Object.keys(expected), key);
      for (const role of Object.keys(expected)) {
        const a = actual[role], b = expected[role];
        assert.deepEqual(a.image, b.image, `${key}/${role}`);
        assert.deepEqual(a.mipmaps,b.mipmaps,`${key}/${role}/mips`);
        for (const property of ['name', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'generateMipmaps', 'anisotropy'] as const) {
          assert.equal(a[property], b[property], `${key}/${role}/${property}`);
        }
        assert.deepEqual(a.repeat, b.repeat); assert.deepEqual(a.offset, b.offset);
        a.dispose(); b.dispose();
      }
    }
  } finally { generator.dispose(); }
});

test('presentation buffers compact normals/colours and indices while keeping positions and UVs exact',()=>{
  const generator=new CultivationAssetGenerator();
  const shape=new THREE.BoxGeometry(2,3,4);
  // The valid 1 -> -.625 float-word delta has a NaN bit pattern. Packing
  // must copy bytes, so float canonicalisation cannot destroy its payload.
  shape.getAttribute('position').setX(1,-.625);
  const colours=new Float32Array(shape.getAttribute('position').count*3).fill(.41234);
  shape.setAttribute('color',new THREE.BufferAttribute(colours,3));
  shape.setIndex(new THREE.BufferAttribute(new Uint32Array(shape.index!.array),1));
  const before={position:shape.getAttribute('position').array.slice(),uv:shape.getAttribute('uv').array.slice(),index:shape.index!.array.slice()};
  try{
    generator.geometry('cultivation-blender-test',()=>shape);
    generator.geometry('cultivation-blender-copy',()=>shape.clone());
    const fixedColours=shape.clone();fixedColours.setAttribute('color',new THREE.BufferAttribute(new Uint16Array(colours.length).fill(27023),3,true));
    generator.geometry('cultivation-blender-fixed-colour',()=>fixedColours);
    const bytes=gunzipSync(generator.bundle()),assets=readCultivationBakedAssets(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const actual=assets.geometry('cultivation-blender-test'),copy=assets.geometry('cultivation-blender-copy');
    assert.deepEqual(actual.getAttribute('position').array,before.position);assert.deepEqual(actual.getAttribute('uv').array,before.uv);
    assert.deepEqual([...actual.index!.array],[...before.index]);assert.ok(actual.index!.array instanceof Uint16Array);
    assert.ok(actual.getAttribute('normal').array instanceof Int16Array);assert.equal(actual.getAttribute('normal').normalized,true);
    assert.ok(actual.getAttribute('color').array instanceof Uint8Array);
    assert.ok(Math.abs(actual.getAttribute('color').getX(0)-.41234)<=.5/255);
    assert.equal(assets.manifest.geometries['cultivation-blender-test'].attributes.position.offset,assets.manifest.geometries['cultivation-blender-copy'].attributes.position.offset);
    const fixed=assets.geometry('cultivation-blender-fixed-colour');
    assert.ok(fixed.getAttribute('color').array instanceof Uint8Array);
    assert.ok(Math.abs(fixed.getAttribute('color').getX(0)-27023/65535)<=.5/255);fixed.dispose();fixedColours.dispose();
    actual.getAttribute('position').setX(0,99);assert.notEqual(copy.getAttribute('position').getX(0),99);
    actual.dispose();copy.dispose();
  }finally{shape.dispose();generator.dispose();}
});

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

test('finish preparation uses native blocks or replaces every binding with the original RGBA fallback',async()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),art=scene.blenderArt;
  const native={extensions:{has:()=>true}} as unknown as THREE.WebGLRenderer;
  const fallback={extensions:{has:()=>false}} as unknown as THREE.WebGLRenderer;
  let loads=0;
  const maps=Array.from({length:6},()=>({size:4,pixels:new Uint8Array(64)}));
  const loader=async()=>{loads++;return maps;};
  try{
    await art.prepare(native,loader);assert.equal(loads,0);assert.equal(art.diagnostics.compressedFinishes,true);
    await Promise.all([art.prepare(fallback,loader),art.prepare(fallback,loader)]);
    assert.equal(loads,1);assert.equal(art.diagnostics.compressedFinishes,false);
    const used=new Set<THREE.Texture>();
    scene.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.blenderBatch)for(const m of [o.material].flat())if(m instanceof THREE.MeshStandardMaterial)
      for(const texture of [m.map,m.normalMap,m.roughnessMap])if(texture?.name.startsWith('cultivation-shared-level-one-'))used.add(texture);});
    assert.equal(used.size,3);for(const texture of used)assert.ok(texture instanceof THREE.DataTexture);
    const disposed=new Map<THREE.Texture,number>();for(const texture of used)texture.addEventListener('dispose',()=>disposed.set(texture,(disposed.get(texture)??0)+1));
    scene.dispose();scene.dispose();for(const texture of used)assert.equal(disposed.get(texture),1);
  }finally{scene.dispose();}
});

test('unloading during fallback loading aborts it and never adopts late texture data',async()=>{
  const scene=new LevelTwoPreviewScene(()=>{},cultivationAssets),art=scene.blenderArt;
  const fallback={extensions:{has:()=>false}} as unknown as THREE.WebGLRenderer;
  let finish!:(maps:{size:number;pixels:Uint8Array}[])=>void,aborted=false;
  const preparing=art.prepare(fallback,signal=>new Promise(resolve=>{
    finish=resolve;signal.addEventListener('abort',()=>{aborted=true;});
  }));
  const bytes=art.diagnostics.textureBytes;scene.dispose();
  finish(Array.from({length:6},()=>({size:4,pixels:new Uint8Array(64)})));await preparing;
  assert.equal(aborted,true);assert.equal(art.diagnostics.compressedFinishes,true);assert.equal(art.diagnostics.textureBytes,bytes);
  await art.prepare(fallback,async()=>{throw Error('Disposed art must not restart loading.');});
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
    let a!:THREE.Mesh;
    first.root.traverse(object=>{if(!a&&object instanceof THREE.Mesh&&object.userData.blenderBatch)a=object;});
    const b = second.root.getObjectByName(a.name) as THREE.Mesh;
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
  assert.equal((await loadCultivationBakedAssets(url)).manifest.repairs.length, cultivationAssets.manifest.repairs.length);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  await assert.rejects(loadCultivationBakedAssets(url), /HTTP 404/);
});
