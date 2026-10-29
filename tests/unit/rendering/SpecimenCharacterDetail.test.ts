import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {parseSpecimenAsset,validateSpecimenAsset,disposeSpecimenAsset} from '../../../src/render/specimen/SpecimenAsset.ts';
import {CharacterDetail,readCharacterDetail} from '../../../src/render/slime/CharacterDetail.ts';
import {SpecimenCharacterPresentation} from '../../../src/render/specimen/SpecimenCharacterPresentation.ts';
import {loadSpecimen} from '../../fixtures/SpecimenAssetFixture.ts';

test('optional Specimen detail failure and disposal during loading safely retain or release the model',async()=>{
  const character=new SpecimenCharacterPresentation();
  await character.prepare(loadSpecimen,async()=>{throw Error('optional detail unavailable');});
  assert.equal(character.ready,true);assert.equal(character.detailDiagnostics,undefined);character.dispose();
  const root=await loadSpecimen(),meshes:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  let released=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>released++);
  let finish!:(value:never[])=>void;
  const disposed=new SpecimenCharacterPresentation();
  const ready=disposed.prepare(async()=>root,()=>new Promise(resolve=>{finish=resolve;}));
  await Promise.resolve();disposed.dispose();finish([]);await ready;
  assert.equal(disposed.ready,false);assert.equal(released,6);assert.equal(root.children.length,0);
});

test('Specimen detail preserves morph streams and switches without replacement buffers',async()=>{
  const bytes=gunzipSync(await readFile(new URL('../../../src/assets/delivery/specimen.bin',import.meta.url)));
  const asset=validateSpecimenAsset(await parseSpecimenAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
  const lod=await readFile(new URL('../../../src/assets/characters/specimen-lod.bin',import.meta.url));
  const positions=asset.meshes.map(m=>m.geometry.attributes.position),morphs=asset.meshes.map(m=>m.geometry.morphAttributes);
  const detail=new CharacterDetail(asset.root,asset.meshes,readCharacterDetail(lod.buffer.slice(lod.byteOffset,lod.byteOffset+lod.byteLength)));
  const indices=asset.meshes.map(m=>m.geometry.index),camera=new THREE.PerspectiveCamera(60,16/9,.1,1000);
  camera.position.z=100;camera.updateMatrixWorld();detail.update(camera);assert.equal(detail.diagnostics.level,'distant');assert.ok(detail.diagnostics.triangles<21000);
  camera.position.z=1;camera.updateMatrixWorld();detail.update(camera);assert.equal(detail.diagnostics.level,'full');assert.equal(detail.diagnostics.triangles,81040);
  asset.meshes.forEach((m,i)=>{assert.equal(m.geometry.index,indices[i]);assert.equal(m.geometry.attributes.position,positions[i]);assert.equal(m.geometry.morphAttributes,morphs[i]);});
  detail.dispose();disposeSpecimenAsset(asset.root);
});
